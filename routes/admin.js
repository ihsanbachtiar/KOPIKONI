const express = require('express');
const router = express.Router();
const db = require('../config/db'); 
const multer = require('multer');
const path = require('path');
const fs = require('fs');

/* ======================================================= */
/* == BAGIAN INI SUDAH ADA == */
/* ======================================================= */

/* Middleware Otorisasi: Hanya untuk Admin */
const isAdmin = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  res.redirect('/auth'); 
};

/* Konfigurasi Multer (Upload Gambar) */
const uploadDir = path.join(__dirname, '../public/uploads/menu');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

/* ======================================================= */
/* == CRUD MENU (Asumsikan sudah lengkap) == */
/* ======================================================= */

/* (R) Read - Tampilkan semua menu */
router.get('/menu', isAdmin, async (req, res) => {
  try {
    const [menuItems] = await db.query(
      `SELECT m.*, c.category_name 
       FROM menu_items m 
       LEFT JOIN categories c ON m.category_id = c.category_id
       ORDER BY m.name ASC`
    );
    res.render('admin/menu/index', { menuItems: menuItems });
  } catch (err) { 
    console.error("Error fetching menu items:", err);
    res.status(500).send("Terjadi error saat mengambil data menu.");
  }
});

/* (C) Create - Tampilkan form tambah menu */
router.get('/menu/new', isAdmin, async (req, res) => {
  try {
    const [categories] = await db.query('SELECT * FROM categories ORDER BY category_name');
    res.render('admin/menu/new', { categories: categories });
  } catch (err) {
    console.error("Error loading new menu form:", err);
    res.status(500).send("Terjadi error saat memuat form.");
  }
});

/* (C) Create - Proses form tambah menu */
router.post('/menu', isAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name, price, category_id, description } = req.body;
    const imagePath = req.file ? `/uploads/menu/${req.file.filename}` : null; 
    await db.query(
      `INSERT INTO menu_items (name, price, category_id, description, image) 
       VALUES (?, ?, ?, ?, ?)`,
      [name, price, category_id, description, imagePath]
    );
    res.redirect('/admin/menu');
  } catch (err) {
    console.error("Error adding new menu:", err);
    res.status(500).send("Terjadi error saat menyimpan menu.");
  }
});

/* (U) Update - Tampilkan form edit menu */
router.get('/menu/:id/edit', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [menuResult] = await db.query('SELECT * FROM menu_items WHERE menu_id = ?', [id]);
    if (menuResult.length === 0) {
      return res.status(404).send('Menu tidak ditemukan.');
    }
    const [categories] = await db.query('SELECT * FROM categories ORDER BY category_name');
    res.render('admin/menu/edit', { menuItem: menuResult[0], categories: categories });
  } catch (err) {
    console.error("Error loading edit menu form:", err);
    res.status(500).send("Terjadi error saat memuat form edit.");
  }
});

/* (U) Update - Proses form edit menu */
router.post('/menu/:id/edit', isAdmin, upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, category_id, description } = req.body;
    const [menuResult] = await db.query('SELECT image FROM menu_items WHERE menu_id = ?', [id]);
    let imagePath = menuResult.length > 0 ? menuResult[0].image : null; 
    if (req.file) {
      imagePath = `/uploads/menu/${req.file.filename}`;
      // (TODO: Hapus file gambar lama jika perlu)
    }
    await db.query(
      `UPDATE menu_items SET name = ?, price = ?, category_id = ?, description = ?, image = ? WHERE menu_id = ?`,
      [name, price, category_id, description, imagePath, id]
    );
    res.redirect('/admin/menu');
  } catch (err) {
    console.error("Error updating menu:", err);
    res.status(500).send("Terjadi error saat mengupdate menu.");
  }
});

/* (D) Delete - Hapus menu */
router.post('/menu/:id/delete', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    // (TODO: Hapus file gambar dari server dulu jika perlu)
    await db.query('DELETE FROM menu_items WHERE menu_id = ?', [id]);
    res.redirect('/admin/menu');
  } catch (err) {
    console.error("Error deleting menu:", err);
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
       return res.status(400).send('Menu tidak bisa dihapus karena sudah pernah dipesan.');
    }
    res.status(500).send("Terjadi error saat menghapus menu.");
  }
});


/* ======================================================= */
/* == LOGIKA MANAJEMEN ORDER (YANG HILANG) == */
/* ======================================================= */

/**
 * GET /admin/orders
 * Menampilkan halaman manajemen order untuk admin.
 */
router.get('/orders', isAdmin, async (req, res) => {
  try {
    const [orders] = await db.query(
      `SELECT o.*, u.name AS user_name 
       FROM orders o
       LEFT JOIN user u ON o.user_id = u.user_id -- 'user' (singular) sesuai screenshot DB Anda
       ORDER BY 
         CASE o.status
           WHEN 'Pending' THEN 1
           WHEN 'Processing' THEN 2
           WHEN 'Completed' THEN 3
           WHEN 'Cancelled' THEN 4
         END, o.order_date DESC`
    );
    
    // Ambil detail item untuk setiap pesanan
    for (let order of orders) {
      // PERBAIKI NAMA TABEL: order_item (singular)
      const [items] = await db.query(
        `SELECT oi.quantity, oi.price_per_item, mi.name AS menu_name
         FROM order_item oi 
         JOIN menu_items mi ON oi.menu_id = mi.menu_id
         WHERE oi.order_id = ?`,
        [order.order_id]
      );
      order.items = items;
    }

    res.render('admin/orders/index', { 
      orders: orders,
      user: req.session.user 
    });
  } catch (err) {
    console.error("Error fetching all orders:", err);
    res.status(500).send("Terjadi error.");
  }
});

