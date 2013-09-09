var StationSchema = new mongoose.Schema({
    agency: String
  , name: String
  , code: String
  , routes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Route' }]
});

StationSchema.index({ agency: 1, code: 1 });

mongoose.model('Station', StationSchema);