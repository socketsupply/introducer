var id = require('crypto').randomBytes(32).toString('hex')
var EventEmitter = require('events')
var introducer2 = {
  id: 'aaecb3746ecec8f9b72eef221ccdd55da8c6fdccd54ba9a9839e8927a8750861',
  address: '13.211.129.58',
  port: 3456
}

function random_port (ports) {
  let i = 0
  do { var p = 1 + ~~(Math.random() * 0xffff); i++ } while (ports[p])
  ports[p] = true
  return p
}

class Longevity extends EventEmitter {

  constructor () {
    super()
    this.id = id
  }
  init (ts) {
    var ports = {}
    for(var i = 0; i < 180; i++) {
      var port = random_port(ports)
      var delay = 1_000*i || 1
      this.send({ type:'ping', id, ts, delay}, introducer2, port)
    }
  }
  on_pong (msg, addr, port, ts) {
    console.log('recv', Math.round((ts - msg.ts)/10)/100, msg.delay/1000, port)
  }
}

module.exports = Longevity

if(!module.parent) {
  var Wrap = require('../wrap')(require('dgram'), require('os'), Buffer)
  var l = new Longevity()
  console.log('# how long does the nat keep a port mapping open?')
  console.log('actual, requested, port')
  Wrap(l, [1234])
}