#! /usr/bin/env node

function cmpTs (a, b) {
  return b.ts - a.ts
}
var {Peer, Introducer} = require('../')
var util = require('../util')

class ChatPeer extends Peer {
  //send a chat message to everyone
  chat ({name, content, ts = Date.now()}) {
     
   for(var id in this.peers) {
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
  var cmd = process.argv[2]
  var args = process.argv.slice(3)
  var wrap = require('../wrap')
  var crypto = require('crypto')
  var fs = require('fs')
  var path = require('path')
  var appname = process.env.appname || 'introducer-chat'
  var config_file = path.join(process.env.HOME, '.'+appname)
  var config = {}

  try {
    config = JSON.parse(fs.readFileSync(config_file, 'utf8'))
  } catch (_) {}

  if(!config.id)
    config.id = crypto.randomBytes(32).toString('hex')
  if(!config.port)
    config.port = 3456

  fs.writeFileSync(config_file, JSON.stringify(config, null, 2)+'\n', 'utf8')

  if(cmd === 'introducer') {
    wrap(new Introducer(config), [config.port])
    console.log(config.id)
    return
  }

  var introducer1 = {
    address: '3.25.141.150', port:3456
  }
  var introducer2 = {
    address: '13.211.129.58', port : 3457
  }
 
  var swarm = process.argv[2] || util.createId('test swarm')
  var cp = new ChatPeer(swarm)
  cp.on_change = function (state, msg) {
    if(msg)
      console.log(msg.ts+':', msg.content)
    else
      state.messages.forEach(function (msg) {
        console.log(msg.ts+':', msg.content)
      })
  }

  process.stdin.on('data', function (d) {
    cp.chat(d.toString())
    //console.log('>', d.toString())
  })

  wrap(cp, [3456])
}
 