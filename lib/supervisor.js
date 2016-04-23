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

  ee.on('eddies:success', function (msg) {
    return errors = 0;
  });
  ee.on('eddies:warn', function (err) {
    if (++errors > maxErrors) {
      ee.emit('error', new Error('grind this whole shit to a halt'));
    };
  });
};

/*
 * recursing function that fires up actors
 */
supervisor._startActors = function startActors(num, src, dest, ext, transform, config, endCb) {
  var rc = config.rc;
  if (num === 0) {
    return;
  };

  actor.start(src, dest, transform).on('success', function (msg) {
    return ext.emit('eddies:success', msg);
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
    ext.emit('eddies:warn', err);
    startActors(1, src, dest, ext, transform, config, endCb);
  }).on('end', endCb);

  // Run each actor asynchronously, so the read's from the incoming stream can
  // catch up.
  setTimeout(function () {
    return startActors(--num, src, dest, ext, transform, config, endCb);
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
      return ext.emit('eddies:finish');
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
//# sourceMappingURL=data:application/json;base64,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QUFQLENBM0I4RTtDQUE3RDs7QUE4Qm5CLE9BQU8sT0FBUCxHQUFpQixVQUFqQiIsImZpbGUiOiJzdXBlcnZpc29yLmpzIiwic291cmNlc0NvbnRlbnQiOlsidmFyIEV2ZW50RW1pdHRlciA9IHJlcXVpcmUoJ2V2ZW50cycpLkV2ZW50RW1pdHRlcjtcbnZhciBzdHJlYW0gPSByZXF1aXJlKCdzdHJlYW0nKTtcbnZhciBfID0gcmVxdWlyZSgnbG9kYXNoJyk7XG52YXIgY29wcGVyID0gcmVxdWlyZSgnQHJlbGlua2xhYnMvY29wcGVyJyk7XG52YXIgYWN0b3IgPSByZXF1aXJlKCcuL2FjdG9yJyk7XG52YXIgc3VwZXJ2aXNvciA9IHt9O1xuXG4vKlxuICogS2VlcHMgdHJhY2sgb2YgbnVtYmVyIG9mIGVycm9ycyBpbiBhIHJvdyBiZWZvcmUgYW55IHN1Y2Nlc3Nlc1xuICogYW5kIGdyaW5kcyBldmVyeXRoaW5nIHRvIGEgaGFsdCBpZiB0aGUgZXJyb3JzIGV4Y2VlZCB0byBwcm92aWRlZFxuICogbWF4aW11bSBudW1iZXIuXG4gKi9cbnN1cGVydmlzb3IuX3RyYWNrRXJyb3JzID0gZnVuY3Rpb24gX3RyYWNrRXJyb3JzIChtYXhFcnJvcnMsIGVlKSB7XG4gIHZhciBlcnJvcnMgPSAwO1xuXG4gIGVlLm9uKCdlZGRpZXM6c3VjY2VzcycsIG1zZyA9PiBlcnJvcnMgPSAwIClcbiAgZWUub24oJ2VkZGllczp3YXJuJywgZXJyID0+IHtcbiAgICBpZiAoKytlcnJvcnMgPiBtYXhFcnJvcnMpIHtcbiAgICAgIGVlLmVtaXQoJ2Vycm9yJywgbmV3IEVycm9yKCdncmluZCB0aGlzIHdob2xlIHNoaXQgdG8gYSBoYWx0JykpXG4gICAgfTtcbiAgfSk7XG59O1xuXG4vKlxuICogcmVjdXJzaW5nIGZ1bmN0aW9uIHRoYXQgZmlyZXMgdXAgYWN0b3JzXG4gKi9cbnN1cGVydmlzb3IuX3N0YXJ0QWN0b3JzID0gZnVuY3Rpb24gc3RhcnRBY3RvcnMobnVtLCBzcmMsIGRlc3QsIGV4dCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdHJhbnNmb3JtLCBjb25maWcsIGVuZENiKSB7XG4gIHZhciByYyA9IGNvbmZpZy5yYztcbiAgaWYgKG51bSA9PT0gMCkge1xuICAgIHJldHVybjtcbiAgfTtcblxuICBhY3RvclxuICAgIC5zdGFydChzcmMsIGRlc3QsIHRyYW5zZm9ybSlcbiAgICAub24oJ3N1Y2Nlc3MnLCBtc2cgPT4gZXh0LmVtaXQoJ2VkZGllczpzdWNjZXNzJywgbXNnKSlcbiAgICAub24oJ2Vycm9yJywgZnVuY3Rpb24gaGFuZGxlRXJyb3JzIChlcnIpe1xuXG4gICAgICAvLyB3cml0ZSBtZXNzYWdlIGJhY2sgdG8gdGhlIHJlY3ljbGUvZXJyb3IgcXVldWVcbiAgICAgIGlmIChyYykge1xuICAgICAgICB2YXIgaW5wdXQgPSBlcnIub3JpZ2luYWxJbnB1dDtcblxuICAgICAgICAvLyBUT0RPOiBoYW5kbGUgYmFja3ByZXNoIG9uIHJlY3ljbGUgc3RyZWFtIVxuICAgICAgICByYy53cml0ZShpbnB1dCkgfHwgcmMub25jZSgnZHJhaW4nLCAoKSA9PiB0cnVlKTtcbiAgICAgIH1cblxuICAgICAgLy8gd3JpdGUgdG8gdGhlIGVycm9yIHN0cmVhbSBhbmQgcmVjdXJzZSB0byByZXN0YXJ0IGEgc2luZ2xlIGFjdG9yLlxuICAgICAgZXh0LmVtaXQoJ2VkZGllczp3YXJuJywgZXJyKTtcbiAgICAgIHN0YXJ0QWN0b3JzKDEsIHNyYywgZGVzdCwgZXh0LCB0cmFuc2Zvcm0sIGNvbmZpZywgZW5kQ2IpO1xuICAgIH0pXG4gICAgLm9uKCdlbmQnLCBlbmRDYik7XG5cbiAgLy8gUnVuIGVhY2ggYWN0b3IgYXN5bmNocm9ub3VzbHksIHNvIHRoZSByZWFkJ3MgZnJvbSB0aGUgaW5jb21pbmcgc3RyZWFtIGNhblxuICAvLyBjYXRjaCB1cC5cbiAgc2V0VGltZW91dCgoKSA9PiBzdGFydEFjdG9ycygtLW51bSwgc3JjLCBkZXN0LCBleHQsIHRyYW5zZm9ybSwgY29uZmlnLCBlbmRDYikpO1xuXG59O1xuXG4vKlxuICogS2VlcHMgdHJhY2sgb2YgZmluaXNoZWQgYWN0b3JzLCByZXR1cm5zIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIGFsbFxuICogc3RhcnRlZCBhY3RvcnMgc3VjY2VzZnVsbHkgZW5kLlxuICovXG5zdXBlcnZpc29yLl9ydW5Qcm94aWVzID0gZnVuY3Rpb24gcnVuUHJveGllcyAoc3JjLCBkZXN0LCBleHQsIHRyYW5zZm9ybSwgY29uZmlnKSB7XG4gIHZhciBudW0gPSBjb25maWcubnVtYmVyO1xuICB2YXIgZXJyb3JDb3VudCA9IGNvbmZpZy5lcnJvckNvdW50IHx8IDEwO1xuXG4gIGlmICghbnVtKXtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2NvbmZpZyBvYmplY3QgbXVzdCBpbmNsdWRlIHRoZSBudW1iZXIgb2Ygd29ya2VycyB0byBzdGFydCEnKVxuICB9XG5cbiAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uIHJ1blByb3hpZXNQcm9taXNlIChyZXNvbHZlLCByZWplY3Qpe1xuICAgIHZhciBlbmRDYiA9ICgpID0+IC0tbnVtIDwgMSAmJiByZXNvbHZlKCk7XG4gICAgc3VwZXJ2aXNvci5fdHJhY2tFcnJvcnMoZXJyb3JDb3VudCwgZXh0KTtcbiAgICBzdXBlcnZpc29yLl9zdGFydEFjdG9ycyhudW0sIHNyYywgZGVzdCwgZXh0LCB0cmFuc2Zvcm0sIGNvbmZpZywgZW5kQ2IpO1xuICB9KTtcbn07XG5cblxuLyoqXG4gKiBTdXBlcnZpc29yIHN0YXJ0cyBhY3RvcnMsIHJ1bm5pbmcgdGhlIHByb3h5IGFjdG9yIHByb2Nlc3NlcywgbW9uaXRvcmluZ1xuICogdGhlbSB0byBzZWUgd2hlbiB0aGV5IGFyZSBlaXRoZXIgYWxsIGZpbmlzaGVkLCBvciBoYXZlIGV4Y2Vzc2l2ZSBlcnJvcnMuIElmIHRoZXlcbiAqIGhhdmUgZXhjZXNzaXZlIGVycm9ycywgdGhlIHN1cGVydmlzb3Igd2lsbCBpbnRlbnRpb25hbGx5IHRocm93IGFuZCBzdG9wIHRoZSBzeXN0ZW0uXG4gKiBXaGVuIHRoZXkgY29tZSB0byB0aGUgZW5kIG9mIHRoZWlyIHF1ZXVlLCB0aGUgc3VwZXJ2aXNvciB3aWxsIHdhaXQgdW50aWwgdGhlIHF1ZXVlXG4gKiBzdGFydHMgYWdhaW4sIHRoZW4gc3RhcnQgdGhlbSB1cCBhZ2Fpbi5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gY29uZmlnIG51bWJlciA9IG51bWJlciBvZiBhY3RvcnMgdG8gc3RhcnQsXG4gKiB0cmFuc2Zvcm0gPSB0cmFuc2Zvcm0hXG4gKiBlcnJvckNvdW50ID0gYW1vdW50IG9mIGVycm9ycyBpbiBhIHJvdyBiZWZvcmUgaXQgc2h1dHMgZG93blxuICogQHBhcmFtIHtTdHJlYW19IHJjIG9wdGlvbmFsIHJlY3ljbGUgc3RyZWFtIGZvciBtZXNzYWdlcyB0aGF0IGVycm9yZWQuXG4gKiBAcGFyYW0ge1N0cmVhbX0gc3JjIGZvciB1c2Ugb25seSBpZiBub3QgcGlwaW5nLCB0aGVuIGl0cyB0aGUgc3JjIHN0cmVhbS5cbiAqIEBwYXJhbSB7U3RyZWFtfSBkZXN0IGZvciB1c2Ugb25seSBpZiBub3QgcGlwaW5nLCB0aGVuIGl0cyB0aGUgZGVzdCBzdHJlYW1cbiAqIEByZXR1cm5zIHtTdHJlYW19IER1cGxleCBTdHJlYW0gdGhhdCBjYW4gYmUgcGlwZWQgaW50byBhbmQgb3V0IG9mXG4gKi9cbnN1cGVydmlzb3Iuc3RhcnQgPSBmdW5jdGlvbiBzdGFydFN1cGVydmlzb3IgKGNvbmZpZywgdHJhbnNmb3JtLCBzcmMsIGRlc3QsIGV4dCkge1xuICAvLyBpZiB3ZSBhcmUgcGFzc2VkIGluIGEgcmVhZGFibGUgc3RyZWFtLCByYXRoZXIgdGhhbiBjcmVhdGluZyBvbiBvdXJzZWx2ZXMsXG4gIC8vIHRoZSB1c2VyIG1pZ2h0IHBhc3MgaXQgaW4gaW4gZmxvdyBtb2RlLCB3aGljaCB3ZSBkb24ndCB3YW50LCBzbyB3ZSBzdG9wIGl0LlxuICBzcmMgJiYgIXNyYy5pc1BhdXNlZCgpID8gc3JjLnBhdXNlKCkgOiBudWxsO1xuXG4gIC8vIGlmIHdlIGFyZSBub3QgZ2l2ZW4gc3RyZWFtcyBkaXJlY3RseSwgdGhlbiB3ZSdyZSBiZWluZyBwaXBlZCwgaW4gd2hpY2hcbiAgLy8gY2FzZSB3ZSBjcmVhdGUgcGFzc3Rocm91Z2ggc3RyZWFtcyBzbyB3ZSBoYXZlIGEgcmVhZCgpIGFuZCB3cml0ZSgpXG4gIC8vIGludGVyZmFjZSB3aXRoIHByb3BlciBiYWNrcHJlc3N1cmUgdGhyb3VnaG91dCB0aGUgcmVzdCBvZiBvdXIgcHJvY2Vzcy5cbiAgaWYgKCFzcmMpIHtcbiAgICAoe2V4dCwgc3JjLCBkZXN0fSA9IGNvcHBlci5mYW5vdXQoKSk7XG4gIH1cblxuICBzcmMub24oJ3JlYWRhYmxlJywgaGFuZGxlTmV3RGF0YSk7XG5cbiAgZnVuY3Rpb24gaGFuZGxlTmV3RGF0YSAoKSB7XG5cbiAgICBzdXBlcnZpc29yXG4gICAgICAuX3J1blByb3hpZXMoc3JjLCBkZXN0LCBleHQsIHRyYW5zZm9ybSwgY29uZmlnKVxuICAgICAgLnRoZW4oKCkgPT4gZXh0LmVtaXQoJ2VkZGllczpmaW5pc2gnKSlcbiAgICAgIC50aGVuKCgpID0+IHN0YXJ0U3VwZXJ2aXNvcihjb25maWcsIHRyYW5zZm9ybSwgc3JjLCBkZXN0LCBleHQpKVxuICAgICAgLmNhdGNoKGVyciA9PiBleHQuZW1pdCgnZXJyb3InLCBlcnIpKVxuXG4gICAgLy8gcmVtb3ZlIGxpc3RlbmVyIHNvIHRoYXQgb3VyIHByb2Nlc3MgIGRvZXNuJ3QgZ2V0IHJlc3RhcnRlZFxuICAgIC8vIHVudGlsIGFsbCBhY3RvcnMgaGF2ZSBmdWxseSBzdG9wcGVkLlxuICAgIHNyYy5yZW1vdmVMaXN0ZW5lcigncmVhZGFibGUnLCBoYW5kbGVOZXdEYXRhKTtcbiAgfTtcblxuICByZXR1cm4gZXh0O1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBzdXBlcnZpc29yO1xuIl19