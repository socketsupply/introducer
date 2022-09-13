var Swarm = require("./")
var np = require('@socketsupply/new_protocol')

module.exports = class ReliableSwarm extends Swarm {

  constructor (opts) {
    super(opts)
    this.waiting = []
    this.data = np.init()
  }

  on_nat () {
    this.peer.join(this.id)
    this.peer.timer(1000, 0, ()=>this.head())
  }

  //receive flooded message
  on_update (msg, addr, port) {
    var r = np.update(this.data, msg, msg.ts)
    if(r === false) {
      //request missing messages
      this.waiting.push(msg)
      this.request(msg.prev, addr)
    } else if (r === true) {
      //already have this message, so do nothing
      //OR, ebt prune this peer?
    } else {
      if(this.on_change) this.on_change(msg, this.data)
      //new message, broadcast to everyone in swarm (that hasn't pruned us)
      //XXX maybe repeats should be handled differently, if I had to request this message again,
      //    don't broadcast it. (probably everyone got it directly already?) 
      this.swarmcast(msg, msg.swarm, addr)

      if(this.waiting.length) {
        //check to see if any waiting messages can now be applied
        var i = 0
        var changed = true
        while(this.waiting.length && changed) {
          changed = false
          for(var i = 0; i < this.waiting.length; i++) {
            msg = this.waiting[i]
            r = np.update(this.data, msg, msg.ts)
            if(r !== false) {
              this.waiting[i] = null
              changed = true
              if('object' === typeof r && this.on_change) {
                this.on_change(msg, this.data)
              }
            }
            //else if it is false,
            //we can't apply the message yes so keep it in the waiting list
          }
          this.waiting = this.waiting.filter(Boolean)
        }
        //when there are no longer waiting messages,
        //broadcast a note about our new state (but not the message)
        //if someone learns of a new message that way, they can ask for it.
        //(this would be a good point to introduce EBT like behaviour)
        if(!this.waiting.length)
          this.head()
      }
    }
  }

  head (peer) {
    var msg = {
      type: 'head', swarm: this.id, id: this.peer.id, 
      head: np.leaves(this.data)
    }
    if(peer)
      this.send(msg, peer)
    else
      this.swarmcast(msg, this.id)
  }

  on_head (msg, peer) {
    //if we receive a head message, and we are not up to date with it, then request an update.
    if(!np.has(this.data, msg.head)) {
      this.request(msg.head, peer)
    }
    //if we know about stuff that the head _doesn't_, then send a head back to them
    var head = np.leaves(this.data)
    var diff = head.filter(id => ~~msg.head.indexOf(id))
    if(diff.length) {
      this.head(peer)
    }
  }

  update (content, ts) {
    var msg = np.create(this.data, {type:'update', content}, ts)
    this.data = np.update(this.data, msg)
    this.swarmcast(msg, this.id)
    if(this.on_change) {
      this.on_change(msg, this.data)
    }
  }

  request (prev, from) {
    this.send({
        type: 'request', swarm: this.id, id: this.peer.id,
        ...np.request(this.data, prev)
      },
      from.id,
    )
  }

  on_request (msg, addr, port) {
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