var {toAddress, isId} = require('./util')

function cmpRand () {
  return Math.random()-0.5
}

var port = 3456

class Introducer {
  constructor ({id}) {
    this.id = id
    this.peers = {}
    this.swarms = {}
  }
  init () {}
  on_ping (msg, addr) {
    if(!isId(msg.id)) return
    this.peers[msg.id] = {id: msg.id, ...addr, nat: msg.nat, ts: Date.now()}
    this.send({type: 'pong', id: this.id, addr}, addr, port)
  }
  on_connect (msg, addr) {
    //check nat types:
    // if both peers are easy, just tell each to connect to the other
    // if one is easy, one hard, birthday paradox connection
    // if both are hard, choose an easy peer to be relay, the two peers bdp to the easy peer.
    //    then relay their messages through that peer
    //    OR just error, and expect apps to handle case where not every pair can communicate
    //    OR let the peers decide who can replay, maybe they already have a mutual peer?
    var peer = this.peers[msg.target]
    if(peer) {
      //tell the target peer to connect, and also tell the source peer the addr/port to connect to.
      this.send({type:'connect', id: msg.id, address:addr.address, port: addr.port}, peer, port)
      this.send({type:'connect', id: msg.target, address:peer.address, port: peer.port}, addr, port)
    }
    else //respond with an error
      this.send({type:'error', id: target.id}, addr, port)
  }

  connect (from_id, to_id, swarm, port) {
    var from = this.peers[from_id]
    var to   = this.peers[to_id]
    this.send({ type:'connect', id: to.id, swarm: swarm, address:to.address, port: to.port }, from, port)
  }

  on_join (msg, addr, port) {
    var swarm = this.swarms[msg.swarm] = this.swarms[msg.swarm] || {}
    swarm[msg.id] = Date.now()
    //trigger random connections
    //if there are no other peers in the swarm, do nothing
    var ids = Object.keys(swarm)
    //remove ourself, then randomly shuffle list
    ids.splice(ids.indexOf(msg.id), 1).sort(cmpRand)

    //send messages to the random peers indicating that they should connect now.
    //if peers is 0, the sender of the "join" message joins the swarm but there are no connect messages.
    for(var i = 0; i < Math.min(ids.length, (msg.peers != null ? msg.peers : 3)); i++) {
      this.connect(ids[i], msg.id, msg.swarm, port)
      this.connect(msg.id, ids[i], msg.swarm, port)
    }
  }
}

function checkNat(peer) {
  //if we have just discovered our nat, ping the introducer again to let them know
  var update = !peer.nat
  for(var k in peer.introducers) {
    var _peer = peer.peers[k]
    if(_peer && _peer.pong) 
      if(!port)
        port = _peer.pong.port
      else if(_peer.pong.port != port) {
        if(peer.nat != 'hard')
        peer.on_nat(peer.nat = 'hard')
        if(update) peer.ping(peer.introducer1)
        return
      }
  }
  if(update) peer.ping(peer.introducer1)
  if(peer.nat != 'easy')
    peer.on_nat(peer.nat = 'easy')  
}

class Peer {
  constructor ({id, introducer1, introducer2, onPeer}) {
    this.peers = {}
    this.swarm = {}
    this.id = id
    if(!introducer1) throw new Error('must provide introducer1')
    if(!introducer2) throw new Error('must provide introducer2')
    this.introducers = {
      [introducer1.id]: this.introducer1 = introducer1,
      [introducer2.id]: introducer2
    }
    this.on_peer = onPeer
  }
  init () {
    //TODO: we really want to end the tests after this but it keeps them running
    //so we need a way to unref...
    //because in practice I'm fairly sure this should poll to keep port open (say every minute)

    console.log('init', this.introducers)
    for(var k in this.introducers)
      this.ping(this.introducers[k])
  }
  on_nat (type) {
    //override this to implement behaviour for when nat is detected.
  }
  ping (addr) {
    this.send({type:'ping', id:this.id, nat:this.nat}, addr, port)
  }
  on_ping (msg, addr) {
    this.send({type:'pong', id: this.id, ...addr}, addr, port)
  }
  ping3 (addr, delay=500) {
    if(!addr.id) throw new Error('ping3 expects peer id')
    this.ping(addr)
    this.timer(delay, 0, () => {
      if(this.peers[addr.id] && this.peers[addr.id].pong) return
      this.ping(addr)
    })
    this.timer(delay*2, 0, () => {
      if(this.peers[addr.id] && this.peers[addr.id].pong) return 
      this.ping(addr)
    })
  }
  on_pong(msg, addr) {
    var ts = Date.now()
    var peer = this.peers[msg.id] = this.peers[msg.id] || {id: msg.id, address:addr.address, port: addr.port, ts}
    peer.ts = ts
    peer.pong = {ts, ...addr}
    checkNat(this)

    if(this.on_peer) this.on_peer(peer)
  }
  connect (id) {
    this.send({type: 'connect', id:this.id, nat: this.nat, target: id}, this.introducer1, port)
  }
  join (swarm_id) {
    if(!isId(swarm_id)) throw new Error('swarm_id must be a valid id')
    this.send({type:'join', id: this.id, swarm: swarm_id}, this.introducer1, port)
  }

  //we received connect request, ping the target 3 itmes
  on_connect (msg) {
    //note: ping3 checks if we are already communicating
    if(isId(msg.swarm)) {
      this.swarm[msg.swarm] = this.swarm[msg.swarm] || {}
      this.swarm[msg.swarm][msg.id] = Date.now()
    } 
    this.ping3(msg)
  }
  //support sending directly to a peer
  sendMsg (msg, peer) {
    if(peers[id]) {
      this.send(msg, peers[id], port)
      return true
    }
    else
      return false
  }
}

module.exports = {Introducer, Peer}
