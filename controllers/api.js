var async = require('async');
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
  
  // gets a list of imminent departures for each agency for the given location
  app.get('/api/departures', function (req, res) {
    if (!req.query.lng || !req.query.lat) { return res.send(400); }
    
    var location = [parseFloat(req.query.lng), parseFloat(req.query.lat)];
    
    var getDepartures = function (agency, docs, next) {
      var stations = {};
      docs.forEach(function (doc) {
        stations[doc.name] = doc;
      });
      stations = Object.keys(stations).map(function (key) {
        return stations[key];
      });
      stations.forEach(function (station) { station.distance = helpers.diffLonLat(location, station.lonlat); });
      stations.sort(function (a, b) { return a.distance - b.distance });
      stations = stations.slice(0, agency === 'bart' ? 3 : 2);
      
      async.mapSeries(stations, function (station, next) {
        if (agency === 'bart') {
          bart.getDeparturesByStation(station.name, function (err, departures) {
            station.departures = departures;
            next(null, station);
          });
        } else if (agency === 'caltrain') {
          caltrain.getDeparturesByStation(station.name, function (err, departures) {
            station.departures = departures;
            next(null, station);
          });
        }
      }, next);
    };
    
    var f = ff(function () {
      Station.find({ agency: 'bart', lonlat: { $within: { $centerSphere: [location, 5/3963.192] } } }).select('agency name address lonlat').lean().exec(f.slot());
      Station.find({ agency: 'caltrain', lonlat: { $within: { $centerSphere: [location, 10/3963.192] } } }).select('agency name address lonlat').lean().exec(f.slot());
    
    }, function (docs1, docs2) {
      getDepartures('bart', docs1, f.slot());
      getDepartures('caltrain', docs2, f.slot());
      
    }).onSuccess(function (docs1, docs2) {
      res.send({
          bart: docs1
        , caltrain: docs2
      });
    
    }).onError(function (e) {
      res.send(e, 500);
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