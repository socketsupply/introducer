const createIP = require('./lib/ip')
const {debug} = require('./util')

function isPort (p) {
  return p == p & 0xffff
}

function isString (s) {
  return typeof s === 'string'
}

function isFunction (f) {
  return typeof f === 'function'
}

function toAddress (a) {
  return a.address+':'+a.port
}

module.exports = (UDP, OS, Buffer) => {
  const IP = createIP(OS)

  const json = {
    encode: (obj) => Buffer.from(JSON.stringify(obj)),
    decode: (buf) => JSON.parse(Buffer.from(buf).toString())
  }

  return function wrap (peer, ports, codec = json) {
    const bound = {}


    peer._localAddress = peer.localAddress = IP()
    peer.send = (msg, addr, from_port) => {
      debug(2, 'send', msg, from_port+'->'+toAddress(addr))
      peer.emit('send', msg, addr, from_port)
      const sock = maybe_bind(from_port)
      //if (addr === '255.255.255.255') sock.setBroadcast(true)
      if(from_port === undefined) throw new Error('source port is not defined!')
      sock.send(codec.encode(msg), addr.port, addr.address)
    }

    peer.timer = (delay, repeat, fn) => {
      let int

      function interval () {
        if (fn(Date.now()) === false) clearInterval(int)
      }

      if (!delay && fn(Date.now()) !== false && repeat) {
        int = setInterval(interval, repeat)
      }
      else {
        setTimeout(function () {
          if (fn(Date.now()) !== false && repeat) {
            int = setInterval(interval, repeat)
          }
        }, delay)
      }
    }

    //TODO make way to trigger this check
    peer.timer(1000, 1000, function () {
      peer.localAddress = IP()
    })

    function onMessage (msg, addr, port, ts) {
      debug(2, 'recv', msg, toAddress(addr)+'->'+port, ts)
      peer.emit('recv', msg, addr, port, ts)
      if (isString(msg.type) && isFunction(peer['on_' + msg.type])) {
        peer['on_' + msg.type](msg, addr, port, ts)
      }
    }

    // support binding anynumber of ports on demand (necessary for birthday paradox connection)
    function bind (p, must_bind) {
      debug(2, 'bind', p, must_bind)
      peer.emit('bind', p)

      return bound[p] = bound[p] || UDP
        .createSocket('udp4')
        .bind(p)
        .on('listening', () => {
          peer.emit('listening', p)
          // this.setBroadcast(true)
        })
        .on('message', (data, addr) => {
          let msg
          try {
            msg = codec.decode(data)
          } catch (err) {
            console.error(err)
            console.error('while parsing:', data)
            return
          }
          onMessage(msg, addr, p, Date.now())
        })
        .on('error', (err) => {
          if ((err.code === 'EACCES' || err.code === 'EADDRINUSE')) {
            if(must_bind) throw err
            if(process.env.DEBUG)
              console.error('could not bind port:' + err.port)
          }
          else
            peer.emit('error', err)
        })
    }

    function maybe_bind (p, must_bind = false) {
      if (!isPort(p)) { throw new Error('expected port, got:' + p) }
      if (bound[p]) return bound[p]
      return bind(p, must_bind)
    }

    if (ports) ports.filter(Boolean).forEach(p => maybe_bind(p, true))
    if (peer.init) peer.init(Date.now())
  }
}
