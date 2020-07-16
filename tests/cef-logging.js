#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const assert = require('assert');
const vows = require('vows');
const util = require('util');
const dgram = require('dgram');
const http = require('http');
const cef = require('cef');
const cef_logger = require('../lib/logging/cef_logger');

var mock_http_req = cef.extensionsFromHTTPRequest({
  url: '/pie',
  method: 'GET',
  headers: {
    'user-agent': 'Tiney fork 3.14',
    host: 'pie.io',
  },
});

function produces(signature, message, expected_string, extensions) {
  // Mock udp syslog service
  var server = dgram.createSocket('udp4');

  var context = {
    topic: function () {
      var method = this.context.name;

      // Throw the server away when the first message is received.
      // Return the message to the test context.
      server.on(
        'message',
        function (buf, rinfo) {
          server.removeAllListeners();
          server.close();
          this.callback(null, buf.toString());
        }.bind(this)
      );

      // When server is up, create a logger and send a message
      server.on('listening', function () {
        var syslog_port = server.address().port;
        var config = {
          vendor: 'Mozilla',
          product: 'pie-taster',
          version: '42',
          syslog_port: syslog_port,
          syslog_tag: 'flan',
          syslog_facility: 'local4',
        };
        var logger = cef_logger.getInstance(config);
        logger[method](signature, message, extensions);
      });

      server.bind(0);
    },
  };

  context['produces the expected CEF string'] = function (message) {
    assert(message.indexOf(expected_string) !== -1);
  };

  context['writes extensions to the log'] = function (message) {
    Object.keys(extensions).forEach(function (key) {
      assert(message.indexOf(util.format('%s=%s', key, extensions[key])) > -1);
    });
  };

  return context;
}

var suite = vows
  .describe('CEF Logging')

  .addBatch({
    // First test with nothing else mixed into the http env to prove that
    // bare http env comes in as an object.
    info: produces(
      'GET_PIE',
      'I like pie',
      'CEF:0|Mozilla|pie-taster|42|GET_PIE|I like pie|4',
      mock_http_req
    ),

    // Blending other params in with http env ...
    warn: produces(
      'PIE',
      'Supplies of pies in demise',
      'CEF:0|Mozilla|pie-taster|42|PIE|Supplies of pies in demise|6',
      mock_http_req,
      { msg: '37 remaining' }
    ),

    alert: produces(
      'PIE',
      'MOAR PIES!!!',
      'CEF:0|Mozilla|pie-taster|42|PIE|MOAR PIES!!!|9',
      { dhost: 'my belly', msg: 'supply all gone' }
    ),

    emergency: produces(
      'PIE_FAILURE',
      'Died of starvation',
      'CEF:0|Mozilla|pie-taster|42|PIE_FAILURE|Died of starvation|10',
      { end: Date.now() }
    ),
  })

  .addBatch({
    'HTTP request and other parameters': {
      topic: function () {
        var cb = this.callback;
        var logger = cef_logger.getInstance();
        var server = http.createServer(function (req, res) {
          // combine http request and a couple other objects
          cb(
            null,
            logger.info('PIE', 'I like pie', { msg: 'I like pie' }, req, {
              end: Date.now(),
            })
          );
          server.removeAllListeners();
          server.close();
        });
        server.listen(0);
        server.on('listening', function () {
          var req = http.request({
            port: server.address().port,
            method: 'GET',
            path: '/pie',
          });
          req.end();
        });
      },

      'are properly merged': function (err, cef_string) {
        [
          /msg=I like pie/,
          /request=\/pie/,
          /requestMethod=GET/,
          /requestContext=\S+/,
          /dhost=\S+/,
          /shost=\S+/,
          /end=\d+/,
        ].forEach(function (extension) {
          assert(extension.test(cef_string));
        });
      },
    },
  });

if (process.argv[1] === __filename) {
  suite.run();
} else {
  suite.export(module);
}
