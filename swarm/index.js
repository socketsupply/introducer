
// an object that represents membership in a swarm.
// can iterate over peers in that swarm,
// or broadcast to that swarm only.
// hmm, if the msg has a swarm property,
// forward it to one of these swarm handler objects?

class Swarm {
  constructor (id, peer) {
    this.peer = peer
    this.id = id
  }

  // send to particular peer
  send (msg, peer_id) {
    if (!msg.swarm) msg.swarm = this.id
    if (peer_id.id) peer_id = peer_id.id
    const peer = this.peer.peers[peer_id]
    if (peer) {
      this.peer.send(msg, peer, peer.outport)
    } else {
      // sometimes it this happens, but not sure why yet. I think it's just a race,
      // and it will still work if we just ignore it. :fingers_crossed:
      console.error('UNKNOWN PEER:', JSON.stringify(peer_id))
      // throw new Error("unknown peer:"+JSON.stringify(peer_id))
    }
  }

  on_nat (nat) {
    this.peer.join(this.id)
  }

  // send to all peers in swarm
  swarmcast (msg, not_peer = null) {
    const swarm = this.peer.swarms[this.id]
    for (const k in swarm) {
      if (k !== not_peer) { this.send(msg, k) }
    }
  }
}

module.exports = Swarm
