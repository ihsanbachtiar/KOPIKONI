// =============================
// Import module bawaan
// =============================
const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const session = require('express-session');
const db = require('./config/db');

// =============================
// Import routes
// =============================
const indexRouter = require('./routes/index');
const usersRouter = require('./routes/users');
const authRouter = require('./routes/auth'); // router login & register
const adminRouter = require('./routes/admin'); 
const orderRouter = require('./routes/order');
const menuRouter = require('./routes/menu'); // Router untuk keranjang

// =============================
// Inisialisasi app
// =============================
const app = express();

// =============================
// View engine setup
// =============================
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// =============================
// Middleware umum
// =============================
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// =============================
// == PERBAIKAN DI SINI ==
// Membuat file AOS dari node_modules bisa diakses oleh browser
// di URL '/vendor/aos'
// =============================
app.use('/vendor/aos', express.static(path.join(__dirname, 'node_modules/aos/dist')));

// =============================
// Konfigurasi session
// =============================
app.use(session({
  secret: 'kopikoni_secret_key', 
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 1000 * 60 * 60 * 24, // 1 hari
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' 
  } 
}));

// =============================
// Middleware Global - Injeksi User ke EJS
// =============================
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// =============================
// Gunakan router
// =============================
app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/auth', authRouter); 
app.use('/admin', adminRouter); 
app.use('/order', orderRouter);
app.use('/menu', menuRouter);

// =============================
// Tangani error 404
// =============================
app.use(function (req, res, next) {
  next(createError(404));
});

// =============================
// Tangani error umum
// =============================
app.use(function (err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;

