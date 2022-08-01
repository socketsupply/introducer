var test = require('tape')

var {createId} = require('../util')
var {Introducer, Peer} = require('../')

var {Node, Network, IndependentNat, IndependentFirewallNat, DependentNat} = require('@socketsupply/netsim')
//var nc = require('../')

var A = '1.1.1.1'
var B = '2.2.2.2'
var C = 'cc.cc.cc.cc'
var D = '42.4.4.4'
var E = '52.5.5.5'

var d = '42.4.4.42'
var e = '52.5.5.52'

var P = ':3489'

var ids = {}, id_count = 0

for (var i = 0; i < 1000; i++) {
  var id = createId('_'+i)
  if(!ids[id[0]]) {
    ids[id[0]] = id
    id_count ++
  }
  if(id_count == 16) break;
}


function createPeer(p) {
  return function (send, timer) {
    p.send = send
    p.timer = timer
    //console.log('timer', timer.toString())
    if(p.init) p.init()
    return function (msg, addr, port) {
      var type = msg.type
      if(p['on_'+type]) p['on_'+type](msg, addr, port)
      else if(p.on_msg) p.on_msg(msg, addr, port)
    }
  }

}

var intros = {
  introducer1: {id: ids.a, address:A, port: 3456},
  introducer2: {id: ids.b, address:B, port: 3456}
}
test('connect', function (t) {
  var network = new Network()
  var peerD, peerE
  network.add(A, new Node(createPeer(new Introducer({id: ids.a}))))
  network.add(B, new Node(createPeer(new Introducer({id: ids.b}))))

  network.add(D, new Node(createPeer(peerD = new Peer({id: ids.d, ...intros}) )))
  network.add(E, new Node(createPeer(peerE = new Peer({id: ids.e, ...intros}) )))

  network.iterate(-1)

  t.equal(peerD.nat, 'easy')
  t.equal(peerE.nat, 'easy')

  peerD.connect(peerE.id)

  network.iterate(-1)

  console.log(peerE)
  console.log(peerD)

  t.ok(peerE.peers[peerD.id])
  t.ok(peerD.peers[peerE.id])

  t.end()

})

test('connect, easy nat', function (t) {

  var network = new Network()
  var natD = new IndependentNat('42.')
  var natE = new IndependentNat('52.')
  var client
  network.add(A, new Node(createPeer(new Introducer({id: ids.a}))))
  network.add(B, new Node(createPeer(new Introducer({id: ids.b}))))
  network.add(D, natD)
  network.add(E, natE)
  natD.add(d, new Node(createPeer(peerD = new Peer({id: ids.d, ...intros}) )))
  natE.add(e, new Node(createPeer(peerE = new Peer({id: ids.e, ...intros}) )))
  network.iterate(-1)

  t.equal(peerD.nat, "easy")
  peerD.connect(peerE.id)
  network.iterate(-1)

  t.ok(peerE.peers[peerD.id])
  t.ok(peerD.peers[peerE.id])

  t.end()

})

test('swarm', function (t) {
  var swarm = createId('test swarm')
  var network = new Network()
  var natD = new IndependentNat('42.')
  var natE = new IndependentNat('52.')
  var client
  network.add(A, new Node(createPeer(new Introducer({id: ids.a}))))
  network.add(B, new Node(createPeer(new Introducer({id: ids.b}))))
  network.add(D, natD)
  network.add(E, natE)
  natD.add(d, new Node(createPeer(peerD = new Peer({id: ids.d, ...intros}) )))
  natE.add(e, new Node(createPeer(peerE = new Peer({id: ids.e, ...intros}) )))
  network.iterate(-1)

  t.equal(peerD.nat, "easy")
  peerD.join(swarm)
  peerE.join(swarm)
  network.iterate(-1)

  t.ok(peerE.peers[peerD.id])
  t.ok(peerD.peers[peerE.id])

  t.end()
})

test('swarm2', function (t) {
  var swarm = createId('test swarm')
  var network = new Network()
  var natD = new IndependentNat('42.')
  var natE = new IndependentNat('52.')
  var client
  network.add(A, new Node(createPeer(new Introducer({id: ids.a}))))
  network.add(B, new Node(createPeer(new Introducer({id: ids.b}))))
  network.add(D, natD)
  network.add(E, natE)
  natD.add(d, new Node(createPeer(peerD = new Peer({id: ids.d, ...intros}) )))
  natE.add(e, new Node(createPeer(peerE = new Peer({id: ids.e, ...intros}) )))
  network.iterate(-1)

  t.equal(peerD.nat, "easy")

  peerD.join(swarm)
  network.iterate(-1)
  peerE.join(swarm)
  network.iterate(-1)
  console.log(peerE)

  t.ok(peerE.swarm, 'peer has swarm object')
  t.ok(peerE.swarm[swarm], 'peer has swarm key')
  t.ok(peerE.peers[peerD.id])
  t.ok(peerD.peers[peerE.id])

  t.end()
})


function idToAddress(id, d=0) {
  return [
    Number.parseInt(id.substring(0, 2), 16),
    Number.parseInt(id.substring(2, 4), 16),
    Number.parseInt(id.substring(4, 6), 16),
    (Number.parseInt(id.substring(6, 8), 16)+d) % 256
  ].map(String).join('.')
}

