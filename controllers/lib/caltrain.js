var async = require('async');
var csv = require('csv');
var ff = require('ff');
var moment = require('moment');
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
          agency: 'caltrain'
        , name: doc[0]
        , code: doc[0]
        , address: doc[2]
        , lonlat: [parseFloat(doc[4]), parseFloat(doc[3])]
        , routes: []
      });
    }, f.slot());
  
  }).onSuccess(function (stations) {
    next(null, stations);
  
  }).onError(function (e) {
    next(e);
  });
};

// gets all caltrain routes w/ times @ associated stations
var getRoutes = function (next) {
  var trips = {};
  var routes = [];
  
  var f = ff(function () {
    csv()
      .from.path(__dirname + '/../../data/caltrain-trips.txt')
      .to.array(f.slotPlain());
  
  }, function (data) {
    data.slice(1).forEach(function (trip) {
      trips[trip[0]] = trip;
    });
    
    csv()
      .from.path(__dirname + '/../../data/caltrain-times.txt')
      .to.array(f.slotPlain());
  
  }, function (data) {
    routes = data.slice(1).reduce(function (p, c) {
      var time = moment(c[1], 'hh:mm:ss') - moment('00:00:00', 'hh:mm:ss');
      var station = c[3];
      
      if (p.length && p[p.length - 1].trip === c[0].slice(0, 3)) {
        p[p.length - 1].stops.push({
            time: time
          , station: station
        });
      } else {
        p.push({
            trip: c[0].slice(0, 3)
          , direction: trips[c[0]][4] === 'San Francisco' ? 'NB' : 'SB'
          , type: trips[c[0]][3].slice(0, 2)
          , stops: [{
                time: time
              , station: station
            }]
        });
      }
      
      return p;
    }, []);
  
  }).onSuccess(function () {
    next(null, routes);
  
  }).onError(function (e) {
    next(e);
  });
};

module.exports.refresh = function (next) {
  var stations = {};
  var routes;
  
  var f = ff(function () {
    console.log('caltrain: removing old data');
    Route.remove({ agency: 'caltrain' }, f.wait());
    Station.remove({ agency: 'caltrain' }, f.wait());
    
  }, function () {
    console.log('caltrain: getting stations + routes');
    getStations(f.slot());
    getRoutes(f.slot());
  
  }, function (docs1, docs2) {
    routes = docs2;
    
    console.log('caltrain: saving stations');
    async.mapSeries(docs1, function (doc, next) {
      new Station(doc).save(function (err, station) {
        stations[station.name] = station;
        next();
      });
    }, f.slot());
    
  }, function () {
    var days = {
        'WD': [1, 2, 3, 4, 5]
      , 'WE': [0, 6]
      , 'ST': [6]
    }
    
    async.eachSeries(routes, function (route, next) {
      var times = {}
      route.stops.forEach(function (stop) {
        times[stations[stop.station]._id.toString()] = stop.time;
      });
      
      new Route({
          agency: 'caltrain'
        , name: route.trip + ' ' + route.direction
        , code: route.trip
        , schedule: {
              start: route.stops[0].time
            , end: route.stops.slice(-1)[0].time
            , days: days[route.type]
            , times: times
          }
        , stations: route.stops.map(function (stop) {
            return stations[stop.station]._id;
          })
      }).save(function (err, doc) {
        route.stops.forEach(function (stop) {
          stations[stop.station].routes.addToSet(doc._id);
        })
        next();
      })
    }, f.slot());
    
  }, function () {
    async.eachSeries(Object.keys(stations), function (key, next) {
      stations[key].save(next);
    }, f.slot());
  
  }).onComplete(function () {
    next();
  
  }).onError(function (e) {
    next(e);
  });
};

// gets departures for a specific station name (with direction)
// the time parameter is optional
var getDeparturesByStation = module.exports.getDeparturesByStation = function (name, date, next) {
  if (!next) {
    next = date;
    date = moment();
  } else {
    date = moment(date);
  }
  
  var station;
  var time = date.valueOf() - date.clone().startOf('day').valueOf();
  var day = date.day();
  var departures = [];
  
  var f = ff(function () {
    Station.findOne({ name: name }).select('_id').lean().exec(f.slot());
  
  }, function (doc) {
    if (!doc) { return f.fail('station not found'); }
    station = doc._id.toString();

    Route.find({ agency: 'caltrain', stations: station, 'schedule.start': { $lte: time }, 'schedule.end': { $gt: time }, 'schedule.days': day }).lean().exec(f.slot());
  
  }, function (routes) {
    routes.forEach(function (route) {
      if (!route.schedule.times[station] || route.schedule.times[station] <= time) { return; }
      
      var lastStop = Object.keys(route.schedule.times).reduce(function (p, key) {
        return !p || route.schedule.times[key] > route.schedule.times[p] ? key : p;
      }, null);
      
      departures.push({
          time: Math.floor((route.schedule.times[station] - time) / (1000 * 60))
        , name: route.name
        , lastStop: lastStop
        , lastTime: moment().startOf('day').add('milliseconds', route.schedule.times[lastStop]).format('h:mm a')
      });
    });
    
    departures.sort(function (a, b) {
      return a.time - b.time;
    });
    
  }, function () {
    async.mapSeries(departures, function (departure, next) {
      Station.findOne({ _id: departure.lastStop }).select('name').lean().exec(function (err, station) {
        departure.lastStop = station.name;
        next(null, departure);
      });
    }, f.slot());
  
  }).onSuccess(function (departures) {
    next(null, departures);
  
  }).onError(function (e) {
    next(e);
  });
};