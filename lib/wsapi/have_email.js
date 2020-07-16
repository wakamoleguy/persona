/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const db = require('../db.js');
const wsapi = require('../wsapi.js');
const url = require('url');
const cef_logger = require('../logging/cef_logger').getInstance();

// return if an email is known to browserid

exports.method = 'get';
exports.writes_db = false;
exports.authed = false;
exports.i18n = false;
exports.args = {
  email: 'email',
};

exports.process = function (req, res) {
  db.emailKnown(req.params.email, function (err, known) {
    if (err) {
      cef_logger.alert('DB_FAILURE', 'emailKnown failed', req, {
        duser: req.params.email,
        msg: err,
      });
      return wsapi.databaseDown(res, err);
    }
    res.json({ email_known: known });
  });
};
