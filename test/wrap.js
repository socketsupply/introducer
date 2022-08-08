const wrap = require('../wrap')(require('dgram'), require('os'))

var s_port = 1234
var c_port = 1235

wrap({
  init: () => {},
  on_ping (msg, addr, port) {
    this.send({ type: 'pong', addr }, addr, port)
  }
}, [s_port])

var client = {
  on_pong () {
    console.log('PONG')
    process.exit(0)
  }
}

wrap(client, [c_port])
console.log(client)
client.send({ type: 'ping' }, { address: '127.0.0.1', port: s_port }, c_port)
