const Swarm = require('./')
const np = require('@socketsupply/new_protocol')

module.exports = class ReliableSwarm extends Swarm {
  constructor (opts) {
    super(opts)
    this.waiting = []
    this.data = np.init()
  }

  on_peer (peer) {
    this.head(peer)
  }

  on_nat () {
    this.peer.join(this.id)
    this.peer.timer(1000, 0, () => this.head())
  }

  // receive flooded message
  on_update (msg, addr, port) {
    const info = np.update(this.data, msg, msg.ts)
    this.data = info.state
    if (info.queued) {
      // request missing messages
      this.request(msg.prev, addr)
    } else if (!info.applied.length) {
      // already have this message, so do nothing
      // OR, ebt prune this peer?
    } else {
      if (this.on_change) { info.applied.forEach(msg => this.on_change(msg, this.data)) }
      // new message, broadcast to everyone in swarm (that hasn't pruned us)
      // XXX maybe repeats should be handled differently, if I had to request this message again,
      //    don't broadcast it. (probably everyone got it directly already?)
      this.swarmcast(msg, msg.swarm, addr)
    }
  }

  head (peer) {
    const msg = {
      type: 'head',
      swarm: this.id,
      id: this.peer.id,
      head: np.leaves(this.data)
    }
    if (peer) { this.send(msg, peer) } else { this.swarmcast(msg, this.id) }
  }

  on_head (msg, peer) {
    // if we receive a head message, and we are not up to date with it, then request an update.
    if (!np.has(this.data, msg.head)) {
      this.request(msg.head, peer)
    }
    // if we know about stuff that the head _doesn't_, then send a head back to them
    const head = np.leaves(this.data)
    const diff = head.filter(id => !~msg.head.indexOf(id))
    if (diff.length) {
      this.head(peer)
    }
  }

  update (content, ts) {
    if (typeof ts !== 'number') throw new Error('expected timestamp, got:' + ts)
    const msg = np.create(this.data, { type: 'update', content, id: this.peer.id }, ts)
    this.data = np.update(this.data, msg).state
    this.swarmcast(msg, this.id)
    if (this.on_change) {
      this.on_change(msg, this.data)
    }
  }

  request (prev, from) {
    this.send({
      type: 'request',
      swarm: this.id,
      id: this.peer.id,
      ...np.request(this.data, prev)
    },
    from.id
    )
  }

  on_request (msg, addr, port) {
    const a = np.missing(this.data, msg.have, msg.need)
    if (a.length) {
      for (let i = 0; i < a.length; i++) {
        this.send(a[i], addr, port)
      }
    } else {
      // error that do not have the message?
    }
  }
}
