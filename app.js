const fs = require('fs');
const path = require('path');
const express = require('express');
const morgan = require('morgan');
const userRouter = require('./routes/userRoutes');
const adRouter = require('./routes/adRoutes.js');
const phoneRouter = require('./routes/phoneRoutes');
const locationRouter = require('./routes/locationRoutes');
const AppError = require('./utils/appError');
const globalErrorHandler = require('./controllers/errorController');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');

const app = express();

app.use(helmet());

if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));

const limiter = rateLimit({
  max: 100,
  windowMs: 60 * 60 * 1000,
  message: 'Too many requests from that ip. Please try again later',
});

app.use('/api', limiter);

app.use(express.json({ limit: '10kb' }));

app.use((req, res, next) => {
  mongoSanitize.sanitize(req.body, { replaceWith: '_' });
  mongoSanitize.sanitize(req.params, { replaceWith: '_' });
  mongoSanitize.sanitize(req.query, { replaceWith: '_' });
  next();
});

const uploadPath = path.join(process.cwd(), 'uploads/ads');
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

app.use('/api/v1/users', userRouter);
app.use('/api/v1/ads', adRouter);
app.use('/api/v1/phones', phoneRouter);
app.use('/api/v1/locations', locationRouter);

app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use(globalErrorHandler);

module.exports = app;
