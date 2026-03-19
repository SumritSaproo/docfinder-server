const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
  name:       { type: String, required: true, index: true },
  specialty:  { type: String, required: true, index: true },
  city:       { type: String, required: true, index: true },
  phone:      { type: String, default: 'Not listed' },
  fee:        { type: Number, default: 0 },
  experience: { type: Number, default: 0 },
  rating:     { type: Number, default: 0, index: true },
  reviews:    { type: Number, default: 0 },
  available:  { type: Boolean, default: true, index: true },
  emoji:      { type: String, default: '👨‍⚕️' },
  bio:        { type: String, default: '' }
});

// Create a compound index for common multi-field queries
doctorSchema.index({ specialty: 1, city: 1, rating: -1 });

module.exports = mongoose.model('Doctor', doctorSchema);
