(function () {

var Map = function () {
  this.stations = [];
  this.lonlat = [37.7885284423828, -122.395141601563];
};

Map.prototype.initialize = function () {
  var self = this;
  
  $('#map').gmap3({
      map: {
          options: {
              center: this.lonlat
            , zoom: 14
            , mapTypeId: google.maps.ROADMAP
          }
      }
  });
  
  this.geolocate();
  this.getStations();
  
  $('#nav-search').click(function () { self.search(); });
  $('#nav-geolocate').click(function () { self.geolocate(); });
};

Map.prototype.redraw = function () {
  $('#map').gmap3({
      map: {
          options: {
              center: this.lonlat
          }
      }
    , marker: {
          values: this.stations.map(function (station) {
            return {
                latLng: [station.lonlat[1], station.lonlat[0]]
            };
          })
      }
  });
};

Map.prototype.recenter = function (center) {
  $('#map').gmap3('get').setCenter(center);
  this.redraw();
};

Map.prototype.geolocate = function () {
  var self = this;
  if (!navigator || !navigator.geolocation) return;
  
  navigator.geolocation.getCurrentPosition(function (position) {
    self.lonlat = [position.coords.latitude, position.coords.longitude];
    self.recenter(new google.maps.LatLng(position.coords.latitude, position.coords.longitude));
  });
};

Map.prototype.getStations = function () {
  var self = this;
  $.get('/api/stations', function (stations) {
    self.stations = stations;
    self.redraw();
  });
};

var map = new Map();
map.initialize();

}());