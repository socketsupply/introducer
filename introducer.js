const { isId, debug } = require('./util')
const PingPeer = require('./pings')
const Peer = require('./')
const EventEmitter = require('events')
function cmpRand () {
  return Math.random() - 0.5
}

/**
  * this file runs on a publically addressable peer. AKA a server.
  * for simplicity, to focus on the core problem of creating p2p communication
  * I stripped out everything that was not strictly necessary, such as the DHT
  * That will come back later.
  *
  * Two instances of this file must run on separate public servers.
  * peers ping them to check what sort of nat they have.
  * also, peers can ask the introducer to connect them to peers.
  * (either by connecting them directly to particular peers,
  *  or to random peers in a particular swarm)
  */

const port = 3456

//can't depend on ./pings.js because that expects an introducer
module.exports = class Introducer extends Peer {
  constructor ({ id, keepalive, port }) {
    super({id, keepalive, port})

    this.nat = 'static'
//    this.swarms = {}
//    this.restart = Date.now()
//    this.keepalive = keepalive
    this.connections = {}
  }

  init () {}

}
