/**
 * Conexión a MySQL y esquema de la base.
 * Acepta las variables de Railway (MYSQL_URL o MYSQL*) y las locales de XAMPP (DB_*).
 * Al arrancar crea las tablas que falten; nunca borra datos.
 */
require('dotenv').config();
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const PROD = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;

/* Horario de Argentina para "hoy", las horas de las ventas y los días de la semana */
const TZ = /^[+-]\d{2}:\d{2}$/.test(process.env.DB_TIMEZONE || '') ? process.env.DB_TIMEZONE : '-03:00';

/* Catálogo del local (el mismo que usa la página) */
const MATERIALES = {
  oro:         { pre: 'ORO', nombre: 'Oro' },
  plata:       { pre: 'PLA', nombre: 'Plata' },
  acero:       { pre: 'ACE', nombre: 'Acero' },
  'plata-oro': { pre: 'PYO', nombre: 'Plata y oro' },
};
const CATEGORIAS = { anillo: 'Anillo', cadena: 'Cadena', pulsera: 'Pulsera', aros: 'Aros', colgante: 'Colgante', reloj: 'Reloj' };
const PAGOS = ['Efectivo', 'Débito', 'Crédito', 'Transferencia', 'Mercado Pago'];
const nombreAuto = (material, categoria) => `${CATEGORIAS[categoria]} de ${MATERIALES[material].nombre.toLowerCase()}`;

const ENUM_MAT = Object.keys(MATERIALES).map(k => `'${k}'`).join(',');
const ENUM_CAT = Object.keys(CATEGORIAS).map(k => `'${k}'`).join(',');

function configBase() {
  const comun = {
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4_unicode_ci',
    timezone: TZ,
    dateStrings: true,      // fechas como texto: sin corrimientos por zona horaria
  };
  if (process.env.MYSQL_URL) return { ...comun, uri: process.env.MYSQL_URL };
  return {
    ...comun,
    host: process.env.MYSQLHOST || process.env.DB_HOST || 'localhost',
    port: Number(process.env.MYSQLPORT || process.env.DB_PORT || 3306),
    user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
    password: process.env.MYSQLPASSWORD ?? process.env.DB_PASSWORD ?? '',
    database: process.env.MYSQLDATABASE || process.env.DB_NAME || 'stella_maris',
  };
}

