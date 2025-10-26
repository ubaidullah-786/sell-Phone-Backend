const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { seedData } = require('./utils/seedData');

dotenv.config({ path: './config.env' });

const app = require('./app');
const { initSocket } = require('./socketServer');

// const localDB = process.env.DATABASE_LOCAL;
const db = process.env.DATABASE.replace(
  '<db_password>',
  process.env.DATABASE_PASSWORD,
);

(async () => {
  try {
    await mongoose.connect(db);
    console.log('Database connection successful...');
    // await seedData();

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
