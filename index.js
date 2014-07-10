/*!
 * mini-logger - index.js
 * Copyright(c) 2014 dead_horse <dead_horse@qq.com>
 * MIT Licensed
 */

'use strict';

/**
 * Module dependencies.
 */

var EventEmitter = require('events').EventEmitter;
var logfilestream = require('logfilestream');
var formater = require('error-formater');
var copy = require('copy-to');
var util = require('util');
var ms = require('ms');

var defer = typeof setImediate === 'function'
  ? setImediate
  : process.nextTick;

/**
 * Expose `Logger`
 */

module.exports = Logger;

var defaultOptions = {
  categories: [],
  format: '[{category}.]YYYY-MM-DD[.log]',
  stdout: false,
  file: true,
  errorFormater: formater
}

function Logger(options) {
  if (!(this instanceof Logger)) return new Logger(options);

  if (!options || !options.dir) throw new Error('options.dir required');

  this._options = {};
  copy(options).and(defaultOptions).to(this._options);
  options = this._options;

  if (!Array.isArray(options.categories)) options.categories = [ options.categories ];
  options.categories.push('error');
  options.categories = uniq(options.categories);

  options.duration = typeof options.duration === 'string'
    ? ms(options.duration)
    : options.duration;

  options.flushInterval = typeof options.flushInterval === 'string'
    ? ms(options.flushInterval)
    : options.flushInterval;

  options.encoding = (options.encoding || 'utf-8').toLowerCase();
  if (options.encoding === 'utf8') options.encoding = 'utf-8';

  this._init();
}

util.inherits(Logger, EventEmitter);

Logger.prototype._init = function() {
  var ctx = this;

  // create log functions
  this._options.categories.forEach(function (category) {
    ctx[category] = function (msg) {
      msg = (msg instanceof Error)
        ? msg = ctx._options.errorFormater(msg)
        : typeof msg === 'object'
        ? JSON.stringify(msg)
        : util.format.apply(util, arguments);

      ctx._write(category, msg);
    };
  });
  this._streams = {};

  if (!this._options.file) return;
  // create log file streams
  this._options.categories.forEach(function (category) {
    var format = ctx._options.format.replace(/\{category\}/g, category);
    var stream = logfilestream({
      logdir: ctx._options.dir,
      duration: ctx._options.duration,
      nameformat: format,
      mkdir: ctx._options.mkdir,
      buffer: ctx._options.flushInterval,
      mode: ctx._options.mode,
      encoding: ctx._options.encoding
    });

    stream.on('error', ctx.emit.bind(ctx, 'error'));
    ctx._streams[category] = stream;
  });

  defer(function () {
    if (!ctx.listeners('error').length) ctx.on('error', onerror);
  });
};

Logger.prototype._write = function (category, msg) {
  // write to file
  if (this._options.file && this._streams[category]) this._streams[category].write(msg);

  // write to stdout
  if (this._options.stdout) {
    msg = '[' + category + '] ' + msg;
    if (this._options.encoding !== 'utf-8') {
      msg = require('iconv-lite').encode(msg, this._options.encoding);
    }

    category === 'error'
      ? process.stderr.write(msg)
      : process.stdout.write(msg);
  }
};

/**
 * flush logs into file immediate
 */

Logger.prototype.flush = function(category) {
  if (category) return this._streams[category].flush();
  for (var category in this._streams) {
    this._streams[category].flush();
  }
};

Logger.prototype.getPath = function(category) {
  if (!category) return;
  if (!this._streams[category]) return;
  if (!this._streams[category].stream) return;
  return this._streams[category].stream.path;
};

Logger.prototype.destroy = function (category) {
  if (category) return this._destory(category);
  this._options.categories.forEach(this._destory.bind(this));
};

Logger.prototype._destory = function (category) {
  delete this[category];

  if (!this._streams[category]) return;
  this._streams[category].end();
  this._streams[category].removeAllListeners();
  this._streams[category] = null;
};

function onerror(err) {
  console.error(err.stack);
}

function uniq(categories) {
  var res = {};
  categories.forEach(function (c) {
    res[c] = 1;
  });
  return Object.keys(res);
}
