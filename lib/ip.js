exports.detectChange = function (fn, delay=5_000) {
  var addr = check()
  var ts = Date.now()
  setInterval(function () {
    var _addr = addr
    addr = check()
    var _ts = Date.now()
    var elapsed = _ts - ts
    if(addr != _addr) {
      fn(addr, _addr, elapsed)
    }
    else if  (_ts <= ts + delay*1.5) {
      var _addr = addr
      addr = check()
      var elapsed = _ts - ts
      ts = _ts
      fn(addr, _addr, elapsed)
    }
  }, delay).unref()

}

if(!module.parent) {
  setInterval(()=>{}, 1000)
  exports.detectChange(function (addr) {
    console.log('addr', addr)

  })
}
