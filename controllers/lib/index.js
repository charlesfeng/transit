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