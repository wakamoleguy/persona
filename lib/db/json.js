/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* db_json is a json database driver.  It is designed for use in
 * local development, is intended to be extremely easy to maintain,
 * have minimal dependencies on 3rd party libraries, and we could
 * care less if it performs well with more than 10 or so users.
 */
const dbutils = require('./dbutils.js');
const path = require('path');
const fs = require('fs');
const secrets = require('../secrets.js');
const jsel = require('JSONSelect');
const logger = require('../logging/logging.js').logger;
const configuration = require('../configuration.js');

const existsSync = fs.existsSync;

// a little alias for stringify
const ESC = JSON.stringify;

var dbPath = path.join(configuration.get('var_path'), 'authdb.json');

/* The JSON database. The structure is thus:
 * {
 *   "users":[
 *     {
 *       "id": <numerical user id>,
 *       "password": <string password and salt info>,
 *       "lastPasswordReset": <seconds-since-epoch, integer>,
 *       "failedAuthTries": <number-of-consecutive-failed-authentication-attempts, integer>,
 *       "emails":{
 *         "syncer@somehost.com":{
 *           "type": <string secondary|primary>,
 *           "verified":<boolean>
 *         }
 *       }
 *     }
 *   ],
 *   "stagedEmails":{},
 *   "staged":{},
 *   "idp":{}
 *   }
 */

function now() {
  return Math.floor(new Date().getTime() / 1000);
}

function getNextUserID() {
  var max = 1;
  jsel.forEach('.id', db.users, function (id) {
    if (id >= max) max = id + 1;
  });
  return max;
}

var db = {
  users: [],
  stagedEmails: {},
  staged: {},
  idp: {},
};

function flush() {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(db));
  } catch (e) {
    logger.error('Cannot save database to ' + dbPath);
  }
}

function sync() {
  // the database not existing yet just means its empty, don't log an error
  if (existsSync(dbPath)) {
    try {
      db = JSON.parse(fs.readFileSync(dbPath));

      // FIXME:
      // at this point db might be missing some important fields
      // we may want to fix this. In the meantime, delete your old json db
    } catch (e) {
      logger.error('Cannot read database from ' + dbPath);
    }
  } else {
    logger.debug("Database doesn't exist (yet): " + dbPath);
  }
}

exports.open = function (cfg, cb) {
  if (cfg && cfg.path) {
    dbPath = cfg.path;
  }
  logger.debug('opening JSON database: ' + dbPath);

  sync();
  process.nextTick(function () {
    cb(null);
  });
};

exports.closeAndRemove = function (cb) {
  // if the file cannot be removed, it's not an error, just means it was never
  // written or deleted by a different process
  try {
    fs.unlinkSync(dbPath);
  } catch (e) {
    /* */
  }
  process.nextTick(function () {
    cb(null);
  });
};

exports.close = function (cb) {
  // don't flush database here to disk, the database is flushed synchronously when
  // written - If we were to flush here we could overwrite changes made by
  // another process - see issue #557
  process.nextTick(function () {
    cb(null);
  });
};

exports.emailKnown = function (email, cb) {
  sync();
  var m = jsel.match('.emails .' + ESC(email), db.users);
  process.nextTick(function () {
    cb(null, m.length > 0);
  });
};

exports.emailIsVerified = function (email, cb) {
  sync();
  var m = jsel.match('.emails .' + ESC(email), db.users);
  process.nextTick(function () {
    if (!m.length) cb('no such email');
    else cb(null, m[0].verified);
  });
};

exports.emailType = function (email, cb) {
  sync();
  var m = jsel.match('.emails .' + ESC(email), db.users);
  process.nextTick(function () {
    cb(null, m.length ? m[0].type : undefined);
  });
};

