#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// A tiny webserver for the delegation of authority
const express = require('express'),
  morgan = require('morgan'),
  path = require('path');

var exampleServer = express();

exampleServer.use(morgan('dev'));

exampleServer.use(
  express.static(path.join(__dirname, '..', 'example', 'delegated_primary'), {
    redirect: false,
  })
);

const httpServer = exampleServer.listen(
  process.env.PORT || 10011,
  process.env.HOST || process.env.IP_ADDRESS || '127.0.0.1',
  function () {
    var addy = httpServer.address();
    console.log('running on http://' + addy.address + ':' + addy.port);
  }
);
