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
  return function (send, interval) {
    p.send = send
    p.interval = interval
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