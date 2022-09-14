function isIp (s) {
  return typeof s === 'string' && s.split('.').every(e => +e === +e && 0xff)
}

function isPort (p) {
  return p === p & 0xffff
}

function isAddr (a) {
  return typeof a === 'object' && a && isIp(a.address) && isPort(a.port)
}

function isId (id) {
  return /^[0-9a-fA-F]{64}$/.exec(id)
}

function isNat (nat) {
  return (nat === 'static' || nat === 'easy' || nat === 'hard' || nat === 'unknown')
}

function fromAddress (s) {
  return s.address + ':' + s.port
}

function toAddress (s) {
  const [address, port] = s.split(':')
  return { address, port: +port }
}

// check that object
function isPeer (p) {
  return (p.address && p.id && p.nat) && (
    isIp(p.address) && isPort(p.port) && isNat(p.nat) && isId(p.id)
  )
}

const LEVEL = +process.env.DEBUG | 0
const debug = LEVEL === 0
  ? () => {}
  : function debug (level, ...args) {
    if (level <= LEVEL) console.log(...args)
  }

module.exports = {
  isIp,
  isPort,
  isAddr,
  isId,
  isNat,
  fromAddress,
  toAddress,
  isPeer,
  debug
}
