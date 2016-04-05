var chai = require('chai');
chai.use(require('sinon-chai'));
var Promise = require('bluebird');
var expect = chai.expect;
var sinon = require('sinon');
var _ = require('lodash');
var stream = require('stream');
var EventEmitter = require('events').EventEmitter;
var proxyquire = require('proxyquire');

var supervisor = require('./src/supervisor');

// clean this up!
describe('eddies', () => {
  it.only('does things', done => {
    var count = 0;
    var stream = supervisor.start({number: 5}, msg => {

      return new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve({message: msg + (++count)})
        }, 5)
      })
    });
    var i = 3;
    while (--i >= 0) stream.write('foo')

    setTimeout(() => {
      var i = 0;
      while (++i < 4) expect(stream.read()).to.equal('foo' + i)
      setTimeout(() => {
        var i = 10;
        while (--i >= 0) stream.write('foo')
        done();
      }, 20)
    }, 20)
  });
});
