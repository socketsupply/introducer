const test = require('tape')
const crypto = require('crypto')
const { EventEmitter } = require('events')

const { createId: _createId } = require('../util')
const Peer = require('../')
const Introducer = require('../introducer')
const createId = (...args) => _createId(crypto, ...args)

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
    p.timer = timer
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
  network.add(address_nat, nat)
  nat.add(address, new Node(createPeer(peer = new Peer({ id, ...intros }))))
  return [peer, nat]
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
  network.add(A, new Node(createPeer(intro = new Introducer({ id: ids.a }))))
  network.add(B, new Node(createPeer(new Introducer({ id: ids.b }))))

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
