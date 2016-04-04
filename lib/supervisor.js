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

  startActors(--num, src, dest, ee, transform, config, endCb);
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
//# sourceMappingURL=data:application/json;base64,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R0FBaUIsVUFBakIiLCJmaWxlIjoic3VwZXJ2aXNvci5qcyIsInNvdXJjZXNDb250ZW50IjpbInZhciBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdldmVudHMnKS5FdmVudEVtaXR0ZXI7XG52YXIgc3RyZWFtID0gcmVxdWlyZSgnc3RyZWFtJyk7XG52YXIgXyA9IHJlcXVpcmUoJ2xvZGFzaCcpO1xudmFyIGNvcHBlciA9IHJlcXVpcmUoJ0ByZWxpbmtsYWJzL2NvcHBlcicpO1xudmFyIGFjdG9yID0gcmVxdWlyZSgnLi9hY3RvcicpO1xudmFyIHN1cGVydmlzb3IgPSB7fTtcblxuLypcbiAqIEtlZXBzIHRyYWNrIG9mIG51bWJlciBvZiBlcnJvcnMgaW4gYSByb3cgYmVmb3JlIGFueSBzdWNjZXNzZXNcbiAqIGFuZCBncmluZHMgZXZlcnl0aGluZyB0byBhIGhhbHQgaWYgdGhlIGVycm9ycyBleGNlZWQgdG8gcHJvdmlkZWRcbiAqIG1heGltdW0gbnVtYmVyLlxuICovXG5zdXBlcnZpc29yLl90cmFja0Vycm9ycyA9IGZ1bmN0aW9uIF90cmFja0Vycm9ycyAobWF4RXJyb3JzLCBlZSkge1xuICB2YXIgZXJyb3JzID0gMDtcblxuICBlZS5vbignc3VjY2VzcycsIG1zZyA9PiBlcnJvcnMgPSAwIClcbiAgZWUub24oJ2Vycm9yJywgZXJyID0+IHtcbiAgICBpZiAoKytlcnJvcnMgPiBtYXhFcnJvcnMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignZ3JpbmQgdGhpcyB3aG9sZSBzaGl0IHRvIGEgaGFsdCcpO1xuICAgIH07XG4gIH0pO1xufTtcblxuLypcbiAqIHJlY3Vyc2luZyBmdW5jdGlvbiB0aGF0IGZpcmVzIHVwIGFjdG9yc1xuICovXG5zdXBlcnZpc29yLl9zdGFydEFjdG9ycyA9IGZ1bmN0aW9uIHN0YXJ0QWN0b3JzKG51bSwgc3JjLCBkZXN0LCBlZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdHJhbnNmb3JtLCBjb25maWcsIGVuZENiKSB7XG5cbiAgdmFyIHJjID0gY29uZmlnLnJjO1xuICBpZiAobnVtID09PSAwKSB7XG4gICAgcmV0dXJuO1xuICB9O1xuXG4gIGFjdG9yXG4gICAgLnN0YXJ0KHNyYywgZGVzdCwgdHJhbnNmb3JtKVxuICAgIC5vbignc3VjY2VzcycsIG1zZyA9PiBlZS5lbWl0KCdzdWNjZXNzJywgbXNnKSlcbiAgICAub24oJ2Vycm9yJywgZnVuY3Rpb24gaGFuZGxlRXJyb3JzIChlcnIpe1xuXG4gICAgICAvLyB3cml0ZSBtZXNzYWdlIGJhY2sgdG8gdGhlIHJlY3ljbGUvZXJyb3IgcXVldWVcbiAgICAgIGlmIChyYykge1xuICAgICAgICB2YXIgaW5wdXQgPSBlcnIub3JpZ2luYWxJbnB1dDtcblxuICAgICAgICAvLyBUT0RPOiBoYW5kbGUgYmFja3ByZXNoIG9uIHJlY3ljbGUgc3RyZWFtIVxuICAgICAgICByYy53cml0ZShpbnB1dCkgfHwgcmMub25jZSgnZHJhaW4nLCAoKSA9PiB0cnVlKTtcbiAgICAgIH1cblxuICAgICAgLy8gd3JpdGUgdG8gdGhlIGVycm9yIHN0cmVhbSBhbmQgcmVjdXJzZSB0byByZXN0YXJ0IGEgc2luZ2xlIGFjdG9yLlxuICAgICAgZWUuZW1pdCgnZXJyb3InLCBlcnIpO1xuICAgICAgc3RhcnRBY3RvcnMoMSwgc3JjLCBkZXN0LCBlZSwgdHJhbnNmb3JtLCBjb25maWcsIGVuZENiKTtcbiAgICB9KVxuICAgIC5vbignZW5kJywgZW5kQ2IpO1xuXG4gIHN0YXJ0QWN0b3JzKC0tbnVtLCBzcmMsIGRlc3QsIGVlLCB0cmFuc2Zvcm0sIGNvbmZpZywgZW5kQ2IpO1xufTtcblxuLypcbiAqIEtlZXBzIHRyYWNrIG9mIGZpbmlzaGVkIGFjdG9ycywgcmV0dXJucyBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiBhbGxcbiAqIHN0YXJ0ZWQgYWN0b3JzIHN1Y2Nlc2Z1bGx5IGVuZC5cbiAqL1xuc3VwZXJ2aXNvci5fcnVuUHJveGllcyA9IGZ1bmN0aW9uIHJ1blByb3hpZXMgKHNyYywgZGVzdCwgZXh0LCB0cmFuc2Zvcm0sIGNvbmZpZykge1xuICB2YXIgbnVtID0gY29uZmlnLm51bWJlcjtcbiAgdmFyIGVycm9yQ291bnQgPSBjb25maWcuZXJyb3JDb3VudCB8fCAxMDtcblxuICBpZiAoIW51bSl7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdjb25maWcgb2JqZWN0IG11c3QgaW5jbHVkZSB0aGUgbnVtYmVyIG9mIHdvcmtlcnMgdG8gc3RhcnQhJylcbiAgfVxuXG4gIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbiBydW5Qcm94aWVzUHJvbWlzZSAocmVzb2x2ZSwgcmVqZWN0KXtcbiAgICB2YXIgZW5kQ2IgPSAoKSA9PiAtLW51bSA8IDEgJiYgcmVzb2x2ZSgpO1xuICAgIHN1cGVydmlzb3IuX3RyYWNrRXJyb3JzKGVycm9yQ291bnQsIGV4dCk7XG4gICAgc3VwZXJ2aXNvci5fc3RhcnRBY3RvcnMobnVtLCBzcmMsIGRlc3QsIGV4dCwgdHJhbnNmb3JtLCBjb25maWcsIGVuZENiKTtcbiAgfSk7XG59O1xuXG5cbi8qKlxuICogU3VwZXJ2aXNvciBzdGFydHMgYWN0b3JzLCBydW5uaW5nIHRoZSBwcm94eSBhY3RvciBwcm9jZXNzZXMsIG1vbml0b3JpbmdcbiAqIHRoZW0gdG8gc2VlIHdoZW4gdGhleSBhcmUgZWl0aGVyIGFsbCBmaW5pc2hlZCwgb3IgaGF2ZSBleGNlc3NpdmUgZXJyb3JzLiBJZiB0aGV5XG4gKiBoYXZlIGV4Y2Vzc2l2ZSBlcnJvcnMsIHRoZSBzdXBlcnZpc29yIHdpbGwgaW50ZW50aW9uYWxseSB0aHJvdyBhbmQgc3RvcCB0aGUgc3lzdGVtLlxuICogV2hlbiB0aGV5IGNvbWUgdG8gdGhlIGVuZCBvZiB0aGVpciBxdWV1ZSwgdGhlIHN1cGVydmlzb3Igd2lsbCB3YWl0IHVudGlsIHRoZSBxdWV1ZVxuICogc3RhcnRzIGFnYWluLCB0aGVuIHN0YXJ0IHRoZW0gdXAgYWdhaW4uXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IGNvbmZpZyBudW1iZXIgPSBudW1iZXIgb2YgYWN0b3JzIHRvIHN0YXJ0LFxuICogdHJhbnNmb3JtID0gdHJhbnNmb3JtIVxuICogZXJyb3JDb3VudCA9IGFtb3VudCBvZiBlcnJvcnMgaW4gYSByb3cgYmVmb3JlIGl0IHNodXRzIGRvd25cbiAqIEBwYXJhbSB7U3RyZWFtfSByYyBvcHRpb25hbCByZWN5Y2xlIHN0cmVhbSBmb3IgbWVzc2FnZXMgdGhhdCBlcnJvcmVkLlxuICogQHBhcmFtIHtTdHJlYW19IHNyYyBmb3IgdXNlIG9ubHkgaWYgbm90IHBpcGluZywgdGhlbiBpdHMgdGhlIHNyYyBzdHJlYW0uXG4gKiBAcGFyYW0ge1N0cmVhbX0gZGVzdCBmb3IgdXNlIG9ubHkgaWYgbm90IHBpcGluZywgdGhlbiBpdHMgdGhlIGRlc3Qgc3RyZWFtXG4gKiBAcmV0dXJucyB7U3RyZWFtfSBEdXBsZXggU3RyZWFtIHRoYXQgY2FuIGJlIHBpcGVkIGludG8gYW5kIG91dCBvZlxuICovXG5zdXBlcnZpc29yLnN0YXJ0ID0gZnVuY3Rpb24gc3RhcnRTdXBlcnZpc29yIChjb25maWcsIHRyYW5zZm9ybSwgc3JjLCBkZXN0LCBleHQpIHtcbiAgLy8gaWYgd2UgYXJlIHBhc3NlZCBpbiBhIHJlYWRhYmxlIHN0cmVhbSwgcmF0aGVyIHRoYW4gY3JlYXRpbmcgb24gb3Vyc2VsdmVzLFxuICAvLyB0aGUgdXNlciBtaWdodCBwYXNzIGl0IGluIGluIGZsb3cgbW9kZSwgd2hpY2ggd2UgZG9uJ3Qgd2FudCwgc28gd2Ugc3RvcCBpdC5cbiAgc3JjICYmICFzcmMuaXNQYXVzZWQoKSA/IHNyYy5wYXVzZSgpIDogbnVsbDtcblxuICAvLyBpZiB3ZSBhcmUgbm90IGdpdmVuIHN0cmVhbXMgZGlyZWN0bHksIHRoZW4gd2UncmUgYmVpbmcgcGlwZWQsIGluIHdoaWNoXG4gIC8vIGNhc2Ugd2UgY3JlYXRlIHBhc3N0aHJvdWdoIHN0cmVhbXMgc28gd2UgaGF2ZSBhIHJlYWQoKSBhbmQgd3JpdGUoKVxuICAvLyBpbnRlcmZhY2Ugd2l0aCBwcm9wZXIgYmFja3ByZXNzdXJlIHRocm91Z2hvdXQgdGhlIHJlc3Qgb2Ygb3VyIHByb2Nlc3MuXG4gIGlmICghc3JjKSB7XG4gICAgKHtleHQsIHNyYywgZGVzdH0gPSBjb3BwZXIuZmFub3V0KCkpO1xuICB9XG5cbiAgc3JjLm9uKCdyZWFkYWJsZScsIGhhbmRsZU5ld0RhdGEpO1xuXG4gIGZ1bmN0aW9uIGhhbmRsZU5ld0RhdGEgKCkge1xuICAgIHN1cGVydmlzb3JcbiAgICAgIC5fcnVuUHJveGllcyhzcmMsIGRlc3QsIGV4dCwgdHJhbnNmb3JtLCBjb25maWcpXG4gICAgICAudGhlbigoKSA9PiBleHQuZW1pdCgnc3VjY2VzcycsICdGaW5pc2hlZC4gTm93IGxpc3RlbmluZyBmb3IgbW9yZScpKVxuICAgICAgLnRoZW4oKCkgPT4gc3RhcnRTdXBlcnZpc29yKGNvbmZpZywgdHJhbnNmb3JtLCBzcmMsIGRlc3QsIGV4dCkpXG4gICAgICAuY2F0Y2goZXJyID0+IGV4dC5lbWl0KCdlcnJvcicsIGVycikpXG5cbiAgICAvLyByZW1vdmUgbGlzdGVuZXIgc28gdGhhdCBvdXIgcHJvY2VzcyAgZG9lc24ndCBnZXQgcmVzdGFydGVkXG4gICAgLy8gdW50aWwgYWxsIGFjdG9ycyBoYXZlIGZ1bGx5IHN0b3BwZWQuXG4gICAgc3JjLnJlbW92ZUxpc3RlbmVyKCdyZWFkYWJsZScsIGhhbmRsZU5ld0RhdGEpO1xuICB9O1xuXG4gIHJldHVybiBleHQ7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHN1cGVydmlzb3I7XG4iXX0=