// routes/admin.js

const express = require('express');
const router = express.Router();
const db = require('../config/db'); // <<< Koneksi database Anda
const multer = require('multer');
const path = require('path');
const fs = require('fs');

/* ======================================================= */
/* == Middleware Otorisasi & Konfigurasi Multer (SAMA) == */
/* ======================================================= */

/* Middleware Otorisasi: Hanya untuk Admin */
const isAdmin = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  // Idealnya, tambahkan flash message untuk memberi tahu mengapa di-redirect
  // req.flash('error', 'Anda tidak memiliki akses admin.'); 
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
/* == CRUD MENU (Kode Anda, tidak berubah) == */
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
    res.render('admin/menu/index', { 
      menuItems: menuItems,
      user: req.session.user, // Pastikan user dilewatkan untuk sidebar
      title: 'Manajemen Menu'
    });
  } catch (err) { 
    console.error("Error fetching menu items:", err);
    res.status(500).send("Terjadi error saat mengambil data menu.");
  }
});

/* (C) Create - Tampilkan form tambah menu */
router.get('/menu/new', isAdmin, async (req, res) => {
  try {
    const [categories] = await db.query('SELECT * FROM categories ORDER BY category_name');
    res.render('admin/menu/new', { 
      categories: categories,
      user: req.session.user,
      title: 'Tambah Menu Baru'
    });
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
    // Jika pakai connect-flash, bisa tambahkan: req.flash('success', 'Menu berhasil ditambahkan!');
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
    res.render('admin/menu/edit', { 
      menuItem: menuResult[0], 
      categories: categories,
      user: req.session.user,
      title: `Edit Menu: ${menuResult[0].name}`
    });
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
      // TODO: Hapus file gambar lama jika perlu:
      // if (menuResult[0].image && fs.existsSync(path.join(__dirname, '../public', menuResult[0].image))) {
      //   fs.unlinkSync(path.join(__dirname, '../public', menuResult[0].image));
      // }
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
    // TODO: Hapus file gambar dari server dulu jika perlu
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


function groupOrderDetails(rows) {
    const ordersMap = new Map();

    rows.forEach(row => {
        if (!ordersMap.has(row.order_id)) {
            ordersMap.set(row.order_id, {
                order_id: row.order_id,
                user_id: row.user_id,
                customer_name: row.customer_name, // Mengambil langsung dari tabel orders
                customer_address: row.customer_address, // Mengambil langsung dari tabel orders
                payment_method: row.payment_method,
                order_date: row.order_date,
                total_amount: parseFloat(row.total_amount),
                status: row.status,
                items: []
            });
        }
        if (row.order_item_id) {
            ordersMap.get(row.order_id).items.push({
                order_item_id: row.order_item_id,
                menu_id: row.menu_id,
                menu_name: row.menu_name,
                quantity: row.quantity,
                price_per_item: parseFloat(row.price_per_item),
                menu_image: row.menu_image
            });
        }
    });
    return Array.from(ordersMap.values());
}


/**
 * GET /admin/orders
 * Menampilkan halaman manajemen order untuk admin dengan pagination.
 */
router.get('/orders', isAdmin, async (req, res) => {
  try {
    const user = req.session.user || null; 

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const offset = (page - 1) * limit;

    // --- PERUBAHAN UTAMA DI SINI: Query SQL ---
    const [ordersResult] = await db.query(
      `SELECT
          o.order_id,
          o.user_id,
          o.customer_name,      -- <<< Mengambil langsung dari tabel orders
          o.customer_address,   -- <<< Mengambil langsung dari tabel orders
          o.payment_method,
          o.order_date,
          o.total_amount,
          o.status,
          oi.order_item_id,
          mi.menu_id,
          mi.name AS menu_name,
          oi.quantity,
          oi.price_per_item,
          mi.image AS menu_image
      FROM
          orders o
      LEFT JOIN 
          order_item oi ON o.order_id = oi.order_id 
      LEFT JOIN
          menu_items mi ON oi.menu_id = mi.menu_id 
      ORDER BY
          CASE o.status
            WHEN 'Pending' THEN 1
            WHEN 'Processing' THEN 2
            WHEN 'Completed' THEN 3
            WHEN 'Cancelled' THEN 4
          END, o.order_date DESC
      LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    const orders = groupOrderDetails(ordersResult);

    const [countResult] = await db.query(`SELECT COUNT(order_id) AS total FROM orders;`);
    const totalCount = parseInt(countResult[0].total, 10);
    
    const totalPages = Math.ceil(totalCount / limit);

    res.render('admin/orders/index', { 
      orders: orders,
      user: user, 
      title: 'Manajemen Pesanan Admin',
      currentPage: page,
      limit: limit,
      totalPages: totalPages,
      totalCount: totalCount 
    });
  } catch (err) {
    console.error("Error fetching admin orders:", err);
    res.status(500).send("Terjadi error saat mengambil data pesanan.");
  }
});

/**
 * POST /admin/orders/update-status/:order_id
 * Mengupdate status pesanan.
 */
router.post('/orders/update-status/:order_id', isAdmin, async (req, res) => {
  try {
    const { order_id } = req.params; 
    const { new_status } = req.body; 

    const validStatuses = ['Pending', 'Processing', 'Completed', 'Cancelled'];
    if (!validStatuses.includes(new_status)) {
      // Jika pakai connect-flash: req.flash('error', 'Status tidak valid.');
      return res.status(400).send('Status tidak valid.');
    }

    await db.query(
      `UPDATE orders SET status = ? WHERE order_id = ?`,
      [new_status, order_id]
    );
    
    // Jika pakai connect-flash: req.flash('success', `Status pesanan #${order_id} berhasil diupdate menjadi ${new_status}.`);
    res.redirect('/admin/orders');

  } catch (err) {
    console.error("Error updating order status:", err);
    // Jika pakai connect-flash: req.flash('error', 'Gagal mengupdate status pesanan.');
    res.status(500).send("Terjadi error saat mengupdate status pesanan.");
  }
});


/* ======================================================= */
/* == CRUD CATEGORIES (Kode Anda, tidak berubah) == */
/* ======================================================= */

router.get('/categories', isAdmin, async (req, res) => {
  try {
    const [categories] = await db.query('SELECT * FROM categories ORDER BY category_name ASC');
    res.render('admin/categories/index', { 
      categories: categories,
      user: req.session.user,
      title: 'Manajemen Kategori'
    });
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
  res.render('admin/categories/new', {
    user: req.session.user,
    title: 'Tambah Kategori Baru'
  });
});

/**
 * POST /admin/categories
 * Memproses penambahan kategori baru.
 */
router.post('/categories', isAdmin, async (req, res) => {
  try {
    const { category_name } = req.body;
    if (!category_name || category_name.trim() === '') {
      // Jika pakai connect-flash: req.flash('error', 'Nama kategori tidak boleh kosong.');
      return res.status(400).send('Nama kategori tidak boleh kosong.');
    }
    await db.query('INSERT INTO categories (category_name) VALUES (?)', [category_name]);
    // Jika pakai connect-flash: req.flash('success', 'Kategori berhasil ditambahkan!');
    res.redirect('/admin/categories');
  } catch (err) {
    console.error("Error adding category:", err);
    if (err.code === 'ER_DUP_ENTRY') {
      // Jika pakai connect-flash: req.flash('error', 'Nama kategori sudah ada.');
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
    res.render('admin/categories/edit', { 
      category: categoryResult[0],
      user: req.session.user,
      title: `Edit Kategori: ${categoryResult[0].category_name}`
    });
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
      // Jika pakai connect-flash: req.flash('error', 'Nama kategori tidak boleh kosong.');
      return res.status(400).send('Nama kategori tidak boleh kosong.');
    }
    await db.query('UPDATE categories SET category_name = ? WHERE category_id = ?', [category_name, id]);
    // Jika pakai connect-flash: req.flash('success', 'Kategori berhasil diupdate!');
    res.redirect('/admin/categories');
  } catch (err) {
    console.error("Error updating category:", err);
    if (err.code === 'ER_DUP_ENTRY') {
       // Jika pakai connect-flash: req.flash('error', 'Nama kategori sudah digunakan oleh kategori lain.');
       return res.status(400).send('Nama kategori sudah digunakan oleh kategori lain.');
    }
    res.status(500).send("Terjadi error saat mengupdate kategori.");
  }
});

router.post('/categories/:id/delete', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // PENTING: Hapus dulu menu item yang terkait dengan kategori ini
    await db.query('DELETE FROM menu_items WHERE category_id = ?', [id]);
    
    // Baru hapus kategorinya
    await db.query('DELETE FROM categories WHERE category_id = ?', [id]);
    
    // Jika pakai connect-flash: req.flash('success', 'Kategori berhasil dihapus!');
    res.redirect('/admin/categories');
  } catch (err) {
    console.error("Error deleting category:", err);
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
       // Jika pakai connect-flash: req.flash('error', 'Kategori tidak bisa dihapus karena masih memiliki menu.');
       return res.status(400).send('Kategori tidak bisa dihapus karena masih memiliki menu.');
    }
    res.status(500).send("Terjadi error saat menghapus kategori.");
  }
});


module.exports = router;