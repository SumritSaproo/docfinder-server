const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
  name:       { type: String, required: true },
  specialty:  { type: String, required: true },
  city:       { type: String, required: true },
  phone:      { type: String, default: 'Not listed' },
  fee:        { type: Number, default: 0 },
  experience: { type: Number, default: 0 },
  rating:     { type: Number, default: 0 },
  reviews:    { type: Number, default: 0 },
  available:  { type: Boolean, default: true },
  emoji:      { type: String, default: '👨‍⚕️' },
  bio:        { type: String, default: '' }
});

module.exports = mongoose.model('Doctor', doctorSchema);
