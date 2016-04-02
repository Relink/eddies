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
supervisor._trackErrors = function _trackErrors (maxErrors) {
  var ee = new EventEmitter();
  var errors = 0;

  ee.on('success', msg => errors = 0 )
  ee.on('error', err => {
    if (++errors > maxErrors) {
      throw new Error('grind this whole shit to a halt');
    };
  });

  return ee;
};

/*
 * recursing function that fires up actors
 */
supervisor._startActors = function startActors(num, src, dest, rc, ee, config, endCb) {
  if (num === 0) {
    return;
  };

  actor
    .start(src, dest, config.transform)
    .on('success', msg => ee.emit('success', msg))
    .on('error', function handleErrors (err){

      // write message back to the recycle/error queue
      if (rc) {
        var input = err.originalInput;
        rc.write(input) || rc.once('drain', rc.write(input));
      }

      // write to the error stream and recurse to restart a single actor.
      ee.emit('error', err);
      startActors(1, src, dest, rc, ee, config, endCb);
    })
    .on('end', endCb);

  startActors(--num, src, dest, rc, ee, config, endCb);
};

/*
 * Keeps track of finished actors, returns promise that resolves when all
 * started actors succesfully end.
 */
supervisor._runProxies = function runProxies (src, dest, config, rc) {
  var num = config.number;
  var errorCount = config.errorCount || 10;
  var resolve;

  if (!num){
    throw new Error('config object must include the number of workers to start!')
  }

  var endCb = () => --num < 1 && resolve();
  var ee = supervisor._trackErrors(errorCount);
  supervisor._startActors(num, src, dest, rc, ee, config, endCb);

  return new Promise((_resolve, reject) => resolve = _resolve);
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
supervisor.start = function startSupervisor (config, rc, src, dest) {

  // if we are passed in a readable stream, rather than creating on ourselves,
  // the user might pass it in in flow mode, which we don't want, so we stop it.
  src && !src.isPaused() ? src.pause() : null;

  // if we are not given streams directly, then we're being piped, in which
  // case we create passthrough streams so we have a read() and write()
  // interface with proper backpressure throughout the rest of our process.
  var streams = copper.fanout();
  src = src || streams.src;
  dest = dest || streams.dest;

  src.on('readable', handleNewData);

  function handleNewData () {
    supervisor
      ._runProxies(src, dest, config, rc)
      .then(() => startSupervisor(config, rc, src, dest))

    // remove listener so that our process  doesn't get restarted
    // until all actors have fully stopped.
    src.removeListener('readable', handleNewData);
  };

  return streams.ext;
};

module.exports = supervisor;
