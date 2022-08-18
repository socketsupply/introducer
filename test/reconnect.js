const test = require('tape')
const crypto = require('crypto')
const { EventEmitter } = require('events')

const Peer = require('../')
const Introducer = require('../introducer')
const { createId } = require('./util')

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
  return function (send, timer, node) {
    p.send = send
    p.timer = function (delay, repeat, fn) {
      timer(delay, repeat, () => {
        p.localAddress = node.address
        return fn()
      })
    }
    p.localAddress = node.address
    // console.log('timer', timer.toString())
    if (p.init) p.init()
    return function (msg, addr, port) {
      const type = msg.type
      if (p['on_' + type]) p['on_' + type](msg, addr, port)
      else if (p.on_msg) p.on_msg(msg, addr, port)
    }
  }
}
function createNatPeer (network, id, address_nat, address, Nat) {
  const prefix = /^\d+\./.exec(address_nat)[1]
  const nat = new Nat(prefix)
  let peer = new Peer({ id, ...intros, keepalive: 60_000 })
  let node = new Node(createPeer(peer))
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
  let intro
  network.add(A, new Node(createPeer(intro = new Introducer({ id: ids.a, keepalive: 5_000 }))))
  network.add(B, new Node(createPeer(new Introducer({ id: ids.b, keepalive: 5_000 }))))

  const [peer_easy, nat_easy] = createNatPeer(network, createId('id:easy'), '1.2.3.4', '1.2.3.42', IndependentFirewallNat)
  const [peer_hard, nat_hard, node_hard] = createNatPeer(network, createId('id:hard'), '5.6.7.8', '5.6.7.82', DependentNat)

  network.iterateUntil(10_000)
  peer_easy.join(swarm)
  peer_hard.join(swarm)

  network.iterateUntil(20_000)

  // the introducer should know about everyone's nats now.
  t.equal(intro.peers[peer_easy.id].nat, 'easy')
  t.equal(intro.peers[peer_hard.id].nat, 'hard')

  t.ok(peer_easy.peers[peer_hard.id], 'easy peer knows hard peer')
  t.ok(peer_hard.peers[peer_easy.id], 'hard peer knows easy peer')

  // console.log(nat_hard)

  console.log(peer_easy.peers[peer_hard.id])
  console.log(peer_hard.peers[peer_easy.id])

  var new_nat = new IndependentFirewallNat()

  network.add('2.4.6.8', new_nat)
  new_nat.add('2.4.6.80', node_hard)

  network.iterateUntil(30_000)

  console.log(peer_hard)
  t.equal(peer_hard.localAddress, '2.4.6.80')
  t.equal(peer_hard.publicAddress, '2.4.6.8', 'public address is correct')
  t.equal(peer_easy.peers[peer_hard.id].address, '2.4.6.8', 'other peer knows the new public address')
  //now, move one peer to another address, iterate, and check they regain connection.


  //  console.log(peer_easy)

  //  peer_easy.connect(peer_hard.id)

  t.end()
})

test('disconnect, reconnect', function (t) {

  const swarm = createId('test swarm')
  const network = new Network()
  let client
  let intro
  network.add(A, new Node(createPeer(intro = new Introducer({ id: ids.a, keepalive: 5_000 }))))
  network.add(B, new Node(createPeer(new Introducer({ id: ids.b, keepalive: 5_000 }))))

  const [peer_easy, nat_easy] = createNatPeer(network, createId('id:easy'), '1.2.3.4', '1.2.3.42', IndependentFirewallNat)
  const [peer_hard, nat_hard, node_hard] = createNatPeer(network, createId('id:hard'), '5.6.7.8', '5.6.7.82', DependentNat)

  network.iterateUntil(10_000)
  peer_easy.join(swarm)
  peer_hard.join(swarm)

  network.iterateUntil(20_000)

  // the introducer should know about everyone's nats now.
  t.equal(intro.peers[peer_easy.id].nat, 'easy')
  t.equal(intro.peers[peer_hard.id].nat, 'hard')

  t.ok(peer_easy.peers[peer_hard.id], 'easy peer knows hard peer')
  t.ok(peer_hard.peers[peer_easy.id], 'hard peer knows easy peer')

  // console.log(nat_hard)

  console.log(peer_easy.peers[peer_hard.id])
  console.log(peer_hard.peers[peer_easy.id])

  var new_nat = new IndependentFirewallNat()

  network.add('2.4.6.8', new_nat)
  new_nat.add('2.4.6.80', node_hard)

  network.iterateUntil(30_000)

  console.log(peer_hard)
  t.equal(peer_hard.localAddress, '2.4.6.80')
  t.equal(peer_hard.publicAddress, '2.4.6.8', 'public address is correct')
  t.equal(peer_easy.peers[peer_hard.id].address, '2.4.6.8', 'other peer knows the new public address')
  //now, move one peer to another address, iterate, and check they regain connection.


  t.end()

})
