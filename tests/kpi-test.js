#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const assert = require('assert');
const vows = require('vows');
const start_stop = require('./lib/start-stop');
const wsapi = require('./lib/wsapi');
const config = require('../lib/configuration');
const kpi_data = require('../lib/kpi_data');
const HttpMock = require('./lib/http-mock');
const logger = require('../lib/logging/logging').logger;
const KpiTransport = require('../lib/logging/transports/metrics-kpi');

require('./lib/test_env');

var suite = vows.describe('interaction-data');

// disable vows (often flakey?) async error behavior
suite.options.error = false;

start_stop.addStartupBatches(suite);

suite.addBatch({
  'POST /wsapi/interaction_data': {
    topic: wsapi.post('/wsapi/interaction_data', {}),
    succeeds: function (err, r) {
      assert.isNull(err);
      assert.strictEqual(r.code, 200);
    },
  },
});

suite.addBatch({
  'storing KPI data': {
    topic: function () {
      this.httpMock = new HttpMock({
        statusCode: 201,
      });

      kpi_data.init({
        http: this.httpMock,
        https: this.httpMock,
      });

      kpi_data.store([{}], this.callback);
    },
    succeeds: function (err, success) {
      assert.isNull(err);
      assert.equal(true, success);
    },
    'and reports to kpiggybank': function () {
      var request = this.httpMock.getRequest();
      assert.ok(request.data.indexOf('data=%5B%7B%22timestamp') > -1);
      assert.ok(request.requestOptions.host || request.requestOptions.hostname);
      assert.ok(request.requestOptions.path);
      assert.equal('POST', request.requestOptions.method);
    },
  },
});

suite.addBatch({
  'when kpi_backend_db_url is not set': {
    topic: function () {
      this.originalKpiBankendDBUrl = config.get('kpi.backend_db_url');
      config.set('kpi.backend_db_url', null);

      this.httpMock = new HttpMock({
        statusCode: 400,
      });

      kpi_data.init({
        http: this.httpMock,
        https: this.httpMock,
      });

      kpi_data.store([{}], this.callback);
    },
    'finishes with success=`false`': function (err, success) {
      assert.isNull(err);
      assert.equal(false, success);
    },
    'no reports are made to kpiggybank': function () {
      var request = this.httpMock.getRequest();
      assert.equal('undefined', typeof request);
    },
    'reset kpi_backend_db_url': function () {
      config.set('kpi.backend_db_url', this.originalKpiBankendDBUrl);
    },
  },
});

suite.addBatch({
  'metrics logs': {
    topic: function () {
      this.origSendMetricsValue = config.get('kpi.send_metrics');
      config.set('kpi.send_metrics', true);

      this.httpMock = new HttpMock({
        statusCode: 201,
      });

      kpi_data.init({
        http: this.httpMock,
        https: this.httpMock,
      });

      var batchSize = config.get('kpi.metrics_batch_size');
      for (var i = 0; i < batchSize - 1; ++i) {
        logger.info('signin', { value: i });
      }
      return this.httpMock.getRequest() || 'no_request_made';
    },
    'are not sent if the batch limit has not been reached': function (request) {
      assert.equal(request, 'no_request_made');
    },
    'are sent': {
      topic: function () {
        logger.info('verify', { value: 'causes user to verify' });
        return this.httpMock.getRequest() || 'no_request_made';
      },
      'when the batch is full': function (request) {
        assert.ok(request.data);
      },
    },
    'reset kpi_send_metrics': function () {
      config.set('kpi.send_metrics', this.origSendMetricsValue);
    },
  },
});

function noOp() {}

suite.addBatch({
  'staging and verification events': {
    topic: function () {
      this.origSendMetricsValue = config.get('kpi.send_metrics');
      this.expectedEvents = [
        'stage_email.success',
        'stage_reset.success',
        'stage_reverify.success',
        'stage_transition.success',
        'stage_user.success',
        'complete_email_confirmation.success',
        'complete_reset.success',
        'complete_transition.success',
        'complete_user_creation.success',
        'idp.auth_cancel',
        'idp.auth_return',
        'idp.create_new_user',
      ];
      config.set('kpi.send_metrics', true);

      var kpiTransport = new KpiTransport();

      this.expectedEvents.forEach(function (event) {
        kpiTransport.log('info', event, null, noOp);
      });

      return kpiTransport.getQueue();
    },
    'are added to the KPI queue': function (queue) {
      var expectedEvents = this.expectedEvents;

      // The test here is a bit backwards. Take the original set of events to
      // test and remove the events that have been added to the queue. Hope
      // that none remain.
      queue.forEach(function (kpi) {
        var eventName = kpi.event_name;
        var index = expectedEvents.indexOf(eventName);
        expectedEvents.splice(index, 1);
      });
      assert.equal(expectedEvents.length, 0);
    },
    'reset kpi_send_metrics': function () {
      config.set('kpi.send_metrics', this.origSendMetricsValue);
    },
  },
});

start_stop.addShutdownBatches(suite);

// run or export the suite.
if (process.argv[1] === __filename) suite.run();
else suite.export(module);
