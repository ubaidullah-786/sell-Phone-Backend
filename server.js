const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { seedData } = require('./utils/seedData');

// process.on('uncaughtException', err => {
//   console.log('UNCAUGHT EXCEPTION!💥 Shutting down...');
//   console.log(err.name, err.message);
//   process.exit(1);
// });

dotenv.config({ path: './config.env' });

const app = require('./app');
const { initSocket } = require('./socketServer');

const localDB = process.env.DATABASE_LOCAL;

(async () => {
  try {
    await mongoose.connect(localDB);
    console.log('Database connection successful...');
    await seedData();

    const port = process.env.PORT || 5000;
    const server = app.listen(port, () => {
      console.log(`App running on port ${port}`);
    });

    initSocket(server);
  } catch (err) {
    console.error(`Connection error: ${err}`);
  }
})();

process.on('unhandledRejection', err => {
  console.log('UNHANDLED REJECTION!💥 Shutting down...');
  console.log(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});
