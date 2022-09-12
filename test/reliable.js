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

const ids = {}; let id_count = 0

for (let i = 0; i < 1000; i++) {
  const id = createId('_' + i)
  if (!ids[id[0]]) {
    ids[id[0]] = id
    id_count++
  }
  if (id_count == 16) break
}

function createPeer (p) {
  return function (send, timer, node, ts) {
    p.send = send
    p.timer = timer
    p.localAddress = node.address
    if (p.init) p.init(ts)
    return function (msg, addr, port, ts) {
      const type = msg.type
      if (p['on_' + type]) p['on_' + type](msg, addr, port, ts)
      else if (p.on_msg) p.on_msg(msg, addr, port, ts)
    }
  }
}

function createNatPeer (network, id, address_nat, address, Nat) {
  const prefix = /^\d+\./.exec(address_nat)[1]
  const nat = new Nat(prefix)
  network.add(address_nat, nat)
  nat.add(address, new Node(createPeer(peer = new Swarm({ id, ...intros }))))
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

  network.add(A, new Node(createPeer(new Introducer({ id: ids.a }))))
  network.add(B, new Node(createPeer(new Introducer({ id: ids.b }))))
  network.add(D, natD)
  network.add(E, natE)
  network.add(F, natF)
  natD.add(d, new Node(createPeer(peerD = new Swarms({ id: ids.d, ...intros }))))
  var swarmD = peerD.createModel(swarm, new Reliable(swarm))

  natE.add(e, new Node(createPeer(peerE = new Swarms({ id: ids.e, ...intros }))))
  var swarmE = peerE.createModel(swarm, new Reliable(swarm))
  network.iterate(-1)

  t.equal(peerD.nat, 'easy')
  swarmD.update('HELLO', swarm, network.queue.ts)
  network.iterateUntil(1000)

  peerD.join(swarm)
  peerE.join(swarm)
  network.iterateUntil(2000)
  console.log(peerD.state)
  console.log(peerE.state)
  t.ok(peerE.peers[peerD.id])
  t.ok(peerD.peers[peerE.id])
  swarmD.update('HELLO', swarm, network.queue.ts)
  network.iterateUntil(3000)
  console.log(peerE.state)

  t.deepEqual(swarmE.data, swarmD.data)

//  network.add(F, natF)
  natF.add(f, new Node(createPeer(peerF = new Swarms({ id: ids.f, ...intros }))))
  //this will trigger a join
  network.iterateUntil(4000)
  t.equal(peerF.nat, 'easy')

  peerF.join(swarm)
  var swarmF = peerF.createModel(swarm, new Reliable(swarm))
  network.iterateUntil(5000)
  //a new peer has joined, but it doesn't know there is any messages yet.
  //sending a new message shows it that soemthing is missing so it requests the old messages.
  swarmD.update('welcome', swarm, network.queue.ts)
  network.iterateUntil(6000)
  t.deepEqual(swarmF.data, swarmD.data)
  console.log(swarmF.waiting)
  t.end()
})


//XXX tests
//
//    send message, receive message
//    send message, while offline, but receive messages after reconnecting

