var async = require('async');
var cheerio = require('cheerio');
var ff = require('ff');
var helpers = require('./');
var request = require('request');
var resolve = require('url').resolve;
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
          })
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

// gets all BART routes using the my511.org api
var getRoutes = function (next) {
  var $;
  var routes = [];
  
  request.get('http://services.my511.org/Transit2.0/GetRoutesForAgency.aspx?agencyName=BART&token=' + config.my511, function (e, r, body) {
    if (e) { return next(e); }
    
    $ = cheerio.load(body, { lowerCaseTags: true, lowerCaseAttributeNames: true, xmlMode: true });
    
    $('routelist > route').each(function (route) {
      routes.push({
          name: $(this).attr('name')
        , code: $(this).attr('code')
      });
    });
    
    next(null, routes);
  });
};

// gets all BART stops for the given route using the my511.org api
var getStops = function (code, next) {
  var $;
  var stops = [];
  
  request.get('http://services.my511.org/Transit2.0/GetStopsForRoute.aspx?routeIDF=BART~' + code + '&token=' + config.my511, function (e, r, body) {
    if (e) { return next(e); }
    
    $ = cheerio.load(body, { lowerCaseTags: true, lowerCaseAttributeNames: true, xmlMode: true });
    
    $('stoplist > stop').each(function () {
      stops.push({
          name: $(this).attr('name')
        , code: $(this).attr('stopcode')
      });
    });
    
    next(null, stops);
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
    getRoutes(f.slot());
  
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
        console.log('bart: getting stops: route ' + route.code);
        getStops(route.code, g.slot());
        route.save(g.slot());
      
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
    async.eachSeries(Object.keys(routes), function (key, next) {
      routes[key].save(next);
    }, f.slot());
  
  }).onSuccess(function () {
    next();
  
  }).onError(function (e) {
    next(e);
  });
};

// gets all departures in the next 90 min for a station code
var getDepartures = module.exports.getDepartures = function (code, next) {
  var $;
  var codes = [];
  var routes = [];
  
  var f = ff(function () {
    request.get('http://services.my511.org/Transit2.0/GetNextDeparturesByStopCode.aspx?stopCode=' + code + '&token=acd9b06a-8d4c-453f-99f9-e90ae408f4ff', f.slotMulti(2));
  
  }, function (r, body) {
    $ = cheerio.load(body, { lowerCaseTags: true, lowerCaseAttributeNames: true, xmlMode: true });
    
    $('route').each(function () {
      var route = {
          code: $(this).attr('code')
        , name: $(this).attr('name')
        , times: []
      };
      
      codes.push(route.code);
      
      $(this).find('departuretime').each(function () {
        route.times.push($(this).text());
      });
      
      routes.push(route);
    });
    
    Route.find({ code: { $in: codes }}).select('_id code').lean().exec(f.slot());
  
  }, function (docs) {
    var docsMap = {}
    docs.forEach(function (doc) {
      docsMap[doc.code] = doc;
    });
    routes = routes.filter(function (route) {
      return docsMap[route.code];
    });
    routes.forEach(function (route) {
      route._id = route.id = docsMap[route.code]._id;
    });
    
  }).onSuccess(function () {
    next(null, routes.filter(function (route) {
      return route.times.length;
    }).reduce(function (p, route) {
      return p.concat(route.times.map(function (time) {
        return {
            _id: route._id
          , code: route.code
          , name: route.name
          , time: time
        }
      }));
    }, []).sort(function (a, b) {
      return a.time - b.time;
    }));
  
  }).onError(function (e) {
    next(e);
  });
};

// gets all departures in the next 90 min for a station name
var getDeparturesByStation = module.exports.getDeparturesByStation = function (name, next) {
  var routes = [];
  
  var f = ff(function () {
    Station.find({ agency: 'bart', name: name }).select('code').lean().exec(f.slot());
  
  }, function (stations) {
    async.eachSeries(stations, function (station, next) {
      getDepartures(station.code, function (err, docs) {
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