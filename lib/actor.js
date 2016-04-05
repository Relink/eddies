'use strict';

var Stream = require('stream');
var EventEmitter = require('events').EventEmitter;
var _ = require('lodash');
var Promise = require('bluebird');

var actor = {};

/*
 * Helper function used to listen to backpressure.
 */
actor._write = function _write(stream, data) {
  return new Promise(function (resolve, reject) {
    if (!stream.write(data)) {
      return stream.once('drain', resolve);
    };
    resolve();
  });
};

actor._consume = function _consume(src, dest, transform, ee, _params) {
  var input;

  input = src.read();
  if (!input) {
    return Promise.resolve('end');
  }

  return transform.apply(null, [input].concat(_params)).then(function writeToDestination() {
    var _ref = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

    var message = _ref.message;
    var params = _ref.params;

    _params = params;
    return actor._write(dest, message);
  }).then(ee.emit.bind(ee, 'success')).then(function () {
    return actor._consume(src, dest, transform, ee, _params);
  }).catch(function (err) {

    // better way to tack on input!
    err.originalInput = input;
    throw err;
  });
};

actor.start = function startActor(src, dest, transform) {
  // Make sure we can read from our source
  if (!src instanceof Stream.Readable) {
    throw new TypeError('src needs to be a Readable stream with a read function');
  };

  var ee = new EventEmitter();

  try {
    actor._consume(src, dest, transform, ee).then(function (success) {
      return ee.emit('end', success);
    }).catch(function (err) {
      return _emitAndCleanup(ee, err);
    }).finally(function () {
      return ee.removeAllListeners();
    });
  } catch (e) {
    process.nextTick(function () {
      return _emitAndCleanup(ee, e);
    });
  }

  return ee;
};

/*
 * Helper function just to emit errors and cleanup listeners.
 */
function _emitAndCleanup(ee, err) {
  ee.emit('error', err);
  ee.removeAllListeners();
}

