#! /usr/bin/env node

//TODO
//  run this code to point of nat check
//  run to communicate with another peer
//  extend netsim to represent local multicast and bluetooth

function cmpTs (a, b) {
  return b.ts - a.ts
}
var {Peer, Introducer} = require('../')
var util = require('../util')

function equal_addr (a, b) {
  return a && b && a.address === b.address && a.port === b.port
}

class Demo extends Peer {
  constructor (opts) {
    super(opts)
    this.swarm = opts.swarm
    this.messages = []
  }

  chat ({name, content, ts = Date.now()}) {
    var msg = {type:'chat', id: this.id, swarm: this.swarm, content, ts}
    this.send(msg, {address:'255.255.255.255', port:3456}, 3456)
    return this.swarmcast(msg)
  }

  on_chat (msg, addr, port) {
    for(var i = 0; i < this.messages.length; i++) {
      var _msg = this.messages[i] 
      //if we already have this message, ignore
      if(_msg.ts == msg.ts && _msg.content == msg.content) 
        return
    }
    this.messages.push(msg)
    this.swarm(msg, this.swarm, addr)
    this.on_change(msg, this.messages)
  }

  on_nat () {
    console.log('have nat:', this.nat)
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

  //broadcast a message, optionally skipping a particular peer (such as the peer that sent this)
  broadcast(msg, not_addr=null) {
    for(var k in this.peers) {
      if(!this.introducers[k] && !equal_addr(this.peers[k], not_addr.address))
        this.send(msg, this.peers[k], this.port)
    }
  }

  //broadcast a message within a particular swarm
  swarmcast(msg, swarm, not_addr=null) {
    var c = 0
    for(var k in this.swarms[swarm]) {
      if(!equal_addr(this.peers[k], not_addr.address)) {
        this.send(msg, this.peers[k], this.port)
        c++
      }
    }
    return c
  }


}


class ChatPeer extends Peer {
  //send a chat message to everyone
  chat ({name, content, ts = Date.now()}) {
   for(var id in this.peers) {
      if(!this.introducers[id])
        this.send({type: 'chat', id: this.id, name, content, ts, state: state.hash})
    }
  }

  //i've used a on_{msg.type} pattern
  //but sometimes I need an event (to be used for protocol extention)
  //that is just _something that happened_ not a particular event received.
  //currently I'm putting both through this pattern, but I don't really like that...

  on_nat () {
    //once we know our nat type, we can connect to peers.
    //first step is connect to at least one other peer in this chat.
  }

  on_change () {}

  //cases:
  //  we receive a message that appends to the state we currently have. easy.
  //  we receive a message that appends to (a message we don't have that appends to)+ the state we have 
  //  messages can be in parallel, so maybe like a(b,c)d and we have a,b,d but not c.
  //  detect if the state we have doesn't make sense, and rerequest the entire state.

  //because this is a real time protocol, usually there won't be many heads.
  //so if we get stuck, we can send the heads that we last had and rebuild it from there.
  //especially if we have peers transmit "merge" messages.

  on_chat (msg, addr) {
    //check if this message is after all currently known messages
    if(msg.ts > state.ts) {
      if(msg.state != state.hash) {
        //this message actually comes after another message that we do not have yet.
        //maybe we should wait until we apply it? hopefully we receive this message in just a moment
      }
      state.ts = msg.ts
      state.messages.push(msg)
      state.messages.sort(cmpTs)
    }
    //this message must be an older message, but 
    else {
      //check this isn't a message we already have
      //it's probably one we received recently, so search backwards
      for(var i = state.messages.length-1; i >= 0; i--) {
        var _msg = state.messages[i] 
        if(
          _msg.ts === msg.ts && _msg.state === msg.state &&
          _msg.content === msg.content && _msg.user === msg.user
        ) {
          //we already have this message, so do nothing
          return
        }
      }
    }

    var _peer = state.peers[msg.id] || {name:'noname'}
    state.peers[msg.id] = {name: msg.name || _peer.name, ts: msg.ts}

    state.messages.push(msg)
    state.messages.sort(cmpTs)
    if(state.messages.length > 256)
      state.messages.unshift()
    state.hash = crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex')

    this.on_change(state, msg)
  }

  on_update (msg, addr) {
    state = msg.state
    //TODO revalidate
    this.on_change(state)
  }

  initialize (msg, addr, port) {
    //request current state
    this.send({type: 'update', state}, addr, port)
  }
}


if(!module.parent) {
  var config = require('../lib/config')({appname:'introducer-chat'})
  var Wrap = require('../wrap')
  var cmd = process.argv[2]
  var swarm = util.createId('test swarm') 
  var Multicast = require('../lib/multicast')
  /* multicast
    to find other peers on the local network,
    we need a parallel multicast system.
    it appears that a socket cannot be used for both
  */

 
 if(cmd === 'introducer') {
    Wrap(new Introducer(), [config.port])
    console.log(config.id)
  }
  else {
    var peer = new Demo({swarm, ...config})
    peer.on_change = (msg) => {
      console.log(msg.id.substring(0, 8), msg.ts, msg.content)
    }
    Wrap(peer, [config.port])
    process.stdin.on('data', function (data) {
      var c = peer.chat({ts:Date.now(), content: data.toString()})
      console.log("DATA", data.toString(), c)     
    })
    //broadcast our presense on local network.
    //our address is detectable.
    //but include our port, because message will be received on multicast
    //only port which won't receive direct packets. 
    Multicast(6543, function () {
      return JSON.stringify({ type:'broadcast', id: config.id, port: config.port, ts: Date.now() })
    }, function (data, addr) {
      //when we detect a peer, just ping them,
      //that will trigger the other peer management stuff.
      //hmm, also need to join swarms with them?
      var msg = JSON.parse(data.toString())
      if(msg.id === peer.id) return //ignore our own messages
      peer.ping({address:addr.address, port: msg.port})    

      //mark as a local peer,
      //when you join a swarm, also message local peers to join the swarm
      //(just incase they are in it, cheap to message locally)
    })

  }
}
