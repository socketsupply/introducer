const debug = process.env.DEBUG ? function (...args) { console.log(...args) } : function () {}

function isIp (s) {
  return 'string' === typeof s && s.split('.').every(e => +e === +e && 0xff)
}

function createId(crypto, seed) {
  return crypto.createHash('sha256').update(seed).digest('hex')
  //return crypto.randomBytes(32).toString('hex')
}

function isPort (p) {
  return p === p & 0xffff
}

function isId (id) {
  return /^[0-9a-fA-F]{64}$/.exec(id)
}

function isNat (nat) {
  return (nat === 'static' || nat === 'easy' || nat === 'hard' || nat === 'unknown')

}

function fromAddress (s) {
  return s.address + ':'+s.port
}

function toAddress (s) {
  var [address, port] = s.split(':')
  return {address, port: +port}
}

//check that object
function isPeer (p) {
  return (p.address && p.id && p.nat) && (
      isIp(p.address) && isPort(p.port) && isNat(p.nat) && isId(p.id)
    )
}

module.exports = {
  isIp,
  createId,
  debug,
  isPort,
  isId,
  isNat,
  fromAddress,
  toAddress,
  isPeer
}