test('swarmN', function (t) {
  var swarm = createId('test swarm')
  var network = new Network()
//  var natD = new IndependentNat('42.')
  var client
  network.add(A, new Node(createPeer(new Introducer({id: ids.a}))))
  network.add(B, new Node(createPeer(new Introducer({id: ids.b}))))

  var peers = []
  var N = 100
  for(var i = 0; i < N; i++) {
    var id = createId('id:'+i)
    var address = idToAddress(id)
    //XXX this should be IndependentFirewallNat
    var natN = new IndependentNat(/^\d+\./.exec(address)[1])

    network.add(address, natN)

    natN.add(address, new Node(createPeer(peers[i] = new Peer({id: id, ...intros}) )))

  }
  network.iterate(-1)
  //the network simulator doesn't set send/timer until it calls init,
  //and i think that is something I could fix but that's how it is now so this
  //makes these tests work, and they'll still work after I fix that problem...
  for(var i = 0; i < N; i++)
    peers[i].join(swarm)

  network.iterate(-1)

  for(var i = 0; i < N; i++) {
    console.log(peers[i])
    var pc = Object.keys(peers[i].peers).length
    var sc = Object.keys(peers[i].swarm[swarm]).length
    t.ok(pc >= 3, `peers[${i}] has at least 3 peers, got ${pc}`)
    t.ok(sc >= 3, `peers[${i}] has at least 3 swarm, got: ${sc}`)
  }

  t.end()
})


test('detect hard nat', function (t) {

  var swarm = createId('test swarm')
  var network = new Network()
  var client
  network.add(A, new Node(createPeer(new Introducer({id: ids.a}))))
  network.add(B, new Node(createPeer(new Introducer({id: ids.b}))))

  var i = 0
  var peer
  var id = createId('id:'+i)
  var address = idToAddress(id)
  var prefix = /^\d+\./.exec(address)[1]
  var natN = new DependentNat(prefix)

  network.add(address, natN)

  natN.add(address, new Node(createPeer(peer = new Peer({id: id, ...intros}) )))

  network.iterate(-1)
  t.equal(peer.nat, 'hard')

  t.end()
})

function createNatPeer (network, id, address_nat, address, Nat) {

  var prefix = /^\d+\./.exec(address_nat)[1]
  var nat = new Nat(prefix)
  network.add(address_nat, nat)
  nat.add(address, new Node(createPeer(peer = new Peer({id, ...intros}) )))
  return [peer, nat]
}

test('swarm with 1 easy 1 hard', function (t) {

  var swarm = createId('test swarm')
  var network = new Network()
  var client
  var intro
  network.add(A, new Node(createPeer(intro = new Introducer({id: ids.a}))))
  network.add(B, new Node(createPeer(new Introducer({id: ids.b}))))

  var [peer_easy, nat_easy] = createNatPeer(network, createId('id:easy'), '1.2.3.4', '1.2.3.42', IndependentFirewallNat)
  var [peer_hard, nat_hard] = createNatPeer(network, createId('id:hard'), '5.6.7.8', '5.6.7.82', DependentNat)

  network.iterate(-1)
  peer_easy.join(swarm)
  peer_hard.join(swarm)

  network.iterate(-1)

  //the introducer should know about everyone's nats now.
  t.equal(intro.peers[peer_easy.id].nat, 'easy')
  t.equal(intro.peers[peer_hard.id].nat, 'hard')

  t.ok(peer_easy.peers[peer_hard.id], 'easy peer knows hard peer')
  t.ok(peer_hard.peers[peer_easy.id], 'hard peer knows easy peer')

  //console.log(nat_hard)

  console.log(peer_easy.peers[peer_hard.id])
  console.log(peer_hard.peers[peer_easy.id])


//  console.log(peer_easy)

//  peer_easy.connect(peer_hard.id)

  t.end()
})

//join, with hard nats.
test.skip('swarm with hard nats included', function (t) {

  var swarm = createId('test swarm')
  var network = new Network()
  var client
  var intro
  network.add(A, new Node(createPeer(intro = new Introducer({id: ids.a}))))
  network.add(B, new Node(createPeer(new Introducer({id: ids.b}))))

  var peers = []
  var Easy = 10, Hard = 10
  for(var i = 0; i < Easy+Hard; i++) {
    var id = createId('id:'+i)
    var address = idToAddress(id)
    var prefix = /^\d+\./.exec(address)[1]
    var natN = i < Easy ? new IndependentFirewallNat(prefix) : new DependentNat(prefix)

    network.add(address, natN)

    natN.add(address, new Node(createPeer(peers[i] = new Peer({id: id, ...intros}) )))
  }


  network.iterate(-1)
  peers.forEach((peer, i) => {
    if(i < Easy)
      t.equal(peer.nat, 'easy')
    else
      t.equal(peer.nat, 'hard')
    peer.join(swarm)
  })

  network.iterate(-1)  
  
  //the introducer should know about everyone's nats now.
  peers.forEach((peer, i) => { 
    t.equal(intro.peers[peer.id].nat, i < Easy ? 'easy' : 'hard')
    //console.log(peer.peers)
  })

  

  t.end()
})