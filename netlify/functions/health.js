'use strict';

const { send } = require('../../lib/http');
const store = require('../../lib/presentation-store');

exports.handler = async (req, res) => {
  send(res, 200, {
    status: 'healthy',
    application: 'operational',
    database: 'local-first',
    presentation: store.hasRedis ? 'shared' : 'local',
    version: '1.0.0',
    time: new Date().toISOString()
  });
};
