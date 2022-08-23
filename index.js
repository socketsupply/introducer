const { isId, debug } = require('./util')
const EventEmitter = require('events')

function cmpRand () {
  return Math.random() - 0.5
}

function isFunction (f) {
  return typeof f === 'function'
}

function assertTs (ts) {
  if('number' !== typeof ts) throw new Error('ts must be provided')
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

  checkPeers (ts) {
    assertTs(ts)
    for (var id in this.peers) {
      var peer = this.peers[id]
      if (peer.pong && peer.pong.ts > ts - (this.keepalive*2)) {
        debug(2, 'found peer:', peer.id.substring(0, 8), (ts - peer.pong.ts)/1000)
        this.ping(peer)
        this.emit('alive', peer) //XXX change to "found"
      }
      else {
        console.log('disconnect', id.substring(0, 8))
        if (this.on_disconnect) this.on_disconnect(peer)
        delete this.peers[id]
        debug(1, "lost peer:", peer)
        this.emit('dead', peer) //XXX change to "lost"
      }
    }
  }

  init (ts) {
    assertTs(ts)
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
      const sec = 1_000
      this.timer(sec, sec, (_ts) => {
        assertTs(ts)

        if(this._localAddress && this._localAddress != this.localAddress) {
          this.discoverNat()
        }
        this._localAddress = this.localAddress

        if((_ts - ts) > 2*sec) {
          //we have woken up
          debug(1, 'detected wakeup', (_ts - ts)/sec)
          if (this.on_wakeup) {
            this.on_wakeup()
            this.emit('awoke')
          }
        }
        ts = _ts
      })
      debug(1, 'keepalive active:', this.keepalive)
      this.timer(this.keepalive, this.keepalive, (ts)=> {
        //do this every second, every minute, ping all peers
        this.checkPeers(ts)
      })
    }
    this.emit('init', this)
  }

  on_wakeup () {
    debug(1, 'wakeup')
    for(var k in this.swarms)
      this.join(k)
  }

  on_nat (type) {
    debug(1, 'nat', type)
    this.emit('nat', type)
    // override this to implement behaviour for when nat is detected.
  }

  ping (addr) {
    this.send({ type: 'ping', id: this.id, nat: this.nat }, addr, addr.outport || port)
  }

  __set_peer (id, address, port, nat, outport, restart = null, ts) {
    assertTs(ts)
    if(!this.peers[id]) {
      debug(1, 'new peer', id.substring(0, 8), address+':'+port, nat)
      const peer = this.peers[id] = { id, address, port, nat, ts, outport, restart }
      if(this.introducers[peer.id])
        peer.introducer = true
      return true
    }
    else {
      const peer = this.peers[id]
      peer.address = address
      peer.port = port
      peer.nat = nat || peer.nat
      peer.ts = ts
      peer.outport = outport
      var _restart = peer.restart
      peer.restart = restart
      if(this.introducers[peer.id])
        peer.introducer = true
      //if(this.on_peer) this.on_peer(peer)
      if(_restart != peer.restart) {
        if(this.on_peer_restart) {
          debug(1, 'restart peer', id.substring(0, 8))
          this.on_peer_restart(peer, _restart)
        }
      }
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

  on_ping (msg, addr, _port, ts) {
    assertTs(ts)
    // XXX notify on_peer if we havn't heard from this peer before.
    // (sometimes first contact with a peer will be ping, sometimes pong)
    this.send({ type: 'pong', id: this.id, ...addr, nat: this.nat }, addr, _port)
    const isNew = this.__set_peer(msg.id, addr.address, addr.port, msg.nat, _port, null, ts)
    this.emit('ping', msg, addr, port)

    if (isNew) this.emit('peer', this.peers[msg.id])
    if (isNew && this.on_peer) this.on_peer(this.peers[msg.id])
  }

  // method to check if we are already communicating
  ping3 (addr, delay = 500) {
    if (!addr.id) throw new Error('ping3 expects peer id')
    this.ping(addr)
    this.timer(delay, 0, (ts) => {
      if (this.peers[addr.id] && this.peers[addr.id].pong) return
      this.ping(addr)
    })
    this.timer(delay * 2, 0, (ts) => {
      if (this.peers[addr.id] && this.peers[addr.id].pong) return
      this.ping(addr)
    })
  }

  on_pong (msg, addr, _port, ts) {
    // XXX notify if this is a new peer message.
    // (sometimes we ping a peer, and their response is first contact)
    if (!msg.port) throw new Error('pong: missing port')

    // NOTIFY new peers here.
    const isNew = this.__set_peer(msg.id, addr.address, addr.port, msg.nat, _port, msg.restart || null, ts)
    const peer = this.peers[msg.id]
    peer.pong = { ts, address: msg.address, port: msg.port, latency: peer.ping ? ts - peer.ping : null }
    checkNat(this)
    if (isNew) this.emit('peer', this.peers[msg.id])
    if (isNew && this.on_peer) this.on_peer(this.peers[msg.id])
    this.emit('pong', this.peers[msg.id])
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
  on_connect (msg, _addr, _port, ts) {
    assertTs(ts)
    if(!ts) throw new Error('ts must not be zero:'+tsF)
    let swarm
    // note: ping3 checks if we are already communicating
    const ap = msg.address+':'+msg.port
    if (isId(msg.swarm)) {
      swarm = this.swarms[msg.swarm] = this.swarms[msg.swarm] || {}
      swarm[msg.id] = ts
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

      // if nat is missing, guess that it's easy nat, or a server.
      // we should generally know our own nat by now.
      if (msg.nat === 'easy' || msg.nat == null) {
         // we are both easy, just do ping3
        this.ping3(msg)
      }
      else if (msg.nat === 'hard') {
        // we are easy, they are hard
        var short_id = msg.id.substring(0, 8)
        debug(1, 'BDP easy->hard', short_id, ap)
        var i = 0, start = Date.now(), ts = start
        var ports = {}
        this.timer(0, 10, () => {
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
          } else if (this.peers[msg.id] && this.peers[msg.id].pong) {
            debug(1, 'connected:', i, s, short_id, ap)
            return false
          }
          this.send({ type: 'ping', id: this.id, nat: this.nat }, {
            address: msg.address, port: random_port(ports)
          }, port)
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
}
