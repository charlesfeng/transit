var async = require('async');
var csv = require('csv');
var ff = require('ff');
var moment = require('moment');
var my511 = require('./my511');
var Route = mongoose.model('Route');
var Station = mongoose.model('Station');

// gets all caltrain stations from text file
var getStations = function (next) {
  var f = ff(function () {
    csv()
      .from.path(__dirname + '/../../data/caltrain-stops.txt')
      .to.array(f.slotPlain());
  
  }, function (data) {
    async.mapSeries(data.slice(1), function (doc, next) {
      next(null, {
          shortname: doc[0]
        , name: doc[1]
        , address: doc[2]
        , lonlat: [parseFloat(doc[4]), parseFloat(doc[3])]
      });
    }, f.slot());
  
  }).onSuccess(function (stations) {
    next(null, stations);
  
  }).onError(function (e) {
    next(e);
  });
};

// refresh all caltrain data
// this includes all routes + stations, with lonlats (for geoquerying)
module.exports.refresh = function (next) {
  var stations = {};
  var routes = {};
  var stops = {};
  
  var f = ff(function () {
    console.log('caltrain: removing old data');
    Route.remove({ agency: 'caltrain' }, f.wait());
    Station.remove({ agency: 'caltrain' }, f.wait());
    
  }, function () {
    console.log('caltrain: getting stations');
    getStations(f.slot());
    
  }, function (docs) {
    docs.forEach(function (station) {
      stations[station.name] = station;
    });
    
    console.log('caltrain: getting routes');
    my511.getRoutes('Caltrain', f.slot());
    
  }, function (docs) {
    console.log('caltrain: getting stops');
    async.eachSeries(docs, function (route, next) {
      route = new Route({
          agency: 'caltrain'
        , name: route.name
        , code: route.code
        , direction: route.direction
        , dircode: route.dircode
        , stations: []
      });
      
      var g = ff(function () {
        my511.getStops('Caltrain', route.code, route.dircode, g.slot());
        route.save(g.wait());
      
      }, function (docs) {
        routes[route._id.toString()] = route;
        
        docs.forEach(function (stop) {
          if (stops[stop.code]) {
            stops[stop.code].routes.addToSet(route._id);
          } else {
            stops[stop.code] = new Station({
                agency: 'caltrain'
              , name: stop.name
              , code: stop.code
              , address: stations[stop.name].address
              , lonlat: stations[stop.name].lonlat
              , shortname: stations[stop.name].shortname
              , routes: [route._id]
            });
          }
        });
      }).onComplete(next);
    }, f.slot());
  
  }, function () {
    console.log('caltrain: updating routes with stations');
    async.eachSeries(Object.keys(stops), function (key, next) {
      var stop = stops[key];
      stop.save(function () {
        stop.routes.forEach(function (route) {
          routes[route.toString()].stations.addToSet(stop._id);
        });
        next();
      });
    }, f.slot());
    
  }, function () {
    console.log('caltrain: saving routes');
    async.eachSeries(Object.keys(routes), function (key, next) {
      routes[key].save(next);
    }, f.slot());
    
  }).onComplete(function () {
    console.log('caltrain: done!');
    next();
  
  }).onError(function (e) {
    next(e);
  });
};

// gets all departures in the next 90 min for a station name
module.exports.getDeparturesByStation = function (name, next) {
  var routes = [];
  
  var f = ff(function () {
    Station.find({ agency: 'caltrain', name: name }).select('code').lean().exec(f.slot());
  
  }, function (stations) {
    async.eachSeries(stations, function (station, next) {
      my511.getDepartures(station.code, function (err, docs) {
        routes = routes.concat(docs || []);
        next();
      });
    }, f.slot());
  
  }).onComplete(function () {
    next(null, routes.sort(function (a, b) {
      return a.time - b.time;
    }));
  
  }).onError(function (e) {
    next(e);
  });
};