exports.emailInfo = function (email, cb) {
  sync();
  // emailInfo is case insensitive, so search the database and find the
  // "canonical" or normalized form of the email address
  db.users.forEach(function (user) {
    Object.keys(user.emails).forEach(function (foundEmail) {
      if (foundEmail.toLowerCase() === email.toLowerCase()) email = foundEmail;
    });
  });
  var m = jsel.match('.emails .?', [email], db.users);
  if (!m || !m.length)
    return process.nextTick(function () {
      cb(null, null);
    });
  var response = {
    lastUsedAs: m[0].type || 'secondary',
    verified: m[0].verified,
    normalizedEmail: email,
  };
  // if the email is known, let's determine if the account has a password
  m = jsel.match(
    ':root > object:has(.emails > .?) > .password',
    [email],
    db.users
  );
  response.hasPassword = m.length ? typeof m[0] === 'string' : false;
  process.nextTick(function () {
    cb(null, response);
  });
};

exports.isStaged = function (email, cb) {
  if (cb) {
    setTimeout(function () {
      sync();
      cb(null, Object.prototype.hasOwnProperty.call(db.stagedEmails, email));
    }, 0);
  }
};

exports.lastStaged = function (email, cb) {
  if (cb) {
    sync();
    var d;
    if (Object.prototype.hasOwnProperty.call(db.stagedEmails, email)) {
      d = new Date(db.staged[db.stagedEmails[email]].when);
    }
    setTimeout(function () {
      cb(null, d);
    }, 0);
  }
};

exports.emailsBelongToSameAccount = function (lhs, rhs, cb) {
  sync();
  var m = jsel.match(
    '.emails:has(.' + ESC(lhs) + '):has(.' + ESC(rhs) + ')',
    db.users
  );
  process.nextTick(function () {
    cb(null, m && m.length === 1);
  });
};

exports.emailToUID = function (email, cb) {
  sync();
  var m = jsel.match(
    ':root > object:has(.emails > .' + ESC(email) + ') > .id',
    db.users
  );
  if (m.length === 0) m = undefined;
  else m = m[0];
  process.nextTick(function () {
    cb(null, m);
  });
};

exports.userOwnsEmail = function (uid, email, cb) {
  sync();
  var m = jsel.match(
    ':root > object:has(:root > .id:expr(x=' +
      ESC(uid) +
      ')):has(.emails > .' +
      ESC(email) +
      ')',
    db.users
  );
  var owned = m && m.length === 1;
  process.nextTick(function () {
    cb(null, owned);
  });
};

function addEmailToAccount(userID, email, type, cb) {
  // validate 'type' isn't bogus
  if (['secondary', 'primary'].indexOf(type) === -1) {
    return process.nextTick(function () {
      cb('invalid type');
    });
  }

  process.nextTick(function () {
    sync();
    var emails = jsel.match(
      ':has(.id:expr(x=' + ESC(userID) + ')) > .emails',
      db.users
    );
    if (emails && emails.length > 0) {
      emails[0][email] = {
        type: type,
        verified: true,
      };
      flush();
    }
    cb(null);
  });
}

function deleteOldSecrets(email) {
  var secret = db.stagedEmails[email];
  if (secret) {
    delete db.stagedEmails[email];
    delete db.staged[secret];
  }
}

exports.stageUser = function (email, hash, cb) {
  secrets.generate(48, function (secret) {
    // overwrite previously staged users
    sync();
    deleteOldSecrets(email);
    db.staged[secret] = {
      type: 'add_account',
      email: email,
      passwd: hash,
      when: new Date().getTime(),
    };
    db.stagedEmails[email] = secret;
    flush();
    process.nextTick(function () {
      cb(null, secret);
    });
  });
};

exports.stageEmail = function (existing_user, new_email, hash, cb) {
  secrets.generate(48, function (secret) {
    // overwrite previously staged users
    sync();
    deleteOldSecrets(new_email);
    db.staged[secret] = {
      type: 'add_email',
      existing_user: existing_user,
      email: new_email,
      passwd: hash,
      when: new Date().getTime(),
    };
    db.stagedEmails[new_email] = secret;
    flush();

    process.nextTick(function () {
      cb(null, secret);
    });
  });
};

exports.createUserWithPrimaryEmail = function (email, cb) {
  var emailVal = {};
  emailVal[email] = {
    type: 'primary',
    verified: true,
  };
  var uid = getNextUserID();
  var lastPasswordReset = now();
  db.users.push({
    id: uid,
    password: null,
    lastPasswordReset: lastPasswordReset,
    failedAuthTries: 0,
    emails: emailVal,
  });
  flush();
  process.nextTick(function () {
    cb(null, uid, lastPasswordReset);
  });
};

