var crypto = require('crypto')
exports.createId = function createId(seed) {
  return crypto.createHash('sha256').update(seed).digest('hex')
  //return crypto.randomBytes(32).toString('hex')
}

