const fs = require('fs');
const path = require('path');
const Location = require('../models/locationModel');
const Phone = require('../models/phoneModel');

exports.seedData = async () => {
  try {
    // load JSON files
    const locations = JSON.parse(
      fs.readFileSync(path.join('dev-data', 'locations_data_final.json')),
    );
    const phones = JSON.parse(
      fs.readFileSync(path.join('dev-data', 'phones_data_final.json')),
    );

    // clear collections first (optional for dev)
    await Location.deleteMany();
    await Phone.deleteMany();

    // insert into DB
    await Location.insertMany(locations);
    await Phone.insertMany(phones);

    console.log('Dev data loaded ✔');
  } catch (err) {
    console.error('Error loading dev data', err);
  }
};
