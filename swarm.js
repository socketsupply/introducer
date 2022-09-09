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

function cmpRand () {
  return Math.random() - 0.5
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
    this.messages = []
  }

  //create a data model, this takes an id, plus a function to update the datamodel

  createModel(swarm, reduce=append) {
    this.handlers[swarm] = reduce
    //defer, incase that this instance hasn't been wrapped yet
    if(this.nat)
      this.join(swarm)
    return this
  }

  getModel(swarm) {
    return this.data[swarm]
  }

  update(msg, addr) {
    var data = this.data[msg.swarm] 
    var _update
    if(this.handlers[msg.swarm]) {
      _update = this.handlers[msg.swarm](msg, data)
      //if we already have this message, do not notify or rebroadcast
      if(_update !== null) {
        this.data[msg.swarm] = _update
        this.on_change(msg, this.data)
        this.broadcast(msg, msg.swarm, addr)
      }
    }
    else {
      debug(1, "no handler for msg.swarm:"+msg.swarm+" only:'"+Object.keys(this.handlers).join(','))
    }
  }

  chat ({ content, ts = Date.now(), swarm }) {
    if(!isId(swarm)) throw new Error('chat needs a swarm id')
    this.update({ type: 'chat', id: this.id, swarm, content, ts })
  }

  // when a message is received, if it is new, broadcast it to our other peers.
  on_chat (msg, addr, port) {
    this.update(msg, addr)
  }

  on_nat () {
    const info = {
      public: this.publicAddress + ':' + this.publicPort,
      local: this.localAddress + ':' + this.localPort
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

    //and other local peers
    for(const k in this.peers) {
      if((this.swarms[swarm] && !this.swarms[swarm][k]) && /^192.168/.test(this.peers[k].address)) {
        this.send(msg, this.peers[k], this.localPort)
        c++
      }
    }
    return c
  }


  join (swarm_id, target_peers = 3) {
    if (!isId(swarm_id)) throw new Error('swarm_id must be a valid id')
    if('number' !== typeof target_peers) {
      console.log(target_peers)
      throw new Error('target_peers must be a number, was:'+target_peers)
    }
    var send = (id) => {
      var peer = this.peers[id]
      this.send({ type: 'join', id: this.id, swarm: swarm_id, nat: this.nat, peers:target_peers|0 }, peer, peer.outport || this.localPort)

    }
    var current_peers = Object.keys(this.swarms[swarm_id] || {}).length
      //.filter(id => !!this.peers[id]).length
    if(current_peers >= target_peers) return 
    //update: call join on every introducer (static nat)
    //TODO include count of current connected swarm peers
    //     (so don't create too many connections)
    //     hmm, to join a swarm, you need a connection to anyone in that swarm.
    //     a DHT would be good for that, because it's one lookup.
    //     after that the swarm is a gossip flood

    if(current_peers) {
      for(var id in this.swarms[swarm_id]) {
        if(this.peers[id]) send(id)
      }
    }
    
    for(var id in this.peers) {
      var peer = this.peers[id]
      if(peer.nat === 'static') send(id)
    }
  }

  //__set_peer (id, address, port, nat, outport, restart) {
  on_join (msg, addr, port) {
    if (port === undefined) throw new Error('undefined port')

    if(!isId(msg.swarm)) return debug(1, 'join, no swarm:', msg)
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
      ids = ids.filter(id => this.peers[id].nat === 'static' || this.peers[id].nat === 'easy' || this.peers[id].address === peer.address)
    }
    if(this.connections) this.connections[msg.id] = {}

    // send messages to the random peers indicating that they should connect now.
    // if peers is 0, the sender of the "join" message joins the swarm but there are no connect messages.
    const max_peers = Math.min(ids.length, msg.peers != null ? msg.peers : 3)
    debug(1, 'join', max_peers, msg.id+'->'+ids.join(','))
    // if there are no other connectable peers, at least respond to the join msg
    if (!max_peers || !ids.length) {
      debug(1,'join error: no peers')
      return this.send({ type: 'error', id: msg.swarm, peers: Object.keys(swarm).length, call:'join' }, addr, port)
    }
    
    for (let i = 0; i < max_peers; i++) {
      if(this.connections) this.connections[msg.id][ids[i]] = i
      this.connect(ids[i], msg.id, msg.swarm, this.localPort)
      this.connect(msg.id, ids[i], msg.swarm, this.localPort)
    }

    this.emit('join', peer)
  }

  /*
  on_msg (msg, addr, port) {
    var peer = this.peer[msg.id]
    var swarm_id = msg.swarm
    var swarm = this.handlers[swarm]
    var fn
    if(isFunction(fn = swarm['on_'+msg.type]))
      fn(msg, peer)
  }
  */


}
