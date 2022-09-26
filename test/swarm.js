const test = require('tape')
const crypto = require('crypto')
const { EventEmitter } = require('events')

const { createId } = require('./util')

const Swarm = require('../swarms')
const Introducer = require('../introducer')

const { Node, Network, IndependentNat, IndependentFirewallNat, DependentNat } = require('@socketsupply/netsim')
// var nc = require('../')

const A = '1.1.1.1'
const B = '2.2.2.2'
const C = 'cc.cc.cc.cc'
const D = '42.4.4.4'
const E = '52.5.5.5'

const d = '42.4.4.42'
const e = '52.5.5.52'

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

test('swarm', function (t) {
  const swarm = createId('test swarm')
  const network = new Network()
  const natD = new IndependentNat('42.')
  const natE = new IndependentNat('52.')
  let client
  network.add(A, new Node(new Introducer({ id: ids.a })))
  network.add(B, new Node(new Introducer({ id: ids.b })))
  network.add(D, natD)
  network.add(E, natE)
  natD.add(d, new Node(peerD = new Swarm({ id: ids.d, ...intros })))
  natE.add(e, new Node(peerE = new Swarm({ id: ids.e, ...intros })))
  network.iterate(-1)

  t.equal(peerD.nat, 'easy')
  peerD.join(swarm)
  peerE.join(swarm)
  network.iterate(-1)

  t.ok(peerE.peers[peerD.id])
  t.ok(peerD.peers[peerE.id])

  t.end()
})

test('swarm2', function (t) {
  const swarm = createId('test swarm')
  const network = new Network()
  const natD = new IndependentNat('42.')
  const natE = new IndependentNat('52.')
  let client
  network.add(A, new Node(new Introducer({ id: ids.a })))
  network.add(B, new Node(new Introducer({ id: ids.b })))
  network.add(D, natD)
  network.add(E, natE)
  natD.add(d, new Node(peerD = new Swarm({ id: ids.d, ...intros })))
  natE.add(e, new Node(peerE = new Swarm({ id: ids.e, ...intros })))
  network.iterate(-1)

  t.equal(peerD.nat, 'easy')

  peerD.join(swarm)
  network.iterate(-1)
  peerE.join(swarm)
  network.iterate(-1)
  console.log(peerE)

  t.ok(peerE.swarms, 'peer has swarm object')
  t.ok(peerE.swarms[swarm], 'peer has swarm key')
  t.ok(peerE.peers[peerD.id])
  t.ok(peerD.peers[peerE.id])

  t.end()
})

function idToAddress (id, d = 0) {
  return [
    Number.parseInt(id.substring(0, 2), 16),
    Number.parseInt(id.substring(2, 4), 16),
    Number.parseInt(id.substring(4, 6), 16),
    (Number.parseInt(id.substring(6, 8), 16) + d) % 256
  ].map(String).join('.')
}

test('swarmN', function (t) {
  const swarm = createId('test swarm')
  const network = new Network()
  //  var natD = new IndependentNat('42.')
  let client
  network.add(A, new Node(new Introducer({ id: ids.a })))
  network.add(B, new Node(new Introducer({ id: ids.b })))

  const peers = []
  const N = 100
  for (var i = 0; i < N; i++) {
    const id = createId('id:' + i)
    const address = idToAddress(id)
    // XXX this should be IndependentFirewallNat
    const natN = new IndependentNat(/^\d+\./.exec(address)[1])

    network.add(address, natN)

    natN.add(address, new Node(peers[i] = new Swarm({ id: id, ...intros })))
  }
  network.iterate(-1)
  // the network simulator doesn't set send/timer until it calls init,
  // and i think that is something I could fix but that's how it is now so this
  // makes these tests work, and they'll still work after I fix that problem...
  for (var i = 0; i < N; i++) { peers[i].join(swarm) }

  network.iterate(-1)

  for (var i = 0; i < N; i++) {
    console.log(peers[i])
    const pc = Object.keys(peers[i].peers).length
    const sc = Object.keys(peers[i].swarms[swarm]).length
    t.ok(pc >= 3, `peers[${i}] has at least 3 peers, got ${pc}`)
    t.ok(sc >= 3, `peers[${i}] has at least 3 swarm, got: ${sc}`)
  }

  t.end()
})

test('swarm with 1 easy 1 hard', function (t) {
  const swarm = createId('test swarm')
  const network = new Network()
  let client
  let intro
  network.add(A, new Node(intro = new Introducer({ id: ids.a })))
  network.add(B, new Node(new Introducer({ id: ids.b })))

  const [peer_easy, nat_easy] = createNatPeer(network, createId('id:easy'), '1.2.3.4', '1.2.3.42', IndependentFirewallNat)
  const [peer_hard, nat_hard] = createNatPeer(network, createId('id:hard'), '5.6.7.8', '5.6.7.82', DependentNat)

  network.iterate(-1)
  peer_easy.join(swarm)
  peer_hard.join(swarm)

  network.iterate(-1)

  // the introducer should know about everyone's nats now.
  t.equal(intro.peers[peer_easy.id].nat, 'easy')
  t.equal(intro.peers[peer_hard.id].nat, 'hard')

  t.ok(peer_easy.peers[peer_hard.id], 'easy peer knows hard peer')
  t.ok(peer_hard.peers[peer_easy.id], 'hard peer knows easy peer')

  // console.log(nat_hard)

  console.log(peer_easy.peers[peer_hard.id])
  console.log(peer_hard.peers[peer_easy.id])

  //  console.log(peer_easy)

  //  peer_easy.connect(peer_hard.id)

  t.end()
})

