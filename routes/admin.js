const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises; // Gunakan fs.promises untuk operasi async/await

/* Middleware untuk mengecek apakah user adalah admin */
const isAdmin = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  // Gunakan req.flash() di sini
  req.flash('message', { type: 'error', text: 'Anda tidak memiliki akses admin. Silakan login dengan akun admin.' });
  res.redirect('/auth');
};

const configureMulter = (destinationPath, fieldNamePrefix) => {
    const uploadDir = path.join(__dirname, '../public', destinationPath);
    // Pastikan direktori ada
    fs.mkdir(uploadDir, { recursive: true }).catch(err => {
        console.error(`Failed to create upload directory ${uploadDir}:`, err);
    });

    const storage = multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadDir),
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            // Gunakan fieldNamePrefix jika diberikan, jika tidak pakai fieldname default
            const prefix = fieldNamePrefix || file.fieldname; 
            cb(null, `${prefix}-${uniqueSuffix}${path.extname(file.originalname)}`);
        }
    });
    const fileFilter = (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            // Gunakan req.flash() jika ada error filter
            req.flash('message', { type: 'error', text: 'Hanya file gambar yang diperbolehkan!' });
            cb(new Error('Hanya file gambar yang diperbolehkan!'), false);
        }
    };
    // Batasi ukuran file default 5MB
    return multer({ storage: storage, fileFilter: fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });
};

const uploadMenuImage = configureMulter('/uploads/menu', 'menu');
router.get('/dashboard', isAdmin, async (req, res) => {
    
    try {
        
        const [totalUsersResult] = await db.query('SELECT COUNT(user_id) AS total FROM user');
        const totalUsers = totalUsersResult[0].total;

        
        const [totalRevenueResult] = await db.query("SELECT SUM(total_amount) AS total FROM orders WHERE status = 'Completed'");
        const totalRevenue = totalRevenueResult[0].total || 0;

        
        const [totalOrdersResult] = await db.query('SELECT COUNT(order_id) AS total FROM orders');
        const totalOrders = totalOrdersResult[0].total;

        // Query untuk Pesanan Pending
        const [pendingOrdersResult] = await db.query("SELECT COUNT(order_id) AS total FROM orders WHERE status = 'Pending'");
        const pendingOrders = pendingOrdersResult[0].total;

        const [monthlySales] = await db.query(`
            SELECT 
                DATE_FORMAT(order_date, '%Y-%m') AS month,
                SUM(total_amount) AS revenue
            FROM orders
            WHERE status = 'Completed'
            GROUP BY month
            ORDER BY month DESC
            LIMIT 6
        `);
        monthlySales.reverse(); 

        console.log("Monthly Sales Data Sent to EJS:", monthlySales); // <-- PASTIKAN LOG INI ADA

        res.render('admin/dashboard', {
            title: 'Dashboard Admin',
            user: req.session.user,
            totalUsers: totalUsers,
            totalRevenue: totalRevenue,
            totalOrders: totalOrders,
            pendingOrders: pendingOrders,
            monthlySales: monthlySales, // <<< PASTIKAN monthlySales DIKIRIM DI SINI
            activeMenu: 'dashboard'
        });
    } catch (err) {
        console.error("Error fetching admin dashboard data:", err);
        req.flash('message', { type: 'error', text: 'Gagal memuat data dashboard.' });
        res.redirect('/admin/dashboard');
    }
});


router.get('/menu', isAdmin, async (req, res) => {
    try {
        const [menuItems] = await db.query(`
            SELECT mi.*, c.category_name 
            FROM menu_items mi
            JOIN categories c ON mi.category_id = c.category_id
            ORDER BY mi.menu_id DESC
        `);
        const [categories] = await db.query('SELECT * FROM categories ORDER BY category_name');
        res.render('admin/menu', {
            title: 'Manajemen Menu',
            user: req.session.user,
            menuItems: menuItems,
            categories: categories,
            activeMenu: 'menu'
        });
    } catch (err) {
        console.error("Error fetching menu items:", err);
        req.flash('message', { type: 'error', text: 'Gagal memuat daftar menu.' });
        res.redirect('/admin/dashboard'); 
    }
});
router.post('/menu/add', isAdmin, uploadMenuImage.single('image'), async (req, res) => {
    const { name, description, price, category_id, is_active } = req.body;
    const imagePath = req.file ? `/uploads/menu/${req.file.filename}` : null;
    const active = is_active === 'on' ? 1 : 0; 

    try {
        await db.query(
            `INSERT INTO menu_items (name, description, price, category_id, image, is_active) VALUES (?, ?, ?, ?, ?, ?)`,
            [name, description, price, category_id, imagePath, active]
        );
        req.flash('message', { type: 'success', text: 'Menu baru berhasil ditambahkan.' });
    } catch (err) {
        console.error("Error adding menu item:", err);
        req.flash('message', { type: 'error', text: 'Gagal menambahkan menu.' });
    }
    res.redirect('/admin/menu');
});

