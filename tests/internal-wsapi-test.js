#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

require('./lib/test_env.js');

const assert = require('assert');
const vows = require('vows');
const start_stop = require('./lib/start-stop.js');
const wsapi = require('./lib/wsapi.js');

var suite = vows.describe('internal-wsapi');

// disable vows (often flakey?) async error behavior
suite.options.error = false;

start_stop.addStartupBatches(suite);

suite.addBatch({
  'requesting to create an account with an assertion': {
    topic: wsapi.post('/wsapi/create_account_with_assertion', {}),
    'returns a 404': function (err, r) {
      assert.strictEqual(r.code, 404);
    },
  },
  'requesting to forget an idp': {
    topic: wsapi.get('/wsapi/forget_idp', {}),
    'returns a 404': function (err, r) {
      assert.strictEqual(r.code, 404);
    },
  },
  'requesting to increment failed authentication attempts': {
    topic: wsapi.get('/wsapi/increment_failed_auth_tries', {}),
    'returns a 404': function (err, r) {
      assert.strictEqual(r.code, 404);
    },
  },
  'requesting to reset failed authentication attempts': {
    topic: wsapi.get('/wsapi/reset_failed_auth_tries', {}),
    'returns a 404': function (err, r) {
      assert.strictEqual(r.code, 404);
    },
  },
  "indicating that we've seen an IdP": {
    topic: wsapi.get('/wsapi/saw_idp', {}),
    'returns a 404': function (err, r) {
      assert.strictEqual(r.code, 404);
    },
  },
  'indicating that a user has used an email as (primary|secondary)': {
    topic: wsapi.post('/wsapi/user_used_email_as', {}),
    'returns a 404': function (err, r) {
      assert.strictEqual(r.code, 404);
    },
  },
});

start_stop.addShutdownBatches(suite);

// run or export the suite.
if (process.argv[1] === __filename) suite.run();
else suite.export(module);
