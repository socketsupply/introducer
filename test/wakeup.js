const test = require('tape')
const crypto = require('crypto')
const { EventEmitter } = require('events')
var K = require('../lib/constants')().keepalive

const { createId } = require('./util')

const Chat = require('../swarm')
const Introducer = require('../introducer')
const swarm = createId('test swarm')
const { Node, Network, IndependentNat, IndependentFirewallNat, DependentNat } = require('@socketsupply/netsim')

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
  return function (send, timer, node, ts) {
    p.send = send
    p.timer = function (delay, repeat, fn) {
      timer(delay, repeat, (ts) => {
        p.localAddress = node.address
        return fn(ts)
      })
    }
    p.localAddress = node.address
    // console.log('timer', timer.toString())
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
  let peer = new Chat({ id, ...intros, keepalive: 60_000, swarm })
  peer.on_change = ()=>{}
  let node = new Node(createPeer(peer))
  network.add(address_nat, nat)
  nat.add(address, node)
  console.log("NODE", node.sleep)
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

  console.log('keepalive', K)

  network.iterateUntil(K/2)

  console.log(node_hard.sleep)
  node_hard.sleep(true)

  peer_easy.chat({content: 'missing', ts: K*0.66}) //node_hard will not see this
  
  //TODO test emit wakeup/lost peer event

  network.iterateUntil(11*K)

  //another half minute is enough to wake up
  t.notOk(peer_easy.peers[peer_hard.id], 'easy has forgotten hard, after being offline for 10 minutes')

  console.log("WAKEUP")
  node_hard.sleep(false)

  network.iterateUntil(12*K)

  //TODO test emit found peer event

  //give the peer a chance to reconnect,
  //since we have not yet any form of implemented eventual consistency

  console.log(peer_easy.peers[peer_hard.id])
  peer_easy.chat({content: 'expected', ts: 11*K}) //node_hard will not see this

  network.iterateUntil(13*K)
  t.ok(peer_easy.peers[peer_hard.id], 'easy has found hard again')

  t.equal(peer_easy.messages.length, 2)
  t.equal(peer_hard.messages.length, 1)
  console.log(peer_easy.messages)
  console.log(peer_hard.messages)

  //TODO: peer timers need to corectly integrate with netsim, and nat simulators need timeouts

  t.end()
})
