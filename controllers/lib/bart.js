var async = require('async');
var cheerio = require('cheerio');
var ff = require('ff');
var helpers = require('./');
var request = require('request');
var resolve = require('url').resolve;
var my511 = require('./my511');
var Route = mongoose.model('Route');
var Station = mongoose.model('Station');

// scrapes the bart stations list to get each station's address (which 511 doesn't provide)
// does this by GETting the stations list page, finding all station urls, GETting each url,
// scraping the address from each url, then geocoding the address using bing maps
var getStations = function (next) {
  var $;
  var stations = [];
  var url = 'http://www.bart.gov/stations/index.aspx';
  
  var f = ff(function () {
    request.get(url, f.slotMulti(2));
  
  }, function (r, body) {
    $ = cheerio.load(body, { lowerCaseTags: true, lowerCaseAttributeNames: true });
    var stations = [];
    
    $('#stations-directory a').each(function () {
      stations.push({
          name: $(this).text().replace('Bay Fair', 'Bayfair').replace('/UN Plaza', '').replace(' del ', ' Del ')
        , url: resolve(url, $(this).attr('href'))
      });
    });
    
    async.mapSeries(stations, function (station, next) {
      console.log('bart: getting stations: ' + station.name);
      station.shortname = station.url.split('/').slice(-2)[0];
      if (station.url.match(/sfia/)) {
        station.address = 'SFO';
        helpers.geocode(station.address, function (e, lonlat) {
          station.lonlat = lonlat;
          next(null, station);
        });
      } else {
        request.get(station.url, function (e, r, body) {
          var $ = cheerio.load(body, { lowerCaseTags: true, lowerCaseAttributeNames: true });
          station.address = $('#subheader .subtitle').text().replace('/', ',');
          helpers.geocode(station.address, function (e, lonlat) {
            station.lonlat = lonlat;
            next(null, station);
          });
        });
      }
    }, f.slot());
  
  }).onSuccess(function (stations) {
    if (!stations || !stations.length) { return next('no stations found'); }
    next(null, stations);
    
  }).onError(function (e) {
    next(e);
  });
};

// refresh all bart data
// this includes all routes + stations, with lonlats (for geoquerying)
module.exports.refresh = function (next) {
  var stations = {};
  var routes = {};
  var stops = {};
  
  var f = ff(function () {
    console.log('bart: removing old data');
    Route.remove({ agency: 'bart' }, f.wait());
    Station.remove({ agency: 'bart' }, f.wait());
  
  }, function () {
    console.log('bart: getting stations');
    getStations(f.slot());
    
  }, function (docs) {
    docs.forEach(function (station) {
      stations[station.name] = station;
    });
    
    console.log('bart: getting routes');
    my511.getRoutes('BART', f.slot());
  
  }, function (docs) {
    console.log('bart: getting stops');
    async.eachSeries(docs, function (route, next) {
      route = new Route({
          agency: 'bart'
        , name: route.name
        , code: route.code
        , stations: []
      });
      
      var g = ff(function () {
        my511.getStops('BART', route.code, null, g.slot());
        route.save(g.wait());
      
      }, function (docs) {
        routes[route._id.toString()] = route;
        
        docs.forEach(function (stop) {
          if (stops[stop.code]) {
            stops[stop.code].routes.addToSet(route._id);
          } else {
            stops[stop.code] = new Station({
                agency: 'bart'
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
    console.log('bart: updating routes with stations');
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
    console.log('bart: saving routes');
    async.eachSeries(Object.keys(routes), function (key, next) {
      routes[key].save(next);
    }, f.slot());
  
  }).onSuccess(function () {
    console.log('bart: done!');
    next();
  
  }).onError(function (e) {
    next(e);
  });
};

// gets all departures in the next 90 min for a station name
module.exports.getDeparturesByStation = function (name, next) {
  var routes = [];
  
  var f = ff(function () {
    Station.find({ agency: 'bart', name: name }).select('code').lean().exec(f.slot());
  
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
