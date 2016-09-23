var Stream = require('stream');
var EventEmitter = require('events').EventEmitter;
var _ = require('lodash');
var Promise = require('bluebird');
var copper = require('@relinklabs/copper');

var actor = {};

actor._consume = function _consume (src, dest, transform, ee, _params) {
  var input;

  input = src.read();
  if (!input) {
    return Promise.resolve();
  }

  return transform.apply(null, [input].concat(_params))
    .then(function writeToDestination ({message, params} = {}) {
      _params = params
      return copper.write(dest, message)
    })
    .then(ee.emit.bind(ee, 'success'))
    .then(() => actor._consume(src, dest, transform, ee, _params))
    .catch(err => ee.emit('error', err))
};

actor.start = function startActor (src, dest, transform) {

  // Make sure we can read from our source
  if (!src instanceof Stream.Readable) {
    throw new TypeError('src needs to be a Readable stream with a read function')
  };

  var ee = new EventEmitter;

  try {
    actor
      ._consume(src, dest, transform, ee)
      .then(success => ee.emit('end', success))
      .catch(err => _emitAndCleanup(ee, err))
      .finally(() => ee.removeAllListeners())
  }
  catch (e) {
    process.nextTick(() => _emitAndCleanup(ee, e));
  }

  return ee;
};

/*
 * Helper function just to emit errors and cleanup listeners.
 */
function _emitAndCleanup (ee, err) {
  ee.emit('error', err);
  ee.removeAllListeners();
}

module.exports = actor;
