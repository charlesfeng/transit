var cheerio = require('cheerio');
var ff = require('ff');
var request = require('request');
var Route = mongoose.model('Route');

// gets all routes using the my511.org api
module.exports.getRoutes = function (agency, next) {
  var $;
  var routes = [];
  
  request.get('http://services.my511.org/Transit2.0/GetRoutesForAgency.aspx?agencyName=' + agency + '&token=' + config.my511, function (e, r, body) {
    if (e) { return next(e); }
    
    $ = cheerio.load(body, { lowerCaseTags: true, lowerCaseAttributeNames: true, xmlMode: true });
    
    $('routelist > route').each(function () {
      var self = this;
      if ($(self).find('routedirection').length) {
        $(self).find('routedirection').each(function () {
          routes.push({
              name: $(self).attr('name')
            , code: $(self).attr('code')
            , direction: $(this).attr('name')
            , dircode: $(this).attr('code')
          });
        });
      } else {
        routes.push({
            name: $(this).attr('name')
          , code: $(this).attr('code')
        });
      }
    });
    
    next(null, routes);
  });
};

// gets all stops for the given route using the my511.org api
module.exports.getStops = function (agency, code, direction, next) {
  var $;
  var stops = [];
  
  request.get('http://services.my511.org/Transit2.0/GetStopsForRoute.aspx?routeIDF=' + [agency, code, direction].filter(function (v) { return v; }).join('~') + '&token=' + config.my511, function (e, r, body) {
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

// gets all departures in the next 90 min for a station code
module.exports.getDepartures = function (code, next) {
  var $;
  var codes = [];
  var routes = [];
  
  var f = ff(function () {
    request.get('http://services.my511.org/Transit2.0/GetNextDeparturesByStopCode.aspx?stopCode=' + code + '&token=' + config.my511, f.slotMulti(2));
  
  }, function (r, body) {
    $ = cheerio.load(body, { lowerCaseTags: true, lowerCaseAttributeNames: true, xmlMode: true });
    
    $('route').each(function () {
      var self = this;
      if ($(self).find('routedirection').length) {
        $(self).find('routedirection').each(function () {
          var route = {
              name: $(self).attr('name')
            , code: $(self).attr('code')
            , direction: $(this).attr('name')
            , dircode: $(this).attr('code')
            , times: []
          };
          codes.push(route.code);
          $(this).find('departuretime').each(function () {
            route.times.push($(this).text());
          });
          routes.push(route);
        });
        
      } else {
        var route = {
            name: $(this).attr('name')
          , code: $(this).attr('code')
          , times: []
        };
        codes.push(route.code);
        $(this).find('departuretime').each(function () {
          route.times.push($(this).text());
        });
        routes.push(route);
      }
    });
    
    Route.find({ code: { $in: codes }}).select('_id code direction dircode').lean().exec(f.slot());
  
  }, function (docs) {
    var docsMap = {}
    docs.forEach(function (doc) {
      docsMap[doc.code + (doc.dircode || '')] = doc;
    });
    routes = routes.filter(function (route) {
      return docsMap[route.code + (route.dircode || '')];
    });
    routes.forEach(function (route) {
      route._id = route.id = docsMap[route.code + (route.dircode || '')]._id;
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
          , direction: route.direction
          , dircode: route.dircode
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