## introducer

This is a minimum useful hole punching p2p library, for udp.

### A Brief History of the Internet (with respect to p2p connections)

In the beginning the internetwork was "hosts" every host could communicate with each other,
because everyone had an ip address. But then the internet got quite popular.
Because the ip address was encoded in 4 byte value there are only about 4 billion possibilites,
(usually rendered as 4 base ten numbers separated by `.`, `w.x.y.z`)
but now there are more devices than that on the internet.
They tried to invent a better system, ipv6, using 16 bytes per address
(which is enough for every bacteria to have their own ip address)
but for some reason it's still not rolled out everywhere.

So people invented a simple way to enable many nodes to share the same ip addresses.
"Network Address Translation". In this means instead of one peer using one ip address,
and whatever (of 65536) ports it needs, each peer has a local address, and chooses a port,
but the NAT translates that so to the outside world sees the NAT's address and port.

The NAT saves us from not having enough IP addresses to go around, but it does so at a severe cost!
It is now no longer easy to make a connection between any two hosts.
Imagine if phones could be used to call businesses, but not regular people. Businesses would have to spend
extra money on special phones that can receive calls. That's what the internet is like with NAT.

### "hole punching"

However, there is a solution, or at least some work arounds. (this is where this module comes in)
there is "holepunching". With some careful timing, peers can still connect to each other.
It's a lot more complicated than it would have been if everyone had ipv6, but it is what we have to do.

There are a variety of techniquest, but generally it requires two peers to connect to each other at the same time,
coordinated by a 3rd peer (possibly a server)

In the simple version, the nat gives you a port, but lets you use that that same external port to communicate with different hosts. So you can figure out what that port is, by pinging someone on the outside.
Then you give your external port ip

#### "easy nat"

First you figure out what your external ip address and port will be (by pinging
a peer with a stable address and no nat, aka, a server) and then coordinate with the peer to start to start a connection. That is, means forward a "please connect to me now" via another peer they are already connected to.
Now, both peer's nat will see you are sending packets out, and see packets coming in, and think "ah these incoming packets are the replies" and let them through. Now you are connected.
 
If the nat gives you a port and lets you use the same one to communicate with many other peers, then it's easy
to connect like this. Hence, we call that an "easy nat". Usually a home wifi router will be an easy nat.

#### hard nat

Sometimes a nat wants to give you a different port when you send a packet to a different peer, this makes things much more difficult so it's called a "hard nat". Unfortunately, because you get a port each time,
you can't just ask another peer what port you have. That peer will see a different port. So the other end has to _guess_ what port you have been given. This would normally take a while, because there are 65,536 possibilities.
But! there is a work around - the peer on the hard nat can open _many ports_, and then the other end only needs to guess _one_ of them.

However, if both peers are behind hard nats, they are both getting assigned random ports, it becomes significantly more difficult still, and impractically so. It would take far too long to guess ports in this case. So it's necessary instead to relay those messages via another peer that they can connect to.

