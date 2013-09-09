var RouteSchema = new mongoose.Schema({
    agency: String
  , name: String
  , code: String
  , stations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Station' }]
});

RouteSchema.index({ agency: 1, code: 1 });

mongoose.model('Route', RouteSchema);