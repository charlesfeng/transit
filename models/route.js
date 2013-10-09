var RouteSchema = new mongoose.Schema({
    agency: String
  , name: String
  , code: String
  , direction: String
  , dircode: String
  , stations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Station' }]
});

RouteSchema.index({ agency: 1, code: 1 });
RouteSchema.index({ agency: 1, stations: 1, 'schedule.start': 1, 'schedule.end': 1 });

mongoose.model('Route', RouteSchema);