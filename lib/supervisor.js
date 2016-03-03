var EventEmitter = require('events').EventEmitter;
var stream = require('stream');
var _ = require('lodash');
var copper = require('@relinklabs/copper');
var actor = require('./actor');
var supervisor = {};

/*
 * Keeps a sliding time window, and when the error count from the passed
 * EventEmitter goes over the limit (n), this will throw an uncaught error,
 * stopping everything.
 */
supervisor._trackErrors = function _trackErrors (n, ms, ee) {
  var errors = 0;

  setInterval(() => {
    errors = 0;
  }, ms);

  ee.on('error', err => {
    if (++errors > n) {
      throw new Error('grind this whole shit to a halt');
    };
  });

  return ee.emit.bind(ee, 'error');
};

/*
 * recursing function that fires up actors
 */
supervisor._startActors = function startActors(num, src, dest, rc, config, endCb) {
  if (num === 0) {
    return;
  };

  // keep track of each actors death?? Restart a cetain number of times

  actor
    .start(src, dest, config.createOptions, config.newProxy)
    .on('error', function handleErrors (err){

      // write message back to the queue.
      var input = err.originalInput;
      rc.write(input) || rc.once('drain', rc.write(input));

      // write to the error stream and recurse to restart a single actor.
      src.emit('error', err);
      startActors(1, src, dest, rc, config,  endCb);
    })
    .on('end', endCb);

  // process.nextTick()?????
  startActors(--num, src, dest, rc, config, endCb);
};

/*
 * Keeps track of finished actors, returns promise that resolves when all
 * started actors succesfully end.
 */
supervisor._runProxies = function runProxies (src, dest, rc, config) {
  var num = config.number;
  var resolve;

  function endCb () {
    --num < 1 && resolve();
  }

  supervisor._trackErrors(100, 500, src);
  supervisor._startActors(config.number, src, dest, rc, config, endCb);
  return new Promise((_resolve, reject) => resolve = _resolve);
};


/**
 * Supervisor starts the proxy process, running the proxy actor processes, monitoring
 * them to see when they are either all finished, or have excessive errors. If they
 * have excessive errors, the supervisor will intentionally throw and stop the system.
 * When they come to the end of their queue, the supervisor will wait until the queue
 * starts again, then start them up again.
 *
 * @param {Stream} src
 * @param {Stream} dest
 * @param {Stream} rc
 * @param {Object} config
 * @param {EventEmitter} ee (optional) Emitter which will be returned at the end.
 * @returns {EventEmitter} Which emits all error events collected by process (except 404s...)
 */
supervisor.start = function startSupervisor (rc, config, src, dest) {
  // config.number = number of proxies
  // config.createOptions = function to create options.
  // config.newProxy = function to give new proxies

  // if we are passed in a readable stream, rather than creating on ourselves,
  // the user might pass it in in flow mode, which we don't want, so we stop it.
  src && !src.isPaused() ? src.pause() : null;

  // if we are not given streams directly, then we're being piped, in which
  // case we create passthrough streams so we have a read() and write()
  // interface with proper backpressure throughout the rest of our process.
  var streams = coppper.fanout();
  src = src || streams.src;
  dest = dest || streams.dest;

  src.on('readable', handleNewData);

  function handleNewData () {
    supervisor
      ._runProxies(rc, config, src, dest)
      .then(() =>supervisor.start(rc, config, src, dest));

    // remove listener so that our process  doesn't get restarted
    // until all actors have fully stopped.
    src.removeListener('readable', handleNewData);
  };

  return streams.ext;
};

// on pipe, get src, pause it, and then proceed to pass it on as src.
// dest than becomes a writeable stream we create. (two streams prevents the first
// from turning into 'flow' mode, which would emit data events to all readers, instead
// of each just getting one)

module.exports = supervisor;
