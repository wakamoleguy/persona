#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

require('./lib/test_env.js');

const assert = require('assert');
const vows = require('vows');
const start_stop = require('./lib/start-stop.js');
const wsapi = require('./lib/wsapi.js');
const primary = require('./lib/primary.js');

var suite = vows.describe('primary-then-secondary');

// start up a pristine server
start_stop.addStartupBatches(suite);

// this test excercises the codepath whereby a user adds
// a primary email address, then a secondary, then another
// secondary.  It checks that the critical wsapi calls
// along the way perform as expected

// first we'll need to authenticate a user with an assertion from a
// primary IdP

const TEST_DOMAIN = 'example.domain';
const TEST_EMAIL = 'testuser@' + TEST_DOMAIN;
const TEST_ORIGIN = 'http://127.0.0.1:10002';
const TEST_PASS = 'fakepass';
const SECONDARY_EMAIL = 'secondary@notexample.domain';
const SECOND_SECONDARY_EMAIL = 'secondsecondary@notexample.domain';

var primaryUser = new primary({
  email: TEST_EMAIL,
  domain: TEST_DOMAIN,
});

suite.addBatch({
  'set things up': {
    topic: function () {
      primaryUser.setup(this.callback);
    },
    works: function () {
      // nothing to do here
    },
  },
});

var the_assertion;
// now let's generate an assertion using this user
suite.addBatch({
  'generating an assertion': {
    topic: function () {
      primaryUser.getAssertion(TEST_ORIGIN, this.callback);
    },
    succeeds: function (err, r) {
      assert.isString(r);
    },
    'and logging in with the assertion succeeds': {
      topic: function (err, assertion) {
        the_assertion = assertion;
        wsapi
          .post('/wsapi/auth_with_assertion', {
            assertion: assertion,
            ephemeral: true,
          })
          .call(this);
      },
      works: function (err, r) {
        var resp = JSON.parse(r.body);
        assert.isObject(resp);
        assert.isTrue(resp.success);
      },
    },
  },
});

// now we have an account, and we're authenticated with an assertion.
// check auth_level with session_context
suite.addBatch({
  auth_level: {
    topic: wsapi.get('/wsapi/session_context'),
    "is 'assertion' after authenticating with assertion": function (err, r) {
      assert.strictEqual(JSON.parse(r.body).auth_level, 'assertion');
    },
  },
});

// this second session, logged in with just the primary, should *not* be
// invalidated by the addition of a secondary address (and consequent
// establishment of a password)
var context2 = {};
suite.addBatch({
  'establishing a second session': {
    topic: function () {
      wsapi
        .post(
          '/wsapi/auth_with_assertion',
          {
            assertion: the_assertion,
            ephemeral: true,
          },
          context2
        )
        .call(this);
    },
    'works as expected': function (err, r) {
      assert.strictEqual(JSON.parse(r.body).success, true);
    },
    "after waiting for  lastPasswordReset's now() to increment": {
      topic: function () {
        // see password-update-test.js for an explanation of this delay
        setTimeout(this.callback, 2000);
      },
      "we've waited long enough": function () {},
    },
  },
});

var token;
// now we have a new account.  let's add a secondary to it
suite.addBatch({
  'add a new email address to our account': {
    topic: wsapi.post('/wsapi/stage_email', {
      email: SECONDARY_EMAIL,
      site: 'https://fakesite.com',
    }),
    'fails without a password': function (err, r) {
      assert.strictEqual(r.code, 200);
      assert.strictEqual(JSON.parse(r.body).success, false);
    },
    'with a password': {
      topic: wsapi.post('/wsapi/stage_email', {
        email: SECONDARY_EMAIL,
        pass: TEST_PASS,
        site: 'https://fakesite.com',
      }),
      succeeds: function (err, r) {
        assert.strictEqual(r.code, 200);
      },
      'and get a token': {
        topic: function () {
          start_stop.waitForToken(this.callback);
        },
        successfully: function (err, t) {
          assert.isNull(err);
          this._token = t;
          assert.strictEqual(typeof t, 'string');
        },
        'and complete': {
          topic: function (err, t) {
            wsapi
              .get('/wsapi/email_for_token', {
                token: t,
              })
              .call(this);
          },
          'which then': {
            topic: function () {
              wsapi
                .post('/wsapi/complete_email_confirmation', {
                  pass: TEST_PASS,
                  token: this._token,
                })
                .call(this);
            },
            succeeds: function (err, r) {
              assert.equal(r.code, 200);
              assert.strictEqual(JSON.parse(r.body).success, true);
            },
          },
        },
      },
    },
  },
});

