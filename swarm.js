
//an object that represents membership in a swarm.
//can iterate over peers in that swarm,
//or broadcast to that swarm only.
//hmm, if the msg has a swarm property,
//forward it to one of these swarm handler objects?

function append(item, ary=[]) {
  //check we don't already have it
  for(var i = 0; i < ary.length; i++)
    if(ary[i].ts === item.ts) return null
  ary.push(item)
  return ary
}

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

  chat ({content, ts}) {
    var msg = {type:'chat', id: this.peer.id, content, ts, swarm: this.id}
    this.peer.data[this.id] = append(msg, this.peer.data[this.id]) || this.peer.data[this.id] 
    this.swarmcast(msg)
    //throw new Error('CHAT')
  }
  on_chat (msg, peer) {
    var d = append(msg, this.peer.data[this.id])
    console.log("ON_CHAT", msg, peer.id)
    if(d) {
      this.peer.data[this.id] = d
      this.swarmcast(msg, peer)
    }
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