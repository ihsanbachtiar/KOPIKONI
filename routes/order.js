const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs'); 


const isCustomer = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'customer') {
    return next();
  }
  req.flash('message', { type: 'error', text: 'Anda harus login sebagai customer.' });
  res.redirect('/auth');
};


const uploadDir = path.join(__dirname, '../public/uploads/payments');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const userId = req.session.user && req.session.user.user_id ? req.session.user.user_id : 'guest';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `payment-${userId}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    req.flash('message', { type: 'error', text: 'Hanya file gambar yang diperbolehkan!' });
    cb(new Error('Hanya file gambar yang diperbolehkan!'), false); 
  }
};

const upload = multer({ 
    storage: storage, 
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } 
});
router.post('/add', isCustomer, async (req, res) => {
  try {
    const { menu_id, quantity } = req.body;
    const qty = parseInt(quantity, 10);

    if (isNaN(qty) || qty <= 0) {
      req.flash('message', { type: 'error', text: 'Kuantitas tidak valid.' });
      return res.redirect('/dashboard'); 
    }

    const [menuResult] = await db.query('SELECT menu_id, name, price, image AS image_url FROM menu_items WHERE menu_id = ? AND is_active = 1', [menu_id]);
    if (menuResult.length === 0) {
      req.flash('message', { type: 'error', text: 'Menu tidak ditemukan atau tidak aktif.' });
      return res.redirect('/dashboard');
    }
    const menuItem = menuResult[0];

    if (!req.session.cart) {
      req.session.cart = { items: {}, totalQty: 0, totalPrice: 0 };
    } 
    if (!req.session.cart.items) {
      req.session.cart.items = {};
    }

    let cart = req.session.cart;

    let storedItem = cart.items[menu_id];
    if (!storedItem) {
      storedItem = { item: { ...menuItem, image: menuItem.image_url }, qty: 0, price: 0 };
      cart.items[menu_id] = storedItem;
    }

    storedItem.qty += qty;
    storedItem.price = storedItem.item.price * storedItem.qty;

    // Hitung ulang totalQty dan totalPrice untuk keseluruhan keranjang
    cart.totalQty = 0;
    cart.totalPrice = 0;
    for (const id in cart.items) {
      cart.totalQty += cart.items[id].qty;
      cart.totalPrice += cart.items[id].price;
    }

    req.session.cart = cart; // Pastikan session diperbarui
    // Gunakan req.flash() dan redirect ke dashboard
    req.flash('message', { type: 'success', text: `${qty}x ${menuItem.name} berhasil ditambahkan ke keranjang!` });
    res.redirect('/dashboard'); // <<< SELALU REDIRECT KE DASHBOARD

  } catch (err) {
    console.error("Error adding to cart:", err);
    // Gunakan req.flash()
    req.flash('message', { type: 'error', text: 'Gagal menambahkan item ke keranjang.' });
    res.redirect('/dashboard'); // Selalu redirect ke dashboard jika ada error
  }
});

/* GET /order/cart (Halaman Keranjang) */
router.get('/cart', isCustomer, async (req, res) => {
  // HAPUS ini: const message = req.session.message; delete req.session.message;
  // Karena req.flash() di app.js sudah menanganinya secara otomatis
  
  let paymentMethods = [];
  try {
    const [methods] = await db.query(`SELECT method_id, method_name FROM payment_methods WHERE is_active = 1 ORDER BY method_name`);
    paymentMethods = methods;
  } catch (error) {
    console.error("Error fetching payment methods:", error);
    req.flash('message', { type: 'error', text: 'Gagal memuat metode pembayaran.' }); // Flash message untuk error ini
  }
  
  let cartItems = [];
  let totalPrice = 0;
  let totalQty = 0;

  if (req.session.cart && req.session.cart.items && Object.keys(req.session.cart.items).length > 0) {
    const cart = req.session.cart;
    cartItems = Object.values(cart.items);
    totalPrice = cart.totalPrice;
    totalQty = cart.totalQty;
  }
  
  let latestOrderStatus = null;
  if (req.session.user && req.session.user.user_id) {
    try {
      const [latestOrder] = await db.query(
        `SELECT order_id, status FROM orders WHERE user_id = ? ORDER BY order_date DESC LIMIT 1`,
        [req.session.user.user_id]
      );
      if (latestOrder.length > 0) latestOrderStatus = latestOrder[0];
    } catch (err) { 
        console.error("Error fetching latest order status:", err); 
        req.flash('message', { type: 'error', text: 'Gagal memuat status pesanan terakhir.' }); // Flash message
    }
  }

  res.render('order/cart', {
    user: req.session.user,
    items: cartItems,
    totalPrice: totalPrice,
    totalQty: totalQty,
    paymentMethods: paymentMethods,
    // HAPUS ini: message: message,
    // res.locals.message akan otomatis tersedia di template
    latestOrderStatus: latestOrderStatus,
    title: 'Keranjang Belanja'
  });
});

/* POST /order/update-cart */
router.post('/update-cart', isCustomer, (req, res) => {
  const { menu_id, quantity } = req.body;
  const qty = parseInt(quantity, 10);

  if (isNaN(qty) || qty < 1) { 
    // Gunakan req.flash()
    req.flash('message', { type: 'error', text: 'Kuantitas minimal 1.' });
    return res.redirect('/order/cart');
  }

  let cart = req.session.cart;
  if (cart && cart.items && cart.items[menu_id]) {
    let storedItem = cart.items[menu_id];
    storedItem.qty = qty;
    storedItem.price = storedItem.item.price * storedItem.qty; // Perbaikan: Harga per item * qty

    cart.totalQty = 0;
    cart.totalPrice = 0;
    for (const id in cart.items) {
      cart.totalQty += cart.items[id].qty;
      cart.totalPrice += cart.items[id].price; // Total harga item adalah (harga per unit * qty)
    }
    req.session.cart = cart;
    // Gunakan req.flash()
    req.flash('message', { type: 'success', text: 'Keranjang diperbarui.' });
  } else {
      req.flash('message', { type: 'error', text: 'Item tidak ditemukan di keranjang.' });
  }
  res.redirect('/order/cart');
});

/* POST /order/remove/:id */
router.post('/remove/:id', isCustomer, (req, res) => {
  const menu_id = req.params.id;
  let cart = req.session.cart;

  if (cart && cart.items && cart.items[menu_id]) {
    const itemToRemove = cart.items[menu_id];
    cart.totalQty -= itemToRemove.qty;
    cart.totalPrice -= itemToRemove.price;
    delete cart.items[menu_id];

    if (Object.keys(cart.items).length === 0) {
      delete req.session.cart; // Hapus seluruh session.cart jika kosong
    } else {
      req.session.cart = cart; // Perbarui session.cart jika masih ada isinya
    }
    // Gunakan req.flash()
    req.flash('message', { type: 'success', text: 'Item berhasil dihapus dari keranjang.' });
  } else {
      req.flash('message', { type: 'error', text: 'Item tidak ditemukan di keranjang.' });
  }
  res.redirect('/order/cart');
});

/* POST /order/checkout (DENGAN UPLOAD GAMBAR) */
router.post('/checkout', isCustomer, upload.single('payment_proof'), async (req, res) => {
    const { payment_method_id, customer_name, customer_address } = req.body; 
    const user_id = req.session.user.user_id;
    const cart = req.session.cart;
    
    const paymentProofImage = req.file ? `/uploads/payments/${req.file.filename}` : null;

    if (!cart || !cart.items || Object.keys(cart.items).length === 0) {
        // Gunakan req.flash()
        req.flash('message', { type: 'error', text: 'Keranjang kosong. Tidak dapat melakukan checkout.' });
        return res.redirect('/order/cart');
    }

    // Validasi: Jika metode bukan COD (misal ID 1), wajib upload bukti
    // Anda bisa menyesuaikan ID COD di sini
    if (payment_method_id != '1' && !paymentProofImage) { 
       req.flash('message', { type: 'error', text: 'Untuk metode pembayaran ini, mohon upload bukti pembayaran.' });
       return res.redirect('/order/cart');
    }

    const transaction = await db.getConnection();

    try {
        await transaction.beginTransaction();

        // INSERT ke orders dengan payment_proof
        const [orderResult] = await transaction.query(
            `INSERT INTO orders (user_id, order_date, total_amount, status, customer_name, customer_address, payment_method_id, payment_proof) 
             VALUES (?, NOW(), ?, 'Pending', ?, ?, ?, ?)`,
            [user_id, cart.totalPrice, customer_name, customer_address, payment_method_id, paymentProofImage]
        );
        const orderId = orderResult.insertId;

        const orderItemsData = Object.values(cart.items).map(itemData => [
            orderId,
            itemData.item.menu_id,
            itemData.qty,
            itemData.item.price // Ini adalah harga per item, bukan total harga storedItem.price
        ]);

        await transaction.query(`INSERT INTO order_item (order_id, menu_id, quantity, price_per_item) VALUES ?`, [orderItemsData]);

        await transaction.commit();
        delete req.session.cart; // Keranjang kosong setelah checkout

        // Gunakan req.flash()
        req.flash('message', { type: 'success', text: 'Pesanan berhasil dibuat! Mohon tunggu konfirmasi.' });
        res.redirect('/order/history');
    } catch (err) {
        await transaction.rollback();
        console.error("Error checkout:", err);
        // Tangani error khusus dari multer jika file yang diupload tidak sesuai
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            req.flash('message', { type: 'error', text: 'Ukuran file terlalu besar. Maksimal 5MB.' });
        } else if (err.message === 'Hanya file gambar yang diperbolehkan!') { // Dari fileFilter custom
             req.flash('message', { type: 'error', text: 'Hanya file gambar yang diperbolehkan untuk bukti pembayaran.' });
        } else {
            req.flash('message', { type: 'error', text: 'Gagal memproses pesanan. Silakan coba lagi.' });
        }
        res.redirect('/order/cart'); // Kembali ke keranjang jika checkout gagal
    } finally {
        transaction.release();
    }
});

/* GET /order/history */
router.get('/history', isCustomer, async (req, res) => {
  // HAPUS ini: const message = req.session.message; delete req.session.message;
  
  let orders = [];
  let latestOrderStatus = null;

  if (req.session.user && req.session.user.user_id) {
      const userId = req.session.user.user_id;
      try {
          const [userOrders] = await db.query(
              `SELECT 
                  o.order_id,
                  o.order_date,
                  o.total_amount,
                  o.status,
                  o.customer_name,
                  o.customer_address,
                  o.payment_proof,
                  pm.method_name AS payment_method
               FROM orders o
               LEFT JOIN payment_methods pm ON o.payment_method_id = pm.method_id
               WHERE o.user_id = ?
               ORDER BY o.order_date DESC`,
              [userId]
          );

          for (let order of userOrders) {
              const [orderItems] = await db.query(
                  `SELECT 
                      oi.quantity,
                      oi.price_per_item,
                      m.name AS menu_name,
                      m.image AS menu_image
                   FROM order_item oi
                   JOIN menu_items m ON oi.menu_id = m.menu_id
                   WHERE oi.order_id = ?`,
                  [order.order_id]
              );
              order.items = orderItems;
          }
          orders = userOrders;

          if (orders.length > 0) {
              latestOrderStatus = {
                  order_id: orders[0].order_id,
                  status: orders[0].status
              };
          }
      } catch (error) {
          console.error("Error fetching history:", error);
          req.flash('message', { type: 'error', text: 'Gagal memuat riwayat pesanan.' }); // Flash message
      }
  }

  res.render('order/history', {
      user: req.session.user,
      orders: orders,
      latestOrderStatus: latestOrderStatus,
      // HAPUS ini: message: message,
      title: 'Riwayat Pesanan'
  });
});

module.exports = router;