exports.haveVerificationSecret = function (secret, cb) {
  process.nextTick(function () {
    sync();
    cb(null, !!db.staged[secret]);
  });
};

exports.emailForVerificationSecret = function (secret, cb) {
  process.nextTick(function () {
    sync();
    if (!db.staged[secret]) return cb('no such secret');
    cb(
      null,
      db.staged[secret].email,
      db.staged[secret].existing_user,
      db.staged[secret].passwd
    );
  });
};

exports.authForVerificationSecret = function (secret, cb) {
  process.nextTick(function () {
    sync();
    if (!db.staged[secret]) return cb('no such secret');

    if (db.staged[secret].passwd) {
      return cb(
        null,
        db.staged[secret].passwd,
        db.staged[secret].existing_user
      );
    }

    exports.checkAuth(db.staged[secret].existing_user, function (err, hash) {
      logger.debug('check auth ' + err + ' ' + hash);
      cb(err, hash, db.staged[secret].existing_user);
    });
  });
};

exports.verificationSecretForEmail = function (email, cb) {
  setTimeout(function () {
    sync();
    cb(null, db.stagedEmails[email]);
  }, 0);
};

function getAndDeleteRowForSecret(secret, cb) {
  sync();
  if (!Object.prototype.hasOwnProperty.call(db.staged, secret))
    return cb('unknown secret');

  // simply move from staged over to the emails "database"
  var o = db.staged[secret];
  delete db.staged[secret];
  delete db.stagedEmails[o.email];
  flush();

  process.nextTick(function () {
    cb(null, o);
  });
}

// either a email re-verification, or an email addition - we treat these things
// the same
exports.completeConfirmEmail = function (secret, cb) {
  getAndDeleteRowForSecret(secret, function (err, o) {
    dbutils.withType(o.email, function (type) {
      exports.emailKnown(o.email, function (err, known) {
        function addIt() {
          addEmailToAccount(o.existing_user, o.email, type, function (e) {
            var hash = o.passwd;
            if (e || typeof hash !== 'string')
              return cb(e, o.email, o.existing_user);

            // a hash was specified, update the password for the user
            exports.emailToUID(o.email, function (err, uid) {
              if (err) return cb(err, o.email, o.existing_user);

              exports.updatePassword(uid, hash, false, function (err) {
                cb(err || null, o.email, o.existing_user);
              });
            });
          });
        }
        if (known) {
          removeEmailNoCheck(o.email, function (err) {
            if (err) cb(err);
            else addIt();
          });
        } else {
          addIt();
        }
      });
    });
  });
};

exports.completeCreateUser = function (secret, cb) {
  getAndDeleteRowForSecret(secret, function (err, o) {
    dbutils.withType(o.email, function (type) {
      exports.emailKnown(o.email, function (err, known) {
        function createAccount() {
          var emailVal = {};
          emailVal[o.email] = { type: type, verified: true };
          var uid = getNextUserID();
          var hash = o.passwd;
          db.users.push({
            id: uid,
            password: hash,
            lastPasswordReset: now(),
            failedAuthTries: 0,
            emails: emailVal,
          });
          flush();
          cb(null, o.email, uid);
        }

        // if this email address is known and a user has completed a re-verification of this email
        // address, remove the email from the old account that it was associated with, and then
        // create a brand new account with only this email.
        // NOTE: this might be sub-optimal, but it's a dead simple approach that mitigates many attacks
        // and gives us reasonable behavior (without explicitly supporting) in the face of shared email
        // addresses.
        if (known) {
          removeEmailNoCheck(o.email, function (err) {
            if (err) cb(err);
            else createAccount();
          });
        } else {
          createAccount();
        }
      });
    });
  });
};

