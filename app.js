/* ============================================================
   SGV — Frontend conectado a la API real
   ============================================================ */
const API = '/api';
let TOKEN = null;
let USER = null;            // { id, correo, rol }
let VACUNAS = [];          // catálogo cacheado

const ROL_INFO = {
  enfermeria:   { name:'Enfermería',   rol:'Administrador',       perm:'Lectura y escritura',                 tipo:'Cuenta compartida', write:true,  manageUsers:false, viewMovimientos:true,  viewActividad:false, esProveedora:false, viewTrazabilidad:false, av:'EN' },
  coordinadora: { name:'Coordinadora', rol:'Coordinadora',        perm:'Gestión de usuarios y catálogo',      tipo:'Cuenta personal',   write:false, manageUsers:true,  viewMovimientos:true,  viewActividad:false, esProveedora:false, viewTrazabilidad:true,  av:'CO' },
  jefa:         { name:'Jefa',         rol:'Jefa de enfermería',  perm:'Consulta y supervisión',              tipo:'Cuenta personal',   write:false, manageUsers:false, viewMovimientos:true,  viewActividad:true,  esProveedora:false, viewTrazabilidad:true,  av:'JE' },
  proveedora:   { name:'Proveedora',   rol:'Proveedora externa',  perm:'Consulta de stock y reposición',      tipo:'Cuenta personal',   write:false, manageUsers:false, viewMovimientos:false, viewActividad:false, esProveedora:true,  viewTrazabilidad:true,  av:'PR' },
};

/* ---------- Helpers ---------- */
function $(id){ return document.getElementById(id); }
function msg(id,type,text){
  const ic = type==='err' ? '✕' : type==='ok' ? '✓' : '!';
  $(id).innerHTML = text ? `<div class="msg ${type}"><span class="ic">${ic}</span><span>${text}</span></div>` : '';
}
// Fecha de hoy en hora LOCAL (no UTC). Con toISOString(), después de las
// 21 hs de Argentina daba el día siguiente.
function today(){ return ymdLocal(new Date()); }
function ymdLocal(d){
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function fmtFecha(d){
  if(!d) return '<span class="muted-dash">—</span>';
  const s = String(d).slice(0,10).split('-');
  return s.length===3 ? `${s[2]}/${s[1]}/${s[0]}` : d;
}
async function api(path, opts = {}){
  const headers = { 'Content-Type':'application/json', ...(opts.headers||{}) };
  if (TOKEN) headers.Authorization = 'Bearer ' + TOKEN;
  const res = await fetch(API + path, { ...opts, headers });
  const data = await res.json().catch(()=> ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Error del servidor.');
    err.status = res.status;
    err.data = data;   // el body completo va acá para casos como confirmación requerida
    throw err;
  }
  return data;
}

/* ---------- Helpers multidosis ---------- */
// Devuelve dosis_por_frasco de una vacuna por id. Si no la encuentra, asume 1.
function dpf(vacId){
  const v = VACUNAS.find(x => String(x.id) === String(vacId));
  return v && v.dosis_por_frasco ? Number(v.dosis_por_frasco) : 1;
}
// ¿La vacuna es multidosis?
function esMulti(vacId){ return dpf(vacId) > 1; }
// Formatea una cantidad en dosis según el dosis_por_frasco de la vacuna.
//   monodosis           → "10 dosis"
//   multi, exacto       → "2 frascos"   (con frascos=2, sueltas=0)
//   multi, con sueltas  → "1 frasco · 3 dosis sueltas"
//   multi, solo sueltas → "3 dosis sueltas"
function fmtDisp(dosis, dosisPorFrasco){
  dosis = Number(dosis) || 0;
  const d = Number(dosisPorFrasco) || 1;
  if (d === 1) return `${dosis} ${dosis === 1 ? 'dosis' : 'dosis'}`;
  const fr = Math.floor(dosis / d), su = dosis % d;
  const parts = [];
  if (fr > 0) parts.push(`<b>${fr}</b> ${fr === 1 ? 'frasco' : 'frascos'}`);
  if (su > 0) parts.push(`<b>${su}</b> ${su === 1 ? 'dosis suelta' : 'dosis sueltas'}`);
  if (parts.length === 0) return '<b>0</b> frascos';
  return parts.join(' y ');
}
// Chip "Frasco x N" para marcar visualmente las multidosis al lado del nombre.
// Ícono de frasco (SVG) — reemplaza al emoji en todo lo referido a frascos.
// Usa currentColor para tomar el color del cartel que lo contiene.
const ICON_FRASCO = '<svg class="ic-frasco" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="M5.5 1.5h5M6.5 1.5V4L5 6v7.5a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V6L9.5 4V1.5M5 9.5h6"/></svg>';
// Chip de presentación multidosis ("Frasco × N"). Comparte estilo con el
// chip "Frasco abierto" de la alerta Por vencer (clase .chip-frasco).
function chipMulti(dosisPorFrasco){
  const d = Number(dosisPorFrasco) || 1;
  return d > 1 ? ` <span class="chip-multi chip-frasco">${ICON_FRASCO}Frasco × ${d}</span>` : '';
}
// Formatea los días para vencer en texto humano.
//   dias > 0  → "en 5 días" / "en 1 día"
//   dias = 0  → "hoy"
//   dias < 0  → "hace 3 días" / "hace 1 día"
function fmtDias(dias){
  dias = Number(dias);
  if (dias === 0) return 'hoy';
  if (dias > 0)   return `en ${dias} ${dias === 1 ? 'día' : 'días'}`;
  const d = -dias;
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
}

function toast(type,text){
  if(!text) return;
  const ic = type==='ok' ? '✓' : type==='info' ? 'i' : '✕';
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = `<span class="ti">${ic}</span><span>${text}</span>`;
  $('toasts').appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; el.style.transition='.3s'; setTimeout(()=>el.remove(),300); }, 2800);
}

/* ---------- Login ---------- */
async function doLogin(){
  const u = $('u'), p = $('p');
  u.classList.remove('bad'); p.classList.remove('bad');
  if(!u.value.trim() || !p.value.trim()){
    if(!u.value.trim()) u.classList.add('bad');
    if(!p.value.trim()) p.classList.add('bad');
    return msg('login-msg','err','Completá todos los campos obligatorios.');
  }
  try{
    const data = await api('/login', { method:'POST', body: JSON.stringify({ correo:u.value, password:p.value }) });
    TOKEN = data.token;
    USER = data.usuario;
    $('login-msg').innerHTML = '';
    gateAbrir(enterApp);
  }catch(err){
    u.classList.add('bad'); p.classList.add('bad');
    msg('login-msg','err', err.message);
  }
}

async function enterApp(){
  $('gate').style.display = 'none';
  $('app').classList.add('on');
  applyRole();
  INI.animar = true;
  await loadVacunas();
  await Promise.all([ loadDashboard(), loadStock(), loadMovimientos() ]);
  if (ROL_INFO[USER.rol].manageUsers) {
    loadUsuarios();
    loadCatalogo();
  }
  // Envolver los selects marcados con el componente custom (una vez que los
  // datos dinámicos ya poblaron las opciones, ej. mv-vac).
  enhanceAllSelects();
  go('inicio');
}

function logout(){
  TOKEN = null; USER = null;
  clearTimeout(INI.timer);
  DASH = null; INI.q = ''; INI.estado = ''; INI.verMas = false;
  const b = $('iniBuscar'); if (b) b.value = '';
  $('app').classList.remove('on');
  $('gate').style.display = '';
  $('gateHeladera')?.classList.remove('abierta');
  $('u').value=''; $('p').value=''; $('login-msg').innerHTML='';
}

/* ---------- Rol / permisos en la UI ---------- */
function applyRole(){
  const info = ROL_INFO[USER.rol];
  $('acctName').textContent = info.name;
  $('acctAv').textContent = info.av;
  $('cuentaName').textContent = info.name;
  $('cuentaAv').textContent = info.av;
  $('cuentaMail').textContent = USER.correo;
  $('cuentaRol').textContent = info.rol;
  $('cuentaPerm').textContent = info.perm;
  $('cuentaTipo').textContent = info.tipo;
  const pill = $('rolePill');
  if (pill) {
    pill.textContent = info.write ? 'Escritura' : 'Solo lectura';
    pill.className = 'role-pill ' + (info.write ? 'w' : 'r');
  }
  document.querySelectorAll('.enfermeria-only:not(.page)').forEach(e => e.style.display = info.write ? '' : 'none');
  document.querySelectorAll('.coordinadora-only:not(.page)').forEach(e => e.style.display = info.manageUsers ? '' : 'none');
  // Clases en <body> para que también se oculten los elementos que se dibujan
  // después (filas de Stock y Movimientos con botones por rol).
  document.body.classList.toggle('rol-sin-escritura', !info.write);
  document.body.classList.toggle('rol-sin-gestion', !info.manageUsers);
  document.body.classList.toggle('rol-sin-traz', !info.viewTrazabilidad);
  document.body.dataset.rol = USER.rol;
  // Vistas específicas por rol — se usa la clase 'role-hidden' con !important
  // en CSS para garantizar que el toggle siempre se aplique bien y no dependa
  // del display default del elemento (que puede ser flex, block o inline-flex).
  document.querySelectorAll('.jefa-only').forEach(e => e.classList.toggle('role-hidden', !info.viewActividad));
  document.querySelectorAll('.proveedora-only').forEach(e => e.classList.toggle('role-hidden', !info.esProveedora));
  document.querySelectorAll('.hide-proveedora').forEach(e => e.classList.toggle('role-hidden', info.esProveedora));
  // Si es proveedora, activar por defecto el filtro "necesita reposición" en Stock
  if (info.esProveedora) {
    setTimeout(() => {
      const select = document.getElementById('stock-estado');
      if (select && typeof stSetEstado === 'function') {
        stSetEstado('reposicion');
      }
    }, 100);
  }
  // El cartel de "solo lectura" se oculta a jefa y proveedora.
  // La jefa tiene su propio panel de indicadores que ya identifica
  // su rol, y la proveedora tiene un panel de reposición. La coordinadora
  // tampoco lo ve porque gestiona usuarios y catálogo.
  // En la práctica solo aparece a usuarios inesperados sin permisos definidos.
  document.querySelectorAll('.readonly-only').forEach(e => e.style.display = 'none');
}

/* ---------- Navegación ---------- */
const TITLES = { inicio:'Inicio', stock:'Stock', mov:'Movimientos', estadisticas:'Estadísticas', aplicar:'Aplicación', descarte:'Descarte', lote:'Ingresar lote', usuarios:'Usuarios', cuenta:'Mi cuenta' };
function go(page){
  // Bloquear acceso por URL a vistas sin permiso
  const info = ROL_INFO[USER.rol];
  if (['aplicar','descarte','lote'].includes(page) && !info.write) page = 'inicio';
  if (page === 'usuarios' && !info.manageUsers) page = 'inicio';
  if (page === 'mov' && !info.viewMovimientos) page = 'inicio';
  if (page === 'estadisticas' && !info.manageUsers) page = 'inicio';
  document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
  $('page-'+page).classList.add('on');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page===page));
  if (page === 'aplicar') {
    if (!$('ap-fecha').value) $('ap-fecha').value = today();
    if (!visFilas().length) visAgregar(null, null, false);
    visFilas().forEach(visRenderFila);
    visResumen();
  }
  if (page === 'descarte') regResumenDescarte();
  if (page === 'lote') regResumenLote();
  if (page === 'estadisticas') loadEstadisticas();
  if (page === 'inicio' && DASH) iniDibujarTrack(DASH.radar || []);
  iniTipOcultar();
  window.scrollTo(0,0);
}

/* ---------- Carga de datos ---------- */
async function loadVacunas(){
  VACUNAS = await api('/vacunas');
  const opts = '<option value="">Seleccionar…</option>' + VACUNAS.map(v=>`<option value="${v.id}">${v.nombre}</option>`).join('');
  ['de-vac','lo-vac','ex-vac'].forEach(id => {
    const el = $(id);
    if (el) {
      el.innerHTML = opts;
      if (el._niceRefresh) el._niceRefresh();
    }
  });
  if ($('ap-fecha')) $('ap-fecha').value = today();
}

/* ============================================================
   INICIO · tablero del vacunatorio (rediseño nov/2026)
   Todo sale de /api/dashboard y se dibuja con HTML/SVG propio:
     - saludo con el resumen del día y accesos rápidos
     - heladera: un frasco por vacuna, el líquido muestra el stock vigente
     - "Para resolver": cada aviso trae su acción (descartar, aplicar, ver)
     - próximos vencimientos en una línea de tiempo de 60 días
     - frascos multidosis abiertos con los días que les quedan
     - actividad registrada hoy y aplicaciones de los últimos 14 días
   ============================================================ */
let DASH = null;
// Listas que usan los accesos de descarte rápido
let VENCIDAS_CACHE = [];
let FRASCOS_VENCIDOS_CACHE = [];
// Estado de la vista (búsqueda, filtro, orden) y animación de llenado
const INI = { q: '', estado: '', orden: 'az', verMas: false, animar: true, actualizado: null, timer: null };
const INI_EST = {
  ok:      { lbl: 'En orden',   prio: 3 },
  low:     { lbl: 'Stock bajo', prio: 1 },
  exp:     { lbl: 'Por vencer', prio: 2 },
  nostock: { lbl: 'Sin stock',  prio: 4 },
};
const INI_DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const INI_MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const INI_MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function iniInfo() { return ROL_INFO[USER?.rol] || {}; }
function iniUmbral() { return DASH?.umbrales?.stockBajo ?? 10; }
function iniDiasVenc() { return DASH?.umbrales?.diasVencimiento ?? 15; }
function iniTxt(s) { return escHtml(s); }

// Días entre hoy (fecha de la base) y una fecha YYYY-MM-DD
function iniDiasHasta(ymd) {
  if (!ymd) return null;
  const hoy = DASH?.hoy?.fecha || today();
  return Math.round((Date.parse(String(ymd).slice(0, 10) + 'T00:00:00Z') - Date.parse(hoy + 'T00:00:00Z')) / 864e5);
}

// Estado de una vacuna según su stock vigente (sumando todos sus lotes)
function iniEstado(v) {
  if (v.stock <= 0) return 'nostock';
  if (v.stock <= iniUmbral()) return 'low';
  if (v.stock_por_vencer > 0) return 'exp';
  return 'ok';
}
// Nivel del líquido: el límite de stock bajo queda a 1/4 del frasco
function iniNivel(v) {
  if (v.stock <= 0) return 0;
  return Math.max(0.07, Math.min(1, v.stock / (iniUmbral() * 4)));
}
// Cobertura estimada con el uso de los últimos 30 días (texto para la ficha y los avisos)
function iniCobertura(v) {
  if (v.stock <= 0) return 'No quedan dosis vigentes.';
  const c = v.cobertura_dias;
  if (c === null || c === undefined) return 'No se aplicó en los últimos 30 días.';
  if (c < 1) return 'Alcanza para menos de un día.';
  if (c >= 365) return 'Alcanza para más de un año.';
  if (c >= 60) return `Alcanza para unos ${Math.round(c / 30)} meses.`;
  return `Alcanza para unos ${c} ${c === 1 ? 'día' : 'días'}.`;
}

async function loadDashboard() {
  const d = await api('/dashboard');
  DASH = d;
  VENCIDAS_CACHE = d.alertas?.vencidas || [];
  FRASCOS_VENCIDOS_CACHE = d.alertas?.frascosVencidos || [];
  INI.actualizado = new Date();
  renderInicio();
  const info = iniInfo();
  // Paneles propios de cada rol (se consultan solo para quien los ve)
  if (info.viewActividad) loadResumenActividad();
  if (info.esProveedora) loadResumenReposicion();
  iniProgramarRefresco();
}

function renderInicio() {
  if (!DASH) return;
  iniRenderHead();
  iniRenderHeladera();
  iniRenderTareas();
  iniRenderVencimientos();
  INI.animar = false;   // el llenado de los frascos se ve solo al entrar
}

