const udp = require('dgram')
const { EventEmitter } = require('events')
const os = require('os')
const wrap = require('../wrap')(udp, os, Buffer)

var s_port = 1234
var c_port = 1235

wrap(new class extends EventEmitter {
  init () {}
  on_ping (msg, addr, port) {
    this.send({ type: 'pong', addr }, addr, port)
  }
}, [s_port])

var client = new class extends EventEmitter {
  on_pong () {
    console.log('PONG')
    process.exit(0)
  }
}

wrap(client, [c_port])
client.send({ type: 'ping' }, { address: '127.0.0.1', port: s_port }, c_port)
