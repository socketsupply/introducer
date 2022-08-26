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

const port = 3456

function random_port (ports) {
  let i = 0
  do { var p = 1 + ~~(Math.random() * 0xffff); i++ } while (ports[p])
  ports[p] = true
  return p
}

module.exports = class Peer extends PingPeer {
  constructor (opts) {
    super(opts)
    this.swarms = {}
  }

  connect (id, swarm, intro) {
    this.send({ type: 'connect', id: this.id, nat: this.nat, target: id, swarm}, intro || this.peers[this.introducer1], port)
  }

  join (swarm_id, intro) {
    if (!isId(swarm_id)) throw new Error('swarm_id must be a valid id')
    this.send({ type: 'join', id: this.id, swarm: swarm_id, nat: this.nat }, intro || this.peers[this.introducer1], port)
  }

  local (id, intro) {
    //check if we do not have the local address, this messages is relayed, it could cause a crash at other end
    if(!isIp(this.localAddress)) //should never happen, but a peer could send anything.
      return debug(1, 'cannot connect local because missing localAddress!')
    this.send({type: 'relay', target: id, content: {
      type:'local', id: this.id, address: this.localAddress, port
    }}, intro || this.peers[this.introducer1], port)
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
