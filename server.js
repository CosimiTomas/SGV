/**
 * ============================================================
 * Stella Maris Joyas — Sistema de stock y ventas
 * Av. Libertador San Martín 2038, Caseros
 * ------------------------------------------------------------
 * Servidor: API con Express, base MySQL, ingreso con JWT + bcrypt
 * (una sola cuenta para todo el local) y fotos guardadas en la base.
 * La página (carpeta public/) se sirve desde acá mismo.
 *
 * Funciona con XAMPP (variables DB_*) y con Railway (MYSQL_URL o MYSQL*).
 * ============================================================
 */
require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const {
  pool, PROD, MATERIALES, CATEGORIAS, PAGOS, nombreAuto,
  asegurarBase, crearEsquema, sincronizarContadores, siguiente, siguienteCodigo, asegurarCuenta, purgar,
} = require('./db');
const { cargarEjemplo } = require('./ejemplo');

const PORT = process.env.PORT || 3000;
let SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('! Falta JWT_SECRET: se usa una clave temporal y las sesiones se cierran cada vez que reinicia el servidor.');
}
let VERSION_CLAVE = '';   // cambia cuando cambia la contraseña: invalida las sesiones viejas

/* ------------------------------------------------------------
 * Arranque de la base: tablas, cuenta del local y contadores
 * ---------------------------------------------------------- */
async function prepararBase() {
  await asegurarBase();
  const conn = await pool.getConnection();
  try {
    console.log('› Verificando la base de datos…');
    await crearEsquema(conn);
    VERSION_CLAVE = await asegurarCuenta(conn);
    if (process.env.DATOS_EJEMPLO === 'true') {
      const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM piezas');
      if (Number(n) === 0) {
        console.log('› Cargando los datos de ejemplo (DATOS_EJEMPLO=true)…');
        await cargarEjemplo(conn);
      }
    }
    await sincronizarContadores(conn);
    await purgar(conn);
    console.log('✓ Base lista.');
  } finally {
    conn.release();
  }
}

/* ------------------------------------------------------------
 * Ayudas
 * ---------------------------------------------------------- */
