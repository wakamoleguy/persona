/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var i18n = require('i18n-abide');
var und = require('underscore');

/**
 * Module for managing all the known static assets in browserid.
 * In filenames/paths below, you may use ``:locale`` as a url
 * variable to be expanded later.
 *
 * These settings affect usage of cachify and eventually our
 * asset build steps.
 *
 * Be careful editing common_js, as it will affect all
 * minified scripts that depend on that variable. IE re-ordering
 * the list or removing a script.
 */

// Common to browserid.js dialog.js
var common_js = [
  '/common/js/browserid.js',
  '/common/js/lib/jquery-1.7.1.min.js',
  '/common/js/lib/winchan.js',
  '/common/js/lib/tinyscore.js',
  '/common/js/lib/micrajax.js',
  '/build/code_version.js',
  '/common/js/lib/urlparse.js',
  '/common/js/lib/gobbledygook.js',
  '/common/js/javascript-extensions.js',
  '/i18n/:locale/client.js',
  '/common/js/lib/hub.js',
  '/common/js/lib/dom-jquery.js',
  '/common/js/lib/module.js',
  '/common/js/lib/jschannel.js',
  '/common/js/templates.js',
  '/common/js/renderer.js',
  '/common/js/class.js',
  '/common/js/mediator.js',
  '/common/js/tooltip.js',
  '/common/js/validation.js',
  '/common/js/helpers.js',
  '/common/js/dom-helpers.js',
  '/common/js/gettext.js',
  '/common/js/screens.js',
  '/common/js/browser-support.js',
  '/common/js/enable_cookies_url.js',
  '/common/js/wait-messages.js',
  '/common/js/error-messages.js',
  '/common/js/storage.js',
  '/common/js/xhr_transport.js',
  '/common/js/modules/module.js',
  '/common/js/modules/xhr.js',

  '/common/js/models/models.js',
  '/common/js/models/user-context.js',
  '/common/js/models/network-context.js',
  '/common/js/models/rp_info.js',

  '/common/js/network.js',
  '/common/js/crypto-loader.js',
  '/common/js/provisioning.js',
  '/common/js/user.js',

  '/common/js/modules/dom_module.js',
  '/common/js/modules/page_module.js',
  '/common/js/modules/xhr_delay.js',
  '/common/js/modules/xhr_disable_form.js',
  '/common/js/modules/cookie_check.js',
  '/common/js/modules/development.js',
  '/common/js/modules/extended-info.js',
];

var browserid_min_js = '/production/:locale/browserid.js';
var browserid_js = und.flatten([
  common_js,
  [
    '/pages/js/page_helpers.js',
    '/pages/js/index.js',
    '/pages/js/start.js',
    '/pages/js/verify_secondary_address.js',
    '/pages/js/reset_password.js',
    '/pages/js/manage_account.js',
    '/pages/js/about.js',
  ],
]);

var dialog_min_js = '/production/:locale/dialog.js';
var dialog_js = und.flatten([
  common_js,
  [
    '/common/js/command.js',
    '/common/js/history.js',
    '/common/js/state_machine.js',

    '/common/js/models/interaction_data.js',

    '/common/js/modules/interaction_data.js',

    '/dialog/js/misc/internal_api.js',
    '/dialog/js/misc/helpers.js',
    '/dialog/js/misc/state.js',
    '/dialog/js/misc/screen_size_hacks.js',

    '/dialog/js/modules/actions.js',
    '/dialog/js/modules/dialog.js',
    '/dialog/js/modules/authenticate.js',
    '/dialog/js/modules/check_registration.js',
    '/dialog/js/modules/pick_email.js',
    '/dialog/js/modules/add_email.js',
    '/dialog/js/modules/verify_primary_user.js',
    '/dialog/js/modules/provision_primary_user.js',
    '/dialog/js/modules/primary_user_provisioned.js',
    '/dialog/js/modules/primary_user_not_provisioned.js',
    '/dialog/js/modules/primary_offline.js',
    '/dialog/js/modules/generate_assertion.js',
    '/dialog/js/modules/is_this_your_computer.js',
    '/dialog/js/modules/set_password.js',
    '/dialog/js/modules/rp_info.js',
    '/dialog/js/modules/inline_tospp.js',
    '/dialog/js/modules/complete_sign_in.js',
    '/dialog/js/modules/validate_rp_params.js',
    '/dialog/js/start.js',
  ],
]);

