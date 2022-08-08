#! /usr/bin/env node
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const Demo = require('./chat')
const {Introducer} = require('..')
const Config = require('../lib/config')(crypto, fs, path)
const Wrap = require('../wrap')(require('dgram'), require('os'))
const util = require('../util')

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
    Wrap(new Introducer(config), [config.port])
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

}

if(!module.parent)
  main(process.argv.slice(2))
