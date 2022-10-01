
var {randomize, seedRandom, generate, createId} = require('./util-randomized')
var inspect = require('util').inspect
var minimist = require('minimist')

var Swarms = require('../swarms')
//var Reliable = require('../swarm/reliable')
//var deepEqual = require('deep-equal')

function first (obj) {
  for(var k in obj)
    return obj[k]
}

function firstKey(obj) {
  for(var k in obj)
    return k
}

function get_data(peers, swarm) {
  var data = {}  
  if(!swarm) throw new Error('missing swarm')
  for(var k in peers)
    data[k] = peers[k].handlers[swarm].data
  return data
}

function assert_swarm_connected (peers) {
  var hops = {}
  ;(function recurse (p, count) {
    //console.log(p)
    hops[p.id] = count
    for(var k in p.peers) {
      if(!p.peers[k].introducer) { 
        var _p = peers[k]
        if(!_p) throw new Error('missing:'+k)
        if(!hops[k]) {
          //console.log(k, _p)
          recurse(_p, count+1)
        }
      }
    }
  })(first(peers), 1)
  //console.log(hops)
  for(var k in peers)
    if(!hops[k])
      return {data: hops, result: false}
//throw new Error('peer:'+k+' failed to join swarm')
  return {data: hops, result: true}
}

function test_connected_network (network, opts) {
  var swarm = createId()

  var peers = generate(network, opts.peers || 10, (id, intros) => {
    var p = new Swarms({id, ...intros})
    p.on_nat = function () { p.join(swarm) }
    return p
  })

//  var p = first(peers)
//  p.handlers[swarm].update('hello', 100)

  try {
    network.iterateUntil(opts.until || 2000)
  } catch (err) {
    console.log(inspect(peers, {depth: 5, colors: true}))
    return assert_swarm_connected(peers) //{data: get_data(peers, swarm), result: false, error: err}
  }

  return assert_swarm_connected(peers)
}

var opts = minimist(process.argv.slice(2))
randomize(test_connected_network, opts)
