var id = require('crypto').createHash('sha256').update('longevity test').digest('hex')
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
    for(var i = 0; i < 200; i++) {
      var port = random_port(ports)
      var delay = 5_000*i
      this.send({ type:'ping', id, ts, delay}, introducer2, port)
      console.log('delay:',delay, port)
    }
  }
  on_pong (msg, addr, port, ts) {
    console.log('recv', Math.round((ts - msg.ts)/100)/10, msg.delay/1000, port)
  }
}


if(!module.parent) {
  var Wrap = require('../wrap')(require('dgram'), require('os'), Buffer)
  var l = new Longevity()
  console.log(l)
  Wrap(l, [1234])
}