// after adding a secondary and setting password, we're password auth'd
suite.addBatch({
  auth_level: {
    topic: wsapi.get('/wsapi/session_context'),
    "is 'password' after authenticating with password": function (err, r) {
      assert.strictEqual(JSON.parse(r.body).auth_level, 'password');
    },
  },
});

// now we can authenticate with our password
suite.addBatch({
  'authenticating with our newly set password': {
    topic: wsapi.post('/wsapi/authenticate_user', {
      email: TEST_EMAIL,
      pass: TEST_PASS,
      ephemeral: false,
    }),
    works: function (err, r) {
      assert.strictEqual(r.code, 200);
    },
  },
});

// adding a second secondary will not let us set the password
suite.addBatch({
  'add a second secondary to account with': {
    topic: wsapi.post('/wsapi/stage_email', {
      email: SECOND_SECONDARY_EMAIL,
      pass: TEST_PASS,
      site: 'http://fakesite.com:123',
    }),
    'a password fails': function (err, r) {
      assert.strictEqual(r.code, 200);
      var body = JSON.parse(r.body);
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.reason, 'a password may not be set at this time');
    },
    'but with no password specified': {
      topic: wsapi.post('/wsapi/stage_email', {
        email: SECOND_SECONDARY_EMAIL,
        site: 'http://fakesite.com:123',
      }),
      succeeds: function (err, r) {
        assert.strictEqual(r.code, 200);
        assert.strictEqual(JSON.parse(r.body).success, true);
      },
      'and get a token': {
        topic: function () {
          start_stop.waitForToken(this.callback);
        },
        successfully: function (err, t) {
          assert.isNull(err);
          this._token = t;
          assert.strictEqual(typeof t, 'string');
        },
        'and to complete': {
          topic: function (err, t) {
            wsapi
              .get('/wsapi/email_for_token', {
                token: t,
              })
              .call(this);
          },
          'with a token': {
            topic: function () {
              wsapi
                .post('/wsapi/complete_email_confirmation', {
                  token: this._token,
                })
                .call(this);
            },
            succeeds: function (err, r) {
              assert.equal(r.code, 200);
              assert.strictEqual(JSON.parse(r.body).success, true);
            },
          },
        },
      },
    },
  },
});

suite.addBatch({
  'authentication with first email': {
    topic: wsapi.post('/wsapi/authenticate_user', {
      email: TEST_EMAIL,
      pass: TEST_PASS,
      ephemeral: false,
    }),
    works: function (err, r) {
      assert.strictEqual(r.code, 200);
    },
  },
  'authentication with second email': {
    topic: wsapi.post('/wsapi/authenticate_user', {
      email: SECONDARY_EMAIL,
      pass: TEST_PASS,
      ephemeral: false,
    }),
    works: function (err, r) {
      assert.strictEqual(r.code, 200);
    },
  },
});

// and the second session should still be valid
suite.addBatch({
  'second session is still valid': {
    topic: wsapi.post('/wsapi/prolong_session', {}, context2),
    'works as expected': function (err, r) {
      assert.strictEqual(r.code, 200);
      assert.strictEqual(r.body, 'OK');
    },
  },
});

// shut the server down and cleanup
start_stop.addShutdownBatches(suite);

// run or export the suite.
if (process.argv[1] === __filename) suite.run();
else suite.export(module);
