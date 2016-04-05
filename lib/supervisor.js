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
  ee.on('error', function (err) {
    if (++errors > maxErrors) {
      throw new Error('grind this whole shit to a halt');
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
    ee.emit('error', err);
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
      return console.log('supervisor resolved: ', config);
    }).then(function () {
      return ext.emit('success', 'Finished. Now listening for more');
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
//# sourceMappingURL=data:application/json;base64,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VUFBbkIsRUFBK0IsYUFBL0IsRUFYd0I7R0FBMUIsQ0FkOEU7O0FBNEI5RSxTQUFPLEdBQVAsQ0E1QjhFO0NBQTdEOztBQStCbkIsT0FBTyxPQUFQLEdBQWlCLFVBQWpCIiwiZmlsZSI6InN1cGVydmlzb3IuanMiLCJzb3VyY2VzQ29udGVudCI6WyJ2YXIgRXZlbnRFbWl0dGVyID0gcmVxdWlyZSgnZXZlbnRzJykuRXZlbnRFbWl0dGVyO1xudmFyIHN0cmVhbSA9IHJlcXVpcmUoJ3N0cmVhbScpO1xudmFyIF8gPSByZXF1aXJlKCdsb2Rhc2gnKTtcbnZhciBjb3BwZXIgPSByZXF1aXJlKCdAcmVsaW5rbGFicy9jb3BwZXInKTtcbnZhciBhY3RvciA9IHJlcXVpcmUoJy4vYWN0b3InKTtcbnZhciBzdXBlcnZpc29yID0ge307XG5cbi8qXG4gKiBLZWVwcyB0cmFjayBvZiBudW1iZXIgb2YgZXJyb3JzIGluIGEgcm93IGJlZm9yZSBhbnkgc3VjY2Vzc2VzXG4gKiBhbmQgZ3JpbmRzIGV2ZXJ5dGhpbmcgdG8gYSBoYWx0IGlmIHRoZSBlcnJvcnMgZXhjZWVkIHRvIHByb3ZpZGVkXG4gKiBtYXhpbXVtIG51bWJlci5cbiAqL1xuc3VwZXJ2aXNvci5fdHJhY2tFcnJvcnMgPSBmdW5jdGlvbiBfdHJhY2tFcnJvcnMgKG1heEVycm9ycywgZWUpIHtcbiAgdmFyIGVycm9ycyA9IDA7XG5cbiAgZWUub24oJ3N1Y2Nlc3MnLCBtc2cgPT4gZXJyb3JzID0gMCApXG4gIGVlLm9uKCdlcnJvcicsIGVyciA9PiB7XG4gICAgaWYgKCsrZXJyb3JzID4gbWF4RXJyb3JzKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2dyaW5kIHRoaXMgd2hvbGUgc2hpdCB0byBhIGhhbHQnKTtcbiAgICB9O1xuICB9KTtcbn07XG5cbi8qXG4gKiByZWN1cnNpbmcgZnVuY3Rpb24gdGhhdCBmaXJlcyB1cCBhY3RvcnNcbiAqL1xuc3VwZXJ2aXNvci5fc3RhcnRBY3RvcnMgPSBmdW5jdGlvbiBzdGFydEFjdG9ycyhudW0sIHNyYywgZGVzdCwgZWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRyYW5zZm9ybSwgY29uZmlnLCBlbmRDYikge1xuICB2YXIgcmMgPSBjb25maWcucmM7XG4gIGlmIChudW0gPT09IDApIHtcbiAgICByZXR1cm47XG4gIH07XG5cbiAgYWN0b3JcbiAgICAuc3RhcnQoc3JjLCBkZXN0LCB0cmFuc2Zvcm0pXG4gICAgLm9uKCdzdWNjZXNzJywgbXNnID0+IGVlLmVtaXQoJ3N1Y2Nlc3MnLCBtc2cpKVxuICAgIC5vbignZXJyb3InLCBmdW5jdGlvbiBoYW5kbGVFcnJvcnMgKGVycil7XG5cbiAgICAgIC8vIHdyaXRlIG1lc3NhZ2UgYmFjayB0byB0aGUgcmVjeWNsZS9lcnJvciBxdWV1ZVxuICAgICAgaWYgKHJjKSB7XG4gICAgICAgIHZhciBpbnB1dCA9IGVyci5vcmlnaW5hbElucHV0O1xuXG4gICAgICAgIC8vIFRPRE86IGhhbmRsZSBiYWNrcHJlc2ggb24gcmVjeWNsZSBzdHJlYW0hXG4gICAgICAgIHJjLndyaXRlKGlucHV0KSB8fCByYy5vbmNlKCdkcmFpbicsICgpID0+IHRydWUpO1xuICAgICAgfVxuXG4gICAgICAvLyB3cml0ZSB0byB0aGUgZXJyb3Igc3RyZWFtIGFuZCByZWN1cnNlIHRvIHJlc3RhcnQgYSBzaW5nbGUgYWN0b3IuXG4gICAgICBlZS5lbWl0KCdlcnJvcicsIGVycik7XG4gICAgICBzdGFydEFjdG9ycygxLCBzcmMsIGRlc3QsIGVlLCB0cmFuc2Zvcm0sIGNvbmZpZywgZW5kQ2IpO1xuICAgIH0pXG4gICAgLm9uKCdlbmQnLCBlbmRDYik7XG5cbiAgLy8gUnVuIGVhY2ggYWN0b3IgYXN5bmNocm9ub3VzbHksIHNvIHRoZSByZWFkJ3MgZnJvbSB0aGUgaW5jb21pbmcgc3RyZWFtIGNhblxuICAvLyBjYXRjaCB1cC5cbiAgc2V0VGltZW91dCgoKSA9PiBzdGFydEFjdG9ycygtLW51bSwgc3JjLCBkZXN0LCBlZSwgdHJhbnNmb3JtLCBjb25maWcsIGVuZENiKSk7XG5cbn07XG5cbi8qXG4gKiBLZWVwcyB0cmFjayBvZiBmaW5pc2hlZCBhY3RvcnMsIHJldHVybnMgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gYWxsXG4gKiBzdGFydGVkIGFjdG9ycyBzdWNjZXNmdWxseSBlbmQuXG4gKi9cbnN1cGVydmlzb3IuX3J1blByb3hpZXMgPSBmdW5jdGlvbiBydW5Qcm94aWVzIChzcmMsIGRlc3QsIGV4dCwgdHJhbnNmb3JtLCBjb25maWcpIHtcbiAgdmFyIG51bSA9IGNvbmZpZy5udW1iZXI7XG4gIHZhciBlcnJvckNvdW50ID0gY29uZmlnLmVycm9yQ291bnQgfHwgMTA7XG5cbiAgaWYgKCFudW0pe1xuICAgIHRocm93IG5ldyBFcnJvcignY29uZmlnIG9iamVjdCBtdXN0IGluY2x1ZGUgdGhlIG51bWJlciBvZiB3b3JrZXJzIHRvIHN0YXJ0IScpXG4gIH1cblxuICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24gcnVuUHJveGllc1Byb21pc2UgKHJlc29sdmUsIHJlamVjdCl7XG4gICAgdmFyIGVuZENiID0gKCkgPT4gLS1udW0gPCAxICYmIHJlc29sdmUoKTtcbiAgICBzdXBlcnZpc29yLl90cmFja0Vycm9ycyhlcnJvckNvdW50LCBleHQpO1xuICAgIHN1cGVydmlzb3IuX3N0YXJ0QWN0b3JzKG51bSwgc3JjLCBkZXN0LCBleHQsIHRyYW5zZm9ybSwgY29uZmlnLCBlbmRDYik7XG4gIH0pO1xufTtcblxuXG4vKipcbiAqIFN1cGVydmlzb3Igc3RhcnRzIGFjdG9ycywgcnVubmluZyB0aGUgcHJveHkgYWN0b3IgcHJvY2Vzc2VzLCBtb25pdG9yaW5nXG4gKiB0aGVtIHRvIHNlZSB3aGVuIHRoZXkgYXJlIGVpdGhlciBhbGwgZmluaXNoZWQsIG9yIGhhdmUgZXhjZXNzaXZlIGVycm9ycy4gSWYgdGhleVxuICogaGF2ZSBleGNlc3NpdmUgZXJyb3JzLCB0aGUgc3VwZXJ2aXNvciB3aWxsIGludGVudGlvbmFsbHkgdGhyb3cgYW5kIHN0b3AgdGhlIHN5c3RlbS5cbiAqIFdoZW4gdGhleSBjb21lIHRvIHRoZSBlbmQgb2YgdGhlaXIgcXVldWUsIHRoZSBzdXBlcnZpc29yIHdpbGwgd2FpdCB1bnRpbCB0aGUgcXVldWVcbiAqIHN0YXJ0cyBhZ2FpbiwgdGhlbiBzdGFydCB0aGVtIHVwIGFnYWluLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBjb25maWcgbnVtYmVyID0gbnVtYmVyIG9mIGFjdG9ycyB0byBzdGFydCxcbiAqIHRyYW5zZm9ybSA9IHRyYW5zZm9ybSFcbiAqIGVycm9yQ291bnQgPSBhbW91bnQgb2YgZXJyb3JzIGluIGEgcm93IGJlZm9yZSBpdCBzaHV0cyBkb3duXG4gKiBAcGFyYW0ge1N0cmVhbX0gcmMgb3B0aW9uYWwgcmVjeWNsZSBzdHJlYW0gZm9yIG1lc3NhZ2VzIHRoYXQgZXJyb3JlZC5cbiAqIEBwYXJhbSB7U3RyZWFtfSBzcmMgZm9yIHVzZSBvbmx5IGlmIG5vdCBwaXBpbmcsIHRoZW4gaXRzIHRoZSBzcmMgc3RyZWFtLlxuICogQHBhcmFtIHtTdHJlYW19IGRlc3QgZm9yIHVzZSBvbmx5IGlmIG5vdCBwaXBpbmcsIHRoZW4gaXRzIHRoZSBkZXN0IHN0cmVhbVxuICogQHJldHVybnMge1N0cmVhbX0gRHVwbGV4IFN0cmVhbSB0aGF0IGNhbiBiZSBwaXBlZCBpbnRvIGFuZCBvdXQgb2ZcbiAqL1xuc3VwZXJ2aXNvci5zdGFydCA9IGZ1bmN0aW9uIHN0YXJ0U3VwZXJ2aXNvciAoY29uZmlnLCB0cmFuc2Zvcm0sIHNyYywgZGVzdCwgZXh0KSB7XG4gIC8vIGlmIHdlIGFyZSBwYXNzZWQgaW4gYSByZWFkYWJsZSBzdHJlYW0sIHJhdGhlciB0aGFuIGNyZWF0aW5nIG9uIG91cnNlbHZlcyxcbiAgLy8gdGhlIHVzZXIgbWlnaHQgcGFzcyBpdCBpbiBpbiBmbG93IG1vZGUsIHdoaWNoIHdlIGRvbid0IHdhbnQsIHNvIHdlIHN0b3AgaXQuXG4gIHNyYyAmJiAhc3JjLmlzUGF1c2VkKCkgPyBzcmMucGF1c2UoKSA6IG51bGw7XG5cbiAgLy8gaWYgd2UgYXJlIG5vdCBnaXZlbiBzdHJlYW1zIGRpcmVjdGx5LCB0aGVuIHdlJ3JlIGJlaW5nIHBpcGVkLCBpbiB3aGljaFxuICAvLyBjYXNlIHdlIGNyZWF0ZSBwYXNzdGhyb3VnaCBzdHJlYW1zIHNvIHdlIGhhdmUgYSByZWFkKCkgYW5kIHdyaXRlKClcbiAgLy8gaW50ZXJmYWNlIHdpdGggcHJvcGVyIGJhY2twcmVzc3VyZSB0aHJvdWdob3V0IHRoZSByZXN0IG9mIG91ciBwcm9jZXNzLlxuICBpZiAoIXNyYykge1xuICAgICh7ZXh0LCBzcmMsIGRlc3R9ID0gY29wcGVyLmZhbm91dCgpKTtcbiAgfVxuXG4gIHNyYy5vbigncmVhZGFibGUnLCBoYW5kbGVOZXdEYXRhKTtcblxuICBmdW5jdGlvbiBoYW5kbGVOZXdEYXRhICgpIHtcblxuICAgIHN1cGVydmlzb3JcbiAgICAgIC5fcnVuUHJveGllcyhzcmMsIGRlc3QsIGV4dCwgdHJhbnNmb3JtLCBjb25maWcpXG4gICAgICAudGhlbigoKSA9PiBjb25zb2xlLmxvZygnc3VwZXJ2aXNvciByZXNvbHZlZDogJywgY29uZmlnKSlcbiAgICAgIC50aGVuKCgpID0+IGV4dC5lbWl0KCdzdWNjZXNzJywgJ0ZpbmlzaGVkLiBOb3cgbGlzdGVuaW5nIGZvciBtb3JlJykpXG4gICAgICAudGhlbigoKSA9PiBzdGFydFN1cGVydmlzb3IoY29uZmlnLCB0cmFuc2Zvcm0sIHNyYywgZGVzdCwgZXh0KSlcbiAgICAgIC5jYXRjaChlcnIgPT4gZXh0LmVtaXQoJ2Vycm9yJywgZXJyKSlcblxuICAgIC8vIHJlbW92ZSBsaXN0ZW5lciBzbyB0aGF0IG91ciBwcm9jZXNzICBkb2Vzbid0IGdldCByZXN0YXJ0ZWRcbiAgICAvLyB1bnRpbCBhbGwgYWN0b3JzIGhhdmUgZnVsbHkgc3RvcHBlZC5cbiAgICBzcmMucmVtb3ZlTGlzdGVuZXIoJ3JlYWRhYmxlJywgaGFuZGxlTmV3RGF0YSk7XG4gIH07XG5cbiAgcmV0dXJuIGV4dDtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gc3VwZXJ2aXNvcjtcbiJdfQ==