exports.completePasswordReset = function (secret, password, cb) {
  getAndDeleteRowForSecret(secret, function (err, o) {
    exports.emailKnown(o.email, function (err) {
      if (err) return cb(err);

      exports.emailToUID(o.email, function (err, uid) {
        if (err) return cb(err);

        // if for some reason the email is associated with a different user now than when
        // the action was initiated, error out.
        if (uid !== o.existing_user) {
          return cb('cannot update password, data inconsistency');
        }

        sync();
        // flip the verification bit on all emails for the user other than the one just verified
        var emails = jsel.match(
          ':has(.id:expr(x=?)) > .emails',
          [uid],
          db.users
        )[0];

        Object.keys(emails).forEach(function (email) {
          if (email !== o.email && emails[email].type === 'secondary') {
            emails[email].verified = false;
          } else if (email === o.email) {
            emails[email].verified = true;
          }
        });
        flush();

        // update the password!
        exports.updatePassword(uid, password || o.passwd, true, function (err) {
          cb(err, o.email, uid);
        });
      });
    });
  });
};

exports.addPrimaryEmailToAccount = function (userID, emailToAdd, cb) {
  sync();
  exports.emailKnown(emailToAdd, function (err, known) {
    function addIt() {
      addEmailToAccount(userID, emailToAdd, 'primary', cb);
    }
    if (known) {
      removeEmailNoCheck(emailToAdd, function (err) {
        if (err) cb(err);
        else addIt();
      });
    } else {
      addIt();
    }
  });
};

exports.checkAuth = function (userID, cb) {
  sync();
  var hash;
  var failedAuthTries;
  if (userID) {
    var m = jsel.match(
      ':root > object:has(:root > .id:expr(x=?))',
      [userID],
      db.users
    );
    if (m.length === 1) {
      hash = m[0].password;
      failedAuthTries = m[0].failedAuthTries;
    }
  }
  process.nextTick(function () {
    cb(null, hash, failedAuthTries);
  });
};

exports.incAuthFailures = function (userID, cb) {
  if (typeof userID === 'string') userID = parseInt(userID, 10);
  sync();
  var err;
  if (userID) {
    var m = jsel.match(
      ':root > object:has(:root > .id:expr(x=?))',
      [userID],
      db.users
    );
    if (m.length === 1) {
      m[0].failedAuthTries++;
      flush();
    } else {
      err = 'no such user';
    }
  }
  process.nextTick(function () {
    cb(err);
  });
};

exports.clearAuthFailures = function (userID, cb) {
  if (typeof userID === 'string') userID = parseInt(userID, 10);
  sync();
  var err;
  if (userID) {
    var m = jsel.match(
      ':root > object:has(:root > .id:expr(x=?))',
      [userID],
      db.users
    );
    if (m.length === 1) {
      m[0].failedAuthTries = 0;
      flush();
    } else {
      err = 'no such user';
    }
  }
  process.nextTick(function () {
    cb(err);
  });
};

exports.lastPasswordReset = function (userID, cb) {
  sync();
  var m;
  if (userID) {
    m = jsel.match(
      ':root > object:has(:root > .id:expr(x=' +
        ESC(userID) +
        ')) > .lastPasswordReset',
      db.users
    );
    if (m.length === 0) m = undefined;
    else m = m[0];
  }
  process.nextTick(function () {
    cb(null, m);
  });
};

exports.userKnown = function (userID, cb) {
  sync();
  var m = jsel.match(
    ':root > object:has(:root > .id:expr(x=' + ESC(userID) + '))',
    db.users
  );
  var known = m.length !== 0;
  var hasPass =
    known && typeof m[0].password === 'string' && m[0].password.length > 0;
  process.nextTick(function () {
    cb(null, known, hasPass);
  });
};

exports.updatePassword = function (userID, hash, invalidateSessions, cb) {
  sync();
  var m = jsel.match(
    ':root > object:has(.id:expr(x=' + ESC(userID) + '))',
    db.users
  );
  var err;
  if (m.length === 0) err = 'no such email address';
  else {
    m[0].password = hash;
    if (invalidateSessions) {
      m[0].lastPasswordReset = now();
    }
    m[0].failedAuthTries = 0;
  }
  flush();
  process.nextTick(function () {
    cb(err);
  });
};

