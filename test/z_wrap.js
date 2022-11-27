const udp = require('dgram')
const { EventEmitter } = require('events')
const os = require('os')
const wrap = require('../wrap')(udp, os, Buffer)

var s_port = 1234
var c_port = 1235

wrap(new class extends EventEmitter {
  init () {}
  on_msg (msg, addr, port, ts) {
    if('number' !== typeof ts)
      throw new Error('expected ts')
    this.send({ type: 'pong', addr }, addr, port)
  }
//  on_msg (msg, addr, port, ts) {
//    if(msg.type == 'ping')
//      this.on_ping(
//  }
}, [s_port])

var client = new class extends EventEmitter {
  on_msg () {
    console.log('PONG')
    done()
  }
}

wrap(client, [c_port])
client.send({ type: 'ping' }, { address: '127.0.0.1', port: s_port }, c_port)

var D = 2
var count = 0, _ts = Date.now()
client.timer(100, 200, function (ts) {
  if(ts < _ts) throw new Error('new ts should be greater')
  console.log('ts=', ts)
  _ts = ts
  if(count ++ >0) {
    done()
    return false
  }
})

function done () {
  if(--D) return
  process.exit(0)
}