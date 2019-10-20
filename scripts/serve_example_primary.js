#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


// finally, let's run a tiny webserver for the example code.
const
express = require('express'),
morgan = require('morgan'),
bodyParser = require('body-parser'),
path = require('path'),
urlparse = require('urlparse'),
postprocess = require('postprocess'),
querystring = require('querystring'),
sessions = require('client-sessions'),
jwcrypto = require('browserid-crypto'),
cookieParser = require('cookie-parser');

// alg
require('browserid-crypto/lib/algs/rs');
require('browserid-crypto/lib/algs/ds');

var exampleServer = express();
const API_PREFIX = '/api';
const SESSION_DURATION_MS = 1 * 60 * 60 * 1000;

exampleServer.use(cookieParser());

exampleServer.use(API_PREFIX, sessions({
  secret: "this secret, isn't very secret",
  requestKey: 'session',
  cookieName: 'example_browserid_primary',
  duration: SESSION_DURATION_MS,
  cookie: {
    path: '/api',
    httpOnly: true,
    secure: false,
    maxAge: SESSION_DURATION_MS
  }
}));

exampleServer.use(morgan('dev'));

if (process.env['PUBLIC_URL']) {
  var burl = urlparse(process.env['PUBLIC_URL']).validate().normalize().originOnly().toString();
  console.log('using browserid server at ' + burl);

  exampleServer.use(postprocess(function(req, buffer) {
    return buffer.toString().replace(new RegExp('https://login.persona.org', 'g'), burl);
  }));
}

exampleServer.use(express.static(path.join(__dirname, "..", "example", "primary"), { redirect: false }));

exampleServer.use(bodyParser.json());

exampleServer.use(API_PREFIX, function(req, resp, next) {
  resp.setHeader('Cache-Control', 'no-store, max-age=0');
  next();
});

exampleServer.get("/api/whoami", function (req, res) {
  if (req.session && typeof req.session.user === 'string') return res.json(req.session.user);
  return res.json(null);
});

exampleServer.get("/api/login", function (req, res) {
  req.session.user = req.query.user;
  return res.json(null);
});

exampleServer.get("/api/logout", function (req, res) {
  req.session.reset();
  return res.json(null);
});

var _privKey = jwcrypto.loadSecretKey(
  require('fs').readFileSync(
    path.join(__dirname, '..', 'example', 'primary', 'sample.privatekey')));

exampleServer.post("/api/cert_key", function (req, res) {
  var user = req.session.user;

  var domain = process.env['SHIMMED_DOMAIN'];

  var expiration = new Date();
  var pubkey = jwcrypto.loadPublicKeyFromObject(req.body.pubkey);
  expiration.setTime(new Date().valueOf() + req.body.duration * 1000);
  jwcrypto.cert.sign({publicKey: pubkey, principal: {email: user + "@" + domain}},
                     {issuer: domain, expiresAt: expiration, issuedAt: new Date()},
                     {}, _privKey, function(err, cert) {
    res.json({ cert: cert });
  });
});


const httpServer = exampleServer.listen(
  process.env['PORT'] || 10001,
  process.env['HOST'] || process.env['IP_ADDRESS'] || "127.0.0.1",
  function() {
    var addy = httpServer.address();
    console.log("running on http://" + addy.address + ":" + addy.port);
  });
