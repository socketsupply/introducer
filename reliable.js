var Swarm = require("./swarm")
var np = require('new_protocol')


class ReliablePeer extends Swarm {

  //receive flooded message
  on_update1 (msg, addr, port) {
    var r = np.update(this.state, msg.content, msg.ts)
    if(r === false) {
      //send just back to this peer? and other peers maybe?
      //hmm, if we used EBT style pruning, then the secondary peers could be asked after a delay...
      // **EBT is an optimization that can come later**
      this.send({
        type: 'request', swarm,
        content: np.request(this.state, msg.prev)
      },
        addr, port
      )
    } else if (r === true) {
      //already have this message, so do nothing
      //OR, ebt prune this peer?
    } else {
      //new message, broadcast to everyone in swarm (that hasn't pruned us)
      this.swarmcast(msg, msg.swarm, addr)
    }
    //super.on_chat(msg, addr, port)
  }

  update1 (change) {
    
  }

  on_request (msg, addr, port) {
    var a = np.missing(state, msg.content.has, msg.content.needs)
    if(a.length) {
      for(var i = 0; i < a.length; i++)
        this.send({type: 'chat', id: this.id, swarm: msg.swarm, content: a[i]}, addr, port)
    }
    else {
      //error that do not have the message?

    }
  }

}