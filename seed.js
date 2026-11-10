/**
 * Borra TODO (piezas, ventas, fotos y fotos por completar) y carga los datos de ejemplo.
 * La cuenta del local no se toca.
 *
 * Uso:  npm run seed -- --si
 * (sin --si no hace nada, para que nadie lo corra sin querer sobre los datos reales)
 */
require('dotenv').config();
const { pool, asegurarBase, crearEsquema, sincronizarContadores } = require('./db');
const { cargarEjemplo } = require('./ejemplo');

(async () => {
  if (!process.argv.includes('--si')) {
    console.log('Esto borra todas las piezas, ventas y fotos y carga los datos de ejemplo.');
    console.log('Si estás seguro, corré:  npm run seed -- --si');
    process.exit(0);
  }
  await asegurarBase();
  const conn = await pool.getConnection();
  try {
    await crearEsquema(conn);
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of ['ventas', 'pendientes', 'piezas', 'fotos']) await conn.query(`TRUNCATE TABLE ${t}`);
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    await conn.query('UPDATE contadores SET ultimo = 0');
    await cargarEjemplo(conn);
    await sincronizarContadores(conn);
    console.log('✓ Datos de ejemplo cargados.');
  } catch (err) {
    console.error('✗ No se pudieron cargar los datos:', err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
})();
