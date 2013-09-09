var bart = require('./lib/bart');
var helpers = require('./lib');
var ff = require('ff');

// api routes
module.exports = function (app) {
  app.get('/api')
};

// fetch non-realtime data: routes, stations, addresses, etc.
