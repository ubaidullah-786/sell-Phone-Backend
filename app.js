const fs = require('fs');
const path = require('path');
const express = require('express');
const morgan = require('morgan');
const userRouter = require('./routes/userRoutes');
const adRouter = require('./routes/adRoutes.js');
const phoneRouter = require('./routes/phoneRoutes');
const locationRouter = require('./routes/locationRoutes');
const favoriteRouter = require('./routes/favoriteRoutes');
const chatRouter = require('./routes/chatRoutes');
const AppError = require('./utils/appError');
const globalErrorHandler = require('./controllers/errorController');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const cors = require('cors');

const app = express();

app.use(
  cors({
    origin: ['http://localhost:3001', 'http://127.0.0.1:3001'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

app.use(helmet());

if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));

const limiter = rateLimit({
  max: 130,
  windowMs: 60 * 60 * 1000,
  message: 'Too many requests from that ip. Please try again later',
});

// app.use('/api', limiter);

app.use(express.json({ limit: '10kb' }));

app.use((req, res, next) => {
  mongoSanitize.sanitize(req.body, { replaceWith: '_' });
  mongoSanitize.sanitize(req.params, { replaceWith: '_' });
  mongoSanitize.sanitize(req.query, { replaceWith: '_' });
  next();
});

const imagePath = path.join(process.cwd(), 'public/uploads/ads');
if (!fs.existsSync(imagePath)) {
  fs.mkdirSync(imagePath, { recursive: true });
}

const photoPath = path.join(process.cwd(), 'public/uploads/users');
if (!fs.existsSync(photoPath)) {
  fs.mkdirSync(photoPath, { recursive: true });
}

app.use(express.static('public'));

app.use('/api/v1/users', userRouter);
app.use('/api/v1/ads', adRouter);
app.use('/api/v1/phones', phoneRouter);
app.use('/api/v1/locations', locationRouter);
app.use('/api/v1/favorites', favoriteRouter);
app.use('/api/v1/chats', chatRouter);

app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use(globalErrorHandler);

module.exports = app;
