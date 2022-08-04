const udp = require('dgram')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const Demo = require('./chat')
const Config = require('../lib/config')
const Wrap = require('../wrap')
const Multicast = require('../lib/multicast')

async function main () {
  const config = Config({ appname: 'introducer-chat' }, crypto, fs, path)
  const cmd = process.argv[2]
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

  Wrap(udp, peer, [config.port])

  process.stdin.on('data', function (data) {
    const c = peer.chat({ ts: Date.now(), content: data.toString() })
    console.log('DATA', data.toString(), c)
  })

  // broadcast our presense on local network.
  // our address is detectable.
  // but include our port, because message will be received on multicast
  // only port which won't receive direct packets.
  Multicast(udp, 6543, function () {
    return JSON.stringify({ type: 'broadcast', id: config.id, port: config.port, ts: Date.now() })
  }, function (data, addr) {
    // when we detect a peer, just ping them,
    // that will trigger the other peer management stuff.
    // hmm, also need to join swarms with them?
    const msg = JSON.parse(data.toString())
    if (msg.id === peer.id) return // ignore our own messages
    peer.ping({ address: addr.address, port: msg.port })

    // mark as a local peer,
    // when you join a swarm, also message local peers to join the swarm
    // (just incase they are in it, cheap to message locally)
  })
}
