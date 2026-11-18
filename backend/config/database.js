const mysql = require('mysql2');
require('dotenv').config();

const db = mysql.createPool({
    host: process.env.DB_HOST || process.env.MYSQLHOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
    user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || 'root',
    database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'inventario_ml',
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    queueLimit: 0,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined
});

db.getConnection((error, connection) => {
    if (error) {
        console.error('❌ Error al conectar con MySQL:', error.message);
        return;
    }

    console.log('✅ Conectado correctamente a MySQL');
    console.log('📦 Base de datos: inventario_ml');

    connection.release();
});

module.exports = db;
