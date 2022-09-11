var Swarm = require("./")
var np = require('@socketsupply/new_protocol')

module.exports = class ReliableSwarm extends Swarm {

  constructor (opts) {
    super(opts)
    this.waiting = []
    this.data = np.init()
  }
  
  //receive flooded message
  on_update (msg, addr, port) {
    var r = np.update(this.data, msg, msg.ts)
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
      if(this.on_change) this.on_change(msg, this.data)
      if(this.waiting.length) {
        //check to see if any waiting messages can now be applied
        var i = 0
        while(i < this.waiting.length) {
          var msg = this.waiting[i]
          r = np.update(this.data, msg, msg.ts) //is msg.ts correct?
          if(r == false) {
            i ++
            continue
          }
          this.waiting.splice(i, 1)
          if('object' === typeof r) {
            this.data = r  
          }
        }
      }
    }
  }

  update (content, swarm, ts) {
    var msg = np.create(this.data, {type:'update', content}, ts)
    console.log("UPDATE", msg)
    this.data = np.update(this.data, msg)
    this.swarmcast(msg, swarm)
    if(this.on_change) this.on_change(msg, this.data)
  }

  request (msg, from) {
//    console.log("REQUEST", msg, from)
    this.waiting.push(msg)
    this.send({
        type: 'request', swarm: this.id,
        ...np.request(this.data, msg.prev)
      },
      from.id,
    )
  }

  on_request (msg, addr, port) {
    console.log("on_request", msg)
    var a = np.missing(this.data, msg.have, msg.need)
    if(a.length) {
      for(var i = 0; i < a.length; i++) {
        this.send(a[i], addr, port)
      }
    }
    else {
      //error that do not have the message?     
    }
  }

}