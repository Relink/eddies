// sepc.js
var chai = require('chai');
chai.use(require('sinon-chai'));
var Promise = require('bluebird');
var expect = chai.expect;
var sinon = require('sinon');
var _ = require('lodash');
var stream = require('stream');
var proxyquire = require('proxyquire');
var EventEmitter = require('events').EventEmitter;
var errors = require('request-promise/errors');

var copperMock = {
  write: sinon.stub().returns(Promise.resolve(null))
}

var actor = proxyquire('./actor', {
  '@relinklabs/copper': copperMock
});

describe('actor', () => {
  var s1, s2, ee;

  beforeEach(() => {
    s1 = new stream.Readable({ objectMode: true, read: sinon.stub() });
    s2 = new stream.Transform({ objectMode: true, highWaterMark: 2});
    s2._transform = (d, e, cb) => cb(null, d);
  });

  describe('_consume', () => {
    var transform, ee;

    beforeEach(() => {
      copperMock.write.reset();
      transform = sinon.stub();
      ee = new EventEmitter();
    });

    it('calls transform with input from stream', done => {
      transform.returns(Promise.resolve({}))

      s1.push('url1');
      actor
        ._consume(s1, s2, transform, ee)
        .then(() => {
          expect(transform).to.be.calledWith('url1')
          done();
        });
    });

    it('recurses on itself with passed params while the going is good', done => {
      transform.returns(Promise.resolve({params: 'foo' }))

      s1.push('url1');
      s1.push('url2');
      s1.push(null);

      actor
        ._consume(s1, s2, transform, ee)
        .then(() => {
          expect(transform).to.have.been.calledTwice;
          expect(transform.secondCall.args[1]).to.equal('foo')
          expect(transform.secondCall.args[0]).to.equal('url2');
          done();
        });
    });

    it('rejects when transform throws', done => {
      var error = new Error('foo');
      transform.returns(Promise.reject(error))
      s1.push('url1');
      s1.push('url2');
      s1.push(null);

      actor
        ._consume(s1, s2, transform, ee)
        .catch(err => {
          expect(copperMock.write).to.not.have.been.called;
          expect(err).to.equal(error);
          done();
        });
    });
  });

  describe('start', () => {
    var consumeStub = sinon.stub();
    before(() => {
      sinon.stub(actor, '_consume', consumeStub)
    })
    beforeEach(() => {
      actor._consume.reset();
    });
    after( () => actor._consume.restore());

    it('emits on end event only after the consumer resolves as finished', done  => {
      var resolve;
      var promise = new Promise((_resolve, __) => {
        resolve = _resolve
      });

      consumeStub.returns(promise);

      var ended = false;
      var e = actor.start(s1, s2);
      e.on('end', () => {
        ended = true;
        process.nextTick(() => {
          expect(e.listenerCount('end')).to.equal(0);
          expect(e.listenerCount('error')).to.equal(0);
          done();
        });
      });

      setTimeout(() => {
        expect(ended).to.be.false;
        resolve();
      });
    });

    it('emits an error event if the consumer rejects', done => {
      var error = new Error('foo');
      consumeStub.returns(Promise.reject(error));

      var a = actor.start(s1, s2);
      a.on('error', err => {
        expect(err).to.equal(error);
        process.nextTick(() => {
          expect(a.listenerCount('error')).to.equal(0)
          done();
        });
      });
    });

    it('emits an error event if consumer throws for any reason', done => {
      consumeStub.throws();
      var a = actor.start(s1, s2);
      a.on('error', err => {
        expect(err).to.be.an('error');
        process.nextTick(() => {
          expect(a.listenerCount('error')).to.equal(0);
          done();
        });
      });
    });
  });
});
