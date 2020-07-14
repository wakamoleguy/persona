/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// a teensy tinsy module to do parameter validation.  A good candiate for future
// librification.
//
// usage:
//
//   const validate = require('validate.js');
//
//   app.post('/wsapi/foo', validate([ "email", "site" ]), function(req, resp) {
//   });

const logger = require('./logging/logging.js').logger,
  httputils = require('./httputils.js'),
  check = require('validator').check,
  url = require('url');

var hostnameRegex = /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$|^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$/;

var types = {
  email: function (x) {
    check(x).isEmail();
  },
  email_type: function (x) {
    check(x).isIn(['primary', 'secondary']);
  },
  userid: function (x) {
    check(x).isInt();
  },
  password: function (x) {
    check(x).len(8, 80);
  },
  boolean: function (x) {
    if (typeof x !== 'boolean') throw 'boolean required';
  },
  token: function (x) {
    check(x).len(48, 48).isAlphanumeric();
  },
  assertion: function (x) {
    check(x)
      .len(50, 10240)
      .regex(/[0-9a-zA-Z~_\-]+/);
  },
  pubkey: function (x) {
    check(x).len(50, 10240);
    JSON.parse(x);
  },
  hostname: function (x) {
    check(x).is(hostnameRegex);
  },
  origin: function (x) {
    /* origin regex
    /^                          // beginning
    (?:https?|app):\/\/         // starts with http://, https://, or app:// (b2g desktop)
    (?=.{1,254}(?::|$))         // hostname must be within 1-254 characters
    (?:                         // match hostname part (<part>.<part>...)
      (?!-)                     // cannot start with a dash (allow it to start with a digit re issue #2042)
      (?![a-z0-9\-]{1,62}-      // part cannot end with a dash
        (?:\.|:|$))             // (end of part will be '.', ':', or end of str)
      [a-z0-9\-]{1,63}\b        // part will be 1-63 letters, numbers, or dashes
        (?!\.$)                 // final part cannot end with a '.'
        \.?                     // part followed by '.' unless final part
    )+                          // one or more hostname parts
    (:\d+)?                     // optional port
    $/i;                        // end; case-insensitive
    */
    var regex = /^(?:https?|app):\/\/(?=.{1,254}(?::|$))(?:(?!-)(?![a-z0-9\-]{1,62}-(?:\.|:|$))[a-z0-9\-]{1,63}\b(?!\.$)\.?)+(:\d+)?$/i;
    if (typeof x !== 'string' || !x.match(regex)) {
      throw new Error('not a valid origin');
    }
  },
  color: function (value) {
    check(value).isHexColor();
  },
  image: function (inputLogoUri) {
    if (typeof inputLogoUri !== 'string') {
      throw new Error('not a valid image');
    }

    if (url.parse(inputLogoUri).protocol !== 'https:') {
      throw new Error('images must be served over https.');
    }
  },
};

module.exports = function (params) {
  // normalize the parameters description, verify all specified types are present
  if (
    Array.isArray(params) ||
    typeof params !== 'object' ||
    typeof params === null
  ) {
    throw 'argument to validate must be an object, not a ' + typeof params;
  }

  Object.keys(params).forEach(function (p) {
    var v = params[p];
    if (typeof v === 'string') {
      v = { type: v };
    }
    if (typeof v.required === 'undefined') v.required = true;

    if (!types[v.type]) throw 'unknown type specified in WSAPI:' + v.type;
    params[p] = v;
  });

  return function (req, resp, next) {
    var reqParams = null;
    if (req.method === 'POST') {
      reqParams = req.body;
    } else {
      reqParams = req.query;
    }

    // clear body and query to prevent wsapi handlers from accessing
    // un-validated input parameters
    req.body = {};
    req.query = {};
    req.params = {};

    function hasOwnProperty(o, p) {
      return typeof o.hasOwnProperty === 'function'
        ? o.hasOwnProperty(p)
        : o[p] !== undefined;
    }

    // now validate
    try {
      // allow csrf through
      if (reqParams.csrf) {
        req.params.csrf = reqParams.csrf;
        delete reqParams.csrf;
      }

      Object.keys(params).forEach(function (p) {
        if (params[p].required && !hasOwnProperty(reqParams, p))
          throw "missing required parameter: '" + p + "'";
        if (reqParams[p] === undefined) return;

        // validate
        try {
          types[params[p].type](reqParams[p]);
        } catch (e) {
          throw p + ': ' + e.toString();
        }
        req.params[p] = reqParams[p];
        delete reqParams[p];
      });

      // if there are any keys left in reqParams, they're not allowable!
      var extra = Object.keys(reqParams);
      if (extra.length)
        throw 'extra parameters are not allowed: ' + extra.join(', ');
    } catch (e) {
      var msg = {
        success: false,
        reason: e.toString(),
      };
      logger.warn('bad request received: ' + msg.reason);
      resp.statusCode = 400;
      return resp.json(msg);
    }

    // this is called outside the try/catch because errors
    // in the handling of the request should be caught separately
    next();
  };
};
