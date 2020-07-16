#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const config = require('../lib/configuration');
const bcrypt = require('bcrypt');

function bcryptPassword(password, cb) {
  var bcryptWorkFactor = config.get('bcrypt_work_factor');

  bcrypt.gen_salt(bcryptWorkFactor, function (err, salt) {
    if (err) {
      var msg = 'error generating salt with bcrypt: ' + err;
      logger.error(msg);
      return cb(msg);
    }
    bcrypt.encrypt(password, salt, function (err, hash) {
      if (err) {
        var msg = 'error generating password hash with bcrypt: ' + err;
        logger.error(msg);
        return cb(msg);
      }
      return cb(undefined, hash);
    });
  });
}

if (process.argv.length !== 3) {
  console.log('Usage:', process.argv[1], '<password>');
  process.exit(1);
}

bcryptPassword(process.argv[2], function (err, hash) {
  if (err) {
    process.sterr.write('error: ' + err.toString() + '\n');
    process.exit(1);
  }
  console.log(hash);
});
