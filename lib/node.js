// node.js
var request = require('request-promise');
var errors = require('request-promise/errors');
var Stream = require('stream');
var through2 = require('through2');
var _ = require('lodash');
var Promise = require('bluebird');

var actor = {};
// get HTML as string.
request.defaults = { encoding: 'utf8' };

/*
 * Helper function used to listen to backpressure.
 */
actor._write = function _write (stream, data, cb) {
  if (!stream.write(data)){
    return stream.once('drain', () => {
      stream.write(data); // maybe just put back on kafka queue???
      cb();
    })
  };
  cb();
};

actor.run = function runNode (src, dest, rc, onError, createOptions, _proxy) {
  var input, options;

  // Make sure we can read from our source
  if (!src instanceof Stream.Readable) {
    throw new TypeError('src needs to be a Readable stream with a read function')
  };

  // Any errors or nulls on src.read(), and we simply exit the process
  try {
    input = src.read();
    if (!input) {
      return Promise.resolve('end');
    }
  }
  catch(e) {
    return Promise.resolve('read error');
  }

  return Promise
    .try(function callCreateOptions () {
      options = createOptions(input, _proxy);
      return request(options);
    })
    .then(body => {
      var output = { input: input, res: body };
      return actor._write(dest,
            output,
            actor.run.bind(null, src, dest, rc, onError, createOptions, options.proxy));
    })
    .catch(errors.StatusCodeError, err => {
      if (err.statusCode == 404) {

        // If we recieve a 404, we throw away the link and continue to crawl
        onError(err);
        return actor.run(src, dest, rc, onError, createOptions, options.proxy);
      }
      else if (_.some([403, 429, 502, 503,], code => code == err.statusCode)) {

        // If a status code might be a proxy problem, we put it back on the original
        // Kafka queue and create a new proxy;
        rc && rc.write(input) || rc.once('drain', () => rc.write(input));
        onError(err);
        return actor.run(src, dest, rc, onError, createOptions, null);
      }
      throw (err);
    })
    .catch(err => {

      // If we recieve an unknown error, we throw the link away and restart.
      onError(err);
      return actor.run(src, dest, rc, onError, createOptions);
    });
};

module.exports = actor;
