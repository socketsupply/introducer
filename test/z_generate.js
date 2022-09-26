var inspect = require('util').inspect

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

**/


var MT = require('rng').MT
var mt = new MT(7)
function random () {
  return mt.random()
}
Math.random = random
var {Node, Network} = require('@socketsupply/netsim/base')(random)

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


//console.log(peers)
//console.log(network)

function test_eventual_consistency (peers) {
  var p = first(peers)

  p.handlers[swarm].update('hello', 100)
  try {
    network.iterateUntil(2000)
  } catch (err) {
    console.log(inspect(peers, {depth: 5, colors: true}))
    return {data, result: false, error: err}
  }
  var data = {}
  for(var k in peers)
    data[k] = peers[k].handlers[swarm].data
//  console.log(data)
  for(var k in data) {
    if(k != p.id) {
      if(!deepEqual(data[k], data[p.id]))
        return {data, result: false}
    }
  }
  return {data, result: true}
}
var fail = 0
if(+process.env.SEED) {
    mt = new MT(+process.env.SEED)
    var network = new Network()
    var {data, result, error} = test_eventual_consistency(generate(network, 2, swarm))
    console.log(result ? "PASS" : "FAIL", error)
    console.log(JSON.stringify(data, null, 2))
}
else {
  var results = {}
  for(var i = 0; i < 100; i++) {
    mt = new MT(i)
    var network = new Network()
    var {data, result, error} = test_eventual_consistency(generate(network, 2, swarm))
    var name = error ? error.message : result
    ;(results[name] = results[name] || []).push(i)
    if(name != true)
      fail ++
//    console.log({seed: i, data, result, error})
  }
  console.log(results)
  if(fail) process.exit(fail)
}
