var {Node, Network} = require('@socketsupply/netsim')
var Swarms = require('../swarms')
var Reliable = require('../swarm/reliable')
var Introducer = require('../introducer')
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

var intros = {
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
var network = new Network()
var N = 3
var swarm = createId()
var peers = {}

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

console.log(peers)
console.log(network)
var p = first(peers)

p.handlers[swarm].update('hello', 100)
network.iterateUntil(1000)

var data = {}
for(var k in peers)
  data[k] = peers[k].handlers[swarm].data
console.log(data)