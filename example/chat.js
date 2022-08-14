// TODO
// run this code to point of nat check
// run to communicate with another peer
// extend netsim to represent local multicast and bluetooth
//
const { debug } = require('../util')
const Peer = require('../')

function equalAddr (a, b) {
  return a && b && a.address === b.address && a.port === b.port
}

module.exports = class Demo extends Peer {
  constructor (opts) {
    super(opts)
    this.swarm = opts.swarm
    this.messages = []
  }

  chat ({ name, content, ts = Date.now() }) {
    const msg = { type: 'chat', id: this.id, swarm: this.swarm, content, ts }
    this.messages.push(msg)
    this.on_change(msg, this.messages)
    return this.broadcast(msg)
  }

  // when a message is received, if it is new, broadcast it to our other peers.
  on_chat (msg, addr, port) {
    if(this.messages.find(_msg => _msg.ts == msg.ts && _msg.content == msg.content)) return
    this.messages.push(msg)
    this.on_change(msg, this.messages)
    this.broadcast(msg, addr)
  }

  on_nat () {
    const info = {
      public: this.publicAddress + ':' + this.publicPort,
      local: this.localAddress + ':' + this.port
    }

    debug('have nat:', this.nat, info)

    this.join(this.swarm)
  }

  on_error (msg) {
    debug('error:', msg)
  }

  on_peer (peer) {
    debug('connected peer:', peer)
  }

  // broadcast a message, optionally skipping a particular peer (such as the peer that sent this)
  broadcast (msg, not_addr = { address: null }) {
    for (const k in this.peers) {
      if (!this.introducers[k] && !equalAddr(this.peers[k], not_addr)) {
        this.send(msg, this.peers[k], this.peers[k].outport || this.port)
      }
    }
  }

  // broadcast a message within a particular swarm
  swarmcast (msg, swarm, not_addr = { address: null }) {
    // send to peers in the same swarm
    // debug('swarmcast:', msg, swarm)
    let c = 0
    for (const k in this.swarms[swarm]) {
      if (!Demo.equalAddr(this.peers[k], not_addr.address)) {
        this.send(msg, this.peers[k], this.port)
        c++
      }
    }

    //and other local peers
    for(const k in this.peers) {
      if((this.swarms[swarm] && !this.swarms[swarm][k]) && /^192.168/.test(this.peers[k].address)) {
        this.send(msg, this.peers[k], this.port)
        c++
      }
    }
    return c
  }
}
