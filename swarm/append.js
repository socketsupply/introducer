var Swarm = require('./')

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

module.exports = class AppendSwarm extends Swarm {

  //change this to append???
  chat ({content, ts}) {
    var msg = {type:'chat', id: this.peer.id, content, ts, swarm: this.id}
    this.data = append(msg, this.data)
    this.swarmcast(msg)
    if(this.on_change) this.on_change (msg, this.data)
  }

  on_chat (msg, peer) {
    var d = append(msg, this.data)
    if(d) {
      this.data = d
      this.swarmcast(msg, peer)
      if(this.on_change) this.on_change (msg, this.data)
    }
  }

}

