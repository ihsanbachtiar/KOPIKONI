const express = require('express');
const router = express.Router();
const db = require('../config/db'); // Ini adalah promise pool dari config/db.js
const bcrypt = require('bcrypt');

// Halaman login (landing)
router.get('/', (req, res) => {
  if (req.session.user) {
    if (req.session.user.role === 'admin') {
      return res.redirect('/admin/menu');
    }
    return res.redirect('/dashboard');
  }
  
  // Kirim 'error' dan 'activeTab' sebagai null/default
  res.render('landing', { error: null, activeTab: 'customer' });
});

// Proses login (DIUBAH KE ASYNC/AWAIT)
router.post('/login', async (req, res) => {
  try {
    // Ambil 'login_as' dari form
    const { email, password, login_as } = req.body; 
    
    // Tentukan tab mana yang harus aktif jika terjadi error
    const activeTab = login_as || 'customer';

    // (ASYNC) Ganti db.query(..., callback) menjadi await db.query(...)
    const [results] = await db.query('SELECT * FROM user WHERE email = ?', [email]);

    if (results.length === 0) {
      return res.render('landing', { error: 'Email tidak ditemukan!', activeTab: activeTab });
    }

    const user = results[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.render('landing', { error: 'Password salah!', activeTab: activeTab });
    }

    // ===================================
    // VALIDASI PORTAL LOGIN
    // ===================================
    if (login_as === 'admin' && user.role !== 'admin') {
      return res.render('landing', { 
        error: 'Gagal. Akun Anda bukan akun admin terdaftar.', 
        activeTab: 'admin' 
      });
    }
    
    if (login_as === 'customer' && user.role === 'admin') {
      return res.render('landing', { 
        error: 'Login admin harus melalui portal "Login Admin".', 
        activeTab: 'customer' 
      });
    }
    // ===================================

    // Jika lolos validasi, simpan session
    req.session.user = user;

    // Arahkan berdasarkan role
    if (user.role === 'admin') {
      res.redirect('/admin/menu');
    } else {
      res.redirect('/dashboard');
    }
    
  } catch (err) {
    // Tangkap error jika database query gagal
    console.error("Login error:", err);
    res.status(500).render('landing', { error: 'Terjadi masalah pada server.', activeTab: 'customer' });
  }
});

// Halaman register
router.get('/register', (req, res) => {
  res.render('register', { error: null });
});

// Proses register (DIUBAH KE ASYNC/AWAIT)
router.post('/register', async (req, res) => {
  try {
    const { nama, email, password, admin_code } = req.body;
    const hashed = await bcrypt.hash(password, 10);

    const ADMIN_SECRET_CODE = 'kopikoni123'; // Pastikan ini kode rahasia Anda
    let role = 'customer';
    if (admin_code && admin_code === ADMIN_SECRET_CODE) {
      role = 'admin';
    }

    // (ASYNC) Ganti db.query(..., callback) menjadi await db.query(...)
    await db.query(
      'INSERT INTO user (name, email, password, role) VALUES (?, ?, ?, ?)',
      [nama, email, hashed, role]
    );
    
    res.redirect('/'); 

  } catch (err) {
    // Tangkap error (misal email duplikat)
    console.error("Register error:", err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.render('register', { error: 'Email sudah terdaftar.' });
    }
    res.status(500).render('register', { error: 'Terjadi masalah pada server.' });
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.log(err);
      return res.redirect('/');
    }
    res.clearCookie('connect.sid'); 
    res.redirect('/');
  });
});

module.exports = router;

