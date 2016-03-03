## proxy spec

* input as stream
* handles distinct number of concurrent connnections to proxy -- via Agent.connections
* backpressures on the stream based on the concurrent connection (BufferStream)
* calls the proxy and gets response
* outputs to given stream

### luminati specific:
* session id refers to a session, which invovles a single exit node. We keep our connection to th exit node until we get some error saying linkedin is blocking us or until x amoutn of requests?

* occasionally a super-proxy should be switched because it's getting slow or things are failing??? Do a re-DNS lookup whenever this happens to get new super proxy???

* They are making one pool with connections to a single exit-node/ip, and minimizing the connections to that IP just by minimizing the total requests made by that ip.

* request with pool, and forever agent, will use the same agent in consequtive requests
