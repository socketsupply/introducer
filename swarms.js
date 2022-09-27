// TODO
// run this code to point of nat check
// run to communicate with another peer
// extend netsim to represent local multicast and bluetooth

const { debug } = require('./util')
const Peer = require('./')
const Swarm = require('./swarm/append')
const { isId, isPeer } = require('./util')

function equalAddr (a, b) {
  return a && b && a.address === b.address && a.port === b.port
}

function cmpRand () {
  return Math.random() - 0.5
}

function peerFromAddress (peers, addr) {
  let peer
  for (const k in peers) {
    if (peers[k].address === addr.address) {
      if (peers[k].port === addr.port) {
        peer = peers[k]
        continue
      }
    }
  }
  return peer
}

module.exports = class Swarms extends Peer {
  constructor (opts) {
    super(opts)
    this.swarms = {}
    //  this.data = {}
    this.handlers = {}
    if (!isId(opts.id)) { throw new Error('peer id *must* be provided') }
    if (isId(opts.swarm)) throw new Error('swarm optino no longer supported')
    //  this.swarm = opts.swarm
    // this.messages = []
  }

  // create a data model, this takes an id, plus a function to update the datamodel
  /// *
  get data () {
    const o = {}
    for (const k in this.handlers) { o[k] = this.handlers[k].data }
    return o
  }

  //* /
  createModel (swarm, swarm_handler) {
    this.handlers[swarm] = swarm_handler || new Swarm(swarm)
    this.handlers[swarm].peer = this
    this.handlers[swarm].id = swarm
    // s.on_chat = (msg) => {
    //  this.update(msg)
    // }
    // defer, incase that this instance hasn't been wrapped yet
    if (this.nat) { this.handlers[swarm].on_nat() }

    return this.handlers[swarm]
  }

  getModel (swarm) {
    return this.handlers[swarm] && this.handlers[swarm].data
  }

  on_nat () {
    const info = {
      public: this.publicAddress + ':' + this.publicPort,
      local: this.localAddress + ':' + this.localPort
    }

    debug(1, 'have nat:', this.nat, info)

    // or just request to all peers to join this swarm
    for (const swarm in this.handlers) {
      const s = this.handlers[swarm]
      if (s.on_nat) s.on_nat(this.nat)
    }
  }

  msg_error (msg) {
    debug(1, 'error:', msg)
  }

  msg_peer (peer) {
    for(var swarm in this.swarms)
      if(this.swarms[swarm][peer.id]) {
        if(this.handlers[swarm] && this.handlers[swarm].on_peer)
          this.handlers[swarm].on_peer(peer)
      }
    debug(1, 'connected peer:', peer)
  }
/*
  // broadcast a message, optionally skipping a particular peer (such as the peer that sent this)
  broadcast (msg, not_addr = { address: null }) {
    for (const k in this.peers) {
      const peer = this.peers[k]
      if (!equalAddr(peer, not_addr)) {
        this.send(msg, peer, peer.outport || this.localPort)
      }
    }
  }

  // broadcast a message within a particular swarm
  swarmcast (msg, swarm, not_addr = { address: null }) {
    // send to peers in the same swarm
    // debug('swarmcast:', msg, swarm)
    let c = 0
    for (const k in this.swarms[swarm]) {
      if (!equalAddr(this.peers[k], not_addr.address)) {
        this.send(msg, this.peers[k], this.peers[k].outport || this.localPort)
        c++
      }
    }

    // and other local peers
    for (const k in this.peers) {
      if ((this.swarms[swarm] && !this.swarms[swarm][k]) && /^192.168/.test(this.peers[k].address)) {
        this.send(msg, this.peers[k], this.localPort)
        c++
      }
    }
    return c
  }
*/

  join (swarm_id, target_peers = 3) {
    if (!isId(swarm_id)) throw new Error('swarm_id must be a valid id, was:' + swarm_id)
    if (typeof target_peers !== 'number') {
      throw new Error('target_peers must be a number, was:' + target_peers)
    }
    this.swarms[swarm_id] = this.swarms[swarm_id] || {} 
    const send = (id) => {
      const peer = this.peers[id]
      this.send({ type: 'join', id: this.id, swarm: swarm_id, nat: this.nat, peers: target_peers | 0 }, peer, peer.outport || this.localPort)
    }
    //check if these peers are currently active
    const current_peers = Object.keys(this.swarms[swarm_id] || {}).length
    // .filter(id => !!this.peers[id]).length
    if (current_peers >= target_peers) return
    // update: call join on every introducer (static nat)
    // TODO include count of current connected swarm peers
    //     (so don't create too many connections)
    //     hmm, to join a swarm, you need a connection to anyone in that swarm.
    //     a DHT would be good for that, because it's one lookup.
    //     after that the swarm is a gossip flood

    if (current_peers) {
      for (var id in this.swarms[swarm_id]) {
        if (this.peers[id]) send(id)
      }
    }

    for (var id in this.peers) {
      const peer = this.peers[id]
      if (peer.nat === 'static') send(id)
    }
  }


  // if the introducer server restarts, rejoin swarms
  // TODO if a PEER restarts, rejoin swarms with them that they are part of.
  on_peer_restart (other, restart) {
    const p = this.peers[other.id]
    //XXX count the active peers already in this swarm
    //    and send how many more peers we need
    //    also consider sending join messages to other peers in this swarm
    if (!p) return
     if(p.introducer) {
      for (const k in this.swarms) { this.join(k) }
    }
    else
      for (const k in this.swarms) {
        if(this.swarms[k][other.id])
          this.join(k)
        
      }
      
  }


  // __set_peer (id, address, port, nat, outport, restart) {
  msg_join (msg, addr, port, ts) {
    if (port === undefined) throw new Error('undefined port')

    if (!isId(msg.swarm)) return debug(1, 'join, no swarm:', msg)
    if (!isId(msg.id)) return debug(1, 'join, no id:', msg)
    const swarm = this.swarms[msg.swarm] = this.swarms[msg.swarm] || {}
    swarm[msg.id] = ts
    this.__set_peer(msg.id, addr.address, addr.port, msg.nat, port, null, ts)
    const peer = this.peers[msg.id]

    // trigger random connections
    // if there are no other peers in the swarm, do nothing
    // peers that have pinged in last 2 minutes
    let ids = Object.keys(swarm)
    // remove ourself, then randomly shuffle list
    ids.splice(ids.indexOf(msg.id), 1)
    ids = ids
      .filter(id => this.peers[id]) //defensive: ignore peers which might be in swarm table but not peers tabel
      .sort(cmpRand)
      //this is a filter to only connect recently active peers, but this was wrong...
      //.filter(id => this.peers[id].recv > (ts - this.keepalive*4))

    // a better strategy could be for hard nats to connect to easy or fellow network
    // but easy nats to connect to other easy nats first, to ensure a strong network.
    if (peer.nat === 'hard') {
      // hard nat can only connect to easy nats, but can also connect to peers on the same nat
      ids = ids.filter(id => this.peers[id] && (this.peers[id].nat === 'static' || this.peers[id].nat === 'easy' || this.peers[id].address === peer.address))
    }
    if (this.connections) this.connections[msg.id] = {}


    // send messages to the random peers indicating that they should connect now.
    // if peers is 0, the sender of the "join" message joins the swarm but there are no connect messages.
    const max_peers = Math.min(ids.length, msg.peers != null ? msg.peers : 3)
    debug(1, 'join', max_peers, msg.id.substring(0,8) + '->' + ids.map(id=>id.substring(0, 8)).join(','))
    // if there are no other connectable peers, at least respond to the join msg
    if (!max_peers || !ids.length) {
      debug(1, 'join error: no peers')
      return this.send({ type: 'error', id: msg.swarm, peers: Object.keys(swarm).length, call: 'join' }, addr, port)
    }

    for (let i = 0; i < max_peers; i++) {
      if (this.connections) this.connections[msg.id][ids[i]] = i
      this.connect(ids[i], peer.id, msg.swarm, this.localPort)
      this.connect(peer.id, ids[i], msg.swarm, this.localPort)
    }

    this.emit('join', peer)
  }

  /// *
  on_msg (msg, addr, port, ts) {
    if(super.on_msg(msg, addr, port, ts) === false) {
      if(msg.swarm) {
        const peer = peerFromAddress(this.peers, addr)
        if (!peer) return
        const swarm_id = msg.swarm
        const swarm = this.handlers[swarm_id]
        if (!swarm) return
        const fn_name = 'msg_' + msg.type
        if (typeof (swarm[fn_name]) === 'function') {
          swarm[fn_name](msg, peer, port, ts)
        }
      }
    }    
  }
  //* /
}
