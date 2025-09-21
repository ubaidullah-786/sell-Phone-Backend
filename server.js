const mongoose = require('mongoose');
const dotenv = require('dotenv');

// process.on('uncaughtException', err => {
//   console.log('UNCAUGHT EXCEPTION!💥 Shutting down...');
//   console.log(err.name, err.message);
//   process.exit(1);
// });

dotenv.config({ path: './config.env' });

const app = require('./app');

const localDB = process.env.DATABASE_LOCAL;
// const db = process.env.DATABASE.replace(
//   '<db_password>',
//   process.env.DATABASE_PASSWORD,
// );

(async () => {
  try {
    await mongoose.connect(localDB);
    console.log('Database connection successful...');
  } catch (err) {
    console.error(`Connection error: ${err}`);
  }
})();

// mongoose.connect(db).then(console.log('connection succesfull'));

const port = process.env.PORT || 5000;
const server = app.listen(port, () => {
  console.log(`App running on port ${port}`);
});

process.on('unhandledRejection', err => {
  console.log('UNHANDLED REJECTION!💥 Shutting down...');
  console.log(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});
