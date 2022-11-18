
require('./deterministic')
const test = require('tape')
const crypto = require('crypto')
const { EventEmitter } = require('events')

const Swarm = require('../swarms')
const Introducer = require('../introducer')
const { createId } = require('./util')

const { Node, Network, IndependentNat, IndependentFirewallNat, DependentNat } = require('@socketsupply/netsim')
const localPort = 3456
// var nc = require('../')

const A = '1.1.1.1'
const B = '2.2.2.2'
const C = 'cc.cc.cc.cc'
const D = '42.4.4.4'
const E = '52.5.5.5'

const d = '42.4.4.42'
const e = '52.5.5.52'

const P = ':'+localPort
const swarm = createId('test swarm')

const ids = require('./util').genIds()

function createNatPeer (network, id, address_nat, address, Nat) {
  const prefix = /^\d+\./.exec(address_nat)[1]
  const nat = new Nat(prefix)
  let peer = new Swarm({ id, ...intros, keepalive: 29_000})
  peer.createModel(swarm)
  let node = new Node(peer)
  network.add(address_nat, nat)
  nat.add(address, node)
  return [peer, nat, node]
}


const intros = {
  introducer1: { id: ids.a, address: A, port: 3456 },
  introducer2: { id: ids.b, address: B, port: 3456 }
}

test('swarm with 1 easy 1 hard', function (t) {
  const swarm = createId('test swarm')
  const network = new Network()
  let client
  let intro, intro2
  network.add(A, new Node(intro = new Introducer({ id: ids.a, keepalive: 5_000 })))
  network.add(B, new Node(new Introducer({ id: ids.b, keepalive: 5_000 })))

  const [peer_easy, nat_easy] = createNatPeer(network, createId('id:easy'), '1.2.3.4', '1.2.3.42', IndependentFirewallNat)
//  const [peer_hard, nat_hard, node_hard] = createNatPeer(network, createId('id:hard'), '5.6.7.8', '5.6.7.82', DependentNat)

  network.iterateUntil(10_000)
  peer_easy.join(swarm)
//  peer_hard.join(swarm)

  network.iterateUntil(20_000)

  // the introducer should know about everyone's nats now.
  t.equal(intro.peers[peer_easy.id].nat, 'easy')
//  t.equal(intro.peers[peer_hard.id].nat, 'hard')

  t.ok(intro.peers[peer_easy.id].ts)
//  t.ok(intro.peers[peer_hard.id].ts)
  t.ok(peer_easy.swarms[swarm], 'peer still knows about swarm')

  //simulate restarting by creating a new introducer with the same id
  network.add(A, new Node(intro2 = new Introducer({ id: ids.a, keepalive: 5_000 })))

  network.iterateUntil(30_000)

//  console.log("PEERS", intro2.peers)
//  console.log("SWARM", intro2.swarms)


  t.ok(intro2.peers[peer_easy.id], 'restarted introducer knows about the peer')
  t.ok(intro2.swarms[swarm], 'peer has tried to rejoin the swarm')
  t.ok(intro2.swarms[swarm][peer_easy.id], 'restarted introducer knows about the swarm')
//  t.ok(peer_easy.peers[peer_hard.id], 'easy peer knows hard peer')
//  t.ok(peer_hard.peers[peer_easy.id], 'hard peer knows easy peer')

  


  // console.log(nat_hard)

  t.end()
})
