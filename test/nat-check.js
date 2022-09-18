
const test = require('tape')
const crypto = require('crypto')
const { EventEmitter } = require('events')

const { createId } = require('./util')

const Peer = require('../')
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

const localPort = 3456
const P = ':'+localPort

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
  return p
}

function createNatPeer (network, id, address_nat, address, Nat) {
  const prefix = /^\d+\./.exec(address_nat)[1]
  const nat = new Nat(prefix)
  network.add(address_nat, nat)
  nat.add(address, new Node(createPeer(peer = new Peer({ id, ...intros }))))
  return [peer, nat]
}

const intros = {
  introducer1: { id: ids.a, address: A, port: 3456 },
  introducer2: { id: ids.b, address: B, port: 3456 }
}
test('nat-check', function (t) {
  const network = new Network()
  let peerD, peerE
  network.add(A, new Node(createPeer(new Introducer({ id: ids.a }))))
  network.add(B, new Node(createPeer(new Introducer({ id: ids.b }))))

  var easy_nat = new IndependentFirewallNat()
  var easy_node = easy_nat.add(d, new Node(createPeer(peerD = new Peer({ id: ids.d, ...intros }))))
  var hard_nat = new DependentNat()
  var hard_node = hard_nat.add(e, new Node(createPeer(peerE = new Peer({ id: ids.e, ...intros }))))
  var static_node = network.add(F, new Node(createPeer(peerF = new Peer({ id: ids.f, ...intros }))))

  network.add(D, easy_nat)
  network.add(E, hard_nat)

  network.iterate(-1)

  t.equal(peerD.nat, 'easy')
  t.equal(peerE.nat, 'hard')
  t.equal(peerF.nat, 'static')

  //and the peers should know the introducer's nat.

  t.equal(peerD.peers[intros.introducer1.id].nat, 'static')

  t.end()
})
