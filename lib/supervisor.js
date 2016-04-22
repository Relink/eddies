'use strict';

var EventEmitter = require('events').EventEmitter;
var stream = require('stream');
var _ = require('lodash');
var copper = require('@relinklabs/copper');
var actor = require('./actor');
var supervisor = {};

/*
 * Keeps track of number of errors in a row before any successes
 * and grinds everything to a halt if the errors exceed to provided
 * maximum number.
 */
supervisor._trackErrors = function _trackErrors(maxErrors, ee) {
  var errors = 0;

  ee.on('success', function (msg) {
    return errors = 0;
  });
  ee.on('warn', function (err) {
    if (++errors > maxErrors) {
      ee.emit('error', new Error('grind this whole shit to a halt'));
    };
  });
};

/*
 * recursing function that fires up actors
 */
supervisor._startActors = function startActors(num, src, dest, ee, transform, config, endCb) {
  var rc = config.rc;
  if (num === 0) {
    return;
  };

  actor.start(src, dest, transform).on('success', function (msg) {
    return ee.emit('success', msg);
  }).on('error', function handleErrors(err) {

    // write message back to the recycle/error queue
    if (rc) {
      var input = err.originalInput;

      // TODO: handle backpresh on recycle stream!
      rc.write(input) || rc.once('drain', function () {
        return true;
      });
    }

    // write to the error stream and recurse to restart a single actor.
    ee.emit('warn', err);
    startActors(1, src, dest, ee, transform, config, endCb);
  }).on('end', endCb);

  // Run each actor asynchronously, so the read's from the incoming stream can
  // catch up.
  setTimeout(function () {
    return startActors(--num, src, dest, ee, transform, config, endCb);
  });
};

/*
 * Keeps track of finished actors, returns promise that resolves when all
 * started actors succesfully end.
 */
supervisor._runProxies = function runProxies(src, dest, ext, transform, config) {
  var num = config.number;
  var errorCount = config.errorCount || 10;

  if (!num) {
    throw new Error('config object must include the number of workers to start!');
  }

  return new Promise(function runProxiesPromise(resolve, reject) {
    var endCb = function endCb() {
      return --num < 1 && resolve();
    };
    supervisor._trackErrors(errorCount, ext);
    supervisor._startActors(num, src, dest, ext, transform, config, endCb);
  });
};

/**
 * Supervisor starts actors, running the proxy actor processes, monitoring
 * them to see when they are either all finished, or have excessive errors. If they
 * have excessive errors, the supervisor will intentionally throw and stop the system.
 * When they come to the end of their queue, the supervisor will wait until the queue
 * starts again, then start them up again.
 *
 * @param {Object} config number = number of actors to start,
 * transform = transform!
 * errorCount = amount of errors in a row before it shuts down
 * @param {Stream} rc optional recycle stream for messages that errored.
 * @param {Stream} src for use only if not piping, then its the src stream.
 * @param {Stream} dest for use only if not piping, then its the dest stream
 * @returns {Stream} Duplex Stream that can be piped into and out of
 */
supervisor.start = function startSupervisor(config, transform, src, dest, ext) {
  // if we are passed in a readable stream, rather than creating on ourselves,
  // the user might pass it in in flow mode, which we don't want, so we stop it.
  src && !src.isPaused() ? src.pause() : null;

  // if we are not given streams directly, then we're being piped, in which
  // case we create passthrough streams so we have a read() and write()
  // interface with proper backpressure throughout the rest of our process.
  if (!src) {
    var _copper$fanout = copper.fanout();

    ext = _copper$fanout.ext;
    src = _copper$fanout.src;
    dest = _copper$fanout.dest;
  }

  src.on('readable', handleNewData);

  function handleNewData() {

    supervisor._runProxies(src, dest, ext, transform, config).then(function () {
      return ext.emit('finish');
    }).then(function () {
      return startSupervisor(config, transform, src, dest, ext);
    }).catch(function (err) {
      return ext.emit('error', err);
    });

    // remove listener so that our process  doesn't get restarted
    // until all actors have fully stopped.
    src.removeListener('readable', handleNewData);
  };

  return ext;
};

