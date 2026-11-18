const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

const archivo = path.resolve(__dirname, '../../outputs/minemarket-titos-database.sql');
const required = ['DB_HOST', 'DB_USER', 'DB_PASSWORD'];
const faltantes = required.filter((key) => !process.env[key]);

if (faltantes.length) {
  console.error(`Faltan variables privadas de conexión: ${faltantes.join(', ')}`);
  process.exit(1);
}

if (!fs.existsSync(archivo)) {
  console.error(`No se encontró el respaldo: ${archivo}`);
  process.exit(1);
}

async function importar() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 4000),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'test',
    multipleStatements: true,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined
  });

  try {
    const sql = fs.readFileSync(archivo, 'utf8');
    await connection.query(sql);
    console.log('Base de datos importada correctamente.');
  } finally {
    await connection.end();
  }
}

importar().catch((error) => {
  console.error('No se pudo importar la base de datos:', error.message);
  process.exitCode = 1;
});
