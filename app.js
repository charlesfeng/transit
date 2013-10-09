// set up express app
var express = require('express');
var app = express();

app.set('trust proxy', true);
app.set('view engine', 'jade');
app.set('views', __dirname + '/views');

app.use(express.logger());
app.use(express.cookieParser());
app.use(express.bodyParser());
app.use(express.static(__dirname + '/public'));

// load config
global.config = require('./config/config.json');

// bootstrap session (in case we need this later)
var MongoStore = require('connect-mongo')(express);
app.use(express.session({
    secret: 'Lw400ZwV6Z0q0AOW'
  , store: new MongoStore({ url: config.db })
  , cookie: { maxAge: 604800000 }
}));

// load assets middleware
app.use(require('connect-assets')());

// connect to mongodb
global.mongoose = require('mongoose').connect(config.db);

// bootstrap models
require('./models');

// bootstrap controllers
require('./controllers')(app);

// start listening on port 8000
app.listen(process.env.PORT || 8000, function () {
  console.log('listening on port ' + (process.env.PORT || 8000));
});