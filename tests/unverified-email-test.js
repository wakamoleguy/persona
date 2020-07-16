#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

require('./lib/test_env.js');

// disable email throttling so we can stage the same email twice without delay
process.env.MIN_TIME_BETWEEN_EMAILS_MS = 0;

const assert = require('assert');
const vows = require('vows');
const start_stop = require('./lib/start-stop.js');
const wsapi = require('./lib/wsapi.js');
const jwcrypto = require('browserid-crypto');

var suite = vows.describe('unverified-email-test');

require('browserid-crypto/lib/algs/rs');
require('browserid-crypto/lib/algs/ds');

// disable vows (often flakey?) async error behavior
suite.options.error = false;

start_stop.addStartupBatches(suite);

// allowUnverified emails
// this requires a whole other test user, since the account has not have
// had its registration "completed"
const UNVERIFIED_EMAIL = 'unverified@testuser.com';
const UNVERIFIED_ORIGIN = 'http://testdomain.com:8080';
const UNVERIFIED_PASSWORD = 'unverifiedpassword';

// testing FirefoxOS session durations.
const TEN_YEARS_MS = 315360000000;

function getSessionDuration(context) {
  // if context is undefined, cookies will be fetched from wsapi.js's internal
  // context state.
  var cookie = wsapi.getCookie(/^browserid_state/, context);
  if (!cookie) throw new Error('Could not get browserid_state cookie');

  var durationStr = cookie.split('.')[3];
  if (!durationStr)
    throw new Error(
      'Malformed browserid_state cookie - does not contain duration'
    );

  return parseInt(durationStr, 10);
}

var token;

suite.addBatch({
  'account staging of unverified user': {
    topic: function () {
      wsapi.setContext({
        headers: {
          'user-agent': 'Mozilla/5.0 (Mobile; rv:18.0) Gecko/18.0 Firefox/18.0',
        },
      });
      wsapi
        .post('/wsapi/stage_user', {
          email: UNVERIFIED_EMAIL,
          pass: UNVERIFIED_PASSWORD,
          site: UNVERIFIED_ORIGIN,
          allowUnverified: true,
        })
        .call(this);
    },
    'is 200 OK': function (err, r) {
      assert.isNull(err);
      assert.equal(r.code, 200);
      var json = JSON.parse(r.body);
      assert.isTrue(json.success);
      assert.isTrue(json.unverified);
    },

    'can then be authenticated': {
      topic: wsapi.post('/wsapi/authenticate_user', {
        email: UNVERIFIED_EMAIL,
        pass: UNVERIFIED_PASSWORD,
        ephemeral: false,
        allowUnverified: true,
      }),
      successfully: function (err, r) {
        assert.equal(r.code, 200);
        var json = JSON.parse(r.body);
        assert.isTrue(json.success);
        assert.isTrue(json.suppress_ask_if_users_computer);
      },
      //eslint-disable-next-line
      'yields a session of expected length': function (err, r) {
        assert.strictEqual(getSessionDuration(), TEN_YEARS_MS);
      },
      'and completes user completion': {
        topic: wsapi.get('/wsapi/session_context'),
        successfully: function (err, r) {
          assert.isNull(err);
          assert.strictEqual(r.code, 200);
          var resp = JSON.parse(r.body);
          assert.strictEqual(typeof resp.csrf_token, 'string');
          assert.strictEqual(resp.authenticated, true);
          assert.strictEqual(resp.auth_level, 'password');
        },
      },
    },
  },
});

suite.addBatch({
  'get the stage_user token': {
    topic: function () {
      start_stop.waitForToken(this.callback);
    },
    correctly: function (err, t) {
      assert.strictEqual(typeof t, 'string');
      token = t;
    },
  },
});

// now we need to generate a keypair
var unverified_keypair;
var unverified_cert;

suite.addBatch({
  'generating an unverified keypair': {
    topic: function () {
      jwcrypto.generateKeypair(
        { algorithm: 'DS', keysize: 256 },
        this.callback
      );
    },
    succeeds: function (err, r) {
      assert.isNull(err);
      assert.isObject(r);
      assert.isObject(r.publicKey);
      assert.isObject(r.secretKey);
      unverified_keypair = r;
    },
  },
});

