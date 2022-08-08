const { isId } = require('./util')

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
    let ids = Object.keys(swarm)
    // remove ourself, then randomly shuffle list
    ids.splice(ids.indexOf(msg.id), 1).sort(cmpRand)

    if (peer.nat == 'hard') { ids = ids.filter(id => this.peers[id].nat === 'easy') }

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

function checkNat (peer) {
  // if we have just discovered our nat, ping the introducer again to let them know
  const update = !peer.nat
  let port, address
  for (const k in peer.introducers) {
    const _peer = peer.peers[k]
    if (_peer && _peer.pong) {
      if (!port) {
        port = _peer.pong.port
        address = _peer.pong.address
        peer.publicAddress = address
        peer.publicPort = port
      }
      else if (_peer.pong.port != port) {
        if (peer.nat != 'hard') peer.on_nat(peer.nat = 'hard')
        if (update) peer.ping(peer.introducer1)
        return
      }
    }
  }
  if (update) peer.ping(peer.introducer1)
  if (peer.nat != 'easy') { peer.on_nat(peer.nat = 'easy') }
}

function random_port (ports) {
  let i = 0
  do { var p = ~~(Math.random() * 0xffff); i++ } while (ports[p])
  ports[p] = true
  return p
}

class Peer {
  constructor ({ id, introducer1, introducer2, keepalive }) {
    this.peers = {}
    this.swarms = {}
    this.id = id
    if (!introducer1) throw new Error('must provide introducer1')
    if (!introducer2) throw new Error('must provide introducer2')
    this.keepalive = keepalive
    this.introducers = {
      [introducer1.id]: this.introducer1 = introducer1,
      [introducer2.id]: introducer2
    }
  }

  init () {
    // TODO: we really want to end the tests after this but it keeps them running
    // so we need a way to unref...
    // because in practice I'm fairly sure this should poll to keep port open (say every minute)
    for (const k in this.introducers) { this.ping(this.introducers[k]) }

    console.log('init')
    if(this.keepalive) {
      console.log('keepalive scheduled')
      let ts = Date.now()
      this.timer(this.keepalive, this.keepalive, ()=> {
        console.log('keepalive')
        let _ts = Date.now()
        if(_ts - ts > this.keepalive*2) {
          //we have woken up
          console.log('woke up')

        }
        for(var id in this.peers) {
          var peer = this.peers[id]
          if(peer.pong && peer.pong.ts > ts - (this.keepalive*2)) {
            console.log('alive peer:', peer.id.substring(0, 8), (ts - peer.pong.ts)/1000)
            this.ping(this.peers[id])
          }
          else
            console.log("dead peer:", peer)
        }
      })
    }

  }

  on_nat (type) {
    // override this to implement behaviour for when nat is detected.
  }

  ping (addr) {
    //save ping time so we can detect latency
    if(addr.id && this.peers[addr.id]) this.peers[addr.id].ping = Date.now()
    this.send({ type: 'ping', id: this.id, nat: this.nat }, addr, addr.outport || port)
  }

  on_ping (msg, addr, _port) {
    // XXX notify on_peer if we havn't heard from this peer before.
    // (sometimes first contact with a peer will be ping, sometimes pong)
    var isNew = false
    if (!this.peers[msg.id]) { var isNew = true }

    if(!this.peers[msg.id])
      this.peers[msg.id] = { id: msg.id, ...addr, nat: msg.nat, ts: Date.now(), outport: _port }
    else {
      var peer = this.peers[msg.id]
      peer.nat = msg.nat
      peer.ts = Date.now()
      peer.output = _port
    }

    // if(_port != port) throw new Error('receive on unexpected port')
    this.send({ type: 'pong', id: this.id, ...addr }, addr, _port)
    if (isNew && isFunction(this.on_peer)) { this.on_peer(this.peers[msg.id]) }
  }

  ping3 (addr, delay = 500) {
    if (!addr.id) throw new Error('ping3 expects peer id')
    this.ping(addr)
    this.timer(delay, 0, () => {
      if (this.peers[addr.id] && this.peers[addr.id].pong) return
      this.ping(addr)
    })
    this.timer(delay * 2, 0, () => {
      if (this.peers[addr.id] && this.peers[addr.id].pong) return
      this.ping(addr)
    })
  }

  on_pong (msg, addr) {
    // XXX notify if this is a new peer message.
    // (sometimes we ping a peer, and their response is first contact)
    if (!msg.port) throw new Error('pong: missing port')
    const ts = Date.now()

    // NOTIFY new peers here.
    if (!this.peers[msg.id]) var isNew = true
    const peer = this.peers[msg.id] = this.peers[msg.id] || { id: msg.id, address: addr.address, port: addr.port, ts }
    peer.ts = ts
    peer.pong = { ts, address: msg.address, port: msg.port, latency: peer.ping ? ts - peer.ping : null }
    checkNat(this)
    if (isNew && isFunction(this.on_peer)) this.on_peer(this.peers[msg.id])
  }

  connect (id) {
    this.send({ type: 'connect', id: this.id, nat: this.nat, target: id}, this.introducer1, port)
  }

  join (swarm_id) {
    if (!isId(swarm_id)) throw new Error('swarm_id must be a valid id')
    this.send({ type: 'join', id: this.id, swarm: swarm_id, nat: this.nat }, this.introducer1, port)
  }

  local (id) {
    this.send({type: 'local', target: id, id: this.id, address: this.localAddress, port}, this.introducer1, port)
  }

  on_local (msg) {
    this.ping3(msg)
  }

  // we received connect request, ping the target 3 itmes
  on_connect (msg) {
    let swarm
    // note: ping3 checks if we are already communicating

    if (isId(msg.swarm)) {
      swarm = this.swarms[msg.swarm] = this.swarms[msg.swarm] || {}
      swarm[msg.id] = Date.now()
    }
    if (msg.nat === 'static') { this.ping3(msg) } else if (this.nat === 'easy') {
      if(msg.address === this.publicAddress) {
        //if the dest has the same public ip as we do, it must be on the same nat.
        //since NAT hairpinning is usually not supported, we should request a direct connection.
        //implement this by sending another message requesting a local introduction.
        //of course, this is pretty absurd, to require internet connectivity just to make a local connection!
        //unfortunately, the app stores are strongly against local multicast
        //however, in the future we can have a real local experience here using bluetooth.
        this.local(msg.id)
        return
      }

      // if nat is missing, guess that it's easy nat.
      // we should generally know our own nat by now.
      if (msg.nat === 'easy' || msg.nat == null) { this.ping3(msg) } // we are both easy, just do ping3
      else if (msg.nat === 'hard') {
        // we are easy, they are hard
        var i = 0
        var ports = {}
        var timer = this.timer(0, 10, () => {
          // send messages until we receive a message from them. giveup after sending 1000 packets.
          // 50% of the time 250 messages should be enough.
          if (i++ > 1000 || this.peers[msg.id] && this.peers[msg.id].pong) {
            clearInterval(timer)
            return false
          }
          this.send({ type: 'ping', id: this.id }, {
            address: msg.address,
            port: random_port(ports),
            nat: this.nat
          }, port)
        })
      }
    } else if (this.nat === 'hard') {
      if (msg.nat === 'easy') {
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
        console.log('cannot connect hard-hard nats', msg)
      } else {
        throw new Error('cannot connect to unknown nat')
      }
    }
  }

  // support sending directly to a peer
  sendMessage (msg, peer) {
    if (peers[id]) {
      this.send(msg, peers[id], port)
      return true
    } else { return false }
  }
}

module.exports = { Introducer, Peer }
