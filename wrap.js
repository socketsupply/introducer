var dgram = require('dgram')

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
    bind(from_port).send(codec.encode(msg), addr.port, addr.address)
  }

  function onMessage (msg, addr, port) {
    var obj = codec.decode(msg)
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

  if(ports) ports.forEach(bind)
}

module.exports = wrap