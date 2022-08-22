const { isId } = require('./util')
const debug = process.env.DEBUG ? function (...args) { console.log(...args) } : function () {}

const EventEmitter = require('events')
function cmpRand () {
  return Math.random() - 0.5
}

/**
  * this file runs on a publically addressable peer. AKA a server.
  * for simplicity, to focus on the core problem of creating p2p communication
  * I stripped out everything that was not strictly necessary, such as the DHT
  * That will come back later.
  *
  * Two instances of this file must run on separate public servers.
  * peers ping them to check what sort of nat they have.
  * also, peers can ask the introducer to connect them to peers.
  * (either by connecting them directly to particular peers,
  *  or to random peers in a particular swarm)
  */

const port = 3456

module.exports = class Introducer extends EventEmitter {
  constructor ({ id, keepalive, port }) {
    super()

    this.id = id
    this.peers = {}
    this.swarms = {}
    this.restart = Date.now()
    this.keepalive = keepalive
    this.connections = {}
  }

  init () {}

  on_ping (msg, addr, _port) {
    if (!isId(msg.id)) return
    let peer

    if (!this.peers[msg.id]) {
      peer = this.peers[msg.id] = { id: msg.id, ...addr, nat: msg.nat, ts: Date.now(), outport: _port }
    } else {
      peer = this.peers[msg.id]
      peer.address = addr.address
      peer.port = addr.port
      if(peer.nat && !msg.nat) {
        console.log(msg)
//        throw new Error('peer removed nat!')
      }
      peer.nat = peer.nat || msg.nat
      peer.ts = Date.now()
      peer.outport = _port
    }

    this.emit('ping', peer)
    this.send({ type: 'pong', id: this.id, ...addr, nat: peer.nat, restart: this.restart }, addr, _port)
  }

  // sending on-local requests other peer to connect directly to our local address
  // a connect message is not sent back because we can receive an unsolicited packet locally.
  on_local (msg, addr) {
    const peer = this.peers[msg.target]
    if (peer) {
      this.send({ type: 'local', id: msg.id, address: msg.address, port: msg.port }, peer, port)
      this.emit('local', peer)
    }
  }

  on_connect (msg, addr) {
    // check nat types:
    // if both peers are easy, just tell each to connect to the other
    // if one is easy, one hard, birthday paradox connection
    // if both are hard, choose an easy peer to be relay, the two peers bdp to the easy peer.
    //    then relay their messages through that peer
    //    OR just error, and expect apps to handle case where not every pair can communicate
    //    OR let the peers decide who can replay, maybe they already have a mutual peer?
    const to_peer = this.peers[msg.target]
    const from_peer = this.peers[msg.id]
    if (to_peer && from_peer) {
      // tell the target peer to connect, and also tell the source peer the addr/port to connect to.

      this.connect(msg.target, msg.id, msg.swarm)
      this.connect(msg.id, msg.target, msg.swarm)
    } else {
      // respond with an error
      this.send({ type: 'error', target: msg.target, id: msg.id, call: 'connect' }, addr, port)
    }
  }

  connect (from_id, to_id, swarm, port) {

    const from = this.peers[from_id]
    const to = this.peers[to_id]
    if ((port || from.outport) === undefined) throw new Error('port cannot be undefined')
    //if(!from.nat) throw new Error('cannot connect FROM unknown nat')
    //if(!to.nat) throw new Error('cannot connect TO unknown nat')
    this.send({ type: 'connect', id: to.id, swarm: swarm, address: to.address, nat: to.nat, port: to.port }, from, port || from.outport)
  }

  //__set_peer (id, address, port, nat, outport, restart) {
  on_join (msg, addr, port) {
    if (port === undefined) throw new Error('undefined port')

    if(!isId(msg.swarm)) return debug('join, no swarm:', msg)
    const ts = Date.now()
    const swarm = this.swarms[msg.swarm] = this.swarms[msg.swarm] || {}
    swarm[msg.id] = Date.now()
    const peer = this.peers[msg.id] = 
      this.peers[msg.id] || { id: msg.id, ...addr, nat: msg.nat, ts: Date.now(), outport: port }

    if (peer && msg.nat) peer.nat = msg.nat
    // trigger random connections
    // if there are no other peers in the swarm, do nothing
    // peers that have pinged in last 2 minutes
    let ids = Object.keys(swarm)
    // remove ourself, then randomly shuffle list
    ids.splice(ids.indexOf(msg.id), 1)
      .filter(id => this.peers[id] && this.peers[id].ts > (ts - 120_000))
      .sort(cmpRand)

    //a better strategy could be for hard nats to connect to easy or fellow network
    //but easy nats to connect to other easy nats first, to ensure a strong network.
    if (peer.nat === 'hard') {
      // hard nat can only connect to easy nats, but can also connect to peers on the same nat
      ids = ids.filter(id => this.peers[id].nat === 'easy' || this.peers[id].address === peer.address)
    }
    this.connections[msg.id] = {}



    // send messages to the random peers indicating that they should connect now.
    // if peers is 0, the sender of the "join" message joins the swarm but there are no connect messages.
    const max_peers = Math.min(ids.length, msg.peers != null ? msg.peers : 3)
    debug('max_peers', max_peers, ids, msg.peers)
    // if there are no other connectable peers, at least respond to the join msg
    if (!max_peers || !ids.length) {
      return this.send({ type: 'error', id: msg.swarm, peers: Object.keys(swarm).length, call:'join' }, addr, port)
    }
    
    for (let i = 0; i < max_peers; i++) {
      this.connections[msg.id][ids[i]] = i
      this.connect(ids[i], msg.id, msg.swarm, port)
      this.connect(msg.id, ids[i], msg.swarm, port)
    }

    this.emit('join', peer)
  }
}
