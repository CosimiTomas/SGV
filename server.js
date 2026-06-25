/**
 * ============================================================
 * SGV — Sistema de Gestión de Vacunas
 * CAPS San José Obrero · Hurlingham · Equipo N° 01 (ILM)
 * ------------------------------------------------------------
 * Servidor completo en un solo archivo: conexión a MySQL,
 * autenticación JWT, control de roles y todas las rutas de la API.
 *
 * Compatible con XAMPP local y con Railway (lee MYSQL* o DB_*).
 * Al arrancar crea las tablas si no existen (idempotente).
 * ============================================================
 */
require('dotenv').config();
const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'dev_secret';

// Reglas de negocio definidas con enfermería
// Umbral en DOSIS. Coincide en los tres casos definidos con la clienta:
//   monodosis        → 10 dosis
//   Salk (5/frasco)  → 2 frascos = 10 dosis
//   x 10/frasco      → 1 frasco  = 10 dosis
// La lectura visual (dosis vs. frascos) la maneja el frontend.
const UMBRAL_STOCK_BAJO = 10;
const DIAS_VENCIMIENTO = 15;     // por vencer: dentro de 15 días

/* ------------------------------------------------------------
 * Conexión a MySQL
 * Acepta variables de Railway (MYSQL*) y locales (DB_*).
 * ---------------------------------------------------------- */
const dbConfig = {
  host:     process.env.MYSQLHOST     || process.env.DB_HOST     || 'localhost',
  port:     process.env.MYSQLPORT     || process.env.DB_PORT     || 3306,
  user:     process.env.MYSQLUSER     || process.env.DB_USER     || 'root',
  password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '',
  database: process.env.MYSQLDATABASE || process.env.DB_NAME     || 'sgv_caps',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4_unicode_ci',
  // Argentina (Buenos Aires). MySQL en Railway corre en UTC por default y los
  // CURRENT_TIMESTAMP quedan 3h adelantados respecto de la hora local.
  // Esta opción le dice a mysql2 cómo interpretar las fechas al leer/escribir.
  timezone: process.env.DB_TIMEZONE || '-03:00',
};

const pool = mysql.createPool(dbConfig);

// Forzar la zona horaria de cada conexión del pool. Esto afecta a
// CURRENT_TIMESTAMP, NOW(), CURDATE() y a cómo MySQL convierte los
// TIMESTAMP almacenados (que internamente son UTC) al leer. Combinado
// con la opción `timezone` de arriba, todo el flujo queda en hora AR.
pool.on('connection', (conn) => {
  conn.query(`SET time_zone='${dbConfig.timezone}'`);
});

/* ------------------------------------------------------------
 * Bootstrap del esquema y catálogo de vacunas
 * Se ejecuta al arrancar el server. Es idempotente: usa
 * CREATE TABLE IF NOT EXISTS e INSERT IGNORE.
 * ---------------------------------------------------------- */
