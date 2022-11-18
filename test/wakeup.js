require('./deterministic')
const test = require('tape')
const crypto = require('crypto')
const { EventEmitter } = require('events')
var K = require('../lib/constants')().keepalive

const { createId } = require('./util')

const Chat = require('../swarms')
const Introducer = require('../introducer')
const swarm = createId('test swarm')
const { Node, Network, IndependentNat, IndependentFirewallNat, DependentNat } = require('@socketsupply/netsim')

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
  console.log("NODE", node.sleep)
  return [peer, nat, node]
}


const intros = {
  introducer1: { id: ids.a, address: A, port: 3456 },
  introducer2: { id: ids.b, address: B, port: 3456 }
}

function isString (s) {
  return 'string' === typeof s
}

function expect_msgs (network, t) {
  var expected = []

  function eq_addr (a, b) {
    if(a === b) return true
    if(a.address === b || b.address === a) return true
    return (a.address === b.address && a.port === b.port)
  }
  function eq_obj (a, b) {
    for(var k in b)
      if(a[k] != b[k]) return false
    return true
  }


  network.on_send = (msg, dest, source) => {
    //on each message, iterate over expected messages and if one matches, remove it.
    //console.log('expected', expected)
//    console.log("SEND", dest, source, msg, expected)
    if(msg.type === 'join' && msg.id[0] === 'd') {
      console.log("JOIN", msg, dest, source, expected)

    for(var i = 0; i < expected.length; i++) {
      var ex = expected[i]
      console.log({
        dest: eq_addr(dest, ex.dest),
        source: eq_addr(source, ex.source),
        msg: eq_obj(msg, ex.msg)
      })
    }

    }
    for(var i = 0; i < expected.length; i++) {
      var ex = expected[i]
      if(eq_addr(dest, ex.dest) && eq_addr(source, ex.source) && eq_obj(msg, ex.msg)) {
        return expected.splice(i, 1)
      }
    }
  }
  function expect (msg, source, dest) {
    expected.push({msg, source, dest})
  }

  expect.expected = expected
  return expect
}



test('swarm with 1 easy 1 hard, the hard node sleeps then wakes, espects to rediscover easy peer', function (t) {
  const swarm = createId('test swarm')
  const network = new Network()
  let client
  let intro
  network.add(A, new Node(intro = new Introducer({ id: ids.a, keepalive: 5_000 })))
  network.add(B, new Node(new Introducer({ id: ids.b, keepalive: 5_000 })))

  const [peer_easy, nat_easy] = createNatPeer(network, ids.c, '1.2.3.4', '1.2.3.42', IndependentFirewallNat)
  const [peer_hard, nat_hard, node_hard] = createNatPeer(network, ids.d, '5.6.7.8', '5.6.7.82',
IndependentFirewallNat)
// DependentNat)

  network.iterateUntil(10_000)
  peer_easy.join(swarm)
  peer_hard.join(swarm)
  console.error('SEED='+process.env.SEED)
  network.iterateUntil(20_000)

  // the introducer should know about everyone's nats now.
  t.equal(intro.peers[peer_easy.id].nat, 'easy')
  t.equal(intro.peers[peer_hard.id].nat, 'easy')

  t.notEqual(peer_easy.peers[peer_hard.id].introducer, true, 'easy peer does not consider hard peer an introducer')
  t.notEqual(peer_hard.peers[peer_easy.id].introducer, true, 'hard peer does not consider easy peer an introducer')

  t.ok(peer_easy.peers[peer_hard.id], 'easy peer knows hard peer')
  t.ok(peer_hard.peers[peer_easy.id], 'hard peer knows easy peer')

  network.iterateUntil(K/2)

  node_hard.sleep(true)

  peer_easy.handlers[swarm].chat({content: 'missing', ts: K*0.66, swarm}) //node_hard will not see this
  
  //TODO test emit wakeup/lost peer event

  var expect = expect_msgs(network)

  network.iterateUntil(11*K)

  //another half minute is enough to wake up
  //this fails because easypeer thinks that hard is an introducer.???
  t.notOk(peer_easy.peers[peer_hard.id], 'easy has forgotten hard, after being offline for 10 minutes')

  //setting this before unsleeping makes it pass!
  //sleep(false) can trigger an event, if a timer was waiting
  //there should be a message from the hard node to the first introducer
  expect({type: 'join'}, '5.6.7.8', A)

  node_hard.sleep(false)


  network.iterateUntil(12*K) //one more keepalive period (29 seconds)

  //TODO test emit found peer event

  //give the peer a chance to reconnect,
  //since we have not yet any form of implemented eventual consistency

  //easy peer posts another message
  peer_easy.handlers[swarm].chat({content: 'expected', ts: 11*K, swarm}) //node_hard will not see this

  network.iterateUntil(13*K)
  t.ok(peer_easy.peers[peer_hard.id], 'easy has found hard again')

  
  t.deepEqual(expect.expected, [], 'the hard peer is expected to sent a join message to introducer')
  t.equal(peer_easy.data[swarm].length, 2)
  t.equal(peer_hard.data[swarm].length, 1)
  console.log(peer_easy.data[swarm])
  console.log(peer_hard.data[swarm])

  //TODO: peer timers need to corectly integrate with netsim, and nat simulators need timeouts

  t.end()
})