module.exports = actor;
//# sourceMappingURL=data:application/json;base64,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RUFBOEIsR0FBOUIsRUFBbUM7QUFDakMsS0FBRyxJQUFILENBQVEsT0FBUixFQUFpQixHQUFqQixFQURpQztBQUVqQyxLQUFHLGtCQUFILEdBRmlDO0NBQW5DOztBQUtBLE9BQU8sT0FBUCxHQUFpQixLQUFqQiIsImZpbGUiOiJhY3Rvci5qcyIsInNvdXJjZXNDb250ZW50IjpbInZhciBTdHJlYW0gPSByZXF1aXJlKCdzdHJlYW0nKTtcbnZhciBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdldmVudHMnKS5FdmVudEVtaXR0ZXI7XG52YXIgXyA9IHJlcXVpcmUoJ2xvZGFzaCcpO1xudmFyIFByb21pc2UgPSByZXF1aXJlKCdibHVlYmlyZCcpO1xuXG52YXIgYWN0b3IgPSB7fTtcblxuLypcbiAqIEhlbHBlciBmdW5jdGlvbiB1c2VkIHRvIGxpc3RlbiB0byBiYWNrcHJlc3N1cmUuXG4gKi9cbmFjdG9yLl93cml0ZSA9IGZ1bmN0aW9uIF93cml0ZSAoc3RyZWFtLCBkYXRhKSB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgaWYgKCFzdHJlYW0ud3JpdGUoZGF0YSkpe1xuICAgICAgcmV0dXJuIHN0cmVhbS5vbmNlKCdkcmFpbicsIHJlc29sdmUpXG4gICAgfTtcbiAgICByZXNvbHZlKCk7XG4gIH0pO1xufTtcblxuYWN0b3IuX2NvbnN1bWUgPSBmdW5jdGlvbiBfY29uc3VtZSAoc3JjLCBkZXN0LCB0cmFuc2Zvcm0sIGVlLCBfcGFyYW1zKSB7XG4gIHZhciBpbnB1dDtcblxuICBpbnB1dCA9IHNyYy5yZWFkKCk7XG4gIGlmICghaW5wdXQpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCdlbmQnKTtcbiAgfVxuXG4gIHJldHVybiB0cmFuc2Zvcm0uYXBwbHkobnVsbCwgW2lucHV0XS5jb25jYXQoX3BhcmFtcykpXG4gICAgLnRoZW4oZnVuY3Rpb24gd3JpdGVUb0Rlc3RpbmF0aW9uICh7bWVzc2FnZSwgcGFyYW1zfSA9IHt9KSB7XG4gICAgICBfcGFyYW1zID0gcGFyYW1zXG4gICAgICByZXR1cm4gYWN0b3IuX3dyaXRlKGRlc3QsIG1lc3NhZ2UpXG4gICAgfSlcbiAgICAudGhlbihlZS5lbWl0LmJpbmQoZWUsICdzdWNjZXNzJykpXG4gICAgLnRoZW4oKCkgPT4gYWN0b3IuX2NvbnN1bWUoc3JjLCBkZXN0LCB0cmFuc2Zvcm0sIGVlLCBfcGFyYW1zKSlcbiAgICAuY2F0Y2goZXJyID0+IHtcblxuICAgICAgLy8gYmV0dGVyIHdheSB0byB0YWNrIG9uIGlucHV0IVxuICAgICAgZXJyLm9yaWdpbmFsSW5wdXQgPSBpbnB1dDtcbiAgICAgIHRocm93IChlcnIpO1xuICAgIH0pO1xufTtcblxuYWN0b3Iuc3RhcnQgPSBmdW5jdGlvbiBzdGFydEFjdG9yIChzcmMsIGRlc3QsIHRyYW5zZm9ybSkge1xuICAvLyBNYWtlIHN1cmUgd2UgY2FuIHJlYWQgZnJvbSBvdXIgc291cmNlXG4gIGlmICghc3JjIGluc3RhbmNlb2YgU3RyZWFtLlJlYWRhYmxlKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignc3JjIG5lZWRzIHRvIGJlIGEgUmVhZGFibGUgc3RyZWFtIHdpdGggYSByZWFkIGZ1bmN0aW9uJylcbiAgfTtcblxuICB2YXIgZWUgPSBuZXcgRXZlbnRFbWl0dGVyO1xuXG4gIHRyeSB7XG4gICAgYWN0b3JcbiAgICAgIC5fY29uc3VtZShzcmMsIGRlc3QsIHRyYW5zZm9ybSwgZWUpXG4gICAgICAudGhlbihzdWNjZXNzID0+IGVlLmVtaXQoJ2VuZCcsIHN1Y2Nlc3MpKVxuICAgICAgLmNhdGNoKGVyciA9PiBfZW1pdEFuZENsZWFudXAoZWUsIGVycikpXG4gICAgICAuZmluYWxseSgoKSA9PiBlZS5yZW1vdmVBbGxMaXN0ZW5lcnMoKSlcbiAgfVxuICBjYXRjaCAoZSkge1xuICAgIHByb2Nlc3MubmV4dFRpY2soKCkgPT4gX2VtaXRBbmRDbGVhbnVwKGVlLCBlKSk7XG4gIH1cblxuICByZXR1cm4gZWU7XG59O1xuXG4vKlxuICogSGVscGVyIGZ1bmN0aW9uIGp1c3QgdG8gZW1pdCBlcnJvcnMgYW5kIGNsZWFudXAgbGlzdGVuZXJzLlxuICovXG5mdW5jdGlvbiBfZW1pdEFuZENsZWFudXAgKGVlLCBlcnIpIHtcbiAgZWUuZW1pdCgnZXJyb3InLCBlcnIpO1xuICBlZS5yZW1vdmVBbGxMaXN0ZW5lcnMoKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBhY3RvcjtcbiJdfQ==