async function bootstrapDatabase() {
  const conn = await pool.getConnection();
  try {
    console.log('› Verificando esquema de base de datos…');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        correo        VARCHAR(120) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        rol           ENUM('enfermeria','coordinadora','jefa','proveedora') NOT NULL,
        activo        TINYINT(1) NOT NULL DEFAULT 1,
        creado_en     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS vacunas (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        nombre           VARCHAR(120) NOT NULL UNIQUE,
        dosis_por_frasco INT NOT NULL DEFAULT 1,
        activa           TINYINT(1) NOT NULL DEFAULT 1
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS lotes (
        id                INT AUTO_INCREMENT PRIMARY KEY,
        vacuna_id         INT NOT NULL,
        numero_lote       VARCHAR(60) NOT NULL,
        vencimiento       DATE NOT NULL,
        cantidad_inicial  INT NOT NULL,
        disponible        INT NOT NULL,
        creado_en         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_lote_vacuna FOREIGN KEY (vacuna_id) REFERENCES vacunas(id),
        CONSTRAINT chk_cantidad CHECK (cantidad_inicial > 0),
        CONSTRAINT chk_disponible CHECK (disponible >= 0)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS movimientos (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        tipo            ENUM('aplicacion','descarte','ingreso') NOT NULL,
        vacuna_id       INT NOT NULL,
        lote_id         INT NOT NULL,
        cantidad        INT NOT NULL,
        motivo          VARCHAR(120) NULL,
        fecha_aplicacion DATE NULL,
        fecha_mov       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        usuario_id      INT NOT NULL,
        CONSTRAINT fk_mov_vacuna  FOREIGN KEY (vacuna_id)  REFERENCES vacunas(id),
        CONSTRAINT fk_mov_lote    FOREIGN KEY (lote_id)    REFERENCES lotes(id),
        CONSTRAINT fk_mov_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
        CONSTRAINT chk_mov_cantidad CHECK (cantidad > 0)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Índices (se intentan crear; si ya existen se ignora)
    const indices = [
      'CREATE INDEX idx_lotes_vacuna ON lotes(vacuna_id)',
      'CREATE INDEX idx_lotes_venc   ON lotes(vencimiento)',
      'CREATE INDEX idx_mov_tipo     ON movimientos(tipo)',
      'CREATE INDEX idx_mov_fecha    ON movimientos(fecha_mov)',
    ];
    for (const sql of indices) {
      try { await conn.query(sql); }
      catch (e) { if (e.code !== 'ER_DUP_KEYNAME') throw e; }
    }

    // Catálogo de vacunas (lista real del CAPS)
    const catalogo = [
      'Antigripal adyuvantada',
      'Antigripal trivalente adultos',
      'Antigripal trivalente pediátrica',
      'Antimeningocócica tetravalente conjugada',
      'Doble bacteriana (dT)',
      'Doble viral (SR)',
      'Hepatitis A',
      'Hepatitis B',
      'Neumococo conjugada VCN 20',
      'Quíntuple',
      'Rotavirus monovalente',
      'Salk',
      'Tetravalente contra el Dengue',
      'Triple bacteriana acelular (dTpa)',
      'Triple viral (SRP)',
      'VPH nonavalente',
      'Varicela',
      'Virus Sincicial Respiratorio',
    ];
    for (const nombre of catalogo) {
      await conn.query('INSERT IGNORE INTO vacunas (nombre) VALUES (?)', [nombre]);
    }

    // Migración: agregar columna dosis_por_frasco a bases que ya existían
    // sin ella (deploy previo a esta versión). Idempotente.
    try {
      await conn.query('ALTER TABLE vacunas ADD COLUMN dosis_por_frasco INT NOT NULL DEFAULT 1');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }

    // Vacunas multidosis (confirmadas con la clienta).
    // El UPDATE es idempotente: si ya tienen el valor correcto no hace nada.
    const multidosis = [
      ['Hepatitis B',                        10],
      ['Doble bacteriana (dT)',              10],
      ['Triple bacteriana acelular (dTpa)',  10],
      ['Salk',                                5],
    ];
    for (const [nombre, dpf] of multidosis) {
      await conn.query('UPDATE vacunas SET dosis_por_frasco = ? WHERE nombre = ?', [dpf, nombre]);
    }

    // Auto-seed de usuarios si la tabla está vacía y SEED_ON_BOOT=true
    if (process.env.SEED_ON_BOOT === 'true') {
      const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM usuarios');
      if (n === 0) {
        console.log('› Creando usuarios iniciales (SEED_ON_BOOT=true)…');
        const USUARIOS = [
          { correo: 'enfermeria@caps.gob.ar',   pass: 'enfermeria123',   rol: 'enfermeria'   },
          { correo: 'coordinacion@caps.gob.ar', pass: 'coordinacion123', rol: 'coordinadora' },
          { correo: 'jefa@caps.gob.ar',         pass: 'jefa123',         rol: 'jefa'         },
          { correo: 'proveedora@caps.gob.ar',   pass: 'proveedora123',   rol: 'proveedora'   },
        ];
        for (const u of USUARIOS) {
          const hash = await bcrypt.hash(u.pass, 10);
          await conn.query('INSERT INTO usuarios (correo, password_hash, rol, activo) VALUES (?,?,?,1)',
            [u.correo, hash, u.rol]);
          console.log(`   · ${u.correo}  (${u.rol})`);
        }
      }
    }

    console.log('✓ Esquema listo.');
  } finally {
    conn.release();
  }
}

/* ------------------------------------------------------------
 * Middleware de autenticación y roles (RF05)
 * ---------------------------------------------------------- */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado.' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Sesión inválida o expirada.' });
  }
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'No tenés permisos para esta acción.' });
    }
    next();
  };
}

/* ------------------------------------------------------------
 * App
 * ---------------------------------------------------------- */
