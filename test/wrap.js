const wrap = require('../wrap')

wrap({
  init: () => {},
  on_ping (msg, addr, port) {
    this.send({ type: 'pong', addr }, addr, port)
  }
}, [1234])

const client = {
  on_pong () {
    console.log('PONG')
  }
}

wrap(client, [1235])
console.log(client)
client.send({ type: 'ping' }, { address: '127.0.0.1', port: 1234 })
