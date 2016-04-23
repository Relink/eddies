var chai = require('chai');
chai.use(require('sinon-chai'));
var Promise = require('bluebird');
var expect = chai.expect;
var sinon = require('sinon');
var _ = require('lodash');
var stream = require('stream');
var EventEmitter = require('events').EventEmitter;
var proxyquire = require('proxyquire');
var supervisor = require('./supervisor');

describe('eddies functional tests', () => {
  var s1, s2, config, transform;

  beforeEach(() => {
    s1 = new stream.Readable({ objectMode: true, highwaterMark: 2 });
    s1._read = sinon.stub();

    s2 = new stream.PassThrough({ objectMode: true, highWaterMark: 2});

    config = {};
    transform = sinon.stub();
  });

  it('works with stops and restarts after success', done => {

    config = { number: 1 };
    transform.returns(Promise.resolve({ message: 'foo' }));
    var finishStub = sinon.stub();
    var successStub = sinon.stub();

    console.log(supervisor)
    s1
      .pipe(supervisor.start(config, transform))
      .on('error', err => expect(err).not.to.exist)
      .on('eddies:success', successStub)
      .on('eddies:finish', finishStub)
      .pipe(s2)

    // simulate single input
    s1.push(1);
    setTimeout(() => {

      // should finish due to reaching end of input
      expect(s2.read()).to.equal('foo');
      expect(successStub).to.have.been.calledOnce;
      expect(finishStub).to.have.been.calledOnce;

      s1.push(2);

      setTimeout(() => {
        // Should continue to read.
        expect(s2.read()).to.equal('foo');
        expect(successStub).to.have.been.calledTwice;
        expect(finishStub).to.have.been.calledTwice;
        done();
      }, 30)

    }, 30);
  });

  it('works with stops and restarts after errors', done => {

    config = { number: 1 };
    transform.returns(Promise.reject(new Error('foo')));
    var finishStub = sinon.stub();
    var successStub = sinon.stub();
    var warnStub = sinon.stub();

    s1
      .pipe(supervisor.start(config, transform))
      .on('error', err => expect(err).not.to.exist)
      .on('eddies:warn', warnStub)
      .on('eddies:success', successStub)
      .on('eddies:finish', finishStub)
      .pipe(s2)

    // simulate single input that will error due to
    // transform stub:
    s1.push(1);
    setTimeout(() => {

      // should finish due to reaching end of input
      expect(s2.read()).to.equal(null);
      expect(warnStub).to.have.been.calledOnce;
      expect(finishStub).to.have.been.calledOnce;

      // send a message that does not error
      transform.returns(Promise.resolve({ message: 'foo' }))
      s1.push(2);

      setTimeout(() => {
        // Should continue to read.
        expect(s2.read()).to.equal('foo');
        expect(successStub).to.have.been.calledOnce;
        expect(finishStub).to.have.been.calledTwice;
        done();
      }, 30)

    }, 30);
  });
});
