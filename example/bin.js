#! /usr/bin/env node
const udp = require('dgram')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const Demo = require('./chat')
const Config = require('../lib/config')
const Wrap = require('../wrap')(require('dgram'))
const Multicast = require('../lib/multicast')(udp)
const util = require('../util')

function main (argv) {
  const config = Config({ appname: 'introducer-chat' }, crypto, fs, path)
  const cmd = argv[0]
  const swarm = util.createId('test swarm')
  /* multicast
    to find other peers on the local network,
    we need a parallel multicast system.
    it appears that a socket cannot be used for both
  */

  if (cmd === 'introducer') {
    Wrap(udp, new Introducer(), [config.port])
    console.log(config.id)
    return
  }

  const peer = new Demo({ swarm, ...config })
  peer.on_change = (msg) => {
    console.log(msg.id.substring(0, 8), msg.ts, msg.content)
  }

  //detect the nat type and exit
  if(cmd === 'nat') {
    setTimeout(()=>{
      console.log('failed to detect nat, offline?')
      process.exit(1)
    }, 3_000)
    peer.on_nat = (n) => {
      console.log(n)
      process.exit(0)
    }
  }

  Wrap(peer, [config.port])

  process.stdin.on('data', function (data) {
    console.log('DATA', data.toString())
    const c = peer.chat({ ts: Date.now(), content: data.toString() })
  })

  // broadcast our presense on local network.
  // our address is detectable.
  // but include our port, because message will be received on multicast
  // only port which won't receive direct packets.
  Multicast(6543, function () {
    return JSON.stringify({ type: 'broadcast', id: config.id, port: config.port, ts: Date.now() })
  }, function (data, addr) {
    console.log("receive multicast", data.toString(), addr)
    // when we detect a peer, just ping them,
    // that will trigger the other peer management stuff.
    // hmm, also need to join swarms with them?
    const msg = JSON.parse(data.toString())
    if (msg.id === peer.id) return // ignore our own messages
    console.log('ping', { address: addr.address, port: msg.port })
    peer.ping({ address: addr.address, port: msg.port })

    // mark as a local peer,
    // when you join a swarm, also message local peers to join the swarm
    // (just incase they are in it, cheap to message locally)
  })
}

if(!module.parent)
  main(process.argv.slice(2))
