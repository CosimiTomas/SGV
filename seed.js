/**
 * SGV — Seed de base de datos
 * Crea los 4 usuarios (contraseña con hash bcrypt) y carga lotes de ejemplo.
 *
 * Uso local:    node seed.js
 * Uso Railway:  railway run node seed.js
 *
 * Acepta variables MYSQL* (Railway) o DB_* (XAMPP / .env).
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const USUARIOS = [
  { correo: 'enfermeria@caps.gob.ar',   pass: 'enfermeria123',   rol: 'enfermeria'   },
  { correo: 'coordinacion@caps.gob.ar', pass: 'coordinacion123', rol: 'coordinadora' },
  { correo: 'jefa@caps.gob.ar',         pass: 'jefa123',         rol: 'jefa'         },
  { correo: 'proveedora@caps.gob.ar',   pass: 'proveedora123',   rol: 'proveedora'   },
];

// [nombreVacuna, numeroLote, vencimiento, cantInicial, disponible]
const LOTES = [
  ['Quíntuple',                      'L-2026-Q1', '2026-12-31', 50, 38],
  ['Hepatitis B',                    'L-2025-HB', '2026-11-30', 40,  6],
  ['Triple viral (SRP)',             'L-2026-TV', '2027-01-31', 50, 42],
  ['Antigripal trivalente adultos',  'L-2026-AG', '2026-07-31', 60,  4],
  ['Hepatitis A',                    'L-2026-HA', '2027-09-30', 30, 28],
  ['Varicela',                       'L-2026-VR', '2026-07-15', 25,  5],
  ['VPH nonavalente',                'L-2026-VP', '2027-12-31', 40, 36],
  ['Salk',                           'L-2026-SK', '2027-03-31', 45, 40],
];

async function run() {
  const pool = mysql.createPool({
    host:     process.env.MYSQLHOST     || process.env.DB_HOST     || 'localhost',
    port:     process.env.MYSQLPORT     || process.env.DB_PORT     || 3306,
    user:     process.env.MYSQLUSER     || process.env.DB_USER     || 'root',
    password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.MYSQLDATABASE || process.env.DB_NAME     || 'sgv_caps',
    charset: 'utf8mb4_unicode_ci',
  });
  const conn = await pool.getConnection();
  try {
    console.log('› Limpiando datos previos…');
    await conn.query('DELETE FROM movimientos');
    await conn.query('DELETE FROM lotes');
    await conn.query('DELETE FROM usuarios');
    await conn.query('ALTER TABLE usuarios AUTO_INCREMENT = 1');
    await conn.query('ALTER TABLE lotes AUTO_INCREMENT = 1');
    await conn.query('ALTER TABLE movimientos AUTO_INCREMENT = 1');

    console.log('› Creando usuarios (contraseña con hash bcrypt)…');
    for (const u of USUARIOS) {
      const hash = await bcrypt.hash(u.pass, 10);
      await conn.query('INSERT INTO usuarios (correo, password_hash, rol, activo) VALUES (?,?,?,1)',
        [u.correo, hash, u.rol]);
      console.log(`   · ${u.correo}  (${u.rol})  ->  ${u.pass}`);
    }

    console.log('› Cargando lotes de ejemplo…');
    for (const [nombre, numero, venc, ini, disp] of LOTES) {
      const [[vac]] = await conn.query('SELECT id FROM vacunas WHERE nombre = ?', [nombre]);
      if (!vac) { console.warn(`   ! Vacuna no encontrada: ${nombre}`); continue; }
      const [r] = await conn.query(
        'INSERT INTO lotes (vacuna_id, numero_lote, vencimiento, cantidad_inicial, disponible) VALUES (?,?,?,?,?)',
        [vac.id, numero, venc, ini, disp]);
      const [[enf]] = await conn.query("SELECT id FROM usuarios WHERE rol='enfermeria' LIMIT 1");
      await conn.query('INSERT INTO movimientos (tipo, vacuna_id, lote_id, cantidad, usuario_id) VALUES (?,?,?,?,?)',
        ['ingreso', vac.id, r.insertId, ini, enf.id]);
    }

    console.log('\n✓ Seed completado.');
  } catch (err) {
    console.error('✗ Error en el seed:', err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}
run();
