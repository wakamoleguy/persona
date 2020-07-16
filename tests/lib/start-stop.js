/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const wsapi = require('./wsapi.js');
const spawn = require('child_process').spawn;
const events = require('events');
const config = require('../../lib/configuration.js');
const db = require('../../lib/db.js');

// at test completion, allow a moment for in-flight backend requests to finish
// before shutting down the backend daemons. GH-3465.
const DELAY_KILL_SIGINT_MS = 50;

process.on('exit', function () {
  if (proc) {
    proc.kill();
  }
});

var proc;
var nextTokenFunction;
var tokenStack = [];

exports.waitForToken = function (email, cb) {
  // allow first argument to be omitted
  if (typeof email === 'function') cb = email;

  if (tokenStack.length) {
    var t = tokenStack.shift();
    process.nextTick(function () {
      cb(null, t);
    });
  } else {
    if (nextTokenFunction)
      throw "can't wait for a verification token when someone else is!";
    nextTokenFunction = cb;
  }
};

exports.browserid = new events.EventEmitter();

function setupProc(proc) {
  var m;
  var sentReady = false;

  proc.stdout.on('data', function (buf) {
    buf
      .toString()
      .split('\n')
      .forEach(function (x) {
        if (process.env['LOG_TO_CONSOLE'] || /^.*error.*:/.test(x)) {
          var line = x.toString().trim();
          if (line.length) {
            console.log(line);
          }
        }
        var tokenRegex = new RegExp('token=([A-Za-z0-9]+)$', 'm');
        var pidRegex = new RegExp(
          '^spawned (\\w+) \\(.*\\) with pid ([0-9]+)$'
        );

        if (!sentReady && /"router running.*127\.0\.0\.1:10002"/.test(x)) {
          exports.browserid.emit('ready');
          sentReady = true;
        } else if (!sentReady && (m = pidRegex.exec(x))) {
          process.env[m[1].toUpperCase() + '_PID'] = m[2];
        } else if ((m = tokenRegex.exec(x))) {
          if (!/forwarding request:/.test(x)) {
            tokenStack.push(m[1]);
            if (nextTokenFunction) {
              nextTokenFunction(null, tokenStack.shift());
              nextTokenFunction = undefined;
            }
          }
        }
      });
  });
  proc.stderr.on('data', function (x) {
    if (process.env['LOG_TO_CONSOLE']) console.log(x.toString());
  });
}

exports.addStartupBatches = function (suite) {
  // disable vows (often flakey?) async error behavior
  suite.options.error = false;

  // propogate our ephemeral database parameters down to
  // child processes so that all process are communicating
  // with the same db
  suite.addBatch({
    'specifying an ephemeral database': {
      topic: function () {
        config.set('database.name', process.env['DATABASE_NAME']);
        return true;
      },
      'should work': function (x) {
        assert.equal(typeof config.get('database.name'), 'string');
        assert.equal(typeof process.env['DATABASE_NAME'], 'string');
        assert.equal(process.env['DATABASE_NAME'], config.get('database.name'));
      },
    },
  });

  suite.addBatch({
    'opening the database': {
      topic: function () {
        var cfg = config.get('database');
        db.open(cfg, this.callback);
      },
      'should work fine': function (r) {
        assert.isNull(r);
      },
    },
  });

  suite.addBatch({
    'run the server': {
      topic: function () {
        var pathToHarness = path.join(
          __dirname,
          '..',
          '..',
          'scripts',
          'run_locally.js'
        );
        proc = spawn('node', [pathToHarness]);
        setupProc(proc);
        exports.browserid.on('ready', this.callback);
      },
      'server should be running': {
        topic: wsapi.get('/__heartbeat__'),
        'server is running': function (err, r) {
          assert.equal(r.code, 200);
          assert.equal(r.body, 'ok');
        },
      },
    },
  });
};

exports.addRestartBatch = function (suite) {
  // stop the server
  suite.addBatch({
    'stop the server': {
      topic: function () {
        var cb = this.callback;
        setTimeout(function () {
          proc.kill('SIGINT');
          proc.on('exit', cb);
        }, DELAY_KILL_SIGINT_MS);
      },
      stopped: function (x) {
        assert.strictEqual(x, 0);
      },
    },
  });

  suite.addBatch({
    'run the server': {
      topic: function () {
        var pathToHarness = path.join(
          __dirname,
          '..',
          '..',
          'scripts',
          'run_locally.js'
        );
        proc = spawn('node', [pathToHarness]);
        setupProc(proc);
        exports.browserid.on('ready', this.callback);
      },
      'server should be running': {
        topic: wsapi.get('/__heartbeat__'),
        'server is running': function (err, r) {
          assert.equal(r.code, 200);
          assert.equal(r.body, 'ok');
        },
      },
    },
  });
};

exports.addShutdownBatches = function (suite) {
  // stop the server
  suite.addBatch({
    'stop the server': {
      topic: function () {
        var cb = this.callback;
        setTimeout(function () {
          proc.kill('SIGINT');
          proc.on('exit', cb);
        }, DELAY_KILL_SIGINT_MS);
      },
      stopped: function (x) {
        assert.strictEqual(x, 0);
      },
    },
  });

  // clean up
  suite.addBatch({
    'closing (and removing) the database': {
      topic: function () {
        db.closeAndRemove(this.callback);
      },
      'should work': function (err) {
        assert.isNull(err);
      },
    },
  });
};
