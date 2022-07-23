var {toAddress, isId} = require('./util')

var port = 3456

/*
function randomKey(obj) {
  var keys = Object.keys(obj)
  return keys[~~(Math.random()*keys.length)]
}
*/

class Introducer {
  constructor ({id}) {
    this.id = id
    this.peers = {}
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
}

function interval (delay, fn) {
  fn(); return setInterval(fn, delay)
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
    this.id = id
    this.introducers = {
      [introducer1.id]: this.introducer1 = introducer1,
      [introducer2.id]: introducer2
    }
    this.on_peer = onPeer
  }
  init () {
    this.interval(60_000, 0, () => {
      for(var k in this.introducers)
        this.ping(this.introducers[k])
    })
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
    this.interval(delay, 0, () => {
      if(this.peers[addr.id] && this.peers[addr.id].pong) return
      this.ping(addr)
    })
    this.interval(delay*2, 0, () => {
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
  //we received connect request, ping the target 3 itmes
  on_connect (msg) {
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
