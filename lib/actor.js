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
      return stream.once('drain', resolve.bind(null, data));
    };
    resolve(data);
  });
};

actor._consume = function _consume(src, dest, transform, ee, _params) {
  var input;

  input = src.read();
  if (!input) {
    return Promise.resolve();
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
    return ee.emit('error', err);
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
//# sourceMappingURL=data:application/json;base64,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MEIsRUFBMUIsRUFBOEIsR0FBOUIsRUFBbUM7QUFDakMsS0FBRyxJQUFILENBQVEsT0FBUixFQUFpQixHQUFqQixFQURpQztBQUVqQyxLQUFHLGtCQUFILEdBRmlDO0NBQW5DOztBQUtBLE9BQU8sT0FBUCxHQUFpQixLQUFqQiIsImZpbGUiOiJhY3Rvci5qcyIsInNvdXJjZXNDb250ZW50IjpbInZhciBTdHJlYW0gPSByZXF1aXJlKCdzdHJlYW0nKTtcbnZhciBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdldmVudHMnKS5FdmVudEVtaXR0ZXI7XG52YXIgXyA9IHJlcXVpcmUoJ2xvZGFzaCcpO1xudmFyIFByb21pc2UgPSByZXF1aXJlKCdibHVlYmlyZCcpO1xuXG52YXIgYWN0b3IgPSB7fTtcblxuLypcbiAqIEhlbHBlciBmdW5jdGlvbiB1c2VkIHRvIGxpc3RlbiB0byBiYWNrcHJlc3N1cmUuXG4gKi9cbmFjdG9yLl93cml0ZSA9IGZ1bmN0aW9uIF93cml0ZSAoc3RyZWFtLCBkYXRhKSB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgaWYgKCFzdHJlYW0ud3JpdGUoZGF0YSkpe1xuICAgICAgcmV0dXJuIHN0cmVhbS5vbmNlKCdkcmFpbicsIHJlc29sdmUuYmluZChudWxsLCBkYXRhKSlcbiAgICB9O1xuICAgIHJlc29sdmUoZGF0YSk7XG4gIH0pO1xufTtcblxuYWN0b3IuX2NvbnN1bWUgPSBmdW5jdGlvbiBfY29uc3VtZSAoc3JjLCBkZXN0LCB0cmFuc2Zvcm0sIGVlLCBfcGFyYW1zKSB7XG4gIHZhciBpbnB1dDtcblxuICBpbnB1dCA9IHNyYy5yZWFkKCk7XG4gIGlmICghaW5wdXQpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICByZXR1cm4gdHJhbnNmb3JtLmFwcGx5KG51bGwsIFtpbnB1dF0uY29uY2F0KF9wYXJhbXMpKVxuICAgIC50aGVuKGZ1bmN0aW9uIHdyaXRlVG9EZXN0aW5hdGlvbiAoe21lc3NhZ2UsIHBhcmFtc30gPSB7fSkge1xuICAgICAgX3BhcmFtcyA9IHBhcmFtc1xuICAgICAgcmV0dXJuIGFjdG9yLl93cml0ZShkZXN0LCBtZXNzYWdlKVxuICAgIH0pXG4gICAgLnRoZW4oZWUuZW1pdC5iaW5kKGVlLCAnc3VjY2VzcycpKVxuICAgIC50aGVuKCgpID0+IGFjdG9yLl9jb25zdW1lKHNyYywgZGVzdCwgdHJhbnNmb3JtLCBlZSwgX3BhcmFtcykpXG4gICAgLmNhdGNoKGVyciA9PiBlZS5lbWl0KCdlcnJvcicsIGVycikpXG59O1xuXG5hY3Rvci5zdGFydCA9IGZ1bmN0aW9uIHN0YXJ0QWN0b3IgKHNyYywgZGVzdCwgdHJhbnNmb3JtKSB7XG5cbiAgLy8gTWFrZSBzdXJlIHdlIGNhbiByZWFkIGZyb20gb3VyIHNvdXJjZVxuICBpZiAoIXNyYyBpbnN0YW5jZW9mIFN0cmVhbS5SZWFkYWJsZSkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3NyYyBuZWVkcyB0byBiZSBhIFJlYWRhYmxlIHN0cmVhbSB3aXRoIGEgcmVhZCBmdW5jdGlvbicpXG4gIH07XG5cbiAgdmFyIGVlID0gbmV3IEV2ZW50RW1pdHRlcjtcblxuICB0cnkge1xuICAgIGFjdG9yXG4gICAgICAuX2NvbnN1bWUoc3JjLCBkZXN0LCB0cmFuc2Zvcm0sIGVlKVxuICAgICAgLnRoZW4oc3VjY2VzcyA9PiBlZS5lbWl0KCdlbmQnLCBzdWNjZXNzKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gX2VtaXRBbmRDbGVhbnVwKGVlLCBlcnIpKVxuICAgICAgLmZpbmFsbHkoKCkgPT4gZWUucmVtb3ZlQWxsTGlzdGVuZXJzKCkpXG4gIH1cbiAgY2F0Y2ggKGUpIHtcbiAgICBwcm9jZXNzLm5leHRUaWNrKCgpID0+IF9lbWl0QW5kQ2xlYW51cChlZSwgZSkpO1xuICB9XG5cbiAgcmV0dXJuIGVlO1xufTtcblxuLypcbiAqIEhlbHBlciBmdW5jdGlvbiBqdXN0IHRvIGVtaXQgZXJyb3JzIGFuZCBjbGVhbnVwIGxpc3RlbmVycy5cbiAqL1xuZnVuY3Rpb24gX2VtaXRBbmRDbGVhbnVwIChlZSwgZXJyKSB7XG4gIGVlLmVtaXQoJ2Vycm9yJywgZXJyKTtcbiAgZWUucmVtb3ZlQWxsTGlzdGVuZXJzKCk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYWN0b3I7XG4iXX0=