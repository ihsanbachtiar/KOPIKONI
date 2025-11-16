const express = require('express');
const router = express.Router();
const db = require('../config/db');

const isCustomer = (req, res, next) => {
  if (req.session.user && req.session.user.role !== 'admin') {
    return next();
  }
  res.redirect('/auth');
};
router.post('/add', isCustomer, async (req, res) => {
  try {
    const { menu_id, quantity } = req.body;
    const qty = parseInt(quantity, 10) || 1;
    const [menuResult] = await db.query('SELECT * FROM menu_items WHERE menu_id = ?', [menu_id]);
    if (menuResult.length === 0) {
      return res.redirect(req.get('referer') || '/dashboard');
    }
    const menuItem = menuResult[0];

    if (!req.session.cart) {
      req.session.cart = { items: {}, totalQty: 0, totalPrice: 0 };
    }
    let cart = req.session.cart;

    let storedItem = cart.items[menu_id];
    if (!storedItem) {
      storedItem = { item: menuItem, qty: 0, price: 0 };
      cart.items[menu_id] = storedItem;
    }
    storedItem.qty += qty;
    storedItem.price = storedItem.item.price * storedItem.qty;

    cart.totalQty = 0;
    cart.totalPrice = 0;
    for (const id in cart.items) {
      cart.totalQty += cart.items[id].qty;
      cart.totalPrice += cart.items[id].price;
    }
    req.session.cart = cart;
    res.redirect(req.get('referer') || '/dashboard');
  } catch (err) {
    console.error("Error adding to cart:", err);
    res.status(500).send("Terjadi error pada server.");
  }
});
/* GET /order/cart (Menampilkan halaman keranjang dari SESSION) */
router.get('/cart', isCustomer, async (req, res) => {
  const message = req.session.message;
  delete req.session.message;

  let paymentMethods = [];
  try {
    const [methods] = await db.query(`SELECT method_id, method_name FROM payment_methods WHERE is_active = 1 ORDER BY method_name`);
    paymentMethods = methods;
  } catch (error) {
    console.error("Error fetching payment methods:", error);
  }
  
  // =======================================================
  // Bagian yang DITAMBAHKAN/DIPERBAIKI
  // Pastikan variabel ini dideklarasikan sebelum digunakan
  // =======================================================
  let cartItems = [];
  let totalPrice = 0;
  let totalQty = 0;

  if (req.session.cart && req.session.cart.items && Object.keys(req.session.cart.items).length > 0) {
    const cart = req.session.cart;
    cartItems = Object.values(cart.items);
    totalPrice = cart.totalPrice;
    totalQty = cart.totalQty;
  }
  // =======================================================
  // Akhir Bagian yang DITAMBAHKAN/DIPERBAIKI
  // =======================================================


  // Ambil status pesanan terbaru untuk sidebar
  let latestOrderStatus = null;
  if (req.session.user && req.session.user.user_id) {
    try {
      const [latestOrder] = await db.query(
        `SELECT order_id, status 
         FROM orders 
         WHERE user_id = ? 
         ORDER BY order_date DESC 
         LIMIT 1`,
        [req.session.user.user_id]
      );
      if (latestOrder.length > 0) {
        latestOrderStatus = latestOrder[0];
      }
    } catch (err) {
      console.error("Error fetching latest order status for sidebar:", err);
    }
  }

  // Render halaman keranjang
  res.render('order/cart', {
    user: req.session.user,
    items: cartItems, // Sekarang cartItems sudah didefinisikan
    totalPrice: totalPrice,
    totalQty: totalQty,
    paymentMethods: paymentMethods,
    message: message,
    latestOrderStatus: latestOrderStatus,
    title: 'Keranjang Belanja KopiKoni'
  });
});

/* POST /order/remove/:id (Menghapus item dari keranjang) */
router.post('/remove/:id', isCustomer, (req, res) => {
  const menu_id = req.params.id;
  const cart = req.session.cart;
  if (cart && cart.items[menu_id]) {
    const itemToRemove = cart.items[menu_id];
    cart.totalQty -= itemToRemove.qty;
    cart.totalPrice -= itemToRemove.price;
    delete cart.items[menu_id];
    req.session.cart = cart;
  }
  res.redirect('/order/cart');
});

