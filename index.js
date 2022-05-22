'use strict';

const Counter = require('passthrough-counter');
const humanize = require('humanize-number');
const bytes = require('bytes');
const chalk = require('chalk');
const util = require('util');

// color map.
const colorCodes = {
  7: 'magenta',
  5: 'red',
  4: 'yellow',
  3: 'cyan',
  2: 'green',
  1: 'green',
  0: 'yellow'
};

module.exports = function (options) {
  // print to console helper.
  const print = (function () {
    let transporter;
    if (typeof options === 'function') {
      transporter = options;
    } else if (options && options.transporter) {
      transporter = options.transporter;
    }

    // eslint-disable-next-line func-names
    return function printFunc(...args) {
      const string = util.format(...args);
      if (transporter) transporter(string, args);
      else console.log(...args);
    };
  })();

  // eslint-disable-next-line func-names
  return async function logger(ctx, next) {
    // request
    const start = ctx[Symbol.for('request-received.startTime')]
      ? ctx[Symbol.for('request-received.startTime')].getTime()
      : Date.now();
    print(
      '  ' +
        chalk.gray('<--') +
        ' ' +
        chalk.bold('%s') +
        ' ' +
        chalk.gray('%s'),
      ctx.method,
      ctx.originalUrl
    );

    // log when the response is finished or closed,
    // whichever happens first.
    const onResolve = (event) => () => {
      const length = counter ? counter.length : ctx.response.length;
      ctx.res.removeListener('finish', onFinish);
      ctx.res.removeListener('close', onClose);
      log(print, ctx, start, length, null, event);
    };

    const onFinish = onResolve('finish');
    const onClose = onResolve('close');

    ctx.res.once('finish', onFinish);
    ctx.res.once('close', onClose);

    try {
      await next();
    } catch (err) {
      ctx.res.removeListener('finish', onFinish);
      ctx.res.removeListener('close', onClose);
      // log uncaught downstream errors
      log(print, ctx, start, null, err);
      throw err;
    }

    // calculate the length of a streaming response
    // by intercepting the stream with a counter.
    // only necessary if a content-length header is currently not set.
    let counter;
    const bodyIsStream = Boolean(ctx.body && ctx.body.readable);
    if (ctx.response.length == null && bodyIsStream) {
      counter = ctx.body.pipe(new Counter()).on('error', ctx.onerror);
    }
  };
};

// Log helper.
function log(print, ctx, start, length, err, event) {
  // get the status code of the response
  const status = err
    ? err.isBoom
      ? err.output.statusCode
      : err.status || 500
    : ctx.status || 404;

  // set the color of the status code;
  const s = (status / 100) | 0;
  const color = colorCodes.hasOwnProperty(s) ? colorCodes[s] : colorCodes[0];

  // get the human readable response length
  const formattedLength = [204, 205, 304].includes(status)
    ? ''
    : length == null
    ? '-'
    : bytes(length).toLowerCase();

  const upstream = err
    ? chalk.red('xxx')
    : event === 'close'
    ? chalk.yellow('-x-')
    : chalk.gray('-->');

  print(
    '  ' +
      upstream +
      ' ' +
      chalk.bold('%s') +
      ' ' +
      chalk.gray('%s') +
      ' ' +
      chalk[color]('%s') +
      ' ' +
      chalk.gray('%s') +
      ' ' +
      chalk.gray('%s'),
    ctx.method,
    ctx.originalUrl,
    status,
    time(start),
    formattedLength
  );
}

/**
 * Show the response time in a human readable format.
 * In milliseconds if less than 10 seconds,
 * in seconds otherwise.
 */
function time(start) {
  const delta = Date.now() - start;
  return humanize(
    delta < 10000 ? delta + 'ms' : Math.round(delta / 1000) + 's'
  );
}