/**
 * POST /admin/orders/update-status/:order_id
 * Mengupdate status pesanan.
 */
router.post('/orders/update-status/:order_id', isAdmin, async (req, res) => {
  try {
    const { order_id } = req.params; // Ambil order_id dari parameter URL
    const { new_status } = req.body; // Ambil status baru dari form

    // Validasi status baru (opsional tapi bagus)
    const validStatuses = ['Pending', 'Processing', 'Completed', 'Cancelled'];
    if (!validStatuses.includes(new_status)) {
      return res.status(400).send('Status tidak valid.');
    }

    // Update status di database
    await db.query(
      `UPDATE orders SET status = ? WHERE order_id = ?`,
      [new_status, order_id]
    );
    
    // Kembali ke halaman manajemen order
    res.redirect('/admin/orders');

  } catch (err) {
    console.error("Error updating order status:", err);
    res.status(500).send("Terjadi error saat mengupdate status pesanan.");
  }
});
router.get('/categories', isAdmin, async (req, res) => {
  try {
    const [categories] = await db.query('SELECT * FROM categories ORDER BY category_name ASC');
    res.render('admin/categories/index', { categories: categories });
  } catch (err) {
    console.error("Error fetching categories:", err);
    res.status(500).send("Terjadi error saat mengambil data kategori.");
  }
});

/**
 * GET /admin/categories/new
 * Menampilkan form tambah kategori baru.
 */
router.get('/categories/new', isAdmin, (req, res) => {
  res.render('admin/categories/new');
});

/**
 * POST /admin/categories
 * Memproses penambahan kategori baru.
 */
router.post('/categories', isAdmin, async (req, res) => {
  try {
    const { category_name } = req.body;
    if (!category_name || category_name.trim() === '') {
      return res.status(400).send('Nama kategori tidak boleh kosong.'); // Validasi sederhana
    }
    await db.query('INSERT INTO categories (category_name) VALUES (?)', [category_name]);
    res.redirect('/admin/categories');
  } catch (err) {
    console.error("Error adding category:", err);
     // Tangani jika nama kategori sudah ada (UNIQUE constraint)
    if (err.code === 'ER_DUP_ENTRY') {
      // Idealnya, kirim error kembali ke form 'new'
       return res.status(400).send('Nama kategori sudah ada.'); 
    }
    res.status(500).send("Terjadi error saat menyimpan kategori.");
  }
});

/**
 * GET /admin/categories/:id/edit
 * Menampilkan form edit kategori.
 */
router.get('/categories/:id/edit', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [categoryResult] = await db.query('SELECT * FROM categories WHERE category_id = ?', [id]);
    if (categoryResult.length === 0) {
      return res.status(404).send('Kategori tidak ditemukan.');
    }
    res.render('admin/categories/edit', { category: categoryResult[0] });
  } catch (err) {
    console.error("Error loading edit category form:", err);
    res.status(500).send("Terjadi error saat memuat form edit.");
  }
});

/**
 * POST /admin/categories/:id/edit
 * Memproses update kategori.
 */
router.post('/categories/:id/edit', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { category_name } = req.body;
    if (!category_name || category_name.trim() === '') {
      return res.status(400).send('Nama kategori tidak boleh kosong.');
    }
    await db.query('UPDATE categories SET category_name = ? WHERE category_id = ?', [category_name, id]);
    res.redirect('/admin/categories');
  } catch (err) {
    console.error("Error updating category:", err);
    if (err.code === 'ER_DUP_ENTRY') {
       return res.status(400).send('Nama kategori sudah digunakan oleh kategori lain.');
    }
    res.status(500).send("Terjadi error saat mengupdate kategori.");
  }
});

router.post('/categories/:id/delete', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // PENTING: Hapus dulu menu item yang terkait dengan kategori ini
    // Jika tidak, foreign key constraint akan mencegah penghapusan kategori
    await db.query('DELETE FROM menu_items WHERE category_id = ?', [id]);
    
    // Baru hapus kategorinya
    await db.query('DELETE FROM categories WHERE category_id = ?', [id]);
    
    res.redirect('/admin/categories');
  } catch (err) {
    console.error("Error deleting category:", err);
    // Error ini seharusnya tidak terjadi jika menu item sudah dihapus,
    // tapi tetap bagus untuk ditangani
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
       return res.status(400).send('Kategori tidak bisa dihapus karena masih memiliki menu.');
    }
    res.status(500).send("Terjadi error saat menghapus kategori.");
  }
});


module.exports = router;

