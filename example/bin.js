#! /usr/bin/env node
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const dgram = require('dgram')
const path = require('path')
const { EventEmitter } = require('events')
const Demo = require('./chat')
const Introducer = require('../introducer')
const Config = require('../lib/config')(crypto, fs, path)
const Wrap = require('../wrap')(dgram, os, Buffer)
const util = require('../util')
const http = require('http')

function main (argv) {
  const config = Config({ appname: 'introducer-chat' })
  const cmd = argv[0]
  const swarm = util.createId(crypto, 'test swarm')
  /* multicast
    to find other peers on the local network,
    we need a parallel multicast system.
    it appears that a socket cannot be used for both
  */

  if (cmd === 'introducer') {
    var intro = new Introducer(config)
    Wrap(intro, [config.port])
    console.log(config.id)
    http.createServer(function (req, res) {
      res.end(JSON.stringify({peers: intro.peers, swarms:intro.swarms}, null, 2))
    }).listen(8080)
    return
  }

  const peer = new Demo({ swarm, ...config, keepalive: 30_000 })
  peer.on_change = (msg) => {
    console.log(msg.id.substring(0, 8), peerType(peer.peers[msg.id]), msg.ts, msg.content)
  }
  function peerType (peer) {
    return peer ? (/192\.168\.\d+\.\d+/.test(peer.address) ? 'local' : peer.nat) || '???' : '!!!'
  }

  peer.on_peer = (other) => {
    if(!peer.introducers[other.id]) {
    
      console.log('connected', other.id.substring(0, 8),  peerType(other), other.address+':'+other.port)
    }
  }

  //detect the nat type and exit
  if(cmd === 'nat') {
    setTimeout(()=>{
      console.log('failed to detect nat, offline?')
      process.exit(1)
    }, 3_000)
    peer.on_nat = (n) => {
      console.log(n)
      if(Object.keys(peer.peers).length < 2) {
        console.error('found only '+Object.keys(peer.peers).length+' peers')
        process.exit(1)
      }
      process.exit(0)
    }
  }

  Wrap(peer, [config.port])

  console.log('id:',config.id)
  process.stdin.on('data', function (data) {
    data = data.toString()
    var m = /^\s*\/(\w+)/.exec(data)
    if(m) {
      var cmd = m[1]
      if(cmd === 'peers')
        console.log(peer.peers)
      else if(cmd === 'ip')
        console.log(peer.publicAddress+':'+peer.publicPort)
      else if(cmd === 'join')
        peer.join(swarm)
      else
        console.log('unknown command:'+cmd)

      return
    }
    peer.chat({ ts: Date.now(), content: data.toString() })
  })

}

if(!module.parent)
  main(process.argv.slice(2))
