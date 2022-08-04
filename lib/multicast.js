var UDP = require('dgram')

module.exports = function (port=6543, create, fn) { 
  var sock = UDP.createSocket('udp4')
  var mcast = {}
  sock.bind(port)
  sock.on('listening', function () {
    sock.setBroadcast(true)
  })
  function bcast () {
    sock.send(create(), port, '255.255.255.255')
  }
  sock.on('message', function (m, addr) {
    //var data = JSON.parse(m.toString())
    fn(m, addr)
//    if(data.id === config.id) return //our own message
    if(!mcast[addr.address]) {
      bcast()
    }
    mcast[addr.address] = Date.now()
  })
  setTimeout(bcast, 1000)
  setInterval(bcast, 300_000).unref()

}