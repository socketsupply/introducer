var {isId} = require('../util')
const defaultConfig = require('./default-config.js')

module.exports = fs => ({ createId, filename }) => {
  if(!filename) throw new Error('filename *must* be provided')
  let config = {}

  try {
    config = JSON.parse(fs.readFileSync(filename, 'utf8'))
  } catch {}

  if (!config.id) {
    if(!isId(config.id = createId()))
      throw new Error('generated fresh id, but it was not a valid id')
  }

  config = { ...defaultConfig, ...config }

  fs.writeFileSync(filename, JSON.stringify(config, null, 2) + '\n', 'utf8')
  return config
}