const app = express();
app.use(express.json());
// Servir HTML/JS/CSS con cache-control no-cache para que el browser
// revalide siempre antes de usar la copia en caché. Sin esto, después
// de un deploy nuevo el usuario sigue viendo los assets viejos por
// horas (o hasta que vacíe caché a mano).
app.use(express.static(__dirname, {
  setHeaders: (res, filePath) => {
    if (/\.(html|js|css)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

app.get('/api/health', (req, res) => res.json({
  ok: true,
  servicio: 'SGV API',
  version: 'v2-vencidas-y-multidosis-2026-06-25'
}));

/* ===========================================================
 * AUTENTICACIÓN — CU01 / RF05
 * ========================================================= */
app.post('/api/login', async (req, res) => {
  const { correo, password } = req.body;
  if (!correo || !password) {
    return res.status(400).json({ error: 'Completá todos los campos obligatorios.' });
  }
  try {
    const [rows] = await pool.query(
      'SELECT id, correo, password_hash, rol, activo FROM usuarios WHERE correo = ?',
      [correo.trim().toLowerCase()]
    );
    const user = rows[0];
    if (!user || !user.activo) return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });

    const token = jwt.sign({ id: user.id, correo: user.correo, rol: user.rol }, SECRET, { expiresIn: '8h' });
    res.json({ token, usuario: { id: user.id, correo: user.correo, rol: user.rol } });
  } catch (err) {
    console.error('login:', err.message);
    res.status(500).json({ error: 'Error del servidor.' });
  }
});

app.get('/api/me', requireAuth, (req, res) => res.json({ usuario: req.user }));

/* ===========================================================
 * CONSULTAS — CU04 / RF07 (dashboard) · RF02 (alertas)
 * ========================================================= */
app.get('/api/vacunas', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, nombre, dosis_por_frasco FROM vacunas WHERE activa = 1 ORDER BY nombre');
    res.json(rows);
  } catch (err) { console.error(err.message); res.status(500).json({ error: 'Error del servidor.' }); }
});

app.get('/api/vacunas/:id/lotes', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, numero_lote, vencimiento, disponible
         FROM lotes WHERE vacuna_id = ? AND disponible > 0 ORDER BY vencimiento`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { console.error(err.message); res.status(500).json({ error: 'Error del servidor.' }); }
});

app.get('/api/stock', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT l.id, v.nombre AS vacuna, v.dosis_por_frasco, l.numero_lote, l.vencimiento,
              l.cantidad_inicial, l.disponible,
              DATEDIFF(l.vencimiento, CURDATE()) AS dias_para_vencer
         FROM lotes l JOIN vacunas v ON v.id = l.vacuna_id
        ORDER BY v.nombre, l.vencimiento`
    );
    const stock = rows.map(r => {
      let estado = 'ok';
      if (r.dias_para_vencer < 0) estado = 'vencida';
      else if (r.dias_para_vencer <= DIAS_VENCIMIENTO) estado = 'exp';
      else if (r.disponible <= UMBRAL_STOCK_BAJO) estado = 'low';
      return { ...r, estado };
    });
    res.json(stock);
  } catch (err) { console.error(err.message); res.status(500).json({ error: 'Error del servidor.' }); }
});

app.get('/api/dashboard', requireAuth, async (req, res) => {
  try {
    const [[{ tipos }]]     = await pool.query('SELECT COUNT(DISTINCT vacuna_id) AS tipos FROM lotes WHERE disponible > 0');
    const [[{ unidades }]]  = await pool.query('SELECT COALESCE(SUM(disponible),0) AS unidades FROM lotes');
    const [bajo] = await pool.query(
      `SELECT v.nombre AS vacuna, v.dosis_por_frasco, l.disponible
         FROM lotes l JOIN vacunas v ON v.id = l.vacuna_id
        WHERE l.disponible <= ? AND l.disponible > 0
          AND DATEDIFF(l.vencimiento, CURDATE()) > ? ORDER BY l.disponible`,
      [UMBRAL_STOCK_BAJO, DIAS_VENCIMIENTO]
    );
    // Por vencer = entre 0 y 15 días (incluye hoy)
    const [vencer] = await pool.query(
      `SELECT v.nombre AS vacuna, v.dosis_por_frasco, l.vencimiento, DATEDIFF(l.vencimiento, CURDATE()) AS dias
         FROM lotes l JOIN vacunas v ON v.id = l.vacuna_id
        WHERE DATEDIFF(l.vencimiento, CURDATE()) BETWEEN 0 AND ? AND l.disponible > 0
        ORDER BY l.vencimiento`,
      [DIAS_VENCIMIENTO]
    );
    // Vencidas = ya pasó la fecha y todavía hay stock disponible (no se descartó)
    const [vencidas] = await pool.query(
      `SELECT v.nombre AS vacuna, v.dosis_por_frasco, l.vencimiento, DATEDIFF(l.vencimiento, CURDATE()) AS dias, l.disponible
         FROM lotes l JOIN vacunas v ON v.id = l.vacuna_id
        WHERE DATEDIFF(l.vencimiento, CURDATE()) < 0 AND l.disponible > 0
        ORDER BY l.vencimiento`
    );
    res.json({
      kpis: { tipos, unidades, stockBajo: bajo.length, porVencer: vencer.length, vencidas: vencidas.length },
      alertas: { stockBajo: bajo, porVencer: vencer, vencidas },
      umbrales: { stockBajo: UMBRAL_STOCK_BAJO, diasVencimiento: DIAS_VENCIMIENTO },
    });
  } catch (err) { console.error(err.message); res.status(500).json({ error: 'Error del servidor.' }); }
});

