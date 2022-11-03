
module.exports = function update (state, logs) {
  state = state || {}
  logs.forEach(function (ev) {
    var p = state[ev.id] = state[ev.id] || {connections: {}}
    if(
      ev.action === 'connect.static' || 
      ev.action === 'connect.local' ||
      ev.action === 'connect.easy' ||
      ev.action === 'connect.easyhard' ||
      ev.action === 'connect.hardeasy'
    ) {
      var connections = p.connections[ev.msg.target] = p.connections[ev.msg.target] || {}
      connections[ev.msg.ts] = {action: ev.action, connected: false}
    }

    if(ev.action === 'connect.success') {
      var connections = p.connections[ev.msg.target] = p.connections[ev.msg.target] || {}
      //there should always have already been connect event before this
      //so ev.msg.ts should already be set

      if(!connections[ev.msg.ts]) throw new Error('logs out of order')
      //action: ev.action, connected: true
      //find the corresponding connect message that this connected.

      var connection = p.connections[ev.msg.target][ev.msg.ts]
      connection.connected = true
      connection.ts = ev.ts
    }
  })
  return state
}