var MT = require('rng').MT
var seed = +process.env.SEED || Date.now()
var mt = new MT(seed)
Math.random = function () {
  return mt.random()
}
