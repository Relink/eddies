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
  var s1, s2, s3, s4, config, transform;

  beforeEach(() => {
    s1 = new stream.Readable({ objectMode: true, highwaterMark: 2 });
    s1._read = sinon.stub();

    s2 = new stream.Transform({ objectMode: true, highWaterMark: 2});
    s2._transform = (d, e, cb) => cb(null, d);

    s3 = new stream.Writable({ objectMode: true });
    s3._write = () => { return true };

    s4 = new stream.Duplex({ objectMode: true, highWaterMark: 2,
                             read: sinon.stub(), write: sinon.stub()})

    config = {};
    transform = sinon.stub();

    actorMock.start.reset();
  });

  describe('_trackErrors', () => {
    it('does not throw if successes come', () => {
      var ee = new EventEmitter()
      supervisor._trackErrors(2, ee)
      ee.emit('eddies:warn');
      ee.emit('eddies:warn');
      ee.emit('eddies:success');
      ee.emit('eddies:warn');
    });

    it('throws if more errors than number given', () => {
      var ee = new EventEmitter()
      supervisor._trackErrors(1, ee)
      ee.emit('eddies:warn');
      expect(ee.emit.bind(ee, 'eddies:warn')).to.throw();
    });
  });

  describe('_startActors', () => {
    var errorCb, endCb, e1, errorEmitter;

    beforeEach(() => {
      errorCb = sinon.stub();
      endCb = sinon.stub();
      e1 = new EventEmitter();
      errorEmitter = new EventEmitter();
    });

    it('recycles, restarts, and reports an error', done => {
      var error = new Error('foo');
      error.originalInput = 'bar';
      actorMock.start.returns(e1);

      sinon.stub(s3, 'write', () => true);

      errorEmitter.on('eddies:warn', err => {
        expect(err).to.be.an('error');

        // give next tick so actor.start gets called again
        process.nextTick(() => {
          expect(s3.write).to.have.been.calledWith('bar');
          expect(actorMock.start).to.have.been.calledTwice;
          expect(actorMock.start.firstCall.args)
            .to.deep.equal([s1, s2, transform])
          done();
        });
      });

      supervisor._startActors(1, s1, s2, errorEmitter, transform, {rc: s3}, endCb);
      e1.emit('error', error);
    });

    it('asynchronously starts the number of actors it is asked to start', done => {
      actorMock.start.returns(e1);
      supervisor._startActors(4, s1, s2, errorEmitter, transform, config, endCb);
      setTimeout(() => {
        expect(actorMock.start.callCount).to.equal(4);
        done();
      }, 20);
    });

    it('handles errors even when no rc given', done => {
      actorMock.start.returns(e1);
      supervisor._startActors(1, s1, s2, errorEmitter, transform, config, endCb);
      errorEmitter.on('eddies:warn', err => {
        expect(err).to.be.an.error;
        done();
      });
      e1.emit('error', new Error('foo'));
    });
  });

  describe('_runProxies', () => {
    var endCb;

    before(() => {
      var startActorMock = function (num, src, dest, rc, ee, config, _endCb){
        endCb = _endCb;
      }
      sinon.stub(supervisor, '_startActors', startActorMock);
    });

    after(() => supervisor._startActors.restore())

    it('does not resolve until endCb called enough times', done => {
      var resolved = false;

      supervisor._runProxies(s1, s2, s4, transform, {number: 2, errorCount: 1})
        .then(res => {
          resolved = true;
        });

      endCb();
      setTimeout(() => {
        expect(resolved).to.be.false;
        done();
      });
    });

    it('resolves when the endCb is called and it has called startActors', done  => {
      var resolved = false;
      supervisor._runProxies(s1, s2, s4, transform, {number: 3, errorCount: 1})
        .then(res => {
          resolved = true;
          expect(supervisor._startActors).to.have.been.calledWith(3);
          done();
        })
      endCb();
      endCb();
      endCb();
      expect(resolved).to.be.false;
    });
  });


  describe('start', () => {

    before(() => sinon.stub(supervisor, '_runProxies'));
    beforeEach(() => supervisor._runProxies.reset());
    after(() => supervisor._runProxies.restore());

    it('propogates errors to returned stream', done => {
      supervisor._runProxies.returns(Promise.reject(new Error('foo')));
      supervisor.start(config, transform, s1, s2, s3)
        .on('error', err => {
          expect(err).to.be.an.error;
          done();
        });
      s1.push(1)
    });

    it('removes the listener so that it doesnt call runProxies more than once', done => {
      supervisor._runProxies.returns(new Promise((resolve, reject) => true));
      supervisor.start(config, transform, s1, s2, s3);
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
      var stream = supervisor.start(config, transform, s1, s2, s3);
      expect(supervisor._runProxies).not.to.have.been.called;
      s1.push(1);

      // this setTimeout simulates the first readable event
      setTimeout(() => {
        expect(supervisor._runProxies).to.have.been.calledOnce;

        // By reading the queue empty, we create the conditions for the
        // readable event to fire again.
        s1.read();
        resolve();
        setTimeout(() => {

          // After we have resolved the promise, simulating the finish of the proxy
          // actors, we push more data onto the queue, simulating new data. This
          // triggers a new readable evetn.
          s1.push(2);

          setTimeout(() => {
            expect(supervisor._runProxies.callCount).to.equal(2);
            done();
          })

        });
      });
    });

    it('returns a readable stream', done => {
      var stream = supervisor.start(s3, config);

      stream.on('readable', () => {
        expect(stream.read()).to.equal(1);
        expect(stream.read()).to.equal(2);
        done();
      });

      stream.push(1);
      stream.push(2);
    });
  });


});