/* En la compu (XAMPP) crea la base si todavía no existe; en Railway ya viene creada */
async function asegurarBase() {
  const cfg = configBase();
  if (cfg.uri) return;
  const { database, waitForConnections, connectionLimit, ...sinBase } = cfg;
  const conn = await mysql.createConnection(sinBase);
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database.replace(/`/g, '')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await conn.end();
  }
}

const pool = mysql.createPool(configBase());
const fijarHora = conn => conn.query(`SET time_zone = '${TZ}'`);
pool.on('connection', fijarHora);
if (pool.pool && pool.pool.on) pool.pool.on('connection', fijarHora);

async function crearEsquema(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      usuario       VARCHAR(60)  NOT NULL UNIQUE,
      password_hash VARCHAR(100) NOT NULL,
      creado_en     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  /* Las fotos se guardan en la base: así no se pierden cuando Railway reinicia el servidor */
  await conn.query(`
    CREATE TABLE IF NOT EXISTS fotos (
      id        INT AUTO_INCREMENT PRIMARY KEY,
      clave     CHAR(32)    NOT NULL UNIQUE,
      tipo      VARCHAR(20) NOT NULL,
      datos     MEDIUMBLOB  NOT NULL,
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS piezas (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      codigo          VARCHAR(12)  NOT NULL UNIQUE,
      nombre          VARCHAR(120) NOT NULL,
      material        ENUM(${ENUM_MAT}) NOT NULL,
      categoria       ENUM(${ENUM_CAT}) NOT NULL,
      precio          INT UNSIGNED NOT NULL,
      detalle         VARCHAR(200) NOT NULL DEFAULT '',
      estado          ENUM('disponible','reservado','vendido') NOT NULL DEFAULT 'disponible',
      ingreso         DATE NOT NULL,
      foto_id         INT NULL,
      reserva_cliente VARCHAR(80)  NULL,
      reserva_sena    INT UNSIGNED NULL,
      reserva_fecha   DATE NULL,
      creado_en       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      actualizado_en  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_estado (estado),
      CONSTRAINT fk_pieza_foto FOREIGN KEY (foto_id) REFERENCES fotos(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  /* Cada venta guarda una copia de los datos de la pieza tal como estaban al venderla */
  await conn.query(`
    CREATE TABLE IF NOT EXISTS ventas (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      pieza_id   INT NOT NULL,
      codigo     VARCHAR(12)  NOT NULL,
      nombre     VARCHAR(120) NOT NULL,
      material   ENUM(${ENUM_MAT}) NOT NULL,
      categoria  ENUM(${ENUM_CAT}) NOT NULL,
      precio     INT UNSIGNED NOT NULL,
      sena       INT UNSIGNED NOT NULL DEFAULT 0,
      medio_pago VARCHAR(20)  NOT NULL,
      fecha      DATETIME NOT NULL,
      KEY idx_fecha (fecha),
      CONSTRAINT fk_venta_pieza FOREIGN KEY (pieza_id) REFERENCES piezas(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  /* Fotos subidas que todavía no tienen sus datos ("Por completar") */
  await conn.query(`
    CREATE TABLE IF NOT EXISTS pendientes (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      numero     INT UNSIGNED NOT NULL,
      foto_id    INT NOT NULL,
      material   ENUM(${ENUM_MAT}) NULL,
      categoria  ENUM(${ENUM_CAT}) NULL,
      precio     INT UNSIGNED NOT NULL DEFAULT 0,
      nombre     VARCHAR(120) NOT NULL DEFAULT '',
      detalle    VARCHAR(200) NOT NULL DEFAULT '',
      borrada_en DATETIME NULL,
      creado_en  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_borrada (borrada_en),
      CONSTRAINT fk_pend_foto FOREIGN KEY (foto_id) REFERENCES fotos(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  /* Último número usado por material (para los códigos) y por foto: nunca se repiten */
  await conn.query(`
    CREATE TABLE IF NOT EXISTS contadores (
      nombre VARCHAR(20) PRIMARY KEY,
      ultimo INT UNSIGNED NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const filas = [...Object.keys(MATERIALES), 'foto'].map(k => [k, 0]);
  await conn.query('INSERT IGNORE INTO contadores (nombre, ultimo) VALUES ?', [filas]);
}

/* Lleva los contadores al número más alto que ya exista (por si se cargaron datos a mano) */
async function sincronizarContadores(conn) {
  for (const [material, { pre }] of Object.entries(MATERIALES)) {
    const [[{ max }]] = await conn.query(
      'SELECT COALESCE(MAX(CAST(SUBSTRING(codigo, 5) AS UNSIGNED)), 0) AS max FROM piezas WHERE codigo LIKE ?', [`${pre}-%`]);
    await conn.query('UPDATE contadores SET ultimo = GREATEST(ultimo, ?) WHERE nombre = ?', [Number(max), material]);
  }
  const [[{ max }]] = await conn.query('SELECT COALESCE(MAX(numero), 0) AS max FROM pendientes');
  await conn.query("UPDATE contadores SET ultimo = GREATEST(ultimo, ?) WHERE nombre = 'foto'", [Number(max)]);
}

/* Toma el próximo número de un contador dentro de la transacción en curso (bloquea la fila) */
async function siguiente(conn, nombre) {
  await conn.query('UPDATE contadores SET ultimo = LAST_INSERT_ID(ultimo + 1) WHERE nombre = ?', [nombre]);
  const [[{ n }]] = await conn.query('SELECT LAST_INSERT_ID() AS n');
  return Number(n);
}
async function siguienteCodigo(conn, material) {
  const n = await siguiente(conn, material);
  return `${MATERIALES[material].pre}-${String(n).padStart(3, '0')}`;
}

/* Una sola cuenta para todo el local. Usuario y contraseña salen de las variables
   LOGIN_USUARIO y LOGIN_PASSWORD: cambiar la variable y reiniciar cambia la contraseña
   (y cierra las sesiones abiertas). Devuelve la "versión" de la contraseña para los tokens. */
async function asegurarCuenta(conn) {
  const usuario = String(process.env.LOGIN_USUARIO || 'stellamaris').trim().toLowerCase();
  let clave = process.env.LOGIN_PASSWORD || '';
  const [[actual]] = await conn.query('SELECT id, usuario, password_hash FROM usuarios ORDER BY id LIMIT 1');
  if (!actual) {
    if (!clave) {
      if (PROD) {
        console.error('✗ Falta la variable LOGIN_PASSWORD: no se creó la cuenta del local. Definila y reiniciá.');
        return '';
      }
      clave = 'joyas2026';
      console.warn('! Sin LOGIN_PASSWORD: se creó la cuenta con la clave de prueba "joyas2026". Cambiala antes de usar el sistema en serio.');
    }
    const hash = await bcrypt.hash(clave, 10);
    await conn.query('INSERT INTO usuarios (usuario, password_hash) VALUES (?, ?)', [usuario, hash]);
    console.log(`✓ Cuenta del local creada: ${usuario}`);
    return version(hash);
  }
  let hash = actual.password_hash;
  if (clave && !(await bcrypt.compare(clave, hash))) {
    hash = await bcrypt.hash(clave, 10);
    console.log('› La contraseña cambió (LOGIN_PASSWORD): se actualizó y se cerraron las sesiones abiertas.');
  }
  if (usuario !== actual.usuario || hash !== actual.password_hash) {
    await conn.query('UPDATE usuarios SET usuario = ?, password_hash = ? WHERE id = ?', [usuario, hash, actual.id]);
  }
  return version(hash);
}
const version = hash => crypto.createHash('sha256').update(hash).digest('hex').slice(0, 16);

/* Las fotos borradas se pueden recuperar con "Deshacer"; pasados dos días se eliminan del todo */
async function purgar(conn) {
  await conn.query('DELETE FROM pendientes WHERE borrada_en IS NOT NULL AND borrada_en < NOW() - INTERVAL 2 DAY');
  await conn.query(`
    DELETE f FROM fotos f
      LEFT JOIN piezas p     ON p.foto_id = f.id
      LEFT JOIN pendientes q ON q.foto_id = f.id
     WHERE p.id IS NULL AND q.id IS NULL AND f.creado_en < NOW() - INTERVAL 1 HOUR`);
}

module.exports = {
  pool, PROD, TZ, MATERIALES, CATEGORIAS, PAGOS, nombreAuto,
  asegurarBase, crearEsquema, sincronizarContadores, siguiente, siguienteCodigo, asegurarCuenta, purgar,
};
