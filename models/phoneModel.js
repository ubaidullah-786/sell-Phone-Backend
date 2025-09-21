const mongoose = require('mongoose');

const phoneSchema = new mongoose.Schema({
  brand: { type: String, required: true },
  models: [String],
});

const Phone = mongoose.model('Phone', phoneSchema);
module.exports = Phone;
