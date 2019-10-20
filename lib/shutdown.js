/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* shutdown.js is an abstraction for installing graceful shutdown
 * handlers into processes so that they gracefully shutdown upon
 * signals.
 */

const logger = require("./logging/logging.js").logger;

const MAX_WAIT_MS = 10000;
const MAX_NICE_END_MS = 5000;

function connectionListener(server) {
  var connections = [];

  server.on('connection', function(c) {
    connections.push(c);
    c.on('close', function() {
      var where = connections.indexOf(c);
      if (where >= 0) connections.splice(where, 1);
    });
  });

  return function(callback) {
    if (!callback) callback = function(cli) { cli(); };

    var total_timeout = setTimeout(function() {
      logger.warn(MAX_WAIT_MS + "ms exceeded, going down forcefully...");
      setTimeout(function() { process.exit(1); }, 0);
    }, MAX_WAIT_MS);

    var nice_timeout = setTimeout(function() {
      logger.warn("forcefully closing " + connections.length + " remaining connections...");
      connections.forEach(function(c) { c.destroy(); });
    }, MAX_NICE_END_MS);

    server.on('close', function() {
      function clearTimeoutsAndCallClient() {
        clearTimeout(nice_timeout);
        clearTimeout(total_timeout);
        callback(function() {
          logger.info("graceful shutdown complete...");
        });
      }

      // if there aren't any open connections, we're done!
      if (connections.length === 0) clearTimeoutsAndCallClient();

      connections.forEach(function(c) {
        c.on('close', function() {
          if (!server.connections && connections.length === 0) {
            // once all connections are shutdown, let's call the client
            // to let him shutdown all his open connections
            clearTimeoutsAndCallClient();
          }
        });
        c.end();
      });
    });
    server.close();
  };
}

exports.handleTerminationSignals = function(server, callback) {
  var gotSignal = false;
  var terminate = connectionListener(server);
  function endIt(signame) {
    return function() {
      if (gotSignal) return;
      gotSignal = true;
      logger.warn("SIG" + signame + " received.  closing " + server.connections + " connections and shutting down.");
      terminate(callback);
    };
  }

  if (process.env.SUPPORTS_SIGNALS) {
    process.on('SIGINT', endIt('INT')).on('SIGTERM', endIt('TERM')).on('SIGQUIT', endIt('QUIT'));
  }
};
