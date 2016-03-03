var chai = require('chai');
chai.use(require('sinon-chai'));
var Promise = require('bluebird');
var expect = chai.expect;
var sinon = require('sinon');
var _ = require('lodash');
var stream = require('stream');
var EventEmitter = require('events').EventEmitter;
var proxyquire = require('proxyquire');

var actorMock = {
  start: sinon.stub()
};

var supervisor = proxyquire('./supervisor', {
  './actor': actorMock
});

describe('supervisor', () => {
  var s1, s2, s3, config;

  beforeEach(() => {
    s1 = new stream.Readable({ objectMode: true });
    s1._read = sinon.stub();

    s2 = new stream.Transform({ objectMode: true, highWaterMark: 2});
    s2._transform = (d, e, cb) => cb(null, d);

    s3 = new stream.Writable({ objectMode: true });
    s3._write = () => { return true };

    s4 = new stream.Readable({ objectMode: true, highWaterMark: 2 });
    s4._read = sinon.stub();

    s5 = new stream.Readable({ objectMode: true, highWaterMark: 2000 });
    s5._read = sinon.stub();

    s6 = new stream.PassThrough({ objectMode: true, highWaterMark: 2 });

    config = {
      createOptions: 'createOptions',
      newProxy: 'newProxy'
    };

    actorMock.start.reset();
  })


  describe('_startActors', () => {
    var errorCb, endCb;

    beforeEach(() => {
      errorCb = sinon.stub();
      endCb = sinon.stub();
    });

    it('recycles, restarts, and reports an error', done => {
      var e1 = new EventEmitter();
      var error = new Error('foo');
      error.originalInput = 'bar';
      actorMock.start.returns(e1);

      sinon.stub(s3, 'write', () => true);

      s2.on('error', err => {
        expect(err).to.be.an('error');

        // give next tick so actor.start gets called again
        process.nextTick(() => {
          expect(s3.write).to.have.been.calledWith('bar');
          expect(actorMock.start).to.have.been.calledTwice;
          done();
        });
      });

      supervisor._startActors(1, s1, s2, s3, config, endCb);
      e1.emit('error', error);
    });

    it('synchronously starts the number of actors it is asked to start', () => {
      supervisor._startActors(4, s1, s2, s3, config, errorCb, endCb);
      expect(actorMock.start.callCount).to.equal(4);
    });
  });

  describe('start', () => {
    beforeEach(() => {
      supervisor._runProxies = sinon.stub();
    });

    it('removes the listener so that it doesnt call runProxies more than once', done => {
      supervisor._runProxies.returns(new Promise((resolve, reject) => true));
      supervisor.start(s1, s3, config, s2);
      s1.push(1);
      s1.push(2);
      process.nextTick(() => {
        s1.push(3);
        process.nextTick(() => {
          expect(supervisor._runProxies).to.have.been.calledOnce;
          done();
        });
      });
    });

    it('adds a listener to restart after runProxies finishes', done => {
      var resolve;
      supervisor._runProxies.returns(new Promise((_resolve, reject) => resolve = _resolve));

      var stream = supervisor.start(s3, config);
      s1.pipe(stream);
      expect(supervisor._runProxies).not.to.have.been.called;
      console.log('prior to first push, is paused: ', s1.isPaused())
      s1.push(1);
      console.log('first push is paused:', s1.isPaused())
      // this setTimeout simulates the first readable event
      setTimeout(() => {
        expect(supervisor._runProxies).to.have.been.calledOnce;

        // By reading the queue empty, we create the conditions for the
        // readable event to fire again.
        // console.log(stream.read());
        console.log(s1.read());
        console.log(s1.isPaused())
        s1.read();
        // console.log(stream.read());

        resolve();

        setTimeout(() => {

          // After we have resolved the promise, simulating the finish of the proxy
          // actors, we push more data onto the queue, simulating new data. This
          // triggers a new readable evetn.
          s1.push(2);

          setTimeout(() => {
            expect(supervisor._runProxies.callCount).to.equal(2);
            expect(s1.listeners('readable')).to.have.length(0);
            done();
          })

        });
      });
    });


    it('returns a readable stream', done => {
      var stream = supervisor.start(s3, config);

      stream.on('readable', () => {
        console.log('readable')
        expect(stream.read()).to.equal(1);
        expect(stream.read()).to.equal(2);
        done();
      });

      stream.push(1);
      stream.push(2);
    });
  });

  describe('_trackErrors', () => {

    it('does not throw when given few errors', () => {
      var cb = supervisor._trackErrors(2, 100, s1);
      cb(new Error('foo'));
      cb(new Error('bar'));
    });

    it('throws when given too many errors in the time period', () => {
      var cb = supervisor._trackErrors(1, 100, s1);
      cb(new Error('foo'));
      expect(cb.bind(null, new Error('bar'))).to.throw(/halt/);
    });
  });

  describe('_createStreams', () => {

    it('creates a direct connection between input stream and src ', done => {
      var input = stream.Readable({ objectMode: true, highWaterMark: 2, read: sinon.stub() });
      var created = supervisor.createStreams();
      var ext = created.ext;
      var src = created.src;

      sinon.stub(src, 'push', src.push);
      sinon.stub(ext, 'write', ext.write)

      input.pipe(ext);

      var i = 0;
      var pushResults = []
      while (++i <= 3) pushResults.push(input.push(i));

      expect(pushResults).to.deep.equal([true, false, false]);
      expect(src.push.callCount).to.equal(0);
      expect(ext.write.callCount).to.equal(0);
      expect(input._read.callCount).to.equal(0)

      setTimeout(() => {

        // Note: this shows that these are all asyncrhonous:
        expect(src.push.callCount).to.equal(3);
        expect(ext.write.callCount).to.equal(3);
        expect(input._read.callCount).to.equal(1)
        var j = 0;
        var readResults = [];
        while(++j <= 3) readResults.push(src.read());

        expect(readResults).to.deep.equal([1,2,3]);
        done();
      })
    });

    it.only('src will cause more read calls from the input', done => {

      // --------------------------------------------
      // this mess simulates our kafka consumer stream
      // ---------------------------------------------

      var consumer = new EventEmitter();
      var paused = true;
      var i = 0;

      function emit (consumer) {
        if (paused) return;
        consumer.emit('data', ++i);
        setTimeout(() => {
          emit(consumer)
        }, 100)
      }

      consumer.on('resume', () => {
        paused = false;
        emit(consumer);
      })

      consumer.on('pause', () => {
        paused = true;
      })

      function reader () {
        consumer.emit('resume');
      }

      var input = stream.Readable({ objectMode: true, highWaterMark: 2, read: reader });

      consumer.on('data', data => {
        if (!input.push(data)) {
          consumer.emit('pause');
        }
      });

      // ------------------------------------------------
      // end mess
      // ------------------------------------------------

      var created = supervisor.createStreams();
      var ext = created.ext;
      var src = created.src;

      src._readableState.highWaterMark = 2;
      ext._writableState.highWaterMark = 3;

      sinon.stub(src, 'push', src.push);
      sinon.stub(ext, 'write', ext.write);
      sinon.stub(input, 'push', input.push);

      input.on('readable', _.noop); // kick off

      input
        .pipe(ext);

      // nothing should happen syncrhonously
      expect(src.push.callCount).to.equal(0);

      setTimeout(() => {

        // Here we see the effects of buffering that builds up
        // before the emitter is stopped.
        expect(input.push.callCount).to.equal(6);
        expect(ext.write.callCount).to.equal(4);
        expect(src.push.callCount).to.equal(2);

        // read 6 times
        var firstReads = [];
        var i = 0;
        while (++i <= 6) firstReads.push(src.read());
        expect(firstReads).to.deep.equal([1,2,3,4,5,6]);

        // reading 6 times should have called the input.push
        // function 6 more times, and filled up all the other
        // buffers along the way.
        expect(input.push.callCount).to.equal(12);
        expect(ext.write.callCount).to.equal(10);
        expect(src.push.callCount).to.equal(8);

        done();
      })
    })
  });
});
