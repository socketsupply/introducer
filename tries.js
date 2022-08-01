
//script to calculate how many connection tries (from the easy side)
//will give a high proportion of successful connections.

//the hard side opens 256 ports
var opened = {}
for(var i = 0; i < 256; i++)
  opened[~~(Math.random()*0xffff)] = true

//the easy side needs to guess a port
//if there are M tries, whats the chance of finding a port?
var N = 10000, M = 512
for(var M = 128; M < 2048; M *= 1.1) {
var total = 0, needed = 0
    for(var j = 0; j < N; j++) {
      for(var i = 0; i < M; i++)
        if(opened[p = ~~(Math.random()*0xffff)]) {
          //console.log(i, p)
          total ++
          break
        }
      needed += i

    }

  // M is max number of attempts,
  // total/N is proportion of successful connections
  // needed/N is average number of packets sent.
  console.log(M, total/N, needed/N)

  //interestingly, even in cases where it will attempt over a thousand connections
  //the average needed is still only about 250 per connection.
}