
var tape = require('tape')
var calcPeerState = require('../util').calcPeerState

var ttl = 29_000
tape('peer state', function (t) {
  var ts = Date.now()

  //last activity is now, active peer
  t.equal(calcPeerState({recv: ts }, ts, ttl), 'active') 
  t.equal(calcPeerState({recv: ts - 5_000}, ts, ttl), 'active') 
  t.equal(calcPeerState({recv: ts - 20_000}, ts, ttl), 'active') 

  t.equal(calcPeerState({recv: ts - ttl*1.4}, ts, ttl), 'active') 
  t.equal(calcPeerState({recv: ts - ttl*1.6}, ts, ttl), 'inactive') 
  t.equal(calcPeerState({recv: ts - ttl*2.1}, ts, ttl), 'inactive') 
  t.equal(calcPeerState({recv: ts - ttl*3}, ts, ttl), 'inactive') 

  t.equal(calcPeerState({recv: ts - ttl*5.1}, ts, ttl), 'forget') 

  t.end()
})