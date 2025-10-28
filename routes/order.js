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
router.get('/cart', isCustomer, (req, res) => {
  
  const successMsg = req.session.success_message;
  delete req.session.success_message;

  if (!req.session.cart || req.session.cart.totalQty === 0) {
    return res.render('order/cart', {
      items: null, 
      totalPrice: 0,
      success_message: successMsg
    });
  }
  
  const cart = req.session.cart;
  const itemsArray = Object.values(cart.items);

  res.render('order/cart', {
    items: itemsArray,
    totalPrice: cart.totalPrice,
    success_message: successMsg // Kirim pesannya
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

router.post('/submit', isCustomer, async (req, res) => {
  try {
    const cart = req.session.cart;
    const { name, address, payment_method } = req.body;
    const user_id = req.session.user.user_id;

    if (!cart || cart.totalQty === 0) {
      return res.redirect('/order/cart');
    }

    const [orderResult] = await db.query(
      `INSERT INTO orders (user_id, total_amount, status, customer_name, customer_address, payment_method) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [user_id, cart.totalPrice, 'Pending', name, address, payment_method]
    );
    const newOrderId = orderResult.insertId;

    const orderItems = Object.values(cart.items).map(itemData => [
      newOrderId,
      itemData.item.menu_id,
      itemData.qty,
      itemData.item.price
    ]);
    await db.query(
      `INSERT INTO order_item (order_id, menu_id, quantity, price_per_item) 
       VALUES ?`,
      [orderItems]
    );
    delete req.session.cart;
    req.session.success_message = "Pesanan Anda telah berhasil dibuat! Silakan cek riwayat pesanan Anda.";
    res.redirect('/order/cart');

  } catch (err) {
    console.error("Error submitting order:", err);
    res.status(500).send("Terjadi error saat memproses pesanan.");
  }
});

router.get('/success', isCustomer, (req, res) => {
  res.render('order/success'); 
});

router.get('/history', isCustomer, async (req, res) => {
  try {
    const user_id = req.session.user.user_id;
    const [orders] = await db.query(
      `SELECT * FROM orders WHERE user_id = ? ORDER BY order_date DESC`,
      [user_id]
    );
    res.render('order/history', { orders: orders });
  } catch (err) {
    console.error("Error fetching order history:", err);
    res.status(500).send("Terjadi error.");
  }
});

module.exports = router;

