
//an object that represents membership in a swarm.
//can iterate over peers in that swarm,
//or broadcast to that swarm only.
//hmm, if the msg has a swarm property,
//forward it to one of these swarm handler objects?


class Swarm {
  constructor (id, peer) {
    this.peer = peer
    this.id = id
  }
  //send to particular peer
  send (msg, peer_id) {
    if(!msg.swarm) msg.swarm = this.id
    var peer = this.peer.peers[peer_id]
    this.peer.send(msg, peer, peer.outport)
  }

  on_nat (nat) {
    this.peer.join(this.id)
  }
  //send to all peers in swarm
  swarmcast (msg, not_peer=null) {
    var swarm = this.peer.swarms[this.id]
    for(var k in swarm)
      if(k != not_peer)
        this.send(msg, k)
  }
}

module.exports = Swarm