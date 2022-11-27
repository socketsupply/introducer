require('./deterministic')

//TODO: peers change ip addresses - done
//      iterate until timeout - done
//      peers reconnect after wakeup - done
//
//      connect, nat, timeouts (cancelled, not actually a problem)
//      resend old messages
//      don't overdo CPU - DONE. could return, don't try to connect too many times.
//      event emitter
//      relay
//      upnp
//
//      DHT
//      encryption

var test = require('tape')
var Chat = require('../swarms')
var Introducer = require('../introducer')

var join = require('../lib/join-logs')

const crypto = require('crypto')
const { EventEmitter } = require('events')

const { createId } = require('./util')

const { Node, Network, IndependentNat, IndependentFirewallNat, DependentNat } = require('@socketsupply/netsim')

const A = '1.1.1.1'
const B = '2.2.2.2'
const C = 'cc.cc.cc.cc'
const D = '42.4.4.4'
const E = '52.5.5.5'
const F = '62.5.5.5'

const d = '42.4.4.42'
const e = '52.5.5.52'
const f = '62.5.5.52'

const P = ':3489'

const ids = require('./util').genIds()

const intros = {
  introducer1: { id: ids.a, address: A, port: 3456 },
  introducer2: { id: ids.b, address: B, port: 3456 }
}

const swarm = createId('test swarm')

//chat broadcasts across the network

function dejoin (intro) {
  //disable join method, just for the tests
  intro.on_join = ()=>{}
  return intro
}

//three static peers join a swarm and broadcast updates

test('broadcast', function (t) {
  const network = new Network()
  let peerD, peerE
  network.add(A, new Node(dejoin(new Introducer({ id: ids.a }))))
  network.add(B, new Node(dejoin(new Introducer({ id: ids.b }))))

  network.add(D, new Node(peerD = new Chat({ id: ids.d, ...intros})))
  network.add(E, new Node(peerE = new Chat({ id: ids.e, ...intros})))
  network.add(F, new Node(peerF = new Chat({ id: ids.f, ...intros})))

  peerD.createModel(swarm)
  peerE.createModel(swarm)
  peerF.createModel(swarm)

  network.iterate(-1)

  t.equal(peerD.nat, 'static')
  t.equal(peerE.nat, 'static')
  t.equal(peerF.nat, 'static')

  peerD.on_change = peerE.on_change = peerF.on_change = () => {}

  var logs = []
  peerF.log = peerE.log = peerD.log = function (action, msg, ts) {
    logs.push({id: this.id, action, msg, ts})
  }

  peerD.intro(peerE.id, swarm)
  peerF.intro(peerE.id, swarm)

  network.iterate(-1)

  var ts = Date.now()
  peerD.handlers[swarm].chat({content: "hello!", swarm, ts}) //message should be broadcast across network.
  t.equal(peerD.data[swarm].length, 1)

  network.iterate(-1)

  t.ok(peerE.peers[peerD.id], 'peer E knows peer D')
  t.ok(peerD.peers[peerE.id], 'peer D knows peer E')
  t.ok(peerF.peers[peerE.id], 'peer F knows peer E')

  t.ok(peerD.swarms[swarm][peerE.id], 'peer D knows E is in swarm')
  t.ok(peerE.swarms[swarm][peerD.id], 'peer E knows D is in swarm')
  t.ok(peerE.swarms[swarm][peerF.id], 'peer E knows F is in swarm')
  t.ok(peerF.swarms[swarm][peerE.id], 'peer F knows E is in swarm')

  t.deepEqual(peerE.data[swarm], peerD.data[swarm], 'peers E and D have consistent data')
  t.deepEqual(peerF.data[swarm], peerD.data[swarm], 'peers F and D have consistent data')

  var joined = join(null, logs)

  function assert_connected (id, target) {
    var connections = joined[id].connections[target]
    t.ok(connections,
      `peer ${id.substring(0, 8)} has connected to peer ${target.substring(0, 8)}`
    )
    t.ok(Object.keys(connections).length,   '... at least once')
    for(var ts in connections)
      t.ok(connections[ts].connected, '...connection was successful')
  }

  assert_connected(peerE.id, peerD.id)
  assert_connected(peerD.id, peerE.id)

  assert_connected(peerE.id, peerF.id)
  assert_connected(peerF.id, peerE.id)

  t.end()
})

//return
function createNatPeer (network, id, address_nat, address, Nat) {
  const prefix = /^\d+\./.exec(address_nat)[1]
  const nat = new Nat(prefix)
  network.add(address_nat, nat)
  nat.add(address, new Node(peer = new Chat({ id, ...intros})))
  peer.createModel(swarm)
  return [peer, nat]
}

