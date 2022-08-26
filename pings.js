'use strict'
const { isId, isIp, isAddr, debug } = require('./util')
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

function assertTs (ts) {
  if('number' !== typeof ts) throw new Error('ts must be provided')
}

const port = 3456

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
  let port, address, intros = 0
  for (const k in peer.peers) {
    assertAddr(peer.peers[k])
    const _peer = peer.peers[k]
    if (_peer && _peer.introducer && _peer.pong) {
      assertAddr(_peer)
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
  if (_nat != 'easy' && intros > 1) {
    peer.nat = 'easy'
    eachIntroducer(peer, (intro)=>{ peer.ping(intro) })
    peer.on_nat(peer.nat)
  }
}

module.exports = class PingPeer extends EventEmitter {

  constructor ({id, introducer1, introducer2, keepalive}) {
    super()
    this.peers = {}
    this.id = id
    this.restart = Date.now()
    if (!introducer1) throw new Error('must provide introducer1')
    if (!introducer2) throw new Error('must provide introducer2')
    this.keepalive = keepalive

    assertAddr(introducer1,'introducer1 must be valid')
    assertAddr(introducer2,'introducer2 must be valid')

    this.introducer1 = introducer1.id

    function set (p) {
      this.__set_peer(p.id, p.address, p.port, null, null, 0, 0, true)
    }
    set.call(this, introducer1)
    set.call(this, introducer2)
  }

  discoverNat () {
    this.publicAddress = null
    this.nat = null
    eachIntroducer(this, (intro) => {
      intro.pong = null
      this.ping(intro)
    })
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
         if(!this.peers[id].introducer) delete this.peers[id]
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
    this.discoverNat()
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
            this.on_wakeup()
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
        this.checkPeers(ts)
        if(!this.nat)
          this.discoverNat()
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

  ping (peer, ts) {
    if(peer.id && ts)
      this.__set_peer(peer.id, peer.address, peer.port, peer.nat, peer.outport || port, null, ts, null)
    this.send({ type: 'ping', id: this.id, nat: this.nat }, peer, peer.outport || port)
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

  __set_peer (id, address, port, nat, outport, restart = null, ts, isIntroducer) {
    assertTs(ts)
    if(!this.peers[id]) {
      debug(1, 'new peer', id.substring(0, 8), address+':'+port, nat)
      const peer = this.peers[id] = { id, address, port, nat, ts, outport, restart, introducer: isIntroducer }
      if(isIntroducer)
        peer.introducer = true
      return true
    }
    else {
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
      peer.restart = restart
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

  //if the introducer server restarts, rejoin swarms
  on_peer_restart (other, restart) {
    var p = this.peers[other.id]
    if(p && p.introducer) {
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

  on_pong (msg, addr, _port, ts) {
    // XXX notify if this is a new peer message.
    // (sometimes we ping a peer, and their response is first contact)
    if (!msg.port) throw new Error('pong: missing port')

    // NOTIFY new peers here.
    const isNew = this.__set_peer(msg.id, addr.address, addr.port, msg.nat, _port, msg.restart || null, ts)
    const peer = this.peers[msg.id]
    peer.pong = { ts, address: msg.address, port: msg.port }
    checkNat(this)
    if (isNew) this.emit('peer', this.peers[msg.id])
    if (isNew && this.on_peer) this.on_peer(this.peers[msg.id])
    this.emit('pong', this.peers[msg.id])
  }

}