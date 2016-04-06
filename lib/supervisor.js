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
//# sourceMappingURL=data:application/json;base64,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VUFBbkIsRUFBK0IsYUFBL0IsRUFYd0I7R0FBMUIsQ0FkOEU7O0FBNEI5RSxTQUFPLEdBQVAsQ0E1QjhFO0NBQTdEOztBQStCbkIsT0FBTyxPQUFQLEdBQWlCLFVBQWpCIiwiZmlsZSI6InN1cGVydmlzb3IuanMiLCJzb3VyY2VzQ29udGVudCI6WyJ2YXIgRXZlbnRFbWl0dGVyID0gcmVxdWlyZSgnZXZlbnRzJykuRXZlbnRFbWl0dGVyO1xudmFyIHN0cmVhbSA9IHJlcXVpcmUoJ3N0cmVhbScpO1xudmFyIF8gPSByZXF1aXJlKCdsb2Rhc2gnKTtcbnZhciBjb3BwZXIgPSByZXF1aXJlKCdAcmVsaW5rbGFicy9jb3BwZXInKTtcbnZhciBhY3RvciA9IHJlcXVpcmUoJy4vYWN0b3InKTtcbnZhciBzdXBlcnZpc29yID0ge307XG5cbi8qXG4gKiBLZWVwcyB0cmFjayBvZiBudW1iZXIgb2YgZXJyb3JzIGluIGEgcm93IGJlZm9yZSBhbnkgc3VjY2Vzc2VzXG4gKiBhbmQgZ3JpbmRzIGV2ZXJ5dGhpbmcgdG8gYSBoYWx0IGlmIHRoZSBlcnJvcnMgZXhjZWVkIHRvIHByb3ZpZGVkXG4gKiBtYXhpbXVtIG51bWJlci5cbiAqL1xuc3VwZXJ2aXNvci5fdHJhY2tFcnJvcnMgPSBmdW5jdGlvbiBfdHJhY2tFcnJvcnMgKG1heEVycm9ycywgZWUpIHtcbiAgdmFyIGVycm9ycyA9IDA7XG5cbiAgZWUub24oJ3N1Y2Nlc3MnLCBtc2cgPT4gZXJyb3JzID0gMCApXG4gIGVlLm9uKCd3YXJuJywgZXJyID0+IHtcbiAgICBpZiAoKytlcnJvcnMgPiBtYXhFcnJvcnMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignZ3JpbmQgdGhpcyB3aG9sZSBzaGl0IHRvIGEgaGFsdCcpO1xuICAgIH07XG4gIH0pO1xufTtcblxuLypcbiAqIHJlY3Vyc2luZyBmdW5jdGlvbiB0aGF0IGZpcmVzIHVwIGFjdG9yc1xuICovXG5zdXBlcnZpc29yLl9zdGFydEFjdG9ycyA9IGZ1bmN0aW9uIHN0YXJ0QWN0b3JzKG51bSwgc3JjLCBkZXN0LCBlZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdHJhbnNmb3JtLCBjb25maWcsIGVuZENiKSB7XG4gIHZhciByYyA9IGNvbmZpZy5yYztcbiAgaWYgKG51bSA9PT0gMCkge1xuICAgIHJldHVybjtcbiAgfTtcblxuICBhY3RvclxuICAgIC5zdGFydChzcmMsIGRlc3QsIHRyYW5zZm9ybSlcbiAgICAub24oJ3N1Y2Nlc3MnLCBtc2cgPT4gZWUuZW1pdCgnc3VjY2VzcycsIG1zZykpXG4gICAgLm9uKCdlcnJvcicsIGZ1bmN0aW9uIGhhbmRsZUVycm9ycyAoZXJyKXtcblxuICAgICAgLy8gd3JpdGUgbWVzc2FnZSBiYWNrIHRvIHRoZSByZWN5Y2xlL2Vycm9yIHF1ZXVlXG4gICAgICBpZiAocmMpIHtcbiAgICAgICAgdmFyIGlucHV0ID0gZXJyLm9yaWdpbmFsSW5wdXQ7XG5cbiAgICAgICAgLy8gVE9ETzogaGFuZGxlIGJhY2twcmVzaCBvbiByZWN5Y2xlIHN0cmVhbSFcbiAgICAgICAgcmMud3JpdGUoaW5wdXQpIHx8IHJjLm9uY2UoJ2RyYWluJywgKCkgPT4gdHJ1ZSk7XG4gICAgICB9XG5cbiAgICAgIC8vIHdyaXRlIHRvIHRoZSBlcnJvciBzdHJlYW0gYW5kIHJlY3Vyc2UgdG8gcmVzdGFydCBhIHNpbmdsZSBhY3Rvci5cbiAgICAgIGVlLmVtaXQoJ3dhcm4nLCBlcnIpO1xuICAgICAgc3RhcnRBY3RvcnMoMSwgc3JjLCBkZXN0LCBlZSwgdHJhbnNmb3JtLCBjb25maWcsIGVuZENiKTtcbiAgICB9KVxuICAgIC5vbignZW5kJywgZW5kQ2IpO1xuXG4gIC8vIFJ1biBlYWNoIGFjdG9yIGFzeW5jaHJvbm91c2x5LCBzbyB0aGUgcmVhZCdzIGZyb20gdGhlIGluY29taW5nIHN0cmVhbSBjYW5cbiAgLy8gY2F0Y2ggdXAuXG4gIHNldFRpbWVvdXQoKCkgPT4gc3RhcnRBY3RvcnMoLS1udW0sIHNyYywgZGVzdCwgZWUsIHRyYW5zZm9ybSwgY29uZmlnLCBlbmRDYikpO1xuXG59O1xuXG4vKlxuICogS2VlcHMgdHJhY2sgb2YgZmluaXNoZWQgYWN0b3JzLCByZXR1cm5zIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIGFsbFxuICogc3RhcnRlZCBhY3RvcnMgc3VjY2VzZnVsbHkgZW5kLlxuICovXG5zdXBlcnZpc29yLl9ydW5Qcm94aWVzID0gZnVuY3Rpb24gcnVuUHJveGllcyAoc3JjLCBkZXN0LCBleHQsIHRyYW5zZm9ybSwgY29uZmlnKSB7XG4gIHZhciBudW0gPSBjb25maWcubnVtYmVyO1xuICB2YXIgZXJyb3JDb3VudCA9IGNvbmZpZy5lcnJvckNvdW50IHx8IDEwO1xuXG4gIGlmICghbnVtKXtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2NvbmZpZyBvYmplY3QgbXVzdCBpbmNsdWRlIHRoZSBudW1iZXIgb2Ygd29ya2VycyB0byBzdGFydCEnKVxuICB9XG5cbiAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uIHJ1blByb3hpZXNQcm9taXNlIChyZXNvbHZlLCByZWplY3Qpe1xuICAgIHZhciBlbmRDYiA9ICgpID0+IC0tbnVtIDwgMSAmJiByZXNvbHZlKCk7XG4gICAgc3VwZXJ2aXNvci5fdHJhY2tFcnJvcnMoZXJyb3JDb3VudCwgZXh0KTtcbiAgICBzdXBlcnZpc29yLl9zdGFydEFjdG9ycyhudW0sIHNyYywgZGVzdCwgZXh0LCB0cmFuc2Zvcm0sIGNvbmZpZywgZW5kQ2IpO1xuICB9KTtcbn07XG5cblxuLyoqXG4gKiBTdXBlcnZpc29yIHN0YXJ0cyBhY3RvcnMsIHJ1bm5pbmcgdGhlIHByb3h5IGFjdG9yIHByb2Nlc3NlcywgbW9uaXRvcmluZ1xuICogdGhlbSB0byBzZWUgd2hlbiB0aGV5IGFyZSBlaXRoZXIgYWxsIGZpbmlzaGVkLCBvciBoYXZlIGV4Y2Vzc2l2ZSBlcnJvcnMuIElmIHRoZXlcbiAqIGhhdmUgZXhjZXNzaXZlIGVycm9ycywgdGhlIHN1cGVydmlzb3Igd2lsbCBpbnRlbnRpb25hbGx5IHRocm93IGFuZCBzdG9wIHRoZSBzeXN0ZW0uXG4gKiBXaGVuIHRoZXkgY29tZSB0byB0aGUgZW5kIG9mIHRoZWlyIHF1ZXVlLCB0aGUgc3VwZXJ2aXNvciB3aWxsIHdhaXQgdW50aWwgdGhlIHF1ZXVlXG4gKiBzdGFydHMgYWdhaW4sIHRoZW4gc3RhcnQgdGhlbSB1cCBhZ2Fpbi5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gY29uZmlnIG51bWJlciA9IG51bWJlciBvZiBhY3RvcnMgdG8gc3RhcnQsXG4gKiB0cmFuc2Zvcm0gPSB0cmFuc2Zvcm0hXG4gKiBlcnJvckNvdW50ID0gYW1vdW50IG9mIGVycm9ycyBpbiBhIHJvdyBiZWZvcmUgaXQgc2h1dHMgZG93blxuICogQHBhcmFtIHtTdHJlYW19IHJjIG9wdGlvbmFsIHJlY3ljbGUgc3RyZWFtIGZvciBtZXNzYWdlcyB0aGF0IGVycm9yZWQuXG4gKiBAcGFyYW0ge1N0cmVhbX0gc3JjIGZvciB1c2Ugb25seSBpZiBub3QgcGlwaW5nLCB0aGVuIGl0cyB0aGUgc3JjIHN0cmVhbS5cbiAqIEBwYXJhbSB7U3RyZWFtfSBkZXN0IGZvciB1c2Ugb25seSBpZiBub3QgcGlwaW5nLCB0aGVuIGl0cyB0aGUgZGVzdCBzdHJlYW1cbiAqIEByZXR1cm5zIHtTdHJlYW19IER1cGxleCBTdHJlYW0gdGhhdCBjYW4gYmUgcGlwZWQgaW50byBhbmQgb3V0IG9mXG4gKi9cbnN1cGVydmlzb3Iuc3RhcnQgPSBmdW5jdGlvbiBzdGFydFN1cGVydmlzb3IgKGNvbmZpZywgdHJhbnNmb3JtLCBzcmMsIGRlc3QsIGV4dCkge1xuICAvLyBpZiB3ZSBhcmUgcGFzc2VkIGluIGEgcmVhZGFibGUgc3RyZWFtLCByYXRoZXIgdGhhbiBjcmVhdGluZyBvbiBvdXJzZWx2ZXMsXG4gIC8vIHRoZSB1c2VyIG1pZ2h0IHBhc3MgaXQgaW4gaW4gZmxvdyBtb2RlLCB3aGljaCB3ZSBkb24ndCB3YW50LCBzbyB3ZSBzdG9wIGl0LlxuICBzcmMgJiYgIXNyYy5pc1BhdXNlZCgpID8gc3JjLnBhdXNlKCkgOiBudWxsO1xuXG4gIC8vIGlmIHdlIGFyZSBub3QgZ2l2ZW4gc3RyZWFtcyBkaXJlY3RseSwgdGhlbiB3ZSdyZSBiZWluZyBwaXBlZCwgaW4gd2hpY2hcbiAgLy8gY2FzZSB3ZSBjcmVhdGUgcGFzc3Rocm91Z2ggc3RyZWFtcyBzbyB3ZSBoYXZlIGEgcmVhZCgpIGFuZCB3cml0ZSgpXG4gIC8vIGludGVyZmFjZSB3aXRoIHByb3BlciBiYWNrcHJlc3N1cmUgdGhyb3VnaG91dCB0aGUgcmVzdCBvZiBvdXIgcHJvY2Vzcy5cbiAgaWYgKCFzcmMpIHtcbiAgICAoe2V4dCwgc3JjLCBkZXN0fSA9IGNvcHBlci5mYW5vdXQoKSk7XG4gIH1cblxuICBzcmMub24oJ3JlYWRhYmxlJywgaGFuZGxlTmV3RGF0YSk7XG5cbiAgZnVuY3Rpb24gaGFuZGxlTmV3RGF0YSAoKSB7XG5cbiAgICBzdXBlcnZpc29yXG4gICAgICAuX3J1blByb3hpZXMoc3JjLCBkZXN0LCBleHQsIHRyYW5zZm9ybSwgY29uZmlnKVxuICAgICAgLnRoZW4oKCkgPT4gY29uc29sZS5sb2coJ3N1cGVydmlzb3IgcmVzb2x2ZWQ6ICcsIGNvbmZpZykpXG4gICAgICAudGhlbigoKSA9PiBleHQuZW1pdCgnc3VjY2VzcycsICdGaW5pc2hlZC4gTm93IGxpc3RlbmluZyBmb3IgbW9yZScpKVxuICAgICAgLnRoZW4oKCkgPT4gc3RhcnRTdXBlcnZpc29yKGNvbmZpZywgdHJhbnNmb3JtLCBzcmMsIGRlc3QsIGV4dCkpXG4gICAgICAuY2F0Y2goZXJyID0+IGV4dC5lbWl0KCdlcnJvcicsIGVycikpXG5cbiAgICAvLyByZW1vdmUgbGlzdGVuZXIgc28gdGhhdCBvdXIgcHJvY2VzcyAgZG9lc24ndCBnZXQgcmVzdGFydGVkXG4gICAgLy8gdW50aWwgYWxsIGFjdG9ycyBoYXZlIGZ1bGx5IHN0b3BwZWQuXG4gICAgc3JjLnJlbW92ZUxpc3RlbmVyKCdyZWFkYWJsZScsIGhhbmRsZU5ld0RhdGEpO1xuICB9O1xuXG4gIHJldHVybiBleHQ7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHN1cGVydmlzb3I7XG4iXX0=