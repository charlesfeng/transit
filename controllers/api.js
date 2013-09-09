var bart = require('./lib/bart');
var helpers = require('./lib');
var ff = require('ff');
var Station = mongoose.model('Station');

// api routes
module.exports = function (app) {
  app.get('/api/stations', function (req, res) {
    Station.find().select('name address lonlat').lean().exec(function (err, stations) {
      if (err) { return res.send(err, 500); }
      var map = {};
      stations.forEach(function (station) {
        station.id = station._id.toString();
        map[station.name] = station;
      });
      res.send(Object.keys(map).map(function (key) {
        return map[key];
      }));
    });
  });
  
  // refreshes BART data in the database
  app.get('/api/bart/refresh', function (req, res) {
    bart.refresh(function (e) {
      if (e) { return res.send(e, 500); }
      res.send('success');
    });
  });
};

// fetch non-realtime data: routes, stations, addresses, etc.