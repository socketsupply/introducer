const { isId } = require('./util')

const debug = process.env.DEBUG ? function (...args) { console.log(...args) } : function () {}

function cmpRand () {
  return Math.random() - 0.5
}

function isFunction (f) {
  return typeof f === 'function'
}

const port = 3456


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

    if(this.keepalive) {
      debug('keepalive scheduled')
      let ts = Date.now()
      this.timer(this.keepalive, this.keepalive, ()=> {
        let _ts = Date.now()
        if((_ts - ts) > this.keepalive*2) {
          //we have woken up
          debug('woke up', (_ts - ts)/1000)
          if(this.on_wakeup) this.on_wakeup()
        }
        ts = _ts
        for(var id in this.peers) {
          var peer = this.peers[id]
          if(peer.pong && peer.pong.ts > ts - (this.keepalive*2)) {
            debug('alive peer:', peer.id.substring(0, 8), (ts - peer.pong.ts)/1000)
            this.ping(this.peers[id])
          }
          else {
            console.log('disconnect', id.substring(0, 8))
            if(this.on_disconnect) this.on_disconnect(peer)
            delete this.peers[id]
            debug("dead peer:", peer)
          }
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

  __set_peer (id, address, port, nat, outport) {
    if(!this.peers[id]) {
      const peer = this.peers[id] = { id, address, port, nat, ts: Date.now(), outport }
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
      if(this.introducers[peer.id])
        peer.introducer = true
      //if(this.on_peer) this.on_peer(peer)
      return false
    }
  }

  on_ping (msg, addr, _port) {
    // XXX notify on_peer if we havn't heard from this peer before.
    // (sometimes first contact with a peer will be ping, sometimes pong)
    this.send({ type: 'pong', id: this.id, ...addr }, addr, _port)
    const isNew = this.__set_peer(msg.id, addr.address, addr.port, msg.nat, _port)
    if (isNew && this.on_peer) this.on_peer(this.peers[msg.id])
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

  on_pong (msg, addr, _port) {
    // XXX notify if this is a new peer message.
    // (sometimes we ping a peer, and their response is first contact)
    if (!msg.port) throw new Error('pong: missing port')
    const ts = Date.now()

    // NOTIFY new peers here.
    const isNew = this.__set_peer(msg.id, addr.address, addr.port, msg.nat, _port)
    const peer = this.peers[msg.id]
    peer.pong = { ts, address: msg.address, port: msg.port, latency: peer.ping ? ts - peer.ping : null }
    checkNat(this)
    if (isNew && this.on_peer) this.on_peer(this.peers[msg.id])
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

module.exports = Peer //{ Introducer: require('./introducer'), Peer }
