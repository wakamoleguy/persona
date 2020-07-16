#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

require('./lib/test_env.js');

const assert = require('assert');
const vows = require('vows');
const start_stop = require('./lib/start-stop.js');
const wsapi = require('./lib/wsapi.js');
const ca = require('../lib/keysigner/ca.js');
const db = require('../lib/db.js');
const jwcrypto = require('browserid-crypto');
const secondary = require('./lib/secondary.js');
const primary = require('./lib/primary.js');

var suite = vows.describe('cert-emails');

// disable vows (often flakey?) async error behavior
suite.options.error = false;

start_stop.addStartupBatches(suite);

const PRIMARY_DOMAIN = 'example.domain';
const PRIMARY_EMAIL = 'testuser@' + PRIMARY_DOMAIN;
const PRIMARY_ORIGIN = 'http://127.0.0.1:10002';

// create a new secondary account
suite.addBatch({
  'creating a secondary account': {
    topic: function () {
      secondary.create(
        {
          email: 'syncer@somehost.com',
          pass: 'fakepass',
          site: 'http://fakesite.com',
        },
        this.callback
      );
    },
    succeeds: function (err, r) {
      assert.isNull(err);
    },
  },
});

// upon creation, the secondary account will have a "lastUsedAs"
// field of 'secondary'.  Because we are testing cert_key API and
// an important side-effect of cert_key is to set lastUsedAs to
// 'secondary', we set lastUsedAs to 'primary' now so we can later
// verify it is properly updated.
suite.addBatch({
  'setting lastUsedAs to primary': {
    topic: function (err, certs_and_assertion) {
      db.updateEmailLastUsedAs('syncer@somehost.com', 'primary', this.callback);
    },
    works: function (err, lastUsedAs) {
      assert.isNull(err);
    },
  },
});

var cert_key_url = '/wsapi/cert_key';

// generate a keypair, we'll use this to sign assertions, as if
// this keypair is stored in the browser localStorage
var kp;

suite.addBatch({
  'generate a keypair': {
    topic: function () {
      jwcrypto.generateKeypair({ algorithm: 'RS', keysize: 64 }, this.callback);
    },
    works: function (err, keypair) {
      assert.isNull(err);
      assert.isObject(keypair);
      kp = keypair;
    },
    'check the public key': {
      topic: function () {
        wsapi.get('/pk').call(this);
      },
      'returns a 200': function (err, r) {
        assert.strictEqual(r.code, 200);
      },
      'returns the right public key': function (err, r) {
        var pk = jwcrypto.loadPublicKey(r.body);
        assert.ok(pk);
      },
    },
    'cert key with no parameters': {
      topic: function () {
        wsapi.post(cert_key_url, {}).call(this);
      },
      'fails with HTTP 400': function (err, r) {
        assert.strictEqual(r.code, 400);
      },
    },
    'cert key invoked with just an email': {
      topic: function () {
        wsapi.post(cert_key_url, { email: 'syncer@somehost.com' }).call(this);
      },
      'returns a 400': function (err, r) {
        assert.strictEqual(r.code, 400);
      },
    },
    'cert key invoked with proper argument': {
      topic: function () {
        wsapi
          .post(cert_key_url, {
            email: 'syncer@somehost.com',
            pubkey: kp.publicKey.serialize(),
            ephemeral: false,
          })
          .call(this);
      },
      'returns a response with a proper content-type': function (err, r) {
        assert.strictEqual(r.code, 200);
      },
      'generate an assertion': {
        topic: function (err, r) {
          var serializedCert = r.body.toString();
          var expiration = new Date(new Date().getTime() + 2 * 60 * 1000);

          var self = this;
          jwcrypto.assertion.sign(
            {},
            {
              issuer: '127.0.0.1',
              expiresAt: expiration,
              issuedAt: new Date(),
            },
            kp.secretKey,
            function (err, signedObject) {
              if (err) return self.callback(err);

              self.callback(null, {
                certificates: [serializedCert],
                assertion: signedObject,
              });
            }
          );
        },
        'full bundle looks good': function (err, certs_and_assertion) {
          assert.isNull(err);
          assert.equal(
            certs_and_assertion.certificates[0].split('.').length,
            3
          );
          assert.equal(certs_and_assertion.assertion.split('.').length, 3);
        },
      },
      'after a short wait': {
        // In practise, db.emailLastUsedAs is sometimes called before
        // db.updateEmailLastUsedAs has been called by cert_key wsapi...
        topic: function (err, r) {
          setTimeout(this.callback, 500);
        },
        'email table lastUsedAs updated': {
          topic: function (err, certs_and_assertion) {
            db.emailLastUsedAs('syncer@somehost.com', this.callback);
          },
          'cert_key records a secondary': function (err, lastUsedAs) {
            assert.isNull(err);
            assert.equal(lastUsedAs, 'secondary');
          },
        },
      },
    },
    'cert key invoked proper arguments but incorrect email address': {
      topic: function () {
        wsapi
          .post(cert_key_url, {
            email: 'syncer2@somehost.com',
            pubkey: kp.publicKey.serialize(),
            ephemeral: false,
          })
          .call(this);
      },
      'returns a response with a proper error content-type': function (err, r) {
        assert.strictEqual(r.code, 400);
      },
    },
  },
});

// now let's add a primary address to the account so we can test cert_key's behavior
// when one attempts to certify keys on the fallback for an email that is spoken for
// by an IdP
var primaryUser = new primary({
  email: PRIMARY_EMAIL,
  domain: PRIMARY_DOMAIN,
});

// now let's generate an assertion using this user
suite.addBatch({
  'setting up the primary user': {
    topic: function () {
      primaryUser.setup(this.callback);
    },
    works: function (err) {
      assert.isNull(err);
    },
    'generating an assertion': {
      topic: function () {
        primaryUser.getAssertion(PRIMARY_ORIGIN, this.callback);
      },
      succeeds: function (err, r) {
        assert.isString(r);
      },
      'and adding this email': {
        topic: function (err, assertion) {
          wsapi
            .post('/wsapi/add_email_with_assertion', {
              assertion: assertion,
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
  },
});

start_stop.addShutdownBatches(suite);

// run or export the suite.
if (process.argv[1] === __filename) suite.run();
else suite.export(module);
