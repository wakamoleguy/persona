#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*jshint sub: true */

const
path = require('path');
const assert = require('../lib/asserts.js');
const restmail = require('../lib/restmail.js');
const utils = require('../lib/utils.js');
const persona_urls = require('../lib/urls.js');
const CSS = require('../pages/css.js');
const dialog = require('../pages/dialog.js');
const testSetup = require('../lib/test-setup.js');
const runner = require('../lib/runner.js');
const timeouts = require('../lib/timeouts.js');

var browser; var testIdp; var primary; var secondary;
/*
- setup: create account with 2 emails (primary and a secondary on same account) on persona.org, then:
- verify that no email is selected on first login to a site
  - visit 123done & verify
  - verify that the most recently used email for a given site is at top of dialog on next use:
    - log into 123done with one acct, sign out, open dialog to sign back in, verify.
*/

runner.run(module, {
  "setup": function(done) {
    testSetup.setup({browsers: 1, restmails: 1, testidps:1}, function(err, fix) {
      if (fix) {
        browser = fix.browsers[0];
        testIdp = fix.testidps[0];
        primary = testIdp.getRandomEmail();
        secondary = fix.restmails[0];
      }
      done(err);
    });
  },
  "enable primary support": function(done) {
    testIdp.enableSupport(done);
  },
  "start browser session": function(done) {
    testSetup.newBrowserSession(browser, done);
  },
  "startup, create primary acct on personaorg": function(done) {
    browser.chain({onError: done})
      .get(persona_urls['persona'])
      .wclick(CSS['persona.org'].header.signIn)
      .wwin(CSS['dialog'].windowName)
      .wtype(CSS['dialog'].emailInput, primary)
      .wclick(CSS['dialog'].newEmailNextButton)
      .wclick(CSS['testidp.org'].loginButton)
      .wwin()
      .wtext(CSS['persona.org'].accountEmail, function(err, text) {
        done(err || assert.equal(primary.toLowerCase(), text)); // note
      });
  },
  "go to 123done and add a secondary acct": function(done) {
    browser.chain({onError: done})
      .get(persona_urls['123done'])
      .wclick(CSS['123done.org'].signinButton)
      .wwin(CSS['persona.org'].windowName)
      .wclick(CSS['dialog'].useNewEmail)
      .wtype(CSS['dialog'].newEmail, secondary)
      .wclick(CSS['dialog'].addNewEmailButton)
      .wtype(CSS['dialog'].choosePassword, secondary.split('@')[0])
      .wtype(CSS['dialog'].verifyPassword, secondary.split('@')[0])
      .wclick(CSS['dialog'].createUserButton, done);
  },
  "get verification link": function(done) {
    restmail.getVerificationLink({ email: secondary }, done);
  },
  "follow link, wait for redirect, secondary should be displayed": function(done, token, link) {
    browser.chain({onError: done})
      .wwin()
      .get(link)
      .wtype(CSS['persona.org'].signInForm.password, secondary.split('@')[0])
      .wclick(CSS['persona.org'].signInForm.finishButton, secondary.split('@')[0])
      .wtext(CSS['123done.org'].currentlyLoggedInEmail, function(err, text) {
        done(err || assert.equal(text, secondary));
      });
  },
  "go to mfb, open dialog for first login": function(done) {
    browser.chain({onError: done})
      .get(persona_urls['myfavoritebeer'])
      .wclick(CSS['myfavoritebeer.org'].signinButton)
      .wwin(CSS['persona.org'].windowName, done);
  },
  "check first radio is not selected": function(done) {
    browser.wgetAttribute(CSS['dialog'].firstEmail, 'selected', function(err, val) {
      done(err || assert.ok(!val));
    });
  },
  "check second radio is not selected": function(done) {
    browser.wgetAttribute(CSS['dialog'].secondEmail, 'selected', function(err, val) {
      done(err || assert.ok(!val));
    });
  }
  ,
  "sign in using primary, sign out, reload, click sign in, verify primary is selected": function(done) {
    browser.chain({onError: done})
      .wclick(CSS['dialog'].firstEmail)
      .wclick(CSS['dialog'].signInButton)
      .wclickIfExists(CSS['dialog'].notMyComputerButton)
      .wwin()
      .wclick(CSS['myfavoritebeer.org'].logout)
      .wclick(CSS['myfavoritebeer.org'].signinButton)
      .wwin(CSS['persona.org'].windowName, done);
  },
  // this time, the first radio should be selected
  "check first radio is selected": function(done) {
    browser.wgetAttribute(CSS['dialog'].firstEmail, 'selected', function(err, val) {
      done(err || assert.ok(val));
    });
  },
  "check second radio is still not selected": function(done) {
    browser.wgetAttribute(CSS['dialog'].secondEmail, 'selected', function(err, val) {
      done(err || assert.ok(!val));
    });
  }
},
{
  suiteName: path.basename(__filename),
  cleanup: function(done) { testSetup.teardown(done); }
});
