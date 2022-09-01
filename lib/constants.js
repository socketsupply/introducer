//time between pings (to keep ports open)
//NATs keep ports open for some time period.
//(there is probably also an eviction policy related to capacity of the NAT table)
//obviously, we need a time that is less than the NAT's eviction time.
//I read it was maybe 3 minutes? should do an experiment though.
//
//I did an experiment (run scripts/longevity.js)
// phone hotspot: 30s
// huawei router: 29s
// dlink router: 89s

//TODO detect this at startup (and network change)
//     100 byte keepalive packet 120 times an hour 24 hours is 0.288 mb a day per peer
const keepalive = 29_000

//delay between packets sent for birthday paradox connection
//10ms means 100 packets per second.
const bdp = 10
//on average, about ~255 packets are sent per successful connection.
//(giving up after 1000 packets means 97% of attempts are successful.
//it is necessary to give up at some point because the other side might not have done anything,
//or might have crashed, etc)
const bdpMaxPackets = 1000
//time that we expect a new connection to take.
//do not start another new connection attempt within this time,
//even if we havn't received a packet yet.
const connecting = bdp*bdpMaxPackets

//time since last received packet that we consider connection to be active.
//if a connect request is made for a peer in this window, just do a ping instead.
//since a ping expects a response, if we pinged and didn't get anything back in 2 seconds, consider that peer down.
const connected = keepalive

module.exports = () => ({
  keepalive, bdp, bdpMaxPackets, connecting, connected,
})