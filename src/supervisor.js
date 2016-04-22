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
supervisor._trackErrors = function _trackErrors (maxErrors, ee) {
  var errors = 0;

  ee.on('success', msg => errors = 0 )
  ee.on('warn', err => {
    if (++errors > maxErrors) {
      ee.emit('error', new Error('grind this whole shit to a halt'))
    };
  });
};

/*
 * recursing function that fires up actors
 */
supervisor._startActors = function startActors(num, src, dest, ee,
                                               transform, config, endCb) {
  var rc = config.rc;
  if (num === 0) {
    return;
  };

  actor
    .start(src, dest, transform)
    .on('success', msg => ee.emit('success', msg))
    .on('error', function handleErrors (err){

      // write message back to the recycle/error queue
      if (rc) {
        var input = err.originalInput;

        // TODO: handle backpresh on recycle stream!
        rc.write(input) || rc.once('drain', () => true);
      }

      // write to the error stream and recurse to restart a single actor.
      ee.emit('warn', err);
      startActors(1, src, dest, ee, transform, config, endCb);
    })
    .on('end', endCb);

  // Run each actor asynchronously, so the read's from the incoming stream can
  // catch up.
  setTimeout(() => startActors(--num, src, dest, ee, transform, config, endCb));

};

/*
 * Keeps track of finished actors, returns promise that resolves when all
 * started actors succesfully end.
 */
supervisor._runProxies = function runProxies (src, dest, ext, transform, config) {
  var num = config.number;
  var errorCount = config.errorCount || 10;

  if (!num){
    throw new Error('config object must include the number of workers to start!')
  }

  return new Promise(function runProxiesPromise (resolve, reject){
    var endCb = () => --num < 1 && resolve();
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
supervisor.start = function startSupervisor (config, transform, src, dest, ext) {
  // if we are passed in a readable stream, rather than creating on ourselves,
  // the user might pass it in in flow mode, which we don't want, so we stop it.
  src && !src.isPaused() ? src.pause() : null;

  // if we are not given streams directly, then we're being piped, in which
  // case we create passthrough streams so we have a read() and write()
  // interface with proper backpressure throughout the rest of our process.
  if (!src) {
    ({ext, src, dest} = copper.fanout());
  }

  src.on('readable', handleNewData);

  function handleNewData () {

    supervisor
      ._runProxies(src, dest, ext, transform, config)
      .then(() => ext.emit('finish'))
      .then(() => startSupervisor(config, transform, src, dest, ext))
      .catch(err => ext.emit('error', err))

    // remove listener so that our process  doesn't get restarted
    // until all actors have fully stopped.
    src.removeListener('readable', handleNewData);
  };

  return ext;
};

module.exports = supervisor;
