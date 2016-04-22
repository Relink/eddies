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

var actor = require('./actor')

describe('actor', () => {
  var s1, s2, ee;

  beforeEach(() => {
    s1 = new stream.Readable({ objectMode: true, read: sinon.stub() });
    s2 = new stream.Transform({ objectMode: true, highWaterMark: 2});
    s2._transform = (d, e, cb) => cb(null, d);
  });

  describe('_write', () => {

    it('calls the callback immediately if the write queue is open', done => {
      actor._write(s2, 'foo').then(() => done());
    });

    it('calls the callback after drain, if the write queue is full', done => {

      s2.write = sinon.stub();
      s2.write.returns(false);
      var resolved = false;

      actor
        ._write(s2, 'foo')
        .then(() => {
          resolved = true;
          done();
        });

      setTimeout(() => {
        expect(resolved).to.be.false;
        s2.write.returns(true);
        s2.emit('drain');
      });
    });
  });

  describe('_consume', () => {
    var transform, ee;

    beforeEach(() => {
      actor._write = sinon.stub().returns(Promise.resolve(null));
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

      actor._write = sinon.stub();

      actor
        ._consume(s1, s2, transform, ee)
        .catch(err => {
          expect(actor._write).to.not.have.been.called;
          expect(err).to.equal(error);
          done();
        });
    });
  });

  describe('start', () => {
    beforeEach(() => {
      actor._consume = sinon.stub();
    });

    it('emits on end event only after the consumer resolves as finished', done  => {
      var resolve;
      var promise = new Promise((_resolve, __) => {
        resolve = _resolve
      });

      actor._consume.returns(promise);

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
      actor._consume.returns(Promise.reject(error));

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
      actor._consume.throws();
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
