'use strict'
const { isId, isIp, isAddr, debug, isPing, isPong, fromAddress, calcPeerState } = require('./util')
const EventEmitter = require('events')

/**
 * Peers need to be able to ping each other to know they are viable.
 * this file implements tracking peers, sending them pings, responding to pings
 * resending pings on intervals to ensure they are still alive.
 * and removing peers that do not respond to pings.
 */

function assertAddr (addr, message) {
  if(!isAddr(addr)) throw new Error('must be valid addr {address, port} object:'+message)
}

function cmpRand () {
  return Math.random() - 0.5
}

function isFunction (f) {
  return typeof f === 'function'
}

function isString (s) {
  return 'string' === typeof s
}

function assertTs (ts) {
  if('number' !== typeof ts) throw new Error('ts must be provided')
}

//peer states:
//attempting to connect - have sent ping recently, not received response yet
//connected             - received pong recently
//disconnected          - havn't received a pong in a while...
//lost                  - havn't received a pong in a long time

function eachIntroducer(peer, fn) {
  for (const k in peer.peers) {
    var _peer = peer.peers[k]
    if (_peer && _peer.introducer) {
      assertAddr(_peer)
      fn(_peer)
    }
  }
}

function checkNat (peer) {
  // if we have just discovered our nat, ping the introducer again to let them know
  const _nat = peer.nat
  var spin = false
  let port, address, intros = 0
  for (const k in peer.peers) {
    assertAddr(peer.peers[k])
    const _peer = peer.peers[k]
    if (_peer && _peer.introducer && _peer.pong) {
      assertAddr(_peer)
      intros ++
      if(_peer.pong.spin) spin = true
      if (!port) {
        port = _peer.pong.port
        address = _peer.pong.address
        peer.publicAddress = address
        peer.publicPort = port
      }
      else if (_peer.pong.port != port) {
        if (_nat != 'hard') {
          peer.nat = 'hard'
          debug(1, 'hard nat:', port, _peer.pong.port)
          eachIntroducer(peer, (intro) => {
            peer.ping(intro)
          })
          peer.on_nat(peer.nat)
        }
        return
      }
    }
  }
  //if our nat has changed, ping introducers again, to make sure everyone knows our nat type
  if(spin) {
    peer.nat = 'static'
  }
  else if (intros > 1) {
    peer.nat = 'easy'
  }
  if(_nat != peer.nat) {
    eachIntroducer(peer, (intro)=>{ peer.ping(intro) })
    peer.on_nat(peer.nat)
  }
}

