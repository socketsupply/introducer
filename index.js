const { isId, debug } = require('./util')
const EventEmitter = require('events')

function cmpRand () {
  return Math.random() - 0.5
}

function isFunction (f) {
  return typeof f === 'function'
}

const port = 3456

function checkNat (peer) {
  // if we have just discovered our nat, ping the introducer again to let them know
  const _nat = peer.nat
  let port, address, intros = 0

  for (const k in peer.introducers) {
    const _peer = peer.peers[k]
    if (_peer && _peer.pong) {
      intros ++
      if (!port) {
        port = _peer.pong.port
        address = _peer.pong.address
        peer.publicAddress = address
        peer.publicPort = port
      }
      else if (_peer.pong.port != port) {
        if (_nat != 'hard') {
          peer.nat = 'hard'
          peer.ping(peer.introducer1)
          peer.on_nat(peer.nat)
        }
        return
      }
    }
  }
  if (_nat != 'easy' && intros > 1) {
    peer.nat = 'easy'
    for(var id in peer.introducers)
      peer.ping(peer.peers[id])
    peer.on_nat(peer.nat)
  }
}

function random_port (ports) {
  let i = 0
  do { var p = 1 + ~~(Math.random() * 0xffff); i++ } while (ports[p])
  ports[p] = true
  return p
}

