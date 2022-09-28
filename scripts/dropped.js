
module.exports = (peer, other, packets, delay) => {
  //NOTE, this is jsut a quick script, do not run this against multiple peers at the same time.
  //it doesn't clean up after itself (yet, maybe will build it into diagnostic tool?)

  var c = 0, r =0, sum = 0, sum2 = 0, recv = {}
  var _msg_pong = peer.msg_ping
  var data = {ratio: 0, sent:0, recv:0, mean: 0, sqsum:0, stdev:0}
  peer.msg_pong = (msg, addr, port, ts) => {
    _msg_pong.call(peer, msg, addr, port, ts)
    if(msg.ts && msg.id === other.id) {
      recv[msg.ts] = (Date.now() - msg.ts)
      data.recv = data.sum = data.sqsum = 0
      for(var k in recv) {
        data.sum += recv[k]
        data.sqsum += Math.pow(recv[k], 2)
        if(recv[k]) data.recv++
      }
      data.ratio = data.recv / data.sent
      data.mean = data.sum / data.recv
      data.stdev = Math.sqrt(data.sqsum / (data.recv*data.recv))

    }
  }
  var int = setInterval(function () {
    var ts = Date.now()
    recv[ts] = 0
    peer.send({
      type: 'ping', id: peer.id, nat: peer.nat, restart: peer.restart, ts
    }, other, other.outport)
    if(data.sent++ > packets) clearTimeout(int)
  }, delay)

  return data

  setInterval(function () {
    console.log(c, r, Math.round((100*r)/c), sum/r, Math.sqrt(sum2/(r*r)))
  }, 1000)

}