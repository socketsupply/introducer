var {randomize, seedRandom, generate, createId} = require('./util-randomized')
var minimist = require('minimist')
//const test = require('tape')
const crypto = require('crypto')
const { EventEmitter } = require('events')

const Swarm = require('../swarms')
const Introducer = require('../introducer')
//const { createId } = require('./util')

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

//test('swarm with 1 easy 1 hard', function (t) {
var t = require('assert')

function test_swarm_easy_hard (network) {
  try {
  const swarm = createId('test swarm')
//  const network = new Network()
  let client
  let intro
  network.add(A, new Node(intro = new Introducer({ id: ids.a, keepalive: 5_000 })))
  network.add(B, new Node(new Introducer({ id: ids.b, keepalive: 5_000 })))

  const [peer_easy, nat_easy] = createNatPeer(network, createId('id:easy'), '1.2.3.4', '1.2.3.42', IndependentFirewallNat)
  const [peer_hard, nat_hard, node_hard] = createNatPeer(network, createId('id:hard'), '5.6.7.8', '5.6.7.82', DependentNat)

  network.iterateUntil(10_000)
  peer_easy.join(swarm)
  peer_hard.join(swarm)

  network.iterateUntil(20_000)

  // the introducer should know about everyone's nats now.
  t.equal(intro.peers[peer_easy.id].nat, 'easy')
  t.equal(intro.peers[peer_hard.id].nat, 'hard')

  t.ok(intro.peers[peer_easy.id].ts)
  t.ok(intro.peers[peer_hard.id].ts)

  t.ok(peer_easy.peers[peer_hard.id], 'easy peer knows hard peer')
  t.ok(peer_hard.peers[peer_easy.id], 'hard peer knows easy peer')


  // console.log(nat_hard)

//  console.log(peer_easy.peers[peer_hard.id])
//  console.log(peer_hard.peers[peer_easy.id])

  var new_nat = new IndependentFirewallNat()

  network.add('2.4.6.8', new_nat)
  new_nat.add('2.4.6.80', node_hard)

  network.iterateUntil(60_000)

//  console.log(peer_hard)
  t.equal(peer_hard.localAddress, '2.4.6.80')
  t.equal(peer_hard.publicAddress, '2.4.6.8', 'public address is correct')
  t.equal(peer_easy.peers[peer_hard.id].address, '2.4.6.8', 'other peer knows the new public address')
  //now, move one peer to another address, iterate, and check they regain connection.

  //  console.log(peer_easy)

  //t.end()
  } catch (err) {
    return {error: err, result: false, data: null}
  }
  return {data: null, result: true}
}

//test_swarm_easy_hard()

module.exports = (opts) => randomize(test_swarm_easy_hard, opts)

if(!module.parent) module.exports(minimist(process.argv.slice(2)))