// join, with hard nats.
test('swarm with hard nats included', function (t) {
  const swarm = createId('test swarm')
  const network = new Network()
  let client
  let intro
  network.add(A, new Node(intro = new Introducer({ id: ids.a })))
  network.add(B, new Node(new Introducer({ id: ids.b })))

  const peers = []
  const Easy = 10; const Hard = 10
  for (let i = 0; i < Easy + Hard; i++) {
    const id = createId('id:' + i)
    const address = idToAddress(id)
    const prefix = /^\d+\./.exec(address)[1]
    const natN = i < Easy ? new IndependentFirewallNat(prefix) : new DependentNat(prefix)

    network.add(address, natN)

    natN.add(address, new Node(peers[i] = new Swarm({ id: id, ...intros })))
  }

  network.iterate(-1)
  peers.forEach((peer, i) => {
    if (i < Easy) { t.equal(peer.nat, 'easy') } else { t.equal(peer.nat, 'hard') }
    peer.join(swarm)
  })

  network.iterate(-1)

  // the introducer should know about everyone's nats now.
  peers.forEach((peer, i) => {
    t.equal(intro.peers[peer.id].nat, i < Easy ? 'easy' : 'hard')
    // console.log(peer.peers)
  })

  t.end()
})

test('empty swarm', function (t) {
  const swarm = createId('test swarm')
  const network = new Network()
  let client
  let intro
  network.add(A, new Node(intro = new Introducer({ id: ids.a })))
  network.add(B, new Node(new Introducer({ id: ids.b })))

  const [peer_easy, nat_easy] = createNatPeer(network, createId('id:easy'), '1.2.3.4', '1.2.3.42', IndependentFirewallNat)
  // var [peer_hard, nat_hard] = createNatPeer(network, createId('id:hard'), '5.6.7.8', '5.6.7.82', DependentNat)

  network.iterate(-1)
  peer_easy.join(swarm)
  //  peer_hard.join(swarm)

  let empty
  peer_easy.on_error = function (msg) {
    empty = msg.id
  }

  network.iterate(-1)

  // the introducer should know about everyone's nats now.
  t.equal(intro.peers[peer_easy.id].nat, 'easy')
  //  t.equal(intro.peers[peer_hard.id].nat, 'hard')
  t.equal(empty, swarm)
  // console.log(nat_hard)

  //  console.log(peer_easy.peers[peer_hard.id])
  //  console.log(peer_hard.peers[peer_easy.id])
  t.end()
})

test('notify on_peer, swarm', function (t) {
  // t.fail('TODO: check that there is notification when a new peer connects for the first time')

  const swarm = createId('test swarm')
  const network = new Network()
  let client
  let intro
  network.add(A, new Node(intro = new Introducer({ id: ids.a })))
  network.add(B, new Node(new Introducer({ id: ids.b })))

  const [peer1, nat1] = createNatPeer(network, createId('id:1'), '1.2.3.4', '1.2.3.42', IndependentFirewallNat)
  const [peer2, nat2] = createNatPeer(network, createId('id:2'), '5.6.7.8', '5.6.7.82', IndependentFirewallNat)

  network.iterate(-1)
  let notify = 0
  peer1.on_peer = (peer) => {
    console.log('ON PEER 1', peer)
    notify |= 1
    t.equal(peer.id, peer2.id)
    t.ok(peer1.swarms[swarm][peer.id])
  }
  peer2.on_peer = (peer) => {
    console.log('ON PEER 2', peer)
    notify |= 2
    t.equal(peer.id, peer1.id)
    t.ok(peer2.swarms[swarm][peer.id])
  }
  peer1.join(swarm)
  peer2.join(swarm)

  network.iterate(-1)
  t.ok(peer1.peers[peer2.id].pong, 'peer1 has received pong from peer2')
  t.ok(peer2.peers[peer1.id].pong, 'peer2 has received pong from peer1')
  t.equal(notify, 3, 'there were two peer notifications')
  t.end()
})


test('local connection established without hairpinning support', function (t) {

  const swarm = createId('test swarm')
  const network = new Network()
  let client
  let intro
  network.add(A, new Node(intro = new Introducer({ id: ids.a })))
  network.add(B, new Node(new Introducer({ id: ids.b })))

//  const id = createId('id:nat')
  const nat = new IndependentFirewallNat('2.4.')
  nat.hairpinning = false
  var nat_address = '2.4.6.8'
  network.add(nat_address, nat)

  var id_a = createId('id:a')
  var id_b = createId('id:b')

  var address_a = '2.4.0.1', address_b = '2.4.0.2'
  nat.add(address_a, new Node(peer_a = new Swarm({ id: id_a, ...intros })))
  nat.add(address_b, new Node(peer_b = new Swarm({ id: id_b, ...intros })))

  network.iterate(-1)

  peer_a.join(swarm)
  peer_b.join(swarm)

  network.iterate(-1)
  t.equal(peer_a.publicAddress, nat_address)
  t.equal(peer_b.publicAddress, nat_address)
  t.equal(peer_a.publicPort, nat.map[address_a+':3456'])
  t.equal(peer_b.publicPort, nat.map[address_b+':3456'])

  t.ok(peer_a.peers[peer_b.id], 'peer_a has found peer_b')
  t.ok(peer_b.peers[peer_a.id], 'peer_b has found peer_a')

  t.end()
})
