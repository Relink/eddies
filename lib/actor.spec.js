'use strict';

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

var actor = require('./actor');

describe('actor', function () {
  var s1, s2, ee;

  beforeEach(function () {
    s1 = new stream.Readable({ objectMode: true, read: sinon.stub() });
    s2 = new stream.Transform({ objectMode: true, highWaterMark: 2 });
    s2._transform = function (d, e, cb) {
      return cb(null, d);
    };
  });

  describe('_write', function () {

    it('calls the callback immediately if the write queue is open', function (done) {
      actor._write(s2, 'foo').then(function () {
        return done();
      });
    });

    it('calls the callback after drain, if the write queue is full', function (done) {

      s2.write = sinon.stub();
      s2.write.returns(false);
      var resolved = false;

      actor._write(s2, 'foo').then(function () {
        resolved = true;
        done();
      });

      setTimeout(function () {
        expect(resolved).to.be.false;
        s2.write.returns(true);
        s2.emit('drain');
      });
    });
  });

  describe('_consume', function () {
    var transform, ee;
    var writeStub = sinon.stub();

    before(function () {
      return sinon.stub(actor, '_write', writeStub);
    });
    beforeEach(function () {
      writeStub.returns(Promise.resolve(null));
      actor._write.reset();
      transform = sinon.stub();
      ee = new EventEmitter();
    });
    after(function () {
      return actor._write.restore();
    });

    it('calls transform with input from stream', function (done) {
      transform.returns(Promise.resolve({}));

      s1.push('url1');
      actor._consume(s1, s2, transform, ee).then(function () {
        expect(transform).to.be.calledWith('url1');
        done();
      });
    });

    it('recurses on itself with passed params while the going is good', function (done) {
      transform.returns(Promise.resolve({ params: 'foo' }));

      s1.push('url1');
      s1.push('url2');
      s1.push(null);

      actor._consume(s1, s2, transform, ee).then(function () {
        expect(transform).to.have.been.calledTwice;
        expect(transform.secondCall.args[1]).to.equal('foo');
        expect(transform.secondCall.args[0]).to.equal('url2');
        done();
      });
    });

    it('rejects when transform throws', function (done) {
      var error = new Error('foo');
      transform.returns(Promise.reject(error));
      s1.push('url1');
      s1.push('url2');
      s1.push(null);

      actor._consume(s1, s2, transform, ee).catch(function (err) {
        expect(actor._write).to.not.have.been.called;
        expect(err).to.equal(error);
        done();
      });
    });
  });

  describe('start', function () {
    var consumeStub = sinon.stub();
    before(function () {
      sinon.stub(actor, '_consume', consumeStub);
    });
    beforeEach(function () {
      actor._consume.reset();
    });
    after(function () {
      return actor._consume.restore();
    });

    it('emits on end event only after the consumer resolves as finished', function (done) {
      var resolve;
      var promise = new Promise(function (_resolve, __) {
        resolve = _resolve;
      });

      consumeStub.returns(promise);

      var ended = false;
      var e = actor.start(s1, s2);
      e.on('end', function () {
        ended = true;
        process.nextTick(function () {
          expect(e.listenerCount('end')).to.equal(0);
          expect(e.listenerCount('error')).to.equal(0);
          done();
        });
      });

      setTimeout(function () {
        expect(ended).to.be.false;
        resolve();
      });
    });

    it('emits an error event if the consumer rejects', function (done) {
      var error = new Error('foo');
      consumeStub.returns(Promise.reject(error));

      var a = actor.start(s1, s2);
      a.on('error', function (err) {
        expect(err).to.equal(error);
        process.nextTick(function () {
          expect(a.listenerCount('error')).to.equal(0);
          done();
        });
      });
    });

    it('emits an error event if consumer throws for any reason', function (done) {
      consumeStub.throws();
      var a = actor.start(s1, s2);
      a.on('error', function (err) {
        expect(err).to.be.an('error');
        process.nextTick(function () {
          expect(a.listenerCount('error')).to.equal(0);
          done();
        });
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,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Q0FBMEMsQ0FBMUMsRUFEcUI7QUFFckIsaUJBRnFCO1NBQU4sQ0FBakIsQ0FGbUI7T0FBUCxDQUFkLENBTHlEO0tBQVIsQ0FBbkQsQ0FuQ3NCOztBQWlEdEIsT0FBRyx3REFBSCxFQUE2RCxnQkFBUTtBQUNuRSxrQkFBWSxNQUFaLEdBRG1FO0FBRW5FLFVBQUksSUFBSSxNQUFNLEtBQU4sQ0FBWSxFQUFaLEVBQWdCLEVBQWhCLENBQUosQ0FGK0Q7QUFHbkUsUUFBRSxFQUFGLENBQUssT0FBTCxFQUFjLGVBQU87QUFDbkIsZUFBTyxHQUFQLEVBQVksRUFBWixDQUFlLEVBQWYsQ0FBa0IsRUFBbEIsQ0FBcUIsT0FBckIsRUFEbUI7QUFFbkIsZ0JBQVEsUUFBUixDQUFpQixZQUFNO0FBQ3JCLGlCQUFPLEVBQUUsYUFBRixDQUFnQixPQUFoQixDQUFQLEVBQWlDLEVBQWpDLENBQW9DLEtBQXBDLENBQTBDLENBQTFDLEVBRHFCO0FBRXJCLGlCQUZxQjtTQUFOLENBQWpCLENBRm1CO09BQVAsQ0FBZCxDQUhtRTtLQUFSLENBQTdELENBakRzQjtHQUFOLENBQWxCLENBL0ZzQjtDQUFOLENBQWxCIiwiZmlsZSI6ImFjdG9yLnNwZWMuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBzZXBjLmpzXG52YXIgY2hhaSA9IHJlcXVpcmUoJ2NoYWknKTtcbmNoYWkudXNlKHJlcXVpcmUoJ3Npbm9uLWNoYWknKSk7XG52YXIgUHJvbWlzZSA9IHJlcXVpcmUoJ2JsdWViaXJkJyk7XG52YXIgZXhwZWN0ID0gY2hhaS5leHBlY3Q7XG52YXIgc2lub24gPSByZXF1aXJlKCdzaW5vbicpO1xudmFyIF8gPSByZXF1aXJlKCdsb2Rhc2gnKTtcbnZhciBzdHJlYW0gPSByZXF1aXJlKCdzdHJlYW0nKTtcbnZhciBwcm94eXF1aXJlID0gcmVxdWlyZSgncHJveHlxdWlyZScpO1xudmFyIEV2ZW50RW1pdHRlciA9IHJlcXVpcmUoJ2V2ZW50cycpLkV2ZW50RW1pdHRlcjtcbnZhciBlcnJvcnMgPSByZXF1aXJlKCdyZXF1ZXN0LXByb21pc2UvZXJyb3JzJyk7XG5cbnZhciBhY3RvciA9IHJlcXVpcmUoJy4vYWN0b3InKVxuXG5kZXNjcmliZSgnYWN0b3InLCAoKSA9PiB7XG4gIHZhciBzMSwgczIsIGVlO1xuXG4gIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgIHMxID0gbmV3IHN0cmVhbS5SZWFkYWJsZSh7IG9iamVjdE1vZGU6IHRydWUsIHJlYWQ6IHNpbm9uLnN0dWIoKSB9KTtcbiAgICBzMiA9IG5ldyBzdHJlYW0uVHJhbnNmb3JtKHsgb2JqZWN0TW9kZTogdHJ1ZSwgaGlnaFdhdGVyTWFyazogMn0pO1xuICAgIHMyLl90cmFuc2Zvcm0gPSAoZCwgZSwgY2IpID0+IGNiKG51bGwsIGQpO1xuICB9KTtcblxuICBkZXNjcmliZSgnX3dyaXRlJywgKCkgPT4ge1xuXG4gICAgaXQoJ2NhbGxzIHRoZSBjYWxsYmFjayBpbW1lZGlhdGVseSBpZiB0aGUgd3JpdGUgcXVldWUgaXMgb3BlbicsIGRvbmUgPT4ge1xuICAgICAgYWN0b3IuX3dyaXRlKHMyLCAnZm9vJykudGhlbigoKSA9PiBkb25lKCkpO1xuICAgIH0pO1xuXG4gICAgaXQoJ2NhbGxzIHRoZSBjYWxsYmFjayBhZnRlciBkcmFpbiwgaWYgdGhlIHdyaXRlIHF1ZXVlIGlzIGZ1bGwnLCBkb25lID0+IHtcblxuICAgICAgczIud3JpdGUgPSBzaW5vbi5zdHViKCk7XG4gICAgICBzMi53cml0ZS5yZXR1cm5zKGZhbHNlKTtcbiAgICAgIHZhciByZXNvbHZlZCA9IGZhbHNlO1xuXG4gICAgICBhY3RvclxuICAgICAgICAuX3dyaXRlKHMyLCAnZm9vJylcbiAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIHJlc29sdmVkID0gdHJ1ZTtcbiAgICAgICAgICBkb25lKCk7XG4gICAgICAgIH0pO1xuXG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgZXhwZWN0KHJlc29sdmVkKS50by5iZS5mYWxzZTtcbiAgICAgICAgczIud3JpdGUucmV0dXJucyh0cnVlKTtcbiAgICAgICAgczIuZW1pdCgnZHJhaW4nKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnX2NvbnN1bWUnLCAoKSA9PiB7XG4gICAgdmFyIHRyYW5zZm9ybSwgZWU7XG4gICAgdmFyIHdyaXRlU3R1YiA9IHNpbm9uLnN0dWIoKTtcblxuICAgIGJlZm9yZSgoKSA9PiBzaW5vbi5zdHViKGFjdG9yLCAnX3dyaXRlJywgd3JpdGVTdHViKSlcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIHdyaXRlU3R1Yi5yZXR1cm5zKFByb21pc2UucmVzb2x2ZShudWxsKSk7XG4gICAgICBhY3Rvci5fd3JpdGUucmVzZXQoKTtcbiAgICAgIHRyYW5zZm9ybSA9IHNpbm9uLnN0dWIoKTtcbiAgICAgIGVlID0gbmV3IEV2ZW50RW1pdHRlcigpO1xuICAgIH0pO1xuICAgIGFmdGVyKCgpID0+IGFjdG9yLl93cml0ZS5yZXN0b3JlKCkpO1xuXG4gICAgaXQoJ2NhbGxzIHRyYW5zZm9ybSB3aXRoIGlucHV0IGZyb20gc3RyZWFtJywgZG9uZSA9PiB7XG4gICAgICB0cmFuc2Zvcm0ucmV0dXJucyhQcm9taXNlLnJlc29sdmUoe30pKVxuXG4gICAgICBzMS5wdXNoKCd1cmwxJyk7XG4gICAgICBhY3RvclxuICAgICAgICAuX2NvbnN1bWUoczEsIHMyLCB0cmFuc2Zvcm0sIGVlKVxuICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgZXhwZWN0KHRyYW5zZm9ybSkudG8uYmUuY2FsbGVkV2l0aCgndXJsMScpXG4gICAgICAgICAgZG9uZSgpO1xuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KCdyZWN1cnNlcyBvbiBpdHNlbGYgd2l0aCBwYXNzZWQgcGFyYW1zIHdoaWxlIHRoZSBnb2luZyBpcyBnb29kJywgZG9uZSA9PiB7XG4gICAgICB0cmFuc2Zvcm0ucmV0dXJucyhQcm9taXNlLnJlc29sdmUoe3BhcmFtczogJ2ZvbycgfSkpXG5cbiAgICAgIHMxLnB1c2goJ3VybDEnKTtcbiAgICAgIHMxLnB1c2goJ3VybDInKTtcbiAgICAgIHMxLnB1c2gobnVsbCk7XG5cbiAgICAgIGFjdG9yXG4gICAgICAgIC5fY29uc3VtZShzMSwgczIsIHRyYW5zZm9ybSwgZWUpXG4gICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICBleHBlY3QodHJhbnNmb3JtKS50by5oYXZlLmJlZW4uY2FsbGVkVHdpY2U7XG4gICAgICAgICAgZXhwZWN0KHRyYW5zZm9ybS5zZWNvbmRDYWxsLmFyZ3NbMV0pLnRvLmVxdWFsKCdmb28nKVxuICAgICAgICAgIGV4cGVjdCh0cmFuc2Zvcm0uc2Vjb25kQ2FsbC5hcmdzWzBdKS50by5lcXVhbCgndXJsMicpO1xuICAgICAgICAgIGRvbmUoKTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdCgncmVqZWN0cyB3aGVuIHRyYW5zZm9ybSB0aHJvd3MnLCBkb25lID0+IHtcbiAgICAgIHZhciBlcnJvciA9IG5ldyBFcnJvcignZm9vJyk7XG4gICAgICB0cmFuc2Zvcm0ucmV0dXJucyhQcm9taXNlLnJlamVjdChlcnJvcikpXG4gICAgICBzMS5wdXNoKCd1cmwxJyk7XG4gICAgICBzMS5wdXNoKCd1cmwyJyk7XG4gICAgICBzMS5wdXNoKG51bGwpO1xuXG4gICAgICBhY3RvclxuICAgICAgICAuX2NvbnN1bWUoczEsIHMyLCB0cmFuc2Zvcm0sIGVlKVxuICAgICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICBleHBlY3QoYWN0b3IuX3dyaXRlKS50by5ub3QuaGF2ZS5iZWVuLmNhbGxlZDtcbiAgICAgICAgICBleHBlY3QoZXJyKS50by5lcXVhbChlcnJvcik7XG4gICAgICAgICAgZG9uZSgpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ3N0YXJ0JywgKCkgPT4ge1xuICAgIHZhciBjb25zdW1lU3R1YiA9IHNpbm9uLnN0dWIoKTtcbiAgICBiZWZvcmUoKCkgPT4ge1xuICAgICAgc2lub24uc3R1YihhY3RvciwgJ19jb25zdW1lJywgY29uc3VtZVN0dWIpXG4gICAgfSlcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIGFjdG9yLl9jb25zdW1lLnJlc2V0KCk7XG4gICAgfSk7XG4gICAgYWZ0ZXIoICgpID0+IGFjdG9yLl9jb25zdW1lLnJlc3RvcmUoKSk7XG5cbiAgICBpdCgnZW1pdHMgb24gZW5kIGV2ZW50IG9ubHkgYWZ0ZXIgdGhlIGNvbnN1bWVyIHJlc29sdmVzIGFzIGZpbmlzaGVkJywgZG9uZSAgPT4ge1xuICAgICAgdmFyIHJlc29sdmU7XG4gICAgICB2YXIgcHJvbWlzZSA9IG5ldyBQcm9taXNlKChfcmVzb2x2ZSwgX18pID0+IHtcbiAgICAgICAgcmVzb2x2ZSA9IF9yZXNvbHZlXG4gICAgICB9KTtcblxuICAgICAgY29uc3VtZVN0dWIucmV0dXJucyhwcm9taXNlKTtcblxuICAgICAgdmFyIGVuZGVkID0gZmFsc2U7XG4gICAgICB2YXIgZSA9IGFjdG9yLnN0YXJ0KHMxLCBzMik7XG4gICAgICBlLm9uKCdlbmQnLCAoKSA9PiB7XG4gICAgICAgIGVuZGVkID0gdHJ1ZTtcbiAgICAgICAgcHJvY2Vzcy5uZXh0VGljaygoKSA9PiB7XG4gICAgICAgICAgZXhwZWN0KGUubGlzdGVuZXJDb3VudCgnZW5kJykpLnRvLmVxdWFsKDApO1xuICAgICAgICAgIGV4cGVjdChlLmxpc3RlbmVyQ291bnQoJ2Vycm9yJykpLnRvLmVxdWFsKDApO1xuICAgICAgICAgIGRvbmUoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIGV4cGVjdChlbmRlZCkudG8uYmUuZmFsc2U7XG4gICAgICAgIHJlc29sdmUoKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ2VtaXRzIGFuIGVycm9yIGV2ZW50IGlmIHRoZSBjb25zdW1lciByZWplY3RzJywgZG9uZSA9PiB7XG4gICAgICB2YXIgZXJyb3IgPSBuZXcgRXJyb3IoJ2ZvbycpO1xuICAgICAgY29uc3VtZVN0dWIucmV0dXJucyhQcm9taXNlLnJlamVjdChlcnJvcikpO1xuXG4gICAgICB2YXIgYSA9IGFjdG9yLnN0YXJ0KHMxLCBzMik7XG4gICAgICBhLm9uKCdlcnJvcicsIGVyciA9PiB7XG4gICAgICAgIGV4cGVjdChlcnIpLnRvLmVxdWFsKGVycm9yKTtcbiAgICAgICAgcHJvY2Vzcy5uZXh0VGljaygoKSA9PiB7XG4gICAgICAgICAgZXhwZWN0KGEubGlzdGVuZXJDb3VudCgnZXJyb3InKSkudG8uZXF1YWwoMClcbiAgICAgICAgICBkb25lKCk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpdCgnZW1pdHMgYW4gZXJyb3IgZXZlbnQgaWYgY29uc3VtZXIgdGhyb3dzIGZvciBhbnkgcmVhc29uJywgZG9uZSA9PiB7XG4gICAgICBjb25zdW1lU3R1Yi50aHJvd3MoKTtcbiAgICAgIHZhciBhID0gYWN0b3Iuc3RhcnQoczEsIHMyKTtcbiAgICAgIGEub24oJ2Vycm9yJywgZXJyID0+IHtcbiAgICAgICAgZXhwZWN0KGVycikudG8uYmUuYW4oJ2Vycm9yJyk7XG4gICAgICAgIHByb2Nlc3MubmV4dFRpY2soKCkgPT4ge1xuICAgICAgICAgIGV4cGVjdChhLmxpc3RlbmVyQ291bnQoJ2Vycm9yJykpLnRvLmVxdWFsKDApO1xuICAgICAgICAgIGRvbmUoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG59KTtcbiJdfQ==