class Aviso extends Error {
  constructor(status, mensaje) { super(mensaje); this.status = status; }
}
/* Envuelve cada ruta: los errores esperados vuelven con su mensaje, los demás como error del servidor */
const ruta = fn => async (req, res) => {
  try { await fn(req, res); }
  catch (err) {
    if (err instanceof Aviso) return res.status(err.status).json({ error: err.message });
    console.error(`${req.method} ${req.path}:`, err.message);
    res.status(500).json({ error: 'Error del servidor. Probá de nuevo en un momento.' });
  }
};
/* Corre una función dentro de una transacción */
async function enTransaccion(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const r = await fn(conn);
    await conn.commit();
    return r;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

const texto = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
function entero(v, { min = 0, max = 999999999 } = {}) {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}
const codigoValido = c => /^[A-Z]{3}-\d{3,7}$/.test(c);
const urlFoto = clave => (clave ? `/api/fotos/${clave}` : null);

const SQL_PIEZA = `
  SELECT p.id, p.codigo, p.nombre, p.material, p.categoria, p.precio, p.detalle, p.estado,
         DATEDIFF(CURDATE(), p.ingreso) AS dias,
         p.reserva_cliente, p.reserva_sena, DATEDIFF(CURDATE(), p.reserva_fecha) AS reserva_dias,
         f.clave AS foto
    FROM piezas p LEFT JOIN fotos f ON f.id = p.foto_id`;
const piezaJSON = r => ({
  id: r.id, codigo: r.codigo, nombre: r.nombre, material: r.material, categoria: r.categoria,
  precio: r.precio, detalle: r.detalle, estado: r.estado, dias: Number(r.dias) || 0,
  reserva: r.reserva_cliente != null ? { cliente: r.reserva_cliente, sena: r.reserva_sena || 0, dias: Number(r.reserva_dias) || 0 } : null,
  foto: urlFoto(r.foto),
});

const SQL_VENTA = `
  SELECT v.id, v.codigo, v.nombre, v.material, v.categoria, v.precio, v.medio_pago,
         DATE_FORMAT(v.fecha, '%H:%i') AS hora, f.clave AS foto
    FROM ventas v JOIN piezas p ON p.id = v.pieza_id LEFT JOIN fotos f ON f.id = p.foto_id`;
const ventaJSON = r => ({
  id: r.id, codigo: r.codigo, nombre: r.nombre, material: r.material, categoria: r.categoria,
  precio: r.precio, medio: r.medio_pago, hora: r.hora, foto: urlFoto(r.foto),
});

const SQL_PENDIENTE = `
  SELECT q.id, q.numero, q.material, q.categoria, q.precio, q.nombre, q.detalle, f.clave AS foto
    FROM pendientes q JOIN fotos f ON f.id = q.foto_id`;
const pendienteJSON = r => ({
  id: r.id, numero: r.numero, material: r.material, categoria: r.categoria,
  precio: r.precio, nombre: r.nombre, detalle: r.detalle, foto: urlFoto(r.foto),
});

async function leerPieza(db, codigo) {
  const [[r]] = await db.query(`${SQL_PIEZA} WHERE p.codigo = ?`, [codigo]);
  return r ? piezaJSON(r) : null;
}
async function leerPendiente(db, id) {
  const [[r]] = await db.query(`${SQL_PENDIENTE} WHERE q.id = ?`, [id]);
  return r ? pendienteJSON(r) : null;
}
/* Busca una pieza que siga en el local (no vendida) y la bloquea hasta terminar la transacción */
async function piezaEnLocal(conn, codigo) {
  if (!codigoValido(codigo)) throw new Aviso(404, 'No se encontró la pieza.');
  const [[p]] = await conn.query('SELECT * FROM piezas WHERE codigo = ? FOR UPDATE', [codigo]);
  if (!p) throw new Aviso(404, 'No se encontró la pieza.');
  if (p.estado === 'vendido') throw new Aviso(409, `${codigo} ya figura como vendida.`);
  return p;
}

/* Las fotos llegan ya achicadas desde el navegador (JPEG de hasta 1600 px) */
const recibirImagen = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '8mb' });
function tipoImagen(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'image/png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}
async function guardarFoto(conn, buf) {
  const tipo = tipoImagen(buf);
  if (!tipo) throw new Aviso(415, 'El archivo no es una foto válida (JPG, PNG o WEBP).');
  const clave = crypto.randomBytes(16).toString('hex');
  const [r] = await conn.query('INSERT INTO fotos (clave, tipo, datos) VALUES (?, ?, ?)', [clave, tipo, buf]);
  return r.insertId;
}
async function borrarFotoSiQuedoSuelta(conn, fotoId) {
  if (!fotoId) return;
  await conn.query(`
    DELETE f FROM fotos f
      LEFT JOIN piezas p     ON p.foto_id = f.id
      LEFT JOIN pendientes q ON q.foto_id = f.id
     WHERE f.id = ? AND p.id IS NULL AND q.id IS NULL`, [fotoId]);
}

/* ------------------------------------------------------------
 * App, seguridad y archivos de la página
 * ---------------------------------------------------------- */
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);   // Railway pasa la IP real del cliente por un proxy

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  if (PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
});
app.use(express.json({ limit: '100kb' }));
/* Solo se publica la carpeta public/ (el código del servidor y el .env nunca se sirven).
   HTML, JS y CSS se revalidan siempre, así después de cada deploy se ve la versión nueva. */
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, archivo) => {
    if (/\.(html|js|css)$/.test(archivo)) res.setHeader('Cache-Control', 'no-cache');
  },
}));

app.get('/api/health', ruta(async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, servicio: 'Stella Maris Joyas' });
}));