exports.listEmails = function (uid, cb) {
  sync();
  var emails = jsel.match(
    ':has(.id:expr(x=' + ESC(uid) + ')) > .emails',
    db.users
  );
  process.nextTick(function () {
    if (!emails || emails.length !== 1) {
      cb('no such user: ' + uid);
      return;
    }
    // simply return the emails associated with this user
    cb(null, Object.keys(emails[0]));
  });
};

exports.emailLastUsedAs = function (email, cb) {
  sync();
  var emails = jsel.match('.?', [email], db.users);
  process.nextTick(function () {
    if (!emails || emails.length !== 1) {
      cb(
        'emailLastUsedAs Expected 1 row, got ' + emails.length + ' for ' + email
      );
      return;
    }
    cb(null, emails[0].type);
  });
};

const typeEnum = ['primary', 'secondary'];

exports.updateEmailLastUsedAs = function (email, type, cb) {
  if (typeEnum.indexOf(type) === -1)
    return cb && cb('Invalid type for updating email.type');
  sync();
  var emails = jsel.match('.' + ESC(email), db.users);
  emails[0].type = type;
  flush();
  process.nextTick(function () {
    cb(null);
  });
};

exports.removeEmail = function (authenticated_user, email, cb) {
  sync();
  var m = jsel.match(
    ':has(.id:expr(x=' +
      ESC(authenticated_user) +
      ')) .emails:has(.' +
      ESC(email) +
      ')',
    db.users
  );

  if (m.length) {
    var emails = m[0];
    delete emails[email];
    flush();
  }
  setTimeout(function () {
    cb(null);
  }, 0);
};

function removeEmailNoCheck(email, cb) {
  sync();
  var m = jsel.match('.emails:has(.' + ESC(email) + ')', db.users);
  if (m.length) {
    var emails = m[0];
    delete emails[email];
    flush();
  }
  process.nextTick(function () {
    cb(null);
  });
}

exports.cancelAccount = function (authenticated_uid, cb) {
  sync();

  for (var i = 0; i < db.users.length; i++) {
    if (db.users[i].id === authenticated_uid) break;
  }

  if (i < db.users.length) {
    var m = jsel.match(
      ':root > object:has(.existing_user:expr(x=' +
        ESC(authenticated_uid) +
        '))',
      db.staged
    );
    if (m.length) {
      m.forEach(function (staged) {
        var token = db.stagedEmails[staged.email];
        delete db.stagedEmails[staged.email];
        delete db.staged[token];
      });
    }

    db.users.splice(i, 1);
    flush();
  }

  process.nextTick(function () {
    cb(null);
  });
};

exports.createUnverifiedUser = function (email, hash, cb) {
  sync();
  var emailVal = {};
  emailVal[email] = {
    type: 'secondary',
    verified: false,
  };
  var row = {
    id: getNextUserID(),
    lastPasswordReset: now(),
    password: hash,
    emails: emailVal,
  };
  db.users.push(row);
  flush();
  exports.stageEmail(row.id, email, hash, function (err, secret) {
    cb(err, row.id, secret);
  });
};

exports.addTestUser = function (email, hash, cb) {
  sync();
  removeEmailNoCheck(email, function () {
    var emailVal = {};
    emailVal[email] = {
      type: 'secondary',
      verified: true,
    };
    db.users.push({
      id: getNextUserID(),
      password: hash,
      lastPasswordReset: now(),
      emails: emailVal,
    });
    flush();
    cb(null);
  });
};

exports.ping = function (cb) {
  process.nextTick(function () {
    cb(null);
  });
};

exports.updateIDPLastSeen = function (domain, cb) {
  sync();
  db.idp[domain] = new Date().getTime();
  flush();
  process.nextTick(function () {
    cb(null);
  });
};

exports.getIDPLastSeen = function (domain, cb) {
  sync();
  var lastSeen = db.idp[domain] ? new Date(db.idp[domain]) : null;
  process.nextTick(function () {
    cb(null, lastSeen);
  });
};

exports.forgetIDP = function (domain, cb) {
  sync();
  delete db.idp[domain];
  flush();
  process.nextTick(function () {
    cb(null);
  });
};
