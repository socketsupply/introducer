const { isId } = require('./util')

const debug = process.env.DEBUG ? function (...args) { console.log(...args) } : function () {}

function cmpRand () {
  return Math.random() - 0.5
}

function isFunction (f) {
  return typeof f === 'function'
}

const port = 3456

class Introducer {
  constructor ({ id, keepalive }) {
    this.id = id
    this.peers = {}
    this.swarms = {}
    this.keepalive = keepalive
  }

  init () {}
  on_ping (msg, addr, _port) {
    if (!isId(msg.id)) return
    if(!this.peers[msg.id])
      this.peers[msg.id] = { id: msg.id, ...addr, nat: msg.nat, ts: Date.now(), outport: _port }
    else {
      var peer = this.peers[msg.id]
      peer.nat = msg.nat
      peer.ts = Date.now()
      peer.output = _port
    }
    this.send({ type: 'pong', id: this.id, ...addr }, addr, _port)
  }

  //sending on-local requests other peer to connect directly to our local address
  //a connect message is not sent back because we can receive an unsolicited packet locally.
  on_local (msg, addr) {
    const peer = this.peers[msg.target]
    if(peer) {
      this.send({type: 'local', id: msg.id, address: msg.address, port: msg.port}, peer, port)
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
    const peer = this.peers[msg.target]
    if (peer) {
      // tell the target peer to connect, and also tell the source peer the addr/port to connect to.
      this.send({ type: 'connect', id: msg.id, address: addr.address, port: addr.port, nat: peer.nat }, peer, port)
      this.send({ type: 'connect', id: msg.target, address: peer.address, port: peer.port, nat: msg.nat }, addr, port)
    } else // respond with an error
    { this.send({ type: 'error', id: target.id, call: 'connect' }, addr, port) }
  }

  connect (from_id, to_id, swarm, port) {
    if (port == undefined) throw new Error('port cannot be undefined')
    const from = this.peers[from_id]
    const to = this.peers[to_id]
    this.send({ type: 'connect', id: to.id, swarm: swarm, address: to.address, nat: to.nat, port: to.port }, from, port)
  }

  on_join (msg, addr, port) {
    if (port == undefined) throw new Error('undefined port')
    const swarm = this.swarms[msg.swarm] = this.swarms[msg.swarm] || {}
    swarm[msg.id] = Date.now()
    const peer = this.peers[msg.id]
    if (peer && msg.nat) peer.nat = msg.nat
    // trigger random connections
    // if there are no other peers in the swarm, do nothing
    // peers that have pinged in last 2 minutes
    let ids = Object.keys(swarm).filter(id => this.peers[id].ts > ts - 120_000)
    // remove ourself, then randomly shuffle list
    ids.splice(ids.indexOf(msg.id), 1).sort(cmpRand)

    if (peer.nat == 'hard') {
      //hard nat can only connect to easy nats, but can also connect to peers on the same nat
      ids = ids.filter(id => this.peers[id].nat === 'easy' || this.peers[id].address === peer.address)
    }

    // send messages to the random peers indicating that they should connect now.
    // if peers is 0, the sender of the "join" message joins the swarm but there are no connect messages.
    const max_peers = Math.min(ids.length, msg.peers != null ? msg.peers : 3)

    // if there are no other connectable peers, at least respond to the join msg
    if (!max_peers) {
      return this.send({ type: 'error', id: msg.swarm, peers: Object.keys(swarm).length }, addr, port)
    }
    for (let i = 0; i < max_peers; i++) {
      this.connect(ids[i], msg.id, msg.swarm, port)
      this.connect(msg.id, ids[i], msg.swarm, port)
    }
  }
}

module.exports = Introducer