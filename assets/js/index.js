(function () {

var Map = function () {
  this.stations = [];
  this.latlon = [37.7885284423828, -122.395141601563];
};

Map.prototype.initialize = function () {
  var self = this;
  
  $('#map').gmap3({
      map: {
          options: {
              center: self.latlon
            , zoom: 14
            , mapTypeId: google.maps.ROADMAP
          }
      }
  });
  
  $('#address').autocomplete({
      position: { my: 'center top+5', at: 'center bottom' }
    , source: function (req, res) {
        $('#map').gmap3({
            getaddress: {
                address: req.term
              , callback: function (data) {
                  res(data || []);
                }
            }
        });
      }
    , select: function (event, ui) {
        $('#address').val(ui.item.formatted_address);
        self.latlon = [ui.item.geometry.location.lat(), ui.item.geometry.location.lng()];
        self.recenter(ui.item.geometry.location);
      }
  }).data('ui-autocomplete')._renderItem = function (ul, item) {
    return $('<li/>').append($('<a/>').text(item.formatted_address)).appendTo(ul);
  };
  
  self.geolocate();
  self.getStations();
  
  $('#geolocate').click(function () { self.geolocate(); });
};

Map.prototype.redraw = function () {
  $('#map').gmap3({
      map: {
          options: {
              center: this.latlon
          }
      }
    , marker: {
          values: this.stations.map(function (station) {
            return {
                latLng: [station.latlon[1], station.latlon[0]]
              , data: station
            };
          })
        , events: {
              click: function (marker, event, context) {
                var self = this;
                
                var map = $(self).gmap3('get');
                var infowindow = $(self).gmap3({ get: { name: 'infowindow' } });
                
                var content = _.template($('#infowindow-template').html(), context.data);
                
                if (infowindow) {
                  infowindow.open(map, marker);
                  infowindow.setContent(content);
                } else {
                  $(self).gmap3({
                      infowindow: {
                          anchor: marker
                        , options: { content: content }
                      }
                  });
                }
                
                $.get('/api/agencies/' + context.data.agency + '/departures', {
                    station: context.data.name
                }, function (departures) {
                  context.data.departures = (departures || []).slice(0, 10);
                  content = _.template($('#infowindow-template').html(), context.data);
                  infowindow = $(self).gmap3({ get: { name: 'infowindow' } });
                  infowindow.setContent(content);
                });
              }
          }
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
    self.latlon = [position.coords.latitude, position.coords.longitude];
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