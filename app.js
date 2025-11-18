const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const session = require('express-session');
const db = require('./config/db'); // Pastikan ini sudah terhubung dan diekspor dengan benar
const flash = require('connect-flash'); // <<< Import connect-flash

// Import semua router
const indexRouter = require('./routes/index');
const usersRouter = require('./routes/users');
const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');
const orderRouter = require('./routes/order'); // <<< Router yang menggunakan req.flash
const menuRouter = require('./routes/menu');

// Inisialisasi app
// =============================
const app = express();

// Konfigurasi View Engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Middleware umum
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Menyediakan file AOS statis dari node_modules
app.use('/vendor/aos', express.static(path.join(__dirname, 'node_modules/aos/dist')));


// ===============================================
// === PENTING: URUTAN MIDDLEWARE BERIKUT INI ===
// ===============================================

// 1. Konfigurasi Session (HARUS SEBELUM connect-flash)
app.use(session({
  secret: 'kopikoni_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24, // 24 jam
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' // Gunakan HTTPS di production
  }
}));

// 2. Konfigurasi Flash Messages (HARUS SETELAH session)
app.use(flash()); // <<< Ditempatkan di sini!

// 3. Middleware untuk membuat flash messages tersedia di semua template EJS (HARUS SETELAH app.use(flash()))
//    Juga tempatkan res.locals.user di sini agar lebih terpusat
app.use((req, res, next) => {
  // Membuat user dari session tersedia di semua template
  res.locals.user = req.session.user || null;

  // Mengelola flash messages
  const flashMessages = req.flash('message');
  if (flashMessages.length > 0) {
      res.locals.message = flashMessages[0];
  } else {
      res.locals.message = null;
  }
  next();
});

// ===============================================
// === PENDAFTARAN ROUTER SETELAH SEMUA MIDDLEWARE GLOBAL ===
// ===============================================

// Pendaftaran Router
app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/auth', authRouter);
app.use('/admin', adminRouter);
app.use('/order', orderRouter); // <<< Sekarang req.flash akan tersedia di sini
app.use('/menu', menuRouter);

// Penanganan Error (404 dan Umum)
// =============================

// Tangani 404
app.use(function (req, res, next) {
  next(createError(404));
});

// Penanganan error umum
app.use(function (err, req, res, next) {
  // Set locals, hanya menyediakan error di development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // Render halaman error
  res.status(err.status || 500);
  res.render('error');
});


module.exports = app;