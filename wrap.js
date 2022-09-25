const createIP = require('./lib/ip')
const { debug } = require('./util')

function isPort (p) {
  return p === (p & 0xffff)
}

function isString (s) {
  return typeof s === 'string'
}

function isFunction (f) {
  return typeof f === 'function'
}

function toAddress (a) {
  return a.address + ':' + a.port
}

module.exports = (UDP, OS, Buffer) => {
  const IP = createIP(OS)

  const json = {
    encode: (obj) => Buffer.from(JSON.stringify(obj)),
    decode: (buf) => JSON.parse(Buffer.from(buf).toString())
  }

  //
  // The purpose of this function is to allow most of the program to be simulated.
  // It should be the only code that interacs with the actual network.
  //
  // @param {object} peer - an instance of the Swarms class.
  // @param {array} ports - an array of ports that should be connected at startup.
  // @param {object} codec - an object with encode and decode methods.
  //
  return function wrap (peer, ports, codec = json) {
    debug('wrap', peer, ports, codec)
    const bound = {}
    peer.localPort = ports[0]

    peer._localAddress = peer.localAddress = IP()
    peer.send = (msg, addr, from_port) => {
      if (from_port === undefined) throw new Error('source port is not defined!')
      const sock = maybe_bind(from_port) // or maybe: from_port || addr.output || main_port
      // if (addr === '255.255.255.255') sock.setBroadcast(true)
      peer.emit('send', msg, addr, from_port)
      debug('send', msg, from_port + '->' + toAddress(addr))
      sock.send(codec.encode(msg), addr.port, addr.address)
    }

    peer.timer = (delay, repeat, fn) => {
      let int

      function interval () {
        debug('timer interval called')
        if (fn(Date.now()) === false) clearInterval(int)
      }

      if (!delay && fn(Date.now()) !== false && repeat) {
        int = setInterval(interval, repeat)
      } else {
        setTimeout(function () {
          if (fn(Date.now()) !== false && repeat) {
            int = setInterval(interval, repeat)
          }
        }, delay)
      }
    }

    // TODO make way to trigger this check
    peer.timer(1000, 1000, function () {
      peer.localAddress = IP()
    })

    function recv (msg, addr, port, ts) {
      debug('recv', msg, toAddress(addr) + '->' + port, ts)
      peer.emit('recv', msg, addr, port, ts)
      if (isString(msg.type) && isFunction(peer['on_' + msg.type])) {
        peer['on_' + msg.type](msg, addr, port, ts)
      } else if (isFunction(peer.on_msg)) { peer.on_msg(msg, addr, port, ts) }
    }

    // support binding anynumber of ports on demand (necessary for birthday paradox connection)
    function bind (port, must_bind) {
      debug('bind', port, must_bind)
      peer.emit('bind', port)

      const socket = bound[port] = bound[port] || UDP
        .createSocket('udp4')
        .bind(port)
        .on('listening', () => {
          debug('listening', port)
          peer.emit('listening', port)
          // this.setBroadcast(true)
        })
        .on('message', (data, addr) => {
          let msg
          try {
            msg = codec.decode(data)
          } catch (err) {
            console.error('error while parsing data', err)
            console.error('unable to parse data', data)
            return
          }

          recv(msg, addr, port, Date.now())
        })
        .on('error', (err) => {
          debug('error', err)

          if ((err.code === 'EACCES' || err.code === 'EADDRINUSE')) {
            if (must_bind) throw err
            if (process.env.DEBUG) console.error('could not bind port:' + err.port)
            return
          }

          peer.emit('error', err)
        })

      return socket
    }

    // Return the already bound port or bound it and then return it
    function maybe_bind (port, must_bind = false) {
      if (!isPort(port)) { throw new Error('expected port, got:' + port) }
      if (bound[port]) return bound[port]
      return bind(port, must_bind)
    }

    if (ports) ports.filter(Boolean).forEach(p => maybe_bind(p, true))
    if (peer.init) peer.init(Date.now())
  }
}
