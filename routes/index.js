const express = require('express');
const router = express.Router();
const db = require('../config/db');

const isCustomer = (req, res, next) => {
  if (req.session.user && req.session.user.role !== 'admin') {
    return next();
  }
  req.flash('message', { type: 'error', text: 'Anda perlu login sebagai pelanggan untuk mengakses halaman ini.' });
  res.redirect('/auth');
};

router.get('/', function(req, res, next) {
  if (req.session.user) {
    if (req.session.user.role === 'admin') {
      return res.redirect('/admin/menu');
    }
    return res.redirect('/dashboard');
  }
  res.redirect('/auth');
});

router.get('/dashboard', isCustomer, async (req, res) => {
  try {
    const user = req.session.user;
    const [popularMenuItems] = await db.query(
      `SELECT mi.*, c.category_name
       FROM menu_items mi
       LEFT JOIN categories c ON mi.category_id = c.category_id
       WHERE c.category_name != ? -- Mengecualikan kategori 'Main Course'
       ORDER BY mi.menu_id DESC
       LIMIT 4`,
      ['Main-Course'] 
    );

    const [mainCourseItems] = await db.query(
      `SELECT mi.*, c.category_name
       FROM menu_items mi
       LEFT JOIN categories c ON mi.category_id = c.category_id
       WHERE c.category_name = ?
       ORDER BY mi.name ASC
       LIMIT 2`,
      ['Main-Course'] 
    );

    res.render('dashboard', {
      title: 'Dashboard KopiKoni',
      user: user,
      popularMenuItems: popularMenuItems,
      mainCourseItems: mainCourseItems,
    });

  } catch (err) {
    console.error("Error fetching dashboard data:", err);
    req.flash('message', { type: 'error', text: 'Gagal memuat dashboard. Silakan coba lagi nanti.' });
    res.redirect('/');
  }
}); 

router.post('/add', isCustomer, async (req, res) => {
  try {
    const { menu_id, quantity } = req.body;
    const qty = parseInt(quantity, 10) || 1;

    // Validasi input
    if (!menu_id || qty <= 0) {
        req.flash('message', { type: 'error', text: 'Input menu atau kuantitas tidak valid.' });
        return res.redirect(req.get('referer') || '/dashboard');
    }

    const [menuResult] = await db.query('SELECT * FROM menu_items WHERE menu_id = ?', [menu_id]);
    if (menuResult.length === 0) {
      req.flash('message', { type: 'error', text: 'Menu tidak ditemukan.' });
      return res.redirect(req.get('referer') || '/dashboard');
    }
    const menuItem = menuResult[0];

    // Inisialisasi atau ambil keranjang dari sesi
    if (!req.session.cart) {
      req.session.cart = { items: {}, totalQty: 0, totalPrice: 0 };
    }
    let cart = req.session.cart;

    // Tambahkan atau update item di keranjang
    let storedItem = cart.items[menu_id];
    if (!storedItem) {
      storedItem = { item: menuItem, qty: 0, price: 0 };
      cart.items[menu_id] = storedItem;
    }
    storedItem.qty += qty;
    storedItem.price = storedItem.item.price * storedItem.qty;

    // Hitung ulang total kuantitas dan harga keranjang
    cart.totalQty = 0;
    cart.totalPrice = 0;
    for (const id in cart.items) {
      cart.totalQty += cart.items[id].qty;
      cart.totalPrice += cart.items[id].price;
    }
    req.session.cart = cart; // Simpan kembali keranjang ke sesi

    // Flash message sukses
    req.flash('message', { type: 'success', text: `${menuItem.name} berhasil ditambahkan ke keranjang!` });
    res.redirect(req.get('referer') || '/dashboard');

  } catch (err) {
    console.error("Error adding to cart:", err);
    // Flash message error server
    req.flash('message', { type: 'error', text: 'Terjadi error saat menambahkan produk ke keranjang.' });
    res.redirect(req.get('referer') || '/dashboard');
  }
});


/* ======================================================= */
/* == RUTE UNTUK HALAMAN "Semua Menu" == */
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

    // 2. Ambil semua menu item dengan nama kategori
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
      title: 'Semua Menu KopiKoni', // Judul halaman
      user: req.session.user,      // Pastikan user juga tersedia di template ini
      groupedMenu: groupedMenu
      // 'message' juga otomatis tersedia
    });

  } catch (err) {
    console.error("Error fetching all menu:", err);
    // Tambahkan flash message untuk error
    req.flash('message', { type: 'error', text: 'Terjadi error saat memuat daftar menu.' });
    res.status(500).send("Terjadi error saat mengambil data menu.");
  }
});


module.exports = router;