/* POST /order/submit (Proses checkout - Sesuai action di cart.ejs) */
router.post('/submit', isCustomer, async (req, res) => { // <--- Route diubah menjadi /submit
    if (!req.session.user) {
        req.session.message = { type: 'error', text: 'Anda harus login untuk melakukan checkout.' };
        return res.redirect('/auth');
    }

    const userId = req.session.user.user_id;
    // Mengambil nama input yang sesuai dengan form di cart.ejs
    const { customer_name, customer_address, payment_method_id } = req.body; // Sesuaikan dengan name di form
    const cart = req.session.cart;

    // Pastikan keranjang tidak kosong
    if (!cart || !cart.items || Object.keys(cart.items).length === 0) {
        req.session.message = { type: 'error', text: 'Keranjang Anda kosong. Tidak dapat melakukan checkout.' };
        return res.redirect('/order/cart');
    }

    const totalPrice = cart.totalPrice;
    const transaction = await db.getConnection(); // Dapatkan koneksi untuk transaksi

    try {
        await transaction.beginTransaction(); // Mulai transaksi
        console.log('Transaksi dimulai.'); // Log 1

        // 1. Masukkan data pesanan ke tabel 'orders'
        const [orderResult] = await transaction.query(
            `INSERT INTO orders (user_id, order_date, total_amount, status, customer_name, customer_address, payment_method_id)
             VALUES (?, NOW(), ?, 'Pending', ?, ?, ?)`,
            [userId, totalPrice, customer_name, customer_address, payment_method_id]
        );
        const orderId = orderResult.insertId;
        console.log(`Pesanan utama (order_id: ${orderId}) berhasil dimasukkan.`); // Log 2

        // 2. Masukkan item-item dari keranjang ke tabel 'order_item'
        for (const itemId in cart.items) {
            const item = cart.items[itemId];
            await transaction.query(
                `INSERT INTO order_item (order_id, menu_id, quantity, price_per_item)
                 VALUES (?, ?, ?, ?)`,
                [orderId, item.item.menu_id, item.qty, item.item.price]
            );
            console.log(`  - Item (menu_id: ${item.item.menu_id}, qty: ${item.qty}) berhasil dimasukkan.`); // Log 3
        }

        await transaction.commit(); // Commit transaksi jika semua berhasil
        console.log('Transaksi berhasil di-commit. Pesanan tersimpan di database.'); // Log 4

        // 3. Kosongkan keranjang di sesi setelah checkout berhasil
        req.session.cart = { items: {}, totalPrice: 0, totalQty: 0 };
        req.session.message = { type: 'success', text: 'Pesanan Anda berhasil dibuat!' };
        
        // 4. Redirect ke halaman riwayat pesanan
        res.redirect('/order/history');

    } catch (error) {
        await transaction.rollback(); // Rollback transaksi jika ada error
        console.error('Error saat checkout:', error); // Pastikan ini mengeluarkan error detail
        req.session.message = { type: 'error', text: 'Checkout gagal. Silakan coba lagi.' };
        res.redirect('/order/cart'); // Kembali ke keranjang jika gagal
    } finally {
        transaction.release();
        console.log('Koneksi transaksi dilepaskan.'); // Log 5
    }
});

/* GET /order/history (Menampilkan riwayat pesanan) */
router.get('/history', isCustomer, async (req, res) => {
    const message = req.session.message;
    delete req.session.message;

    let orders = [];
    let latestOrderStatus = null;

    if (req.session.user && req.session.user.user_id) {
        const userId = req.session.user.user_id;
        console.log(`Mengambil riwayat pesanan untuk user_id: ${userId}`);

        try {
            const [userOrders] = await db.query(
                `SELECT 
                    o.order_id,
                    o.order_date,
                    o.total_amount,
                    o.status,
                    o.customer_name,
                    o.customer_address,
                    pm.method_name AS payment_method
                 FROM orders o
                 JOIN payment_methods pm ON o.payment_method_id = pm.method_id
                 WHERE o.user_id = ?
                 ORDER BY o.order_date DESC`,
                [userId]
            );
            console.log(`Ditemukan ${userOrders.length} pesanan utama.`);

            for (let order of userOrders) {
                const [orderItems] = await db.query(
                    `SELECT 
                        oi.quantity,
                        oi.price_per_item,
                        m.name AS menu_name,
                        m.image AS menu_image
                     FROM order_item oi  
                     JOIN menu_items m ON oi.menu_id = m.menu_id -- <--- PERUBAHAN UTAMA DI SINI: menu_items
                     WHERE oi.order_id = ?`,
                    [order.order_id]
                );
                order.items = orderItems;
                console.log(`  - Pesanan #${order.order_id} memiliki ${orderItems.length} item.`);
            }
            orders = userOrders;
            console.log('Objek orders siap untuk dirender:', orders);

            if (orders.length > 0) {
                latestOrderStatus = {
                    order_id: orders[0].order_id,
                    status: orders[0].status
                };
            }

        } catch (error) {
            console.error("Error fetching order history:", error); // Ini akan mencetak error jika ada masalah lain
            req.session.message = { type: 'error', text: 'Gagal mengambil riwayat pesanan.' };
            return res.redirect('/dashboard');
        }
    } else {
        req.session.message = { type: 'error', text: 'Anda harus login untuk melihat riwayat pesanan.' };
        return res.redirect('/auth');
    }

    res.render('order/history', {
        user: req.session.user,
        orders: orders,
        latestOrderStatus: latestOrderStatus,
        message: message,
        title: 'Riwayat Pesanan KopiKoni'
    });
});

module.exports = router;
