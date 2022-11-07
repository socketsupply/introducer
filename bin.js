#! /usr/bin/env node
const crypto = require('crypto')
const debug = process.env.DEBUG ? function (...args) { console.log(...args) } : function () {}
const fs = require('fs')
const os = require('os')
const dgram = require('dgram')
const path = require('path')
const { EventEmitter } = require('events')
const Swarms = require('./swarms')
const Introducer = require('./introducer')
const Config = require('./lib/config')(fs)
const Wrap = require('./wrap')(dgram, os, Buffer)
const util = require('./util')
const http = require('http')
const version = require('./package.json').version
const constants = require('./lib/constants')()
const Reliable = require('./swarm/reliable')
const Logger = require('./lib/logger')

function createId (seed) {
  if (seed) return crypto.createHash('sha256').update(seed).digest('hex')
  return crypto.randomBytes(32).toString('hex')
}

function main (argv) {
  const config = Config({ filename: path.join(process.env.HOME, '.introducer-chat'), createId })
  const cmd = argv[0]
  //  const swarm = createId('test swarm')
  const swarm = '594085b1d40f8bf3e73fca7a5e72602fa15aca64f7685ecf914d75b21449d930'

  if(cmd === 'version')
    return console.log(version)

  if (cmd === 'introducer') {
    const intro = new Introducer(config)
    Wrap(intro, [config.port])
    http.createServer(function (req, res) {
      res.end(JSON.stringify({
        restart: new Date(intro.restart).toString(),
        last_crash: (Date.now() - intro.restart)/1000,
        version,
        peers: intro.peers,
        swarms: intro.swarms,
        connections: intro.connections
      }, null, 2))
    }).listen(8080)
    process.on('uncaughtException', (err) => {
      console.log(err.stack)
      fs.appendFileSync('./introducer-crash.log',
        new Date().toISOString() + '\n' +
        err.stack+'\n' +
        JSON.stringify({
          peers: intro.peers,
          swarms: intro.swarms
        }, null, 2) + '\n\n',
        {flag: 'a'})
      process.exit(1)
    })
    return
  }

  if (cmd === 'longevity') {
    const Longevity = require('./scripts/longevity')
    const long = new Longevity()
    console.log('# how long does the nat keep a port mapping open?')
    console.log('actual, requested, port')
    Wrap(long, [1234])
    return
  }

  //this setup is shared by nat command, and running the chat protocol also

  const peer = new Swarms({ ...config, keepalive: constants.keepalive })
  const chat_swarm = peer.createModel(swarm, new Reliable())
  chat_swarm.on_change = (msg) => {
    console.log(msg.id.substring(0, 8), peerType(peer.peers[msg.id]), msg.ts, msg.content)
  }
  function peerType (peer) {
    return peer ? (/192\.168\.\d+\.\d+/.test(peer.address) ? 'local' : peer.nat) || '???' : '!!!'
  }

  // logs. machine readable logs track connection attempts and successes.

  peer.log = Logger(path.join(process.env.HOME, '.introducer.log'))
  peer.log('start', {}, Date.now())
  process.on('exit', function () {
    peer.log.sync('exit', {}, Date.now())
  })
  process.on('SIGINT', function () {
    process.exit(1)
  })


  var on_peer = peer.on_peer
  peer.on_peer = function (other, ts) {
    console.log('connected', other.id.substring(0, 8), peerType(other), other.address + ':' + other.port)
    if(on_peer) on_peer.call(this, other, ts)
  }

  // detect the nat type and exit
  if (cmd === 'nat') {
    setTimeout(() => {
      console.log('failed to detect nat, offline?')
      process.exit(1)
    }, 3_000)
    peer.on_nat = (nat) => {
      console.log(nat, peer.publicAddress+':'+peer.publicPort)
      if (Object.keys(peer.peers).length < 2) {
        console.error('found only ' + Object.keys(peer.peers).length + ' peers')
        process.exit(1)
      }
      process.exit(0)
    }
  }

  else if (cmd) {
    console.log('unknown command:'+cmd)
    process.exit(1)
  }

  var _on_nat = peer.on_nat
  peer.on_nat = (nat) => {
    _on_nat.call(peer, nat)
    console.log("nat:", nat, peer.publicAddress+':'+peer.publicPort)
  }

  Wrap(peer, [config.port, config.spinPort])

  console.log('id:', config.id, 'introducer@'+version)
  process.stdin.on('data', function (data) {
    data = data.toString()
    const m = /^\s*\/(\w+)/.exec(data)
    if (m) {
      const cmd = m[1]
      if (cmd === 'peers') {
        console.log(peer.peers)
      }
      else if (cmd === 'ip') {
        console.log(peer.publicAddress + ':' + peer.publicPort)
      }
      else if (cmd === 'join') {
        peer.join(swarm)
      } else if(cmd === 'dropped') {

        for(var k in peer.peers) {
          var other = peer.peers[k]
          if(!other.introducer) break;
        }
        console.log('drop packet test to:',other.address+':'+other.port)

        var data = require('./scripts/dropped')(
          peer, other, 1024, 5
        )
        setInterval(function () {
          console.log(data)
        }, 1000)
      } else {
        console.log('unknown command:' + cmd)
      }
      
      return
    }
    chat_swarm.update(data.toString(), Date.now())
  })
}

if (!module.parent) { main(process.argv.slice(2)) }
