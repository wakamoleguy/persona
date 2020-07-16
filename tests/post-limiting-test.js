#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

require('./lib/test_env.js');

const assert = require('assert');
const vows = require('vows');
const start_stop = require('./lib/start-stop.js');
const wsapi = require('./lib/wsapi.js');
const config = require('../lib/configuration.js');
const http = require('http');
const secrets = require('../lib/secrets.js');
const version = require('../lib/version.js');

var suite = vows.describe('post-limiting');

// disable vows (often flakey?) async error behavior
suite.options.error = false;

const MAX_POST_SIZE = 1024 * 10;

start_stop.addStartupBatches(suite);

var code_version;

function getVersion(done) {
  version(function (commit) {
    code_version = commit;
    done();
  });
}

function request(opts, done) {
  var headers = (opts.headers = opts.headers || {});
  if (opts.path.indexOf('/wsapi') > -1) {
    headers['BrowserID-git-sha'] = code_version;
  }
  return http.request(opts, done);
}

function addTests(port, path) {
  // test posting more than allowed
  suite.addBatch({
    'posting more than allowed': {
      topic: function () {
        var cb = this.callback;
        getVersion(function () {
          var req = request(
            {
              host: '127.0.0.1',
              port: port,
              path: path,
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              method: 'POST',
            },
            function (res) {
              cb(null, res);
            }
          ).on('error', function (e) {
            cb(e);
          });
          req.write(secrets.weakGenerate(MAX_POST_SIZE + 1));
          req.end();
        });
      },
      fails: function (err, r) {
        assert.strictEqual(r.statusCode, 413);
      },
    },
  });

  // test posting more than allowed with content-length header
  suite.addBatch({
    'posting more than allowed with content-length': {
      topic: function () {
        var cb = this.callback;
        getVersion(function () {
          var req = request(
            {
              host: '127.0.0.1',
              port: port,
              path: path,
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': MAX_POST_SIZE + 1,
              },
              method: 'POST',
            },
            function (res) {
              cb(null, res);
            }
          ).on('error', function (e) {
            cb(e);
          });
          req.write(secrets.weakGenerate(MAX_POST_SIZE + 1));
          req.end();
        });
      },
      fails: function (err, r) {
        assert.strictEqual(r.statusCode, 413);
      },
    },
  });
}

// test the browserid process.
addTests(10002, '/wsapi/authenticate_user');
// test the verifier
addTests(10000, '/verify');

start_stop.addShutdownBatches(suite);

// run or export the suite.
if (process.argv[1] === __filename) suite.run();
else suite.export(module);