/* ===========================================================
 * ESCRITURA — solo enfermería (RF05)
 * ========================================================= */
app.post('/api/lotes', requireAuth, requireRole('enfermeria'), async (req, res) => {
  const { vacuna_id, numero_lote, vencimiento, cantidad } = req.body;
  if (!vacuna_id || !numero_lote || !vencimiento || !cantidad)
    return res.status(400).json({ error: 'Completá todos los campos obligatorios.' });
  if (Number(cantidad) <= 0) return res.status(400).json({ error: 'La cantidad debe ser mayor a cero.' });
  if (vencimiento < new Date().toISOString().slice(0, 10))
    return res.status(400).json({ error: 'La fecha de vencimiento no puede ser anterior a hoy.' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query(
      `INSERT INTO lotes (vacuna_id, numero_lote, vencimiento, cantidad_inicial, disponible) VALUES (?,?,?,?,?)`,
      [vacuna_id, numero_lote.trim(), vencimiento, cantidad, cantidad]
    );
    await conn.query(
      `INSERT INTO movimientos (tipo, vacuna_id, lote_id, cantidad, usuario_id) VALUES ('ingreso',?,?,?,?)`,
      [vacuna_id, r.insertId, cantidad, req.user.id]
    );
    await conn.commit();
    res.status(201).json({ ok: true, lote_id: r.insertId, mensaje: 'Lote ingresado con éxito.' });
  } catch (err) {
    await conn.rollback(); console.error('lotes:', err.message);
    res.status(500).json({ error: 'Error del servidor.' });
  } finally { conn.release(); }
});

app.post('/api/aplicaciones', requireAuth, requireRole('enfermeria'), async (req, res) => {
  const { lote_id, cantidad, fecha_aplicacion } = req.body;
  if (!lote_id || !cantidad || !fecha_aplicacion)
    return res.status(400).json({ error: 'Completá todos los campos obligatorios.' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[lote]] = await conn.query('SELECT id, vacuna_id, disponible FROM lotes WHERE id = ? FOR UPDATE', [lote_id]);
    if (!lote) { await conn.rollback(); return res.status(404).json({ error: 'El lote no existe.' }); }
    if (Number(cantidad) > lote.disponible) { await conn.rollback(); return res.status(400).json({ error: 'La cantidad supera el stock disponible del lote.' }); }
    await conn.query('UPDATE lotes SET disponible = disponible - ? WHERE id = ?', [cantidad, lote_id]);
    await conn.query(
      `INSERT INTO movimientos (tipo, vacuna_id, lote_id, cantidad, fecha_aplicacion, usuario_id)
       VALUES ('aplicacion',?,?,?,?,?)`,
      [lote.vacuna_id, lote_id, cantidad, fecha_aplicacion, req.user.id]
    );
    await conn.commit();
    res.status(201).json({ ok: true, mensaje: 'Aplicación registrada con éxito.' });
  } catch (err) {
    await conn.rollback(); console.error('aplicaciones:', err.message);
    res.status(500).json({ error: 'Error del servidor.' });
  } finally { conn.release(); }
});

app.post('/api/descartes', requireAuth, requireRole('enfermeria'), async (req, res) => {
  const { lote_id, cantidad, motivo } = req.body;
  if (!lote_id || !cantidad || !motivo)
    return res.status(400).json({ error: 'Completá todos los campos. Indicá el motivo del descarte.' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[lote]] = await conn.query('SELECT id, vacuna_id, disponible FROM lotes WHERE id = ? FOR UPDATE', [lote_id]);
    if (!lote) { await conn.rollback(); return res.status(404).json({ error: 'El lote no existe.' }); }
    if (Number(cantidad) > lote.disponible) { await conn.rollback(); return res.status(400).json({ error: 'La cantidad supera el stock disponible del lote.' }); }
    await conn.query('UPDATE lotes SET disponible = disponible - ? WHERE id = ?', [cantidad, lote_id]);
    await conn.query(
      `INSERT INTO movimientos (tipo, vacuna_id, lote_id, cantidad, motivo, usuario_id)
       VALUES ('descarte',?,?,?,?,?)`,
      [lote.vacuna_id, lote_id, cantidad, motivo, req.user.id]
    );
    await conn.commit();
    res.status(201).json({ ok: true, mensaje: 'Descarte registrado.' });
  } catch (err) {
    await conn.rollback(); console.error('descartes:', err.message);
    res.status(500).json({ error: 'Error del servidor.' });
  } finally { conn.release(); }
});

/* ===========================================================
 * HISTORIAL — RF08
 * ========================================================= */
app.get('/api/movimientos', requireAuth, async (req, res) => {
  try {
    const { tipo } = req.query;
    let sql =
      `SELECT m.id, m.tipo, v.nombre AS vacuna, l.numero_lote, m.cantidad, m.motivo,
              m.fecha_aplicacion, m.fecha_mov, u.rol AS responsable
         FROM movimientos m
         JOIN vacunas v  ON v.id = m.vacuna_id
         JOIN lotes l    ON l.id = m.lote_id
         JOIN usuarios u ON u.id = m.usuario_id`;
    const params = [];
    if (tipo && ['aplicacion', 'descarte', 'ingreso'].includes(tipo)) { sql += ' WHERE m.tipo = ?'; params.push(tipo); }
    sql += ' ORDER BY m.fecha_mov DESC LIMIT 200';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) { console.error(err.message); res.status(500).json({ error: 'Error del servidor.' }); }
});

/* ===========================================================
 * USUARIOS — solo coordinadora
 * ========================================================= */
const soloCoord = [requireAuth, requireRole('coordinadora')];

app.get('/api/usuarios', soloCoord, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, correo, rol, activo FROM usuarios ORDER BY rol');
    res.json(rows);
  } catch (err) { console.error(err.message); res.status(500).json({ error: 'Error del servidor.' }); }
});

