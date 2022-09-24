const Debug = require('debug')
const test = require('tape')
const crypto = require('crypto')
const { EventEmitter } = require('events')
var K = require('../lib/constants')().keepalive

const { createId } = require('./util')

const Chat = require('../swarms')
const Introducer = require('../introducer')
const swarm = createId('test swarm')
const { Node, Network, IndependentNat, IndependentFirewallNat, DependentNat } = require('@socketsupply/netsim')

const debug = Debug('wakeup')

const localPort =  3456
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
  let peer = new Chat({ id, ...intros, keepalive: 29_000})
  peer.createModel(swarm)
  peer.on_change = ()=>{}
  let node = new Node(peer)
  network.add(address_nat, nat)
  nat.add(address, node)
  debug("NODE", node.sleep)
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
  let intro
  network.add(A, new Node(intro = new Introducer({ id: ids.a, keepalive: 5_000 })))
  network.add(B, new Node(new Introducer({ id: ids.b, keepalive: 5_000 })))

  const [peer_easy, nat_easy] = createNatPeer(network, createId('id:easy'), '1.2.3.4', '1.2.3.42', IndependentFirewallNat)
  const [peer_hard, nat_hard, node_hard] = createNatPeer(network, createId('id:hard'), '5.6.7.8', '5.6.7.82',
IndependentFirewallNat)
// DependentNat)

  network.iterateUntil(10_000)
  peer_easy.join(swarm)
  peer_hard.join(swarm)

  network.iterateUntil(20_000)

  // the introducer should know about everyone's nats now.
  t.equal(intro.peers[peer_easy.id].nat, 'easy')
  t.equal(intro.peers[peer_hard.id].nat, 'easy')

  t.ok(peer_easy.peers[peer_hard.id], 'easy peer knows hard peer')
  t.ok(peer_hard.peers[peer_easy.id], 'hard peer knows easy peer')

  debug('keepalive', K)

  network.iterateUntil(K/2)

  node_hard.sleep(true)

  peer_easy.handlers[swarm].chat({content: 'missing', ts: K*0.66, swarm}) //node_hard will not see this

  //TODO test emit wakeup/lost peer event

  network.iterateUntil(11*K)

  //another half minute is enough to wake up
  t.notOk(peer_easy.peers[peer_hard.id], 'easy has forgotten hard, after being offline for 10 minutes')

  debug("WAKEUP")
  node_hard.sleep(false)

  network.iterateUntil(12*K)

  //TODO test emit found peer event

  //give the peer a chance to reconnect,
  //since we have not yet any form of implemented eventual consistency

  debug(peer_easy.peers[peer_hard.id])
  peer_easy.handlers[swarm].chat({content: 'expected', ts: 11*K, swarm}) //node_hard will not see this

  network.iterateUntil(13*K)
  t.ok(peer_easy.peers[peer_hard.id], 'easy has found hard again')

  t.equal(peer_easy.data[swarm].length, 2)
  t.equal(peer_hard.data[swarm].length, 1)
  debug(peer_easy.data[swarm])
  debug(peer_hard.data[swarm])

  //TODO: peer timers need to corectly integrate with netsim, and nat simulators need timeouts

  t.end()
})
