var ff = require('ff');
var request = require('request');

// uses the bing geocoder api to find a [lon, lat] array associated with a street address
var geocode = module.exports.geocode = function (address, next) {
  request('http://dev.virtualearth.net/REST/v1/Locations?q=' + encodeURIComponent(address) + '&key=' + config.bing, function (e, r, body) {
    if (!body) { return next('no response'); }
  
    try { body = JSON.parse(body); }
    catch (e) { return next(e); }
    
    if (body && body.resourceSets && body.resourceSets[0] && body.resourceSets[0].resources && body.resourceSets[0].resources[0] && body.resourceSets[0].resources[0].geocodePoints && body.resourceSets[0].resources[0].geocodePoints[0] && body.resourceSets[0].resources[0].geocodePoints[0].coordinates) {
      return next(null, [body.resourceSets[0].resources[0].geocodePoints[0].coordinates[1], body.resourceSets[0].resources[0].geocodePoints[0].coordinates[0]]);
    }
    
    next('no results');
  });
};

// calculates haversine distance (in miles) between a[lon,lat] and b[lon,lat]
var diffLonLat = module.exports.diffLonLat = function (a, b) {
  var DEG = Math.PI / 180;
  var R = 3959;
  var dLon = (b[0] - a[0]) * DEG;
  var dLat = (b[1] - a[1]) * DEG;
  var c = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(a[1] * DEG) * Math.cos(b[1] * DEG);
  return R * 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
};