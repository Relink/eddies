// sepc.js
var chai = require('chai');
chai.use(require('sinon-chai'));
var Promise = require('bluebird');
var expect = chai.expect;
var sinon = require('sinon');
var _ = require('lodash');
var nock = require('nock');
var stream = require('stream');
var proxyquire = require('proxyquire');
var EventEmitter = require('events').EventEmitter;
var errors = require('request-promise/errors');

var requestMock = sinon.stub();

var actor = proxyquire('./actor', {
  'request-promise': requestMock
});

describe('actor', () => {
  var s1, s2, ee, createOptions;
  var newProxy = sinon.stub();

  beforeEach(() => {
    s1 = new stream.Readable({ objectMode: true });
    s1._read = sinon.stub();

    s2 = new stream.Transform({ objectMode: true, highWaterMark: 2});
    s2._transform = (d, e, cb) => cb(null, d);

    createOptions = function (input) {
      return {
        url: input,
        agent: 'agent'
      }
    };

    requestMock.reset();
    newProxy.reset();
  });


  describe('_write', () => {

    it('calls the callback immediately if the write queue is open', done => {
      actor._write(s2, 'foo').then(done);
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
    beforeEach(() => {
      actor._write = sinon.stub().returns(Promise.resolve(null));

      newProxy
        .onCall(1).returns('proxy1')
        .onCall(2).returns('proxy2')
    });

    it('calls request with the results of createOptions', done => {
      var createOptions = sinon.stub().returns('foo');
      s1.push('url1');
      actor
        ._consume(s1, s2, createOptions, newProxy)
        .then(() => {
          expect(requestMock).to.be.calledWith('foo')
          done();
        });
    });

    it('recurses on itself with the same proxy while the going is good', done => {
      requestMock.returns(Promise.resolve('html'));

      s1.push('url1');
      s1.push('url2');
      s1.push(null);

      actor
        ._consume(s1, s2, createOptions, newProxy)
        .then(() => {
          expect(requestMock).to.have.been.calledTwice;
          expect(requestMock.secondCall.args[0]).to.have.property('url', 'url2');
          expect(requestMock.secondCall.args[0]).to.have.property('proxy', 'proxy1');
          expect(actor._write.secondCall.args[1]).to.have.property('res', 'html');
          done();
        });
    });

    it('recurses on itself with the same proxy when given 404s', done => {
      requestMock.returns(Promise.reject(new errors.StatusCodeError(404, 'not found')));

      s1.push('url1');
      s1.push('url2');
      s1.push(null);

      actor
        ._consume(s1, s2, createOptions, newProxy)
        .then(() => {
          expect(requestMock).to.have.been.calledTwice;
          expect(requestMock.secondCall.args[0]).to.have.property('url', 'url2');
          expect(requestMock.secondCall.args[0]).to.have.property('proxy', 'proxy1');
          done();
        });
    });

    it('rejects when it gets errors other than 404', done => {
      var error = new errors.StatusCodeError(403, 'no way jose');
      requestMock.returns(Promise.reject(error));

      s1.push('url1');
      s1.push('url2');
      s1.push(null);

      actor._write = sinon.stub();

      actor
        ._consume(s1, s2, createOptions, newProxy)
        .catch(err => {
          expect(requestMock).to.have.been.calledOnce;
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
      var e = actor.start(s1, s2, createOptions);
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

      var a = actor.start(s1, s2, createOptions);
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
      var a = actor.start(s1, s2, createOptions);
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
