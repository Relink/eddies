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

var actor = proxyquire('./node', {
  'request-promise': requestMock
});

describe('node', () => {

  describe('run', () => {
    var s1, s2, ee;
    var read = sinon.stub();

    var proxyMaker = sinon.stub().returns('proxy');

    var createOptions = function (input, proxy) {
      return {
        url: input,
        proxy: proxy || proxyMaker(),
        agent: 'agent'
      }
    }

    beforeEach(() => {
      s1 = new stream.Readable({ objectMode: true });
      s1._read = read;

      s2 = new stream.Transform({ objectMode: true, highWaterMark: 2});
      s2._transform = (d, e, cb) => cb(null, d);

      s3 = new stream.Writable({ objectMode: true})
      s3._write = sinon.stub();

      onError = sinon.stub();

      requestMock.reset();
      proxyMaker.reset();
    });

    it('responds to backpressure from consuming stream', done => {
      requestMock.returns(Promise.resolve('foo'));
      var messages = [];

      var spy = sinon.spy(s2, 'write');
      sinon.stub(s1, 'read', () => 'url');

      s2.on('data', data => {
        messages.push(data)
        if (spy.callCount === 2) {
          s2.write = () => false;
          setTimeout(() => {
            expect(messages).to.have.length(2);
            expect(messages[1]).to.have.property('res', 'foo')
            expect(requestMock).to.have.been.calledThrice;
            done();
          }, 0)
        }
      });

      actor.run(s1, s2, s3, onError, createOptions);
    });

    it('recursively calls itself with the same proxy', done => {
      requestMock.onCall(0).returns(Promise.resolve('foo'));
      requestMock.onCall(1).returns(Promise.resolve('foo'));

      s1.push('url');
      s1.push('url');
      s1.push(null);

      actor
        .run(s1, s2, s3, onError, createOptions)
        .then(() => {
          expect(requestMock.secondCall.args[0]).to.contain.property('proxy', 'proxy');
          done();
        })
    });

    it('retuns a promise that resolves and stops when input runs out', done => {
      requestMock.returns(Promise.resolve({ body: 'foo'}))

      s1.push('url')
      s1.push('url')
      s1.push(null);

      actor
        .run(s1, s2, s3, onError, createOptions)
        .then(() => {
          expect(requestMock).to.have.been.calledTwice;
          done();
        })
    });

    it('gives up on the link and recurses with same proxy when given a 404', done  =>{
      var error = new errors.StatusCodeError(404, 'not found');
      requestMock.onCall(0)
        .returns(Promise.reject(error))
      requestMock.onCall(1)
        .returns(Promise.resolve('foo'));

      s1.push('url1')
      s1.push('url2')
      s1.push(null);

      sinon.stub(s3, 'write');
      sinon.stub(s2, 'write');

      proxyMaker
        .onCall(0).returns('proxy1')
        .onCall(1).returns('proxy2');

      actor
        .run(s1, s2, s3, onError, createOptions)
        .then(() => {
          expect(requestMock).to.have.been.calledTwice;
          expect(requestMock.secondCall.args[0]).to.have.property('url', 'url2')
          expect(requestMock.firstCall.args[0]).to.have.property('proxy', 'proxy1');
          expect(requestMock.secondCall.args[0]).to.have.property('proxy', 'proxy1');
          expect(s3.write).not.to.have.been.called;
          expect(s2.write).to.have.been.calledOnce;
          expect(s2.write.firstCall.args[0]).to.have.property('input', 'url2')
          expect(onError).to.have.been.calledWith(error);
          done();
        })
    });

    it('puts the link back on the queue when given a 403, crawls with new proxy ' +
       'and listens to backpressure from queue', done  =>{
         var error = new errors.StatusCodeError(403, 'no');

         requestMock.onCall(0)
           .returns(Promise.resolve('foo'))
         requestMock.onCall(1)
           .returns(Promise.reject(error));
         requestMock.onCall(2)
           .returns(Promise.resolve('foo'));

         s1.push('url1')
         s1.push('url2')
         s1.push('url3')
         s1.push(null);

         proxyMaker
           .onCall(0).returns('proxy1')
           .onCall(1).returns('proxy2');
         sinon.stub(s3, 'write');

         actor
           .run(s1, s2, s3, onError, createOptions)
           .then(() => {
             s3.emit('drain');
             expect(s3.write).to.have.been.calledWith('url2');
             expect(s3.write).to.have.been.calledTwice;
             expect(onError).to.have.been.calledWith(error);
             expect(requestMock.firstCall.args[0]).to.have.property('proxy', 'proxy1')
             expect(requestMock.secondCall.args[0]).to.have.property('url', 'url2')
             expect(requestMock.thirdCall.args[0]).to.have.property('proxy', 'proxy2')
             done();
           })
    });

    it('resolves immediately if theres nothing to read from the queue', done => {

      actor.run(s1, s2, s3, sinon.stub(), url => url)
        .then(() => {
          expect(requestMock).to.not.have.been.called;
          done();
        });
    });
  })
})
