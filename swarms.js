// TODO
// run this code to point of nat check
// run to communicate with another peer
// extend netsim to represent local multicast and bluetooth

const { debug } = require('./util')
const Peer = require('./')
const Swarm = require('./swarm/append')
const { isId, isPeer, isSeq, isPeerActive } = require('./util')

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

  _rejoin (k) {
      if(k != '_peers' && this.swarms[k][this.id])
        this.join(k)
  }

  _rejoin_all () {
    for(var k in this.swarms)
      this._rejoin(k)
  }

  on_wakeup () {
    super.on_wakeup()
    //XXX hmm it doesn't seem to be rejoining correctly./
    //also this should happen in 
    this._rejoin_all()
  }

  msg_error (msg, addr, port, ts) {
    debug(1, 'error:', msg)
    this.log('join.error', msg, ts)
  }

  on_peer (peer, ts) {
    for(var swarm in this.swarms) {
      if(this.swarms[swarm][peer.id]) {
        this.on_swarm(swarm, peer, ts)
      }
    }
    debug(1, 'connected peer:', peer, this.id)
  }

  on_swarm (swarm, peer, ts) {
    if(this.handlers[swarm] && this.handlers[swarm].on_peer) {
      this.handlers[swarm].on_peer(peer, ts)
    }  
  }

  join (swarm_id, target_peers = 3) {
    if (!isId(swarm_id)) throw new Error('swarm_id must be a valid id, was:' + swarm_id)
    if (typeof target_peers !== 'number') {
      throw new Error('target_peers must be a number, was:' + target_peers)
    }
    var swarm = this.swarms[swarm_id] = this.swarms[swarm_id] || {_peers: 0} 
    this.swarms[swarm_id][this.id] = -1
    if(swarm._peers == undefined)
      throw new Error('missing _peers')

    ///XXX count should use isActivePeer
//    var count = Object.keys(swarm).filter(id => this.peers[id]).length
    //XXX check if these peers are currently active
    let current_peers = 0
    for(var id in this.swarms[swarm_id])
      if(isPeerActive(this.peers[id])) current_peers ++

    const send = (id) => {
      const peer = this.peers[id]
      this.send({ type: 'join', id: this.id, swarm: swarm_id, nat: this.nat, peers: target_peers | 0, current: current_peers}, peer, peer.outport || this.localPort)
    }

    if (current_peers >= target_peers) return debug(2, 'join: fully peered, skipping join msg')
    // update: call join on every introducer (static nat)
    // TODO It would be good to have some way to estimate the number of peers in a swarm.
    //      I tried using a simple count you can't add the count you get from different peers
    //      they may be counting the same peers...
    //      you could use a small bloom filter here... an accurate count is more important
    //      when the swarm is small, if the swarm gets big the exact size doesn't matter
    //      because it becomes very likely someone will always be online and we can rely on statistical
    //      probabilities to ensure a connected network etc
    if(this.keepalive) {
      this.timer(this.keepalive, 0, (ts) => {
        var swarm = this.swarms[swarm_id]
        var count = Object.keys(swarm).filter(id => this.peers[id]).length

        if(count < target_peers)
          this._rejoin(swarm_id)
      })
    }

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
    //    also consider join sending messages to other peers in this swarm
    if (!p) return
     if(p.introducer) {
      this._rejoin_all()
    }
    else
      for (const k in this.swarms) {
        if(this.swarms[k][other.id] && this.swarms[k][this.id])
          this._rejoin(k)
      }
  }

  // __set_peer (id, address, port, nat, outport, restart) {
  msg_join (msg, addr, port, ts) {
    if (port === undefined) throw new Error('undefined port')

    if (!isId(msg.swarm)) return debug(1, 'join, no swarm:', msg)
    if (!isId(msg.id)) return debug(1, 'join, no id:', msg)
    const swarm = this.swarms[msg.swarm] = this.swarms[msg.swarm] || {_peers: msg.peers | 0}
    swarm[msg.id] = ts
//    if(swarm._peers == undefined) throw new Error('undef peers')

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

    console.log("IDS", ids)
      //this is a filter to only connect recently active peers, but this was wrong...
      //.filter(id => this.peers[id].recv > (ts - this.keepalive*4))

    // a better strategy could be for hard nats to connect to easy or fellow network
    // but easy nats to connect to other easy nats first, to ensure a strong network.
    if (peer.nat === 'hard') {
      // hard nat can only connect to easy nats, but can also connect to peers on the same nat
      ids = ids.filter(id => this.peers[id] && (this.peers[id].nat === 'static' || this.peers[id].nat === 'easy' || this.peers[id].address === peer.address))
    }
    var total_peers = ids.length
    if (this.connections) this.connections[msg.id] = {}

    // send messages to the random peers indicating that they should connect now.
    // if peers is 0, the sender of the "join" message joins the swarm but there are no connect messages.
    const max_peers = Math.min(ids.length, msg.peers != null ? msg.peers : 3)
    debug(1, 'join', ts, msg.id, max_peers, msg.id.substring(0,8) + '->' + ids.map(id=>id.substring(0, 8)).join(','))
    // if there are no other connectable peers, at least respond to the join msg
    if (!max_peers || !ids.length) {
      debug(1, 'join error: no peers')
      this.log('join.error', msg, ts)
      return this.send({ type: 'error', id: this.id, swarm: msg.swarm, peers: total_peers, call: 'join' }, addr, port)
    }

    for (let i = 0; i < max_peers; i++) {
      if (this.connections) this.connections[msg.id][ids[i]] = i
      this.log('join', {from: peer.id, to: ids[i]}, ts)
      //note, pass ts to connect, so that we can compare logs later and know
      //which peers successfully connected
      if(ids[i][0] === 'a')
        console.log('***********', ids, swarm, this.id)
      console.log("CONNECT:", ids[i].substring(0, 8), peer.id.substring(0, 8))
      this.connect(ids[i], peer.id, msg.swarm, this.localPort, {peers: total_peers, ts})
      this.connect(peer.id, ids[i], msg.swarm, this.localPort, {peers: total_peers, ts})
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
