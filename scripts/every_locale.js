/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var fs = require('fs');
var i18n = require('i18n-abide');
var path = require('path');
var util = require('util');

var allLocales = [];
var localeDir = path.join(__dirname, '..', 'locale');

fs.readdir(localeDir, function (err, files) {
  files.forEach(function (file) {
    path.exists(
      path.join(localeDir, file, 'LC_MESSAGES', 'client.po'),
      function (c_exists) {
        if (c_exists) {
          path.exists(
            path.join(localeDir, file, 'LC_MESSAGES', 'messages.po'),
            function (m_exists) {
              if (m_exists) {
                allLocales.push(i18n.languageFrom(file));
              } else {
                console.error(
                  util.format('%s client.po exists, but not messages.po', file)
                );
              }
            }
          );
        }
      }
    );
  });
});

process.on('exit', function () {
  allLocales.sort();
  console.log(JSON.stringify(allLocales).replace(/,"/g, ', "'));
});
