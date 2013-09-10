(function () {

var Map = function () {
  this.stations = [];
  this.setLatLng([37.7885284423828, -122.395141601563]);
  this.numRequests = 0;
};

Map.prototype.initialize = function () {
  var self = this;
  
  $('#map').gmap3({
      map: {
          options: {
              center: self.latlng
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
                  res((data || []).slice(0, 5).map(function (data) {
                    return {
                        label: data.formatted_address
                      , latlng: [data.geometry.location.lat(), data.geometry.location.lng()]
                      , geo: data.geometry.location
                    };
                  }));
                }
            }
        });
      }
    , select: function (event, ui) {
        self.setLatLng(ui.item.latlng);
        self.recenter(ui.item.geo);
        $('#address').blur();
        $('#address').val(ui.item.label);
      }
  });
  
  self.geolocate();
  self.getStations();
  
  $('#geolocate').click(function () { self.geolocate(); });
};

Map.prototype.setLatLng = function (latlng) {
  var self = this;
  
  self.latlng = latlng;
  self.numRequests++;
  var currRequest = self.numRequests;
  
  $.get('/api/departures', {
      lat: latlng[0]
    , lng: latlng[1]
  }, function (departures) {
    if (currRequest !== self.numRequests) { return; }
    
    $('#departures').html('');
    departures.caltrain.forEach(function (departure) {
      $('#departures').append(_.template($('#sidebar-template').html(), departure));
    });
    departures.bart.forEach(function (departure) {
      $('#departures').append(_.template($('#sidebar-template').html(), departure));
    });
  });
};

Map.prototype.redraw = function () {
  $('#map').gmap3({
      map: {
          options: {
              center: this.latlng
          }
      }
    , marker: {
          values: this.stations.map(function (station) {
            return {
                latLng: [station.lonlat[1], station.lonlat[0]]
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
    self.setLatLng([position.coords.latitude, position.coords.longitude]);
    self.recenter(new google.maps.LatLng(position.coords.latitude, position.coords.longitude));
    
    $('#map').gmap3({
        getaddress: {
            latLng: new google.maps.LatLng(position.coords.latitude, position.coords.longitude)
          , callback: function (data) {
              if (data.length) { $('#address').val(data[0].formatted_address); }
            }
        }
    });
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