const createIP = require('./lib/ip')
const debug = process.env.DEBUG ? function (...args) { console.log(...args) } : function () {}

function isPort (p) {
  return p == p & 0xffff
}

function isString (s) {
  return typeof s === 'string'
}

function isFunction (f) {
  return typeof f === 'function'
}

const json = {
  encode: (obj) => Buffer.from(JSON.stringify(obj)),
  decode: (buf) => JSON.parse(buf.toString())
}

module.exports = (UDP, OS) => { 
  const IP = createIP(OS)
  return function wrap (peer, ports, codec = json) {
    const bound = {}

    peer.send = (msg, addr, from_port) => {
      debug('send', msg, addr)
      const sock = bind(from_port)
      if (addr === '255.255.255.255') sock.setBroadcast(true)
      sock.send(codec.encode(msg), addr.port, addr.address)
    }

    peer.timer = (delay, repeat, fn) => {
      function interval () {
        if (fn() === false) clearInterval(int)
      }
      if (!delay && fn() !== false && repeat) { setInterval(interval, repeat) } else {
        setTimeout(function interval () {
          if (fn() !== false && repeat) { const int = setInterval(interval, repeat) }
        }, delay)
      }
    }

    peer.localAddress = IP.check()

    function onMessage (msg, addr, port) {
      debug('recv', msg)
      if (isString(msg.type) && isFunction(peer['on_' + msg.type])) { peer['on_' + msg.type](msg, addr, port) }
    }

    // support binding anynumber of ports on demand (necessary for birthday paradox connection)
    function bind (p) {
      if (!isPort(p)) { throw new Error('expected port, got:' + p) }
      if (bound[p]) return bound[p]
      debug('bind', p)
      return bound[p] = UDP
        .createSocket('udp4')
        .bind(p)
        // .on('listening', function () { this.setBroadcast(true) })
        .on('message', (data, addr) => {
          onMessage(codec.decode(data), addr, p)
        })
        .on('error', (err) => {
          if (err.code === 'EACCES') {
            console.log('could not bind port:' + err.port)
          }
        })
    }

    if (peer.init) peer.init()
    if (ports) ports.forEach(bind)
}

}
