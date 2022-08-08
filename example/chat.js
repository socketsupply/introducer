// TODO
// run this code to point of nat check
// run to communicate with another peer
// extend netsim to represent local multicast and bluetooth
//
const { Peer, Introducer } = require('../')

module.exports = class Demo extends Peer {
  constructor (opts) {
    super(opts)
    this.swarm = opts.swarm
    this.messages = []
  }

  static cmpTs (a, b) {
    return b.ts - a.ts
  }

  static equalAddr (a, b) {
    return a && b && a.address === b.address && a.port === b.port
  }

  chat ({ name, content, ts = Date.now() }) {
    const msg = { type: 'chat', id: this.id, swarm: this.swarm, content, ts }
//    this.send(msg, { address: '255.255.255.255', port: 3456 }, 3456)
    return this.broadcast(msg)
  }

  on_chat (msg, addr, port) {
    for (let i = 0; i < this.messages.length; i++) {
      const _msg = this.messages[i]
      // if we already have this message, ignore
      if (_msg.ts == msg.ts && _msg.content == msg.content) { return }
    }
    this.messages.push(msg)
    this.broadcast(msg, addr)
    this.on_change(msg, this.messages)
  }

  on_nat () {
    console.log('have nat:', this.nat, {public: this.publicAddress+':'+this.publicPort, local:this.localAddress+':'+this.port})
    this.join(this.swarm)
  }

  on_error (msg) {
    console.log('error', msg)
  }

  on_peer (peer) {
    console.log('***************')
    console.log('connected peer!', peer)
    console.log('***************')
  }

  // broadcast a message, optionally skipping a particular peer (such as the peer that sent this)
  broadcast (msg, not_addr = {address:null}) {
    for (const k in this.peers) {
      if (!this.introducers[k] && !Demo.equalAddr(this.peers[k], not_addr.address)) {
        this.send(msg, this.peers[k], this.peers[k].outport)
      }
    }
  }

  // broadcast a message within a particular swarm
  swarmcast (msg, swarm, not_addr = {address:null}) {
    //send to peers in the same swarm
//    console.log("swarmcast", msg, swarm)
    let c = 0
    for (const k in this.swarms[swarm]) {
      if (!Demo.equalAddr(this.peers[k], not_addr.address)) {
        this.send(msg, this.peers[k], this.port)
        c++
      }
    }
    //and other local peers
    for(const k in this.peers) {
      if((this.swarms[swarm] && !this.swarms[swarm][k]) && /^192.168/.test(this.peers[k].address)) {
        this.send(msg, this.peers[k], this.port)
        c++
      }
    }
    return c
  }
}

class ChatPeer extends Peer {
  // send a chat message to everyone
  chat ({ name, content, ts = Date.now() }) {
    for (const id in this.peers) {
      if (!this.introducers[id]) { this.send({ type: 'chat', id: this.id, name, content, ts, state: state.hash }) }
    }
  }

  // i've used a on_{msg.type} pattern
  // but sometimes I need an event (to be used for protocol extention)
  // that is just _something that happened_ not a particular event received.
  // currently I'm putting both through this pattern, but I don't really like that...

  on_nat () {
    // once we know our nat type, we can connect to peers.
    // first step is connect to at least one other peer in this chat.
  }

  on_change () {}

  // cases:
  //  we receive a message that appends to the state we currently have. easy.
  //  we receive a message that appends to (a message we don't have that appends to)+ the state we have
  //  messages can be in parallel, so maybe like a(b,c)d and we have a,b,d but not c.
  //  detect if the state we have doesn't make sense, and rerequest the entire state.

  // because this is a real time protocol, usually there won't be many heads.
  // so if we get stuck, we can send the heads that we last had and rebuild it from there.
  // especially if we have peers transmit "merge" messages.

  on_chat (msg, addr) {
    // check if this message is after all currently known messages
    if (msg.ts > state.ts) {
      if (msg.state != state.hash) {
        // this message actually comes after another message that we do not have yet.
        // maybe we should wait until we apply it? hopefully we receive this message in just a moment
      }
      state.ts = msg.ts
      state.messages.push(msg)
      state.messages.sort(Demo.cmpTs)
    }
    // this message must be an older message, but
    else {
      // check this isn't a message we already have
      // it's probably one we received recently, so search backwards
      for (let i = state.messages.length - 1; i >= 0; i--) {
        const _msg = state.messages[i]
        if (
          _msg.ts === msg.ts && _msg.state === msg.state &&
          _msg.content === msg.content && _msg.user === msg.user
        ) {
          // we already have this message, so do nothing
          return
        }
      }
    }

    const _peer = state.peers[msg.id] || { name: 'noname' }
    state.peers[msg.id] = { name: msg.name || _peer.name, ts: msg.ts }

    state.messages.push(msg)
    state.messages.sort(Demo.cmpTs)
    if (state.messages.length > 256) { state.messages.unshift() }
    state.hash = crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex')

    this.on_change(state, msg)
  }

  on_update (msg, addr) {
    state = msg.state
    // TODO revalidate
    this.on_change(state)
  }

  initialize (msg, addr, port) {
    // request current state
    this.send({ type: 'update', state }, addr, port)
  }
}