/* POST /admin/menu/edit/:id */
router.post('/menu/edit/:id', isAdmin, uploadMenuImage.single('image'), async (req, res) => {
    const menu_id = req.params.id;
    const { name, description, price, category_id, is_active, old_image } = req.body;
    const newImagePath = req.file ? `/uploads/menu/${req.file.filename}` : old_image; // Gunakan gambar baru atau yang lama
    const active = is_active === 'on' ? 1 : 0;

    try {
        // Hapus gambar lama jika ada gambar baru diupload
        if (req.file && old_image && old_image.startsWith('/uploads/menu/')) {
            const oldFullImagePath = path.join(__dirname, '../public', old_image);
            await fs.unlink(oldFullImagePath).catch(err => console.error("Error deleting old image:", err.message));
        }

        await db.query(
            `UPDATE menu_items SET name = ?, description = ?, price = ?, category_id = ?, image = ?, is_active = ? WHERE menu_id = ?`,
            [name, description, price, category_id, newImagePath, active, menu_id]
        );
        req.flash('message', { type: 'success', text: 'Menu berhasil diperbarui.' });
    } catch (err) {
        console.error("Error updating menu item:", err);
        req.flash('message', { type: 'error', text: 'Gagal memperbarui menu.' });
    }
    res.redirect('/admin/menu');
});

/* POST /admin/menu/delete/:id */
router.post('/menu/delete/:id', isAdmin, async (req, res) => {
    const menu_id = req.params.id;
    try {
        // Ambil path gambar sebelum menghapus item
        const [menuItem] = await db.query('SELECT image FROM menu_items WHERE menu_id = ?', [menu_id]);
        if (menuItem.length > 0 && menuItem[0].image && menuItem[0].image.startsWith('/uploads/menu/')) {
            const imagePath = path.join(__dirname, '../public', menuItem[0].image);
            await fs.unlink(imagePath).catch(err => console.error("Error deleting menu image:", err.message));
        }

        await db.query('DELETE FROM menu_items WHERE menu_id = ?', [menu_id]);
        req.flash('message', { type: 'success', text: 'Menu berhasil dihapus.' });
    } catch (err) {
        console.error("Error deleting menu item:", err);
        req.flash('message', { type: 'error', text: 'Gagal menghapus menu.' });
    }
    res.redirect('/admin/menu');
});

/* ======================================================= */
/* == Rute Admin untuk Kategori == */
/* ======================================================= */

router.get('/categories', isAdmin, async (req, res) => {
    // HAPUS: const message = req.session.message; delete req.session.message;
    try {
        const [categories] = await db.query('SELECT * FROM categories ORDER BY category_name');
        res.render('admin/categories', {
            title: 'Manajemen Kategori',
            user: req.session.user,
            categories: categories,
            activeMenu: 'categories'
            // message tidak perlu dilewatkan manual
        });
    } catch (err) {
        console.error("Error fetching categories:", err);
        req.flash('message', { type: 'error', text: 'Gagal memuat daftar kategori.' });
        res.redirect('/admin/dashboard'); // Redirect ke dashboard jika ada error
    }
});

router.post('/categories/add', isAdmin, async (req, res) => {
    const { category_name } = req.body;
    try {
        await db.query('INSERT INTO categories (category_name) VALUES (?)', [category_name]);
        req.flash('message', { type: 'success', text: 'Kategori baru berhasil ditambahkan.' });
    } catch (err) {
        console.error("Error adding category:", err);
        req.flash('message', { type: 'error', text: 'Gagal menambahkan kategori.' });
    }
    res.redirect('/admin/categories');
});

router.post('/categories/edit/:id', isAdmin, async (req, res) => {
    const category_id = req.params.id;
    const { category_name } = req.body;
    try {
        await db.query('UPDATE categories SET category_name = ? WHERE category_id = ?', [category_name, category_id]);
        req.flash('message', { type: 'success', text: 'Kategori berhasil diperbarui.' });
    } catch (err) {
        console.error("Error updating category:", err);
        req.flash('message', { type: 'error', text: 'Gagal memperbarui kategori.' });
    }
    res.redirect('/admin/categories');
});

router.post('/categories/delete/:id', isAdmin, async (req, res) => {
    const category_id = req.params.id;
    try {
        // Cek apakah ada menu item yang menggunakan kategori ini
        const [menuCount] = await db.query('SELECT COUNT(*) AS count FROM menu_items WHERE category_id = ?', [category_id]);
        if (menuCount[0].count > 0) {
            req.flash('message', { type: 'error', text: 'Tidak dapat menghapus kategori karena masih digunakan oleh menu item.' });
            return res.redirect('/admin/categories');
        }
        await db.query('DELETE FROM categories WHERE category_id = ?', [category_id]);
        req.flash('message', { type: 'success', text: 'Kategori berhasil dihapus.' });
    } catch (err) {
        console.error("Error deleting category:", err);
        req.flash('message', { type: 'error', text: 'Gagal menghapus kategori.' });
    }
    res.redirect('/admin/categories');
});


