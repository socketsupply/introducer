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
    return function (msg, addr) {
      var type = msg.type
      if(p['on_'+type]) p['on_'+type](msg, addr)
      else if(p.on_msg) p.on_msg(msg, addr)
    }
  }

}

var intros = {
  introducer1: {id: ids.a, address:A, port: 3567},
  introducer2: {id: ids.b, address:B, port: 3567}
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


function idToAddress(id) {
  return [
    Number.parseInt(id.substring(0, 2), 16),
    Number.parseInt(id.substring(2, 4), 16),
    Number.parseInt(id.substring(4, 6), 16),
    Number.parseInt(id.substring(6, 8), 16)
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
    var natN = new IndependentNat(/^\d+\./.exec(address)[1])

    network.add(address, natN)

//    console.log(address)
    natN.add(address, new Node(createPeer(peers[i] = new Peer({id: id, ...intros}) )))
  //  peers[0].join(swarm)

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

/*
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
*/
//  console.log(peers[5])
  t.end()
})
