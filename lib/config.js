module.exports = function ({appname}) {
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
  if(!config.introducer1)
    config.introducer1 = {
      id: "5a40cd15d7266be9248ae8c8f10de00260f970b7dae18cafdfa753f6cc1d58ff",
      address: '3.25.141.150', port: 3456
    }
  if(!config.introducer2)
    config.introducer2 = {
      id: 'aaecb3746ecec8f9b72eef221ccdd55da8c6fdccd54ba9a9839e8927a8750861',
      address: '13.211.129.58', port : 3456
    }

  fs.writeFileSync(config_file, JSON.stringify(config, null, 2)+'\n', 'utf8')

  return config
}