/* ======================================================= */
/* == Rute Admin untuk Manajemen Pesanan == */
/* ======================================================= */

/* GET /admin/orders - Menampilkan daftar semua pesanan */
router.get('/orders', isAdmin, async (req, res) => {
    // HAPUS: const message = req.session.message; delete req.session.message;
    try {
        const [orders] = await db.query(`
            SELECT 
                o.order_id,
                o.order_date,
                o.total_amount,
                o.status,
                o.customer_name,
                o.customer_address,
                o.payment_proof,
                u.name AS customer_name_from_user, -- Menggunakan alias berbeda untuk menghindari konflik
                pm.method_name AS payment_method
            FROM orders o
            JOIN user u ON o.user_id = u.user_id
            LEFT JOIN payment_methods pm ON o.payment_method_id = pm.method_id
            ORDER BY o.order_date DESC
        `);

        // Untuk setiap order, ambil detail item yang dipesan
        for (let order of orders) {
            const [items] = await db.query(`
                SELECT 
                    oi.quantity,
                    oi.price_per_item,
                    mi.name AS menu_name,
                    mi.image AS menu_image
                FROM order_item oi
                JOIN menu_items mi ON oi.menu_id = mi.menu_id
                WHERE oi.order_id = ?
            `, [order.order_id]);
            order.items = items;
        }

        res.render('admin/orders', {
            title: 'Manajemen Pesanan',
            user: req.session.user,
            orders: orders,
            activeMenu: 'orders',
            possibleStatuses: ['Pending', 'Processing', 'Completed', 'Cancelled'] // Status yang bisa dipilih admin
            // message tidak perlu dilewatkan manual
        });
    } catch (err) {
        console.error("Error fetching admin orders:", err);
        req.flash('message', { type: 'error', text: 'Gagal memuat daftar pesanan.' });
        res.redirect('/admin/dashboard'); // Redirect ke dashboard jika ada error
    }
});

/* POST /admin/orders/update-status/:id - Mengupdate status pesanan */
router.post('/orders/update-status/:id', isAdmin, async (req, res) => {
    const orderId = req.params.id;
    const { status } = req.body;

    // Pastikan status yang dikirim valid (opsional, tapi disarankan)
    const validStatuses = ['Pending', 'Processing', 'Completed', 'Cancelled'];
    if (!validStatuses.includes(status)) {
        req.flash('message', { type: 'error', text: 'Status pesanan tidak valid.' });
        return res.redirect('/admin/orders');
    }

    try {
        await db.query(`UPDATE orders SET status = ? WHERE order_id = ?`, [status, orderId]);
        req.flash('message', { type: 'success', text: `Status pesanan #${orderId} berhasil diperbarui menjadi '${status}'.` });
    } catch (err) {
        console.error("Error updating order status:", err);
        req.flash('message', { type: 'error', text: `Gagal memperbarui status pesanan #${orderId}.` });
    }
    res.redirect('/admin/orders');
});

/* POST /admin/orders/delete/:id - Menghapus pesanan */
router.post('/orders/delete/:id', isAdmin, async (req, res) => {
    const orderId = req.params.id;
    const transaction = await db.getConnection();

    try {
        await transaction.beginTransaction();

        // Ambil path bukti pembayaran sebelum menghapus order
        const [orderResult] = await transaction.query('SELECT payment_proof FROM orders WHERE order_id = ?', [orderId]);
        const paymentProofPath = orderResult.length > 0 && orderResult[0].payment_proof;

        // Hapus item-item dalam pesanan terlebih dahulu
        await transaction.query('DELETE FROM order_item WHERE order_id = ?', [orderId]);
        // Kemudian hapus pesanan itu sendiri
        await transaction.query('DELETE FROM orders WHERE order_id = ?', [orderId]);

        // Hapus file bukti pembayaran jika ada
        if (paymentProofPath && paymentProofPath.startsWith('/uploads/payments/')) {
            const fullPath = path.join(__dirname, '../public', paymentProofPath);
            // Gunakan try-catch untuk unlink karena file mungkin sudah tidak ada
            await fs.unlink(fullPath).catch(err => console.warn("Could not delete payment proof file (may not exist):", fullPath, err.message));
        }

        await transaction.commit();
        req.flash('message', { type: 'success', text: `Pesanan #${orderId} dan itemnya berhasil dihapus.` });
    } catch (err) {
        await transaction.rollback();
        console.error("Error deleting order:", err);
        req.flash('message', { type: 'error', text: `Gagal menghapus pesanan #${orderId}.` });
    } finally {
        transaction.release();
    }
    res.redirect('/admin/orders');
});


module.exports = router;