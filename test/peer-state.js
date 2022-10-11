
var tape = require('tape')
var calcPeerState = require('../util').calcPeerState

//if recv is after sent, the peer has responded to us
//if sent is greater than recv,
//  either they havn't had time to respond yet
//  or they are not responding
function rn (recv, diff=-1000) {
  return {recv, sent: recv+diff}
}

var ttl = 29_000
tape('peer state, response', function (t) {
  var ts = Date.now(), _ts = ts - 1000

  //last activity is now, active peer

  t.equal(calcPeerState(rn(ts), ts, ttl), 'active') 
  t.equal(calcPeerState(rn(ts - 5_000), ts, ttl), 'active') 
  t.equal(calcPeerState(rn(ts - 20_000), ts, ttl), 'active') 

  t.equal(calcPeerState(rn(ts - ttl*1.4), ts, ttl), 'active') 
  t.equal(calcPeerState(rn(ts - ttl*1.6),ts, ttl), 'inactive') 
  t.equal(calcPeerState(rn(ts - ttl*2.1), ts, ttl), 'inactive') 
  t.equal(calcPeerState(rn(ts - ttl*3), ts, ttl), 'inactive') 

  t.equal(calcPeerState(rn(ts - ttl*5.1), ts, ttl), 'forget') 

  t.end()
})

tape('peer state, no response', function (t) {
  var ts = Date.now()

function rn (sent) {
  return {recv:sent-1000, sent}
}
  //last activity is now, active peer
  //recv is a response to an earlier message
  t.equal(calcPeerState(rn(ts -  500), ts, ttl), 'waiting') 
  t.equal(calcPeerState(rn(ts -  999), ts, ttl), 'waiting') 
  t.equal(calcPeerState(rn(ts - 1000), ts, ttl), 'waiting') 
  t.equal(calcPeerState(rn(ts - 3000), ts, ttl), 'inactive') 
//  t.equal(calcPeerState(rn(ts - 5_000), ts, ttl), 'active') 
//  t.equal(calcPeerState(rn(ts - 20_000), ts, ttl), 'active') 

//  t.equal(calcPeerState(rn(ts - ttl*1.4), ts, ttl), 'active') 
//  t.equal(calcPeerState(rn(ts - ttl*1.6),ts, ttl), 'inactive') 
//  t.equal(calcPeerState(rn(ts - ttl*2.1), ts, ttl), 'inactive') 
//  t.equal(calcPeerState(rn(ts - ttl*3), ts, ttl), 'inactive') 

//  t.equal(calcPeerState(rn(ts - ttl*5.1), ts, ttl), 'forget') 

  t.end()
})


tape('peer state, no response 2', function (t) {
  t.equal(calcPeerState({recv: 9003, sent: 29_000}, 29_000*10, ttl), 'forget') 
  t.end()
})