app.post('/api/usuarios', soloCoord, async (req, res) => {
  const { correo, rol, password } = req.body;
  const roles = ['enfermeria', 'coordinadora', 'jefa', 'proveedora'];
  if (!correo || !rol || !password || !roles.includes(rol)) return res.status(400).json({ error: 'Datos inválidos.' });
  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO usuarios (correo, password_hash, rol, activo) VALUES (?,?,?,1)',
      [correo.trim().toLowerCase(), hash, rol]);
    res.status(201).json({ ok: true, mensaje: 'Usuario creado.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe un usuario con ese correo.' });
    console.error(err.message); res.status(500).json({ error: 'Error del servidor.' });
  }
});

app.patch('/api/usuarios/:id/estado', soloCoord, async (req, res) => {
  try {
    const [r] = await pool.query('UPDATE usuarios SET activo = NOT activo WHERE id = ?', [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Usuario no encontrado.' });
    res.json({ ok: true, mensaje: 'Estado actualizado.' });
  } catch (err) { console.error(err.message); res.status(500).json({ error: 'Error del servidor.' }); }
});

app.patch('/api/usuarios/:id/password', soloCoord, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Indicá la nueva contraseña.' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const [r] = await pool.query('UPDATE usuarios SET password_hash = ? WHERE id = ?', [hash, req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Usuario no encontrado.' });
    res.json({ ok: true, mensaje: 'Contraseña actualizada.' });
  } catch (err) { console.error(err.message); res.status(500).json({ error: 'Error del servidor.' }); }
});

/* ------------------------------------------------------------
 * Arranque: primero bootstrap del esquema, después listen.
 * ---------------------------------------------------------- */
bootstrapDatabase()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () =>
      console.log(`\n  SGV en ejecución  ->  puerto ${PORT}\n`));
  })
  .catch(err => {
    console.error('✗ Error al inicializar la base de datos:', err.message);
    process.exit(1);
  });

module.exports = { app, pool };