// Bundle for user agents wanting to make use of the fallback IdP
var idp_authenticate_min_js = '/production/:locale/idp_authenticate.js';
var idp_authenticate_js = [
  '/common/js/browserid.js',
  '/common/js/lib/jquery-1.7.1.min.js',
  '/common/js/lib/tinyscore.js',
  '/common/js/lib/micrajax.js',
  '/common/js/javascript-extensions.js',
  '/common/js/lib/hub.js',
  '/common/js/lib/dom-jquery.js',
  '/common/js/templates.js',
  '/common/js/renderer.js',
  '/common/js/lib/module.js',
  '/common/js/class.js',
  '/common/js/tooltip.js',
  '/common/js/mediator.js',
  '/common/js/validation.js',
  '/common/js/helpers.js',
  '/common/js/gettext.js',
  '/common/js/browser-support.js',
  '/common/js/enable_cookies_url.js',
  '/common/js/error-messages.js',
  '/common/js/storage.js',
  '/common/js/xhr_transport.js',
  '/common/js/modules/module.js',
  '/common/js/modules/xhr.js',
  '/common/js/network.js',
  '/common/js/crypto-loader.js',
  '/common/js/screens.js',
  '/common/js/modules/dom_module.js',
  '/common/js/modules/page_module.js',
  '/common/js/modules/xhr_delay.js',
  '/common/js/modules/xhr_disable_form.js',
  '/common/js/modules/cookie_check.js',
  '/authentication_api.js',
  '/common/js/user.js',
  '/common/js/modules/extended-info.js',

  '/dialog/js/misc/helpers.js',

  '/dialog/js/modules/authenticate.js',
  '/dialog/js/modules/check_registration.js',
  '/dialog/js/modules/dialog.js',
  '/dialog/js/modules/add_email.js',
  '/dialog/js/modules/set_password.js',
  '/dialog/js/modules/inline_tospp.js',
  '/dialog/js/modules/complete_sign_in.js',
  '/dialog/js/modules/idp_authentication.js',

  '/common/js/models/models.js',
  '/common/js/models/rp_info.js',

  '/pages/js/idp_authenticate.js',
];

exports.resources = {
  '/production/bidbundle.js': ['/common/js/lib/bidbundle.js'],
  '/production/:locale/dialog.css': [
    '/:locale/opensans-regular/fonts.css',
    '/:locale/opensans-bold/fonts.css',
    '/:locale/opensans-light/fonts.css',
    '/:locale/feurasans-regular/fonts.css',
    '/:locale/feurasans-bold/fonts.css',
    '/:locale/feurasans-light/fonts.css',
    '/common/css/style.css',
    '/dialog/css/style.css',
    '/dialog/css/m.css',
  ],
  '/production/:locale/browserid.css': [
    '/:locale/opensans-regular/fonts.css',
    '/:locale/opensans-bold/fonts.css',
    '/:locale/opensans-light/fonts.css',
    '/:locale/opensans-italic/fonts.css',
    '/common/css/style.css',
    '/pages/css/style.css',
    '/pages/css/m.css',
  ],
  '/production/ie8_main.css': ['/common/css/ie8.css', '/pages/css/ie8.css'],
  '/production/ie8_dialog.css': ['/common/css/ie8.css', '/dialog/css/ie8.css'],
  '/production/html5shim.js': ['/common/js/lib/html5shim.js'],
  '/production/communication_iframe.js': [
    '/common/js/browserid.js',
    '/common/js/lib/jschannel.js',
    '/common/js/lib/tinyscore.js',
    '/build/code_version.js',
    '/common/js/lib/hub.js',
    '/common/js/lib/micrajax.js',
    '/common/js/javascript-extensions.js',
    '/common/js/mediator.js',
    '/common/js/helpers.js',
    '/common/js/storage.js',
    '/common/js/class.js',
    '/common/js/xhr_transport.js',
    '/common/js/modules/module.js',
    '/common/js/modules/xhr.js',

    '/common/js/models/models.js',
    '/common/js/models/user-context.js',
    '/common/js/models/network-context.js',
    '/common/js/models/rp_info.js',
    '/common/js/models/interaction_data.js',

    '/common/js/network.js',
    '/common/js/crypto-loader.js',
    '/common/js/provisioning.js',
    '/common/js/user.js',

    '/dialog/js/misc/internal_api.js',

    '/communication_iframe/start.js',
  ],
  '/production/include.js': ['/build/include.js'],
  '/production/authentication_api.js': ['/authentication_api.js'],
  '/production/provisioning_api.js': ['/provisioning_api.js'],
  '/production/relay.js': ['/relay/relay.js'],
  '/favicon.ico': ['/favicon.ico'],
};
exports.resources[dialog_min_js] = dialog_js;
exports.resources[browserid_min_js] = browserid_js;
exports.resources[idp_authenticate_min_js] = idp_authenticate_js;

var replace = function (path, locale) {
  return path.replace(':locale', locale);
};

/**
 * Returns all filenames of static resources
 * in a connect-cachify compatible format.
 *
 * @langs - array of languages we support
 * @return { minified_file: [dependent, files] }
 *
 * Languages will be converted to locales. Filenames and list of files
 * will be expanded to match all the permutations.
 */
exports.all = function (langs) {
  /*jshint loopfunc:true*/
  var res = {};
  for (var f in exports.resources) {
    langs.forEach(function (lang) {
      var l = i18n.localeFrom(lang);
      res[replace(f, l)] = getResources(f, l);
    });
  }
  return res;
};

/**
 * Get all resource urls for a specified resource based on the locale
 */
var getResources = (exports.getResources = function (path, locale) {
  var res = [];
  if (exports.resources[path]) {
    exports.resources[path].forEach(function (r) {
      res.push(replace(r, locale));
    });
  }
  return res;
});