module.exports = class PingPeer extends EventEmitter {

  constructor ({id, introducer1, introducer2, keepalive, port, spinPort}) {
    super()
    this.peers = {}
    this.id = id
    this.restart = 0
    this.keepalive = keepalive
    this.localPort = port || 3456
    this.spinPort = spinPort || 3457
    if(this.spinPort == this.localPort) {
      console.error('spin port cannot be the same as the local port!, static nat ignored')
      this.spinPort = null
    }
  }

  discoverNat () {
    this.publicAddress = null

    this.nat = null
    var first = true
    eachIntroducer(this, (intro) => {
      intro.pong = null
      this.ping(intro)
      if(!first) return
      first = false
      //ping with a different port.
      this.send({type:'ping', id: this.id, spinPort: this.spinPort}, intro, this.localPort)
    })
  }

  checkPeers (ts) {
    assertTs(ts)
    for (var id in this.peers) {
      var peer = this.peers[id]
      //if the peer hasn't ponged and we havn't pinged for a little while
      var state = calcPeerState(peer, ts, this.keepalive)
      if(peer.state != state)
        debug(1, 'state changed:', state, peer.id)
      peer.state = state
      if(state !== 'forget') {
        this.ping(peer)
      }
      else if(!peer.introducer) {
        delete this.peers[peer.id]
        this.emit('dead', peer)
      }
    }
  }

  init (ts) {
    assertTs(ts)
    if(this._once) return
    this._once = true
    this.restart = ts
    if(this.restart == null) throw new Error('cannot have null restart time')
    // TODO: we really want to end the tests after this but it keeps them running
    // so we need a way to unref...
    // because in practice I'm fairly sure this should poll to keep port open (say every minute)
    if(this.nat != 'static') this.discoverNat()
    if (this.keepalive) {
      //every second, check if our address has changed.
      //that is, have we connected to another network?
      //or disconnected from wifi.
      const sec = 1_000
      this.timer(sec, sec, (_ts) => {
        assertTs(ts)
        var _localAddress = this._localAddress
        this._localAddress = this.localAddress
        if(_localAddress != this.localAddress) {
          debug(1, 'address changed', _localAddress+'->'+this.localAddress)
          return this.discoverNat()
        }

        if((_ts - ts) > 2*sec) {
          //we have woken up
          debug(1, 'detected wakeup', (_ts - ts)/sec)
          if (this.on_wakeup) {
            this.on_wakeup(_ts)
            this.emit('awoke')
          }
        }
        //sometimes when switching networks, the initial ping gets dropped
        //so trigger a ping again soon if there is no nat
        if(!this.nat)
          this.discoverNat()
        ts = _ts
      })

      debug(1, 'keepalive active:', this.keepalive)
      this.timer(this.keepalive, this.keepalive, (ts)=> {
        //do this every second, every minute, ping all peers
        debug(1, 'check peers')
        this.checkPeers(ts)
        if(!this.nat)
          this.discoverNat()
      })

    }
    this.emit('init', this)
  }

  on_wakeup (ts) {
    debug(1, 'wakeup')
    for(var k in this.peers) {
      var peer = this.peers[k]
      if(peer.send < ts - this.keepalive/2)
        this.ping(peer, ts)
    }
    for(var k in this.swarms)
      this.join(k)
  }

  on_nat (type) {
    debug(1, 'nat', type)
    this.emit('nat', type)
    // override this to implement behaviour for when nat is detected.
  }

  ping (peer, ts) {
    if(peer.id && ts) {
      this.__set_peer(peer.id, peer.address, peer.port, peer.nat, peer.outport, null, ts, null)
      peer.send = ts
    }
    this.send({ type: 'ping', id: this.id, nat: this.nat, restart: this.restart }, peer, peer.outport || this.localPort)
  }

  // method to check if we are already communicating
  ping3 (id, addr, ts, delay = 500) {
    if (!id) throw new Error('ping3 expects peer id')
    var _peer = {...addr, id} //id must be come after the expansion or it will default to the addr value
    this.ping(_peer, ts)
    var maybe_ping = (ts) => {
      if (this.peers[id] && this.peers[id].pong) return
      this.ping(_peer, ts)
    }
    this.timer(delay, 0, maybe_ping)
    this.timer(delay * 2, 0, maybe_ping)
  }

  __notify_peer (id) {
    // Event handler pattern is to assign (or override) a on_* method.
    // It's optional, thus to emit an event do `if(on_<event>) on_<event>(...)`."
    if(this.on_peer) {
      var peer = this.peers[id]
      if(!peer.notified) {
        peer.notified = true
        this.on_peer(peer)
        this.emit('peer', peer)
      }
    }
  }

  __set_peer (id, address, port, nat, outport=this.localPort, restart = null, ts, isIntroducer) {
    //if(restart === null) throw new Error('null restart time')
    assertTs(ts)
    if(!this.peers[id]) {
      debug(2, 'new peer', id.substring(0, 8), fromAddress({address, port}), nat)
      const peer = this.peers[id] = { id, address, port, nat, ts, outport, restart, introducer: isIntroducer }
      if(isIntroducer)
        peer.introducer = true
      peer.notified = false
    }
    else {
      debug(2, 'set peer', id.substring(0, 8), fromAddress({address, port}), nat)
      let changed = false
      const peer = this.peers[id]
      if(address != peer.address) {
        changed = true
        peer.address = address
      }
      if(port != peer.port) {
        changed = true
        peer.port = port
      }
      peer.nat = nat || peer.nat
      peer.ts = ts
      peer.outport = outport
      var _restart = peer.restart
      peer.restart = restart || _restart
      if(changed)
        peer.pong = null
      if(_restart != peer.restart) {
        if(this.on_peer_restart) {
          debug(1, 'restart peer', id.substring(0, 8))
          this.on_peer_restart(peer, _restart)
        }
      }
      return false
    }
  }

  msg_ping (msg, addr, _port, ts) {
    if(!isPing(msg)) return debug(1, 'ignored invalid ping:'+JSON.stringify(msg))
    assertTs(ts)
    if(this.restart == null) throw new Error('cannot have null restart time')
    // XXX notify on_peer if we havn't heard from this peer before.
    // (sometimes first contact with a peer will be ping, sometimes pong)
    if(isNaN(this.restart)) {
      throw new Error('this.restart is missing')
    }
    var _msg = {
      type: 'pong', id: this.id, ...addr, nat: this.nat, restart: this.restart, ts:msg.ts
    }

   	if(msg.ts && msg.delay) {
      this.timer(msg.delay|0, 0, () => {
        this.send({..._msg, delay: msg.delay}, addr, _port)
      })
    }
    else {
      if(msg.spinPort) {
        //if spinPort is set, _ALSO_ pong to that port.
        //this is used to detect if peer has static nat.
        //if message gets through, it's static.

        //spinning the ball alters it's trajectory.
        this.send({ type: 'spin', id: this.id, ...addr, nat: this.nat }, {...addr, port: msg.spinPort}, _port)
      }
      //still pong like normal though.
      this.send(_msg, addr, _port)
    }
    this.__set_peer(msg.id, addr.address, addr.port, msg.nat, _port, msg.restart, ts)
    var peer = this.peers[msg.id]
    peer.recv = ts

    this.emit('ping', msg, addr, _port)

    this.__notify_peer(msg.id)
  }

  msg_spin (msg, addr, _port, ts) {
    this.peers[msg.id].pong = this.peers[msg.id].pong || {ts, address: msg.address, port: msg.port}
    this.peers[msg.id].pong.spin = true
    checkNat(this) //sets nat to static and notifies if necessary
  }

  msg_pong (msg, addr, _port, ts) {
    if(!isPong(msg)) return debug(1, 'ignored invalid ping:'+JSON.stringify(msg))
    // XXX notify if this is a new peer message.
    // (sometimes we ping a peer, and their response is first contact)
    if (!msg.port) throw new Error('pong: missing port')

    this.__set_peer(msg.id, addr.address, addr.port, msg.nat, _port, msg.restart, ts)
    const peer = this.peers[msg.id]
    var spin = peer.pong && peer.pong.spin
    peer.pong = {ts, address: msg.address, port: msg.port}
    if(spin) peer.pong.spin = true
    peer.recv = ts
    checkNat(this)
    // NOTIFY new peers here.
    //if (isNew) this.emit('peer', this.peers[msg.id])
    //if (isNew && this.on_peer) this.on_peer(this.peers[msg.id])
    this.__notify_peer(msg.id)
    this.emit('pong', this.peers[msg.id])
  }

  on_msg (msg, addr, port, ts) {
    if (isString(msg.type) && isFunction(this['msg_' + msg.type])) {
      this['msg_' + msg.type](msg, addr, port, ts)
    }
    else 
      return false
  }
}
