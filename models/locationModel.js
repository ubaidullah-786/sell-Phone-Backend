const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
  city: { type: String, required: true },
  groups: { type: Object, required: true },
});

const Location = mongoose.model('Location', locationSchema);
module.exports = Location;
