//= require jquery.js
//= require jquery-ui.js
//= require underscore.js
//= require gmap3.js

(function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
(i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
})(window,document,'script','//www.google-analytics.com/analytics.js','ga');

ga('create', 'UA-36765833-2', 'charles.io');
ga('send', 'pageview');

(function () {

var stations = [];
var numRequests = 0;
var latlng;

var mapIcons = {
    'bart': new google.maps.MarkerImage('/images/marker-blue.png', null, null, null, new google.maps.Size(20, 36))
  , 'caltrain': new google.maps.MarkerImage('/images/marker-red.png', null, null, null, new google.maps.Size(20, 36))
  , 'user': new google.maps.MarkerImage('/images/marker-green.png', null, null, null, new google.maps.Size(20, 36))
};

var redraw = function () {
  $('#map').gmap3('clear', 'markers').gmap3({
      map: {
          options: {
              center: latlng
          }
      }
    , marker: {
          values: stations.map(function (station) {
            return {
                latLng: [station.lonlat[1], station.lonlat[0]]
              , data: station
              , options: { icon: mapIcons[station.agency] }
            };
          }).concat([{
              latLng: latlng
            , data: null
            , options: { icon: mapIcons['user'] }
          }])
        , events: {
              click: function (marker, event, context) {
                if (!context.data) return;

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

var setLatLng = function (ll) {
  latlng = ll;
  numRequests++;
  var currRequest = numRequests;
  
  $.get('/api/departures', {
      lat: latlng[0]
    , lng: latlng[1]
  }, function (departures) {
    if (currRequest !== numRequests) { return; }
    
    $('#departures').html('');
    departures.caltrain.concat(departures.bart).forEach(function (departure) {
      $('#departures').append(_.template($('#sidebar-template').html(), departure));
    });
  });
};

var recenter = function (center) {
  $('#map').gmap3('get').setCenter(center);
  redraw();
};

var geolocate = function () {
  if (!navigator || !navigator.geolocation) return;
  
  navigator.geolocation.getCurrentPosition(function (position) {
    setLatLng([position.coords.latitude, position.coords.longitude]);
    recenter(new google.maps.LatLng(position.coords.latitude, position.coords.longitude));
    
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

var getStations = function () {
  $.get('/api/stations', function (docs) {
    stations = docs;
    redraw();
  });
};

setLatLng([37.7885284423828, -122.395141601563]);

$('#map').gmap3({
    map: {
        options: {
            center: latlng
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
      setLatLng(ui.item.latlng);
      recenter(ui.item.geo);
      $('#address').blur();
      $('#address').val(ui.item.label);
    }
});

geolocate();
getStations();

$('#geolocate').click(function () { geolocate(); });

}());