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
    this.send({type: 'pong', id: this.id, ...addr}, addr, port)
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
      this.send({type:'connect', id: msg.id, address:addr.address, port: addr.port, nat: peer.nat}, peer, port)
      this.send({type:'connect', id: msg.target, address:peer.address, port: peer.port, nat: msg.nat}, addr, port)
    }
    else //respond with an error
      this.send({type:'error', id: target.id}, addr, port)
  }

  connect (from_id, to_id, swarm, port) {
    if(port == undefined) throw new Error('port cannot be undefined')
    var from = this.peers[from_id]
    var to   = this.peers[to_id]
    this.send({ type:'connect', id: to.id, swarm: swarm, address:to.address, nat: to.nat, port: to.port }, from, port)
  }

  on_join (msg, addr, port) {
    if(port == undefined) throw new Error('undefined port')
    var swarm = this.swarms[msg.swarm] = this.swarms[msg.swarm] || {}
    swarm[msg.id] = Date.now()
    var peer = this.peers[msg.id]
    if(peer && msg.nat) peer.nat = msg.nat
    //trigger random connections
    //if there are no other peers in the swarm, do nothing
    var ids = Object.keys(swarm)
    //remove ourself, then randomly shuffle list
    ids.splice(ids.indexOf(msg.id), 1).sort(cmpRand)

    if(peer.nat == 'hard')
      ids = ids.filter(id => this.peers[id].nat === 'easy')

    //send messages to the random peers indicating that they should connect now.
    //if peers is 0, the sender of the "join" message joins the swarm but there are no connect messages.
    var max_peers = Math.min(ids.length, msg.peers != null ? msg.peers : 3)
    for(var i = 0; i < max_peers; i++) {
      this.connect(ids[i], msg.id, msg.swarm, port)
      this.connect(msg.id, ids[i], msg.swarm, port)
    }
  }
}

function checkNat(peer) {
  //if we have just discovered our nat, ping the introducer again to let them know
  var update = !peer.nat
  var port
  for(var k in peer.introducers) {
    var _peer = peer.peers[k]
    if(_peer && _peer.pong) {
      if(!port)
        port = _peer.pong.port
      else if(_peer.pong.port != port) {
        if(peer.nat != 'hard')
        peer.on_nat(peer.nat = 'hard')
        if(update) peer.ping(peer.introducer1)
        return
      }
    }
  }
  if(update) peer.ping(peer.introducer1)
  if(peer.nat != 'easy')
    peer.on_nat(peer.nat = 'easy')  
}

function random_port (ports) {
  var i = 0
  do { var p = ~~(Math.random()*0xffff); i++ } while(ports[p])
  ports[p] = true
  return p
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

    for(var k in this.introducers)
      this.ping(this.introducers[k])
  }
  on_nat (type) {
    //override this to implement behaviour for when nat is detected.
  }
  ping (addr) {
    this.send({type:'ping', id:this.id, nat:this.nat}, addr, port)
  }
  on_ping (msg, addr, _port) {
    this.peers[msg.id] = {id: msg.id, address:addr.address, port: addr.port, outport: _port, ts: Date.now()}
    //if(_port != port) throw new Error('receive on unexpected port')
    this.send({type:'pong', id: this.id, ...addr}, addr, _port)
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
    if(!msg.port) throw new Error('pong: missing port')
    var ts = Date.now()
    var peer = this.peers[msg.id] = this.peers[msg.id] || {id: msg.id, address:addr.address, port: addr.port, ts}
    peer.ts = ts
    peer.pong = {ts, address: msg.address, port: msg.port}
    checkNat(this)
    if(this.on_peer) this.on_peer(peer)
  }
  connect (id) {
    this.send({type: 'connect', id:this.id, nat: this.nat, target: id}, this.introducer1, port)
  }
  join (swarm_id) {
    if(!isId(swarm_id)) throw new Error('swarm_id must be a valid id')
    this.send({type:'join', id: this.id, swarm: swarm_id, nat: this.nat}, this.introducer1, port)
  }

  //we received connect request, ping the target 3 itmes
  on_connect (msg) {
    //note: ping3 checks if we are already communicating
    if(isId(msg.swarm)) {
      this.swarm[msg.swarm] = this.swarm[msg.swarm] || {}
      this.swarm[msg.swarm][msg.id] = Date.now()
    } 
    if(msg.nat === 'static')
      this.ping3(msg)
    else if(this.nat === 'easy') {
      //if nat is missing, guess that it's easy nat.
      //we should generally know our own nat by now.
      if(msg.nat === 'easy' || msg.nat == null)
        this.ping3(msg) //we are both easy, just do ping3
      else if (msg.nat === 'hard') {
        //we are easy, they are hard
        var i = 0
        var ports = {}
        var timer = this.timer(0, 10, () => {
          //send messages until we receive a message from them. giveup after sending 1000 packets.
          //50% of the time 250 messages should be enough.
          if(i++ > 1000 || this.peers[msg.id] && this.peers[msg.id].pong) {
            clearInterval(timer)
            return false
          }
          this.send({type: 'ping', id: this.id}, {
            address: msg.address,
            port: random_port(ports),
            nat: this.nat
          }, port)
          
        })
      }
    }
    else if(this.nat === 'hard') {
      if(msg.nat === 'easy') {
        //we are the hard side, open 256 random ports
        var ports = {}
        for(var i = 0; i < 256; i++) {
          var p = random_port(ports)
          this.send({type: 'ping', id: this.id, nat: this.nat}, msg, p)
        }
      }
      else if (msg.nat === 'hard'){
        //if we are both hard nats, we must implement tunneling
        //in that case, we ask both us and them to connect a shared easy nat.
        //then we could relay messages through it.
        console.log('cannot connect hard-hard nats', msg)
      }
      else {
        throw new Error('cannot connect to unknown nat')
      }
    }
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
