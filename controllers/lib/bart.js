var async = require('async');
var cheerio = require('cheerio');
var ff = require('ff');
var helpers = require('./');
var request = require('request');
var resolve = require('url').resolve;

// scrapes the bart stations list to get each station's address (which 511 doesn't provide)
// does this by GETting the stations list page, finding all station urls, GETting each url,
// scraping the address from each url, then geocoding the address usinb bing maps
var getStations = module.exports.getStations = function (next) {
  var stations = [];
  var url = 'http://www.bart.gov/stations/index.aspx';
  
  var f = ff(function () {
    request.get(url, f.slotMulti(2));
  
  }, function (r, body) {
    var $ = cheerio.load(body, { lowerCaseTags: true, lowerCaseAttributeNames: true });
    var stations = [];
    
    $('#stations-directory a').each(function () {
      stations.push({
          name: $(this).text().replace('Bay Fair', 'Bayfair')
        , url: resolve(url, $(this).attr('href'))
      });
    });
    
    async.mapSeries(stations, function (station, next) {
      console.log(station)
      if (station.url.match(/sfia/)) {
        helpers.geocode('SFO', function (e, lonlat) {
          station.lonlat = lonlat;
          next(null, station);
        });
      } else {
        request.get(station, function (e, r, body) {
          var $ = cheerio.load(body, { lowerCaseTags: true, lowerCaseAttributeNames: true });
          var address = $('#subheader .subtitle').text().replace('/', ',');
          helpers.geocode(address, function (e, lonlat) {
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
var getRoutes = module.exports.getRoutes = function (next) {
  var f = ff(function () {
    request.get('http://services.my511.org/Transit2.0/GetRoutesForAgency.aspx?agencyName=BART&token=' + config.my511, f.slotMulti(2));
  
  }, function (r, body) {
    
  });
};

// gets all BART stops for the given route using the my511.org api
var getStops = module.exports.getStops = function (code, next) {
  
}