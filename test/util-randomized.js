var {Network, Node} = require('@socketsupply/netsim/base')()
var Introducer = require('../introducer')
//var {Node} = require('@socketsupply/netsim/base')()

function seedRandom () {
  var MT = require('rng').MT
  var mt = new MT(7)
  function random () {
    return mt.random()
  }
  Math.random = random
  return random
}
function rand (i) {
  return Math.round(Math.random()*i)
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

function generate (network, N, each) {
  var peers = {}

  var intros = createIntros()
  for(var k in intros) {
    network.add(intros[k].address, new Node(new Introducer({id: intros[k].id})))
  }

  for(var i = 0; i < N; i++)
    generatePeer(network, (id) => {
      return new Node(peers[id] = each (id, intros))
    })

  return peers
}

function randomize (randomized_test, opts) {
  var fail = 0
  function run_test (seed) {
      seedRandom(seed)
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

module.exports = {
  randomize, seedRandom,
  generate, generatePeer, createIntros, randomAddress, createId, rand
}