module.exports = supervisor;
//# sourceMappingURL=data:application/json;base64,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Q0EzQjhFO0NBQTdEOztBQThCbkIsT0FBTyxPQUFQLEdBQWlCLFVBQWpCIiwiZmlsZSI6InN1cGVydmlzb3IuanMiLCJzb3VyY2VzQ29udGVudCI6WyJ2YXIgRXZlbnRFbWl0dGVyID0gcmVxdWlyZSgnZXZlbnRzJykuRXZlbnRFbWl0dGVyO1xudmFyIHN0cmVhbSA9IHJlcXVpcmUoJ3N0cmVhbScpO1xudmFyIF8gPSByZXF1aXJlKCdsb2Rhc2gnKTtcbnZhciBjb3BwZXIgPSByZXF1aXJlKCdAcmVsaW5rbGFicy9jb3BwZXInKTtcbnZhciBhY3RvciA9IHJlcXVpcmUoJy4vYWN0b3InKTtcbnZhciBzdXBlcnZpc29yID0ge307XG5cbi8qXG4gKiBLZWVwcyB0cmFjayBvZiBudW1iZXIgb2YgZXJyb3JzIGluIGEgcm93IGJlZm9yZSBhbnkgc3VjY2Vzc2VzXG4gKiBhbmQgZ3JpbmRzIGV2ZXJ5dGhpbmcgdG8gYSBoYWx0IGlmIHRoZSBlcnJvcnMgZXhjZWVkIHRvIHByb3ZpZGVkXG4gKiBtYXhpbXVtIG51bWJlci5cbiAqL1xuc3VwZXJ2aXNvci5fdHJhY2tFcnJvcnMgPSBmdW5jdGlvbiBfdHJhY2tFcnJvcnMgKG1heEVycm9ycywgZWUpIHtcbiAgdmFyIGVycm9ycyA9IDA7XG5cbiAgZWUub24oJ3N1Y2Nlc3MnLCBtc2cgPT4gZXJyb3JzID0gMCApXG4gIGVlLm9uKCd3YXJuJywgZXJyID0+IHtcbiAgICBpZiAoKytlcnJvcnMgPiBtYXhFcnJvcnMpIHtcbiAgICAgIGVlLmVtaXQoJ2Vycm9yJywgbmV3IEVycm9yKCdncmluZCB0aGlzIHdob2xlIHNoaXQgdG8gYSBoYWx0JykpXG4gICAgfTtcbiAgfSk7XG59O1xuXG4vKlxuICogcmVjdXJzaW5nIGZ1bmN0aW9uIHRoYXQgZmlyZXMgdXAgYWN0b3JzXG4gKi9cbnN1cGVydmlzb3IuX3N0YXJ0QWN0b3JzID0gZnVuY3Rpb24gc3RhcnRBY3RvcnMobnVtLCBzcmMsIGRlc3QsIGVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0cmFuc2Zvcm0sIGNvbmZpZywgZW5kQ2IpIHtcbiAgdmFyIHJjID0gY29uZmlnLnJjO1xuICBpZiAobnVtID09PSAwKSB7XG4gICAgcmV0dXJuO1xuICB9O1xuXG4gIGFjdG9yXG4gICAgLnN0YXJ0KHNyYywgZGVzdCwgdHJhbnNmb3JtKVxuICAgIC5vbignc3VjY2VzcycsIG1zZyA9PiBlZS5lbWl0KCdzdWNjZXNzJywgbXNnKSlcbiAgICAub24oJ2Vycm9yJywgZnVuY3Rpb24gaGFuZGxlRXJyb3JzIChlcnIpe1xuXG4gICAgICAvLyB3cml0ZSBtZXNzYWdlIGJhY2sgdG8gdGhlIHJlY3ljbGUvZXJyb3IgcXVldWVcbiAgICAgIGlmIChyYykge1xuICAgICAgICB2YXIgaW5wdXQgPSBlcnIub3JpZ2luYWxJbnB1dDtcblxuICAgICAgICAvLyBUT0RPOiBoYW5kbGUgYmFja3ByZXNoIG9uIHJlY3ljbGUgc3RyZWFtIVxuICAgICAgICByYy53cml0ZShpbnB1dCkgfHwgcmMub25jZSgnZHJhaW4nLCAoKSA9PiB0cnVlKTtcbiAgICAgIH1cblxuICAgICAgLy8gd3JpdGUgdG8gdGhlIGVycm9yIHN0cmVhbSBhbmQgcmVjdXJzZSB0byByZXN0YXJ0IGEgc2luZ2xlIGFjdG9yLlxuICAgICAgZWUuZW1pdCgnd2FybicsIGVycik7XG4gICAgICBzdGFydEFjdG9ycygxLCBzcmMsIGRlc3QsIGVlLCB0cmFuc2Zvcm0sIGNvbmZpZywgZW5kQ2IpO1xuICAgIH0pXG4gICAgLm9uKCdlbmQnLCBlbmRDYik7XG5cbiAgLy8gUnVuIGVhY2ggYWN0b3IgYXN5bmNocm9ub3VzbHksIHNvIHRoZSByZWFkJ3MgZnJvbSB0aGUgaW5jb21pbmcgc3RyZWFtIGNhblxuICAvLyBjYXRjaCB1cC5cbiAgc2V0VGltZW91dCgoKSA9PiBzdGFydEFjdG9ycygtLW51bSwgc3JjLCBkZXN0LCBlZSwgdHJhbnNmb3JtLCBjb25maWcsIGVuZENiKSk7XG5cbn07XG5cbi8qXG4gKiBLZWVwcyB0cmFjayBvZiBmaW5pc2hlZCBhY3RvcnMsIHJldHVybnMgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gYWxsXG4gKiBzdGFydGVkIGFjdG9ycyBzdWNjZXNmdWxseSBlbmQuXG4gKi9cbnN1cGVydmlzb3IuX3J1blByb3hpZXMgPSBmdW5jdGlvbiBydW5Qcm94aWVzIChzcmMsIGRlc3QsIGV4dCwgdHJhbnNmb3JtLCBjb25maWcpIHtcbiAgdmFyIG51bSA9IGNvbmZpZy5udW1iZXI7XG4gIHZhciBlcnJvckNvdW50ID0gY29uZmlnLmVycm9yQ291bnQgfHwgMTA7XG5cbiAgaWYgKCFudW0pe1xuICAgIHRocm93IG5ldyBFcnJvcignY29uZmlnIG9iamVjdCBtdXN0IGluY2x1ZGUgdGhlIG51bWJlciBvZiB3b3JrZXJzIHRvIHN0YXJ0IScpXG4gIH1cblxuICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24gcnVuUHJveGllc1Byb21pc2UgKHJlc29sdmUsIHJlamVjdCl7XG4gICAgdmFyIGVuZENiID0gKCkgPT4gLS1udW0gPCAxICYmIHJlc29sdmUoKTtcbiAgICBzdXBlcnZpc29yLl90cmFja0Vycm9ycyhlcnJvckNvdW50LCBleHQpO1xuICAgIHN1cGVydmlzb3IuX3N0YXJ0QWN0b3JzKG51bSwgc3JjLCBkZXN0LCBleHQsIHRyYW5zZm9ybSwgY29uZmlnLCBlbmRDYik7XG4gIH0pO1xufTtcblxuXG4vKipcbiAqIFN1cGVydmlzb3Igc3RhcnRzIGFjdG9ycywgcnVubmluZyB0aGUgcHJveHkgYWN0b3IgcHJvY2Vzc2VzLCBtb25pdG9yaW5nXG4gKiB0aGVtIHRvIHNlZSB3aGVuIHRoZXkgYXJlIGVpdGhlciBhbGwgZmluaXNoZWQsIG9yIGhhdmUgZXhjZXNzaXZlIGVycm9ycy4gSWYgdGhleVxuICogaGF2ZSBleGNlc3NpdmUgZXJyb3JzLCB0aGUgc3VwZXJ2aXNvciB3aWxsIGludGVudGlvbmFsbHkgdGhyb3cgYW5kIHN0b3AgdGhlIHN5c3RlbS5cbiAqIFdoZW4gdGhleSBjb21lIHRvIHRoZSBlbmQgb2YgdGhlaXIgcXVldWUsIHRoZSBzdXBlcnZpc29yIHdpbGwgd2FpdCB1bnRpbCB0aGUgcXVldWVcbiAqIHN0YXJ0cyBhZ2FpbiwgdGhlbiBzdGFydCB0aGVtIHVwIGFnYWluLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBjb25maWcgbnVtYmVyID0gbnVtYmVyIG9mIGFjdG9ycyB0byBzdGFydCxcbiAqIHRyYW5zZm9ybSA9IHRyYW5zZm9ybSFcbiAqIGVycm9yQ291bnQgPSBhbW91bnQgb2YgZXJyb3JzIGluIGEgcm93IGJlZm9yZSBpdCBzaHV0cyBkb3duXG4gKiBAcGFyYW0ge1N0cmVhbX0gcmMgb3B0aW9uYWwgcmVjeWNsZSBzdHJlYW0gZm9yIG1lc3NhZ2VzIHRoYXQgZXJyb3JlZC5cbiAqIEBwYXJhbSB7U3RyZWFtfSBzcmMgZm9yIHVzZSBvbmx5IGlmIG5vdCBwaXBpbmcsIHRoZW4gaXRzIHRoZSBzcmMgc3RyZWFtLlxuICogQHBhcmFtIHtTdHJlYW19IGRlc3QgZm9yIHVzZSBvbmx5IGlmIG5vdCBwaXBpbmcsIHRoZW4gaXRzIHRoZSBkZXN0IHN0cmVhbVxuICogQHJldHVybnMge1N0cmVhbX0gRHVwbGV4IFN0cmVhbSB0aGF0IGNhbiBiZSBwaXBlZCBpbnRvIGFuZCBvdXQgb2ZcbiAqL1xuc3VwZXJ2aXNvci5zdGFydCA9IGZ1bmN0aW9uIHN0YXJ0U3VwZXJ2aXNvciAoY29uZmlnLCB0cmFuc2Zvcm0sIHNyYywgZGVzdCwgZXh0KSB7XG4gIC8vIGlmIHdlIGFyZSBwYXNzZWQgaW4gYSByZWFkYWJsZSBzdHJlYW0sIHJhdGhlciB0aGFuIGNyZWF0aW5nIG9uIG91cnNlbHZlcyxcbiAgLy8gdGhlIHVzZXIgbWlnaHQgcGFzcyBpdCBpbiBpbiBmbG93IG1vZGUsIHdoaWNoIHdlIGRvbid0IHdhbnQsIHNvIHdlIHN0b3AgaXQuXG4gIHNyYyAmJiAhc3JjLmlzUGF1c2VkKCkgPyBzcmMucGF1c2UoKSA6IG51bGw7XG5cbiAgLy8gaWYgd2UgYXJlIG5vdCBnaXZlbiBzdHJlYW1zIGRpcmVjdGx5LCB0aGVuIHdlJ3JlIGJlaW5nIHBpcGVkLCBpbiB3aGljaFxuICAvLyBjYXNlIHdlIGNyZWF0ZSBwYXNzdGhyb3VnaCBzdHJlYW1zIHNvIHdlIGhhdmUgYSByZWFkKCkgYW5kIHdyaXRlKClcbiAgLy8gaW50ZXJmYWNlIHdpdGggcHJvcGVyIGJhY2twcmVzc3VyZSB0aHJvdWdob3V0IHRoZSByZXN0IG9mIG91ciBwcm9jZXNzLlxuICBpZiAoIXNyYykge1xuICAgICh7ZXh0LCBzcmMsIGRlc3R9ID0gY29wcGVyLmZhbm91dCgpKTtcbiAgfVxuXG4gIHNyYy5vbigncmVhZGFibGUnLCBoYW5kbGVOZXdEYXRhKTtcblxuICBmdW5jdGlvbiBoYW5kbGVOZXdEYXRhICgpIHtcblxuICAgIHN1cGVydmlzb3JcbiAgICAgIC5fcnVuUHJveGllcyhzcmMsIGRlc3QsIGV4dCwgdHJhbnNmb3JtLCBjb25maWcpXG4gICAgICAudGhlbigoKSA9PiBleHQuZW1pdCgnZmluaXNoJykpXG4gICAgICAudGhlbigoKSA9PiBzdGFydFN1cGVydmlzb3IoY29uZmlnLCB0cmFuc2Zvcm0sIHNyYywgZGVzdCwgZXh0KSlcbiAgICAgIC5jYXRjaChlcnIgPT4gZXh0LmVtaXQoJ2Vycm9yJywgZXJyKSlcblxuICAgIC8vIHJlbW92ZSBsaXN0ZW5lciBzbyB0aGF0IG91ciBwcm9jZXNzICBkb2Vzbid0IGdldCByZXN0YXJ0ZWRcbiAgICAvLyB1bnRpbCBhbGwgYWN0b3JzIGhhdmUgZnVsbHkgc3RvcHBlZC5cbiAgICBzcmMucmVtb3ZlTGlzdGVuZXIoJ3JlYWRhYmxlJywgaGFuZGxlTmV3RGF0YSk7XG4gIH07XG5cbiAgcmV0dXJuIGV4dDtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gc3VwZXJ2aXNvcjtcbiJdfQ==