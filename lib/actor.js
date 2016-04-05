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
    ee.emit('error', err);
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
//# sourceMappingURL=data:application/json;base64,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U0FBUyxlQUFULENBQTBCLEVBQTFCLEVBQThCLEdBQTlCLEVBQW1DO0FBQ2pDLEtBQUcsSUFBSCxDQUFRLE9BQVIsRUFBaUIsR0FBakIsRUFEaUM7QUFFakMsS0FBRyxrQkFBSCxHQUZpQztDQUFuQzs7QUFLQSxPQUFPLE9BQVAsR0FBaUIsS0FBakIiLCJmaWxlIjoiYWN0b3IuanMiLCJzb3VyY2VzQ29udGVudCI6WyJ2YXIgU3RyZWFtID0gcmVxdWlyZSgnc3RyZWFtJyk7XG52YXIgRXZlbnRFbWl0dGVyID0gcmVxdWlyZSgnZXZlbnRzJykuRXZlbnRFbWl0dGVyO1xudmFyIF8gPSByZXF1aXJlKCdsb2Rhc2gnKTtcbnZhciBQcm9taXNlID0gcmVxdWlyZSgnYmx1ZWJpcmQnKTtcblxudmFyIGFjdG9yID0ge307XG5cbi8qXG4gKiBIZWxwZXIgZnVuY3Rpb24gdXNlZCB0byBsaXN0ZW4gdG8gYmFja3ByZXNzdXJlLlxuICovXG5hY3Rvci5fd3JpdGUgPSBmdW5jdGlvbiBfd3JpdGUgKHN0cmVhbSwgZGF0YSkge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGlmICghc3RyZWFtLndyaXRlKGRhdGEpKXtcbiAgICAgIHJldHVybiBzdHJlYW0ub25jZSgnZHJhaW4nLCByZXNvbHZlKVxuICAgIH07XG4gICAgcmVzb2x2ZSgpO1xuICB9KTtcbn07XG5cbmFjdG9yLl9jb25zdW1lID0gZnVuY3Rpb24gX2NvbnN1bWUgKHNyYywgZGVzdCwgdHJhbnNmb3JtLCBlZSwgX3BhcmFtcykge1xuICB2YXIgaW5wdXQ7XG5cbiAgaW5wdXQgPSBzcmMucmVhZCgpO1xuICBpZiAoIWlucHV0KSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgnZW5kJyk7XG4gIH1cblxuICByZXR1cm4gdHJhbnNmb3JtLmFwcGx5KG51bGwsIFtpbnB1dF0uY29uY2F0KF9wYXJhbXMpKVxuICAgIC50aGVuKGZ1bmN0aW9uIHdyaXRlVG9EZXN0aW5hdGlvbiAoe21lc3NhZ2UsIHBhcmFtc30gPSB7fSkge1xuICAgICAgX3BhcmFtcyA9IHBhcmFtc1xuICAgICAgcmV0dXJuIGFjdG9yLl93cml0ZShkZXN0LCBtZXNzYWdlKVxuICAgIH0pXG4gICAgLnRoZW4oZWUuZW1pdC5iaW5kKGVlLCAnc3VjY2VzcycpKVxuICAgIC50aGVuKCgpID0+IGFjdG9yLl9jb25zdW1lKHNyYywgZGVzdCwgdHJhbnNmb3JtLCBlZSwgX3BhcmFtcykpXG4gICAgLmNhdGNoKGVyciA9PiB7XG5cbiAgICAgIC8vIGJldHRlciB3YXkgdG8gdGFjayBvbiBpbnB1dCFcbiAgICAgIGVyci5vcmlnaW5hbElucHV0ID0gaW5wdXQ7XG4gICAgICBlZS5lbWl0KCdlcnJvcicsIGVycik7XG4gICAgfSk7XG59O1xuXG5hY3Rvci5zdGFydCA9IGZ1bmN0aW9uIHN0YXJ0QWN0b3IgKHNyYywgZGVzdCwgdHJhbnNmb3JtKSB7XG4gIC8vIE1ha2Ugc3VyZSB3ZSBjYW4gcmVhZCBmcm9tIG91ciBzb3VyY2VcbiAgaWYgKCFzcmMgaW5zdGFuY2VvZiBTdHJlYW0uUmVhZGFibGUpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdzcmMgbmVlZHMgdG8gYmUgYSBSZWFkYWJsZSBzdHJlYW0gd2l0aCBhIHJlYWQgZnVuY3Rpb24nKVxuICB9O1xuXG4gIHZhciBlZSA9IG5ldyBFdmVudEVtaXR0ZXI7XG5cbiAgdHJ5IHtcbiAgICBhY3RvclxuICAgICAgLl9jb25zdW1lKHNyYywgZGVzdCwgdHJhbnNmb3JtLCBlZSlcbiAgICAgIC50aGVuKHN1Y2Nlc3MgPT4gZWUuZW1pdCgnZW5kJywgc3VjY2VzcykpXG4gICAgICAuY2F0Y2goZXJyID0+IF9lbWl0QW5kQ2xlYW51cChlZSwgZXJyKSlcbiAgICAgIC5maW5hbGx5KCgpID0+IGVlLnJlbW92ZUFsbExpc3RlbmVycygpKVxuICB9XG4gIGNhdGNoIChlKSB7XG4gICAgcHJvY2Vzcy5uZXh0VGljaygoKSA9PiBfZW1pdEFuZENsZWFudXAoZWUsIGUpKTtcbiAgfVxuXG4gIHJldHVybiBlZTtcbn07XG5cbi8qXG4gKiBIZWxwZXIgZnVuY3Rpb24ganVzdCB0byBlbWl0IGVycm9ycyBhbmQgY2xlYW51cCBsaXN0ZW5lcnMuXG4gKi9cbmZ1bmN0aW9uIF9lbWl0QW5kQ2xlYW51cCAoZWUsIGVycikge1xuICBlZS5lbWl0KCdlcnJvcicsIGVycik7XG4gIGVlLnJlbW92ZUFsbExpc3RlbmVycygpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGFjdG9yO1xuIl19