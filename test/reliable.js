'use strict'

const test = require('tape')
const crypto = require('crypto')
const { EventEmitter } = require('events')

const { createId } = require('./util')

const Reliable = require('../swarm/reliable')
const Swarms = require('../swarms')
const Introducer = require('../introducer')

const { Node, Network, IndependentNat, IndependentFirewallNat, DependentNat } = require('@socketsupply/netsim')
// var nc = require('../')

const A = '1.1.1.1'
const B = '2.2.2.2'
const C = 'cc.cc.cc.cc'
const D = '42.4.4.4'
const E = '52.5.5.5'
const F = '62.6.6.6'

const d = '42.4.4.42'
const e = '52.5.5.52'
const f = '62.6.6.62'

const P = ':3489'

const ids = require('./util').genIds()

function createNatPeer (network, id, address_nat, address, Nat) {
  const prefix = /^\d+\./.exec(address_nat)[1]
  const nat = new Nat(prefix)
  network.add(address_nat, nat)
  nat.add(address, new Node(peer = new Swarm({ id, ...intros })))
  return [peer, nat]
}

const intros = {
  introducer1: { id: ids.a, address: A, port: 3456 },
  introducer2: { id: ids.b, address: B, port: 3456 }
}

test('swarm, connect then update', function (t) {
  const swarm = createId('test swarm')
  const network = new Network()
  const natD = new IndependentNat('42.')
  const natE = new IndependentNat('52.')
  const natF = new IndependentNat('62.')
  var peerD, peerE, peerF, swarmD, swarmE, swarmF

  network.add(A, new Node(new Introducer({ id: ids.a })))
  network.add(B, new Node(new Introducer({ id: ids.b })))
  network.add(D, natD)
  network.add(E, natE)
  network.add(F, natF)
  natD.add(d, new Node(peerD = new Swarms({ id: ids.d, ...intros })))
  var swarmD = peerD.createModel(swarm, new Reliable(swarm))

  natE.add(e, new Node(peerE = new Swarms({ id: ids.e, ...intros })))
  var swarmE = peerE.createModel(swarm, new Reliable(swarm))
//  network.iterate(-1)
  network.iterateUntil(1000)

  t.equal(peerD.nat, 'easy')
  swarmD.update('HELLO1', network.queue.ts)

  network.iterateUntil(2000)
  console.log(peerD.state)
  console.log(peerE.state)
  t.ok(peerE.peers[peerD.id])
  t.ok(peerD.peers[peerE.id])
  swarmD.update('HELLO2', network.queue.ts)
  network.iterateUntil(5000)
  console.log(peerE.state)

  t.deepEqual(swarmE.data, swarmD.data)
  
  network.add(F, natF)
  natF.add(f, new Node(peerF = new Swarms({ id: ids.f, ...intros })))
  //this will trigger a join
  network.iterateUntil(4000)
  t.equal(peerF.nat, 'easy')

  peerF.join(swarm)
  var swarmF = peerF.createModel(swarm, new Reliable(swarm))
  var received = []
  swarmF.on_change = (msg) => received.push(msg)
  network.iterateUntil(5000)
  //a new peer has joined, but it doesn't know there is any messages yet.
  //sending a new message shows it that soemthing is missing so it requests the old messages.
  swarmD.update('welcome', network.queue.ts)
  network.iterateUntil(6000)
  t.deepEqual(swarmF.data, swarmD.data)
//  console.log(swarmF.waiting)
  t.equal(received.length, 3)
  //*/
  t.end()
})

//XXX tests
//
//    send message, receive message
//    send message, while offline, but receive messages after reconnecting

