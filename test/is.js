var tape = require('tape')

var {isPort, isIp} = require('../util')

tape('test utils', function (t) {
  t.equal(isIp('127.0.0.1'),true)
  t.equal(isIp('0.0.0.0'),true)
  t.equal(isIp('256.0.0.0'),false)
  t.equal(isIp('hello'),false)
  t.equal(isPort(1),true)
  t.equal(isPort(0),false)
  t.equal(isPort(65535),true)
  t.equal(isPort(65536),false)

  t.end()
})