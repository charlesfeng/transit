var StationSchema = new mongoose.Schema({
    agency: String
  , name: String
  , code: String
  , address: String
  , lonlat: [Number]
  , routes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Route' }]
});

StationSchema.index({ agency: 1, code: 1 });
StationSchema.index({ lonlat: '2dsphere' });

mongoose.model('Station', StationSchema);