test('swarm, connect then expect to receive updates', function (t) {
  const swarm = createId('test swarm')
  const network = new Network()
  const natD = new IndependentNat('42.')
  const natE = new IndependentNat('52.')
  const natF = new IndependentNat('62.')
  var peerD, peerE, peerF, swarmD, swarmE, swarmF

  network.add(A, new Node(new Introducer({ id: ids.a })))
  network.add(B, new Node(new Introducer({ id: ids.b })))
  network.add(D, natD)
  network.add(E, natE)
  network.add(F, natF)
  natD.add(d, new Node(peerD = new Swarms({ id: ids.d, ...intros })))
  var swarmD = peerD.createModel(swarm, new Reliable(swarm))

  natE.add(e, new Node(peerE = new Swarms({ id: ids.e, ...intros })))
  var swarmE = peerE.createModel(swarm, new Reliable(swarm))

  network.iterateUntil(1000)
  t.equal(peerD.nat, 'easy')
  swarmD.update('HELLO1', network.queue.ts)

  network.iterateUntil(2000)
  t.ok(peerE.peers[peerD.id])
  t.ok(peerD.peers[peerE.id])
  swarmD.update('HELLO2', network.queue.ts)
  network.iterateUntil(3000)

  t.deepEqual(swarmE.data, swarmD.data)

//  network.add(F, natF)
  natF.add(f, new Node(peerF = new Swarms({ id: ids.f, ...intros })))
  //this will trigger a join
  network.iterateUntil(4000)
  t.equal(peerF.nat, 'easy')

//  peerF.join(swarm)
  var swarmF = peerF.createModel(swarm, new Reliable(swarm))
  var received = []
  swarmF.on_change = (msg) => received.push(msg)
  network.iterateUntil(5000)
  //a new peer has joined, but it doesn't know there is any messages yet.
  //sending a new message shows it that soemthing is missing so it requests the old messages.
//  swarmD.update('welcome', swarm, network.queue.ts)
  //network.iterateUntil(6000)
  t.deepEqual(swarmF.data, swarmD.data)
  t.equal(received.length, 2)
  t.end()
})



test('swarm, make updates while offline, before connection', function (t) {
  const swarm = createId('test swarm')
  const network = new Network()
  const natD = new IndependentNat('42.')
  const natE = new IndependentNat('52.')
  const natF = new IndependentNat('62.')
  var peerD, peerE, peerF, swarmD, swarmE, swarmF

  network.add(A, new Node(new Introducer({ id: ids.a })))
  network.add(B, new Node(new Introducer({ id: ids.b })))
  network.add(D, natD)
  network.add(E, natE)
  network.add(F, natF)
  natD.add(d, new Node(peerD = new Swarms({ id: ids.d, ...intros })))
  var swarmD = peerD.createModel(swarm, new Reliable(swarm))

  natE.add(e, new Node(peerE = new Swarms({ id: ids.e, ...intros })))
  var swarmE = peerE.createModel(swarm, new Reliable(swarm))

  swarmD.update('HELLO_D1', network.queue.ts)
//  swarmD.update('HELLO_D2', swarm, network.queue.ts+1)
  swarmE.update('HELLO_E2', network.queue.ts+2)


  network.iterateUntil(1000)
  t.equal(peerD.nat, 'easy')

  network.iterateUntil(2000)
  t.ok(peerE.peers[peerD.id])
  t.ok(peerD.peers[peerE.id])
  network.iterateUntil(3000)

  t.deepEqual(swarmE.data, swarmD.data)
//  t.deepEqual(swarmE.data, swarmD.data)
  console.log(swarmD.data)
  //console.log(swarmE.data)
//  network.add(F, natF)
  
  natF.add(f, new Node(peerF = new Swarms({ id: ids.f, ...intros })))
  //this will trigger a join
  network.iterateUntil(4000)
  t.equal(peerF.nat, 'easy')

//  peerF.join(swarm)
  var swarmF = peerF.createModel(swarm, new Reliable(swarm))
  var received = []
  swarmF.on_change = (msg) => received.push(msg)
  var notified_on_peer = 0
  var on_peer = swarmF.on_peer
  swarmF.on_peer = function (peer, ts) {
    console.log("ON_PEER")
    notified_on_peer ++
    t.ok(peer)
    on_peer.call(this, peer, ts)
  }
  network.iterateUntil(5000)
  //a new peer has joined, but it doesn't know there is any messages yet.
  //sending a new message shows it that soemthing is missing so it requests the old messages.
//  swarmD.update('welcome', swarm, network.queue.ts)
  //network.iterateUntil(6000)
  t.deepEqual(swarmF.data, swarmD.data)
  t.equal(received.length, 2)
  t.ok(notified_on_peer)
  //*/
  t.end()
})

