
var fs = require('fs')

module.exports = function (file) {
  var stream = fs.createWriteStream(file, {flags: 'a+'})

  function stringify (action, msg, ts) {
    return JSON.stringify({
      id: this.id, address: this.publicAddress, nat: this.nat,
      ts, action, msg
    //double newline is more readable and is also
    //the json can be pretty printed.
    })+'\n\n'
  }

  function log (action, msg, ts) {
    stream.write(stringify(action, msg, ts))
  }

  log.sync = function (action, msg, ts) {
    fs.appendFileSync(file, stringify(action, msg, ts))
  }

  return log
}