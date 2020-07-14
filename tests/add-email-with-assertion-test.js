#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

require('./lib/test_env.js');

const assert = require('assert'),
  vows = require('vows'),
  start_stop = require('./lib/start-stop.js'),
  wsapi = require('./lib/wsapi.js'),
  db = require('../lib/db.js'),
  config = require('../lib/configuration.js'),
  jwcrypto = require('browserid-crypto'),
  http = require('http'),
  querystring = require('querystring'),
  path = require('path'),
  secondary = require('./lib/secondary');

var suite = vows.describe('auth-with-assertion');

// algs
require('browserid-crypto/lib/algs/ds');
require('browserid-crypto/lib/algs/rs');

// disable vows (often flakey?) async error behavior
suite.options.error = false;

start_stop.addStartupBatches(suite);

const TEST_DOMAIN = 'example.domain',
  TEST_EMAIL = 'testuser@' + TEST_DOMAIN,
  TEST_ORIGIN = 'http://127.0.0.1:10002',
  TEST_FIRST_ACCT = 'test.user+folder@fake.domain';

// This test will excercise the ability to add an email to an
// account using an assertion from a primary

// now we need to generate a keypair and a certificate
// signed by our in tree authority
var g_keypair, g_cert;

suite.addBatch({
  'generating a keypair': {
    topic: function () {
      jwcrypto.generateKeypair(
        { algorithm: 'DS', keysize: 256 },
        this.callback
      );
    },
    succeeds: function (err, r) {
      assert.isObject(r);
      assert.isObject(r.publicKey);
      assert.isObject(r.secretKey);
      g_keypair = r;
    },
  },
});

// for this trick we'll need the "secret" key of our built in
// primary
var g_privKey = jwcrypto.loadSecretKey(
  require('fs').readFileSync(
    path.join(__dirname, '..', 'example', 'primary', 'sample.privatekey')
  )
);

suite.addBatch({
  'generting a certificate': {
    topic: function () {
      var domain = process.env['SHIMMED_DOMAIN'];

      var expiration = new Date();
      expiration.setTime(new Date().valueOf() + 60 * 60 * 1000);
      jwcrypto.cert.sign(
        { publicKey: g_keypair.publicKey, principal: { email: TEST_EMAIL } },
        { issuer: TEST_DOMAIN, expiresAt: expiration, issuedAt: new Date() },
        null,
        g_privKey,
        this.callback
      );
    },
    'works swimmingly': function (err, cert) {
      assert.isString(cert);
      assert.lengthOf(cert.split('.'), 3);
      g_cert = cert;
    },
  },
});

// now let's generate an assertion using the cert
suite.addBatch({
  'generating an assertion': {
    topic: function () {
      var self = this;
      var expirationDate = new Date(new Date().getTime() + 2 * 60 * 1000);
      jwcrypto.assertion.sign(
        {},
        {
          audience: TEST_ORIGIN,
          issuer: TEST_DOMAIN,
          expiresAt: expirationDate,
        },
        g_keypair.secretKey,
        function (err, signedAssertion) {
          self.callback(err, jwcrypto.cert.bundle([g_cert], signedAssertion));
        }
      );
      // var tok = new jwt.JWT(null, expirationDate, TEST_ORIGIN);
      //return vep.bundleCertsAndAssertion([g_cert], tok.sign(g_keypair.secretKey));
    },
    succeeds: function (err, r) {
      assert.isString(r);
      g_assertion = r;
    },
  },
});

suite.addBatch({
  'adding this email via assertion': {
    topic: function (assertion) {
      wsapi
        .post('/wsapi/add_email_with_assertion', {
          assertion: g_assertion,
        })
        .call(this);
    },
    'fails if not authenticated': function (err, r) {
      assert.strictEqual(r.code, 400);
    },
  },
});

// create a new account via the api with
suite.addBatch({
  'creating a new secondary account': {
    topic: function () {
      secondary.create(
        {
          email: TEST_FIRST_ACCT,
          pass: 'fakepass',
          site: 'http://fakesite.com:652',
        },
        this.callback
      );
    },
    succeeds: function (err) {
      assert.isNull(err);
    },
  },
});

