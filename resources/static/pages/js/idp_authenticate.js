// In the style of pages/js/start.js
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

$(function() {
  "use strict";

  window.resizeTo(700, 440); // Gross

  /**
   * For the main page
   */
  var bid = BrowserID,
  helpers = bid.Helpers,
  user = bid.User,
  dom = bid.DOM,
  network = bid.Network,
  path = document.location.pathname || "/",
  mediator = bid.Mediator,
  dialogHelpers = bid.Helpers.Dialog,
  moduleManager = bid.module,
  modules = bid.Modules,
  CookieCheck = modules.CookieCheck,
  XHRDelay = modules.XHRDelay,
  XHRDisableForm = modules.XHRDisableForm,
  Development = modules.Development,
  ANIMATION_TIME = 500,
  checkCookiePaths = [ "/add_email_address", "/confirm", "/verify_email_address" ];

  network.init();
  user.init();

  moduleManager.register("cookie_check", modules.CookieCheck);
  moduleManager.start("cookie_check", {
    ready: function(status) {
      if(!status) return;

      moduleManager.register("dialog", modules.Dialog);
      moduleManager.register("add_email", modules.AddEmail);
      moduleManager.register("authenticate", modules.Authenticate);
      moduleManager.register("check_registration", modules.CheckRegistration);
      moduleManager.register("xhr_delay", modules.XHRDelay);
      moduleManager.register("xhr_disable_form", modules.XHRDisableForm);
      moduleManager.register("set_password", modules.SetPassword);
      moduleManager.register("inline_tospp", modules.InlineTosPp);
      moduleManager.register("complete_sign_in", modules.CompleteSignIn);

      moduleManager.start("xhr_delay");
      moduleManager.start("xhr_disable_form");
      moduleManager.start("dialog");
      moduleManager.start("inline_tospp");

      start({});
    }
  });

  function start(status) {
    // If cookies are disabled, do not run any of the page specific code and
    // instead just show the error message.
    if (!status) return;

    navigator.id.beginAuthentication(function(email) {
      mediator.subscribe("authentication_success", function(msg, info) {
        // TODO: Are we sure that we authed as email?
        navigator.id.completeAuthentication();
      });

      mediator.subscribe("new_user", function(msg, info) {
        var email = info.email;
        // TODO: Are we sure that we authed as email?
        moduleManager.start("set_password", info);
        mediator.subscribe("password_set", function(msg, info) {
          dialogHelpers.createUser.call({
            getErrorDialog: function(a, b, c) {
              console.log('getErrorDialog called', a, b, c);
            },
            publish: function(msg, info) {
              if ('user_staged') {

                info.siteName = 'TODO';
                info.verifier = "waitForUserValidation";
                info.verificationMessage = "user_confirmed";

                moduleManager.start("check_registration", info);
                user.waitForUserValidation(info.email, function(msg) {
                  if ('complete' === msg) {
                    navigator.id.completeAuthentication();
                  }
                },
                                           function(a, b, c) {
                                             // TODO: Handle
                                             console.log('ERROR', a, b, c);
                                           });
                
                mediator.subscribe("user_confirmed", function(a, b, c) {
                  // TODO: use or remove
                  console.log('user_confirmed', a, b, c);
                });
              }
            }
          }, email, info.password, function(a, b, c) {
            // TODO handle
            console.log(a, b, c);
          });
        });
      });

      moduleManager.start("authenticate");
      $('#authentication_email').val(email);
      $('button:visible').click();//Gross

    });
  }
});