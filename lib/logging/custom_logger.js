/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Enhances connect logger middleware - custom formats. See lib/configuration for usage.
 */
const morgan = require('morgan');

morgan.format('default_bid',
              ':remote-addr - - ":method :url HTTP/:http-version" :status :response-time :res[content-length] ":referrer" ":user-agent"');

morgan.format('dev_bid', ':method :url :status :response-time');

module.exports = morgan;
