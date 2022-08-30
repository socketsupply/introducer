var {isId} = require('../util')
module.exports = (fs) => ({ createId, filename}) => {
  if(!filename) throw new Error('filename *must* be provided')
  let config = {}

  try {
    config = JSON.parse(fs.readFileSync(filename, 'utf8'))
  } catch {}

  if (!config.id) {
    if(!isId(config.id = createId()))
      throw new Error('generated fresh id, but it was not a valid id')
  }

  config.port = config.port || 3456
  config.spinPort = config.spinPort || 3456

  if (!config.introducer1) {
    config.introducer1 = {
      id: '5a40cd15d7266be9248ae8c8f10de00260f970b7dae18cafdfa753f6cc1d58ff',
      address: '3.25.141.150',
      port: 3456
    }
  }

  if (!config.introducer2) {
    config.introducer2 = {
      id: 'aaecb3746ecec8f9b72eef221ccdd55da8c6fdccd54ba9a9839e8927a8750861',
      address: '13.211.129.58',
      port: 3456
    }
  }

  fs.writeFileSync(filename, JSON.stringify(config, null, 2) + '\n', 'utf8')
  return config
}
