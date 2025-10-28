const express = require('express');
const router = express.Router();
const db = require('../config/db'); // Pastikan path ini benar

/* ======================================================= */
/* == MIDDLEWARE DAN ROUTE YANG SUDAH ADA == */
/* ======================================================= */

/* Middleware untuk mengecek apakah user sudah login (customer) */
const isCustomer = (req, res, next) => {
  if (req.session.user && req.session.user.role !== 'admin') {
    return next();
  }
  res.redirect('/auth');
};

/* Halaman GET / (Root) */
router.get('/', function(req, res, next) {
  if (req.session.user) {
    if (req.session.user.role === 'admin') {
      return res.redirect('/admin/menu');
    }
    return res.redirect('/dashboard');
  }
  res.redirect('/auth');
});

/* Halaman GET /dashboard */
router.get('/dashboard', isCustomer, async (req, res) => {
  try {
    const [menuItems] = await db.query(
      `SELECT m.*, c.category_name 
       FROM menu_items m
       LEFT JOIN categories c ON m.category_id = c.category_id
       ORDER BY m.name ASC
       LIMIT 4` // Hanya ambil 4 menu populer untuk dashboard
    );

    res.render('dashboard', { 
      menuItems: menuItems 
    });
  } catch (err) {
    console.error("Error fetching menu for dashboard:", err);
    res.status(500).send("Terjadi error saat mengambil data menu.");
  }
});


/* ======================================================= */
/* == BAGIAN YANG HILANG (PENYEBAB 404) == */
/* ======================================================= */

// Helper function untuk membuat 'slug' (cth: "Makanan Berat" -> "makanan-berat")
const slugify = (str) => {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/\s+/g, '-')     // Ganti spasi dengan -
    .replace(/[^\w-]+/g, ''); // Hapus karakter non-alfanumerik
};

/* Halaman GET /menu/all (Halaman "Semua Menu") */
router.get('/menu/all', isCustomer, async (req, res) => {
  try {
    // 1. Ambil semua kategori
    const [categories] = await db.query('SELECT * FROM categories ORDER BY category_name');

    // 2. Ambil semua menu item
    const [menuItems] = await db.query(
      `SELECT m.*, c.category_name 
       FROM menu_items m
       LEFT JOIN categories c ON m.category_id = c.category_id
       ORDER BY c.category_name, m.name ASC`
    );

    // 3. Kelompokkan menu item ke dalam kategori
    const groupedMenu = categories.map(category => {
      return {
        category_id: category.category_id,
        category_name: category.category_name,
        category_slug: slugify(category.category_name), // Buat slug untuk anchor ID
        // Filter item yang cocok dengan kategori ini
        items: menuItems.filter(item => item.category_id === category.category_id)
      };
    });

    // 4. Render halaman 'menu/all.ejs' dan kirim data yang sudah dikelompokkan
    res.render('menu/all', {
      groupedMenu: groupedMenu
    });

  } catch (err) {
    console.error("Error fetching all menu:", err);
    res.status(500).send("Terjadi error saat mengambil data menu.");
  }
});


module.exports = router;

