var crypto = require('crypto')
function createId(seed) {
  return crypto.createHash('sha256').update(seed).digest('hex')
  //return crypto.randomBytes(32).toString('hex')
}
exports.createId = createId

//generates vanity ids starting with [0-9a-f] to make debugging easier
exports.genIds = () => {
  const ids = {}
  let id_count = 0

  for (let i = 0; i < 1000; i++) {
    const id = createId('_' + i)
    if (!ids[id[0]]) {
      ids[id[0]] = id
      id_count++
    }
    if (id_count == 16) break
  }
  return ids
}