suite.addBatch({
  'certifying the public key': {
    topic: function () {
      wsapi
        .post('/wsapi/cert_key', {
          email: UNVERIFIED_EMAIL,
          pubkey: unverified_keypair.publicKey.serialize(),
          allowUnverified: true,
          ephemeral: false,
        })
        .call(this);
    },
    'works swimmingly': function (err, r) {
      assert.strictEqual(r.code, 200);
      assert.isString(r.body);
    },
    'provides the unverified cert': function (err, r) {
      unverified_cert = r.body;
      assert.lengthOf(unverified_cert.split('.'), 3);
      var principal = JSON.parse(
        Buffer.from(unverified_cert.split('.')[1], 'base64').toString()
      ).principal;
      // should not be an email property, only unverified-email
      assert.strictEqual(principal['unverified-email'], UNVERIFIED_EMAIL);
      assert.isUndefined(principal.email);
    },
  },
});

suite.addBatch({
  'generating an assertion with allowsUnverified email': {
    topic: function () {
      var expirationDate = new Date(new Date().getTime() + 2 * 60 * 1000);
      var self = this;
      var opts = {
        audience: UNVERIFIED_ORIGIN,
        expiresAt: expirationDate,
      };
      jwcrypto.assertion.sign({}, opts, unverified_keypair.secretKey, function (
        err,
        assertion
      ) {
        if (err) return self.callback(err);
        var b = jwcrypto.cert.bundle([unverified_cert], assertion);
        self.callback(null, b);
      });
    },
    'yields a good looking assertion': function (err, r) {
      assert.isString(r);
      assert.equal(r.length > 0, true);
    },
    'will cause the verifier': {
      topic: function (err, assertion) {
        wsapi
          .post('/verify', {
            audience: UNVERIFIED_ORIGIN,
            assertion: assertion,
            experimental_allowUnverified: true,
          })
          .call(this);
      },
      'to succeed': function (err, r) {
        var resp = JSON.parse(r.body);
        assert.strictEqual(resp.status, 'okay');
        //assert.strictEqual(resp.issuer, "example.domain");
        assert.strictEqual(resp.audience, UNVERIFIED_ORIGIN);
        assert.strictEqual(resp['unverified-email'], UNVERIFIED_EMAIL);
      },
    },
    'without sending allowUnverified to verifier': {
      topic: function (err, assertion) {
        wsapi
          .post('/verify', {
            audience: UNVERIFIED_ORIGIN,
            assertion: assertion,
          })
          .call(this);
      },
      'to fail': function (err, r) {
        var resp = JSON.parse(r.body);
        assert.strictEqual(resp.status, 'failure');
        assert.strictEqual(resp.reason, 'unverified email');
      },
    },
  },
});

suite.addBatch({
  'resetting password': {
    topic: wsapi.post('/wsapi/stage_reset', {
      email: UNVERIFIED_EMAIL,
      site: UNVERIFIED_ORIGIN,
    }),
    works: function (err, r) {
      assert.strictEqual(r.code, 200);
    },
    'gives a token': {
      topic: function () {
        start_stop.waitForToken(this.callback);
      },
      correctly: function (err, t) {
        assert.strictEqual(typeof t, 'string');
        token = t;
      },
    },
  },
});

suite.addBatch({
  'complete password reset': {
    topic: function () {
      wsapi
        .post('/wsapi/complete_reset', {
          token: token,
          pass: 'attack at dawn!!!',
        })
        .call(this);
    },
    'account created and session duration is not reset': function (err, r) {
      assert.equal(r.code, 200);
      assert.strictEqual(getSessionDuration(), TEN_YEARS_MS);
    },
  },
});

suite.addBatch({
  'account is now verified': {
    topic: wsapi.get('/wsapi/address_info', {
      email: UNVERIFIED_EMAIL,
    }),
    yes: function (err, r) {
      assert.equal(r.code, 200);
      var json = JSON.parse(r.body);
      assert.equal(json.state, 'known');
    },
  },
});

start_stop.addShutdownBatches(suite);

// run or export the suite.
if (process.argv[1] === __filename) suite.run();
else suite.export(module);