test('broadcast, easy nat', function (t) {
  const network = new Network()
  network.add(A, new Node(new Introducer({ id: ids.a })))
  network.add(B, new Node(new Introducer({ id: ids.b })))

  let [peerD] = createNatPeer(network, ids.d, D, d, IndependentFirewallNat)
  let [peerE] = createNatPeer(network, ids.e, E, e, IndependentFirewallNat)
  let [peerF] = createNatPeer(network, ids.f, F, f, IndependentFirewallNat)

  network.iterate(-1)

  t.equal(peerD.nat, 'easy')
  t.equal(peerE.nat, 'easy')
  t.equal(peerF.nat, 'easy')

  peerD.on_change = peerE.on_change = peerF.on_change = () => {}

  peerD.intro(peerE.id)
  peerF.intro(peerE.id)
  network.iterate(-1)

  var ts = Date.now()
  peerD.handlers[swarm].chat({content: "hello!", ts, swarm}) //message should be broadcast across network.
  t.equal(peerD.data[swarm].length, 1)

  network.iterate(-1)

  t.ok(peerE.peers[peerD.id], 'peer E knows peer D')
  t.ok(peerF.peers[peerE.id], 'peer F knows peer E')
  t.deepEqual(peerE.data, peerD.data)
  t.deepEqual(peerF.data, peerD.data)

  t.end()
})

test('broadcast, hard,easy,hard nat', function (t) {
  const network = new Network()
  network.add(A, new Node(new Introducer({ id: ids.a })))
  network.add(B, new Node(new Introducer({ id: ids.b })))

  let [peerD] = createNatPeer(network, ids.d, D, d, DependentNat)
  let [peerE] = createNatPeer(network, ids.e, E, e, IndependentFirewallNat)
  let [peerF] = createNatPeer(network, ids.f, F, f, DependentNat)

  network.iterate(-1)

  t.equal(peerD.nat, 'hard')
  t.equal(peerE.nat, 'easy')
  t.equal(peerF.nat, 'hard')

  peerD.on_change = peerE.on_change = peerF.on_change = () => {}

  while(!(peerD.peers[peerE.id] && peerF.peers[peerE.id])) {
    if(!peerD.peers[peerE.id])
      peerD.intro(peerE.id)
    if(!peerF.peers[peerE.id])
      peerF.intro(peerE.id)

    network.iterate(-1)
  }

  console.log("**************")
  var ts = Date.now()
  peerD.handlers[swarm].chat({content: "hello!", ts, swarm}) //message should be broadcast across network.
  t.equal(peerD.data[swarm].length, 1)
  console.log(peerE.peers)
  console.log('d->e', peerD.peers[peerE.id])
  console.log('f->e', peerF.peers[peerE.id])
  network.iterate(-1)

  t.ok(peerD.peers[peerE.id])
  t.ok(peerF.peers[peerE.id])
  console.log(peerD.peers[peerE.id])
  t.deepEqual(peerE.data, peerD.data)
  t.deepEqual(peerF.data, peerD.data)

  t.end()
})

test('broadcast, easy, hard, easy nat', function (t) {
  const network = new Network()
  var intro1
  network.add(A, new Node(intro1 = new Introducer({ id: ids.a })))
  network.add(B, new Node(new Introducer({ id: ids.b })))

  let [peerD] = createNatPeer(network, ids.d, D, d, IndependentFirewallNat)
  let [peerE] = createNatPeer(network, ids.e, E, e, DependentNat)
  let [peerF] = createNatPeer(network, ids.f, F, f, IndependentFirewallNat)

  network.iterate(-1)

  console.log("INTRO", intro1)
  t.equal(peerD.nat, 'easy')
  t.equal(peerE.nat, 'hard')
  t.equal(peerF.nat, 'easy')

  t.equal(intro1.peers[peerD.id].nat, 'easy')
  t.equal(intro1.peers[peerE.id].nat, 'hard')
  t.equal(intro1.peers[peerF.id].nat, 'easy')

  peerD.on_change = peerE.on_change = peerF.on_change = () => {}

  while(!(peerD.peers[peerE.id] && peerF.peers[peerE.id])) {
    peerD.intro(peerE.id)
    peerF.intro(peerE.id)

    network.iterate(-1)
  }
  console.log(peerE.peers)

  var ts = Date.now()
  peerD.handlers[swarm].chat({content: "hello!", ts, swarm}) //message should be broadcast across network.
  t.equal(peerD.data[swarm].length, 1)

  network.iterate(-1)

  t.ok(peerD.peers[peerE.id])
  t.ok(peerF.peers[peerE.id])
  console.log(peerD.peers[peerE.id])
  t.deepEqual(peerE.data, peerD.data)
  t.deepEqual(peerF.data, peerD.data)

  t.end()
})
