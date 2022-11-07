'use strict'
const { isId, isIp, isAddr, isPeer, debug, isConnect } = require('./util')
const constants = require('./lib/constants')()
const PingPeer = require('./pings')

//function assertAddr (addr, message) {
//  if (!isAddr(addr)) throw new Error('must be valid addr {address, port} object:' + message)
//}

//function isFunction (f) {
//  return typeof f === 'function'
//}

function assertTs (ts) {
  if (typeof ts !== 'number') throw new Error('ts must be provided')
}

// const port = 3456

function random_port (ports) {
  let i = 0
  do { var p = 1 + ~~(Math.random() * 0xffff); i++ } while (ports[p])
  ports[p] = true
  return p
}

module.exports = class Peer extends PingPeer {
  constructor (opts) {
    super(opts)
    const { introducer1, introducer2 } = opts
    this.swarms = {}

    function set (p) {
      this.__set_peer(p.id, p.address, p.port, 'static', null, 0, 0, true)
    }
    if (introducer1) {
      this.introducer1 = introducer1.id
      set.call(this, introducer1)
      if (introducer2) {
        set.call(this, introducer2)
      }
    }
  }

  log (action, msg, ts) {
    console.log({
      id: this.id,
      address: this.publicAddress,
      nat: this.nat,
      ts,
      action,
      msg
    })
  }

  local (id, intro) {
    // check if we do not have the local address, this messages is relayed, it could cause a crash at other end
    if (!isIp(this.localAddress)) // should never happen, but a peer could send anything.
    { return debug(1, 'cannot connect local because missing localAddress!') }
    const peer = intro || this.peers[this.introducer1]
    this.send({
      type: 'relay',
      target: id,
      content: {
        type: 'local', id: this.id, address: this.localAddress, port: this.localPort
      }
    }, peer, peer.outport)
  }

  msg_local (msg, _addr, _port, ts) {
    if (!isAddr(msg)) // should never happen, but a peer could send anything.
    { return debug(1, 'local connect msg is invalid!', msg) }
    this.ping3(msg.id, msg, ts)
  }

  // we received connect request, ping the target 3 itmes
  msg_connect (msg, _addr, _port, ts) {
    if(!isConnect(msg)) return debug(1, 'invalid connect message:'+JSON.stringify(msg))
    assertTs(ts)
    if (!ts) throw new Error('ts must not be zero:' + ts)
    /// XXX TODO check if we are already connected or connecting to this peer, and if so let that continue...

    if (!isAddr(msg)) // should never happen, but a peer could send anything.
    { return debug(1, 'connect msg is invalid!', msg) }

//    if(!msg.peers) throw new Error('missing peers')

    let swarm
    // note: ping3 checks if we are already communicating
    const ap = msg.address + ':' + msg.port
    if (isId(msg.swarm)) {
      swarm = this.swarms[msg.swarm] = this.swarms[msg.swarm] || {}
      swarm[msg.target] = -ts
      if(msg.peers != undefined)
        swarm._peers = msg.peers
      //we have learnt about a new peer, but we havn't connected to them yet.
      //keep it in the peers table, but do not notify on_peer until a message is received from that peer directly
      //(probably a ping or a pong)

      this.__set_peer(msg.target, msg.address, msg.port, msg.nat, this.localPort, null, ts)
    }

    // if we already know this peer, but the address has changed,
    // reset the connection to them...
    const peer = this.peers[msg.target]
    //XXX: because of recent changes, the peer should *always* be known now.
    //so need a different way to decide if we are still connected.
    
    if (peer && peer.sent && peer.recv) {
      if (peer.address != msg.address) {
        //if the peer has moved, update it's address, port, nat
        //reset pong, notified. when reconnecting to this peer on the new address it will trigger on_peer
        peer.address = msg.address
        peer.port = msg.port
        peer.nat = msg.nat
        peer.pong = null
        peer.notified = false
        //XXX falls though
      } else if (peer.connecting && ts - peer.sent < constants.connecting) {
        // if we are already connecting do nothing.
        this.log('connect.already_connected', msg, ts)
        return
      } else if (peer.pong && ts - Math.max(peer.recv, peer.sent) < constants.keepalive) {
        
        this.log('connect.check_connection', msg, ts)
        this.ping3(peer.id, peer, ts)
        return
      }
      // if we didn't hear response maybe the peer is down, so try connect again?
    }

    if(peer)
      this.timer(constants.connecting, 0, (ts) => {
        if(peer.connecting === msg) {
          peer.connecting = null
          this.log('connect.failed', msg, ts)
        }
      })

    if (msg.address === this.publicAddress) {
      // if the dest has the same public ip as we do, it must be on the same nat.
      // since NAT hairpinning is usually not supported, we should request a direct connection.
      // implement this by sending another message requesting a local introduction.
      // of course, this is pretty absurd, to require internet connectivity just to make a local connection!
      // unfortunately, the app stores are strongly against local multicast
      // however, in the future we can have a real local experience here using bluetooth.
      debug(1, 'local peer', this.localAddress + '->' + msg.address)
      this.log('connect.local', msg)
      this.local(msg.target, this.peers[msg.id])
      return
    }

    if(peer && peer.connecting)
      return

    // check nat types:
    // if both peers are easy, just tell each to connect to the other
    // if one is easy, one hard, birthday paradox connection
    // if both are hard, choose an easy peer to be relay, the two peers bdp to the easy peer.
    //    then relay their messages through that peer
    //    OR just error, and expect apps to handle case where not every pair can communicate
    //    OR let the peers decide who can replay, maybe they already have a mutual peer?
    if (msg.nat === 'static') {
      this.log('connect.static', msg, ts)
      if(peer)
        peer.connecting = msg
      this.ping3(msg.target, msg, ts)
    } else if (this.nat === 'easy') {
      // if nat is missing, guess that it's easy nat, or a server.
      // we should generally know our own nat by now.
      if (msg.nat === 'easy' || msg.nat == null) {
        // we are both easy, just do ping3
        this.log('connect.easy', msg, ts)
        this.ping3(msg.target, msg, ts)
      } else if (msg.nat === 'hard') {
        // we are easy, they are hard
        var short_id = msg.target.substring(0, 8)
        debug(1, 'BDP easy->hard', short_id, ap)
        var i = 0; const start = Date.now(); var ts = start
        var ports = {}
        //the connecting state is stored as the connect message it self.
        //this way the logger knows where the decision to connect came from.

        peer.connecting = msg
        this.log('connect.easyhard', msg, ts)
        this.timer(0, 10, (_ts) => {
          if (Date.now() - 1000 > ts) {
            debug(1, 'packets', i, short_id)
            ts = Date.now()
          }

          // send messages until we receive a message from them. giveup after sending 1000 packets.
          // 50% of the time 250 messages should be enough.
          const s = Math.round((Date.now() - start) / 100) / 10
          if (i++ > 2000) {
            debug(1, 'connection failed:', i, s, short_id, ap)
            //note, successfull connections are now logged via msg_ping and msg_pong
            peer.connecting = null
            return false
          } else if (this.peers[msg.target] && this.peers[msg.target].pong) {
            debug(1, 'connected:', i, s, short_id, ap)
            peer.connecting = null
            return false
          }
          peer.sent = _ts
          this.send({ type: 'ping', id: this.id, nat: this.nat, restart: this.restart }, {
            address: msg.address, port: random_port(ports)
          }, this.localPort)
        })
      }
    } else if (this.nat === 'hard') {
      if (msg.nat === 'easy') {
        //bug: if peer is hardeasy it sets "connecting" but never unsets it.
        //the nat could change later! (for example, joins a wifi)
        peer.connecting = true
        debug(1, 'BDP hard->easy', short_id)
        // we are the hard side, open 256 random ports
        var ports = {}
        this.log('connect.hardeasy', msg, ts)
        for (var i = 0; i < 256; i++) {
          const p = random_port(ports)
          peer.sent = ts
          this.send({ type: 'ping', id: this.id, nat: this.nat, restart: this.restart }, msg, p)
        }
      } else if (msg.nat === 'hard') {
        // if we are both hard nats, we must implement tunneling
        // in that case, we ask both us and them to connect a shared easy nat.
        // then we could relay messages through it.
        this.log('connect.error', msg, ts)
        debug(1, 'cannot connect hard-hard nats', msg)
      } else {
        throw new Error('cannot connect to unknown nat:' + JSON.stringify(msg))
      }
    }

    this.emit('connect', msg)
  }

  // stuff needed as an introducer

  // rename: msg_relay - relay a msg to a targeted (by id) peer.
  // will forward anything. used for creating local (private network) connections.

  msg_relay (msg, addr) {
    const target = this.peers[msg.target]
    if (!target) { return debug(1, 'cannot relay message to unkown peer:' + msg.target.substring(0, 8)) }
    this.send(msg.content, target, target.outport || this.localPort)
  }

  connect (from_id, to_id, swarm, port, data) { // XXX remove port arg
    const from = this.peers[from_id]
    const to = this.peers[to_id]
    if(!isPeer(from)) throw new Error('cannot connect from undefined peer:'+from_id)
    if(!isPeer(to)) throw new Error('cannot connect to undefined peer:'+to_id)
    if ((port || from.outport) === undefined) throw new Error('port cannot be undefined')
    // if(!from.nat) throw new Error('cannot connect FROM unknown nat')
    // if(!to.nat) throw new Error('cannot connect TO unknown nat')
    // XXX id should ALWAYS be the id of the sender.
//    if(data) console.log(data)
    this.send({ type: 'connect', id: this.id, target: to.id, swarm: swarm, address: to.address, nat: to.nat, port: to.port, ...data }, from, port || from.outport)
  }

  // rename: this was "connect" but that required Introducer to be different to Peer.
  intro (id, swarm, intro) {
    this.send({ type: 'intro', id: this.id, nat: this.nat, target: id, swarm }, intro || this.peers[this.introducer1], this.localPort)
  }

  msg_intro (msg, addr, _port, ts) {
    const to_peer = this.peers[msg.target]
    const from_peer = this.peers[msg.id]
    if(msg.swarm) {
      this.swarms[msg.swarm] = this.swarms[msg.swarm] || {}
      this.swarms[msg.swarm][msg.id] = ts
    }
    if (to_peer && from_peer) {
      // tell the target peer to connect, and also tell the source peer the addr/port to connect to.

      this.log('intro', msg, ts)
      this.connect(msg.target, msg.id, msg.swarm, null, {ts})
      this.connect(msg.id, msg.target, msg.swarm, null, {ts})
    } else {
      // respond with an error
      this.log('intro.error', msg, ts)
      this.send({ type: 'error', target: msg.target, swarm: msg.swarm, id: this.id, call: 'intro'}, addr, port)
    }
  }
}
