const mysql = require('mysql2/promise');

const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'kopikoni',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

(async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Terhubung ke database MySQL.');
    connection.release();
  } catch (err) {
    console.error('❌ Gagal terhubung ke database:', err.message);
  }
})();


module.exports = pool;
