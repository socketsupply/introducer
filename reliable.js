var Swarm = require("./swarm")
var np = require('new_protocol')


class ReliablePeer extends Swarm {

  constructor (opts) {
    super(opts)
    this.waiting = []
  }
  
  //receive flooded message
  on_update (msg, addr, port) {
    var r = np.update(this.state, msg.content, msg.ts)
    if(r === false) {
      //request missing messages
      this.request(msg, addr)
    } else if (r === true) {
      //already have this message, so do nothing
      //OR, ebt prune this peer?
    } else {
      //new message, broadcast to everyone in swarm (that hasn't pruned us)
      //XXX maybe repeats should be handled differently, if I had to request this message again,
      //    don't broadcast it. (probably everyone got it directly already?) 
      this.swarmcast(msg, msg.swarm, addr)
      this.on_change(msg, this.state)
      if(this.waiting.length) {
        //check to see if any waiting messages can now be applied
        while(i < this.waiting.length) {
          var msg = this.waiting[i]
          r = np.update(this.state, msg.content, msg.ts) //is msg.ts correct?
          if(r == false) {
            i ++
            continue
          }
          this.waiting.splice(i, 1)
          if('object' === typeof r) {
            this.state = r  
          }
        }
      }
    }
  }

  update (content, swarm, ts) {
    var msg = create(this.state, content, ts)
    this.state = update(this.state, msg)
    this.swarmcast(msg, swarm)
    this.on_change(msg, this.state)
  }

  request (msg, from) {
    this.waiting.push(msg)
    this.send({
        type: 'request', swarm,
        content: np.request(this.state, msg.prev)
      },
      from, from.outport
    )
  }

  on_request (msg, addr, port) {
    var a = np.missing(state, msg.content.has, msg.content.needs)
    if(a.length) {
      for(var i = 0; i < a.length; i++) {
        this.send({type: 'update', id: this.id, swarm: msg.swarm, content: a[i]}, addr, port)
      }
    }
    else {
      //error that do not have the message?
      
    }
  }

}