/* ------------------------------------------------------------
 * Ingreso
 * ---------------------------------------------------------- */
const intentos = new Map();   // ip → { n, hasta }
const VENTANA = 15 * 60 * 1000, MAX_INTENTOS = 8;
setInterval(() => { const ahora = Date.now(); for (const [ip, e] of intentos) if (e.hasta < ahora) intentos.delete(ip); }, VENTANA).unref();
const HASH_VACIO = bcrypt.hashSync('sin-cuenta', 10);   // iguala el tiempo de respuesta si el usuario no existe

app.post('/api/login', ruta(async (req, res) => {
  const ip = req.ip, ahora = Date.now(), e = intentos.get(ip);
  if (e && e.hasta > ahora && e.n >= MAX_INTENTOS) {
    throw new Aviso(429, 'Demasiados intentos seguidos. Esperá unos minutos y probá de nuevo.');
  }
  const usuario = texto(req.body?.usuario, 60).toLowerCase();
  const password = String(req.body?.password ?? '');
  if (!usuario || !password) throw new Aviso(400, 'Completá el usuario y la contraseña.');
  const [[u]] = await pool.query('SELECT id, usuario, password_hash FROM usuarios WHERE usuario = ?', [usuario]);
  const ok = await bcrypt.compare(password, u ? u.password_hash : HASH_VACIO);
  if (!u || !ok) {
    const cuenta = e && e.hasta > ahora ? e : { n: 0, hasta: ahora + VENTANA };
    cuenta.n += 1;
    intentos.set(ip, cuenta);
    throw new Aviso(401, 'El usuario o la contraseña no coinciden.');
  }
  intentos.delete(ip);
  const recordar = req.body?.recordar === true;
  const token = jwt.sign({ u: u.usuario, v: VERSION_CLAVE }, SECRET, { expiresIn: recordar ? '30d' : '12h' });
  res.json({ token, usuario: u.usuario });
}));

function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Ingresá para continuar.' });
  try {
    const datos = jwt.verify(token, SECRET);
    if (!VERSION_CLAVE || datos.v !== VERSION_CLAVE) throw new Error('version');
    req.usuario = datos.u;
    next();
  } catch {
    res.status(401).json({ error: 'Tu sesión venció. Ingresá de nuevo.' });
  }
}

/* ------------------------------------------------------------
 * Todo lo que la página necesita al entrar
 * ---------------------------------------------------------- */
app.get('/api/estado', requireAuth, ruta(async (req, res) => {
  const [[{ hoy }]] = await pool.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS hoy");
  const [piezas] = await pool.query(`${SQL_PIEZA} WHERE p.estado <> 'vendido' ORDER BY p.id`);
  const [pendientes] = await pool.query(`${SQL_PENDIENTE} WHERE q.borrada_en IS NULL ORDER BY q.id`);
  const [ventas] = await pool.query(`${SQL_VENTA} WHERE v.fecha >= CURDATE() AND v.fecha < CURDATE() + INTERVAL 1 DAY ORDER BY v.fecha, v.id`);
  const [dias] = await pool.query(`
    SELECT DATEDIFF(CURDATE(), DATE(fecha)) AS hace, SUM(precio) AS total
      FROM ventas WHERE fecha >= CURDATE() - INTERVAL 6 DAY AND fecha < CURDATE() + INTERVAL 1 DAY
     GROUP BY hace`);
  const semana = [0, 0, 0, 0, 0, 0, 0];   // de hace 6 días a hoy
  dias.forEach(d => { const k = Number(d.hace); if (k >= 0 && k <= 6) semana[6 - k] = Number(d.total); });
  const [cont] = await pool.query('SELECT nombre, ultimo FROM contadores');
  const ultimos = {};
  cont.forEach(c => { if (MATERIALES[c.nombre]) ultimos[c.nombre] = Number(c.ultimo); });
  res.json({
    hoy,
    piezas: piezas.map(piezaJSON),
    pendientes: pendientes.map(pendienteJSON),
    ventasHoy: ventas.map(ventaJSON),
    semana,
    ultimos,
  });
}));

