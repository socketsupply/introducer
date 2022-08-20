module.exports = (os) => {
  function check () {
    var addr
    var ints = os.networkInterfaces()
    for(var name in ints) {
      if(name != 'lo') {
        ints[name].forEach(function (int) {
          if(
            /^(192\.168\.|10\.0\.)/.test(int.address) &&
            (int.family == 'IPv4' || //node <15
             int.family == 4))       //node 18...
            addr = int.address
        })

      }
    }
    return addr
  }

  return check
}