suite.addBatch({
  'adding this email via assertion': {
    topic: function (assertion) {
      wsapi
        .post('/wsapi/add_email_with_assertion', {
          assertion: g_assertion,
        })
        .call(this);
    },
    'works once we are authenticated': function (err, r) {
      var resp = JSON.parse(r.body);
      assert.isObject(resp);
      assert.isTrue(resp.success);
    },
  },
});

// now create a lame cert: valid signature by the wrong party
const OTHER_EMAIL = 'otheruser@other.domain'; // *not* TEST_DOMAIN
var bad_cert, bad_assertion;

suite.addBatch({
  'generating a lame certificate': {
    topic: function () {
      var expiration = new Date();
      expiration.setTime(new Date().valueOf() + 60 * 60 * 1000);
      jwcrypto.cert.sign(
        { publicKey: g_keypair.publicKey, principal: { email: OTHER_EMAIL } },
        { issuer: TEST_DOMAIN, expiresAt: expiration, issuedAt: new Date() },
        null,
        g_privKey,
        this.callback
      );
    },
    'bad cert created': function (err, cert) {
      assert.isString(cert);
      assert.lengthOf(cert.split('.'), 3);
      bad_cert = cert;
    },
  },
});

// generate an assertion using the lame cert
suite.addBatch({
  'generating an assertion': {
    topic: function () {
      var self = this;
      var expirationDate = new Date(new Date().getTime() + 2 * 60 * 1000);
      jwcrypto.assertion.sign(
        {},
        {
          audience: TEST_ORIGIN,
          issuer: TEST_DOMAIN, // huh, assertions don't have .iss, right?
          expiresAt: expirationDate,
        },
        g_keypair.secretKey,
        function (err, signedAssertion) {
          self.callback(err, jwcrypto.cert.bundle([bad_cert], signedAssertion));
        }
      );
    },
    succeeds: function (err, r) {
      assert.isString(r);
      bad_assertion = r;
    },
  },
});

suite.addBatch({
  'adding this email via bad assertion': {
    topic: function () {
      wsapi
        .post('/wsapi/add_email_with_assertion', {
          assertion: bad_assertion,
        })
        .call(this);
    },
    'fails due to bad issuer': function (err, r) {
      assert.strictEqual(r.code, 200);
      var respObj = JSON.parse(r.body);
      assert.strictEqual(respObj.success, false);
      assert.strictEqual(
        respObj.reason,
        "issuer 'example.domain' may not speak for emails from 'other.domain'"
      );
    },
  },
});

// since the lame cert was rejected, we should only have the two original
// addresses

suite.addBatch({
  'list emails': {
    topic: wsapi.get('/wsapi/list_emails', {}),
    'succeeds with HTTP 200': function (err, r) {
      assert.strictEqual(r.code, 200);
    },
    "returns an object with what we'd expect": function (err, r) {
      var emails = JSON.parse(r.body).emails;
      assert.strictEqual(emails.length, 2);
      assert.ok(emails.indexOf(TEST_EMAIL) != -1);
      assert.ok(emails.indexOf(TEST_FIRST_ACCT) != -1);
    },
  },
  'address info for TEST_EMAIL': {
    topic: wsapi.get('/wsapi/address_info', {
      email: TEST_EMAIL,
    }),
    'returns type of primary': function (e, r) {
      assert.isNull(e);
      var r = JSON.parse(r.body);
      assert.equal(r.type, 'primary');
      assert.equal(r.issuer, TEST_DOMAIN);
      assert.equal(r.state, 'known');
      assert.isString(r.auth);
      assert.isString(r.prov);
    },
  },
  'address info for TEST_FIRST_ACCT': {
    topic: wsapi.get('/wsapi/address_info', {
      email: TEST_FIRST_ACCT,
    }),
    'returns type of primary': function (e, r) {
      assert.isNull(e);
      var r = JSON.parse(r.body);
      assert.equal(r.type, 'secondary');
      assert.equal(r.state, 'known');
    },
  },
});

start_stop.addShutdownBatches(suite);

// run or export the suite.
if (process.argv[1] === __filename) suite.run();
else suite.export(module);
