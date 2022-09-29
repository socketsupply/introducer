var inspect = require('util').inspect
//var {randomize} = require('./util')
var minimist = require('minimist')

var MT = require('rng').MT
var mt = new MT(7)
function random () {
  return mt.random()
}
Math.random = random
var {Node, Network} = require('@socketsupply/netsim/base')(random)


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


var Swarms = require('../swarms')
var Reliable = require('../swarm/reliable')
var Introducer = require('../introducer')
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

function rand (i) {
  return Math.round(random()*i)
}

function createId () {
  var s = ''
  for(var i = 0; i < 64; i++)
    s += rand(0xf).toString(16)
  return s
}

function randomAddress () {
  return [rand(0xff), rand(0xff), rand(0xff), rand(0xff)].join('.')
}

function generatePeer (network, create) {
  network.add(randomAddress(), create(createId()))
}

function createIntros () {
  return {
    introducer1: {
      id: createId(),
      address: randomAddress(),
      port: 3456
    },
    introducer2: {
      id: createId(),
      address: randomAddress(),
      port: 3456
    }
  }
}
var swarm = createId()

function generate (network, N, swarm) {
  var peers = {}

  var intros = createIntros()
  for(var k in intros) {
    network.add(intros[k].address, new Node(new Introducer({id: intros[k].id})))
  }

  for(var i = 0; i < N; i++)
    generatePeer(network, (id) => {
      var p = new Swarms({id, ...intros})
      peers[id] = p
      p.createModel(swarm, new Reliable())
      return new Node(p)
    })

  return peers
}

function get_data(peers) {
  var data = {}  
  for(var k in peers)
    data[k] = peers[k].handlers[swarm].data
  return data
}

function assert_data_equal (peers, swarm) {
  var p = first(peers)
  if(!swarm) swarm = firstKey(p.swarms)
  var data = get_data(peers)
  for(var k in data) {
    if(k != p.id) {
      if(!deepEqual(data[k], data[p.id]))
        return {data, result: false}
    }
  }

  return {data, result: true}

}

//console.log(peers)
//console.log(network)

function test_eventual_consistency (network, peers) {
  var p = first(peers)

  p.handlers[swarm].update('hello', 100)
  try {
    network.iterateUntil(2000)
  } catch (err) {
    console.log(inspect(peers, {depth: 5, colors: true}))
    return {data: get_data(peers), result: false, error: err}
  }
  return assert_data_equal(peers)
}


function randomize (randomized_test, opts) {
  var fail = 0
  function run_test (seed) {
      mt = new MT(seed)
      var network = new Network()
      network.dropProb = opts.dropProb || 0
      return randomized_test(network, opts)
  }
  if(+opts.seed) {
      var {data, result, error} = run_test(+opts.seed)
      console.log(JSON.stringify(data, null, 2))
      console.log(result ? "PASS" : "FAIL", error)
  }
  else {
    var results = {}
    const runs = opts.runs || 100
    for(var i = 0; i < runs; i++) {
      var {data, result, error} = run_test(i)
      var name = error ? error.message : result
      ;(results[name] = results[name] || []).push(i)
      if(name != true)
        fail ++
    }
    console.log(results)
    if(fail) process.exit(fail)
  }

}

var opts = minimist(process.argv.slice(2))
randomize(
    (network) => test_eventual_consistency(network, generate(network, opts.peers || 10, swarm)),
    opts
  )
