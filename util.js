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


// function toAddress (s) {
//   const [address, port] = s.split(':')
//   return { address, port: +port }
// }


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

function isNull(n) {
  return null == n
}

function isPing (p) {
  return (
    p.type === 'ping' &&
    isId(p.id)        &&
    (isNull(p.spinPort) || isPort(p.spinPort)) &&
    (isNull(p.nat) || isNat(p.nat))
  )
}

function isPong (p) {
  return (
    p.type === 'pong' &&
    isId(p.id)        &&
    (isNull(p.nat) || isNat(p.nat)) &&
    isAddr(p)
  )
}

function isConnect (p) {
  return (
    p.type === 'connect' &&
    isPeer(p)
  )
}

module.exports = {
  isIp,
  isPort,
  isAddr,
  isId,
  isNat,
  fromAddress,
//  toAddress,
  isPeer,
  debug,

  isPing,
  isPong,
  isConnect
}
