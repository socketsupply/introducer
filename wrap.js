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

function toAddress (a) {
  return a.address+':'+a.port
}

module.exports = (UDP, OS) => { 
  const IP = createIP(OS)
  return function wrap (peer, ports, codec = json) {
    const bound = {}

    peer.send = (msg, addr, from_port) => {
      debug('send', msg, from_port+'->'+toAddress(addr))
      const sock = maybe_bind(from_port)
      //if (addr === '255.255.255.255') sock.setBroadcast(true)
      if(from_port === undefined) throw new Error('source port is not defined!')
      sock.send(codec.encode(msg), addr.port, addr.address)
    }

    peer.timer = (delay, repeat, fn) => {
      let int

      function interval () {
        if (fn() === false) clearInterval(int)
      }

      if (!delay && fn() !== false && repeat) {
        int = setInterval(interval, repeat)
      }
      else {
        setTimeout(function () {
          if (fn() !== false && repeat) {
            int = setInterval(interval, repeat)
          }
        }, delay)
      }
    }

    peer.localAddress = IP.check()

    function onMessage (msg, addr, port) {
      debug('recv', msg, toAddress(addr)+'->'+port)
      if (isString(msg.type) && isFunction(peer['on_' + msg.type])) { peer['on_' + msg.type](msg, addr, port) }
    }

    // support binding anynumber of ports on demand (necessary for birthday paradox connection)
    function bind (p) {
      debug('bind', p)
      return bound[p] = UDP
        .createSocket('udp4')
        .bind(p)
        // .on('listening', function () { this.setBroadcast(true) })
        .on('message', (data, addr) => {
          onMessage(codec.decode(data), addr, p)
        })
        .on('error', (err) => {
          if (err.code === 'EACCES' && process.env.DEBUG) {
            console.error('could not bind port:' + err.port)
          }
        })
    }

    function maybe_bind (p) {
      if (!isPort(p)) { throw new Error('expected port, got:' + p) }
      if (bound[p]) return bound[p]
      return bind(p)
    }

    if (peer.init) peer.init()
    if (ports) ports.forEach(maybe_bind)
  }
}