/* ------------------------------------------------------------
 * Piezas del stock: vender, reservar, editar y cambiar la foto
 * ---------------------------------------------------------- */
app.post('/api/piezas/:codigo/vender', requireAuth, ruta(async (req, res) => {
  const medio = String(req.body?.medio ?? '');
  if (!PAGOS.includes(medio)) throw new Aviso(400, 'Elegí el medio de pago.');
  const ventaId = await enTransaccion(async conn => {
    const p = await piezaEnLocal(conn, req.params.codigo);
    const sena = p.estado === 'reservado' ? Math.min(p.reserva_sena || 0, p.precio) : 0;
    const [r] = await conn.query(
      `INSERT INTO ventas (pieza_id, codigo, nombre, material, categoria, precio, sena, medio_pago, fecha)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [p.id, p.codigo, p.nombre, p.material, p.categoria, p.precio, sena, medio]);
    await conn.query("UPDATE piezas SET estado = 'vendido' WHERE id = ?", [p.id]);
    return r.insertId;
  });
  const [[v]] = await pool.query(`${SQL_VENTA} WHERE v.id = ?`, [ventaId]);
  res.status(201).json({ venta: ventaJSON(v) });
}));

/* Anular una venta del día: la pieza vuelve al stock como estaba (con su reserva, si tenía) */
app.post('/api/ventas/:id/deshacer', requireAuth, ruta(async (req, res) => {
  const id = entero(req.params.id, { min: 1 });
  if (!id) throw new Aviso(404, 'No se encontró la venta.');
  const codigo = await enTransaccion(async conn => {
    const [[v]] = await conn.query('SELECT id, pieza_id, codigo, fecha >= CURDATE() AS de_hoy FROM ventas WHERE id = ? FOR UPDATE', [id]);
    if (!v) throw new Aviso(404, 'No se encontró la venta.');
    if (!Number(v.de_hoy)) throw new Aviso(409, 'Solo se pueden anular las ventas del día.');
    await conn.query(
      `UPDATE piezas SET estado = IF(reserva_cliente IS NULL, 'disponible', 'reservado') WHERE id = ? AND estado = 'vendido'`,
      [v.pieza_id]);
    await conn.query('DELETE FROM ventas WHERE id = ?', [id]);
    return v.codigo;
  });
  res.json({ pieza: await leerPieza(pool, codigo) });
}));

app.post('/api/piezas/:codigo/reserva', requireAuth, ruta(async (req, res) => {
  const cliente = texto(req.body?.cliente, 80);
  if (!cliente) throw new Aviso(400, 'Escribí el nombre del cliente para guardar la reserva.');
  const sena = entero(req.body?.sena ?? 0);
  if (sena === null) throw new Aviso(400, 'La seña tiene que ser un número.');
  const dias = req.body?.dias == null ? 0 : entero(req.body.dias, { max: 3650 });   // "Deshacer" conserva la fecha original
  if (dias === null) throw new Aviso(400, 'Fecha de reserva inválida.');
  await enTransaccion(async conn => {
    const p = await piezaEnLocal(conn, req.params.codigo);
    if (sena > p.precio) throw new Aviso(400, 'La seña no puede ser mayor que el precio.');
    await conn.query(
      `UPDATE piezas SET estado = 'reservado', reserva_cliente = ?, reserva_sena = ?, reserva_fecha = CURDATE() - INTERVAL ? DAY WHERE id = ?`,
      [cliente, sena, dias, p.id]);
  });
  res.json({ pieza: await leerPieza(pool, req.params.codigo) });
}));

app.delete('/api/piezas/:codigo/reserva', requireAuth, ruta(async (req, res) => {
  await enTransaccion(async conn => {
    const p = await piezaEnLocal(conn, req.params.codigo);
    await conn.query(
      `UPDATE piezas SET estado = 'disponible', reserva_cliente = NULL, reserva_sena = NULL, reserva_fecha = NULL WHERE id = ?`, [p.id]);
  });
  res.json({ pieza: await leerPieza(pool, req.params.codigo) });
}));

app.patch('/api/piezas/:codigo', requireAuth, ruta(async (req, res) => {
  const precio = entero(req.body?.precio, { min: 1 });
  if (!precio) throw new Aviso(400, 'Poné un precio mayor a cero para guardar.');
  const categoria = String(req.body?.categoria ?? '');
  if (!CATEGORIAS[categoria]) throw new Aviso(400, 'Elegí el tipo de pieza.');
  const detalle = texto(req.body?.detalle, 200);
  await enTransaccion(async conn => {
    const p = await piezaEnLocal(conn, req.params.codigo);
    if (p.reserva_sena && p.reserva_sena > precio) throw new Aviso(400, 'El precio no puede quedar por debajo de la seña.');
    const nombre = texto(req.body?.nombre, 120) || nombreAuto(p.material, categoria);
    await conn.query('UPDATE piezas SET nombre = ?, precio = ?, categoria = ?, detalle = ? WHERE id = ?',
      [nombre, precio, categoria, detalle, p.id]);
  });
  res.json({ pieza: await leerPieza(pool, req.params.codigo) });
}));

app.put('/api/piezas/:codigo/foto', requireAuth, recibirImagen, ruta(async (req, res) => {
  await enTransaccion(async conn => {
    const p = await piezaEnLocal(conn, req.params.codigo);
    const fotoId = await guardarFoto(conn, req.body);
    await conn.query('UPDATE piezas SET foto_id = ? WHERE id = ?', [fotoId, p.id]);
    await borrarFotoSiQuedoSuelta(conn, p.foto_id);
  });
  res.json({ pieza: await leerPieza(pool, req.params.codigo) });
}));

/* ------------------------------------------------------------
 * Fotos por completar
 * ---------------------------------------------------------- */
app.post('/api/pendientes', requireAuth, recibirImagen, ruta(async (req, res) => {
  const material = req.query.material ? String(req.query.material) : null;
  const categoria = req.query.categoria ? String(req.query.categoria) : null;
  if (material && !MATERIALES[material]) throw new Aviso(400, 'Material inválido.');
  if (categoria && !CATEGORIAS[categoria]) throw new Aviso(400, 'Tipo de pieza inválido.');
  const id = await enTransaccion(async conn => {
    const fotoId = await guardarFoto(conn, req.body);
    const numero = await siguiente(conn, 'foto');
    const [r] = await conn.query('INSERT INTO pendientes (numero, foto_id, material, categoria) VALUES (?, ?, ?, ?)',
      [numero, fotoId, material, categoria]);
    return r.insertId;
  });
  res.status(201).json({ pendiente: await leerPendiente(pool, id) });
}));

/* Guarda lo que se completó; si ya tiene material, tipo de pieza y precio, pasa al stock con su código */
app.patch('/api/pendientes/:id', requireAuth, ruta(async (req, res) => {
  const id = entero(req.params.id, { min: 1 });
  if (!id) throw new Aviso(404, 'No se encontró la foto.');
  const b = req.body || {};
  const material = b.material ? String(b.material) : null;
  const categoria = b.categoria ? String(b.categoria) : null;
  if (material && !MATERIALES[material]) throw new Aviso(400, 'Material inválido.');
  if (categoria && !CATEGORIAS[categoria]) throw new Aviso(400, 'Tipo de pieza inválido.');
  const precio = entero(b.precio ?? 0);
  if (precio === null) throw new Aviso(400, 'El precio tiene que ser un número.');
  const nombre = texto(b.nombre, 120), detalle = texto(b.detalle, 200);

  const r = await enTransaccion(async conn => {
    const [[q]] = await conn.query('SELECT * FROM pendientes WHERE id = ? AND borrada_en IS NULL FOR UPDATE', [id]);
    if (!q) throw new Aviso(404, 'No se encontró la foto. Puede que ya la hayan completado o borrado.');
    if (material && categoria && precio > 0) {
      const codigo = await siguienteCodigo(conn, material);
      await conn.query(
        `INSERT INTO piezas (codigo, nombre, material, categoria, precio, detalle, estado, ingreso, foto_id)
         VALUES (?, ?, ?, ?, ?, ?, 'disponible', CURDATE(), ?)`,
        [codigo, nombre || nombreAuto(material, categoria), material, categoria, precio, detalle, q.foto_id]);
      await conn.query('DELETE FROM pendientes WHERE id = ?', [id]);
      return { codigo };
    }
    await conn.query('UPDATE pendientes SET material = ?, categoria = ?, precio = ?, nombre = ?, detalle = ? WHERE id = ?',
      [material, categoria, precio, nombre, detalle, id]);
    return {};
  });
  if (r.codigo) return res.json({ pieza: await leerPieza(pool, r.codigo) });
  res.json({ pendiente: await leerPendiente(pool, id) });
}));

/* Borrar deja la foto apartada dos días, por si se toca "Deshacer" */
app.delete('/api/pendientes/:id', requireAuth, ruta(async (req, res) => {
  const id = entero(req.params.id, { min: 1 });
  const [r] = await pool.query('UPDATE pendientes SET borrada_en = NOW() WHERE id = ? AND borrada_en IS NULL', [id || 0]);
  if (!r.affectedRows) throw new Aviso(404, 'No se encontró la foto.');
  res.json({ ok: true });
}));

app.post('/api/pendientes/:id/restaurar', requireAuth, ruta(async (req, res) => {
  const id = entero(req.params.id, { min: 1 });
  const [r] = await pool.query('UPDATE pendientes SET borrada_en = NULL WHERE id = ? AND borrada_en IS NOT NULL', [id || 0]);
  if (!r.affectedRows) throw new Aviso(404, 'No se pudo recuperar la foto.');
  res.json({ pendiente: await leerPendiente(pool, id) });
}));

/* ------------------------------------------------------------
 * Fotos: la clave es larga y al azar, así la dirección no se puede adivinar.
 * No cambian nunca (cambiar una foto crea otra), entonces el navegador las guarda.
 * ---------------------------------------------------------- */
app.get('/api/fotos/:clave', ruta(async (req, res) => {
  const clave = String(req.params.clave);
  if (!/^[a-f0-9]{32}$/.test(clave)) throw new Aviso(404, 'No existe esa foto.');
  const [[f]] = await pool.query('SELECT tipo, datos FROM fotos WHERE clave = ?', [clave]);
  if (!f) throw new Aviso(404, 'No existe esa foto.');
  res.setHeader('Content-Type', f.tipo);
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.send(f.datos);
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'No existe esa dirección.' }));
/* Errores del cuerpo de la petición (foto muy grande, JSON roto) */
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'La foto es demasiado pesada.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Datos inválidos.' });
  console.error('error:', err.message);
  res.status(500).json({ error: 'Error del servidor.' });
});

/* ------------------------------------------------------------
 * Arranque: primero la base, después se abre el puerto
 * ---------------------------------------------------------- */
prepararBase()
  .then(() => {
    setInterval(() => pool.getConnection().then(c => purgar(c).finally(() => c.release())).catch(() => {}), 6 * 3600 * 1000).unref();
    app.listen(PORT, '0.0.0.0', () => console.log(`\n  Stella Maris Joyas en ejecución  ->  puerto ${PORT}\n`));
  })
  .catch(err => {
    console.error('✗ No se pudo preparar la base de datos:', err.message);
    process.exit(1);
  });

module.exports = { app, pool };
