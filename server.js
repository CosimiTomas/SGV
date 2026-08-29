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
const XLSX = require('xlsx-js-style');

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
const TZ_AR = process.env.DB_TIMEZONE || '-03:00';

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
  // Le decimos a mysql2 que interprete TIMESTAMP <-> Date en TZ AR.
  timezone: TZ_AR,
};

const pool = mysql.createPool(dbConfig);

// Setear TZ en cada conexión nueva del pool. Se escucha en los DOS
// niveles (promise pool y callback pool subyacente) porque según la
// versión de mysql2 el evento se emite en uno u otro.
function setTZ(conn) { conn.query(`SET time_zone='${TZ_AR}'`); }
pool.on('connection', setTZ);
if (pool.pool && pool.pool.on) pool.pool.on('connection', setTZ);

/* ------------------------------------------------------------
 * Bootstrap del esquema y catálogo de vacunas
 * Se ejecuta al arrancar el server. Es idempotente: usa
 * CREATE TABLE IF NOT EXISTS e INSERT IGNORE.
 * ---------------------------------------------------------- */
async function bootstrapDatabase() {
  const conn = await pool.getConnection();
  try {
    console.log('› Verificando esquema de base de datos…');

    // Intentar setear la TZ a nivel GLOBAL (afecta también al panel de
    // Railway y a cualquier otro cliente). Requiere privilegio SUPER,
    // que Railway puede o no dar. Si falla, seguimos con el SET de
    // sesión del pool.on que igual cubre las queries de la app.
    try {
      await conn.query(`SET GLOBAL time_zone = '${TZ_AR}'`);
      console.log(`✓ TZ del servidor MySQL fijada a ${TZ_AR} (GLOBAL)`);
    } catch (e) {
      console.log(`› SET GLOBAL time_zone falló (${e.code || e.message}). Se usa solo TZ de sesión.`);
    }
    // SET de sesión en la conexión actual del bootstrap
    await conn.query(`SET time_zone = '${TZ_AR}'`);

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

    // Frascos multidosis abiertos: un frasco se abre al aplicar la primera
    // dosis y vence 30 días después. Solo puede haber uno activo por lote.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS frascos_abiertos (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        lote_id         INT NOT NULL,
        fecha_apertura  DATE NOT NULL,
        dosis_totales   INT NOT NULL,
        dosis_usadas    INT NOT NULL DEFAULT 0,
        estado          ENUM('activo','agotado','vencido') NOT NULL DEFAULT 'activo',
        fecha_cierre    DATE NULL,
        motivo_cierre   VARCHAR(80) NULL,
        CONSTRAINT fk_frasco_lote FOREIGN KEY (lote_id) REFERENCES lotes(id),
        CONSTRAINT chk_frasco_dosis CHECK (dosis_usadas >= 0 AND dosis_usadas <= dosis_totales)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Índices (se intentan crear; si ya existen se ignora)
    const indices = [
      'CREATE INDEX idx_lotes_vacuna ON lotes(vacuna_id)',
      'CREATE INDEX idx_lotes_venc   ON lotes(vencimiento)',
      'CREATE INDEX idx_mov_tipo     ON movimientos(tipo)',
      'CREATE INDEX idx_mov_fecha    ON movimientos(fecha_mov)',
      'CREATE INDEX idx_frasco_lote  ON frascos_abiertos(lote_id)',
      'CREATE INDEX idx_frasco_estado ON frascos_abiertos(estado)',
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

app.get('/api/health', (req, res) => res.json({ ok: true, servicio: 'SGV API' }));

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
    // LEFT JOIN doble: vacunas → lotes → frasco abierto activo (si existe).
    // Así traemos también las vacunas sin lotes y sabemos si un lote
    // multidosis tiene un frasco abierto en curso.
    const [rows] = await pool.query(
      `SELECT l.id, v.nombre AS vacuna, v.dosis_por_frasco, l.numero_lote, l.vencimiento,
              l.cantidad_inicial, l.disponible,
              CASE WHEN l.vencimiento IS NULL THEN NULL
                   ELSE DATEDIFF(l.vencimiento, CURDATE()) END AS dias_para_vencer,
              f.id AS frasco_id,
              f.fecha_apertura AS frasco_apertura,
              CASE WHEN f.fecha_apertura IS NULL THEN NULL
                   ELSE (30 - DATEDIFF(CURDATE(), f.fecha_apertura)) END AS frasco_dias_restantes,
              CASE WHEN f.id IS NULL THEN NULL
                   ELSE (f.dosis_totales - f.dosis_usadas) END AS frasco_dosis_sobrantes
         FROM vacunas v
         LEFT JOIN lotes l ON l.vacuna_id = v.id
         LEFT JOIN frascos_abiertos f ON f.lote_id = l.id AND f.estado = 'activo'
        WHERE v.activa = 1
        ORDER BY v.nombre, l.vencimiento`
    );
    const stock = rows.map(r => {
      let estado;
      if (r.id === null) {
        estado = 'nostock';               // vacuna sin ningún lote
      } else if (r.disponible === 0) {
        estado = 'nostock';               // lote agotado
      } else if (r.dias_para_vencer < 0) {
        estado = 'vencida';
      } else if (r.dias_para_vencer <= DIAS_VENCIMIENTO) {
        estado = 'exp';
      } else if (r.disponible <= UMBRAL_STOCK_BAJO) {
        estado = 'low';
      } else {
        estado = 'ok';
      }
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
          AND DATEDIFF(l.vencimiento, CURDATE()) >= 0
        ORDER BY l.disponible`,
      [UMBRAL_STOCK_BAJO]
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
      `SELECT l.id AS lote_id, v.id AS vacuna_id, v.nombre AS vacuna, v.dosis_por_frasco,
              l.numero_lote, l.vencimiento, DATEDIFF(l.vencimiento, CURDATE()) AS dias, l.disponible
         FROM lotes l JOIN vacunas v ON v.id = l.vacuna_id
        WHERE DATEDIFF(l.vencimiento, CURDATE()) < 0 AND l.disponible > 0
        ORDER BY l.vencimiento`
    );
    // Frascos abiertos vencidos (>30 días desde apertura) con dosis sobrantes
    const [frascosVencidos] = await pool.query(
      `SELECT f.id AS frasco_id, f.lote_id, l.numero_lote, f.fecha_apertura,
              DATEDIFF(CURDATE(), f.fecha_apertura) AS dias_abierto,
              (f.dosis_totales - f.dosis_usadas) AS dosis_sobrantes,
              v.id AS vacuna_id, v.nombre AS vacuna, v.dosis_por_frasco
         FROM frascos_abiertos f
         JOIN lotes l   ON l.id = f.lote_id
         JOIN vacunas v ON v.id = l.vacuna_id
        WHERE f.estado = 'activo'
          AND DATEDIFF(CURDATE(), f.fecha_apertura) > 30
          AND (f.dosis_totales - f.dosis_usadas) > 0
        ORDER BY f.fecha_apertura`
    );
    // Frascos abiertos por vencer (25-30 días de apertura, todavía activos)
    const [frascosPorVencer] = await pool.query(
      `SELECT f.id AS frasco_id, f.lote_id, l.numero_lote, f.fecha_apertura,
              DATEDIFF(CURDATE(), f.fecha_apertura) AS dias_abierto,
              (30 - DATEDIFF(CURDATE(), f.fecha_apertura)) AS dias_restantes,
              (f.dosis_totales - f.dosis_usadas) AS dosis_sobrantes,
              v.nombre AS vacuna, v.dosis_por_frasco
         FROM frascos_abiertos f
         JOIN lotes l   ON l.id = f.lote_id
         JOIN vacunas v ON v.id = l.vacuna_id
        WHERE f.estado = 'activo'
          AND DATEDIFF(CURDATE(), f.fecha_apertura) BETWEEN 25 AND 30
          AND (f.dosis_totales - f.dosis_usadas) > 0
        ORDER BY f.fecha_apertura`
    );
    // Frascos abiertos activos "normales" (menos de 25 días, no urgentes)
    // Van al bloque informativo del dashboard para que enfermería sepa
    // qué frascos están en curso sin que sean alertas.
    const [frascosActivos] = await pool.query(
      `SELECT f.id AS frasco_id, f.lote_id, l.numero_lote, f.fecha_apertura,
              DATEDIFF(CURDATE(), f.fecha_apertura) AS dias_abierto,
              f.dosis_totales,
              (f.dosis_totales - f.dosis_usadas) AS dosis_sobrantes,
              v.nombre AS vacuna
         FROM frascos_abiertos f
         JOIN lotes l   ON l.id = f.lote_id
         JOIN vacunas v ON v.id = l.vacuna_id
        WHERE f.estado = 'activo'
          AND DATEDIFF(CURDATE(), f.fecha_apertura) < 25
          AND (f.dosis_totales - f.dosis_usadas) > 0
        ORDER BY f.fecha_apertura DESC`
    );
    res.json({
      kpis: {
        tipos, unidades,
        stockBajo: bajo.length, porVencer: vencer.length, vencidas: vencidas.length,
        frascosVencidos: frascosVencidos.length,
      },
      alertas: {
        stockBajo: bajo, porVencer: vencer, vencidas,
        frascosVencidos, frascosPorVencer, frascosActivos,
      },
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

/**
 * Edición de lote (corrección de errores de tipeo).
 * Solo se pueden editar el número de lote y la fecha de vencimiento.
 * No se puede editar la vacuna ni las cantidades para no romper la
 * trazabilidad de los movimientos ya registrados.
 */
app.patch('/api/lotes/:id', requireAuth, requireRole('enfermeria'), async (req, res) => {
  const { numero_lote, vencimiento } = req.body;
  if (!numero_lote || !vencimiento)
    return res.status(400).json({ error: 'Completá el número de lote y la fecha de vencimiento.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimiento))
    return res.status(400).json({ error: 'Fecha de vencimiento inválida.' });
  try {
    const [r] = await pool.query(
      'UPDATE lotes SET numero_lote = ?, vencimiento = ? WHERE id = ?',
      [numero_lote.trim(), vencimiento, req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'El lote no existe.' });
    res.json({ ok: true, mensaje: 'Lote actualizado.' });
  } catch (err) {
    console.error('editar lote:', err.message);
    res.status(500).json({ error: 'Error del servidor.' });
  }
});

app.post('/api/aplicaciones', requireAuth, requireRole('enfermeria'), async (req, res) => {
  const { lote_id, cantidad, fecha_aplicacion } = req.body;
  if (!lote_id || !cantidad || !fecha_aplicacion)
    return res.status(400).json({ error: 'Completá todos los campos obligatorios.' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[lote]] = await conn.query(
      `SELECT l.id, l.vacuna_id, l.disponible, v.dosis_por_frasco
         FROM lotes l JOIN vacunas v ON v.id = l.vacuna_id
        WHERE l.id = ? FOR UPDATE`, [lote_id]
    );
    if (!lote) { await conn.rollback(); return res.status(404).json({ error: 'El lote no existe.' }); }
    const cant = Number(cantidad);
    if (cant > lote.disponible) { await conn.rollback(); return res.status(400).json({ error: 'La cantidad supera el stock disponible del lote.' }); }

    // Descuento del stock general del lote
    await conn.query('UPDATE lotes SET disponible = disponible - ? WHERE id = ?', [cant, lote_id]);
    await conn.query(
      `INSERT INTO movimientos (tipo, vacuna_id, lote_id, cantidad, fecha_aplicacion, usuario_id)
       VALUES ('aplicacion',?,?,?,?,?)`,
      [lote.vacuna_id, lote_id, cant, fecha_aplicacion, req.user.id]
    );

    // Gestión automática de frascos abiertos (solo multidosis).
    // La función devuelve info detallada para armar un mensaje claro.
    let frascoInfo = null;
    if (lote.dosis_por_frasco > 1) {
      frascoInfo = await gestionarFrascoAbierto(conn, lote_id, cant, lote.dosis_por_frasco);
    }

    await conn.commit();
    const respuesta = {
      ok: true,
      mensaje: 'Aplicación registrada con éxito.',
    };
    if (frascoInfo) {
      respuesta.frasco = frascoInfo;
    }
    res.status(201).json(respuesta);
  } catch (err) {
    await conn.rollback(); console.error('aplicaciones:', err.message);
    res.status(500).json({ error: 'Error del servidor.' });
  } finally { conn.release(); }
});

/**
 * Gestiona el frasco abierto de un lote multidosis al aplicar dosis.
 * Regla del CAPS: un solo frasco abierto por lote a la vez, se usa hasta
 * agotar o vencer (30 días), recién ahí se abre otro.
 *
 * Devuelve un objeto con info del último frasco tocado, para que el
 * frontend arme un toast enriquecido:
 *   { abrioNuevo: bool, nombreVacuna, fechaVencimientoFrasco (ISO date),
 *     dosisRestantes, diasParaVencer }
 */
async function gestionarFrascoAbierto(conn, lote_id, cantidad, dosisPorFrasco) {
  let restantes = cantidad;
  let abrioNuevo = false;
  let ultimoFrascoId = null;

  while (restantes > 0) {
    const [[frasco]] = await conn.query(
      `SELECT id, dosis_totales, dosis_usadas, fecha_apertura
         FROM frascos_abiertos
        WHERE lote_id = ? AND estado = 'activo'
        LIMIT 1 FOR UPDATE`, [lote_id]
    );

    if (!frasco) {
      // Abrir uno nuevo
      const usar = Math.min(restantes, dosisPorFrasco);
      const nuevoEstado = (usar === dosisPorFrasco) ? 'agotado' : 'activo';
      const [r] = await conn.query(
        `INSERT INTO frascos_abiertos (lote_id, fecha_apertura, dosis_totales, dosis_usadas, estado, fecha_cierre)
         VALUES (?, CURDATE(), ?, ?, ?, ?)`,
        [lote_id, dosisPorFrasco, usar, nuevoEstado, nuevoEstado === 'agotado' ? new Date() : null]
      );
      restantes -= usar;
      abrioNuevo = true;
      ultimoFrascoId = r.insertId;
    } else {
      const espacioLibre = frasco.dosis_totales - frasco.dosis_usadas;
      const usar = Math.min(restantes, espacioLibre);
      const nuevasUsadas = frasco.dosis_usadas + usar;
      if (nuevasUsadas >= frasco.dosis_totales) {
        await conn.query(
          `UPDATE frascos_abiertos SET dosis_usadas = ?, estado = 'agotado', fecha_cierre = CURDATE()
            WHERE id = ?`, [nuevasUsadas, frasco.id]
        );
      } else {
        await conn.query(
          `UPDATE frascos_abiertos SET dosis_usadas = ? WHERE id = ?`,
          [nuevasUsadas, frasco.id]
        );
      }
      restantes -= usar;
      ultimoFrascoId = frasco.id;
    }
  }

  // Buscar info del último frasco tocado para devolver al frontend
  if (ultimoFrascoId) {
    const [[f]] = await conn.query(
      `SELECT f.fecha_apertura, f.dosis_totales, f.dosis_usadas, f.estado,
              (f.dosis_totales - f.dosis_usadas) AS dosis_restantes,
              (30 - DATEDIFF(CURDATE(), f.fecha_apertura)) AS dias_para_vencer,
              DATE_ADD(f.fecha_apertura, INTERVAL 30 DAY) AS fecha_vencimiento_frasco
         FROM frascos_abiertos f WHERE f.id = ?`, [ultimoFrascoId]
    );
    return {
      abrioNuevo,
      dosisRestantes: f.dosis_restantes,
      diasParaVencer: f.dias_para_vencer,
      fechaVencimientoFrasco: f.fecha_vencimiento_frasco,
      agotado: f.estado === 'agotado',
    };
  }
  return null;
}

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

/**
 * Descarte de frasco multidosis abierto vencido (>30 días de apertura).
 * Descuenta las dosis restantes del stock del lote y registra el movimiento
 * con motivo "Frasco abierto vencido". Marca el frasco como vencido.
 */
app.post('/api/descartes/frasco/:id', requireAuth, requireRole('enfermeria'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[frasco]] = await conn.query(
      `SELECT f.id, f.lote_id, f.dosis_totales, f.dosis_usadas, f.estado,
              l.vacuna_id
         FROM frascos_abiertos f
         JOIN lotes l ON l.id = f.lote_id
        WHERE f.id = ? FOR UPDATE`, [req.params.id]
    );
    if (!frasco) { await conn.rollback(); return res.status(404).json({ error: 'Frasco no encontrado.' }); }
    if (frasco.estado !== 'activo') { await conn.rollback(); return res.status(400).json({ error: 'El frasco ya no está activo.' }); }
    const dosisAdescartar = frasco.dosis_totales - frasco.dosis_usadas;
    if (dosisAdescartar > 0) {
      await conn.query('UPDATE lotes SET disponible = disponible - ? WHERE id = ?', [dosisAdescartar, frasco.lote_id]);
      await conn.query(
        `INSERT INTO movimientos (tipo, vacuna_id, lote_id, cantidad, motivo, usuario_id)
         VALUES ('descarte',?,?,?,?,?)`,
        [frasco.vacuna_id, frasco.lote_id, dosisAdescartar, 'Frasco abierto vencido', req.user.id]
      );
    }
    await conn.query(
      `UPDATE frascos_abiertos SET estado = 'vencido', fecha_cierre = CURDATE(), motivo_cierre = 'Vencimiento a los 30 días'
        WHERE id = ?`, [frasco.id]
    );
    await conn.commit();
    res.json({ ok: true, dosis_descartadas: dosisAdescartar, mensaje: `Se descartó el frasco con ${dosisAdescartar} dosis sobrantes.` });
  } catch (err) {
    await conn.rollback(); console.error('descartes/frasco:', err.message);
    res.status(500).json({ error: 'Error del servidor.' });
  } finally { conn.release(); }
});

/**
 * RESET completo — solo para fase de prueba.
 * Borra todos los lotes y movimientos para empezar de cero.
 * NO toca usuarios ni catálogo de vacunas (sino habría que reseedear).
 * Reinicia los AUTO_INCREMENT para que los IDs vuelvan a 1.
 */
app.post('/api/admin/reset', requireAuth, requireRole('enfermeria'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Orden importante por foreign keys: primero movimientos y frascos, después lotes
    const [mov] = await conn.query('DELETE FROM movimientos');
    await conn.query('DELETE FROM frascos_abiertos');
    const [lot] = await conn.query('DELETE FROM lotes');
    await conn.query('ALTER TABLE movimientos AUTO_INCREMENT = 1');
    await conn.query('ALTER TABLE frascos_abiertos AUTO_INCREMENT = 1');
    await conn.query('ALTER TABLE lotes AUTO_INCREMENT = 1');
    await conn.commit();
    res.json({
      ok: true,
      lotes: lot.affectedRows,
      movimientos: mov.affectedRows,
      mensaje: `Se borraron ${lot.affectedRows} lote(s) y ${mov.affectedRows} movimiento(s).`,
    });
  } catch (err) {
    await conn.rollback(); console.error('admin/reset:', err.message);
    res.status(500).json({ error: 'Error del servidor.' });
  } finally { conn.release(); }
});

/**
 * Carga datos de prueba variados (fase de desarrollo).
 * Agrega lotes que cubren todos los estados posibles: OK, stock bajo,
 * por vencer, vencidos, monodosis y multidosis. También agrega algunas
 * aplicaciones y descartes distribuidos en el tiempo para poder probar
 * los filtros del historial. NO borra los datos existentes.
 */
app.post('/api/admin/cargar-prueba', requireAuth, requireRole('enfermeria'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [vacs] = await conn.query('SELECT id, nombre, dosis_por_frasco FROM vacunas WHERE activa = 1');
    const vacPorNombre = Object.fromEntries(vacs.map(v => [v.nombre, v]));
    const userId = req.user.id;
    const hoy = new Date();
    const iso = (d) => d.toISOString().slice(0, 10);
    const isoDT = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
    const restar = (d, n) => { const c = new Date(d); c.setDate(c.getDate() - n); return c; };
    const sumar  = (d, n) => { const c = new Date(d); c.setDate(c.getDate() + n); return c; };

    /* ==========================================================
       LOTES — cubren todos los estados: OK, stock bajo, por vencer,
       vencido, monodosis y multidosis. Usamos 12 vacunas de las 18
       del catálogo para que queden 6 sin stock (así se prueba también
       la vista de vacunas sin stock).
       ========================================================== */
    const lotesPrueba = [
      // === Monodosis OK (stock normal, vencimiento lejano) ===
      { vacuna: 'Triple viral (SRP)',             lote: 'SRP-2027-001', diasVenc:  240, cantidad: 60 },
      { vacuna: 'Rotavirus monovalente',          lote: 'RV-2027-042',  diasVenc:  180, cantidad: 45 },
      { vacuna: 'Neumococo conjugada VCN 20',     lote: 'NM-2027-115',  diasVenc:  300, cantidad: 40 },

      // === Monodosis stock bajo (poco disponible, vence lejos) ===
      { vacuna: 'Doble viral (SR)',               lote: 'DV-2027-B12',  diasVenc:  150, cantidad: 8 },
      { vacuna: 'Varicela',                       lote: 'VR-2027-C33',  diasVenc:  120, cantidad: 5 },

      // === Monodosis por vencer (5-15 días) ===
      { vacuna: 'Hepatitis A',                    lote: 'HA-2026-P07',  diasVenc:    7, cantidad: 30 },
      { vacuna: 'Antimeningocócica tetravalente conjugada', lote: 'AM-2026-P12', diasVenc: 12, cantidad: 25 },

      // === Monodosis VENCIDA (para banner rojo + descarte masivo) ===
      { vacuna: 'Antigripal trivalente adultos',  lote: 'AG-2026-V05',  diasVenc:   -5, cantidad: 15 },

      // === Multidosis OK — Hepatitis B (10 dosis/frasco), buen stock ===
      { vacuna: 'Hepatitis B',                    lote: 'HB-2027-M01',  diasVenc:  240, cantidad: 60 },

      // === Multidosis stock bajo — Salk (5 dosis/frasco), 2 frascos ===
      { vacuna: 'Salk',                           lote: 'SK-2027-M02',  diasVenc:  100, cantidad: 10 },

      // === Multidosis por vencer — dTpa (10 dosis/frasco) ===
      { vacuna: 'Triple bacteriana acelular dTpa',lote: 'TDP-2026-M03', diasVenc:    8, cantidad: 20 },

      // === Multidosis VENCIDA — dT (10 dosis/frasco) ===
      { vacuna: 'Doble bacteriana (dT)',          lote: 'DT-2026-M04',  diasVenc:  -10, cantidad: 30 },
    ];

    const lotesCreados = [];
    for (const l of lotesPrueba) {
      const vac = vacPorNombre[l.vacuna];
      if (!vac) continue;
      const vencStr = iso(sumar(hoy, l.diasVenc));
      const fechaIngreso = restar(hoy, 20); // ingresados hace 20 días para que los ingresos aparezcan en el historial
      const [r] = await conn.query(
        `INSERT INTO lotes (vacuna_id, numero_lote, vencimiento, cantidad_inicial, disponible)
         VALUES (?,?,?,?,?)`,
        [vac.id, l.lote, vencStr, l.cantidad, l.cantidad]
      );
      await conn.query(
        `INSERT INTO movimientos (tipo, vacuna_id, lote_id, cantidad, fecha_mov, usuario_id)
         VALUES ('ingreso',?,?,?,?,?)`,
        [vac.id, r.insertId, l.cantidad, isoDT(fechaIngreso), userId]
      );
      lotesCreados.push({
        id: r.insertId, vacuna_id: vac.id, dosis_por_frasco: vac.dosis_por_frasco,
        disponible: l.cantidad, vencido: l.diasVenc < 0,
      });
    }

    /* ==========================================================
       APLICACIONES distribuidas en el tiempo — para probar filtros
       de fecha en Movimientos (hoy, ayer, esta semana, este mes,
       mes pasado). Solo se aplican dosis de lotes NO vencidos.
       ========================================================== */
    const aplicaciones = [
      // Hoy
      { loteIdx: 0, cantidad: 3, diasAtras: 0 },   // Triple viral
      { loteIdx: 2, cantidad: 2, diasAtras: 0 },   // Neumococo
      // Ayer
      { loteIdx: 0, cantidad: 2, diasAtras: 1 },
      // Últimos 7 días
      { loteIdx: 1, cantidad: 5, diasAtras: 3 },   // Rotavirus
      { loteIdx: 2, cantidad: 4, diasAtras: 5 },
      { loteIdx: 5, cantidad: 2, diasAtras: 6 },   // Hep A (por vencer)
      // Este mes
      { loteIdx: 6, cantidad: 3, diasAtras: 14 },  // Antimenin (por vencer)
      { loteIdx: 1, cantidad: 6, diasAtras: 18 },
      // Mes pasado (para probar el filtro de fecha "hasta")
      { loteIdx: 2, cantidad: 3, diasAtras: 35 },
      { loteIdx: 0, cantidad: 4, diasAtras: 45 },
    ];
    for (const a of aplicaciones) {
      const lote = lotesCreados[a.loteIdx];
      if (!lote || lote.vencido || a.cantidad > lote.disponible) continue;
      const fecha = restar(hoy, a.diasAtras);
      const fechaStr = iso(fecha);
      const fechaDT = isoDT(new Date(fecha.setHours(10, 30, 0, 0)));
      await conn.query('UPDATE lotes SET disponible = disponible - ? WHERE id = ?', [a.cantidad, lote.id]);
      await conn.query(
        `INSERT INTO movimientos (tipo, vacuna_id, lote_id, cantidad, fecha_aplicacion, fecha_mov, usuario_id)
         VALUES ('aplicacion',?,?,?,?,?,?)`,
        [lote.vacuna_id, lote.id, a.cantidad, fechaStr, fechaDT, userId]
      );
      lote.disponible -= a.cantidad;
    }

    /* ==========================================================
       DESCARTES con distintos motivos para probar el historial y
       los filtros del Excel.
       ========================================================== */
    const descartes = [
      { loteIdx: 4, cantidad: 1, motivo: 'Rotura / derrame',    diasAtras: 3 },  // Varicela
      { loteIdx: 3, cantidad: 1, motivo: 'Cadena de frío',      diasAtras: 8 },  // Doble viral
      { loteIdx: 1, cantidad: 2, motivo: 'Vencimiento',         diasAtras: 20 }, // Rotavirus
      { loteIdx: 5, cantidad: 1, motivo: 'Otro',                diasAtras: 12 }, // Hep A
    ];
    for (const d of descartes) {
      const lote = lotesCreados[d.loteIdx];
      if (!lote || lote.vencido || d.cantidad > lote.disponible) continue;
      const fecha = restar(hoy, d.diasAtras);
      const fechaDT = isoDT(new Date(fecha.setHours(14, 15, 0, 0)));
      await conn.query('UPDATE lotes SET disponible = disponible - ? WHERE id = ?', [d.cantidad, lote.id]);
      await conn.query(
        `INSERT INTO movimientos (tipo, vacuna_id, lote_id, cantidad, motivo, fecha_mov, usuario_id)
         VALUES ('descarte',?,?,?,?,?,?)`,
        [lote.vacuna_id, lote.id, d.cantidad, d.motivo, fechaDT, userId]
      );
      lote.disponible -= d.cantidad;
    }

    /* ==========================================================
       FRASCOS ABIERTOS — cubren los 4 estados posibles:
        - activo recién abierto (~2 días)
        - activo por vencer (28 días, cae en la alerta de stock bajo)
        - vencido con sobrantes (>30 días, cae en el banner rojo)
        - agotado (todas las dosis usadas)
       Se ubican en los lotes multidosis NO vencidos.
       ========================================================== */
    // Índices de los lotes multidosis por su posición en lotesPrueba
    const idxHepB = 8;   // Hepatitis B — recién abierto
    const idxSalk = 9;   // Salk — por vencer
    const idxDtpa = 10;  // dTpa — agotado (frasco cerrado ya, abrimos nuevo)
    // dT (idxDtM = 11) está vencido como lote, no se le abre frasco

    // Necesitamos un multidosis extra para el vencido con sobrantes.
    // Usamos Salk también: creamos un frasco vencido histórico en el mismo lote.
    // Alternativa más limpia: agregamos otro lote multidosis para el vencido.
    // Para no ensuciar el conteo de lotes, usamos Hep B (que tiene stock de sobra).

    const escenariosFrasco = [
      // Recién abierto: Hep B, hace 2 días, 3 dosis usadas de 10
      { loteIdx: idxHepB, diasAtras: 2,  usadas: 3, estado: 'activo' },
      // Por vencer: Salk, hace 28 días, 3 dosis usadas de 5
      { loteIdx: idxSalk, diasAtras: 28, usadas: 3, estado: 'activo' },
      // Vencido con sobrantes: Hep B, hace 35 días, 4 dosis usadas de 10 (6 sobrantes)
      { loteIdx: idxHepB, diasAtras: 35, usadas: 4, estado: 'activo' },
      // Agotado: dTpa, hace 15 días, 10 dosis usadas de 10 (histórico, no molesta)
      { loteIdx: idxDtpa, diasAtras: 15, usadas: 10, estado: 'agotado' },
    ];

    for (const esc of escenariosFrasco) {
      const lote = lotesCreados[esc.loteIdx];
      if (!lote || lote.vencido) continue;
      const dpf = lote.dosis_por_frasco;
      if (dpf < 2) continue;                 // solo multidosis
      if (esc.usadas > lote.disponible) continue; // no descontar más de lo que hay
      const fechaAp = restar(hoy, esc.diasAtras);
      const cierre = esc.estado === 'agotado' ? iso(restar(hoy, esc.diasAtras - 8)) : null;
      await conn.query(
        `INSERT INTO frascos_abiertos (lote_id, fecha_apertura, dosis_totales, dosis_usadas, estado, fecha_cierre)
         VALUES (?,?,?,?,?,?)`,
        [lote.id, iso(fechaAp), dpf, esc.usadas, esc.estado, cierre]
      );
      // Descontar del stock las dosis efectivamente usadas y generar aplicaciones
      if (esc.usadas > 0) {
        await conn.query('UPDATE lotes SET disponible = disponible - ? WHERE id = ?', [esc.usadas, lote.id]);
        // Distribuimos las aplicaciones a lo largo de la vida del frasco
        for (let i = 0; i < esc.usadas; i++) {
          const fApp = restar(hoy, Math.max(0, esc.diasAtras - i * 2));
          await conn.query(
            `INSERT INTO movimientos (tipo, vacuna_id, lote_id, cantidad, fecha_aplicacion, fecha_mov, usuario_id)
             VALUES ('aplicacion',?,?,?,?,?,?)`,
            [lote.vacuna_id, lote.id, 1, iso(fApp), isoDT(new Date(fApp.setHours(9, 0, 0, 0))), userId]
          );
        }
        lote.disponible -= esc.usadas;
      }
    }

    await conn.commit();
    res.json({
      ok: true,
      lotes: lotesCreados.length,
      mensaje: `Se cargaron ${lotesCreados.length} lotes con datos completos para probar todos los escenarios.`,
    });
  } catch (err) {
    await conn.rollback();
    console.error('admin/cargar-prueba:', err.message);
    res.status(500).json({ error: 'Error del servidor: ' + err.message });
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
 * REPORTES — descarga de Excel (.xlsx)
 * Todos requieren autenticación. Cualquier rol puede descargar.
 * ========================================================= */
// Estilos base reutilizables (paleta alineada con la app)
const XLSX_STYLES = {
  border: {
    top:    { style: 'thin', color: { rgb: 'D0D5DD' } },
    bottom: { style: 'thin', color: { rgb: 'D0D5DD' } },
    left:   { style: 'thin', color: { rgb: 'D0D5DD' } },
    right:  { style: 'thin', color: { rgb: 'D0D5DD' } },
  },
  header: {
    fill: { patternType: 'solid', fgColor: { rgb: '0FA99E' } },
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11, name: 'Calibri' },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  },
  cellBase: {
    font: { sz: 10, name: 'Calibri' },
    alignment: { vertical: 'center', wrapText: true },
  },
  zebra: {
    fill: { patternType: 'solid', fgColor: { rgb: 'F7FAF9' } },
  },
};

// Paleta de estado (Stock)
const ESTADO_STYLE = {
  'Vencida':     { fill: { patternType: 'solid', fgColor: { rgb: 'FDE8E4' } }, font: { bold: true, color: { rgb: '7A1E14' }, sz: 10, name: 'Calibri' } },
  'Por vencer':  { fill: { patternType: 'solid', fgColor: { rgb: 'FEECEB' } }, font: { bold: true, color: { rgb: 'A02814' }, sz: 10, name: 'Calibri' } },
  'Stock bajo':  { fill: { patternType: 'solid', fgColor: { rgb: 'FDF3D9' } }, font: { bold: true, color: { rgb: '795000' }, sz: 10, name: 'Calibri' } },
  'OK':          { fill: { patternType: 'solid', fgColor: { rgb: 'E4F4EA' } }, font: { bold: true, color: { rgb: '155F35' }, sz: 10, name: 'Calibri' } },
  'Sin stock':   { fill: { patternType: 'solid', fgColor: { rgb: 'EFF2F1' } }, font: { bold: true, color: { rgb: '6B7572' }, sz: 10, name: 'Calibri' } },
};
// Paleta de tipo de movimiento
const TIPO_STYLE = {
  'Ingreso':    { fill: { patternType: 'solid', fgColor: { rgb: 'E4F4EA' } }, font: { bold: true, color: { rgb: '155F35' }, sz: 10, name: 'Calibri' } },
  'Aplicación': { fill: { patternType: 'solid', fgColor: { rgb: 'E4EFF9' } }, font: { bold: true, color: { rgb: '134A7E' }, sz: 10, name: 'Calibri' } },
  'Descarte':   { fill: { patternType: 'solid', fgColor: { rgb: 'FEECEB' } }, font: { bold: true, color: { rgb: 'A02814' }, sz: 10, name: 'Calibri' } },
};

// Convierte índice numérico (0-based) a letra de columna Excel (0→A, 25→Z, 26→AA)
function colLetter(idx) {
  let s = '';
  idx++;
  while (idx > 0) {
    const rem = (idx - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    idx = Math.floor((idx - 1) / 26);
  }
  return s;
}

/**
 * Genera un .xlsx con formato profesional: header teal, bordes finos en
 * todas las celdas, zebra en filas alternadas, y coloreado condicional
 * de columnas específicas (Estado / Tipo).
 *
 * @param {*} res response HTTP
 * @param {string} filename nombre del archivo
 * @param {string} sheetName nombre de la hoja
 * @param {Array<Object>} rows array de objetos con los datos
 * @param {Object} opts { colorearCol: 'Nombre', paleta: {valor: styleObj}, tituloReporte: 'Texto opcional' }
 */
function sendXlsx(res, filename, sheetName, rows, opts = {}) {
  const wb = XLSX.utils.book_new();
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

  // Armamos la matriz manualmente para tener control total sobre el estilo
  // Si viene título de reporte, va en la fila 1 fusionado; los datos empiezan más abajo
  let filaInicioDatos = 0;
  const aoa = [];
  const merges = [];

  if (opts.tituloReporte) {
    aoa.push([opts.tituloReporte]);
    aoa.push([`Generado: ${new Date().toLocaleString('es-AR')}`]);
    aoa.push([]); // fila en blanco
    filaInicioDatos = 3;
    if (headers.length > 1) {
      merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } });
      merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } });
    }
  }
  aoa.push(headers);
  rows.forEach(r => aoa.push(headers.map(h => r[h] ?? '')));

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  if (merges.length) ws['!merges'] = merges;

  // Autoancho por columna
  ws['!cols'] = headers.map(h => {
    const maxLen = Math.max(h.length, ...rows.map(r => String(r[h] ?? '').length));
    return { wch: Math.min(Math.max(maxLen + 2, 12), 42) };
  });

  // Altura mínima para header
  ws['!rows'] = [];
  if (opts.tituloReporte) {
    ws['!rows'][0] = { hpt: 24 };
    ws['!rows'][1] = { hpt: 16 };
  }
  ws['!rows'][filaInicioDatos] = { hpt: 28 };

  // Estilos del título si lo hay
  if (opts.tituloReporte) {
    ws[colLetter(0) + '1'].s = {
      font: { bold: true, sz: 14, color: { rgb: '0B5C56' }, name: 'Calibri' },
      alignment: { horizontal: 'left', vertical: 'center' },
    };
    ws[colLetter(0) + '2'].s = {
      font: { italic: true, sz: 9, color: { rgb: '6B7572' }, name: 'Calibri' },
      alignment: { horizontal: 'left', vertical: 'center' },
    };
  }

  // Estilos del header
  headers.forEach((_, c) => {
    const addr = colLetter(c) + (filaInicioDatos + 1);
    if (ws[addr]) ws[addr].s = { ...XLSX_STYLES.header, border: XLSX_STYLES.border };
  });

  // Estilos de las filas de datos
  rows.forEach((row, i) => {
    const rowIdx = filaInicioDatos + 1 + i; // 1-based
    const zebra = i % 2 === 1;
    headers.forEach((h, c) => {
      const addr = colLetter(c) + (rowIdx + 1);
      if (!ws[addr]) return;
      let style = { ...XLSX_STYLES.cellBase, border: XLSX_STYLES.border };
      if (zebra) style = { ...style, ...XLSX_STYLES.zebra };
      // Coloreado condicional para la columna indicada
      if (opts.colorearCol && h === opts.colorearCol && opts.paleta) {
        const p = opts.paleta[row[h]];
        if (p) style = { ...style, ...p, border: XLSX_STYLES.border, alignment: { horizontal: 'center', vertical: 'center' } };
      }
      ws[addr].s = style;
    });
  });

  // Freeze header
  ws['!freeze'] = { xSplit: 0, ySplit: filaInicioDatos + 1 };
  ws['!autofilter'] = {
    ref: `${colLetter(0)}${filaInicioDatos + 1}:${colLetter(headers.length - 1)}${filaInicioDatos + 1 + rows.length}`
  };

  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buf);
}

// Etiqueta de estado a partir de días y disponible (misma lógica que /api/stock)
function estadoLote(dias, disponible) {
  if (dias < 0) return 'Vencida';
  if (dias <= DIAS_VENCIMIENTO) return 'Por vencer';
  if (disponible <= UMBRAL_STOCK_BAJO) return 'Stock bajo';
  return 'OK';
}

// Reporte 1: Stock general (todas las vacunas activas, incluyendo las sin lotes)
app.get('/api/reportes/stock', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT v.nombre AS vacuna, v.dosis_por_frasco, l.numero_lote, l.vencimiento,
              l.disponible,
              CASE WHEN l.vencimiento IS NULL THEN NULL
                   ELSE DATEDIFF(l.vencimiento, CURDATE()) END AS dias
         FROM vacunas v
         LEFT JOIN lotes l ON l.vacuna_id = v.id
        WHERE v.activa = 1
        ORDER BY v.nombre, l.vencimiento`
    );
    const data = rows.map(r => {
      const sinStock = r.numero_lote === null || r.disponible === 0;
      return {
        'Vacuna': r.vacuna,
        'Presentación': r.dosis_por_frasco > 1 ? `Frasco × ${r.dosis_por_frasco}` : 'Monodosis',
        'N° de lote': r.numero_lote || '—',
        'Vencimiento': fmtFechaAR(r.vencimiento) || '—',
        'Días para vencer': r.dias ?? '—',
        'Dosis disponibles': r.disponible ?? 0,
        'Frascos disponibles': (r.dosis_por_frasco > 1 && r.disponible)
          ? Math.floor(r.disponible / r.dosis_por_frasco) : '',
        'Estado': sinStock ? 'Sin stock' : estadoLote(r.dias, r.disponible),
      };
    });
    const fecha = new Date().toISOString().slice(0, 10);
    sendXlsx(res, `SGV_stock_${fecha}.xlsx`, 'Stock', data, {
      tituloReporte: 'SGV — Stock general del CAPS San José Obrero',
      colorearCol: 'Estado',
      paleta: ESTADO_STYLE,
    });
  } catch (err) { console.error(err.message); res.status(500).json({ error: 'Error del servidor.' }); }
});

// Reporte 2: Stock de una vacuna específica
app.get('/api/reportes/stock/:vacunaId', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT v.nombre AS vacuna, v.dosis_por_frasco, l.numero_lote, l.vencimiento,
              l.cantidad_inicial, l.disponible,
              DATEDIFF(l.vencimiento, CURDATE()) AS dias
         FROM lotes l JOIN vacunas v ON v.id = l.vacuna_id
        WHERE v.id = ? ORDER BY l.vencimiento`,
      [req.params.vacunaId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'No hay lotes cargados para esa vacuna.' });
    const vacuna = rows[0].vacuna;
    const data = rows.map(r => ({
      'N° de lote': r.numero_lote,
      'Vencimiento': fmtFechaAR(r.vencimiento),
      'Días para vencer': r.dias,
      'Cantidad inicial (dosis)': r.cantidad_inicial,
      'Disponible (dosis)': r.disponible,
      'Frascos disponibles': r.dosis_por_frasco > 1 ? Math.floor(r.disponible / r.dosis_por_frasco) : '',
      'Estado': estadoLote(r.dias, r.disponible),
    }));
    const fecha = new Date().toISOString().slice(0, 10);
    const nombreArchivo = vacuna.replace(/[^\w-]+/g, '_');
    sendXlsx(res, `SGV_stock_${nombreArchivo}_${fecha}.xlsx`, vacuna.slice(0, 31), data, {
      tituloReporte: `SGV — Stock de ${vacuna}`,
      colorearCol: 'Estado',
      paleta: ESTADO_STYLE,
    });
  } catch (err) { console.error(err.message); res.status(500).json({ error: 'Error del servidor.' }); }
});

// Reporte 3: Movimientos (con filtros combinables: tipo, vacuna, desde, hasta)
// Query params: ?tipo=X&vacuna=Nombre&desde=YYYY-MM-DD&hasta=YYYY-MM-DD
app.get('/api/reportes/movimientos', requireAuth, async (req, res) => {
  try {
    const { tipo, vacuna, desde, hasta } = req.query;
    let sql =
      `SELECT m.tipo, v.nombre AS vacuna, l.numero_lote, m.cantidad, m.motivo,
              m.fecha_aplicacion, m.fecha_mov, u.rol AS responsable
         FROM movimientos m
         JOIN vacunas v  ON v.id = m.vacuna_id
         JOIN lotes l    ON l.id = m.lote_id
         JOIN usuarios u ON u.id = m.usuario_id
        WHERE 1=1`;
    const params = [];
    if (tipo && ['aplicacion', 'descarte', 'ingreso'].includes(tipo)) {
      sql += ' AND m.tipo = ?'; params.push(tipo);
    }
    if (vacuna) {
      sql += ' AND v.nombre = ?'; params.push(vacuna);
    }
    if (desde && /^\d{4}-\d{2}-\d{2}$/.test(desde)) {
      sql += ' AND DATE(m.fecha_mov) >= ?'; params.push(desde);
    }
    if (hasta && /^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
      sql += ' AND DATE(m.fecha_mov) <= ?'; params.push(hasta);
    }
    sql += ' ORDER BY m.fecha_mov DESC';
    const [rows] = await pool.query(sql, params);
    const TIPO_LBL = { ingreso: 'Ingreso', aplicacion: 'Aplicación', descarte: 'Descarte' };
    const data = rows.map(r => ({
      'Tipo': TIPO_LBL[r.tipo] || r.tipo,
      'Vacuna': r.vacuna,
      'N° de lote': r.numero_lote,
      'Cantidad (dosis)': r.cantidad,
      'Motivo': r.motivo || '',
      'Fecha aplicación': fmtFechaAR(r.fecha_aplicacion),
      'Fecha del movimiento': fmtFechaARHora(r.fecha_mov),
      'Responsable': r.responsable,
    }));
    // Construir título y sufijo según los filtros aplicados
    const fecha = new Date().toISOString().slice(0, 10);
    const filtros = [];
    if (tipo)   filtros.push(TIPO_LBL[tipo] || tipo);
    if (vacuna) filtros.push(vacuna);
    if (desde)  filtros.push(`desde ${desde}`);
    if (hasta)  filtros.push(`hasta ${hasta}`);
    const tituloFiltros = filtros.length ? ' — ' + filtros.join(', ') : '';
    const sufArchivo = filtros.length ? '_filtrado' : '_completo';
    sendXlsx(res, `SGV_movimientos${sufArchivo}_${fecha}.xlsx`, 'Movimientos', data, {
      tituloReporte: `SGV — Historial de movimientos${tituloFiltros}`,
      colorearCol: 'Tipo',
      paleta: TIPO_STYLE,
    });
  } catch (err) { console.error(err.message); res.status(500).json({ error: 'Error del servidor.' }); }
});

// Helpers de formato AR para los reportes
function fmtFechaAR(v) {
  if (!v) return '';
  try {
    const d = (typeof v === 'string') ? new Date(v + (v.length === 10 ? 'T00:00:00' : '')) : new Date(v);
    if (isNaN(d)) return String(v);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  } catch { return String(v); }
}
function fmtFechaARHora(v) {
  if (!v) return '';
  try {
    const d = (typeof v === 'string') ? new Date(v) : new Date(v);
    if (isNaN(d)) return String(v);
    const f = fmtFechaAR(d);
    const h = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    return `${f} ${h}`;
  } catch { return String(v); }
}

/* ===========================================================
 * USUARIOS — solo coordinadora
 * ========================================================= */
const soloCoord = [requireAuth, requireRole('coordinadora')];
const ROLES_VALIDOS = ['enfermeria', 'coordinadora', 'jefa', 'proveedora'];

app.get('/api/usuarios', soloCoord, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, correo, rol, activo FROM usuarios ORDER BY rol, correo');
    res.json(rows);
  } catch (err) { console.error(err.message); res.status(500).json({ error: 'Error del servidor.' }); }
});

app.post('/api/usuarios', soloCoord, async (req, res) => {
  const { correo, rol, password } = req.body;
  if (!correo || !rol || !password || !ROLES_VALIDOS.includes(rol))
    return res.status(400).json({ error: 'Completá correo, rol y contraseña.' });
  if (password.length < 6)
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
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

// Editar correo y/o rol de un usuario existente
app.patch('/api/usuarios/:id', soloCoord, async (req, res) => {
  const id = Number(req.params.id);
  const { correo, rol } = req.body;
  if (!correo && !rol) return res.status(400).json({ error: 'Nada para actualizar.' });
  if (rol && !ROLES_VALIDOS.includes(rol)) return res.status(400).json({ error: 'Rol inválido.' });
  // Prevención: no permitir cambiar el propio rol
  if (rol && id === req.user.id) return res.status(400).json({ error: 'No podés cambiar tu propio rol.' });
  try {
    // Si se cambia el rol y el usuario que se edita es la última coordinadora activa, bloquear
    if (rol && rol !== 'coordinadora') {
      const [[u]] = await pool.query('SELECT rol, activo FROM usuarios WHERE id = ?', [id]);
      if (u && u.rol === 'coordinadora' && u.activo) {
        const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM usuarios WHERE rol='coordinadora' AND activo=1");
        if (n <= 1) return res.status(400).json({ error: 'No se puede quitar el rol de la única coordinadora activa.' });
      }
    }
    const campos = [], vals = [];
    if (correo) { campos.push('correo = ?'); vals.push(correo.trim().toLowerCase()); }
    if (rol)    { campos.push('rol = ?');    vals.push(rol); }
    vals.push(id);
    const [r] = await pool.query(`UPDATE usuarios SET ${campos.join(', ')} WHERE id = ?`, vals);
    if (!r.affectedRows) return res.status(404).json({ error: 'Usuario no encontrado.' });
    res.json({ ok: true, mensaje: 'Usuario actualizado.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ese correo ya está en uso.' });
    console.error(err.message); res.status(500).json({ error: 'Error del servidor.' });
  }
});

app.patch('/api/usuarios/:id/estado', soloCoord, async (req, res) => {
  const id = Number(req.params.id);
  // Prevenciones: no auto-desactivarse, no desactivar la última coordinadora activa
  if (id === req.user.id) return res.status(400).json({ error: 'No podés desactivarte a vos misma.' });
  try {
    const [[u]] = await pool.query('SELECT rol, activo FROM usuarios WHERE id = ?', [id]);
    if (!u) return res.status(404).json({ error: 'Usuario no encontrado.' });
    // Si se está desactivando (estaba activo) y es coordinadora, revisar que quede alguna
    if (u.activo && u.rol === 'coordinadora') {
      const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM usuarios WHERE rol='coordinadora' AND activo=1");
      if (n <= 1) return res.status(400).json({ error: 'No se puede desactivar la única coordinadora activa.' });
    }
    await pool.query('UPDATE usuarios SET activo = NOT activo WHERE id = ?', [id]);
    res.json({ ok: true, mensaje: u.activo ? 'Usuario desactivado.' : 'Usuario activado.' });
  } catch (err) { console.error(err.message); res.status(500).json({ error: 'Error del servidor.' }); }
});

app.patch('/api/usuarios/:id/password', soloCoord, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Indicá la nueva contraseña.' });
  if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const [r] = await pool.query('UPDATE usuarios SET password_hash = ? WHERE id = ?', [hash, req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Usuario no encontrado.' });
    res.json({ ok: true, mensaje: 'Contraseña actualizada.' });
  } catch (err) { console.error(err.message); res.status(500).json({ error: 'Error del servidor.' }); }
});

/* ===========================================================
 * CATÁLOGO DE VACUNAS — ABM solo para coordinadora
 * (el GET /api/vacunas que ya existe devuelve solo activas y lo
 *  usan todos los roles para los selectores de lote/aplicación/etc.)
 * ========================================================= */

// Listado completo (activas + inactivas) para el panel de coordinadora
app.get('/api/catalogo/vacunas', soloCoord, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT v.id, v.nombre, v.dosis_por_frasco, v.activa,
              (SELECT COUNT(*) FROM lotes l WHERE l.vacuna_id = v.id) AS cant_lotes
         FROM vacunas v ORDER BY v.activa DESC, v.nombre`
    );
    res.json(rows);
  } catch (err) { console.error(err.message); res.status(500).json({ error: 'Error del servidor.' }); }
});

