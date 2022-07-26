var dgram = require('dgram')
var debug = process.env.DEBUG ? function (...args) { console.log(...args) } : function () {}

function isString (s) {
  return 'string' === typeof s
}
function isFunction (f) {
  return 'function' === typeof f
}

var json = {
  encode: (obj) => Buffer.from(JSON.stringify(obj)),
  decode: (buf) => JSON.parse(buf.toString())

}
function wrap (peer, ports, codec=json) {
  var bound = {}

  peer.send = (msg, addr, from_port) => {
    debug('send', msg, addr)
    bind(from_port).send(codec.encode(msg), addr.port, addr.address)
  }

  peer.timer = (delay, repeat, fn) => {
    if(!delay) {
      fn()
      if(repeat) setInterval(fn, repeat)
    }
    else
      setTimeout(function () {
        fn()
        if(repeat) setInterval(fn, repeat)
      }, delay)
  }

  function onMessage (msg, addr, port) {
    debug('recv', msg)
    if(isString(obj.type) && isFunction(peer['on_'+obj.type]))
      peer['on_'+obj.type](obj, addr, port)
  }

  //support binding anynumber of ports on demand (necessary for birthday paradox connection)
  function bind(p) {
    if(bound[p]) return bound[p]
    return bound[p] = dgram
      .createSocket('udp4')
      .bind(p)
      .on('message', (data, addr) => {
        onMessage(codec.decode(data), addr, p)
      })
      .on('error', (err) => {
        if(err.code === 'EACCES')
          console.log("could not bind port:"+err.port)
      })
  }

  if(peer.init) peer.init()

  if(ports) ports.forEach(bind)
}

module.exports = wrap