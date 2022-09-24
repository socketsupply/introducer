const IP_RE = /^(192\.168\.|10\.0\.)/

module.exports = (os) => {
  function check () {
    let addr = null
    const ints = os.networkInterfaces()

    for (const name in ints) {
      if (name === 'lo') continue

      ints[name].forEach(iface => {
        const is15v4 = iface.family === 'IPv4' // node < 15
        const is18v4 = iface.family === 4 // node 18

        if (IP_RE.test(iface.address) && (is15v4 || is18v4)) {
          addr = iface.address
        }
      })
    }
    return addr
  }
  return check
}
