
var {randomize, seedRandom, generate, createId} = require('./util-randomized')
//var {Node} = require('@socketsupply/netsim/base')()

/**

GENERATED RANDOM TESTING SCRIPT

with this script we run tests many times with deterministic random event ordering

In a distributed system, the order of packet delivery, and even wether or not they arrive,
is not predictable. So to make a reliable system, we must ensure that the system still works
under all possible orders.

Exaustively searching all possible orders would be more efficient, but complex.
But it's very simple to just randomly sample the space of possible orderings.

Run each test many times, with ordering randomized, but deterministic seed.
Then, collect failures by seed, and allow rerunning single tests with particular seed for debugging.

to run all tests:
```
> node generate.js
```
will produce output like this:
```
{
  [result]:[seeds...]
}
```
`result` is either `true`, `false` or an error message.

to rerun a tests with seed 7, 

```
> SEED=7 node generate.js

```

test:
  peers that come on line and offline (but stay active)
  peers that restart
  dropped packets
  peers that change network

**/

var inspect = require('util').inspect
//var {randomize} = require('./util')
var minimist = require('minimist')

var Swarms = require('../swarms')
var Reliable = require('../swarm/reliable')
var deepEqual = require('deep-equal')
//generate a swarm.
//any number of peers.
//then peers emit messages
//check that every message is eventually received by all other peers.

//for simplicity, peers join once then everything happens

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

function assert_data_equal (peers, swarm) {
  var p = first(peers)
//  if(!swarm) swarm = firstKey(p.swarms)
  var data = get_data(peers, swarm)
  for(var k in data) {
    if(k != p.id) {
      if(!deepEqual(data[k], data[p.id]))
        return {data, result: false}
    }
  }

  return {data, result: true}
}

function test_eventual_consistency (network, opts) {
  var swarm = createId()

  var peers = generate(network, opts.peers || 10, (id, intros) => {
    var p = new Swarms({id, ...intros})
    p.createModel(swarm, new Reliable())
    return p
  })

  var p = first(peers)
  p.handlers[swarm].update('hello', 100)

  try {
    network.iterateUntil(opts.until || 2000)
  } catch (err) {
    console.log(inspect(peers, {depth: 5, colors: true}))
    return {data: get_data(peers, swarm), result: false, error: err}
  }

  return assert_data_equal(peers, swarm)
}

module.exports = (opts) => randomize(test_eventual_consistency, opts)

if(!module.parent) module.exports(minimist(process.argv.slice(2)))
