
var test = require('tape')
var Chat = require('../example/chat')
var Introducer = require('../introducer')

const crypto = require('crypto')
const { EventEmitter } = require('events')

const { createId: _createId } = require('../util')
const createId = (...args) => _createId(crypto, ...args)

const { Node, Network, IndependentNat, IndependentFirewallNat, DependentNat } = require('@socketsupply/netsim')

const A = '1.1.1.1'
const B = '2.2.2.2'
const C = 'cc.cc.cc.cc'
const D = '42.4.4.4'
const E = '52.5.5.5'
const F = '62.5.5.5'

const d = '42.4.4.42'
const e = '52.5.5.52'

const P = ':3489'

const ids = {}
const swarm = createId('test:swarm')
let id_count = 0

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

const intros = {
  introducer1: { id: ids.a, address: A, port: 3456 },
  introducer2: { id: ids.b, address: B, port: 3456 }
}

//chat broadcasts across the network
test('broadcast', function (t) {
  const network = new Network()
  let peerD, peerE
  network.add(A, new Node(createPeer(new Introducer({ id: ids.a }))))
  network.add(B, new Node(createPeer(new Introducer({ id: ids.b }))))

  network.add(D, new Node(createPeer(peerD = new Chat({ id: ids.d, ...intros, swarm }))))
  network.add(E, new Node(createPeer(peerE = new Chat({ id: ids.e, ...intros, swarm }))))
  network.add(F, new Node(createPeer(peerF = new Chat({ id: ids.f, ...intros, swarm }))))

  network.iterate(-1)

  t.equal(peerD.nat, 'easy')
  t.equal(peerE.nat, 'easy')
  t.equal(peerF.nat, 'easy')

  peerD.on_change = peerE.on_change = peerF.on_change = () => {}

  peerD.connect(peerE.id)
  peerF.connect(peerE.id)

  var ts = Date.now()
  peerD.chat({content: "hello!", ts}) //message should be broadcast across network.
  t.equal(peerD.messages.length, 1)

  network.iterate(-1)

  t.ok(peerE.peers[peerD.id])
  t.ok(peerF.peers[peerE.id])
  t.deepEqual(peerE.messages, peerD.messages)
  t.deepEqual(peerF.messages, peerD.messages)

  t.end()
})
