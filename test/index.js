const test = require('tape')
const crypto = require('crypto')
const { EventEmitter } = require('events')

const { createId } = require('./util')

const Swarm = require('../')
const Introducer = require('../introducer')

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
test('intro', function (t) {
  const network = new Network()
  let peerD, peerE
  network.add(A, new Node(new Introducer({ id: ids.a })))
  network.add(B, new Node(new Introducer({ id: ids.b })))

  network.add(D, new Node(peerD = new Swarm({ id: ids.d, ...intros })))
  network.add(E, new Node(peerE = new Swarm({ id: ids.e, ...intros })))

  network.iterate(-1)

  t.equal(peerD.nat, 'static')
  t.equal(peerE.nat, 'static')

  peerD.intro(peerE.id)

  network.iterate(-1)

  console.log(peerE)
  console.log(peerD)

  t.ok(peerE.peers[peerD.id])
  t.ok(peerD.peers[peerE.id])

  t.end()
})

test('intro, easy nat', function (t) {
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
  peerD.intro(peerE.id)
  network.iterate(-1)

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


test('detect hard nat', function (t) {
  const swarm = createId('test swarm')
  const network = new Network()
  let client
  network.add(A, new Node(new Introducer({ id: ids.a })))
  network.add(B, new Node(new Introducer({ id: ids.b })))

  const i = 0
  let peer
  const id = createId('id:' + i)
  const address = idToAddress(id)
  const prefix = /^\d+\./.exec(address)[1]
  const natN = new DependentNat(prefix)

  network.add(address, natN)

  natN.add(address, new Node(peer = new Swarm({ id: id, ...intros })))

  network.iterate(-1)
  t.equal(peer.nat, 'hard')

  t.end()
})

