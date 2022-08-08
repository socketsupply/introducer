module.exports = (os) => {
  function check () {
    var addr
    var ints = os.networkInterfaces()
    for(var name in ints) {
      if(name != 'lo') {
        ints[name].forEach(function (int) {
          if(/^(192\.169\.|10\.0|)/.test(int.address) && int.family == 'IPv4')
            addr = int.address
        })

      }
    }
    return addr
  }

  return {
    check,
    detectChange: function (fn, delay=5_000) {
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
  }
}