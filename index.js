'use strict'
const { isId, isIp, isAddr, debug } = require('./util')
const constants = require('./lib/constants')()
var PingPeer = require('./pings')

function assertAddr (addr, message) {
  if(!isAddr(addr)) throw new Error('must be valid addr {address, port} object:'+message)
}

function cmpRand () {
  return Math.random() - 0.5
}

function isFunction (f) {
  return typeof f === 'function'
}

function assertTs (ts) {
  if('number' !== typeof ts) throw new Error('ts must be provided')
}

//const port = 3456

function random_port (ports) {
  let i = 0
  do { var p = 1 + ~~(Math.random() * 0xffff); i++ } while (ports[p])
  ports[p] = true
  return p
}

module.exports = class Peer extends PingPeer {
  constructor (opts) {
    super(opts)
    var {introducer1, introducer2} = opts
    this.swarms = {}

    function set (p) {
      this.__set_peer(p.id, p.address, p.port, 'static', null, 0, 0, true)
    }
    if(introducer1) {
      this.introducer1 = introducer1.id
      set.call(this, introducer1)
      if(introducer2) {
        set.call(this, introducer2)
      }
    }
  }

  local (id, intro) {
    //check if we do not have the local address, this messages is relayed, it could cause a crash at other end
    if(!isIp(this.localAddress)) //should never happen, but a peer could send anything.
      return debug(1, 'cannot connect local because missing localAddress!')
    var peer = intro || this.peers[this.introducer1]
    this.send({type: 'relay', target: id, content: {
      type:'local', id: this.id, address: this.localAddress, port: this.localPort
    }}, peer, peer.outport)
  }

  on_local (msg) {
    if(!isAddr(msg)) //should never happen, but a peer could send anything.
      return debug(1, 'local connect msg is invalid!', msg)
    this.ping3(msg.id, msg)
  }

  // we received connect request, ping the target 3 itmes
  on_connect (msg, _addr, _port, ts) {
    assertTs(ts)
    if(!ts) throw new Error('ts must not be zero:'+ts)
    if(!msg.target)
      msg.target = msg.id
    ///XXX TODO check if we are already connected or connecting to this peer, and if so let that continue...


    if(!isAddr(msg)) //should never happen, but a peer could send anything.
      return debug(1, 'connect msg is invalid!', msg)

    let swarm
    // note: ping3 checks if we are already communicating
    const ap = msg.address+':'+msg.port
    if (isId(msg.swarm)) {
      swarm = this.swarms[msg.swarm] = this.swarms[msg.swarm] || {}
      swarm[msg.target] = ts
    }


    //if we already know this peer, but the address has changed,
    //reset the connection to them...
    var peer = this.peers[msg.target]
    if(peer) {
      if(peer.address != msg.address) {
        peer.address = msg.address
        peer.pong = null
      }
      else if(ts - peer.send < constants.connecting) {
        //if we are already connecting do nothing.
        return
      }
      else if(ts - Math.max(peer.recv, peer.send) < constants.keepalive) {
        this.ping3(peer, ts)
        return
      }
      //if we didn't hear response maybe the peer is down, so try connect again?
    }


    if(msg.address === this.publicAddress) {
      // if the dest has the same public ip as we do, it must be on the same nat.
      // since NAT hairpinning is usually not supported, we should request a direct connection.
      // implement this by sending another message requesting a local introduction.
      // of course, this is pretty absurd, to require internet connectivity just to make a local connection!
      // unfortunately, the app stores are strongly against local multicast
      // however, in the future we can have a real local experience here using bluetooth.
      debug(1, 'local peer', this.localAddress+'->'+msg.address)
      this.local(msg.target, this.peers[msg.id])
      return
    }

    if (msg.nat === 'static') {
      this.ping3(msg.target, msg, ts)
    }
    else if (this.nat === 'easy') {
      // if nat is missing, guess that it's easy nat, or a server.
      // we should generally know our own nat by now.
      if (msg.nat === 'easy' || msg.nat == null) {
         // we are both easy, just do ping3
        this.ping3(msg.target, msg)
      }
      else if (msg.nat === 'hard') {
        // we are easy, they are hard
        console.log(msg)
        var short_id = msg.target.substring(0, 8)
        debug(1, 'BDP easy->hard', short_id, ap)
        var i = 0, start = Date.now(), ts = start
        var ports = {}
        this.timer(0, 10, (_ts) => {
          if(Date.now() - 1000 > ts) {
            debug(1, 'packets', i, short_id)
            ts = Date.now()
          }
          
          // send messages until we receive a message from them. giveup after sending 1000 packets.
          // 50% of the time 250 messages should be enough.
          var s = Math.round((Date.now()-start)/100)/10
          if (i++ > 2000) {
            debug(1, 'connection failed:', i, s, short_id, ap)
            return false            
          } else if (this.peers[msg.target] && this.peers[msg.target].pong) {
            debug(1, 'connected:', i, s, short_id, ap)
            return false
          }
          this.send({ type: 'ping', id: this.id, nat: this.nat }, {
            address: msg.address, port: random_port(ports)
          }, this.localPort)
        })
      }
    } else if (this.nat === 'hard') {
      if (msg.nat === 'easy') {
        debug(1, 'BDP hard->easy', short_id)
        // we are the hard side, open 256 random ports
        var ports = {}
        for (var i = 0; i < 256; i++) {
          const p = random_port(ports)
          this.send({ type: 'ping', id: this.id, nat: this.nat }, msg, p)
        }
      } else if (msg.nat === 'hard') {
        // if we are both hard nats, we must implement tunneling
        // in that case, we ask both us and them to connect a shared easy nat.
        // then we could relay messages through it.
        debug(1, 'cannot connect hard-hard nats', msg)
      } else {
        throw new Error('cannot connect to unknown nat:'+JSON.stringify(msg))
      }
    }

    this.emit('connect', msg)
  }

  //if the introducer server restarts, rejoin swarms
  //TODO if a PEER restarts, rejoin swarms with them that they are part of.
  on_peer_restart (other, restart) {
    var p = this.peers[other.id]
    if(p && p.introducer) {
      for(var k in this.swarms)
        this.join(k)
    }
  }

  // stuff needed as an introducer

  // rename: on_relay - relay a msg to a targeted (by id) peer.
  // will forward anything. used for creating local (private network) connections.

  on_relay (msg, addr) {
    var target = this.peers[msg.target]
    if(!target)
      return debug(1, 'cannot relay message to unkown peer:'+msg.target.substring(0, 8))
    this.send(msg.content, target, target.outport || this.localPort)
  }

  connect (from_id, to_id, swarm, port) { //XXX remove port arg

    const from = this.peers[from_id]
    const to = this.peers[to_id]
    if ((port || from.outport) === undefined) throw new Error('port cannot be undefined')
    //if(!from.nat) throw new Error('cannot connect FROM unknown nat')
    //if(!to.nat) throw new Error('cannot connect TO unknown nat')
    //XXX id should ALWAYS be the id of the sender.
    this.send({ type: 'connect', id: this.id, target: to.id, swarm: swarm, address: to.address, nat: to.nat, port: to.port }, from, port || from.outport)
  }


  // rename: this was "connect" but that required Introducer to be different to Peer.
  intro (id, swarm, intro) {
    this.send({ type: 'intro', id: this.id, nat: this.nat, target: id, swarm}, intro || this.peers[this.introducer1], this.localPort)
  }

  on_intro (msg, addr) {
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


}
