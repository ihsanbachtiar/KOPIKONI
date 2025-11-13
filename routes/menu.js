const express = require('express');
const router = express.Router();
const db = require('../config/db');

/* Middleware isCustomer (sudah benar) */
const isCustomer = (req, res, next) => {
  // ... (kode isCustomer Anda) ...
  if (req.session.user && req.session.user.role === 'customer') {
    return next();
  }
  return res.redirect('/auth');
};

/* GET all menu items page. */
router.get('/all', isCustomer, async (req, res) => {
  try {
    const [menuItems] = await db.query(
      `SELECT mi.*, c.category_name 
       FROM menu_items mi
       LEFT JOIN categories c ON mi.category_id = c.category_id -- Pastikan kolom join 'category_id'
       WHERE mi.is_active = 1
       ORDER BY c.category_name, mi.name`
    );

    const [categories] = await db.query(`SELECT category_id, category_name FROM categories ORDER BY category_name`);
    
    // Ambil status pesanan terbaru untuk sidebar
    const [latestOrder] = await db.query(
      `SELECT order_id, status 
       FROM orders 
       WHERE user_id = ? 
       ORDER BY order_date DESC 
       LIMIT 1`,
      [req.session.user.user_id]
    );

    const message = req.session.message;
    delete req.session.message;

    res.render('menu/all', {
      user: req.session.user,
      menuItems: menuItems,
      categories: categories,
      message: message,
      title: 'Semua Menu KopiKoni',
      latestOrderStatus: latestOrder.length > 0 ? latestOrder[0] : null
    });
  } catch (err) {
    console.error('Error fetching all menu items:', err);
    req.session.message = { type: 'error', text: 'Gagal memuat semua menu.' };
    res.redirect('/');
  }
});

module.exports = router;