/* ---------- Saludo y resumen del día ---------- */
function iniSaludoTxt(h) { return h < 6 ? 'Buenas noches' : h < 13 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches'; }

function iniRenderHead() {
  const info = iniInfo();
  const ahora = new Date();
  const dia = INI_DIAS[ahora.getDay()];
  $('iniSaludo').textContent = `${iniSaludoTxt(ahora.getHours())}, ${info.name || ''}`;

  // Una sola línea: la fecha, lo urgente y lo que pasó hoy
  const fecha = `${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${ahora.getDate()} de ${INI_MESES[ahora.getMonth()]}.`;
  let txt;
  if (info.esProveedora) {
    const r = iniReposicionConteo();
    txt = r.total
      ? `${r.total} ${r.total === 1 ? 'vacuna necesita' : 'vacunas necesitan'} reposición${r.urg ? `, <b class="ini-res-urg">${r.urg} sin stock</b>` : ''}.`
      : 'No hay vacunas para reponer por ahora.';
  } else {
    const al = iniAlertas();
    const ap = DASH.hoy?.aplicaciones || { dosis: 0 };
    const n = al.venc.length;
    txt = n ? `<b class="ini-res-urg">${n} ${n === 1 ? 'vencida' : 'vencidas'} para descartar.</b>` : 'No hay vencidas para descartar.';
    txt += ap.dosis > 0 ? ` Hoy se aplicaron ${nfmt(ap.dosis)} dosis.` : ' Todavía no hay aplicaciones hoy.';
  }
  $('iniResumen').innerHTML = `${fecha} ${txt}`;

  let acc = '';
  if (info.write) {
    acc = `<button type="button" class="btn ghost" onclick="iniIngresarLote()">Ingresar lote</button>
      <button type="button" class="btn" onclick="iniAplicar()">Registrar aplicación</button>`;
  } else if (info.manageUsers) {
    acc = `<button type="button" class="btn ghost" onclick="go('estadisticas')">Ver estadísticas</button>`;
  } else if (info.esProveedora) {
    acc = `<button type="button" class="btn" onclick="descargarReposicion()">Descargar pedido en Excel</button>`;
  } else if (info.viewMovimientos) {
    acc = `<button type="button" class="btn ghost" onclick="go('mov')">Ver movimientos</button>`;
  }
  $('iniAcciones').innerHTML = acc;
}

// Mismo criterio que el pedido de reposición del servidor
function iniReposicionConteo() {
  let urg = 0, alta = 0, media = 0;
  (DASH?.vacunas || []).forEach(v => {
    if (v.stock <= 0) urg++;
    else if (v.stock <= iniUmbral() || v.stock_por_vencer >= v.stock) alta++;
    else if (v.stock_por_vencer > 0) media++;
  });
  return { urg, alta, media, total: urg + alta + media };
}

/* ---------- Heladera ---------- */
// Geometría de los frascos (viewBox 48×88). Los multidosis son más anchos.
const INI_VIAL = {
  mono:  { L: 10, R: 38, nL: 15, nR: 33, cL: 13, cR: 35 },
  multi: { L: 6,  R: 42, nL: 13, nR: 35, cL: 11, cR: 37 },
};
function iniVialSVG(v, est, nivel, conAnimacion) {
  const tipo = v.dosis_por_frasco > 1 ? 'multi' : 'mono';
  const g = INI_VIAL[tipo];
  const cuerpo = `M${g.nL} 19L${g.nL} 22C${g.nL} 26 ${g.L} 25 ${g.L} 30L${g.L} 79Q${g.L} 86 ${g.L + 7} 86L${g.R - 7} 86Q${g.R} 86 ${g.R} 79L${g.R} 30C${g.R} 25 ${g.nR} 26 ${g.nR} 22L${g.nR} 19Z`;
  const cx = (g.L + g.R) / 2;
  const destino = ((1 - nivel) * 53).toFixed(1);
  const inicio = conAnimacion ? '53' : destino;
  const liquido = est === 'nostock' ? '' : `
      <g clip-path="url(#vclip-${tipo})">
        <g class="vial-liq" data-to="${destino}" style="transform:translateY(${inicio}px)">
          <path d="M${g.L - 2} 31Q${cx} 35.5 ${g.R + 2} 31L${g.R + 2} 92L${g.L - 2} 92Z" fill="url(#liq-${est})"/>
          <path d="M${g.L} 31.7Q${cx} 35.3 ${g.R} 31.7" class="vial-menisco"/>
        </g>
      </g>`;
  // Graduaciones del vidrio: la de abajo (más larga) es el límite de stock bajo
  const marcas = [0.25, 0.5, 0.75].map(p => {
    const y = (85 - p * 53).toFixed(1);
    const largo = p === 0.25 ? 8 : 4.5;
    return `<line x1="${g.R - 2 - largo}" y1="${y}" x2="${g.R - 2}" y2="${y}" class="${p === 0.25 ? 'vial-marca-baja' : 'vial-marca'}"/>`;
  }).join('');
  return `<svg class="vial vial-${est}" viewBox="0 0 48 88" aria-hidden="true" focusable="false">
      <path d="${cuerpo}" class="vial-vidrio"/>${liquido}
      ${marcas}
      <rect x="${g.L + 3.5}" y="33" width="2.6" height="44" rx="1.3" class="vial-brillo"/>
      <rect x="${g.nL - 1.5}" y="12" width="${g.nR - g.nL + 3}" height="8" rx="1.6" fill="url(#vial-alu)" class="vial-precinto"/>
      <rect x="${g.cL}" y="3" width="${g.cR - g.cL}" height="10" rx="3" class="vial-tapa"/>
      <path d="${cuerpo}" class="vial-borde"/>
    </svg>`;
}

// Corta las palabras largas en sílabas con guiones suaves (\u00AD) para que los
// nombres entren en los estantes sin partirse en cualquier letra
// (ej.: "Antimeningocócica" -> Anti-me-nin-go-có-cica). Reglas básicas del español:
// V-CV, VC-CV, sin separar grupos como bl, br, pl, tr, ch, ll, rr.
const INI_GRUPOS = new Set(['bl','br','cl','cr','dr','fl','fr','gl','gr','kl','kr','pl','pr','tr','ch','ll','rr']);
function iniSilabear(nombre) {
  const VOC = 'aeiouáéíóúü';
  return String(nombre ?? '').split(/(\s+)/).map(pal => {
    if (pal.length < 10 || !/^[a-záéíóúüñ]+$/i.test(pal)) return escHtml(pal);
    const w = pal.toLowerCase();
    const cortes = [];
    let i = 0;
    while (i < w.length) {
      if (!VOC.includes(w[i])) { i++; continue; }
      let j = i + 1;
      while (j < w.length && !VOC.includes(w[j])) j++;
      if (j >= w.length) break;                 // no hay otra vocal: fin de palabra
      const k = j - i - 1;                       // consonantes entre las dos vocales
      let corte = -1;
      if (k === 1) corte = i + 1;
      else if (k === 2) corte = INI_GRUPOS.has(w.slice(i + 1, j)) ? i + 1 : i + 2;
      else if (k === 3) corte = INI_GRUPOS.has(w.slice(j - 2, j)) ? i + 2 : i + 3;
      else if (k >= 4) corte = i + 3;
      if (corte >= 3 && w.length - corte >= 3) cortes.push(corte);
      i = j;
    }
    let out = '', ant = 0;
    cortes.forEach(c => { out += escHtml(pal.slice(ant, c)) + '\u00AD'; ant = c; });
    return out + escHtml(pal.slice(ant));
  }).join('');
}

// Texto corto de cobertura para el estante ("hay para ~2 meses"), con el uso
// de los últimos 30 días. La explicación completa está en la ficha.
function iniCoberturaSlot(v) {
  const c = v.cobertura_dias;
  if (c === null || c === undefined) return '<span class="solo-pc">Sin uso reciente</span><span class="solo-movil">Sin uso</span>';
  if (c < 1) return 'Para hoy';
  if (c >= 365) return 'Para +1 año';
  if (c >= 60) return `Para ~${Math.round(c / 30)} meses`;
  return `Para ~${c} ${c === 1 ? 'día' : 'días'}`;
}

function iniSlot(v, i, animar) {
  const est = iniEstado(v);
  const info = iniInfo();
  const vencidas = v.stock_vencido > 0 && !info.esProveedora;
  const abierto = info.esProveedora ? null : (DASH.frascos || []).find(f => Number(f.vacuna_id) === Number(v.id));
  let linea;
  if (vencidas) linea = `${v.stock_vencido} vencidas`;
  else if (est === 'nostock') linea = 'Sin stock';
  else if (est === 'low') linea = 'Stock bajo';
  else if (est === 'exp') {
    const d = iniDiasHasta(v.prox_venc);
    linea = d <= 0 ? 'Vence hoy' : `Vence en ${d} ${d === 1 ? 'día' : 'días'}`;
  } else linea = iniCoberturaSlot(v);
  const aria = `${v.nombre}: ${v.stock} dosis vigentes, ${INI_EST[est].lbl.toLowerCase()}` +
    (vencidas ? `, con ${v.stock_vencido} dosis vencidas sin descartar` : '') +
    (abierto ? `, con un frasco abierto (quedan ${abierto.dosis_sobrantes} dosis)` : '') + '. Ver lotes.';
  return `<button type="button" class="hel-slot is-${est}${vencidas ? ' is-alerta' : ''}" style="--i:${i}"
      onclick="iniAbrirFicha(${v.id})" aria-label="${iniTxt(aria)}" title="${iniTxt(v.nombre)}">
      <span class="hel-frasco">
        ${iniVialSVG(v, est, iniNivel(v), animar)}
        ${vencidas ? '<span class="hel-alerta" aria-hidden="true">!</span>' : ''}
        ${abierto ? `<span class="hel-abierto${abierto.dias_restantes < 0 ? ' is-venc' : ''}" aria-hidden="true">Abierto</span>` : ''}
      </span>
      <span class="hel-etq">
        <span class="hel-nom">${iniSilabear(v.nombre)}</span>
        <span class="hel-dato"><b>${nfmt(v.stock)}</b> dosis</span>
        <span class="hel-linea">${linea}</span>
      </span>
    </button>`;
}

function iniRenderHeladera() {
  const vacs = DASH?.vacunas || [];
  const conStock = vacs.filter(v => v.stock > 0);
  const total = conStock.reduce((s, v) => s + v.stock, 0);
  const t = INI.actualizado || new Date();
  const hora = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  $('iniDisplay').textContent = nfmt(total);
  $('iniHelSub').textContent = vacs.length
    ? `${conStock.length} de ${vacs.length} vacunas con stock. Actualizado a las ${hora}.`
    : 'Todavía no hay vacunas activas en el catálogo.';

  // Filtros por estado con su conteo
  const cuenta = { ok: 0, low: 0, exp: 0, nostock: 0 };
  vacs.forEach(v => { cuenta[iniEstado(v)]++; });
  const chips = [['', 'Todas', vacs.length], ['ok', 'En orden', cuenta.ok], ['low', 'Stock bajo', cuenta.low],
                 ['exp', 'Por vencer', cuenta.exp], ['nostock', 'Sin stock', cuenta.nostock]];
  $('iniHelFiltros').innerHTML = chips.map(([k, lbl, n]) => {
    const on = INI.estado === k;
    const off = k && n === 0 && !on;
    return `<button type="button" class="hel-chip${k ? ' is-' + k : ''}${on ? ' on' : ''}" aria-pressed="${on}"${off ? ' disabled' : ''}
        onclick="iniFiltrarEstado('${k}')">${k ? '<i class="hel-dot" aria-hidden="true"></i>' : ''}${lbl}<b>${n}</b></button>`;
  }).join('');

  let lista = vacs.slice();
  const q = normTxt(INI.q);
  if (q) lista = lista.filter(v => normTxt(v.nombre).includes(q));
  if (INI.estado) lista = lista.filter(v => iniEstado(v) === INI.estado);
  if (INI.orden === 'atencion') {
    lista.sort((a, b) => (b.stock_vencido > 0) - (a.stock_vencido > 0)
      || INI_EST[iniEstado(a)].prio - INI_EST[iniEstado(b)].prio
      || a.nombre.localeCompare(b.nombre));
  } else {
    lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  const cont = $('iniHelEstantes');
  if (!lista.length) {
    cont.innerHTML = `<div class="hel-vacio">
        <p>${vacs.length ? 'No hay vacunas que coincidan con la búsqueda.' : 'Cuando el catálogo tenga vacunas activas, van a aparecer acá.'}</p>
        ${vacs.length ? '<button type="button" class="btn ghost sm" onclick="iniLimpiarFiltros()">Limpiar filtros</button>' : ''}
      </div>`;
    return;
  }
  const animar = INI.animar;
  cont.innerHTML = lista.map((v, i) => iniSlot(v, i, animar)).join('');
  if (animar) {
    // Dos frames para que el navegador pinte el frasco vacío antes de llenarlo
    requestAnimationFrame(() => requestAnimationFrame(() => {
      cont.querySelectorAll('.vial-liq').forEach(g => { g.style.transform = `translateY(${g.dataset.to}px)`; });
    }));
  }
}

function iniOnBuscar(valor) { INI.q = valor || ''; iniRenderHeladera(); }
function iniSetOrden(orden) {
  INI.orden = orden;
  document.querySelectorAll('.hel-orden button').forEach(b => {
    const on = b.dataset.orden === orden;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  iniRenderHeladera();
}
// Desde un aviso se fija el filtro y se baja a la heladera; desde los chips, alterna
function iniFiltrarEstado(k, desdeAviso) {
  INI.estado = desdeAviso ? k : (INI.estado === k ? '' : k);
  iniRenderHeladera();
  if (desdeAviso) document.querySelector('.refri')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function iniLimpiarFiltros() {
  INI.q = ''; INI.estado = '';
  const b = $('iniBuscar'); if (b) b.value = '';
  iniRenderHeladera();
}

/* ---------- Ficha de una vacuna (modal) ---------- */
function iniAbrirFicha(id) {
  const v = (DASH?.vacunas || []).find(x => Number(x.id) === Number(id));
  if (!v) return;
  const info = iniInfo();
  const est = iniEstado(v);
  const multi = v.dosis_por_frasco > 1;
  const up = v.usar_primero;
  const ETIQ = { ok: 'Disponible', low: 'Stock bajo', exp: 'Por vencer', vencida: 'Vencida', nostock: 'Sin stock' };
  const lotes = (STOCK_CACHE || [])
    .filter(r => Number(r.vacuna_id) === Number(v.id) && r.id && Number(r.disponible) > 0)
    .sort((a, b) => Number(a.dias_para_vencer) - Number(b.dias_para_vencer));
  // Los frascos abiertos son información interna del CAPS: no los ve la proveedora
  const frascos = info.esProveedora ? [] : (DASH.frascos || []).filter(f => Number(f.vacuna_id) === Number(v.id));

  $('fichaTit').innerHTML = `${iniTxt(v.nombre)}${chipMulti(v.dosis_por_frasco)}`;

  const filas = lotes.map(r => {
    const dias = Number(r.dias_para_vencer);
    let acc = '';
    if (info.write) {
      acc = r.estado === 'vencida'
        ? `<button type="button" class="tar-btn fic-btn-err" onclick="iniDescartarLote(${r.id})">Descartar</button>`
        : `<button type="button" class="tar-btn" onclick="iniAplicar(${v.id}, ${r.id})">Aplicar</button>`;
    } else if (info.viewTrazabilidad) {
      acc = `<button type="button" class="tar-btn" onclick="iniVerLote(${r.id})">Detalles</button>`;
    }
    return `<li class="fic-lote">
        <span class="fic-lote-num"><b>Lote ${iniTxt(r.numero_lote)}</b><small>${dias < 0 ? 'Venció' : 'Vence'} el ${fmtFecha(r.vencimiento)}, ${fmtDias(dias)}</small></span>
        <span class="fic-lote-dosis"><b>${r.disponible}</b> dosis${multi ? `<small>${fmtDisp(r.disponible, v.dosis_por_frasco)}</small>` : ''}</span>
        <span class="pill ${r.estado}">${ETIQ[r.estado] || r.estado}</span>
        <span class="fic-lote-acc">${acc}</span>
      </li>`;
  }).join('');

  const frascoTxt = frascos.map(f => {
    const dr = f.dias_restantes;
    const vence = dr < 0 ? `venció ${fmtDias(dr)}` : `vence ${fmtDias(dr)}`;
    return `<p class="fic-frasco${dr < 0 ? ' is-venc' : ''}">${ICON_FRASCO}<span>Frasco abierto del lote ${iniTxt(f.numero_lote)}: quedan ${f.dosis_sobrantes} de ${f.dosis_totales} dosis y ${vence}.</span></p>`;
  }).join('');

  $('fichaBody').innerHTML = `
    <div class="fic-top">
      <div class="fic-vial">${iniVialSVG(v, est, iniNivel(v), false)}</div>
      <div class="fic-res">
        <p class="fic-num"><b>${nfmt(v.stock)}</b> dosis vigentes</p>
        ${multi && v.stock > 0 ? `<p class="fic-fr">${fmtDisp(v.stock, v.dosis_por_frasco)}</p>` : ''}
        <span class="pill ${est}">${INI_EST[est].lbl}</span>
      </div>
    </div>
    <dl class="fic-datos">
      <div><dt>Aplicadas en los últimos 30 días</dt><dd>${nfmt(v.consumo30)} dosis</dd></div>
      <div><dt>Cobertura estimada</dt><dd>${iniCobertura(v)}</dd></div>
      <div><dt>Usar primero</dt><dd>${up ? `Lote ${iniTxt(up.numero_lote)}, vence el ${fmtFecha(up.vencimiento)}.${up.frasco_abierto ? ' Tiene un frasco abierto.' : ''}` : 'No hay lotes vigentes.'}</dd></div>
      ${v.stock_vencido > 0 && !info.esProveedora ? `<div class="fic-alerta"><dt>Vencidas sin descartar</dt><dd>${v.stock_vencido} dosis</dd></div>` : ''}
    </dl>
    ${frascoTxt}
    <h5 class="fic-sub">Lotes con stock</h5>
    ${filas ? `<ul class="fic-lotes">${filas}</ul>` : '<p class="fic-vacio">No hay lotes con dosis de esta vacuna.</p>'}`;

  let pie = `<button type="button" class="btn ghost" onclick="iniVerEnStock(${v.id})">Ver en Stock</button>`;
  if (info.write) {
    pie = `<button type="button" class="btn ghost" onclick="iniIngresarLote(${v.id})">Ingresar lote</button>` + pie;
    if (up) pie += `<button type="button" class="btn" onclick="iniAplicar(${v.id}, ${up.lote_id})">Registrar aplicación</button>`;
  }
  $('fichaFoot').innerHTML = pie;
  iniTipOcultar();
  $('ovFicha').classList.add('on');
}

function iniVerLote(loteId) { closeOv('ovFicha'); verTrazabilidad(loteId); }
function iniVerEnStock(vacId) {
  const v = (DASH?.vacunas || []).find(x => Number(x.id) === Number(vacId));
  closeOv('ovFicha');
  go('stock');
  const s = $('stock-search');
  if (s) s.value = v ? v.nombre : '';
  stSetEstado('');
}

/* ---------- Accesos rápidos a los formularios ---------- */
// Lleva a la visita con esa vacuna (y ese lote) agregada
function iniAplicar(vacId, loteId) {
  closeOv('ovFicha');
  visConVacuna(vacId, loteId);
}
function iniIngresarLote(vacId) {
  closeOv('ovFicha');
  clearLote();
  go('lote');
  const s = $('lo-vac');
  if (vacId) s.value = String(vacId);
  if (s._niceRefresh) s._niceRefresh();
  toggleLoteMulti();
  checkLoteExistente();
  regResumenLote();
  if (vacId) $('lo-num').focus();
}
function iniDescarte() { closeOv('ovFicha'); clearDescarte(); go('descarte'); }
function iniDescartarLote(loteId) {
  const l = VENCIDAS_CACHE.find(x => Number(x.lote_id) === Number(loteId));
  if (l) return irADescartarLote(l);
  // Lote vencido que no vino en las alertas: se arma con lo que hay en el stock
  const r = (STOCK_CACHE || []).find(x => Number(x.id) === Number(loteId));
  if (r) return irADescartarLote({ lote_id: r.id, vacuna_id: r.vacuna_id, disponible: Number(r.disponible) });
  iniDescarte();
}

/* ---------- Para resolver ---------- */
const INI_IC = {
  urg:    '<svg viewBox="0 0 16 16" width="15" height="15"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.7v4M8 11.2v.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  frasco: '<svg viewBox="0 0 16 16" width="15" height="15"><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="M5.5 1.5h5M6.5 1.5V4L5 6v7.5a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V6L9.5 4V1.5M5 9.5h6"/></svg>',
  bajo:   '<svg viewBox="0 0 16 16" width="15" height="15"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M8 2.5v7.5M4.8 7 8 10.2 11.2 7M3 13.5h10"/></svg>',
  reloj:  '<svg viewBox="0 0 16 16" width="15" height="15"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.6V8l2.3 1.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  vacio:  '<svg viewBox="0 0 16 16" width="15" height="15"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3.8 12.2l8.4-8.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  ok:     '<svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12.5 20.5l5 5 10-11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function iniTareas() {
  if (!DASH) return [];
  const info = iniInfo();
  const U = iniDiasVenc();
  const t = [];
  const verLote = id => (info.viewTrazabilidad ? { lbl: 'Ver lote', fn: `verTrazabilidad(${id})` } : null);

  // Urgente: lotes vencidos que todavía tienen dosis
  (DASH.alertas?.vencidas || []).forEach(l => t.push({
    sev: 'urg', ic: 'urg',
    tit: `Descartar el lote vencido de ${iniTxt(l.vacuna)}`,
    det: `Lote ${iniTxt(l.numero_lote)}: ${l.disponible} dosis. Venció ${fmtDias(l.dias)}.`,
    acc: info.write ? { lbl: 'Descartar', fn: `iniDescartarLote(${l.lote_id})`, cls: 'is-peligro' } : verLote(l.lote_id),
  }));
  // Urgente: frascos multidosis abiertos que ya vencieron
  (DASH.frascos || []).filter(f => f.dias_restantes < 0).forEach(f => t.push({
    sev: 'urg', ic: 'frasco',
    tit: `Descartar el frasco abierto de ${iniTxt(f.vacuna)}`,
    det: `Lote ${iniTxt(f.numero_lote)}: quedan ${f.dosis_sobrantes} dosis. ${f.causa_vencimiento === 'lote' ? 'Venció junto con el lote.' : `Lleva ${f.dias_abierto} días abierto.`}`,
    acc: info.write ? { lbl: 'Descartar', fn: `descartarFrascoVencido(${f.frasco_id})`, cls: 'is-peligro' } : null,
  }));
  // Para revisar: vacunas con poco stock (sumando todos sus lotes)
  (DASH.vacunas || []).filter(v => iniEstado(v) === 'low').forEach(v => t.push({
    sev: 'rev', ic: 'bajo',
    tit: `Queda poco stock de ${iniTxt(v.nombre)}`,
    det: `${v.stock} dosis vigentes. ${iniCobertura(v)}`,
    acc: { lbl: 'Ver', fn: `iniAbrirFicha(${v.id})` },
  }));
  // Para revisar: lotes que vencen dentro del umbral
  (DASH.radar || []).filter(l => l.dias >= 0 && l.dias <= U).forEach(l => t.push({
    sev: 'rev', ic: 'reloj',
    tit: `Usar primero el lote ${iniTxt(l.numero_lote)}`,
    det: `${iniTxt(l.vacuna)}: ${l.disponible} dosis. Vence ${fmtDias(l.dias)}, el ${fmtFecha(l.vencimiento)}.`,
    acc: info.write ? { lbl: 'Aplicar', fn: `iniAplicar(${l.vacuna_id}, ${l.lote_id})` } : verLote(l.lote_id),
  }));
  // Para revisar: frascos abiertos que vencen dentro del umbral
  (DASH.frascos || []).filter(f => f.dias_restantes >= 0 && f.dias_restantes <= U).forEach(f => t.push({
    sev: 'rev', ic: 'frasco',
    tit: `Terminar el frasco abierto de ${iniTxt(f.vacuna)}`,
    det: `Lote ${iniTxt(f.numero_lote)}: quedan ${f.dosis_sobrantes} dosis. Vence ${fmtDias(f.dias_restantes)}${f.causa_vencimiento === 'lote' ? ', junto con el lote' : ''}.`,
    acc: info.write ? { lbl: 'Aplicar', fn: `iniAplicar(${f.vacuna_id}, ${f.lote_id})` } : null,
  }));
  // Para revisar: vacunas sin stock, agrupadas en un solo aviso
  const sin = (DASH.vacunas || []).filter(v => v.stock <= 0);
  if (sin.length) {
    const nombres = sin.slice(0, 3).map(v => iniTxt(v.nombre)).join(', ');
    t.push({
      sev: 'rev', ic: 'vacio',
      tit: sin.length === 1 ? `Sin stock de ${iniTxt(sin[0].nombre)}` : `${sin.length} vacunas sin stock`,
      det: sin.length === 1 ? 'No quedan dosis vigentes.' : `${nombres}${sin.length > 3 ? ` y ${sin.length - 3} más` : ''}.`,
      acc: { lbl: 'Ver', fn: `iniFiltrarEstado('nostock', true)` },
    });
  }
  return t;
}

// Las tres alertas de siempre, sin sugerencias
function iniAlertas() {
  if (!DASH) return { venc: [], porv: [], bajo: [] };
  const U = iniDiasVenc();
  const venc = [
    ...(DASH.alertas?.vencidas || []).map(l => ({ tipo: 'lote', vacuna_id: l.vacuna_id, lote_id: l.lote_id, vacuna: l.vacuna, lote: l.numero_lote, dosis: l.disponible, dias: l.dias })),
    ...(DASH.frascos || []).filter(f => f.dias_restantes < 0).map(f => ({ tipo: 'frasco', vacuna_id: f.vacuna_id, frasco_id: f.frasco_id, vacuna: f.vacuna, lote: f.numero_lote, dosis: f.dosis_sobrantes, dias: f.dias_restantes })),
  ];
  const porv = (DASH.radar || []).filter(l => l.dias >= 0 && l.dias <= U).sort((a, b) => a.dias - b.dias);
  const bajo = (DASH.vacunas || []).filter(v => v.stock <= iniUmbral())
    .sort((a, b) => a.stock - b.stock || a.nombre.localeCompare(b.nombre));
  return { venc, porv, bajo };
}

function iniRenderTareas() {
  const cont = $('iniTareas');
  if (!cont) return;
  const info = iniInfo();
  const { venc, porv, bajo } = iniAlertas();
  const total = venc.length + porv.length + bajo.length;
  $('iniTarTotal').textContent = total ? String(total) : '';
  INI.abiertos = INI.abiertos || {};
  const LIM = 3;
  const grupo = (k, titulo, items, fila, vacio) => {
    const ver = INI.abiertos[k] ? items : items.slice(0, LIM);
    return `<section class="alg alg-${k}">
        <h3 class="alg-cinta"><span>${titulo}</span><b>${items.length}</b></h3>
        ${items.length
          ? `<ul class="alg-lista">${ver.map(fila).join('')}</ul>${items.length > LIM
              ? `<button type="button" class="alg-mas" onclick="INI.abiertos['${k}']=!INI.abiertos['${k}'];iniRenderTareas()">${INI.abiertos[k] ? 'Ver menos' : `Ver las ${items.length}`}</button>` : ''}`
          : `<p class="alg-vacio">${vacio}</p>`}
      </section>`;
  };
  const fVenc = x => {
    const acc = info.write
      ? `<button type="button" class="alg-acc" onclick="event.stopPropagation();${x.tipo === 'lote' ? `iniDescartarLote(${x.lote_id})` : `descartarFrascoVencido(${x.frasco_id})`}">Descartar</button>` : '';
    return `<li class="alg-fila" onclick="iniAbrirFicha(${x.vacuna_id})">
        <span class="alg-txt"><b>${iniTxt(x.vacuna)}</b><small>${x.tipo === 'lote' ? 'Lote' : 'Frasco abierto del lote'} ${iniTxt(x.lote)}, ${x.dosis} dosis</small></span>
        <span class="alg-dato">${x.tipo === 'lote' ? `Venció ${fmtDias(x.dias)}` : 'Vencido'}</span>${acc}
      </li>`;
  };
  const fPorv = l => `<li class="alg-fila" onclick="iniAbrirFicha(${l.vacuna_id})">
      <span class="alg-txt"><b>${iniTxt(l.vacuna)}</b><small>Lote ${iniTxt(l.numero_lote)}, ${l.disponible} dosis</small></span>
      <span class="alg-dato">${l.dias === 0 ? 'Hoy' : `${l.dias} ${l.dias === 1 ? 'día' : 'días'}`}</span>
    </li>`;
  const fBajo = v => `<li class="alg-fila" onclick="iniAbrirFicha(${v.id})">
      <span class="alg-txt"><b>${iniTxt(v.nombre)}</b><small>${v.stock <= 0 ? 'No quedan dosis vigentes' : iniCobertura(v)}</small></span>
      <span class="alg-dato${v.stock <= 0 ? ' is-cero' : ''}">${v.stock <= 0 ? 'Sin stock' : `${v.stock} dosis`}</span>
    </li>`;
  cont.innerHTML =
    grupo('venc', 'Vencidas', venc, fVenc, 'No hay dosis vencidas sin descartar.') +
    grupo('porv', `Vencen en ${iniDiasVenc()} días`, porv, fPorv, 'Ningún lote vence en los próximos días.') +
    grupo('bajo', 'Stock bajo', bajo, fBajo, 'Todas las vacunas tienen stock suficiente.');
}

function iniRenderTareasViejo() {
  const cont = $('iniTareas');
  if (!cont) return;
  const t = iniTareas();     // vienen ordenadas: primero lo urgente
  $('iniTarTotal').textContent = t.length ? String(t.length) : '';
  if (!t.length) {
    cont.innerHTML = `<div class="nota nota-ok"><span class="iman" aria-hidden="true"></span>
        <p class="nota-tit">Todo en orden</p><p class="nota-det">No hay vencimientos ni faltantes para resolver.</p></div>`;
    return;
  }
  const LIM = window.matchMedia('(max-width: 760px)').matches ? 3 : 4;
  const vis = INI.verMas ? t : t.slice(0, LIM);
  const nota = (x, i) => `<li class="nota sev-${x.sev}" style="--r:${[-1.4, 1, -.6, 1.5, -1.1][i % 5]}deg">
      <span class="iman" aria-hidden="true"></span>
      <p class="nota-tit">${x.tit}</p>
      <p class="nota-det">${x.det}</p>
      ${x.acc ? `<button type="button" class="tar-btn${x.acc.cls ? ' ' + x.acc.cls : ''}" onclick="${x.acc.fn}">${x.acc.lbl}</button>` : ''}
    </li>`;
  let html = `<ul class="notas">${vis.map(nota).join('')}</ul>`;
  if (t.length > LIM) {
    html += `<button type="button" class="tar-mas" onclick="INI.verMas=!INI.verMas;iniRenderTareas()">${INI.verMas ? 'Ver menos' : `Ver ${t.length - LIM} más`}</button>`;
  }
  cont.innerHTML = html;
}

/* ---------- Próximos vencimientos (línea de tiempo de 60 días) ---------- */
function iniZona(dias) { return dias < 0 ? 'venc' : dias <= iniDiasVenc() ? '15' : dias <= 30 ? '30' : '60'; }

function iniRenderVencimientos() {
  const lotes = (DASH?.radar || []).filter(l => l.dias >= 0 || !iniInfo().esProveedora).sort((a, b) => a.dias - b.dias);
  const prox = lotes.filter(l => l.dias >= 0);
  const dosis = prox.reduce((s, l) => s + l.disponible, 0);
  $('iniVenSub').textContent = prox.length
    ? `${prox.length} ${prox.length === 1 ? 'lote vence' : 'lotes vencen'} en los próximos 60 días, con ${nfmt(dosis)} dosis en total.`
    : 'Ningún lote con stock vence en los próximos 60 días.';
  iniDibujarTrack(lotes);
  const ver = $('iniVenVer');
  if (ver) {
    ver.textContent = prox.length > 1 ? `Ver los ${prox.length} lotes en Stock` : 'Ver en Stock';
    ver.style.display = prox.length ? '' : 'none';
  }
  const lista = $('iniVenLista');
  if (!lista) return;
  const LIM = 5;
  lista.innerHTML = prox.slice(0, LIM).map(l => {
    const [, m, d] = l.vencimiento.split('-');
    return `<li><button type="button" class="ven-item z-${iniZona(l.dias)}" onclick="iniAbrirFicha(${l.vacuna_id})">
        <span class="ven-hoja" aria-hidden="true"><b>${Number(d)}</b>${INI_MESES_C[Number(m) - 1]}</span>
        <span class="ven-item-txt"><b>${iniTxt(l.vacuna)}</b><small>Lote ${iniTxt(l.numero_lote)}</small></span>
        <span class="ven-item-dosis">${l.disponible} dosis</span>
        <span class="ven-item-dias">${l.dias === 0 ? 'Vence hoy' : `En ${l.dias} ${l.dias === 1 ? 'día' : 'días'}`}</span>
      </button></li>`;
  }).join('') + (prox.length > LIM
    ? `<li class="ven-mas"><button type="button" onclick="iniVerVencimientosEnStock()">Ver los ${prox.length} lotes en Stock</button></li>`
    : '');
}

function iniDibujarTrack(lotes) {
  const track = $('iniVenTrack');
  if (!track) return;
  const ancho = track.clientWidth || 800;
  const hayVenc = lotes.some(l => l.dias < 0);
  const nVenc = lotes.filter(l => l.dias < 0).length;
  // Franja de "vencidos" a la izquierda: al menos 84 px para que sus etiquetas no se pisen con "Hoy"
  const G = hayVenc ? Math.min(0.3, Math.max(0.12, 84 / ancho)) : 0.015;
  const FIN = 0.985;
  const xFrac = dias => (dias < 0 ? G * 0.5 : G + (Math.min(dias, 60) / 60) * (FIN - G));
  const pct = f => (f * 100).toFixed(2) + '%';

  // Puntos: tamaño según las dosis, en carriles para que no se pisen
  const puntos = lotes.map(l => ({ l, x: xFrac(l.dias) * ancho, r: Math.round(5 + Math.min(8, Math.sqrt(l.disponible) * 1.1)) }))
    .sort((a, b) => a.x - b.x);
  const carriles = [];
  puntos.forEach(p => {
    let k = carriles.findIndex(fin => p.x - p.r > fin + 4);
    if (k === -1) { k = carriles.length; carriles.push(0); }
    carriles[k] = p.x + p.r;
    p.k = k;
  });
  const EJE = 38, PASO = 30;
  const alto = EJE + 22 + Math.max(1, carriles.length) * PASO;
  track.style.height = alto + 'px';

  const hoy = DASH?.hoy?.fecha || today();
  const marcas = ancho < 520 ? [0, 15, 30, 60] : [0, 15, 30, 45, 60];   // en el celular, una marca menos
  const ticks = marcas.map(d => {
    const [y, m, dd] = sumarDiasYMD(hoy, d).split('-');
    const f = xFrac(d);
    const alin = f < 0.06 ? ' is-ini' : f > 0.94 ? ' is-fin' : '';
    return `<span class="ven-tick${alin}" style="left:${pct(f)}"><b>${d === 0 ? 'Hoy' : `${d} días`}</b>${Number(dd)} ${INI_MESES_C[Number(m) - 1]}</span>`;
  }).join('');
  const zona = `<span class="ven-zona" style="left:${pct(G)};width:${pct((iniDiasVenc() / 60) * (FIN - G))};bottom:${EJE}px"><span>Usar primero</span></span>`;
  const gutter = hayVenc
    ? `<span class="ven-gutter" style="width:${pct(G * 0.92)};bottom:${EJE}px"></span><span class="ven-tick is-venc" style="left:${pct(G * 0.46)}"><b>Vencidos</b>${nVenc} ${nVenc === 1 ? 'lote' : 'lotes'}</span>`
    : '';
  const dots = puntos.map(p => {
    const l = p.l;
    const yc = EJE + 18 + p.k * PASO;
    const tip = `${l.vacuna}, lote ${l.numero_lote}: ${l.disponible} dosis. ${l.dias < 0 ? `Venció ${fmtDias(l.dias)}` : `Vence ${fmtDias(l.dias)}`}, el ${fmtFecha(l.vencimiento)}.`;
    return `<span class="ven-palo" style="left:${pct(p.x / ancho)};bottom:${EJE}px;height:${yc - EJE}px"></span>
      <button type="button" class="ven-dot z-${iniZona(l.dias)}" style="left:${pct(p.x / ancho)};bottom:${yc}px;width:${p.r * 2}px;height:${p.r * 2}px"
        data-tip="${iniTxt(tip)}" aria-label="${iniTxt(tip)}" onclick="iniAbrirFicha(${l.vacuna_id})"></button>`;
  }).join('');
  track.innerHTML = `${gutter}${zona}<span class="ven-eje" style="bottom:${EJE}px"></span>${ticks}${dots}`;
}

// Suma días a "YYYY-MM-DD" sin zona horaria
function sumarDiasYMD(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function iniVerVencimientosEnStock() {
  go('stock');
  const s = $('stock-search'); if (s) s.value = '';
  const o = $('stock-orden');
  if (o) { o.value = 'venc-asc'; if (o._niceRefresh) o._niceRefresh(); }
  stSetEstado('');
}

/* ---------- Frascos abiertos ---------- */
function iniRenderFrascos() {
  const cont = $('iniFrascos');
  if (!cont) return;
  const fr = DASH?.frascos || [];
  const info = iniInfo();
  if (!fr.length) {
    cont.innerHTML = '<p class="fra-vacio">No hay frascos multidosis abiertos.</p>';
    return;
  }
  const U = iniDiasVenc();
  const C = 2 * Math.PI * 21;
  cont.innerHTML = fr.map(f => {
    const dr = f.dias_restantes;
    const z = dr < 0 ? 'venc' : dr <= U ? 'porv' : 'ok';
    const frac = Math.max(0, Math.min(1, dr / 30));
    const centro = dr < 0 ? '<b>!</b>' : `<b>${dr}</b><small>${dr === 1 ? 'día' : 'días'}</small>`;
    const pips = f.dosis_totales <= 20
      ? `<span class="fra-pips" aria-hidden="true">${Array.from({ length: f.dosis_totales }, (_, i) => `<i${i < f.dosis_sobrantes ? ' class="on"' : ''}></i>`).join('')}</span>`
      : '';
    const vence = dr < 0
      ? (f.causa_vencimiento === 'lote' ? 'Venció junto con el lote' : `Venció ${fmtDias(dr)}`)
      : `Vence ${fmtDias(dr)}${f.causa_vencimiento === 'lote' ? ', junto con el lote' : ''}`;
    let acc = '';
    if (info.write) {
      acc = dr < 0
        ? `<button type="button" class="tar-btn fic-btn-err" onclick="descartarFrascoVencido(${f.frasco_id})">Descartar</button>`
        : `<button type="button" class="tar-btn" onclick="iniAplicar(${f.vacuna_id}, ${f.lote_id})">Aplicar</button>`;
    }
    return `<article class="fra-item z-${z}">
        <div class="fra-anillo-wrap">
          <svg class="fra-anillo" viewBox="0 0 52 52" aria-hidden="true">
            <circle cx="26" cy="26" r="21" class="fra-anillo-base"/>
            ${dr >= 0 ? `<circle cx="26" cy="26" r="21" class="fra-anillo-arco" stroke-dasharray="${(frac * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 26 26)"/>` : ''}
          </svg>
          <span class="fra-centro">${centro}</span>
        </div>
        <div class="fra-txt">
          <p class="fra-nom">${iniTxt(f.vacuna)}</p>
          <p class="fra-lote">Lote ${iniTxt(f.numero_lote)}, abierto el ${fmtFecha(f.fecha_apertura)}</p>
          ${pips}
          <p class="fra-dosis">Quedan ${f.dosis_sobrantes} de ${f.dosis_totales} dosis</p>
          <p class="fra-vence">${vence}</p>
          ${acc ? `<div class="fra-acc">${acc}</div>` : ''}
        </div>
      </article>`;
  }).join('');
}

/* ---------- Actividad de hoy ---------- */
function iniRenderActividad() {
  const serieCont = $('iniSerie');
  if (!serieCont) return;
  const serie = DASH?.serie14 || [];
  const total = serie.reduce((s, p) => s + p.dosis, 0);
  const max = Math.max(1, ...serie.map(p => p.dosis));
  const barras = serie.map((p, i) => {
    const esHoy = i === serie.length - 1;
    const [y, m, d] = p.dia.split('-').map(Number);
    const nombre = esHoy ? 'Hoy' : `${INI_DIAS[new Date(y, m - 1, d).getDay()]} ${d}/${m}`;
    const h = p.dosis > 0 ? Math.max(6, Math.round((p.dosis / max) * 100)) : 4;
    return `<span class="${esHoy ? 'hoy' : ''}${p.dosis === 0 ? ' cero' : ''}" style="height:${h}%" data-tip="${nombre}: ${p.dosis} dosis"></span>`;
  }).join('');
  serieCont.innerHTML = `<div class="act-serie-txt"><span>Aplicaciones de los últimos 14 días</span><b>${nfmt(total)} dosis</b></div>
    <div class="act-barras" role="img" aria-label="Aplicaciones por día en los últimos 14 días: ${total} dosis en total.">${barras}</div>`;

  const TITULO = {
    aplicacion:  v => `Aplicación de ${v}`,
    descarte:    v => `Descarte de ${v}`,
    ingreso:     v => `Ingreso de ${v}`,
    edicion:     v => `Edición de un lote de ${v}`,
    eliminacion: v => `Se eliminó un lote de ${v}`,
  };
  const CLASE = { aplicacion: 'apl', descarte: 'des', ingreso: 'ing', edicion: 'edi', eliminacion: 'eli' };
  const acts = DASH?.actividad || [];
  $('iniActividad').innerHTML = acts.length ? acts.map(m => {
    const v = iniTxt(m.vacuna);
    const tit = (TITULO[m.tipo] || (x => x))(v);
    const det = (m.tipo === 'edicion' || m.tipo === 'eliminacion')
      ? iniTxt(m.motivo || '')
      : `${m.cantidad} dosis${m.numero_lote ? `, lote ${iniTxt(m.numero_lote)}` : ''}${m.tipo === 'descarte' && m.motivo ? `. ${iniTxt(m.motivo)}` : ''}`;
    return `<li class="act-item t-${CLASE[m.tipo] || 'edi'}">
        <time>${m.hora}</time><span class="act-punto" aria-hidden="true"></span>
        <div><p class="act-tit">${tit}</p><p class="act-det">${det}</p></div>
      </li>`;
  }).join('') : '<li class="act-vacio">Todavía no se registraron movimientos hoy.</li>';

  const ver = $('iniActVer');
  if (ver) {
    const n = DASH?.actividadTotal || 0;
    ver.textContent = n > acts.length ? `Ver los ${n} movimientos de hoy` : 'Ver los movimientos de hoy';
    ver.style.display = n ? '' : 'none';
  }
}

function iniVerMovimientosHoy() {
  go('mov');
  const r = $('mv-rango');
  if (r) {
    r.value = 'hoy';
    if (r._niceRefresh) r._niceRefresh();
    mvOnRangoChange();
  }
}

/* ---------- Tooltip compartido (puntos de vencimiento y barras) ---------- */
function iniTipMostrar(el) {
  const tip = $('iniTip');
  if (!tip || !el.dataset.tip) return;
  tip.textContent = el.dataset.tip;
  tip.hidden = false;
  const r = el.getBoundingClientRect();
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  const x = Math.max(8, Math.min(window.innerWidth - tw - 8, r.left + r.width / 2 - tw / 2));
  let y = r.top - th - 8;
  if (y < 8) y = r.bottom + 8;
  tip.style.left = x + 'px';
  tip.style.top = y + 'px';
}
function iniTipOcultar() { const t = $('iniTip'); if (t) t.hidden = true; }
document.addEventListener('mouseover', e => { const el = e.target.closest && e.target.closest('#page-inicio [data-tip]'); if (el) iniTipMostrar(el); });
document.addEventListener('mouseout', e => { const el = e.target.closest && e.target.closest('#page-inicio [data-tip]'); if (el && !el.contains(e.relatedTarget)) iniTipOcultar(); });
document.addEventListener('focusin', e => { const el = e.target.closest && e.target.closest('#page-inicio [data-tip]'); if (el) iniTipMostrar(el); else iniTipOcultar(); });
window.addEventListener('scroll', iniTipOcultar, true);

// La línea de tiempo se recalcula al cambiar el ancho de la ventana
let _iniResize;
window.addEventListener('resize', () => {
  clearTimeout(_iniResize);
  _iniResize = setTimeout(() => {
    if (DASH && $('page-inicio')?.classList.contains('on')) iniDibujarTrack(DASH.radar || []);
  }, 150);
});

/* ---------- Actualización ---------- */
async function iniActualizar() {
  const b = document.querySelector('.ini-refresh');
  if (b) b.classList.add('girando');
  try {
    await Promise.all([loadDashboard(), loadStock()]);
  } catch (err) {
    toast('err', 'No se pudieron actualizar los datos. Revisá la conexión e intentá de nuevo.');
  } finally {
    if (b) b.classList.remove('girando');
  }
}
// Cada 5 minutos, si el Inicio está a la vista, se vuelven a pedir los datos
function iniProgramarRefresco() {
  clearTimeout(INI.timer);
  INI.timer = setTimeout(async () => {
    if (!TOKEN) return;
    const aLaVista = document.visibilityState === 'visible' && $('page-inicio')?.classList.contains('on');
    if (!aLaVista) return iniProgramarRefresco();
    try { await Promise.all([loadDashboard(), loadStock()]); }
    catch (e) { iniProgramarRefresco(); }
  }, 5 * 60 * 1000);
}

/**
 * Carga el panel de reposición del dashboard de proveedora: cuántas vacunas
 * hay en cada prioridad y una lista corta con las primeras a pedir.
 */
async function loadResumenReposicion() {
  try {
    const d = await api('/dashboard/reposicion');
    if ($('prov-urg'))  $('prov-urg').textContent  = d.conteo.URGENTE;
    if ($('prov-alta')) $('prov-alta').textContent = d.conteo.ALTA;
    if ($('prov-med'))  $('prov-med').textContent  = d.conteo.MEDIA;
    const lista = $('prov-lista');
    const nota = $('prov-lista-nota');
    if (!lista) return;
    if (d.total === 0) {
      lista.innerHTML = '<li class="prov-lista-vacia">No hay vacunas que necesiten reposición. Todo el stock está al día.</li>';
      if (nota) nota.textContent = '';
      return;
    }
    const TOP = 5;
    const top = d.items.slice(0, TOP);
    lista.innerHTML = top.map(it => {
      const multi = Number(it.dosis_por_frasco) > 1 ? ` <span class="chip-multi chip-frasco">Frasco × ${it.dosis_por_frasco}</span>` : '';
      const det = it.disponible === 0
        ? it.situacion
        : `${it.situacion}: ${it.disponible} dosis disponibles${it.por_vencer > 0 ? `, ${it.por_vencer} por vencer` : ''}`;
      const prio = it.prioridad.charAt(0) + it.prioridad.slice(1).toLowerCase();
      return `<li class="prov-item prov-prio-${it.prioridad.toLowerCase()}">
        <span class="prov-prio-tag">${prio}</span>
        <div class="prov-item-body">
          <div class="prov-item-nom"><b>${escHtml(it.vacuna)}</b>${multi}</div>
          <div class="prov-item-det">${det}</div>
        </div>
      </li>`;
    }).join('');
    if (nota) {
      nota.textContent = d.total > TOP
        ? `Mostrando las ${TOP} más urgentes de ${d.total}. Descargá el Excel para ver todas.`
        : `${d.total} ${d.total === 1 ? 'vacuna requiere' : 'vacunas requieren'} reposición.`;
    }
  } catch (err) {
    console.error('loadResumenReposicion:', err);
    const lista = $('prov-lista');
    if (lista) lista.innerHTML = '<li class="prov-lista-vacia">No se pudo cargar el resumen.</li>';
  }
}

/**
 * Carga el resumen de actividad para el panel de la jefa.
 * Trae aplicaciones semanales, descartes mensuales, tasa de descarte por
 * vencimiento y las 3 vacunas más aplicadas del mes.
 */
async function loadResumenActividad() {
  try {
    const d = await api('/dashboard/actividad');
    const ap = d.aplicacionesSemana;
    const de = d.descartesMes;
    if ($('jefaApSem')) $('jefaApSem').textContent = ap.dosis;
    if ($('jefaApSemDet')) $('jefaApSemDet').textContent =
      `${ap.movimientos} ${ap.movimientos === 1 ? 'registro' : 'registros'} en 7 días`;

    if ($('jefaDescMes')) $('jefaDescMes').textContent = de.dosis;
    if ($('jefaDescMesDet')) $('jefaDescMesDet').textContent =
      `${de.movimientos} ${de.movimientos === 1 ? 'registro' : 'registros'} en 30 días`;

    if ($('jefaTasa')) {
      $('jefaTasa').textContent = de.tasaVencimiento + '%';
      // Coloreado: verde <15%, amarillo 15-30%, rojo >30%
      $('jefaTasa').classList.remove('warn', 'crit');
      if (de.tasaVencimiento > 30) $('jefaTasa').classList.add('crit');
      else if (de.tasaVencimiento > 15) $('jefaTasa').classList.add('warn');
    }
    if ($('jefaTasaDet')) $('jefaTasaDet').textContent =
      de.dosis > 0
        ? `${de.dosisPorVencimiento} de ${de.dosis} dosis descartadas`
        : 'sin descartes este mes';

    const top = $('jefaTop');
    if (top) {
      if (d.topVacunasMes && d.topVacunasMes.length > 0) {
        top.innerHTML = d.topVacunasMes
          .map(v => `<li><span class="ges-top-nom">${escHtml(v.nombre)}</span><span class="ges-top-n">${v.dosis} dosis</span></li>`)
          .join('');
      } else {
        top.innerHTML = '<li class="jefa-top-empty">Sin aplicaciones registradas en el último mes.</li>';
      }
    }
  } catch (err) {
    console.error('loadResumenActividad:', err);
  }
}

/**
 * Descarte rápido de un lote vencido: abre el formulario de descarte con la
 * vacuna, el lote, el motivo y la cantidad ya cargados.
 * Sin parámetro usa el primer lote vencido de las alertas.
 */
async function irADescartarLote(lote){
  const l = lote || VENCIDAS_CACHE[0];
  closeOv('ovFicha');
  clearDescarte();
  go('descarte');
  if (!l) return;
  const selVac = $('de-vac');
  selVac.value = String(l.vacuna_id);
  if (selVac._niceRefresh) selVac._niceRefresh();
  await loadLotes('de');
  const selLote = $('de-lote');
  selLote.value = String(l.lote_id);
  if (selLote._niceRefresh) selLote._niceRefresh();
  const mot = $('de-motivo');
  mot.value = 'Vencimiento';
  if (mot._niceRefresh) mot._niceRefresh();
  const disp = Number(l.disponible) || 0;
  if (esMulti(l.vacuna_id)) {
    const d = dpf(l.vacuna_id);
    $('de-cant').value = Math.floor(disp / d);
    $('de-sueltas').value = disp % d;
  } else {
    $('de-cant').value = disp;
  }
  toggleDescarteMulti();
  regResumenDescarte();
}

/**
 * Descarta un frasco abierto vencido (por id, o el primero de las alertas).
 * Confirma con el usuario mostrando los detalles del frasco.
 */
async function descartarFrascoVencido(frascoId){
  const f = frascoId
    ? (FRASCOS_VENCIDOS_CACHE.find(x => Number(x.frasco_id) === Number(frascoId))
       || (DASH?.frascos || []).find(x => Number(x.frasco_id) === Number(frascoId)))
    : FRASCOS_VENCIDOS_CACHE[0];
  if (!f) return;
  const ok = confirm(
    `¿Descartar el frasco abierto de ${f.vacuna} (lote ${f.numero_lote})?\n\n` +
    `Se descuentan ${f.dosis_sobrantes} dosis sobrantes con motivo "Frasco abierto vencido".`
  );
  if (!ok) return;
  try {
    const r = await api(`/descartes/frasco/${f.frasco_id}`, { method: 'POST' });
    toast('ok', r.mensaje);
    await Promise.all([loadDashboard(), loadStock(), loadMovimientos()]);
  } catch (err) {
    toast('err', err.message);
  }
}

// Cache de la última respuesta del stock para poder re-renderizar con
// distintos filtros/órdenes sin volver a llamar a la API.
let STOCK_CACHE = [];

async function loadStock(){
  STOCK_CACHE = await api('/stock');
  renderStock();
}

// Orden por urgencia. Las vacunas SIN stock quedan al final por defecto
// (menos importantes que las alertas activas).
const ESTADO_PRIO = { vencida: 0, exp: 1, low: 2, ok: 3, nostock: 4 };

function renderStock(){
  const ETIQ = {
    ok: 'Disponible',
    low: 'Stock bajo',
    exp: 'Por vencer',
    vencida: 'Vencida',
    nostock: 'Sin stock',
  };
  let rows = [...STOCK_CACHE];

  // Filtros
  const q = ($('stock-search')?.value || '').trim().toLowerCase();
  const est = $('stock-estado')?.value || '';
  if (q) rows = rows.filter(r => r.vacuna.toLowerCase().includes(q));
  if (est === 'reposicion') {
    // Filtro combinado para la proveedora: todo lo que hay que reponer
    const necesitaReposicion = new Set(['nostock', 'low', 'exp']);
    rows = rows.filter(r => necesitaReposicion.has(r.estado));
  } else if (est) {
    rows = rows.filter(r => r.estado === est);
  }

  // Orden — para vacunas sin stock (dias_para_vencer null), tratamos como infinito
  const dias = r => (r.dias_para_vencer === null || r.dias_para_vencer === undefined) ? 999999 : Number(r.dias_para_vencer);
  const disp = r => (r.disponible === null || r.disponible === undefined) ? 0 : Number(r.disponible);
  const lote = r => r.numero_lote || '';

  const ord = $('stock-orden')?.value || 'urgencia';
  const cmp = {
    urgencia:   (a,b) => ESTADO_PRIO[a.estado] - ESTADO_PRIO[b.estado]
                       || dias(a) - dias(b)
                       || a.vacuna.localeCompare(b.vacuna),
    'venc-asc': (a,b) => dias(a) - dias(b),
    'venc-desc':(a,b) => dias(b) - dias(a),
    vacuna:     (a,b) => a.vacuna.localeCompare(b.vacuna)
                       || lote(a).localeCompare(lote(b)),
    'disp-asc': (a,b) => disp(a) - disp(b),
    'disp-desc':(a,b) => disp(b) - disp(a),
  }[ord];
  if (cmp) rows.sort(cmp);

  $('stockBody').innerHTML = rows.length ? rows.map(r => renderStockRow(r, ETIQ)).join('')
    : '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px">Sin resultados para los filtros aplicados.</td></tr>';

  // Contador y botón limpiar
  const total = STOCK_CACHE.length;
  const contador = $('st-contador');
  if (contador) {
    contador.innerHTML = rows.length === total
      ? `Mostrando <b>${total}</b> ${total === 1 ? 'vacuna' : 'vacunas'}`
      : `Mostrando <b>${rows.length}</b> de <b>${total}</b>`;
  }
  const hayFiltros = !!(q || est);
  const btnLimpiar = $('st-limpiar');
  if (btnLimpiar) btnLimpiar.style.display = hayFiltros ? '' : 'none';
}

// Renderiza una fila de la tabla de stock. Maneja dos casos:
//  1) vacuna con lote (fila normal)
//  2) vacuna sin lotes (fila especial con placeholders)
function renderStockRow(r, ETIQ) {
  const dash = '<span style="color:var(--muted)">—</span>';
  // Vacuna sin stock: mostramos fila especial más simple
  if (r.estado === 'nostock') {
    return `<tr class="row-sinstock">
      <td data-label="Vacuna"><b>${r.vacuna}</b>${chipMulti(r.dosis_por_frasco)}</td>
      <td data-label="Lote">${dash}</td>
      <td data-label="Vencimiento">${dash}</td>
      <td data-label="Dosis disponibles"><span style="color:var(--muted)">0 dosis</span></td>
      <td data-label="Estado"><span class="pill nostock">${ETIQ.nostock}</span></td>
      <td class="enfermeria-only"></td>
      <td class="traz-only"></td>
    </tr>`;
  }
  // Fila normal con lote
  const multi = Number(r.dosis_por_frasco) > 1;
  const dispCell = multi
    ? `<b>${r.disponible}</b> dosis <small style="color:var(--muted);display:block">${fmtDisp(r.disponible, r.dosis_por_frasco)}</small>`
    : `<b>${r.disponible}</b> dosis`;
  const dias = Number(r.dias_para_vencer);
  // Vencimiento del envase + info del frasco abierto si hay
  let venceCell = `${fmtFecha(r.vencimiento)} <small style="color:var(--muted);display:block">${dias < 0 ? 'venció' : 'vence'} ${fmtDias(dias)}</small>`;
  if (r.frasco_id) {
    const dr = Number(r.frasco_dias_restantes);
    const sob = Number(r.frasco_dosis_sobrantes);
    const causaTxt = r.frasco_causa_vencimiento === 'lote'
      ? '<span class="frasco-info-causa">por vencimiento del lote</span>' : '';
    // Mismo umbral que el dashboard (15 días) para que los colores coincidan en ambas pantallas
    const cls = dr < 0 ? 'frasco-info venc' : (dr <= 15 ? 'frasco-info porv' : 'frasco-info');
    const titulo = dr < 0 ? 'Frasco vencido' : 'Frasco abierto';
    const detalle = dr < 0
      ? `Hace ${Math.abs(dr)} ${Math.abs(dr) === 1 ? 'día' : 'días'}, quedan ${sob} dosis`
      : `Vence en ${dr} ${dr === 1 ? 'día' : 'días'}, quedan ${sob} dosis`;
    venceCell += `<div class="${cls}">${ICON_FRASCO}<div><span class="frasco-info-tit">${titulo}</span><span class="frasco-info-det">${detalle}</span>${causaTxt}</div></div>`;
  }
  const payload = encodeURIComponent(JSON.stringify({
    id: r.id, vacuna: r.vacuna, numero_lote: r.numero_lote, vencimiento: r.vencimiento,
    cantidad_inicial: r.cantidad_inicial, disponible: r.disponible, dosis_por_frasco: r.dosis_por_frasco
  }));
  return `<tr>
    <td data-label="Vacuna"><b>${r.vacuna}</b>${chipMulti(r.dosis_por_frasco)}</td>
    <td data-label="Lote">${r.numero_lote}</td>
    <td data-label="Vencimiento">${venceCell}</td>
    <td data-label="Dosis disponibles">${dispCell}</td>
    <td data-label="Estado"><span class="pill ${r.estado}">${ETIQ[r.estado]}</span></td>
    <td class="enfermeria-only" style="text-align:right;white-space:nowrap">
      <button class="btn subtle sm" onclick="openEditLote('${payload}')" title="Corregir número de lote, vencimiento o cantidad">Editar</button>
      <button class="btn-eliminar-icon" style="margin-left:4px" onclick="eliminarLote(${r.id}, '${(r.vacuna || '').replace(/'/g, '&apos;')}', '${(r.numero_lote || '').replace(/'/g, '&apos;')}')" title="Eliminar el lote (solo si no tiene aplicaciones ni descartes)" aria-label="Eliminar el lote ${(r.numero_lote || '').replace(/'/g, '&apos;')}">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M3 4h10M6 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M4 4l1 9a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l1-9M7 7v4M9 7v4"/></svg>
      </button>
    </td>
    <td class="traz-only" style="text-align:right;white-space:nowrap">
      <button class="btn-traz" onclick="verTrazabilidad(${r.id})" title="Ver información completa del lote y datos del laboratorio">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM11 11l3 3M7 5v4M5 7h4"/></svg>
        <span>Detalles</span>
      </button>
    </td>
  </tr>`;
}

// Setea el estado desde código (por ejemplo la vista por defecto de proveedora)
function stSetEstado(est){
  $('stock-estado').value = est;
  if ($('stock-estado')._niceRefresh) $('stock-estado')._niceRefresh();
  renderStock();
}

// Al elegir estado en el desplegable, solo re-renderiza
function stOnEstadoManual(){
  renderStock();
}

function stClearFiltros(){
  $('stock-search').value = '';
  $('stock-estado').value = '';
  $('stock-orden').value = 'urgencia';
  ['stock-estado','stock-orden'].forEach(id => {
    const el = $(id);
    if (el && el._niceRefresh) el._niceRefresh();
  });
  renderStock();
}

/* ---------- Movimientos: cache + filtros ---------- */
let MOV_CACHE = [];

async function loadMovimientos(){
  MOV_CACHE = await api('/movimientos');
  // Poblar el selector de vacunas del filtro con las que efectivamente aparecen
  // en los movimientos (más útil que listar las 18 del catálogo, muchas sin datos).
  const sel = $('mv-vac');
  if (sel) {
    const nombres = [...new Set(MOV_CACHE.map(m => m.vacuna))].sort();
    const anterior = sel.value;
    sel.innerHTML = '<option value="">Todas</option>' +
      nombres.map(n => `<option value="${n}">${n}</option>`).join('');
    // Restaurar selección si sigue existiendo
    if (nombres.includes(anterior)) sel.value = anterior;
    // Si el select ya fue enhanced, refrescar sus opciones
    if (sel._niceRefresh) sel._niceRefresh();
  }
  renderMovimientos();
}

// Comparadora: convierte "YYYY-MM-DD" o Date a comparable YYYY-MM-DD
// Los timestamps llegan en UTC ("2026-11-04T23:30:00.000Z"): se pasan a la
// fecha LOCAL para que después de las 21 hs no cuenten como del día siguiente.
function toISODate(v){
  if (!v) return '';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  return isNaN(d) ? String(v).slice(0, 10) : ymdLocal(d);
}

function renderMovimientos(){
  const TIPO = {
    aplicacion: ['apl','Aplicación'],
    descarte:   ['des','Descarte'],
    ingreso:    ['ing','Ingreso lote'],
    edicion:    ['edi','Edición'],
    eliminacion:['eli','Eliminación'],
  };
  let rows = [...MOV_CACHE];

  // Aplicar filtros
  const fTipo  = $('mv-tipo')?.value || '';
  const fVac   = $('mv-vac')?.value || '';
  const fDesde = $('mv-desde')?.value || '';
  const fHasta = $('mv-hasta')?.value || '';

  if (fTipo)  rows = rows.filter(m => m.tipo === fTipo);
  if (fVac)   rows = rows.filter(m => m.vacuna === fVac);
  if (fDesde) rows = rows.filter(m => toISODate(m.fecha_mov) >= fDesde);
  if (fHasta) rows = rows.filter(m => toISODate(m.fecha_mov) <= fHasta);

  // Renderizar cuerpo
  $('movBody').innerHTML = rows.length ? rows.map(m=>{
    const [cls,lbl] = TIPO[m.tipo];
    // Solo mostramos "Eliminar" en aplicaciones y descartes.
    // Los ingresos se eliminan borrando el lote desde Stock.
    // Edición y eliminación son registros de auditoría, no se pueden borrar.
    const puedeEliminar = m.tipo === 'aplicacion' || m.tipo === 'descarte';
    const btnEliminar = puedeEliminar
      ? `<button class="btn-eliminar-icon" onclick="eliminarMovimiento(${m.id}, '${lbl}', '${(m.vacuna || '').replace(/'/g, '&apos;')}', ${m.cantidad})" title="Eliminar movimiento y devolver las dosis al stock" aria-label="Eliminar movimiento">
           <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M3 4h10M6 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M4 4l1 9a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l1-9M7 7v4M9 7v4"/></svg>
         </button>`
      : '<span class="muted-dash">—</span>';
    return `<tr>
       <td data-label="Fecha mov.">${fmtFecha(toISODate(m.fecha_mov))}</td>
       <td data-label="Fecha aplic.">${fmtFecha(m.fecha_aplicacion)}</td>
       <td data-label="Vacuna"><b>${m.vacuna}</b></td>
       <td data-label="Lote">${m.numero_lote || '<span class="muted-dash">—</span>'}</td>
       <td data-label="Tipo"><span class="pill ${cls}">${lbl}</span></td>
       <td data-label="Motivo">${m.motivo || '<span class="muted-dash">—</span>'}</td>
       <td data-label="Cant.">${m.cantidad}</td>
       <td data-label="Resp.">${m.responsable}</td>
       <td data-label="Acciones" class="enfermeria-only col-acciones">${btnEliminar}</td>
     </tr>`; }).join('')
    : '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:24px">Sin movimientos que coincidan con los filtros.</td></tr>';

  // Contador y botón de limpiar
  const total = MOV_CACHE.length;
  const contador = $('mv-contador');
  if (contador) {
    contador.innerHTML = rows.length === total
      ? `Mostrando <b>${total}</b> ${total === 1 ? 'movimiento' : 'movimientos'}`
      : `Mostrando <b>${rows.length}</b> de <b>${total}</b> movimientos`;
  }
  const hayFiltros = !!(fTipo || fVac || fDesde || fHasta);
  const btnLimpiar = $('mv-limpiar');
  if (btnLimpiar) btnLimpiar.style.display = hayFiltros ? '' : 'none';
}

// Rangos rápidos: setean fechas y actualizan
function mvOnRangoChange(){
  const rango = $('mv-rango').value;
  const hoy = new Date();
  const iso = d => ymdLocal(d);
  let desde = '', hasta = '';
  const custom = rango === 'custom';
  if (rango === 'hoy') {
    desde = hasta = iso(hoy);
  } else if (rango === '7d') {
    const ini = new Date(hoy); ini.setDate(ini.getDate() - 6);
    desde = iso(ini); hasta = iso(hoy);
  } else if (rango === 'mes') {
    desde = iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
    hasta = iso(hoy);
  }
  // En 'todo' y 'custom' se dejan los campos vacíos (o los que el usuario haya cargado)
  if (!custom) {
    $('mv-desde').value = desde;
    $('mv-hasta').value = hasta;
  }
  // Mostrar/ocultar los campos de fecha manual
  $('mv-desde-wrap').style.display = custom ? '' : 'none';
  $('mv-hasta-wrap').style.display = custom ? '' : 'none';
  renderMovimientos();
}

// Si el usuario toca las fechas a mano estando en modo custom, solo re-render
function mvOnFechaManual(){
  renderMovimientos();
}

function mvClearFiltros(){
  $('mv-tipo').value = '';
  $('mv-vac').value = '';
  $('mv-desde').value = '';
  $('mv-hasta').value = '';
  $('mv-rango').value = 'todo';
  $('mv-desde-wrap').style.display = 'none';
  $('mv-hasta-wrap').style.display = 'none';
  // Sincronizar componentes custom si están activos
  ['mv-tipo','mv-vac','mv-rango'].forEach(id => {
    const el = $(id);
    if (el && el._niceRefresh) el._niceRefresh();
  });
  renderMovimientos();
}

/* ---------- Selectores de lote ---------- */
async function loadLotes(pref){
  const vacId = $(pref+'-vac').value;
  const sel = $(pref+'-lote');
  if(!vacId){ sel.innerHTML = '<option value="">Seleccionar vacuna primero…</option>'; }
  else {
    try{
      const lotes = await api(`/vacunas/${vacId}/lotes`);
      const d = dpf(vacId);
      sel.innerHTML = lotes.length
        ? '<option value="">Seleccionar…</option>' + lotes.map(l=>{
            const disp = d > 1
              ? `${l.disponible} dosis`
              : `${l.disponible} dosis`;
            return `<option value="${l.id}" data-disp="${l.disponible}">${l.numero_lote}, vence ${fmtFecha(l.vencimiento)}, ${disp}</option>`;
          }).join('')
        : '<option value="">Sin lotes disponibles</option>';
    }catch(err){ toast('err', err.message); }
  }
  if (sel._niceRefresh) sel._niceRefresh();
  // Si es el descarte, también togglear el campo de dosis sueltas
  if (pref === 'de') toggleDescarteMulti();
}

/* ---------- Toggle de campos según vacuna seleccionada ---------- */
// Lote: cambia el label entre "Cantidad de dosis" y "Cantidad de frascos"
// y muestra abajo el total calculado en dosis.
function toggleLoteMulti(){
  const multi = esMulti($('lo-vac').value);
  const d = dpf($('lo-vac').value);
  $('lo-cant-lbl').innerHTML = multi
    ? 'Cantidad de frascos <span class="req">*</span>'
    : 'Cantidad de dosis <span class="req">*</span>';
  $('lo-cant').placeholder = multi ? 'Cantidad de frascos' : 'Cantidad de dosis';
  const hint = $('lo-cant-hint');
  if (multi) {
    const frascos = Number($('lo-cant').value) || 0;
    hint.style.display = 'block';
    hint.textContent = `Total: ${frascos * d} dosis (${d} dosis por frasco)`;
  } else {
    hint.style.display = 'none';
  }
}
// Descarte: cuando es multidosis muestra el segundo campo (dosis sueltas)
// y reinterpreta el primero como frascos.
function toggleDescarteMulti(){
  const multi = esMulti($('de-vac').value);
  const d = dpf($('de-vac').value);
  $('de-cant-lbl').innerHTML = multi
    ? 'Frascos a descartar <span class="req">*</span>'
    : 'Cantidad de dosis <span class="req">*</span>';
  $('de-cant').placeholder = multi ? 'Frascos' : 'Dosis';
  $('de-multi-extra').style.display = multi ? 'block' : 'none';
  const hint = $('de-total');
  if (multi) {
    const fr = Number($('de-cant').value) || 0;
    const su = Number($('de-sueltas').value) || 0;
    hint.textContent = `Total: ${fr * d + su} dosis`;
  }
  if (!multi) $('de-sueltas').value = '';
}

/* ---------- Acciones de escritura ---------- */
function checkFields(ids){
  let bad=false;
  ids.forEach(id=>{ const e=$(id); e.classList.remove('bad'); if(!e.value||!String(e.value).trim()){ e.classList.add('bad'); bad=true; } });
  return !bad;
}

async function saveDescarte(){
  // Validación condicional: en multidosis al menos uno de los dos campos numéricos debe tener valor;
  // en monodosis sólo `de-cant`.
  const multi = esMulti($('de-vac').value);
  const d = dpf($('de-vac').value);
  // Limpiar marcas viejas
  ['de-vac','de-lote','de-cant','de-sueltas','de-motivo'].forEach(id=>{ const e=$(id); if(e) e.classList.remove('bad'); });
  // Campos siempre requeridos
  const reqBasicos = ['de-vac','de-lote','de-motivo'];
  let bad = false;
  reqBasicos.forEach(id=>{ if(!$(id).value || !String($(id).value).trim()){ $(id).classList.add('bad'); bad = true; } });
  const frascos = Number($('de-cant').value) || 0;
  const sueltas = multi ? (Number($('de-sueltas').value) || 0) : 0;
  const cantidad = multi ? (frascos * d + sueltas) : frascos;
  if (!cantidad || cantidad <= 0) {
    $('de-cant').classList.add('bad');
    if (multi) $('de-sueltas').classList.add('bad');
    bad = true;
  }
  if (bad) return msg('de-msg','err','Completá todos los campos obligatorios.');
  try{
    const r = await api('/descartes', { method:'POST', body: JSON.stringify({
      lote_id: $('de-lote').value,
      cantidad,
      motivo: $('de-motivo').value,
    })});
    msg('de-msg','');
    toastAccion('ok', `Descarte registrado: ${cantidad} dosis.`, 'Deshacer', () => deshacerMovs([r.mov_id]));
    clearDescarte();
    await Promise.all([loadStock(), loadMovimientos(), loadDashboard()]);
    go('mov');
  }catch(err){ msg('de-msg','err', err.message); }
}
function clearDescarte(){
  ['de-vac','de-lote','de-cant','de-sueltas','de-motivo'].forEach(id=>{ const e=$(id); if(e){ e.value=''; e.classList.remove('bad'); } });
  $('de-lote').innerHTML='<option value="">Seleccionar vacuna primero…</option>';
  $('de-msg').innerHTML='';
  toggleDescarteMulti();
  // Refrescar los custom selects tras el reset
  ['de-vac','de-lote','de-motivo'].forEach(id => {
    const e = $(id);
    if (e && e._niceRefresh) e._niceRefresh();
  });  regResumenDescarte();
}

async function saveLote(){
  if(!checkFields(['lo-vac','lo-num','lo-venc','lo-cant'])) return msg('lo-msg','err','Completá todos los campos obligatorios.');
  if($('lo-venc').value < today()){ $('lo-venc').classList.add('bad'); return msg('lo-msg','err','La fecha de vencimiento no puede ser anterior a hoy.'); }
  // Si es multidosis, lo-cant representa FRASCOS; el backend recibe siempre dosis.
  const multi = esMulti($('lo-vac').value);
  const d = dpf($('lo-vac').value);
  const cantidad = multi ? Number($('lo-cant').value) * d : Number($('lo-cant').value);
  try{
    const r = await api('/lotes', { method:'POST', body: JSON.stringify({
      vacuna_id: $('lo-vac').value,
      numero_lote: $('lo-num').value,
      vencimiento: $('lo-venc').value,
      cantidad,
    })});
    msg('lo-msg','');
    // El backend avisa si acumuló; mostramos el mensaje tal cual.
    toast('ok', r.mensaje || 'Lote ingresado con éxito');
    clearLote();
    await Promise.all([loadStock(), loadMovimientos(), loadDashboard()]);
    go('stock');
  }catch(err){ msg('lo-msg','err', err.message); }
}

/**
 * Mientras cargan un lote, buscamos si el número ya existe en el stock
 * para esa vacuna. Si coincide todo, avisamos que las dosis se van a
 * SUMAR al lote existente. Si el vencimiento no coincide, avisamos
 * en amarillo porque puede ser un typo.
 */
function checkLoteExistente(){
  const hint = $('lo-existe-hint');
  if (!hint) return;
  const vacId = $('lo-vac').value;
  const num = ($('lo-num').value || '').trim();
  const venc = $('lo-venc').value;
  if (!vacId || !num) { hint.style.display = 'none'; return; }
  // Nombre de la vacuna seleccionada, por si STOCK_CACHE todavía no trae
  // vacuna_id (en deploys viejos no venía en /api/stock).
  const sel = $('lo-vac');
  const nombreVac = sel.options[sel.selectedIndex]?.textContent?.trim() || '';
  // Buscamos en el stock un lote con misma vacuna + mismo número.
  const match = (STOCK_CACHE || []).find(r => {
    if (!r.id) return false;
    const mismaVac = String(r.vacuna_id) === String(vacId) ||
                     (nombreVac && (r.vacuna || '').trim() === nombreVac);
    return mismaVac && (r.numero_lote || '').trim().toLowerCase() === num.toLowerCase();
  });
  if (!match) { hint.style.display = 'none'; return; }
  const vencMatch = String(match.vencimiento || '').slice(0,10);
  const btnFecha = `<button type="button" class="lote-hint-btn" onclick="completarVencLote('${vencMatch}')">Usar esta fecha</button>`;
  if (venc && venc !== vencMatch) {
    hint.style.display = 'block';
    hint.className = 'lote-hint warn';
    hint.innerHTML = `<b>Mismo número, otro vencimiento.</b> El lote <b>${num}</b> ya está cargado pero vence el <b>${fmtFecha(vencMatch)}</b>. Si en serio es otro lote, cambiá el número. ${btnFecha}`;
    return;
  }
  const disp = match.disponible;
  hint.style.display = 'block';
  hint.className = 'lote-hint ok';
  const extraBtn = venc ? '' : btnFecha;
  hint.innerHTML = `<b>Este lote ya existe</b> (vence ${fmtFecha(vencMatch)}, quedan ${disp} ${disp === 1 ? 'dosis' : 'dosis'}). Las dosis que cargues ahora se van a <b>sumar</b> al lote existente. ${extraBtn}`;
}

/**
 * Completa el campo de vencimiento con la fecha del lote existente,
 * para que el enfermero solo tenga que escribir la cantidad.
 * Después manda el foco a Cantidad.
 */
function completarVencLote(ymd){
  const venc = $('lo-venc');
  if (!venc) return;
  venc.value = ymd;
  venc.classList.remove('bad');
  checkLoteExistente();
  const cant = $('lo-cant');
  if (cant) cant.focus();
}
function clearLote(){
  ['lo-vac','lo-num','lo-venc','lo-cant'].forEach(id=>{ $(id).value=''; $(id).classList.remove('bad'); });
  $('lo-msg').innerHTML='';
  const h = $('lo-existe-hint'); if (h) h.style.display = 'none';
  const sv = $('lo-vac'); if (sv._niceRefresh) sv._niceRefresh();
  toggleLoteMulti();
  regResumenLote();
}

/* ---------- Usuarios (coordinadora) ---------- */
/* ============================================================
   USUARIOS — gestión desde el rol coordinadora
   ============================================================ */
let USUARIOS_CACHE = [];
const ROL_LBL = { enfermeria:'Enfermería', coordinadora:'Coordinadora', jefa:'Jefa', proveedora:'Proveedora' };

async function loadUsuarios(){
  try {
    USUARIOS_CACHE = await api('/usuarios');
    renderUsuarios();
  } catch(err) { toast('err', err.message); }
}

function renderUsuarios(){
  const tbody = $('usuariosBody');
  if (!tbody) return;
  let rows = [...USUARIOS_CACHE];
  const q = ($('us-search')?.value || '').trim().toLowerCase();
  const rol = $('us-rol')?.value || '';
  const est = $('us-estado')?.value;
  if (q)   rows = rows.filter(u => u.correo.toLowerCase().includes(q));
  if (rol) rows = rows.filter(u => u.rol === rol);
  if (est !== '' && est !== undefined) rows = rows.filter(u => String(u.activo) === est);

  const yoId = USER?.id;
  tbody.innerHTML = rows.length ? rows.map(u => {
    const esYo = u.id === yoId;
    return `<tr>
      <td data-label="Correo">${u.correo}${esYo ? ' <small style="color:var(--muted)">(vos)</small>' : ''}</td>
      <td data-label="Rol">${ROL_LBL[u.rol] || u.rol}</td>
      <td data-label="Estado"><span class="pill ${u.activo?'act':'ina'}">${u.activo?'Activo':'Inactivo'}</span></td>
      <td data-label="Acciones" style="text-align:right;white-space:nowrap">
        <button class="iconbtn" onclick="openEditarUsuario(${u.id})">Editar</button>
        <button class="iconbtn" onclick="openResetPass(${u.id})">Restablecer clave</button>
        <button class="iconbtn ${u.activo?'del':''}" onclick="toggleUser(${u.id})" ${esYo?'disabled title="No podés desactivarte a vos misma"':''}>${u.activo?'Desactivar':'Activar'}</button>
      </td>
    </tr>`;
  }).join('')
    : '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:24px">Sin usuarios que coincidan con los filtros.</td></tr>';
}

let _editandoUsuarioId = null;
function openCrearUsuario(){
  _editandoUsuarioId = null;
  $('us-modal-titulo').textContent = 'Nuevo usuario';
  $('us-correo').value = '';
  $('us-nuevo-rol').value = 'enfermeria';
  $('us-nuevo-rol').disabled = false;
  $('us-pass').value = '';
  $('us-pass-wrap').style.display = '';
  $('us-modal-msg').innerHTML = '';
  ['us-correo','us-nuevo-rol','us-pass'].forEach(id => $(id).classList.remove('bad'));
  $('ovUsuario').classList.add('on');
}
function openEditarUsuario(id){
  const u = USUARIOS_CACHE.find(x => x.id === id);
  if (!u) return;
  _editandoUsuarioId = id;
  $('us-modal-titulo').textContent = 'Editar usuario';
  $('us-correo').value = u.correo;
  $('us-nuevo-rol').value = u.rol;
  // No permitir cambiar el propio rol
  $('us-nuevo-rol').disabled = (u.id === USER?.id);
  $('us-pass-wrap').style.display = 'none';   // en edición no se pide password
  $('us-modal-msg').innerHTML = '';
  ['us-correo','us-nuevo-rol'].forEach(id => $(id).classList.remove('bad'));
  $('ovUsuario').classList.add('on');
}

async function saveUsuario(){
  const correo = $('us-correo').value.trim().toLowerCase();
  const rol = $('us-nuevo-rol').value;
  const pass = $('us-pass').value;
  let bad = false;
  if (!correo || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) { $('us-correo').classList.add('bad'); bad = true; } else $('us-correo').classList.remove('bad');
  if (_editandoUsuarioId === null && (!pass || pass.length < 6)) { $('us-pass').classList.add('bad'); bad = true; } else $('us-pass').classList.remove('bad');
  if (bad) return msg('us-modal-msg', 'err', 'Revisá los campos marcados.');

  try {
    if (_editandoUsuarioId === null) {
      // Crear
      const r = await api('/usuarios', { method:'POST', body: JSON.stringify({ correo, rol, password: pass }) });
      toast('ok', r.mensaje);
    } else {
      // Editar
      const cambios = { correo };
      if (!$('us-nuevo-rol').disabled) cambios.rol = rol;
      const r = await api(`/usuarios/${_editandoUsuarioId}`, { method:'PATCH', body: JSON.stringify(cambios) });
      toast('ok', r.mensaje);
    }
    closeOv('ovUsuario');
    loadUsuarios();
  } catch(err) { msg('us-modal-msg', 'err', err.message); }
}

async function toggleUser(id){
  const u = USUARIOS_CACHE.find(x => x.id === id);
  if (!u) return;
  const accion = u.activo ? 'desactivar' : 'activar';
  if (u.activo && !confirm(`¿Seguro que querés desactivar a ${u.correo}? No va a poder ingresar hasta que lo actives de nuevo.`)) return;
  try {
    const r = await api(`/usuarios/${id}/estado`, { method:'PATCH' });
    toast('ok', r.mensaje);
    loadUsuarios();
  } catch(err) { toast('err', err.message); }
}

let _reseteandoPassId = null;
function openResetPass(id){
  const u = USUARIOS_CACHE.find(x => x.id === id);
  if (!u) return;
  _reseteandoPassId = id;
  $('rp-correo').textContent = u.correo;
  $('rp-pass').value = '';
  $('rp-pass').classList.remove('bad');
  $('rp-msg').innerHTML = '';
  $('ovResetPass').classList.add('on');
}
async function saveResetPass(){
  const pass = $('rp-pass').value;
  if (!pass || pass.length < 6) { $('rp-pass').classList.add('bad'); return msg('rp-msg', 'err', 'Mínimo 6 caracteres.'); }
  try {
    const r = await api(`/usuarios/${_reseteandoPassId}/password`, { method:'PATCH', body: JSON.stringify({ password: pass }) });
    closeOv('ovResetPass');
    toast('ok', r.mensaje);
  } catch(err) { msg('rp-msg', 'err', err.message); }
}

/* ============================================================
   CATÁLOGO DE VACUNAS — ABM desde el rol coordinadora
   ============================================================ */
let CATALOGO_CACHE = [];

async function loadCatalogo(){
  try {
    CATALOGO_CACHE = await api('/catalogo/vacunas');
    renderCatalogo();
  } catch(err) { toast('err', err.message); }
}

function renderCatalogo(){
  const tbody = $('catalogoBody');
  if (!tbody) return;
  let rows = [...CATALOGO_CACHE];
  const q = ($('cat-search')?.value || '').trim().toLowerCase();
  const est = $('cat-estado')?.value;
  if (q)   rows = rows.filter(v => v.nombre.toLowerCase().includes(q));
  if (est !== '' && est !== undefined) rows = rows.filter(v => String(v.activa) === est);

  tbody.innerHTML = rows.length ? rows.map(v => {
    const multi = Number(v.dosis_por_frasco) > 1;
    const presentacion = multi ? `Frasco × ${v.dosis_por_frasco}` : 'Monodosis';
    return `<tr>
      <td data-label="Vacuna"><b>${v.nombre}</b></td>
      <td data-label="Presentación">${presentacion}</td>
      <td data-label="Lotes">${v.cant_lotes}</td>
      <td data-label="Estado"><span class="pill ${v.activa?'act':'ina'}">${v.activa?'Activa':'Dada de baja'}</span></td>
      <td data-label="Acciones" style="text-align:right;white-space:nowrap">
        <button class="iconbtn" onclick="openEditarVacuna(${v.id})">Editar</button>
        <button class="iconbtn ${v.activa?'del':''}" onclick="toggleVacuna(${v.id})">${v.activa?'Dar de baja':'Reactivar'}</button>
      </td>
    </tr>`;
  }).join('')
    : '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:24px">Sin vacunas que coincidan con los filtros.</td></tr>';
}

let _editandoVacunaId = null;
function openCrearVacuna(){
  _editandoVacunaId = null;
  $('cat-modal-titulo').textContent = 'Nueva vacuna';
  $('cat-nombre').value = '';
  $('cat-dpf').value = '1';
  $('cat-modal-msg').innerHTML = '';
  ['cat-nombre','cat-dpf'].forEach(id => $(id).classList.remove('bad'));
  $('ovVacuna').classList.add('on');
}
function openEditarVacuna(id){
  const v = CATALOGO_CACHE.find(x => x.id === id);
  if (!v) return;
  _editandoVacunaId = id;
  $('cat-modal-titulo').textContent = 'Editar vacuna';
  $('cat-nombre').value = v.nombre;
  $('cat-dpf').value = v.dosis_por_frasco;
  $('cat-modal-msg').innerHTML = '';
  ['cat-nombre','cat-dpf'].forEach(id => $(id).classList.remove('bad'));
  $('ovVacuna').classList.add('on');
}

async function saveVacuna(){
  const nombre = $('cat-nombre').value.trim();
  const dpf = Number($('cat-dpf').value);
  let bad = false;
  if (!nombre) { $('cat-nombre').classList.add('bad'); bad = true; } else $('cat-nombre').classList.remove('bad');
  if (!Number.isInteger(dpf) || dpf < 1) { $('cat-dpf').classList.add('bad'); bad = true; } else $('cat-dpf').classList.remove('bad');
  if (bad) return msg('cat-modal-msg', 'err', 'Revisá los campos marcados.');

  const guardar = async (confirmarCambio) => {
    if (_editandoVacunaId === null) {
      return api('/catalogo/vacunas', { method:'POST', body: JSON.stringify({ nombre, dosis_por_frasco: dpf }) });
    }
    const body = { nombre, dosis_por_frasco: dpf };
    if (confirmarCambio) body.confirmar_cambio_dosis = true;
    return api(`/catalogo/vacunas/${_editandoVacunaId}`, { method:'PATCH', body: JSON.stringify(body) });
  };

  try {
    const r = await guardar(false);
    toast('ok', r.mensaje);
    closeOv('ovVacuna');
    await Promise.all([loadCatalogo(), loadVacunas()]);
  } catch(err) {
    // El backend pide confirmación cuando el cambio de dosis_por_frasco afecta
    // lotes con stock o frascos abiertos. Mostramos el mensaje detallado y
    // reenviamos con la confirmación si el usuario acepta.
    if (err.data && err.data.requiere_confirmacion) {
      if (confirm(err.data.mensaje)) {
        try {
          const r2 = await guardar(true);
          toast('ok', r2.mensaje);
          closeOv('ovVacuna');
          await Promise.all([loadCatalogo(), loadVacunas(), loadStock(), loadDashboard()]);
        } catch(err2) { msg('cat-modal-msg', 'err', err2.message); }
      } else {
        msg('cat-modal-msg', 'err', 'Cambio cancelado. La vacuna queda como estaba.');
      }
    } else {
      msg('cat-modal-msg', 'err', err.message);
    }
  }
}

async function toggleVacuna(id){
  const v = CATALOGO_CACHE.find(x => x.id === id);
  if (!v) return;
  if (v.activa && !confirm(`¿Dar de baja "${v.nombre}"? Ya no va a aparecer para cargar nuevos lotes ni aplicaciones. Los lotes existentes se mantienen.`)) return;
  try {
    const r = await api(`/catalogo/vacunas/${id}`, { method:'PATCH', body: JSON.stringify({ activa: v.activa ? 0 : 1 }) });
    toast('ok', r.mensaje);
    await Promise.all([loadCatalogo(), loadVacunas()]);
  } catch(err) { toast('err', err.message); }
}

/* ---------- Excel (descarga real desde el backend) ---------- */

// Descarga un archivo desde un endpoint autenticado (necesita el token).
// Como <a href> y window.location no llevan el header Authorization,
// hacemos fetch y creamos un blob para forzar la descarga.
async function descargarArchivo(path, nombreSugerido) {
  try {
    const res = await fetch(API + path, {
      headers: { 'Authorization': 'Bearer ' + TOKEN },
    });
    if (!res.ok) {
      let msg = 'No se pudo generar el archivo.';
      try { const j = await res.json(); if (j.error) msg = j.error; } catch {}
      throw new Error(msg);
    }
    // Filename desde el header, si viene; si no usamos el sugerido
    let filename = nombreSugerido;
    const cd = res.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename="?([^"]+)"?/i);
    if (m) filename = m[1];
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast('ok', 'Descarga generada');
  } catch (err) {
    toast('err', err.message);
  }
}

function excelStockGeneral() {
  descargarArchivo('/reportes/stock', 'SGV_stock.xlsx');
}

/**
 * Descarga el reporte de reposición — pensado para el rol de proveedora.
 * Trae solo las vacunas que necesitan pedirse (sin stock, stock bajo, por vencer),
 * agrupadas por vacuna en lugar de listar lote por lote.
 */
function descargarReposicion() {
  const fecha = new Date().toISOString().slice(0, 10);
  descargarArchivo('/reportes/reposicion', `SGV_reposicion_${fecha}.xlsx`);
}

/**
 * Descarga los movimientos aplicando exactamente los filtros que están
 * activos en el sidebar (tipo, vacuna, desde, hasta). Si no hay ninguno,
 * descarga el historial completo.
 */
function excelMovimientosFiltrado() {
  const params = new URLSearchParams();
  const tipo  = $('mv-tipo')?.value;
  const vac   = $('mv-vac')?.value;
  const desde = $('mv-desde')?.value;
  const hasta = $('mv-hasta')?.value;
  if (tipo)  params.set('tipo', tipo);
  if (vac)   params.set('vacuna', vac);
  if (desde) params.set('desde', desde);
  if (hasta) params.set('hasta', hasta);
  const qs = params.toString();
  const url = '/reportes/movimientos' + (qs ? '?' + qs : '');
  const suf = qs ? 'filtrado' : 'completo';
  descargarArchivo(url, `SGV_movimientos_${suf}.xlsx`);
}

function openExcelEsp() {
  $('ex-msg').innerHTML = '';
  $('ex-vac').value = '';
  $('ovExcel').classList.add('on');
}
function doExcelEsp() {
  const v = $('ex-vac');
  if (!v.value) { v.classList.add('bad'); return msg('ex-msg', 'err', 'Elegí una vacuna.'); }
  v.classList.remove('bad');
  closeOv('ovExcel');
  descargarArchivo(`/reportes/stock/${v.value}`, 'SGV_stock_vacuna.xlsx');
}

/* ---------- Editar lote (corrección de errores de tipeo) ---------- */
let _editandoLoteId = null;
let _editandoLoteInfo = null;

function openEditLote(payloadEncoded) {
  try {
    const data = JSON.parse(decodeURIComponent(payloadEncoded));
    _editandoLoteId = data.id;
    _editandoLoteInfo = data;

    // Encabezado con el nombre de la vacuna + número de lote actual
    const dpf = Number(data.dosis_por_frasco) || 1;
    const esMultidosis = dpf > 1;
    const chip = esMultidosis ? `, frasco × ${dpf}` : '';
    $('el-vacuna-txt').innerHTML = `${data.vacuna}<small style="color:var(--muted);font-weight:500">Lote ${data.numero_lote}${chip}</small>`;

    // Bloque principal: dosis que hay ahora
    const dispActual = Number(data.disponible || 0);
    $('el-disp').value = dispActual;
    $('el-disp-actual').textContent = dispActual + (dispActual === 1 ? ' dosis' : ' dosis');
    $('el-disp-cambio').style.display = 'none';
    $('el-disp').classList.remove('bad');
    // Al cambiar el valor, mostrar en vivo el delta
    $('el-disp').oninput = () => {
      const nuevo = Number($('el-disp').value);
      const cambio = $('el-disp-cambio');
      if (!Number.isFinite(nuevo) || nuevo === dispActual) {
        cambio.style.display = 'none';
        return;
      }
      const diff = nuevo - dispActual;
      const signo = diff > 0 ? '+' : '';
      cambio.style.display = 'block';
      cambio.className = 'el-disp-cambio ' + (diff > 0 ? 'up' : 'down');
      cambio.innerHTML = `Se va a <b>${diff > 0 ? 'sumar' : 'descontar'}</b> ${Math.abs(diff)} ${Math.abs(diff) === 1 ? 'dosis' : 'dosis'} (quedarán <b>${nuevo}</b>).`;
    };

    // Bloque secundario: datos del lote (colapsado)
    $('el-num').value = data.numero_lote;
    $('el-venc').value = typeof data.vencimiento === 'string'
      ? data.vencimiento.slice(0, 10)
      : new Date(data.vencimiento).toISOString().slice(0, 10);

    const cantInicial = Number(data.cantidad_inicial) || 0;
    if (esMultidosis) {
      $('el-cant').value = cantInicial / dpf;
      $('el-cant').step = 1;
      $('el-cant-label').innerHTML = `Cantidad de frascos que entraron <span class="req">*</span>`;
      $('el-cant-hint').textContent = `Cada frasco tiene ${dpf} dosis. Total actual: ${cantInicial} dosis.`;
    } else {
      $('el-cant').value = cantInicial;
      $('el-cant').step = 1;
      $('el-cant-label').innerHTML = `Cantidad de dosis que entraron <span class="req">*</span>`;
      $('el-cant-hint').textContent = '';
    }
    const usadas = cantInicial - dispActual;
    if (usadas > 0) {
      const unidad = esMultidosis ? Math.ceil(usadas / dpf) + ' frasco(s) equivalente(s)' : usadas + ' dosis';
      $('el-cant-hint').textContent += ` Mínimo editable: ${unidad} (ya usadas).`;
    }

    $('el-num').classList.remove('bad');
    $('el-venc').classList.remove('bad');
    $('el-cant').classList.remove('bad');
    $('el-msg').innerHTML = '';
    // Que el bloque secundario arranque colapsado
    const det = document.querySelector('#ovEditLote .el-datos');
    if (det) det.open = false;
    $('ovEditLote').classList.add('on');
    setTimeout(() => $('el-disp').focus(), 100);
  } catch (err) {
    toast('err', 'No se pudo abrir la edición del lote.');
  }
}

async function saveEditLote() {
  const numero = $('el-num').value.trim();
  const venc = $('el-venc').value;
  const cantRaw = $('el-cant').value;
  const dispRaw = $('el-disp').value;
  let bad = false;
  if (!numero) { $('el-num').classList.add('bad'); bad = true; } else $('el-num').classList.remove('bad');
  if (!venc)   { $('el-venc').classList.add('bad'); bad = true; } else $('el-venc').classList.remove('bad');
  if (!cantRaw || Number(cantRaw) <= 0) { $('el-cant').classList.add('bad'); bad = true; } else $('el-cant').classList.remove('bad');
  if (dispRaw === '' || !Number.isInteger(Number(dispRaw)) || Number(dispRaw) < 0) {
    $('el-disp').classList.add('bad'); bad = true;
  } else $('el-disp').classList.remove('bad');
  if (bad) return msg('el-msg', 'err', 'Completá los campos correctamente.');

  const dpf = Number(_editandoLoteInfo?.dosis_por_frasco) || 1;
  const cantidadDosis = dpf > 1 ? Number(cantRaw) * dpf : Number(cantRaw);
  const nuevoDisp = Number(dispRaw);

  try {
    const r = await api(`/lotes/${_editandoLoteId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        numero_lote: numero,
        vencimiento: venc,
        cantidad: cantidadDosis,
        disponible: nuevoDisp,
      }),
    });
    closeOv('ovEditLote');
    toast('ok', r.mensaje || 'Lote actualizado.');
    await Promise.all([loadStock(), loadMovimientos(), loadDashboard()]);
  } catch (err) {
    msg('el-msg', 'err', err.message);
  }
}

/**
 * Elimina un lote del stock. Pensado para corregir cargas duplicadas o erróneas.
 * El backend valida que el lote no tenga aplicaciones/descartes/frascos abiertos.
 */
async function eliminarLote(id, vacuna, numeroLote) {
  const ok = confirm(
    `¿Eliminar el lote ${numeroLote} de ${vacuna}?\n\n` +
    `Esta acción no se puede deshacer. Solo se pueden eliminar lotes que no hayan tenido aplicaciones ni descartes registrados (útil para corregir cargas duplicadas).`
  );
  if (!ok) return;
  try {
    const r = await api(`/lotes/${id}`, { method: 'DELETE' });
    toast('ok', r.mensaje || 'Lote eliminado.');
    await Promise.all([loadStock(), loadMovimientos(), loadDashboard()]);
  } catch (err) {
    toast('err', err.message);
  }
}

/* ============================================================
 * Trazabilidad del lote — solo visible para coordinadora.
 * Consulta el endpoint /api/lotes/:id/trazabilidad y arma un modal
 * con toda la info: datos internos, laboratorio de origen (mock)
 * y timeline completo de movimientos.
 * ========================================================== */
async function verTrazabilidad(loteId) {
  $('ovTrazabilidad').classList.add('on');
  $('trazContent').innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">Cargando información…</div>';
  try {
    const d = await api(`/lotes/${loteId}/trazabilidad`);
    $('trazContent').innerHTML = renderTrazabilidad(d);
  } catch (err) {
    $('trazContent').innerHTML = `<div style="text-align:center;padding:40px;color:var(--err)">No se pudo cargar la trazabilidad: ${err.message}</div>`;
  }
}

function renderTrazabilidad(d) {
  const { lote, estadisticas, origen, historial, frascos_abiertos } = d;
  const dpf = Number(lote.dosis_por_frasco) || 1;
  const esMulti = dpf > 1;

  // Barra de progreso: aplicadas vs. descartadas vs. disponibles
  const total = estadisticas.total || 1;
  const pctApl = (estadisticas.aplicadas / total * 100).toFixed(1);
  const pctDes = (estadisticas.descartadas / total * 100).toFixed(1);
  const pctDsp = (estadisticas.disponibles / total * 100).toFixed(1);

  // Labels de tipo para el timeline
  const TIPO_LBL = {
    ingreso:     ['Ingreso al stock',     'ing'],
    aplicacion:  ['Aplicación',           'apl'],
    descarte:    ['Descarte',             'des'],
    edicion:     ['Edición del lote',     'edi'],
    eliminacion: ['Eliminación del lote', 'eli'],
  };

  const conHistorial = Array.isArray(historial);
  const timelineHtml = !conHistorial ? '' : historial.length ? historial.map(m => {
    const [lbl, cls] = TIPO_LBL[m.tipo] || [m.tipo, ''];
    return `
      <div class="traz-timeline-item">
        <div class="traz-timeline-icon"><span class="pill ${cls}">${lbl}</span></div>
        <div class="traz-timeline-body">
          <div class="traz-timeline-line">
            <b>${m.cantidad} ${m.cantidad === 1 ? 'dosis' : 'dosis'}</b>
            ${m.motivo ? `: ${m.motivo}` : ''}
          </div>
          <div class="traz-timeline-meta">
            ${fmtFechaHora(m.fecha_mov)}, registrado por ${m.responsable}
          </div>
        </div>
      </div>`;
  }).join('') : '<div class="traz-empty">Sin movimientos registrados aún.</div>';

  const frascosHtml = esMulti && frascos_abiertos.length ? `
    <div class="traz-section">
      <h5 class="traz-section-title">Frascos abiertos</h5>
      <div class="traz-frascos">
        ${frascos_abiertos.map(f => `
          <div class="traz-frasco traz-frasco-${f.estado}">
            <div class="traz-frasco-head">
              <b>${f.estado.toUpperCase()}</b>
              <span>Abierto el ${fmtFecha(f.fecha_apertura)}</span>
            </div>
            <div class="traz-frasco-body">
              ${f.dosis_usadas} / ${f.dosis_totales} dosis usadas
              ${f.motivo_cierre ? `<br><small>${f.motivo_cierre}</small>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>` : '';

  return `
    <!-- Header: identificación del lote -->
    <div class="traz-header">
      <div>
        <div class="traz-vacuna">${lote.vacuna}</div>
        <div class="traz-lote">Lote ${lote.numero_lote}, ${esMulti ? `multidosis (frasco × ${dpf})` : 'monodosis'}</div>
      </div>
      <div class="traz-header-right">
        <div class="traz-venc-label">Vencimiento</div>
        <div class="traz-venc-value">${fmtFecha(lote.vencimiento)}</div>
      </div>
    </div>

    <!-- Grid de datos: origen + estadísticas -->
    <div class="traz-grid">
      <!-- Bloque de origen (datos de laboratorio, mock) -->
      <div class="traz-section">
        <h5 class="traz-section-title">Origen del lote</h5>
        <div class="traz-data-list">
          <div class="traz-data-row"><span>Laboratorio</span><b>${origen.laboratorio}</b></div>
          <div class="traz-data-row"><span>País de origen</span><b>${origen.pais_origen}</b></div>
          <div class="traz-data-row"><span>Fecha de fabricación</span><b>${fmtFecha(origen.fecha_fabricacion)}</b></div>
          <div class="traz-data-row"><span>Código ANMAT</span><b>N° ${origen.codigo_anmat}</b></div>
          <div class="traz-data-row"><span>Distribuidor</span><b>${origen.distribuidor}</b></div>
          <div class="traz-data-row"><span>Recibido por</span><b>${origen.recibido_por}</b></div>
          <div class="traz-data-row"><span>Cadena de frío</span><b>${origen.temperatura_almacenamiento}</b></div>
        </div>
      </div>

      <!-- Bloque de estadísticas -->
      <div class="traz-section">
        <h5 class="traz-section-title">Estado del lote</h5>
        <div class="traz-stats">
          <div class="traz-stat"><div class="traz-stat-num">${estadisticas.total}</div><div class="traz-stat-lbl">Total inicial</div></div>
          <div class="traz-stat traz-stat-apl"><div class="traz-stat-num">${estadisticas.aplicadas}</div><div class="traz-stat-lbl">Aplicadas</div></div>
          <div class="traz-stat traz-stat-des"><div class="traz-stat-num">${estadisticas.descartadas}</div><div class="traz-stat-lbl">Descartadas</div></div>
          <div class="traz-stat traz-stat-dsp"><div class="traz-stat-num">${estadisticas.disponibles}</div><div class="traz-stat-lbl">Disponibles</div></div>
        </div>
        <div class="traz-progress">
          <div class="traz-progress-bar traz-progress-apl" style="width:${pctApl}%" title="${pctApl}% aplicadas"></div>
          <div class="traz-progress-bar traz-progress-des" style="width:${pctDes}%" title="${pctDes}% descartadas"></div>
          <div class="traz-progress-bar traz-progress-dsp" style="width:${pctDsp}%" title="${pctDsp}% disponibles"></div>
        </div>
      </div>
    </div>

    ${frascosHtml}

    <!-- Historial completo (no se muestra a la proveedora).
         La sección es un bloque flex: el título queda fijo arriba
         y la timeline se desplaza sola, para no tener que mover
         toda la ventana cuando hay muchos movimientos. -->
    ${conHistorial ? `
    <div class="traz-section traz-section-historial">
      <h5 class="traz-section-title">Historial completo (${historial.length} ${historial.length === 1 ? 'movimiento' : 'movimientos'})</h5>
      <div class="traz-timeline traz-timeline-scroll">
        ${timelineHtml}
      </div>
    </div>` : ''}
  `;
}

// Helper para mostrar fecha + hora
function fmtFechaHora(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-AR') + ', ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  } catch { return String(iso); }
}

/**
 * Elimina un movimiento (aplicación o descarte) y devuelve las dosis al stock del lote.
 * Pensado para corregir cargas erróneas. Los ingresos se manejan borrando el lote.
 */
async function eliminarMovimiento(id, tipoLbl, vacuna, cantidad) {
  const ok = confirm(
    `¿Eliminar este movimiento?\n\n` +
    `${tipoLbl} de ${cantidad} dosis de ${vacuna}\n\n` +
    `Las ${cantidad} dosis van a volver al stock del lote. Esta acción no se puede deshacer.`
  );
  if (!ok) return;
  try {
    const r = await api(`/movimientos/${id}`, { method: 'DELETE' });
    toast('ok', r.mensaje || 'Movimiento eliminado.');
    await Promise.all([loadMovimientos(), loadStock(), loadDashboard()]);
  } catch (err) {
    toast('err', err.message);
  }
}
function closeOv(id){ $(id).classList.remove('on'); }

/* ============================================================
 * Custom select — reemplaza el look nativo del navegador por un
 * dropdown propio, consistente en todos los browsers y alineado
 * con la paleta institucional. Se aplica a todo <select class="select-nice">.
 * Mantiene el <select> nativo como fuente de la verdad (para valores,
 * onchange y compatibilidad), solo lo oculta visualmente.
 * ============================================================ */
function enhanceSelect(select) {
  if (!select || select._enhanced) return;
  select._enhanced = true;

  const wrapper = document.createElement('div');
  wrapper.className = 'nice-select';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'nice-select-btn';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  const labelEl = document.createElement('span');
  labelEl.className = 'nice-select-label';
  btn.appendChild(labelEl);
  const arrow = document.createElement('span');
  arrow.className = 'nice-select-arrow';
  arrow.innerHTML = '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2 4.5 L6 8.5 L10 4.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  btn.appendChild(arrow);

  const menu = document.createElement('div');
  menu.className = 'nice-select-menu';
  menu.setAttribute('role', 'listbox');

  function renderLabel() {
    const opt = select.options[select.selectedIndex];
    labelEl.textContent = opt ? opt.textContent : '';
  }

  function renderOptions() {
    menu.innerHTML = '';
    Array.from(select.options).forEach((opt, idx) => {
      const div = document.createElement('div');
      div.className = 'nice-select-option';
      div.textContent = opt.textContent;
      div.dataset.value = opt.value;
      div.setAttribute('role', 'option');
      // Preservar clases de la option original (hide-proveedora, proveedora-only)
      // para que el sistema de roles siga funcionando en el menú custom.
      opt.classList.forEach(c => div.classList.add(c));
      // Estilo de la opción seleccionada
      if (idx === select.selectedIndex) div.classList.add('is-selected');
      div.addEventListener('click', (e) => {
        e.stopPropagation();
        if (select.value !== opt.value) {
          select.value = opt.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        close();
      });
      menu.appendChild(div);
    });
  }

  function open() {
    // Cerrar cualquier otro select custom abierto
    document.querySelectorAll('.nice-select.open').forEach(w => {
      if (w !== wrapper) w.classList.remove('open');
    });
    renderOptions();
    wrapper.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    positionMenu();
  }

  /**
   * Posiciona el menú con position:fixed respecto al botón trigger.
   * Como es fixed, "escapa" de contenedores con overflow (modales, cards)
   * y siempre se ve entero. Elige la dirección (arriba o abajo del botón)
   * que tenga más espacio libre en el viewport para mostrar más opciones.
   */
  function positionMenu() {
    const rect = btn.getBoundingClientRect();
    const gap = 5;
    const margen = 8; // margen mínimo respecto al borde de la pantalla
    // Ancho: igualar al del botón
    menu.style.width = rect.width + 'px';
    menu.style.left = rect.left + 'px';
    // Resetear max-height para medir el alto natural del menú
    menu.style.maxHeight = 'none';
    menu.style.overflowY = 'visible';
    // Medir el alto real (temporalmente lo hacemos invisible para no parpadear)
    menu.style.visibility = 'hidden';
    menu.style.top = '0px';
    const menuH = menu.offsetHeight;
    menu.style.visibility = '';

    const espacioAbajo = window.innerHeight - rect.bottom - gap - margen;
    const espacioArriba = rect.top - gap - margen;

    // Si cabe entero abajo, priorizar abajo (comportamiento natural)
    if (menuH <= espacioAbajo) {
      menu.style.top = (rect.bottom + gap) + 'px';
    }
    // Si cabe entero arriba, abrirlo hacia arriba
    else if (menuH <= espacioArriba) {
      menu.style.top = (rect.top - menuH - gap) + 'px';
    }
    // Si no cabe entero en ninguna dirección, usamos la que tenga más espacio
    // y aplicamos scroll SOLO ahí. En pantallas normales esto casi no pasa.
    else if (espacioAbajo >= espacioArriba) {
      menu.style.maxHeight = espacioAbajo + 'px';
      menu.style.overflowY = 'auto';
      menu.style.top = (rect.bottom + gap) + 'px';
    } else {
      menu.style.maxHeight = espacioArriba + 'px';
      menu.style.overflowY = 'auto';
      menu.style.top = (margen) + 'px';
    }
  }

  function close() {
    wrapper.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (wrapper.classList.contains('open')) close();
    else open();
  });

  // Cerrar al hacer click en cualquier otro lado
  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) close();
  });

  // Cerrar con Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && wrapper.classList.contains('open')) close();
  });

  // Como el menú es position:fixed, no sigue al scroll ni al resize.
  // Lo cerramos si el usuario scrollea la PÁGINA (no si scrollea dentro
  // del propio menú buscando opciones).
  window.addEventListener('scroll', (e) => {
    if (!wrapper.classList.contains('open')) return;
    if (menu.contains(e.target)) return; // el scroll es adentro del menú
    close();
  }, true);
  window.addEventListener('resize', () => {
    if (wrapper.classList.contains('open')) close();
  });

  // Método público para refrescar el look cuando el value cambia por código
  // o cuando cambian las options (ej. al repoblar mv-vac después de cargar movimientos).
  select._niceRefresh = () => { renderLabel(); if (wrapper.classList.contains('open')) renderOptions(); };

  renderLabel();

  // Sincronizar label cuando cambia el valor por interacción normal del select
  select.addEventListener('change', renderLabel);

  // Insertar el wrapper después del select y ocultar el select nativo
  select.classList.add('nice-select-hidden');
  select.parentNode.insertBefore(wrapper, select.nextSibling);
  wrapper.appendChild(btn);
  wrapper.appendChild(menu);
}

/* Aplicar el enhance a todos los selects marcados. Se llama al login (para
   los selects que están dentro de la app) y también podría llamarse después
   de agregar selects dinámicamente. */
function enhanceAllSelects() {
  document.querySelectorAll('select.select-nice').forEach(enhanceSelect);
}

/* ---------- Init ---------- */
$('p').addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });

/* ============================================================
   ESTADÍSTICAS — solo coordinadora
   Pide /api/estadisticas para el período elegido y dibuja:
   indicadores, evolución de aplicaciones, ranking de vacunas,
   descartes por motivo, actividad por día y cobertura del stock.
   ============================================================ */
let EST_DATA = null;
let EST_ORDEN = { k: 'aplicadas', dir: -1 };
const nfmt = (n, dec = 0) => Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

// Calcula desde/hasta según la opción del desplegable
function estRango() {
  const op = $('est-rango').value;
  const hoy = new Date();
  const hasta = ymdLocal(hoy);
  if (op === 'custom') {
    return { desde: $('est-desde').value || hasta, hasta: $('est-hasta').value || hasta };
  }
  if (op === 'mes')  return { desde: ymdLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta };
  if (op === 'anio') return { desde: ymdLocal(new Date(hoy.getFullYear(), 0, 1)), hasta };
  const n = Number(op) || 30;
  const d = new Date(hoy); d.setDate(d.getDate() - (n - 1));
  return { desde: ymdLocal(d), hasta };
}

function estOnRangoChange() {
  const custom = $('est-rango').value === 'custom';
  $('est-desde-wrap').style.display = custom ? '' : 'none';
  $('est-hasta-wrap').style.display = custom ? '' : 'none';
  if (custom && !$('est-desde').value) {
    const r = estRango(); // completa con los últimos 30 días como punto de partida
    const d = new Date(); d.setDate(d.getDate() - 29);
    $('est-desde').value = ymdLocal(d); $('est-hasta').value = r.hasta;
  }
  loadEstadisticas();
}

async function loadEstadisticas() {
  const { desde, hasta } = estRango();
  const pagina = $('page-estadisticas');
  pagina.classList.add('est-cargando');
  $('est-msg').innerHTML = '';
  try {
    EST_DATA = await api(`/estadisticas?desde=${desde}&hasta=${hasta}`);
    renderEstadisticas();
  } catch (err) {
    msg('est-msg', 'err', 'No se pudieron cargar las estadísticas: ' + escHtml(err.message));
  } finally {
    pagina.classList.remove('est-cargando');
  }
}

function excelEstadisticas() {
  const { desde, hasta } = estRango();
  descargarArchivo(`/estadisticas/excel?desde=${desde}&hasta=${hasta}`, `SGV_estadisticas_${desde}_a_${hasta}.xlsx`);
}

function renderEstadisticas() {
  const d = EST_DATA; if (!d) return;
  const p = d.periodo;
  $('est-periodo-txt').textContent =
    `Del ${fmtFecha(p.desde)} al ${fmtFecha(p.hasta)}, ${p.dias} ${p.dias === 1 ? 'día' : 'días'}. Las comparaciones son contra los ${p.dias} días anteriores.`;
  estRenderKpis(d.kpis);
  estRenderSerie();
  estRenderBarras('est-top', d.top_vacunas.map(v => ({ label: v.vacuna, valor: v.dosis })), 8,
    'Sin aplicaciones registradas en el período.', 'vacunas más (ver la tabla de abajo)');
  estRenderBarras('est-motivos', d.motivos.map(m => ({ label: m.motivo, valor: m.dosis })), 8,
    'Sin descartes registrados en el período.');
  estRenderDow(d.dia_semana);
  estRenderCobertura(d.por_vacuna);
  estRenderTabla();
}

/* ---------- Indicadores ---------- */
// Variación contra el período anterior. "subeEsBueno" decide el color de la flecha.
function estDelta(actual, previo, subeEsBueno, sufijo = '%', esPuntos = false) {
  if (!previo && !actual) return '<span class="est-delta neutro">Sin movimiento en ambos períodos</span>';
  if (!previo) return '<span class="est-delta neutro">Sin datos del período anterior</span>';
  const diff = esPuntos ? (actual - previo) : ((actual - previo) / previo) * 100;
  const r = Math.round(diff * 10) / 10;
  if (r === 0) return '<span class="est-delta neutro">= Igual que el período anterior</span>';
  const sube = r > 0;
  const clase = subeEsBueno === null ? 'neutro' : ((sube === subeEsBueno) ? 'bien' : 'mal');
  const flecha = sube ? '▲' : '▼';
  const txt = esPuntos ? `${sube ? '+' : ''}${nfmt(r, 1)} pts` : `${sube ? '+' : ''}${nfmt(r, Math.abs(r) < 10 ? 1 : 0)}${sufijo}`;
  return `<span class="est-delta ${clase}"><b>${flecha} ${txt}</b> vs. período anterior</span>`;
}

function estRenderKpis(k) {
  const tile = (titulo, valor, detalle, delta = '') => `
    <div class="est-kpi">
      <div class="est-kpi-lab">${titulo}</div>
      <div class="est-kpi-num">${valor}</div>
      <div class="est-kpi-det">${detalle}</div>
      ${delta}
    </div>`;
  $('est-kpis').innerHTML = [
    tile('Dosis aplicadas', nfmt(k.aplicadas), `en ${nfmt(k.registros_aplicacion)} ${k.registros_aplicacion === 1 ? 'registro' : 'registros'}`,
      estDelta(k.aplicadas, k.aplicadas_prev, true)),
    tile('Promedio diario', nfmt(k.promedio_diario, 1), 'dosis aplicadas por día'),
    tile('Dosis descartadas', nfmt(k.descartadas), 'por vencimiento, rotura u otros',
      estDelta(k.descartadas, k.descartadas_prev, false)),
    tile('Tasa de descarte', `${nfmt(k.tasa_descarte, 1)}<small>%</small>`, 'de las dosis usadas se descartaron',
      estDelta(k.tasa_descarte, k.tasa_descarte_prev, false, '', true)),
    tile('Dosis ingresadas', nfmt(k.ingresadas), 'recibidas en lotes nuevos',
      estDelta(k.ingresadas, k.ingresadas_prev, null)),
    tile('Stock actual', nfmt(k.stock_total), 'dosis vigentes hoy'),
  ].join('');
}

/* ---------- Evolución de aplicaciones (barras SVG con tooltip) ---------- */
const MESES_CORTOS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const DIAS_CORTOS = ['dom','lun','mar','mié','jue','vie','sáb'];
function estFechaCorta(ymd) { const [, m, d] = ymd.split('-'); return `${d}/${m}`; }
function estEtiquetaPunto(pt, gran, larga) {
  if (gran === 'mes') { const [y, m] = pt.desde.split('-'); return `${MESES_CORTOS[Number(m) - 1]}${larga ? ' ' + y : ' ' + y.slice(2)}`; }
  if (gran === 'semana') return larga ? `Semana del ${fmtFecha(pt.desde)} al ${fmtFecha(pt.hasta)}` : estFechaCorta(pt.desde);
  if (larga) { const [y, m, dd] = pt.desde.split('-').map(Number); return `${DIAS_CORTOS[new Date(y, m - 1, dd).getDay()]} ${fmtFecha(pt.desde)}`; }
  return estFechaCorta(pt.desde);
}
function estMaxLindo(v) {
  if (v <= 4) return 4;
  const pot = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * pot >= v) return m * pot;
  return 10 * pot;
}

function estRenderSerie() {
  const cont = $('est-serie');
  const { granularidad: gran, puntos } = EST_DATA.serie;
  const sub = { dia: 'Dosis aplicadas por día', semana: 'Dosis aplicadas por semana', mes: 'Dosis aplicadas por mes' }[gran];
  $('est-serie-sub').textContent = sub;
  const total = puntos.reduce((s, p) => s + p.dosis, 0);
  if (!total) { cont.innerHTML = '<div class="est-vacio">Sin aplicaciones registradas en el período.</div>'; return; }

  const W = Math.max(cont.clientWidth || 800, 320), H = 250;
  const m = { t: 18, r: 12, b: 30, l: 40 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const n = puntos.length;
  const max = estMaxLindo(Math.max(...puntos.map(p => p.dosis)));
  const banda = pw / n;
  const gap = Math.max(2, Math.min(8, banda * 0.28));
  const bw = Math.max(1.5, banda - gap);
  const y = v => m.t + ph - (v / max) * ph;
  const r = bw >= 8 ? 4 : (bw >= 4 ? 2 : 0);

  // Grilla y eje Y (4 líneas, recesivas)
  let svg = '';
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i, yy = y(v);
    svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}" class="est-grid${i === 0 ? ' base' : ''}"/>`;
    svg += `<text x="${m.l - 8}" y="${yy + 4}" class="est-eje" text-anchor="end">${nfmt(v)}</text>`;
  }
  // Barras (con esquinas superiores redondeadas, apoyadas en la base)
  puntos.forEach((p, i) => {
    if (!p.dosis) return;
    const x = m.l + i * banda + gap / 2, top = y(p.dosis), base = y(0), h = base - top;
    const rr = Math.min(r, h, bw / 2);
    svg += `<path class="est-bar" data-i="${i}" d="M${x},${base} V${top + rr} Q${x},${top} ${x + rr},${top} H${x + bw - rr} Q${x + bw},${top} ${x + bw},${top + rr} V${base} Z"/>`;
  });
  // Línea de promedio (solo por día)
  if (gran === 'dia') {
    const prom = total / n, yy = y(prom);
    svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}" class="est-prom"/>`;
    svg += `<text x="${W - m.r}" y="${yy - 6}" class="est-prom-txt" text-anchor="end">Promedio ${nfmt(prom, 1)}</text>`;
  }
  // Etiquetas del eje X (a lo sumo ~8)
  const paso = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(pw / 80))));
  puntos.forEach((p, i) => {
    if (i % paso !== 0 && i !== n - 1) return;
    if (i === n - 1 && i % paso !== 0 && (n - 1) % paso < paso * 0.6) return; // evita choques con la anterior
    svg += `<text x="${m.l + i * banda + banda / 2}" y="${H - 8}" class="est-eje" text-anchor="middle">${estEtiquetaPunto(p, gran, false)}</text>`;
  });
  // Zonas de hover más grandes que las barras
  puntos.forEach((p, i) => {
    svg += `<rect class="est-hit" data-i="${i}" x="${m.l + i * banda}" y="${m.t}" width="${banda}" height="${ph}"/>`;
  });
  cont.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${sub}">${svg}</svg>`;

  const tip = $('est-tip');
  cont.querySelectorAll('.est-hit').forEach(el => {
    const i = Number(el.dataset.i), p = puntos[i];
    el.addEventListener('mousemove', e => {
      cont.querySelectorAll('.est-bar').forEach(b => b.classList.toggle('on', Number(b.dataset.i) === i));
      tip.innerHTML = `<div class="est-tip-t">${estEtiquetaPunto(p, gran, true)}</div><div><b>${nfmt(p.dosis)}</b> ${p.dosis === 1 ? 'dosis aplicada' : 'dosis aplicadas'}</div>`;
      estMoverTip(e);
    });
    el.addEventListener('mouseleave', () => {
      tip.classList.remove('on');
      cont.querySelectorAll('.est-bar.on').forEach(b => b.classList.remove('on'));
    });
  });
}
function estMoverTip(e) {
  const tip = $('est-tip');
  tip.classList.add('on');
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let x = e.clientX + 14, yy = e.clientY - h - 12;
  if (x + w > window.innerWidth - 8) x = e.clientX - w - 14;
  if (yy < 8) yy = e.clientY + 16;
  tip.style.left = x + 'px'; tip.style.top = yy + 'px';
}
// Redibuja el gráfico de evolución si cambia el ancho de la ventana
let _estResize;
window.addEventListener('resize', () => {
  clearTimeout(_estResize);
  _estResize = setTimeout(() => {
    if (EST_DATA && $('page-estadisticas')?.classList.contains('on')) estRenderSerie();
  }, 150);
});

/* ---------- Barras horizontales (ranking y motivos) ---------- */
function estRenderBarras(id, items, limite, vacio, textoMas) {
  const cont = $(id);
  if (!items.length) { cont.innerHTML = `<div class="est-vacio">${vacio}</div>`; return; }
  const max = Math.max(...items.map(i => i.valor)) || 1;
  const total = items.reduce((s, i) => s + i.valor, 0);
  const vis = items.slice(0, limite);
  cont.innerHTML = `<ul class="est-hbars">${vis.map(it => {
    const pct = Math.round((it.valor / total) * 100);
    return `<li title="${escHtml(it.label)}: ${nfmt(it.valor)} dosis (${pct}% del total)">
      <span class="est-hb-label">${escHtml(it.label)}</span>
      <span class="est-hb-track"><span class="est-hb-fill" style="width:${Math.max(2, (it.valor / max) * 100)}%"></span></span>
      <span class="est-hb-val">${nfmt(it.valor)} <small>${pct}%</small></span>
    </li>`;
  }).join('')}</ul>${items.length > limite && textoMas ? `<div class="est-mas">+ ${items.length - limite} ${textoMas}</div>` : ''}`;
}

/* ---------- Día de la semana ---------- */
function estRenderDow(dias) {
  const cont = $('est-dow');
  const max = Math.max(...dias.map(d => d.dosis));
  if (!max) { cont.innerHTML = '<div class="est-vacio">Sin aplicaciones registradas en el período.</div>'; return; }
  const top = dias.reduce((a, b) => (b.dosis > a.dosis ? b : a));
  cont.innerHTML = `
    <div class="est-dow">${dias.map(d => `
      <div class="est-dow-col${d === top ? ' top' : ''}" title="${d.dia}: ${nfmt(d.dosis)} dosis">
        <span class="est-dow-val">${d.dosis ? nfmt(d.dosis) : ''}</span>
        <span class="est-dow-track"><span class="est-dow-bar" style="height:${d.dosis ? Math.max(3, (d.dosis / max) * 100) : 0}%"></span></span>
        <span class="est-dow-lab">${d.dia.slice(0, 3)}</span>
      </div>`).join('')}
    </div>
    <div class="est-nota">El día con más aplicaciones es el <b>${top.dia.toLowerCase()}</b> (${nfmt(top.dosis)} dosis).</div>`;
}

/* ---------- Cobertura del stock ---------- */
function estEstadoCobertura(v) {
  if (v.stock === 0) return { cls: 'critica', txt: 'Sin stock' };
  if (v.cobertura_dias < 15) return { cls: 'critica', txt: 'Crítica' };
  if (v.cobertura_dias < 30) return { cls: 'baja', txt: 'Baja' };
  return { cls: 'buena', txt: 'Buena' };
}
function estRenderCobertura(porVac) {
  const cont = $('est-cobertura');
  const conUso = porVac.filter(v => v.cobertura_dias !== null)
    .sort((a, b) => a.cobertura_dias - b.cobertura_dias);
  const sinUso = porVac.length - conUso.length;
  if (!conUso.length) { cont.innerHTML = '<div class="est-vacio">No hubo consumo en el período para estimar la cobertura.</div>'; return; }
  const vis = conUso.slice(0, 6);
  cont.innerHTML = `<ul class="est-cob">${vis.map(v => {
    const e = estEstadoCobertura(v);
    const dias = v.stock === 0 ? 'Sin dosis' : `≈ ${nfmt(v.cobertura_dias)} ${v.cobertura_dias === 1 ? 'día' : 'días'}`;
    return `<li>
      <div class="est-cob-txt">
        <b>${escHtml(v.vacuna)}</b>
        <small>Stock ${nfmt(v.stock)}, consumo ${nfmt(v.consumo_diario, 1)} por día</small>
      </div>
      <div class="est-cob-dias">${dias}</div>
      <span class="est-cob-pill ${e.cls}">${e.txt}</span>
    </li>`;
  }).join('')}</ul>
  <div class="est-nota">Se muestran las ${vis.length} con menos días de cobertura.${sinUso ? ` ${sinUso} ${sinUso === 1 ? 'vacuna no tuvo' : 'vacunas no tuvieron'} consumo en el período.` : ''}</div>`;
}

/* ---------- Tabla por vacuna (ordenable) ---------- */
function estOrdenar(k) {
  EST_ORDEN = EST_ORDEN.k === k ? { k, dir: -EST_ORDEN.dir } : { k, dir: (k === 'vacuna' || k === 'cobertura_dias') ? 1 : -1 };
  estRenderTabla();
}
function estRenderTabla() {
  const rows = [...(EST_DATA?.por_vacuna || [])];
  const { k, dir } = EST_ORDEN;
  rows.sort((a, b) => {
    let va = a[k], vb = b[k];
    if (k === 'vacuna') return dir * String(va).localeCompare(String(vb), 'es');
    if (va === null) va = dir > 0 ? Infinity : -Infinity; // "sin consumo" va al final
    if (vb === null) vb = dir > 0 ? Infinity : -Infinity;
    return dir * (va - vb) || a.vacuna.localeCompare(b.vacuna, 'es');
  });
  document.querySelectorAll('.est-tabla th').forEach(th => {
    th.classList.toggle('ord', th.dataset.k === k);
    th.dataset.dir = th.dataset.k === k ? (dir > 0 ? 'asc' : 'desc') : '';
  });
  $('est-tabla-body').innerHTML = rows.map(v => {
    const cob = v.cobertura_dias === null
      ? '<span class="muted-dash">Sin consumo</span>'
      : (() => { const e = estEstadoCobertura(v); return `<span class="est-cob-pill ${e.cls}">${v.stock === 0 ? 'Sin stock' : nfmt(v.cobertura_dias) + ' días'}</span>`; })();
    return `<tr>
      <td data-label="Vacuna"><b>${escHtml(v.vacuna)}</b>${chipMulti(v.dosis_por_frasco)}</td>
      <td data-label="Aplicadas" class="num">${nfmt(v.aplicadas)}</td>
      <td data-label="Descartadas" class="num">${v.descartadas ? nfmt(v.descartadas) : '<span class="muted-dash">—</span>'}</td>
      <td data-label="Ingresadas" class="num">${v.ingresadas ? nfmt(v.ingresadas) : '<span class="muted-dash">—</span>'}</td>
      <td data-label="Stock actual" class="num">${nfmt(v.stock)}</td>
      <td data-label="Consumo / día" class="num">${v.consumo_diario ? nfmt(v.consumo_diario, 1) : '<span class="muted-dash">—</span>'}</td>
      <td data-label="Cobertura" class="num">${cob}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" class="est-vacio">Sin vacunas activas.</td></tr>';
}

/* ============================================================
   APLICACIÓN · VISITA (nov/2026)
   Una visita = un paciente, una fecha y una o más vacunas.
   Cada fila tiene un buscador de vacuna, el lote (se sugiere solo el que
   conviene usar) y las dosis. Se guarda todo junto con
   POST /api/aplicaciones/visita, en una sola transacción.
   ============================================================ */
let VIS_SEQ = 0;

const normTxt = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Vacunas activas con su resumen (del tablero); si todavía no cargó, del catálogo
function visVacunas() {
  if (DASH?.vacunas?.length) return DASH.vacunas;
  return (VACUNAS || []).map(v => ({ id: v.id, nombre: v.nombre, dosis_por_frasco: Number(v.dosis_por_frasco) || 1, stock: 0 }));
}
function visVacuna(id) { return visVacunas().find(v => Number(v.id) === Number(id)); }
// Lotes que se pueden aplicar: con dosis y sin vencer, el que vence antes primero
function visLotes(vacId) {
  return (STOCK_CACHE || [])
    .filter(r => Number(r.vacuna_id) === Number(vacId) && r.id && Number(r.disponible) > 0 && Number(r.dias_para_vencer) >= 0)
    .sort((a, b) => Number(a.dias_para_vencer) - Number(b.dias_para_vencer));
}
// Lote sugerido: el del frasco abierto y, si no hay, el que vence antes
function visSugerido(vacId) {
  const lotes = visLotes(vacId);
  if (!lotes.length) return null;
  const conFrasco = lotes.find(l => l.frasco_id && Number(l.frasco_dosis_sobrantes) > 0 && Number(l.frasco_dias_restantes) >= 0);
  return conFrasco || lotes[0];
}

/* ---------- Filas ---------- */
function visFilas() { return [...document.querySelectorAll('#visLista .vis-fila')]; }

function visAgregar(vacId, loteId, enfocar) {
  const n = ++VIS_SEQ;
  const li = document.createElement('li');
  li.className = 'vis-fila';
  li.dataset.n = n;
  li.innerHTML = `
    <span class="vis-vial" aria-hidden="true"></span>
    <div class="vis-campo vis-campo-vac">
      <label for="visVac${n}">Vacuna</label>
      <div class="vb">
        <input id="visVac${n}" class="vb-input" type="text" placeholder="Buscar vacuna" autocomplete="off"
               role="combobox" aria-expanded="false" aria-controls="visVacLista${n}" aria-autocomplete="list">
        <ul class="vb-lista" id="visVacLista${n}" role="listbox" hidden></ul>
      </div>
    </div>
    <div class="vis-campo vis-campo-lote">
      <label for="visLote${n}">Lote</label>
      <select id="visLote${n}" class="select-nice"><option value="">Elegí la vacuna primero</option></select>
      <span class="vis-nota" id="visNota${n}"></span>
    </div>
    <div class="vis-campo vis-campo-cant">
      <label for="visCant${n}">Dosis</label>
      <div class="vis-stepper">
        <button type="button" class="vis-step" data-d="-1" aria-label="Una dosis menos">−</button>
        <input id="visCant${n}" type="number" min="1" value="1" inputmode="numeric">
        <button type="button" class="vis-step" data-d="1" aria-label="Una dosis más">+</button>
      </div>
    </div>
    <button type="button" class="vis-quitar" aria-label="Quitar esta vacuna de la visita" title="Quitar">
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
    </button>`;
  $('visLista').appendChild(li);

  const input = li.querySelector('.vb-input');
  const lista = li.querySelector('.vb-lista');
  const sel = li.querySelector('select');
  const cant = li.querySelector(`#visCant${n}`);
  enhanceSelect(sel);
  sel.addEventListener('change', () => { visNotaLote(li); visResumen(); });
  cant.addEventListener('input', visResumen);
  li.querySelectorAll('.vis-step').forEach(b => b.addEventListener('click', () => {
    cant.value = Math.max(1, (Number(cant.value) || 0) + Number(b.dataset.d));
    visResumen();
  }));
  li.querySelector('.vis-quitar').addEventListener('click', () => {
    li.remove();
    if (!visFilas().length) visAgregar(null, null, true);
    visResumen();
  });
  vbConectar(input, lista, id => { visElegirVacuna(li, id); cant.focus(); cant.select(); });

  if (vacId) visElegirVacuna(li, vacId, loteId);
  else visRenderFila(li);
  if (enfocar) input.focus();
  visResumen();
  return li;
}

function visElegirVacuna(li, vacId, loteId) {
  const v = visVacuna(vacId);
  if (!v) return;
  li.dataset.vac = v.id;
  li.querySelector('.vb-input').value = v.nombre;
  const sel = li.querySelector('select');
  const lotes = visLotes(v.id);
  const sug = visSugerido(v.id);
  sel.innerHTML = lotes.length
    ? lotes.map(l => {
        const [y, m, d] = String(l.vencimiento).slice(0, 10).split('-');
        return `<option value="${l.id}">${escHtml(l.numero_lote)}, vence ${d}/${m}/${y.slice(2)}</option>`;
      }).join('')
    : '<option value="">No hay lotes vigentes</option>';
  const elegido = loteId && lotes.some(l => Number(l.id) === Number(loteId)) ? loteId : sug?.id;
  if (elegido) sel.value = String(elegido);
  li.dataset.sug = sug ? sug.id : '';
  if (sel._niceRefresh) sel._niceRefresh();
  visRenderFila(li);
  visNotaLote(li);
  visResumen();
}

// Frasquito de la fila (mismo dibujo que la heladera)
function visRenderFila(li) {
  const v = visVacuna(li.dataset.vac);
  const cont = li.querySelector('.vis-vial');
  if (!v) { cont.innerHTML = iniVialSVG({ dosis_por_frasco: 1 }, 'nostock', 0, false); return; }
  const est = iniEstado(v);
  cont.innerHTML = iniVialSVG(v, est, iniNivel(v), false);
}

// Nota bajo el lote: sugerido / frasco abierto / se abre un frasco nuevo
function visNotaLote(li) {
  const nota = li.querySelector('.vis-nota');
  const sel = li.querySelector('select');
  const v = visVacuna(li.dataset.vac);
  if (!v) { nota.innerHTML = ''; return; }
  const lote = visLotes(v.id).find(l => String(l.id) === sel.value);
  if (!lote) { nota.innerHTML = '<span class="vis-tag is-err">Sin lotes vigentes para aplicar</span>'; return; }
  const partes = [];
  if (String(lote.id) === li.dataset.sug) partes.push('<span class="vis-tag is-sug">Sugerido</span>');
  partes.push(`<span class="vis-tag">${lote.disponible} dosis en el lote</span>`);
  if (v.dosis_por_frasco > 1) {
    partes.push(lote.frasco_id && Number(lote.frasco_dosis_sobrantes) > 0
      ? `<span class="vis-tag">Frasco abierto: quedan ${lote.frasco_dosis_sobrantes} dosis</span>`
      : '<span class="vis-tag">Se abre un frasco nuevo</span>');
  }
  nota.innerHTML = partes.join('');
}

/* ---------- Buscador de vacunas dentro de la fila ---------- */
function vbConectar(input, lista, alElegir) {
  let activo = -1;
  const opciones = () => [...lista.querySelectorAll('[role="option"]:not([aria-disabled="true"])')];
  const pintar = () => {
    const q = normTxt(input.value);
    const vacs = visVacunas().filter(v => !q || normTxt(v.nombre).includes(q))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    const con = vacs.filter(v => v.stock > 0), sin = vacs.filter(v => v.stock <= 0);
    const ESTADO = { low: 'Stock bajo', exp: 'Por vencer' };
    const op = v => {
      const est = iniEstado(v);
      const s0 = v.stock <= 0;
      return `<li role="option" data-id="${v.id}" ${s0 ? 'aria-disabled="true"' : ''} class="vb-op is-${est}">
          <span class="vb-op-vial" aria-hidden="true">${iniVialSVG(v, est, iniNivel(v), false)}</span>
          <span class="vb-op-txt">
            <span class="vb-op-nom">${escHtml(v.nombre)}</span>
            <span class="vb-op-stock">${s0 ? 'Sin stock' : `${nfmt(v.stock)} dosis`}${ESTADO[est] ? `<em>${ESTADO[est]}</em>` : ''}</span>
          </span>
        </li>`;
    };
    let html = '';
    if (con.length) html += `<li class="vb-grupo" role="presentation">Con stock <b>${con.length}</b></li>${con.map(op).join('')}`;
    if (sin.length) html += `<li class="vb-grupo" role="presentation">Sin stock <b>${sin.length}</b></li>${sin.map(op).join('')}`;
    lista.innerHTML = html || '<li class="vb-vacio">No hay vacunas con ese nombre.</li>';
    activo = opciones().length ? 0 : -1;
    marcar();
    lista.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };
  const marcar = () => opciones().forEach((o, i) => {
    o.classList.toggle('on', i === activo);
    if (i === activo) { o.scrollIntoView({ block: 'nearest' }); input.setAttribute('aria-activedescendant', ''); }
  });
  const cerrar = () => { lista.hidden = true; input.setAttribute('aria-expanded', 'false'); };
  const elegir = op => { if (!op) return; cerrar(); alElegir(Number(op.dataset.id)); };

  input.addEventListener('focus', () => { input.select(); pintar(); });
  input.addEventListener('input', pintar);
  input.addEventListener('keydown', e => {
    const ops = opciones();
    if (e.key === 'ArrowDown') { e.preventDefault(); if (lista.hidden) return pintar(); activo = Math.min(ops.length - 1, activo + 1); marcar(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activo = Math.max(0, activo - 1); marcar(); }
    else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); elegir(ops[activo]); }
    else if (e.key === 'Escape') cerrar();
  });
  input.addEventListener('blur', () => setTimeout(cerrar, 150));
  lista.addEventListener('mousedown', e => {
    const op = e.target.closest('[role="option"]');
    if (op && op.getAttribute('aria-disabled') !== 'true') { e.preventDefault(); elegir(op); }
  });
}

/* ---------- Resumen en vivo ---------- */
function visLeer() {
  return visFilas().map(li => {
    const v = visVacuna(li.dataset.vac);
    const sel = li.querySelector('select');
    const lote = v ? visLotes(v.id).find(l => String(l.id) === sel.value) : null;
    const cant = Math.floor(Number(li.querySelector('input[type="number"]').value) || 0);
    return { li, v, lote, cant };
  });
}

// Etiqueta de lote: la misma que se pega en el carnet de vacunación
function fmtCorta(ymd) { const [y, m, d] = String(ymd).slice(0, 10).split('-'); return `${d}/${m}/${y.slice(2)}`; }
function codigoBarras(txt) {
  const t = String(txt || 'SGV');
  let h = 2166136261, x = 0;
  const barras = [];
  for (let i = 0; i < 38; i++) {
    h ^= t.charCodeAt(i % t.length) + i;
    h = Math.imul(h, 16777619) >>> 0;
    const w = 0.8 + (h % 3) * 0.75;
    if (i % 2 === 0) barras.push(`<rect x="${x.toFixed(2)}" width="${w.toFixed(2)}" height="14"/>`);
    x += w + 0.7;
  }
  return `<svg class="etq-barras" viewBox="0 0 ${x.toFixed(1)} 14" preserveAspectRatio="none" aria-hidden="true">${barras.join('')}</svg>`;
}
function etiquetaLote({ vacuna, numero, venc, estado = '', nueva = false }) {
  return `<span class="etq${estado ? ' is-' + estado : ''}${nueva ? ' pegada' : ''}">
      <span class="etq-vac">${escHtml(vacuna)}</span>
      <span class="etq-datos">
        <span class="etq-dato"><span>Lote</span><b>${numero ? escHtml(numero) : 'sin lote'}</b></span>
        <span class="etq-dato"><span>Vence</span><b>${venc ? fmtCorta(venc) : '-'}</b></span>
      </span>
      ${codigoBarras(numero || vacuna)}
    </span>`;
}

let VIS_PEGADAS = new Set();
function visResumen() {
  const cont = $('visResumen');
  if (!cont) return;
  // Sello del CAPS con la fecha de la visita
  const f = $('ap-fecha').value;
  if (f) {
    const [y, m, d] = f.split('-');
    $('visSello').innerHTML = `<small>San José Obrero</small>${Number(d)} ${INI_MESES_C[Number(m) - 1]} ${y}`;
  } else $('visSello').innerHTML = '<small>San José Obrero</small>Sin fecha';

  const filas = visLeer().filter(f => f.v);
  const usoLote = new Map(), usoVac = new Map();
  filas.forEach(f => {
    if (f.lote) usoLote.set(f.lote.id, (usoLote.get(f.lote.id) || 0) + f.cant);
    usoVac.set(f.v.id, (usoVac.get(f.v.id) || 0) + f.cant);
  });
  let hayError = false;
  const vistas = new Set();
  const items = filas.map(f => {
    let estado = '', txt;
    if (!f.lote) { estado = 'err'; hayError = true; txt = 'No tiene lotes vigentes para aplicar.'; }
    else if (f.cant < 1) { estado = 'err'; hayError = true; txt = 'Indicá cuántas dosis.'; }
    else {
      const quedanLote = Number(f.lote.disponible) - usoLote.get(f.lote.id);
      const quedanVac = f.v.stock - usoVac.get(f.v.id);
      if (quedanLote < 0) { estado = 'err'; hayError = true; txt = `No alcanza: el lote tiene ${f.lote.disponible} dosis.`; }
      else if (quedanVac <= iniUmbral()) { estado = 'warn'; txt = `Va a quedar con stock bajo: ${quedanVac} dosis de esta vacuna.`; }
      else txt = `Quedan ${quedanLote} dosis en el lote.`;
    }
    f.li.classList.toggle('is-err', estado === 'err');
    const clave = `${f.li.dataset.n}-${f.lote ? f.lote.id : 0}`;
    vistas.add(clave);
    const nueva = !VIS_PEGADAS.has(clave);
    return `<li class="carnet-fila${estado ? ' is-' + estado : ''}">
        ${etiquetaLote({ vacuna: f.v.nombre, numero: f.lote?.numero_lote, venc: f.lote?.vencimiento, estado, nueva })}
        <span class="carnet-dosis"><b>${Math.max(0, f.cant)}</b>${f.cant === 1 ? 'dosis' : 'dosis'}</span>
        <p class="carnet-aviso">${txt}</p>
      </li>`;
  });
  VIS_PEGADAS = vistas;
  visFilas().forEach(li => { if (!li.dataset.vac) li.classList.remove('is-err'); });
  const vacias = Math.max(0, 3 - filas.length);
  const renglones = Array.from({ length: vacias }, () => '<li class="carnet-fila is-vacia" aria-hidden="true"></li>').join('');
  const dosis = filas.reduce((s, f) => s + Math.max(0, f.cant), 0);
  cont.innerHTML = `
    <div class="carnet-cols" aria-hidden="true"><span>Vacuna y lote</span><span>Dosis</span></div>
    <ol class="carnet-filas">${items.join('')}${renglones}</ol>
    ${filas.length
      ? `<p class="res-total"><span>${filas.length} ${filas.length === 1 ? 'vacuna' : 'vacunas'}</span><b>${dosis} dosis</b></p>`
      : '<p class="res-vacio">Las vacunas que agregues se pegan acá, con la etiqueta de su lote, como en el carnet.</p>'}`;
  const btn = $('visGuardar');
  btn.disabled = !filas.length || hayError;
  btn.textContent = filas.length > 1 ? `Registrar ${filas.length} vacunas` : 'Registrar aplicación';
}

/* ---------- Guardar / cancelar ---------- */
async function visGuardar() {
  const fecha = $('ap-fecha').value;
  const filas = visLeer().filter(f => f.v);
  $('ap-fecha').classList.toggle('bad', !fecha);
  if (!fecha) return msg('ap-msg', 'err', 'Indicá la fecha de aplicación.');
  if (fecha > today()) return msg('ap-msg', 'err', 'La fecha de aplicación no puede ser posterior a hoy.');
  if (!filas.length) return msg('ap-msg', 'err', 'Agregá al menos una vacuna.');
  if (filas.some(f => !f.lote || f.cant < 1)) return msg('ap-msg', 'err', 'Revisá las vacunas marcadas en rojo.');
  const btn = $('visGuardar');
  btn.disabled = true;
  try {
    const r = await api('/aplicaciones/visita', { method: 'POST', body: JSON.stringify({
      fecha_aplicacion: fecha,
      items: filas.map(f => ({ lote_id: f.lote.id, cantidad: f.cant })),
    })});
    msg('ap-msg', '');
    // Aviso de frascos multidosis abiertos o terminados en esta visita
    const extras = (r.items || []).filter(it => it.frasco).map(it => {
      const f = it.frasco;
      if (f.abrioNuevo) return ` Se abrió un frasco nuevo de ${it.vacuna}: vence el ${fmtFecha(f.fechaVencimientoFrasco)}.`;
      if (f.agotado) return ` Se terminó el frasco de ${it.vacuna}.`;
      return '';
    }).join('');
    toastAccion('ok', (r.mensaje || 'Aplicación registrada.') + extras, 'Deshacer', () => deshacerMovs(r.mov_ids));
    visReiniciar();
    await refrescarDatos();
    visResumen();
  } catch (err) {
    msg('ap-msg', 'err', err.message);
  } finally {
    visResumen();
  }
}
function visReiniciar() {
  $('visLista').innerHTML = '';
  $('ap-fecha').value = today();
  $('ap-fecha').classList.remove('bad');
  $('ap-msg').innerHTML = '';
  visAgregar(null, null, true);
}
function visCancelar() { visReiniciar(); go('inicio'); }

// Desde otras pantallas: agrega una vacuna a la visita en curso (o llena la fila vacía)
function visConVacuna(vacId, loteId) {
  go('aplicar');
  if (!vacId) { visFilas()[0]?.querySelector('.vb-input')?.focus(); return; }
  const vacia = visFilas().find(li => !li.dataset.vac);
  if (vacia) visElegirVacuna(vacia, vacId, loteId);
  else visAgregar(vacId, loteId);
  const ultima = visFilas().find(li => Number(li.dataset.vac) === Number(vacId));
  ultima?.querySelector('input[type="number"]')?.focus();
}

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && $('page-aplicar')?.classList.contains('on')) {
    e.preventDefault();
    if (!$('visGuardar').disabled) visGuardar();
  }
});

/* ============================================================
   DESHACER: aviso con botón para revertir lo recién registrado
   ============================================================ */
function toastAccion(type, text, etiqueta, accion, ms = 12000) {
  const ic = type === 'ok' ? '✓' : type === 'info' ? 'i' : '✕';
  const el = document.createElement('div');
  el.className = 'toast toast-accion ' + type;
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="ti">${ic}</span><span class="toast-txt"></span><button type="button" class="toast-btn">${etiqueta}</button>`;
  el.querySelector('.toast-txt').textContent = text;
  $('toasts').appendChild(el);
  let timer;
  const quitar = () => { el.style.opacity = '0'; el.style.transition = '.3s'; setTimeout(() => el.remove(), 300); };
  const programar = () => { clearTimeout(timer); timer = setTimeout(quitar, ms); };
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', programar);
  el.querySelector('.toast-btn').addEventListener('click', async () => {
    clearTimeout(timer);
    el.remove();
    await accion();
  });
  programar();
}

async function deshacerMovs(ids) {
  try {
    const r = await api('/movimientos/deshacer', { method: 'POST', body: JSON.stringify({ ids }) });
    toast('ok', r.mensaje);
    await refrescarDatos();
    if ($('page-aplicar')?.classList.contains('on')) visResumen();
  } catch (err) {
    toast('err', err.message);
  }
}
async function refrescarDatos() {
  await Promise.all([loadStock(), loadMovimientos(), loadDashboard()]);
}

/* ============================================================
   RESÚMENES EN VIVO de Descarte e Ingresar lote
   ============================================================ */
function regFila(lbl, val, cls) { return `<div class="reg-dato${cls ? ' ' + cls : ''}"><dt>${lbl}</dt><dd>${val}</dd></div>`; }

function regResumenDescarte() {
  const cont = $('deResumen');
  if (!cont) return;
  const vacId = $('de-vac').value;
  const v = visVacuna(vacId);
  const lote = (STOCK_CACHE || []).find(r => String(r.id) === $('de-lote').value);
  if (!v) { cont.innerHTML = '<p class="res-vacio">Elegí la vacuna y el lote a descartar.</p>'; return; }
  const d = dpf(vacId);
  const cant = esMulti(vacId) ? (Number($('de-cant').value) || 0) * d + (Number($('de-sueltas').value) || 0) : (Number($('de-cant').value) || 0);
  let html;
  if (lote) {
    const dias = Number(lote.dias_para_vencer);
    const quedan = Number(lote.disponible) - cant;
    html = `<div class="reg-etq">${etiquetaLote({ vacuna: v.nombre, numero: lote.numero_lote, venc: lote.vencimiento, estado: dias < 0 ? 'err' : '' })}${dias < 0 ? '<span class="etq-sello">Vencido</span>' : ''}</div><dl class="reg-datos">`;
    html += regFila(dias < 0 ? 'Venció' : 'Vence', `${fmtFecha(lote.vencimiento)}, ${fmtDias(dias)}`, dias < 0 ? 'is-err' : '');
    html += regFila('Hay en el lote', `${lote.disponible} dosis`);
    if (cant > 0) html += regFila('Después del descarte', quedan < 0 ? `No alcanza: hay ${lote.disponible} dosis` : `${quedan} dosis`, quedan < 0 ? 'is-err' : '');
    // Si el lote está vencido, se sugiere el motivo
    if (dias < 0 && !$('de-motivo').value) { $('de-motivo').value = 'Vencimiento'; $('de-motivo')._niceRefresh?.(); }
  } else {
    html = `<div class="reg-vac"><span class="reg-vac-vial">${iniVialSVG(v, iniEstado(v), iniNivel(v), false)}</span><b>${escHtml(v.nombre)}</b></div><dl class="reg-datos">`;
    html += regFila('Stock vigente de la vacuna', `${v.stock} dosis`);
  }
  cont.innerHTML = html + '</dl>';
}

function regResumenLote() {
  const cont = $('loResumen');
  if (!cont) return;
  const vacId = $('lo-vac').value;
  const v = visVacuna(vacId);
  if (!v) { cont.innerHTML = '<p class="res-vacio">Elegí la vacuna que llegó.</p>'; return; }
  const num = $('lo-num').value.trim();
  const cant = esMulti(vacId) ? (Number($('lo-cant').value) || 0) * dpf(vacId) : (Number($('lo-cant').value) || 0);
  const existente = num ? (STOCK_CACHE || []).find(r => Number(r.vacuna_id) === Number(vacId) && r.id && normTxt(r.numero_lote) === normTxt(num)) : null;
  let html = `<div class="reg-etq">${etiquetaLote({ vacuna: v.nombre, numero: existente ? existente.numero_lote : num, venc: $('lo-venc').value || (existente && existente.vencimiento) })}</div><dl class="reg-datos">`;
  html += regFila('Stock vigente hoy', `${v.stock} dosis`);
  if (num) html += regFila('Lote', existente ? 'Ya existe: se suman las dosis' : 'Lote nuevo');
  if (cant > 0) html += regFila('Stock después de guardar', `${v.stock + cant} dosis`, 'is-ok');
  cont.innerHTML = html + '</dl>';
}

/* ============================================================
   BUSCADOR RÁPIDO (Ctrl + K o "/"): encontrar una vacuna desde
   cualquier pantalla, ver su stock y actuar.
   ============================================================ */
let BUSQ_ACT = 0;
function busqAbrir() {
  if (!TOKEN) return;
  $('ovBuscar').classList.add('on');
  const i = $('busqInput');
  i.value = '';
  busqRender();
  i.focus();   // en el mismo momento, para no perder las primeras teclas
}
function busqCerrar() { $('ovBuscar').classList.remove('on'); }
function busqResultados() {
  const q = normTxt($('busqInput').value);
  return visVacunas().filter(v => !q || normTxt(v.nombre).includes(q))
    .sort((a, b) => {
      if (q) { const pa = normTxt(a.nombre).startsWith(q), pb = normTxt(b.nombre).startsWith(q); if (pa !== pb) return pb - pa; }
      return a.nombre.localeCompare(b.nombre);
    });
}
function busqRender() {
  const info = iniInfo();
  const res = busqResultados();
  if (BUSQ_ACT >= res.length) BUSQ_ACT = 0;
  $('busqLista').innerHTML = res.length ? res.map((v, i) => {
    const est = iniEstado(v);
    const acc = info.write ? `
        ${v.stock > 0 ? `<button type="button" class="busq-acc" onclick="event.stopPropagation();busqCerrar();visConVacuna(${v.id})">Aplicar</button>` : ''}
        <button type="button" class="busq-acc" onclick="event.stopPropagation();busqCerrar();iniIngresarLote(${v.id})">Ingresar lote</button>` : '';
    return `<li role="option" class="busq-op${i === BUSQ_ACT ? ' on' : ''}" aria-selected="${i === BUSQ_ACT}" onclick="busqCerrar();iniAbrirFicha(${v.id})" onmousemove="BUSQ_ACT=${i};busqMarcar()">
        <span class="busq-vial" aria-hidden="true">${iniVialSVG(v, est, iniNivel(v), false)}</span>
        <span class="busq-nom"><b>${escHtml(v.nombre)}</b><small class="is-${est}">${v.stock > 0 ? `${nfmt(v.stock)} dosis, ${INI_EST[est].lbl.toLowerCase()}` : 'Sin stock'}</small></span>
        <span class="busq-accs">${acc}</span>
      </li>`;
  }).join('') : '<li class="busq-vacio">No hay vacunas con ese nombre.</li>';
  $('busqPie').textContent = info.write
    ? 'Enter abre la ficha. Con las flechas elegís otra vacuna.'
    : 'Enter abre la ficha con los lotes. Con las flechas elegís otra vacuna.';
}
function busqMarcar() {
  [...$('busqLista').querySelectorAll('.busq-op')].forEach((o, i) => {
    o.classList.toggle('on', i === BUSQ_ACT);
    o.setAttribute('aria-selected', String(i === BUSQ_ACT));
  });
}
function busqTecla(e) {
  const res = busqResultados();
  if (e.key === 'ArrowDown') { e.preventDefault(); BUSQ_ACT = Math.min(res.length - 1, BUSQ_ACT + 1); busqMarcar(); busqVer(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); BUSQ_ACT = Math.max(0, BUSQ_ACT - 1); busqMarcar(); busqVer(); }
  else if (e.key === 'Enter') { e.preventDefault(); const v = res[BUSQ_ACT]; if (v) { busqCerrar(); iniAbrirFicha(v.id); } }
  else if (e.key === 'Escape') busqCerrar();
}
function busqVer() { $('busqLista').querySelectorAll('.busq-op')[BUSQ_ACT]?.scrollIntoView({ block: 'nearest' }); }

document.addEventListener('keydown', e => {
  if (!TOKEN) return;
  const escribiendo = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); busqAbrir(); }
  else if (e.key === '/' && !escribiendo && !$('ovBuscar').classList.contains('on')) { e.preventDefault(); busqAbrir(); }
  else if (e.key === 'Escape') {
    if ($('ovBuscar').classList.contains('on')) busqCerrar();
    else if ($('ovFicha').classList.contains('on')) closeOv('ovFicha');
  }
});


/* ============================================================
   LOGIN: estante con frascos (mismo dibujo que la heladera) y
   botón para ver la contraseña.
   ============================================================ */
function gateVerClave() {
  const i = $('p'), b = $('gateVer');
  const ver = i.type === 'password';
  i.type = ver ? 'text' : 'password';
  b.textContent = ver ? 'Ocultar' : 'Mostrar';
  b.setAttribute('aria-pressed', String(ver));
  b.setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña');
  i.focus();
}
// Interior de la heladera del login: tres estantes con frascos de ejemplo (solo decoración)
(function gateEstantes() {
  const filas = [
    [[1, 'ok', .85], [10, 'ok', .55], [1, 'ok', .95], [5, 'exp', .4]],
    [[1, 'low', .22], [1, 'ok', .7], [10, 'ok', .9], [1, 'ok', .6]],
    [[5, 'ok', .75], [1, 'ok', .5], [1, 'exp', .35], [10, 'ok', .8]],
  ];
  document.querySelectorAll('.gate-estante').forEach((cont, k) => {
    cont.innerHTML = filas[k].map(([d, est, nivel], i) =>
      `<span class="gate-frasco" style="--i:${k * 4 + i}">${iniVialSVG({ dosis_por_frasco: d }, est, nivel, false)}</span>`).join('');
  });
})();

// El vacunatorio alrededor de la heladera del login (solo decoración)
(function gateEscena() {
  const izq = $('gateIzq'), der = $('gateDer');
  if (!izq || !der) return;
  // frasco reutilizando el mismo dibujo de la heladera
  const fr = (x, y, w, d, est, nivel) =>
    iniVialSVG({ dosis_por_frasco: d }, est, nivel, false).replace('<svg ', `<svg x="${x}" y="${y - w * 88 / 48}" width="${w}" height="${w * 88 / 48}" `);
  const estante = (x1, x2, y) => `<rect x="${x1}" y="${y}" width="${x2 - x1}" height="9" rx="2" class="gs-tabla"/>
    <rect x="${x1}" y="${y}" width="${x2 - x1}" height="2.5" rx="1.2" class="gs-tabla-luz"/>
    <rect x="${x1 + 6}" y="${y + 9}" width="${x2 - x1 - 12}" height="10" class="gs-sombra"/>
    <path d="M${x1 + 24} ${y + 9}v16l14-16M${x2 - 24} ${y + 9}v16l-14-16" class="gs-soporte"/>`;
  const caja = (x, y, w, h, txt) => `<rect x="${x}" y="${y - h}" width="${w}" height="${h}" rx="3" class="gs-caja"/>
    <rect x="${x}" y="${y - h}" width="${w}" height="7" rx="3" class="gs-caja-tapa"/>
    ${txt ? `<text x="${x + w / 2}" y="${y - h / 2 + 9}" class="gs-caja-txt">${txt}</text>` : ''}`;

  // Izquierda: calendario en la pared, estante con cajas y la mesada con insumos
  const filas = [0, 1, 2, 3, 4, 5].map(i => {
    const y = 104 + i * 30;
    const pts = [0, 1, 2, 3, 4].map(j => `<circle cx="${150 + j * 22}" cy="${y + 5}" r="5.5" class="${(i * 3 + j) % 4 === 0 ? 'gs-pto-on' : 'gs-pto'}"/>`).join('');
    return `<rect x="78" y="${y}" width="${46 - (i % 3) * 8}" height="10" rx="3" class="gs-linea"/>${pts}`;
  }).join('');
  izq.innerHTML = `
    <g class="gs-afiche">
      <rect x="60" y="30" width="214" height="282" rx="6" class="gs-papel"/>
      <rect x="60" y="30" width="214" height="46" rx="6" class="gs-papel-cab"/>
      <text x="78" y="59" class="gs-afiche-tit">Calendario de vacunación</text>
      ${filas}
      <circle cx="167" cy="30" r="5" class="gs-chinche"/>
    </g>
    ${estante(318, 540, 262)}
    ${caja(334, 262, 70, 54, 'Jeringas')}${caja(412, 262, 56, 40, 'Agujas')}${caja(476, 262, 52, 68, '')}
    <g class="gs-mesada">
      <rect x="70" y="440" width="490" height="200" class="gs-mueble"/>
      <rect x="62" y="426" width="498" height="16" rx="3" class="gs-mesada-tapa"/>
      <rect x="86" y="458" width="224" height="166" rx="4" class="gs-puertita"/>
      <rect x="322" y="458" width="224" height="166" rx="4" class="gs-puertita"/>
      <rect x="290" y="500" width="6" height="40" rx="3" class="gs-tirador"/><rect x="336" y="500" width="6" height="40" rx="3" class="gs-tirador"/>
    </g>
    <g class="gs-descartador">
      <rect x="104" y="350" width="70" height="76" rx="6" class="gs-desc-cuerpo"/>
      <path d="M98 350h82l-6-16H104z" class="gs-desc-tapa"/>
      <rect x="126" y="334" width="26" height="6" rx="2" class="gs-desc-boca"/>
    </g>
    <g class="gs-frasco-algodon">
      <rect x="200" y="356" width="62" height="70" rx="10" class="gs-vidrio"/>
      <circle cx="217" cy="384" r="12" class="gs-algodon"/><circle cx="238" cy="378" r="13" class="gs-algodon"/><circle cx="226" cy="402" r="13" class="gs-algodon"/><circle cx="247" cy="400" r="11" class="gs-algodon"/>
      <rect x="196" y="346" width="70" height="12" rx="4" class="gs-tapa"/>
    </g>
    <g>
      <rect x="292" y="350" width="34" height="76" rx="7" class="gs-alcohol"/>
      <rect x="301" y="330" width="16" height="22" rx="3" class="gs-alcohol-pico"/>
      <rect x="292" y="374" width="34" height="26" class="gs-etiqueta"/>
    </g>
    <rect x="350" y="414" width="170" height="12" rx="4" class="gs-bandeja"/>
    ${fr(362, 414, 30, 1, 'ok', .8)}${fr(398, 414, 30, 10, 'ok', .5)}${fr(440, 414, 30, 1, 'ok', .9)}${fr(476, 414, 30, 5, 'ok', .6)}`;

  // Derecha: reloj, dos estantes con frascos y cajas, y una planta
  const hoja = (d, r) => `<path d="${d}" class="gs-hoja" transform="rotate(${r} 470 520)"/>`;
  der.innerHTML = `
    <g class="gs-reloj">
      <circle cx="440" cy="92" r="40" class="gs-reloj-cara"/>
      <circle cx="440" cy="92" r="40" class="gs-reloj-aro"/>
      <path d="M440 92V66M440 92l17 10" class="gs-reloj-aguja"/>
      <circle cx="440" cy="92" r="3.5" class="gs-reloj-centro"/>
    </g>
    ${estante(30, 380, 196)}
    ${fr(52, 196, 38, 1, 'ok', .85)}${fr(100, 196, 38, 10, 'ok', .55)}${fr(152, 196, 38, 1, 'low', .2)}${fr(200, 196, 38, 5, 'ok', .7)}
    ${caja(262, 196, 104, 58, 'Jeringas')}
    ${estante(30, 380, 360)}
    ${caja(46, 360, 96, 70, 'Algodón')}${caja(150, 360, 72, 48, 'Guantes')}
    <g>${[0, 1, 2, 3, 4].map(i => `<rect x="236" y="${352 - i * 8}" width="${92 - (i % 2) * 6}" height="7" rx="2" class="${i % 2 ? 'gs-carnet2' : 'gs-carnet'}"/>`).join('')}</g>
    ${fr(338, 360, 30, 1, 'ok', .7)}
    <g class="gs-planta">
      ${hoja('M470 520c-30-40-34-90-8-130 18 40 20 90 8 130z', -32)}${hoja('M470 520c-30-40-34-90-8-130 18 40 20 90 8 130z', 6)}
      ${hoja('M470 520c-30-40-34-90-8-130 18 40 20 90 8 130z', 38)}${hoja('M470 520c-20-30-24-64-6-92 13 28 14 64 6 92z', -60)}${hoja('M470 520c-20-30-24-64-6-92 13 28 14 64 6 92z', 64)}
      <path d="M428 518h84l-10 122h-64z" class="gs-maceta"/>
      <rect x="422" y="508" width="96" height="16" rx="4" class="gs-maceta-borde"/>
    </g>`;
})();

// Abre la puerta y recién ahí entra a la web
function gateAbrir(despues) {
  const h = $('gateHeladera');
  const quieto = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!h || quieto) return despues();
  h.classList.add('abierta');
  setTimeout(despues, 1050);
}
