function isIp (s) {
  return typeof s === 'string' && s.split('.').every(e => +e === (+e & 0xff))
}

function isPort (p) {
  return 0 < p && p <= 65535
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
  return p && (p.address && p.id && p.nat) && (
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

const INACTIVE=1.5
const MISSING=3
const FORGET=5
function calcPeerState (peer, ts, keepalive) {
//  console.log((ts - peer.recv)/1000, keepalive/1000)
  if((ts - peer.recv) > keepalive*FORGET) return 'forget'
  if((ts - peer.recv) > keepalive*MISSING) return 'missing'
  if((ts - peer.recv) > keepalive*INACTIVE) return 'inactive'
  return 'active'
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
  isConnect,

  calcPeerState
}
