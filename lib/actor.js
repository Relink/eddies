// node.js
var request = require('request-promise');
var errors = require('request-promise/errors');
var Stream = require('stream');
var EventEmitter = require('events').EventEmitter;
var through2 = require('through2');
var _ = require('lodash');
var Promise = require('bluebird');

var actor = {};
// get HTML as string.
request.defaults = { encoding: 'utf8' };

/*
 * Helper function used to listen to backpressure.
 */
actor._write = function _write (stream, data) {
  return new Promise((resolve, reject) => {
    if (!stream.write(data)){
      return stream.once('drain', () => {
        stream.write(data);
        resolve();
      });
    };
    resolve();
  });
};

actor._consume = function _consume (src, dest, createOptions, newProxy, proxy) {
  var input, options;

  input = src.read();
  if (!input) {
    return Promise.resolve('end');
  }

  return Promise
    .try(function callCreateOptions () {
      options = createOptions(input);
      options.proxy = proxy || newProxy(input);
      return request(options);
    })
    .then(body => {
      var output = { input: input, res: body };
      return actor._write(dest, output)
    })
    .then(() => actor._consume(src, dest, createOptions, newProxy, options.proxy))
    .catch(errors.StatusCodeError, err => {

      // If we recieve a 404, we throw away the link and continue to crawl
      if (err.statusCode == 404) {
        return actor._consume(src, dest, createOptions, newProxy, options.proxy);
      }
      err.originalInput = input;
      throw (err);
    });
};

actor.start = function startActor (src, dest, createOptions, newProxy) {
  // Make sure we can read from our source
  if (!src instanceof Stream.Readable) {
    throw new TypeError('src needs to be a Readable stream with a read function')
  };

  var ee = new EventEmitter;

  try {
    actor
      ._consume(src, dest, createOptions, newProxy)
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
