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
//# sourceMappingURL=data:application/json;base64,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QUFWOztBQUlBLFNBQU8sRUFBUCxDQXBCdUQ7Q0FBM0M7Ozs7O0FBMEJkLFNBQVMsZUFBVCxDQUEwQixFQUExQixFQUE4QixHQUE5QixFQUFtQztBQUNqQyxLQUFHLElBQUgsQ0FBUSxPQUFSLEVBQWlCLEdBQWpCLEVBRGlDO0FBRWpDLEtBQUcsa0JBQUgsR0FGaUM7Q0FBbkM7O0FBS0EsT0FBTyxPQUFQLEdBQWlCLEtBQWpCIiwiZmlsZSI6ImFjdG9yLmpzIiwic291cmNlc0NvbnRlbnQiOlsidmFyIFN0cmVhbSA9IHJlcXVpcmUoJ3N0cmVhbScpO1xudmFyIEV2ZW50RW1pdHRlciA9IHJlcXVpcmUoJ2V2ZW50cycpLkV2ZW50RW1pdHRlcjtcbnZhciBfID0gcmVxdWlyZSgnbG9kYXNoJyk7XG52YXIgUHJvbWlzZSA9IHJlcXVpcmUoJ2JsdWViaXJkJyk7XG5cbnZhciBhY3RvciA9IHt9O1xuXG4vKlxuICogSGVscGVyIGZ1bmN0aW9uIHVzZWQgdG8gbGlzdGVuIHRvIGJhY2twcmVzc3VyZS5cbiAqL1xuYWN0b3IuX3dyaXRlID0gZnVuY3Rpb24gX3dyaXRlIChzdHJlYW0sIGRhdGEpIHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBpZiAoIXN0cmVhbS53cml0ZShkYXRhKSl7XG4gICAgICByZXR1cm4gc3RyZWFtLm9uY2UoJ2RyYWluJywgcmVzb2x2ZS5iaW5kKG51bGwsIGRhdGEpKVxuICAgIH07XG4gICAgcmVzb2x2ZShkYXRhKTtcbiAgfSk7XG59O1xuXG5hY3Rvci5fY29uc3VtZSA9IGZ1bmN0aW9uIF9jb25zdW1lIChzcmMsIGRlc3QsIHRyYW5zZm9ybSwgZWUsIF9wYXJhbXMpIHtcbiAgdmFyIGlucHV0O1xuXG4gIGlucHV0ID0gc3JjLnJlYWQoKTtcbiAgaWYgKCFpbnB1dCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoJ2VuZCcpO1xuICB9XG5cbiAgcmV0dXJuIHRyYW5zZm9ybS5hcHBseShudWxsLCBbaW5wdXRdLmNvbmNhdChfcGFyYW1zKSlcbiAgICAudGhlbihmdW5jdGlvbiB3cml0ZVRvRGVzdGluYXRpb24gKHttZXNzYWdlLCBwYXJhbXN9ID0ge30pIHtcbiAgICAgIF9wYXJhbXMgPSBwYXJhbXNcbiAgICAgIHJldHVybiBhY3Rvci5fd3JpdGUoZGVzdCwgbWVzc2FnZSlcbiAgICB9KVxuICAgIC50aGVuKGVlLmVtaXQuYmluZChlZSwgJ3N1Y2Nlc3MnKSlcbiAgICAudGhlbigoKSA9PiBhY3Rvci5fY29uc3VtZShzcmMsIGRlc3QsIHRyYW5zZm9ybSwgZWUsIF9wYXJhbXMpKVxuICAgIC5jYXRjaChlcnIgPT4ge1xuXG4gICAgICAvLyBiZXR0ZXIgd2F5IHRvIHRhY2sgb24gaW5wdXQhXG4gICAgICBlcnIub3JpZ2luYWxJbnB1dCA9IGlucHV0O1xuICAgICAgZWUuZW1pdCgnZXJyb3InLCBlcnIpO1xuICAgIH0pO1xufTtcblxuYWN0b3Iuc3RhcnQgPSBmdW5jdGlvbiBzdGFydEFjdG9yIChzcmMsIGRlc3QsIHRyYW5zZm9ybSkge1xuXG4gIC8vIE1ha2Ugc3VyZSB3ZSBjYW4gcmVhZCBmcm9tIG91ciBzb3VyY2VcbiAgaWYgKCFzcmMgaW5zdGFuY2VvZiBTdHJlYW0uUmVhZGFibGUpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdzcmMgbmVlZHMgdG8gYmUgYSBSZWFkYWJsZSBzdHJlYW0gd2l0aCBhIHJlYWQgZnVuY3Rpb24nKVxuICB9O1xuXG4gIHZhciBlZSA9IG5ldyBFdmVudEVtaXR0ZXI7XG5cbiAgdHJ5IHtcbiAgICBhY3RvclxuICAgICAgLl9jb25zdW1lKHNyYywgZGVzdCwgdHJhbnNmb3JtLCBlZSlcbiAgICAgIC50aGVuKHN1Y2Nlc3MgPT4gZWUuZW1pdCgnZW5kJywgc3VjY2VzcykpXG4gICAgICAuY2F0Y2goZXJyID0+IF9lbWl0QW5kQ2xlYW51cChlZSwgZXJyKSlcbiAgICAgIC5maW5hbGx5KCgpID0+IGVlLnJlbW92ZUFsbExpc3RlbmVycygpKVxuICB9XG4gIGNhdGNoIChlKSB7XG4gICAgcHJvY2Vzcy5uZXh0VGljaygoKSA9PiBfZW1pdEFuZENsZWFudXAoZWUsIGUpKTtcbiAgfVxuXG4gIHJldHVybiBlZTtcbn07XG5cbi8qXG4gKiBIZWxwZXIgZnVuY3Rpb24ganVzdCB0byBlbWl0IGVycm9ycyBhbmQgY2xlYW51cCBsaXN0ZW5lcnMuXG4gKi9cbmZ1bmN0aW9uIF9lbWl0QW5kQ2xlYW51cCAoZWUsIGVycikge1xuICBlZS5lbWl0KCdlcnJvcicsIGVycik7XG4gIGVlLnJlbW92ZUFsbExpc3RlbmVycygpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGFjdG9yO1xuIl19