// Alta de vacuna nueva
app.post('/api/catalogo/vacunas', soloCoord, async (req, res) => {
  const { nombre, dosis_por_frasco } = req.body;
  const dpf = Number(dosis_por_frasco);
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'Ingresá el nombre de la vacuna.' });
  if (!Number.isInteger(dpf) || dpf < 1) return res.status(400).json({ error: 'Dosis por frasco debe ser un número entero mayor o igual a 1.' });
  try {
    const [r] = await pool.query(
      'INSERT INTO vacunas (nombre, dosis_por_frasco, activa) VALUES (?,?,1)',
      [nombre.trim(), dpf]
    );
    res.status(201).json({ ok: true, id: r.insertId, mensaje: 'Vacuna agregada al catálogo.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe una vacuna con ese nombre.' });
    console.error(err.message); res.status(500).json({ error: 'Error del servidor.' });
  }
});

// Editar / dar de baja / reactivar vacuna. Todos los campos son opcionales.
app.patch('/api/catalogo/vacunas/:id', soloCoord, async (req, res) => {
  const { nombre, dosis_por_frasco, activa } = req.body;
  const campos = [], vals = [];
  if (nombre !== undefined) {
    if (!nombre.trim()) return res.status(400).json({ error: 'El nombre no puede estar vacío.' });
    campos.push('nombre = ?'); vals.push(nombre.trim());
  }
  if (dosis_por_frasco !== undefined) {
    const dpf = Number(dosis_por_frasco);
    if (!Number.isInteger(dpf) || dpf < 1) return res.status(400).json({ error: 'Dosis por frasco debe ser entero ≥ 1.' });
    campos.push('dosis_por_frasco = ?'); vals.push(dpf);
  }
  if (activa !== undefined) {
    campos.push('activa = ?'); vals.push(activa ? 1 : 0);
  }
  if (campos.length === 0) return res.status(400).json({ error: 'Nada para actualizar.' });
  vals.push(req.params.id);
  try {
    const [r] = await pool.query(`UPDATE vacunas SET ${campos.join(', ')} WHERE id = ?`, vals);
    if (!r.affectedRows) return res.status(404).json({ error: 'Vacuna no encontrada.' });
    res.json({ ok: true, mensaje: 'Catálogo actualizado.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe otra vacuna con ese nombre.' });
    console.error(err.message); res.status(500).json({ error: 'Error del servidor.' });
  }
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