module.exports = class Peer extends EventEmitter {
  constructor ({ id, introducer1, introducer2, keepalive }) {
    super()

    this.peers = {}
    this.swarms = {}
    this.id = id
    this.restart = Date.now()
    if (!introducer1) throw new Error('must provide introducer1')
    if (!introducer2) throw new Error('must provide introducer2')
    this.keepalive = keepalive
    this.introducers = {
      [introducer1.id]: this.introducer1 = introducer1,
      [introducer2.id]: introducer2
    }
  }

  discoverNat () {
    this.publicAddress = null
    this.nat = null
    for (const k in this.introducers) {
      this.peers[k].pong = null
      this.ping(this.introducers[k])
    }
  }

  checkPeers () {
    let ts = Date.now()
    for (var id in this.peers) {
      var peer = this.peers[id]
      if (peer.pong && peer.pong.ts > ts - (this.keepalive*2)) {
        debug('alive peer:', peer.id.substring(0, 8), (ts - peer.pong.ts)/1000)
        this.ping(peer)
        this.emit('alive', peer)
      }
      else {
        console.log('disconnect', id.substring(0, 8))
        if (this.on_disconnect) this.on_disconnect(peer)
        delete this.peers[id]
        debug("dead peer:", peer)
        this.emit('dead', peer)
      }
    }
  }

  init () {
    if(this._once) return
    this._once = true
    // TODO: we really want to end the tests after this but it keeps them running
    // so we need a way to unref...
    // because in practice I'm fairly sure this should poll to keep port open (say every minute)
    for (const k in this.introducers) { this.ping(this.introducers[k]) }
    if (this.keepalive) {
      //every second, check if our address has changed.
      //that is, have we connected to another network?
      //or disconnected from wifi.
      this.timer(1000, 1000, (ts) => {
        if(this._localAddress && this._localAddress != this.localAddress) {
          this.discoverNat()
        }
        this._localAddress = this.localAddress
      })
      debug('keepalive scheduled')
      let ts = Date.now()
      this.timer(this.keepalive, this.keepalive, (_ts)=> {
        if((_ts - ts) > this.keepalive*2) {
          //we have woken up
          debug('woke up', (_ts - ts)/1000)
          if (this.on_wakeup) {
            this.on_wakeup()
            this.emit('awoke')
          }
        }
        this.checkPeers()
      })
    }
    this.emit('init', this)
  }

  on_wakeup () {
    for(var k in this.swarms)
      this.join(k)
  }

  on_nat (type) {
    this.emit('nat', type)
    // override this to implement behaviour for when nat is detected.
  }

  ping (addr) {
    //save ping time so we can detect latency
    if(addr.id && this.peers[addr.id]) this.peers[addr.id].ping = Date.now()
    this.send({ type: 'ping', id: this.id, nat: this.nat }, addr, addr.outport || port)
  }

  __set_peer (id, address, port, nat, outport, restart) {
    if(!this.peers[id]) {
      const peer = this.peers[id] = { id, address, port, nat, ts: Date.now(), outport, restart }
      if(this.introducers[peer.id])
        peer.introducer = true
      return true
    }
    else {
      const peer = this.peers[id]
      peer.address = address
      peer.port = port
      peer.nat = nat || peer.nat
      peer.ts = Date.now()
      peer.outport = outport
      var _restart = peer.restart
      peer.restart = restart
      if(this.introducers[peer.id])
        peer.introducer = true
      //if(this.on_peer) this.on_peer(peer)
      if(this.on_peer_restart) this.on_peer_restart(peer, _restart)
      return false
    }
  }

  //if the introducer server restarts, rejoin swarms
  on_peer_restart (other, restart) {
    if(this.introducers[other.id]) {
      for(var k in this.swarms)
        this.join(k)
    }
  }

  on_ping (msg, addr, _port) {
    // XXX notify on_peer if we havn't heard from this peer before.
    // (sometimes first contact with a peer will be ping, sometimes pong)
    this.send({ type: 'pong', id: this.id, ...addr, nat: this.nat }, addr, _port)
    const isNew = this.__set_peer(msg.id, addr.address, addr.port, msg.nat, _port)
    this.emit('ping', msg, addr, port)

    if (isNew) this.emit('peer', this.peers[msg.id])
    if (isNew && this.on_peer) this.on_peer(this.peers[msg.id])
  }

  // method to check if we are already communicating
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

  on_pong (msg, addr, _port) {
    // XXX notify if this is a new peer message.
    // (sometimes we ping a peer, and their response is first contact)
    if (!msg.port) throw new Error('pong: missing port')
    const ts = Date.now()

    // NOTIFY new peers here.
    const isNew = this.__set_peer(msg.id, addr.address, addr.port, msg.nat, _port, msg.restart)
    const peer = this.peers[msg.id]
    peer.pong = { ts, address: msg.address, port: msg.port, latency: peer.ping ? ts - peer.ping : null }
    checkNat(this)
    if (isNew) this.emit('peer', this.peers[msg.id])
    if (isNew && this.on_peer) this.on_peer(this.peers[msg.id])
    this.emit('pong', this.peers[msg.id])
  }

  retry (test, action) {
    var tries = 0
    var next = ()=>{
      if(!test() && tries < 3) {
        action()
        this.delay(1000*Math.pow(2, tries++), next)
      }
    }
  }

  connect (id, swarm) {
      this.send({ type: 'connect', id: this.id, nat: this.nat, target: id, swarm}, this.introducer1, port)
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
        // if the dest has the same public ip as we do, it must be on the same nat.
        // since NAT hairpinning is usually not supported, we should request a direct connection.
        // implement this by sending another message requesting a local introduction.
        // of course, this is pretty absurd, to require internet connectivity just to make a local connection!
        // unfortunately, the app stores are strongly against local multicast
        // however, in the future we can have a real local experience here using bluetooth.
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
        this.timer(0, 10, () => {
          // send messages until we receive a message from them. giveup after sending 1000 packets.
          // 50% of the time 250 messages should be enough.
          if (i++ > 2000 || this.peers[msg.id] && this.peers[msg.id].pong) {
            return false
          }
          this.send({ type: 'ping', id: this.id, nat: this.nat }, {
            address: msg.address,
            port: random_port(ports)
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
        throw new Error('cannot connect to unknown nat:'+JSON.stringify(msg))
      }
    }

    this.emit('connect', msg)
  }

  // support sending directly to a peer
  sendMessage (msg, peer) {
    if (peers[id]) {
      this.send(msg, peers[id], port)
      return true
    } else { return false }
  }
}
