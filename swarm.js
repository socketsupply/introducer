// TODO
// run this code to point of nat check
// run to communicate with another peer
// extend netsim to represent local multicast and bluetooth

const { debug } = require('./util')
const Swarm = require('./')
var {isId} = require('./util')
 
function equalAddr (a, b) {
  return a && b && a.address === b.address && a.port === b.port
}

function append(item, ary=[]) {
  //check we don't already have it
  for(var i = 0; i < ary.length; i++)
    if(ary[i].ts === item.ts) return null
  ary.push(item)
  return ary
}

module.exports = class Demo extends Swarm {
  constructor (opts) {
    super(opts)
    this.swarms = {}
    this.data = {}
    this.handlers = {}
    if(!isId(opts.id))
      throw new Error('peer id *must* be provided')
    if(isId(opts.swarm))
      this.swarm = opts.swarm
      /*
    this.swarm = opts.swarm
    if(!isId(opts.swarm))
      throw new Error('swarm id *must* be provided')
    */
    this.messages = []

  }

  //create a data model, this takes an id, plus a function to update the datamodel

  createModel(swarm, reduce=append) {
    this.handlers[swarm] = reduce
    //defer, incase that this instance hasn't been wrapped yet
    if(this.nat) this.join(swarm)
    return this
  }

  getModel(swarm) {
    return this.data[swarm]
  }

  update(msg, addr = null) {
    var data = this.data[msg.swarm] 
    var _update
    console.log("UPDTATATATAH", msg)
    if(this.handlers[msg.swarm]) {
      _update = this.handlers[msg.swarm](msg, data)
      console.log('update', data, msg, _update)
      //if we already have this message, do not notify or rebroadcast
      if(_update !== null) {
        this.data[msg.swarm] = _update
        console.log('updated', this.data)
        this.on_change(msg, this.messages)
        this.broadcast(msg, addr)
      }
    }
    else {
      debug(1, "update was missing swarm field:", msg)
    }
  }

  chat ({ content, ts = Date.now(), swarm }) {
    this.update({ type: 'chat', id: this.id, swarm, content, ts })
  }

  // when a message is received, if it is new, broadcast it to our other peers.
  on_chat (msg, addr, port) {
    this.update(msg, addr)
  }

  on_nat () {
    const info = {
      public: this.publicAddress + ':' + this.publicPort,
      local: this.localAddress + ':' + this.port
    }

    debug(1, 'have nat:', this.nat, info)

    //or just request to all peers to join this swarm
    for(var swarm in this.handlers)
      this.join(swarm)
  }

  on_error (msg) {
    debug(1, 'error:', msg)
  }

  on_peer (peer) {
    debug(1, 'connected peer:', peer)
  }

  // broadcast a message, optionally skipping a particular peer (such as the peer that sent this)
  broadcast (msg, not_addr = { address: null }) {
    for (const k in this.peers) {
      var peer = this.peers[k]
      if (!equalAddr(peer, not_addr)) {
        this.send(msg, peer, peer.outport || this.port)
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
