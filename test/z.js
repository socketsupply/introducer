
var Generate = require('./z_generate')
var Join = require('./z_join')

function optsToString(opts) {
  var s = ''
  for(var k in opts)
    s += k+'='+opts[k] + ', '
  return s
}

function test (message, fn, opts) {
  var data = fn(opts)
//  console.log('data', data)
  if(data.result == false)
    throw new Error('failed:'+message+optsToString(opts))
  else
    console.log('passed:', message, optsToString(opts))
}

test('generate', Generate, {peers: 3, runs: 100, until: 5_000})

//with drop prob, needs more time to completely replicate for every run
test('generate, drops', Generate, {peers: 3, runs: 100, until: 10_000, dropProb:0.1})

test('Join', Join, {peers: 10, runs: 100, until: 5000})