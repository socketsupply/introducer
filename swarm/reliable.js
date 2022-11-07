const Swarm = require('./')
const np = require('@socketsupply/new_protocol')

module.exports = class ReliableSwarm extends Swarm {
  constructor (opts) {
    super(opts)
    this.waiting = []
    this.data = np.init()
  }

  on_peer (peer, ts) {
    this.head(peer, ts) //XXX pass ts
  }

  on_nat () {
    this.peer.join(this.id)
    //can comment this out, because on_peer sends head
//    this.peer.timer(1000, 0, (ts) => this.head(null, ts))
  }

  // receive flooded message
  msg_update (msg, addr, port) {
    let info = np.update(this.data, msg, msg.ts)
    this.data = info.state
    if (info.queued) {
      // request missing messages
      this.request(msg.prev, addr)
    } else if (!info.applied.length) {
      // already have this message, so do nothing
      // OR, ebt prune this peer?
    } else {
      if (this.on_change)
        info.applied.forEach(msg => this.on_change(msg, this.data))
      // new message, broadcast to everyone in swarm (that hasn't pruned us)
      // XXX maybe repeats should be handled differently, if I had to request this message again,
      //    don't broadcast it. (probably everyone got it directly already?)
      this.swarmcast(msg, addr)

      //when sending an update, expect a "head" acknowledgement
    }
  }

  head (peer, ts) {
    if(!ts) throw new Error('expected ts')
//    this.awaiting[peer.id] = true
    //remember that we are expecting a response to this
    //and set if a response (either another head) or a request.
    //if not, retry (untell it's to one peer, and they go down)
//    console.log("HEAD", peer ? peer.id : null, np.leaves(this.data))
    const msg = {
      type: 'head',
      swarm: this.id,
      id: this.peer.id,
      head: np.leaves(this.data),
      ack: false
    }
    this.sent = ts
    this.heads = this.heads || {}
    this.heads = this.heads || {}
    //check if we have received a update more recently
    this.peer.timer(1000, 0, (ts) => {
//      console.log("RETRY head?", ts, this.sent, this.recv)
//      if(this.sent > this.recv) this.head(peer, ts)
        ///XXX calling like this will create a timer for each call
        //which may be un-necessary calls, but it won't make it not work.
        //but it's important to check that a head hasn't been already resent otherwise can get an exponential blowup
        for(var k in this.heads) {
          if(this.heads[k].sent > this.heads[k].recv && (ts - this.heads[k].sent > 750)) {
            //console.log("resend", this.heads[k].sent, this.heads[k].recv, k)
            this.head({id: k}, ts)
          }
        }
    })

    if (peer) {
      this.heads[peer.id] = this.heads[peer.id] || { sent: 0, recv: 0}
      this.heads[peer.id].sent = ts
      this.send(msg, peer)
    } else {
      this.swarmcast(msg, (msg, peer) => {
        this.heads[peer.id] = this.heads[peer.id] || { sent: 0, recv: 0}
        this.heads[peer.id].sent = ts
        this.send(msg, peer.id)
      })
    }
  }

  msg_head (msg, peer, _port, ts) {
    // if we receive a head message, and we are not up to date with it, then request an update.
    if (!np.has(this.data, msg.head)) {
      //XXX  rerequest until we have this...

      this.request(msg.head, peer, ts)
    }
    this.recv = ts
    this.heads = this.heads || {}
    this.heads[msg.id] = this.heads[msg.id] || {sent: 0, recv: 0}
    this.heads[msg.id].recv = ts
//    console.log('RECV', this.heads)
    // if we know about stuff that the head _doesn't_, then send a head back to them
    const head = np.leaves(this.data)
    const diff = head.filter(id => !~msg.head.indexOf(id))
    if (diff.length) {
//      this.head(peer, ts)
      const msg = {
        type: 'head',
        swarm: this.id,
        id: this.peer.id,
        head: np.leaves(this.data)
      }
      this.send(msg, peer)
    }
    //if the head is marked as an ack, it is a reply to our message
    //so do not send a reply.
    //if it is not an ack, send an ack.
    else if (!msg.ack) {

        const msg = {
          type: 'head',
          swarm: this.id,
          id: this.peer.id,
          head: np.leaves(this.data),
          ack: true
        }
        this.send(msg, peer)

    }
  }

  update (content, ts) {
    if('number' !== typeof ts) throw new Error('expected timestamp, got:'+ts)
    const msg = np.create(this.data, { type: 'update', content, id: this.peer.id }, ts)
    this.data = np.update(this.data, msg).state
    this.swarmcast(msg)
    if (this.on_change) {
      this.on_change(msg, this.data)
    }
    //after WE have created an update, also send head
    //because head has a reliability timer and that will trigger a resend
    //if dropped
    this.head(null, ts)
  }

  request (prev, from) {
    //XXX rerequest after a delay if we are still waiting 
    //prev should be an id that we are missing.
    //check that we do not have it.
    var req = np.request(this.data, prev)
    if(req.need.length == 0) return //we actually have everything
    this.peer.timer(0, 1_000, () => {
      var req = np.request(this.data, prev)
      if(req.need.length == 0) return false//we actually have everything, cancel the timer
      //XXX if the peer has died, cancel also
      this.send({
        type: 'request',
        swarm: this.id,
        id: this.peer.id,
        ...req
      },
      from.id
      )
    })
  }

  msg_request (msg, addr, port, ts) {
    const a = np.missing(this.data, msg.have, msg.need)
    this.recv = ts
    this.heads = this.heads || {}
    this.heads[msg.id] = this.heads[msg.id] || { sent: 0, recv: 0}
    this.heads[msg.id].recv = ts 
  //  console.log("RECV", this.heads)
    if (a.length) {
      for (let i = 0; i < a.length; i++) {
        this.send(a[i], addr, port)
      }
    } else {
      // error that do not have the message?
    }
  }
}
