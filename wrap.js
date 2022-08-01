var dgram = require('dgram')
var debug = process.env.DEBUG ? function (...args) { console.log(...args) } : function () {}
function isPort (p) {
 return p == p & 0xffff
}
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
    function interval () {
      if(fn() === false) clearInterval(int)
    }
    if(!delay && fn() !== false && repeat)
      setInterval(interval, repeat)
    else
      setTimeout(function interval () {
        if(fn() !== false && repeat)
          var int = setInterval(interval, repeat)
      }, delay)
  }

  function onMessage (msg, addr, port) {
    debug('recv', msg)
    if(isString(msg.type) && isFunction(peer['on_'+msg.type]))
      peer['on_'+msg.type](msg, addr, port)
  }

  //support binding anynumber of ports on demand (necessary for birthday paradox connection)
  function bind(p) {
    if(!isPort(p))
      throw new Error('expected port, got:'+p) 
    if(bound[p]) return bound[p]
    debug('bind', p)
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