var bart = require('./lib/bart');
var caltrain = require('./lib/caltrain');
var helpers = require('./lib');
var ff = require('ff');
var Route = mongoose.model('Route');
var Station = mongoose.model('Station');

// api routes
module.exports = function (app) {
  // gets a list of all stations for all agencies in our database
  app.get('/api/stations', function (req, res) {
    Station.find().select('agency name address lonlat').lean().exec(function (err, stations) {
      if (err) { return res.send(err, 500); }
      res.send(stations);
    });
  });
  
  // gets a list of departures by agency & station name
  app.get('/api/agencies/:agency/departures', function (req, res) {
    if (!req.params.agency) { return res.send(400); }
    if (!req.query.station) { return res.send(400); }
    
    if (req.params.agency === 'bart') {
      bart.getDeparturesByStation(req.query.station, function (err, departures) {
        res.send(departures || []);
      });
    } else if (req.params.agency === 'caltrain') {
      caltrain.getDeparturesByStation(req.query.station, function (err, departures) {
        res.send(departures || []);
      });
    } else {
      res.send('agency not found', 404);
    }
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
var f = ff(function () {
  console.log('checking data...');
  Route.count({ agency: 'bart' }).exec(f.slot())
  Route.count({ agency: 'caltrain' }).exec(f.slot())

}, function (bartExists, caltrainExists) {
  if (!bartExists) { bart.refresh(f.slot()); }
  if (!caltrainExists) { caltrain.refresh(f.slot()); }

}).onSuccess(function () {
  console.log('data ok!')

}).onError(function (e) {
  console.log(e);
});