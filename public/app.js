/* ============================================================
   Stella Maris Joyas — la página del sistema
   Los datos vienen del servidor (/api). Las fotos se achican en el
   navegador antes de subirse y quedan guardadas en la base.
   ============================================================ */
(() => {
'use strict';

const MAT = {
  oro:{name:'Oro', full:'Oro 18k', pre:'ORO'},
  plata:{name:'Plata', full:'Plata 925', pre:'PLA'},
  acero:{name:'Acero', full:'Acero quirúrgico', pre:'ACE'},
  'plata-oro':{name:'Plata y oro', full:'Plata y oro', pre:'PYO'}
};
const CAT = {
  anillo:{pl:'Anillos', one:'Anillo'},
  cadena:{pl:'Cadenas', one:'Cadena'},
  pulsera:{pl:'Pulseras', one:'Pulsera'},
  aros:{pl:'Aros', one:'Aros'},
  colgante:{pl:'Colgantes', one:'Colgante'},
  reloj:{pl:'Relojes', one:'Reloj'}
};
/* Íconos de categoría en línea roja, como las historias destacadas del Instagram */
const ICONOS = {
  todas:'<path d="M16.5 13h15l6 7.5L24 36 10.5 20.5z"/><path d="M10.5 20.5h27M20.5 13l-2.6 7.5L24 36l6.1-15.5-2.6-7.5"/><path d="M38 9.5v4M36 11.5h4" stroke-width="1.3"/>',
  anillo:'<circle cx="24" cy="31.5" r="10.5"/><circle cx="24" cy="31.5" r="8"/><path d="M19.6 10h8.8l3 3.7L24 20.6l-7.4-6.9z"/><path d="M16.6 13.7h14.8M22.2 10 21 13.7l3 6.9 3-6.9-1.2-3.7"/>',
  cadena:'<g transform="rotate(-38 24 24)"><rect x="3.5" y="20" width="12" height="8" rx="4"/><rect x="12.5" y="21.6" width="9" height="4.8" rx="2.4"/><rect x="18" y="20" width="12" height="8" rx="4"/><rect x="27" y="21.6" width="9" height="4.8" rx="2.4"/><rect x="32.5" y="20" width="12" height="8" rx="4"/></g>',
  pulsera:'<circle cx="36.50" cy="24.00" r="2.9"/><circle cx="34.83" cy="30.25" r="2.9"/><circle cx="30.25" cy="34.83" r="2.9"/><circle cx="24.00" cy="36.50" r="2.9"/><circle cx="17.75" cy="34.83" r="2.9"/><circle cx="13.17" cy="30.25" r="2.9"/><circle cx="11.50" cy="24.00" r="2.9"/><circle cx="13.17" cy="17.75" r="2.9"/><circle cx="17.75" cy="13.17" r="2.9"/><circle cx="24.00" cy="11.50" r="2.9"/><circle cx="30.25" cy="13.17" r="2.9"/><circle cx="34.83" cy="17.75" r="2.9"/><circle cx="24" cy="24" r="12.5" stroke-width=".9"/>',
  aros:'<circle cx="16" cy="9.5" r="2.2"/><path d="M16 11.7v4.3M16 16c3.4 5 6.6 9 6.6 13.2a6.6 6.6 0 0 1-13.2 0C9.4 25 12.6 21 16 16z"/><path d="M16 23.4c1.6 2.4 3 4.4 3 6.2a3 3 0 0 1-6 0c0-1.8 1.4-3.8 3-6.2z" stroke-width="1.1"/><circle cx="32" cy="9.5" r="2.2"/><path d="M32 11.7v4.3M32 16c3.4 5 6.6 9 6.6 13.2a6.6 6.6 0 0 1-13.2 0C25.4 25 28.6 21 32 16z"/><path d="M32 23.4c1.6 2.4 3 4.4 3 6.2a3 3 0 0 1-6 0c0-1.8 1.4-3.8 3-6.2z" stroke-width="1.1"/>',
  colgante:'<path d="M8.5 8c2.6 9.4 8.4 15.6 15.5 16.4C31.1 23.6 36.9 17.4 39.5 8" stroke-dasharray=".1 3.1" stroke-width="2.2"/><path d="M24 24.4v2.2"/><circle cx="24" cy="32.6" r="6"/><circle cx="24" cy="32.6" r="2.6"/><path d="M13.5 22.5l1.6 1.6-1.6 1.6-1.6-1.6zM34.5 22.5l1.6 1.6-1.6 1.6-1.6-1.6z" stroke-width="1.1"/>',
  reloj:'<rect x="16" y="15.5" width="16" height="17" rx="4.5"/><rect x="18.6" y="18.1" width="10.8" height="11.8" rx="2.8" stroke-width="1"/><path d="M24 20.6V24l2.4 1.5"/><path d="M19.2 15.5l1-7h7.6l1 7M19.2 32.5l1 7h7.6l1-7"/><path d="M32 22.2h1.6v3.6H32"/>'
};
const icono = k => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[k]}</svg>`;
const PAYS = ['Efectivo','Débito','Crédito','Transferencia','Mercado Pago'];
const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const DAYS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const DAYS_SHORT = ['dom','lun','mar','mié','jue','vie','sáb'];

/* ── Datos: llegan del servidor al entrar (GET /api/estado) ── */
let P = [];                    /* piezas en el local (disponibles y reservadas) */
let SALES = [];                /* ventas de hoy, en el orden en que se hicieron */
let PAST = [0, 0, 0, 0, 0, 0]; /* facturación de los seis días anteriores, del más viejo a ayer */
let PENDING = [];              /* fotos por completar */
let ULT = {};                  /* último número de código usado por material */
let TOKEN = null;              /* sesión (JWT) que da el servidor al ingresar */

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const nb = s => String(s).replace(/(\d) (mm|cm|g)\b/g, '$1 $2');   /* número y unidad no se separan */
const txt = s => esc(nb(s));
const money = n => '$' + Math.round(n).toLocaleString('es-AR');
const short = v => v >= 1e6 ? (v / 1e6).toLocaleString('es-AR', {maximumFractionDigits:1}) + ' M' : v >= 1e3 ? Math.round(v / 1e3) + ' mil' : String(v);
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const TODAY = new Date();
const daysAgo = k => new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() - k);
const longDate = x => `${x.getDate()} de ${MONTHS[x.getMonth()]} de ${x.getFullYear()}`;
const since = k => k <= 0 ? 'desde hoy' : k === 1 ? 'desde ayer' : `desde el ${daysAgo(k).getDate()} de ${MONTHS[daysAgo(k).getMonth()]}`;
const smooth = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const plural = (k, one, many) => `${k} ${k === 1 ? one : many}`;
const digitsOf = v => String(v).replace(/\D/g, '');
const xIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

/* Formatea un precio mientras se escribe sin que el cursor salte al final */
function formatMoneyInput(el, kind){
  let raw = el.value, caret = el.selectionStart == null ? raw.length : el.selectionStart;
  const prev = el._prev == null ? el.defaultValue : el._prev;
  /* Si se borró solo un punto de miles, se borra también el dígito de al lado
     (si no, el punto vuelve a aparecer y parece que la tecla no anda) */
  if (kind && raw.length < prev.length && digitsOf(raw).length === digitsOf(prev).length){
    if (kind === 'deleteContentBackward' && caret > 0){ raw = raw.slice(0, caret - 1) + raw.slice(caret); caret--; }
    else if (kind === 'deleteContentForward') raw = raw.slice(0, caret) + raw.slice(caret + 1);
  }
  const before = digitsOf(raw.slice(0, caret)).length;
  const digits = digitsOf(raw).slice(0, 10).replace(/^0+(?=\d)/, '');
  const out = digits ? Number(digits).toLocaleString('es-AR') : '';
  el.value = el._prev = out;
  let pos = 0, seen = 0;
  while (pos < out.length && seen < before){ if (/\d/.test(out[pos])) seen++; pos++; }
  try { el.setSelectionRange(pos, pos); } catch {}
}

/* ── Ilustraciones de las piezas de ejemplo (las fotos subidas se muestran tal cual) ── */
const TONE = {oro:['#AD8E55','#D7C39A'], plata:['#979AA2','#C6C8CD'], acero:['#6F737A','#A3A6AB'], 'plata-oro':['#979AA2','#AD8E55']};
const artCache = new Map();
const fx = v => +v.toFixed(1);
function heart(cx, cy, s){
  return `M${fx(cx)} ${fx(cy + s * .9)}C${fx(cx - s * 1.35)} ${fx(cy)} ${fx(cx - s * .95)} ${fx(cy - s * .95)} ${fx(cx)} ${fx(cy - s * .3)}C${fx(cx + s * .95)} ${fx(cy - s * .95)} ${fx(cx + s * 1.35)} ${fx(cy)} ${fx(cx)} ${fx(cy + s * .9)}Z`;
}
function ellipsePts(cx, cy, rx, ry, count){
  const N = 360, pts = [], acc = [0];
  for (let i = 0; i <= N; i++){
    const t = i / N * Math.PI * 2;
    pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
    if (i) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const out = [];
  for (let k = 0, j = 0; k < count; k++){
    const target = k / count * acc[N];
    while (acc[j] < target) j++;
    out.push(pts[j]);
  }
  return out;
}
function art(p){
  const key = [p.c, p.n, p.m, p.cat].join('|');
  if (artCache.has(key)) return artCache.get(key);
  let [a, b] = TONE[p.m] || TONE.plata;
  const n = norm(p.n), has = (...k) => k.some(w => n.includes(w));
  if (has('dorad')) [a, b] = TONE.oro;
  const L = (w = 2, c = a) => `fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
  const W = (w = 1.6, c = a) => `fill="#FFFFFF" stroke="${c}" stroke-width="${w}" stroke-linejoin="round"`;
  let g = '', sy = 0;
  switch (p.cat){
    case 'anillo':
      if (has('entrelaz', 'bicolor')){
        g = `<circle cx="86" cy="112" r="30" ${L(2.6)}/><circle cx="114" cy="112" r="30" ${L(2.6, b)}/>`; sy = 148;
      } else if (has('alianza', 'liso', 'banda', 'cinta')){
        g = `<path d="M54 98v14a46 17 0 0 0 92 0V98" ${L(2.2)}/><ellipse cx="100" cy="98" rx="46" ry="17" ${L(2.2)}/><ellipse cx="100" cy="98" rx="39" ry="12.5" ${L(1.2, b)}/>`; sy = 136;
      } else {
        g = `<circle cx="100" cy="120" r="34" ${L(2.4)}/><circle cx="100" cy="120" r="28.5" ${L(1.2, b)}/>`;
        if (has('corona')) g += [-48, -24, 0, 24, 48].map(t => { const r = t * Math.PI / 180; return `<circle cx="${fx(100 + 34 * Math.sin(r))}" cy="${fx(120 - 34 * Math.cos(r))}" r="4.4" ${W(1.4)}/>`; }).join('');
        else g += `<path d="M89 89l4-13M111 89l-4-13" ${L(1.6)}/><path d="M92 66h16l7 8-15 17-15-17z" ${W(1.6)}/><path d="M85 74h30M92 66l4 8 4 17M108 66l-4 8-4 17" ${L(1, b)}/>`;
        sy = 160;
      }
      break;
    case 'cadena': {
      const d = 'M52 44C50 104 74 150 100 150S150 104 148 44';
      const thick = has('groumet', 'cubana', 'eslabon', 'trenz'), rolo = has('rolo'), figaro = has('figaro');
      const dash = thick ? '6.5 2.4' : rolo ? '0.1 5.2' : figaro ? '9 2.4 3 2.4 3 2.4' : '3.4 2';
      const w = thick ? 4.6 : rolo ? 4 : 2.6;
      g = `<path d="${d}" ${L(1, b)}/><path d="${d}" ${L(w)} stroke-dasharray="${dash}"/>`;
      if (p.m === 'plata-oro') g += `<path d="${d}" ${L(w * .5, b)} stroke-dasharray="${dash}" stroke-dashoffset="4.4"/>`;
      g += `<circle cx="52" cy="40" r="3.4" ${L(1.6)}/><path d="M148 44c-4-5-3-13 2-13s6 8 2 13" ${L(1.6)}/>`;
      break;
    }
    case 'pulsera': {
      const E = (rx, ry, cy, attrs) => `<ellipse cx="100" cy="${cy}" rx="${rx}" ry="${ry}" ${attrs}/>`;
      if (has('malla')){
        let mesh = '';
        for (let x = 58; x <= 142; x += 6){ const t = (x - 100) / 54; mesh += `<path d="M${x} ${fx(96 + 20 * Math.sqrt(1 - t * t))}v11" ${L(.7, b)}/>`; }
        g = `<path d="M46 96v12a54 20 0 0 0 108 0V96" ${L(2)}/>${E(54, 20, 96, L(2))}${E(49, 16.5, 96, L(1.1, b))}${mesh}<rect x="91" y="113" width="18" height="11" rx="2" ${W(1.4)}/>`; sy = 136;
      } else if (has('tennis')){
        g = E(52, 22, 104, L(1.2, b)) + ellipsePts(100, 104, 52, 22, 28).map(([x, y]) => `<circle cx="${fx(x)}" cy="${fx(y)}" r="3.4" ${W(1.3)}/>`).join(''); sy = 134;
      } else if (has('doble')){
        g = E(52, 22, 100, `${L(3)} stroke-dasharray="4.6 2.2"`) + E(47, 19, 110, p.m === 'plata-oro' ? L(2.6, b) : `${L(3, b)} stroke-dasharray="4.6 2.2"`); sy = 136;
      } else if (has('rigid', 'esclava')){
        g = `<path d="M48 104v8a52 21 0 0 0 104 0v-8" ${L(2.2)}/>${E(52, 21, 104, L(2.2))}${E(47, 17.5, 104, L(1.1, b))}`; sy = 136;
      } else {
        const thick = has('eslabon', 'grueso');
        g = E(52, 22, 104, L(1, b)) + E(52, 22, 104, `${L(thick ? 4.8 : 2.8)} stroke-dasharray="${thick ? '7.5 2.8' : '3.4 2.8'}"`);
        if (has('dije')) g += [78, 100, 122].map(x => { const t = (x - 100) / 52, y = 104 + 22 * Math.sqrt(1 - t * t); return `<path d="M${x} ${fx(y)}v7" ${L(1.2)}/><path d="${heart(x, y + 14, 6.5)}" ${W(1.4)}/>`; }).join('');
        else sy = 134;
      }
      break;
    }
    case 'aros': {
      const pair = fn => fn(72) + fn(128);
      if (has('argolla')) g = pair(x => `<circle cx="${x}" cy="108" r="22" ${L(2.6)}/><circle cx="${x}" cy="85" r="2" fill="${a}"/>`);
      else if (has('abridor')) g = pair(x => `<circle cx="${x}" cy="104" r="14" ${L(2.2)}/><path d="M${x - 3.5} 90h7" ${L(2.6, b)}/>`);
      else if (has('pasante', 'bebe')) g = pair(x => `<circle cx="${x}" cy="104" r="14" ${L(1.3, b)}/><circle cx="${x}" cy="104" r="8.5" ${W(2)}/><circle cx="${x - 2.5}" cy="101.5" r="1.6" fill="${b}"/>`);
      else if (has('gota')) g = pair(x => `<circle cx="${x}" cy="72" r="4.2" ${W(1.6)}/><path d="M${x} 76.5v8" ${L(1.4)}/><path d="M${x} 86c4 7 13 16 13 26a13 13 0 0 1-26 0c0-10 9-19 13-26z" ${W(1.8)}/><path d="M${x} 97c2.4 4.4 7 9.6 7 14.6a7 7 0 0 1-14 0c0-5 4.6-10.2 7-14.6z" ${L(1.1, b)}/>`);
      else if (has('clip', 'geometr')) g = pair(x => { const pts = Array.from({length:6}, (_, k) => { const t = Math.PI / 6 + k * Math.PI / 3; return `${fx(x + 19 * Math.cos(t))},${fx(108 + 19 * Math.sin(t))}`; }).join(' '); return `<path d="M${x} 89v-7" ${L(1.6)}/><circle cx="${x}" cy="79" r="2.4" ${L(1.4)}/><polygon points="${pts}" ${L(2.4)}/>`; });
      else if (has('boton')) g = pair(x => `<circle cx="${x}" cy="104" r="13" ${W(1.8)}/><path d="M${x} 91v26M${fx(x - 11.3)} 97.5l22.6 13M${fx(x - 11.3)} 110.5l22.6-13" ${L(.9, b)}/>`);
      else if (has('combinad')) g = pair(x => `<circle cx="${x}" cy="110" r="21" ${L(2.4)}/><circle cx="${x}" cy="101" r="11.5" ${L(2.2, b)}/><circle cx="${x}" cy="88" r="2" fill="${a}"/>`);
      else g = pair(x => `<circle cx="${x}" cy="108" r="20" ${L(2.6)}/><circle cx="${x}" cy="87" r="2" fill="${a}"/>`);
      break;
    }
    case 'colgante': {
      const fine = `${L(1.3)} stroke-dasharray="2 2.2"`;
      if (has('infinito')){
        g = `<path d="M56 28C60 70 70 108 76 124" ${fine}/><path d="M144 28C140 70 130 108 124 124" ${fine}/><path d="M100 124C94 115 76 115 76 124S94 133 100 124" ${L(2.4)}/><path d="M100 124C106 115 124 115 124 124S106 133 100 124" ${L(2.4, b)}/>`;
      } else {
        let shape, top;
        if (has('corazon')){ shape = `<path d="${heart(100, 125, 15)}" ${W(1.9)}/>` + (has('calado') ? `<path d="${heart(100, 125, 8.5)}" ${L(1.1, b)}/>` : ''); top = 120.5; }
        else if (has('luna')){ shape = `<path d="M108 111A16 16 0 1 0 108 139A15 15 0 0 1 108 111Z" ${W(1.8)}/>`; top = 109; }
        else if (has('cruz')){ shape = `<path d="M95 108h10v10h10v10h-10v26h-10v-26h-10v-10h10z" ${W(1.8)}/>` + (has('textur') ? [[100,113],[100,123],[100,133],[100,141],[100,149],[90,123],[110,123]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".9" fill="${b}"/>`).join('') : ''); top = 108; }
        else if (has('estrella')){ shape = `<path d="M100 106l5.5 16.5 16.5 5.5-16.5 5.5L100 150l-5.5-16.5L78 128l16.5-5.5z" ${W(1.8)}/><circle cx="100" cy="128" r="2" fill="${b}"/>`; top = 106; }
        else { shape = `<path d="M100 108c5 8 14 17 14 27a14 14 0 0 1-28 0c0-10 9-19 14-27z" ${W(1.8)}/>`; top = 108; }
        g = `<path d="M56 28C64 70 86 94 100 97 114 94 136 70 144 28" ${fine}/><ellipse cx="100" cy="101" rx="2.4" ry="4" ${L(1.4)}/><path d="M100 105V${top}" ${L(1.3)}/>${shape}`;
      }
      break;
    }
    case 'reloj': {
      const dama = has('dama'), R = dama ? 23 : 29, hw = dama ? 8 : 11;
      let straps = `<path d="M${100 - hw - 2} ${100 - R + 4}L${100 - hw} 24H${100 + hw}L${100 + hw + 2} ${100 - R + 4}" ${L(2)}/><path d="M${100 - hw - 2} ${100 + R - 4}L${100 - hw} 176H${100 + hw}L${100 + hw + 2} ${100 + R - 4}" ${L(2)}/>`;
      if (has('malla')){
        for (let y = 30; y < 100 - R; y += 5) straps += `<path d="M${100 - hw + 1} ${y}H${100 + hw - 1}" ${L(.7, b)}/>`;
        for (let y = 100 + R + 4; y <= 171; y += 5) straps += `<path d="M${100 - hw + 1} ${y}H${100 + hw - 1}" ${L(.7, b)}/>`;
      } else {
        for (let y = 140; y <= 166; y += 8) straps += `<circle cx="100" cy="${y}" r="1.4" ${L(1, b)}/>`;
      }
      const ticks = Array.from({length:12}, (_, k) => { const t = k * Math.PI / 6, r1 = R - 5, r2 = R - (k % 3 ? 7.5 : 10); return `<path d="M${fx(100 + r1 * Math.sin(t))} ${fx(100 - r1 * Math.cos(t))}L${fx(100 + r2 * Math.sin(t))} ${fx(100 - r2 * Math.cos(t))}" ${L(k % 3 ? .9 : 1.5, b)}/>`; }).join('');
      g = `${straps}<circle cx="100" cy="100" r="${R}" ${W(2.4)}/><circle cx="100" cy="100" r="${R - 3.5}" ${L(1, b)}/>${ticks}<path d="M100 100V${fx(100 - R * .55)}" ${L(2)}/><path d="M100 100L${fx(100 + R * .45)} ${fx(100 + R * .2)}" ${L(1.5)}/><circle cx="100" cy="100" r="2" fill="${a}"/><rect x="${100 + R + .5}" y="96" width="5" height="8" rx="1.6" ${L(1.5)}/>`;
      break;
    }
  }
  const shadow = sy ? `<ellipse cx="100" cy="${sy}" rx="44" ry="5" fill="#231C1E" opacity=".05"/>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 18 164 164"><g transform="translate(100 100) scale(1.1) translate(-100 -100)">${shadow}${g}</g></svg>`;
  const uri = 'data:image/svg+xml,' + encodeURIComponent(svg);
  artCache.set(key, uri);
  return uri;
}
const pic = p => p.img || art(p);

/* ── Fotos: se achican en el navegador antes de subirlas (JPEG; lado mayor 1200 px,
   las de Por completar 1600 px para poder leer la etiqueta de precio con zoom) ── */
const releaseURL = u => { if (u && u.startsWith('blob:')) URL.revokeObjectURL(u); };
function shrink(file, max = 1200){
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      try {
        const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(im.naturalWidth * k));
        c.height = Math.max(1, Math.round(im.naturalHeight * k));
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(b => b ? resolve({blob:b, url:URL.createObjectURL(b)}) : reject(new Error('No se pudo achicar la foto')), 'image/jpeg', .82);
      } catch (err){ URL.revokeObjectURL(url); reject(err); }
    };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    im.src = url;
  });
}
const isImage = f => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name);

/* ── Servidor ──
   api() manda y recibe JSON (o una foto) con el token; si la sesión venció, vuelve al ingreso. */
const API = '/api';
async function api(path, opts = {}){
  const headers = {...(opts.headers || {})};
  let data = opts.body;
  if (data != null && !(data instanceof Blob) && typeof data !== 'string'){ data = JSON.stringify(data); headers['Content-Type'] = 'application/json'; }
  if (TOKEN) headers.Authorization = 'Bearer ' + TOKEN;
  let res;
  try { res = await fetch(API + path, {method:opts.method || 'GET', headers, body:data}); }
  catch { throw Object.assign(new Error('No se pudo conectar con el sistema. Revisá la conexión a internet y probá de nuevo.'), {red:true}); }
  const out = await res.json().catch(() => ({}));
  if (res.status === 401 && TOKEN && path !== '/login'){
    sesionVencida();
    throw Object.assign(new Error(out.error || 'Tu sesión venció.'), {status:401, sesion:true});
  }
  if (!res.ok) throw Object.assign(new Error(out.error || 'Error del servidor. Probá de nuevo en un momento.'), {status:res.status});
  return out;
}
const apiFoto = (path, blob, method = 'POST') => api(path, {method, body:blob, headers:{'Content-Type':blob.type || 'image/jpeg'}});
const enc = encodeURIComponent;
/* Lo que manda el servidor, con los nombres cortos que usa la página */
const dePieza = r => ({id:r.id, c:r.codigo, n:r.nombre, m:r.material, cat:r.categoria, p:r.precio, s:r.estado, det:r.detalle || '', d:r.dias, o:r.id, ml:MAT[r.material].full, img:r.foto || null,
  res:r.reserva ? {who:r.reserva.cliente, sena:r.reserva.sena || 0, d:r.reserva.dias} : null});
const deVenta = r => ({id:r.id, c:r.codigo, n:r.nombre, m:r.material, cat:r.categoria, p:r.precio, pay:r.medio, t:r.hora, img:r.foto || null});
const dePendiente = r => ({id:r.id, num:r.numero, img:r.foto, m:r.material || null, cat:r.categoria || null, p:r.precio || 0, n:r.nombre || '', det:r.detalle || ''});
async function loadState(){
  const s = await api('/estado');
  P = s.piezas.map(dePieza);
  SALES = s.ventasHoy.map(deVenta);
  PENDING = s.pendientes.map(dePendiente);
  PAST = s.semana.slice(0, 6);
  ULT = s.ultimos || {};
  renderStock(); renderVentas(); refreshAll();
}
/* Mientras se espera al servidor el botón queda ocupado (así no se toca dos veces) */
function busy(btn, label){
  if (!btn) return () => {};
  const prev = btn.textContent;
  btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.textContent = label;
  return () => { if (btn.isConnected){ btn.disabled = false; btn.removeAttribute('aria-busy'); btn.textContent = prev; } };
}

/* ── Stock ── */
const st = {mat:null, cat:null, q:'', sort:'recent'};
function matches(p, useMat){
  if (useMat && st.mat && p.m !== st.mat) return false;
  if (st.cat && p.cat !== st.cat) return false;
  const q = norm(st.q.trim());
  return !q || norm(p.n + ' ' + p.c).includes(q);
}
const SORTS = {
  recent:(a, b) => a.d - b.d || b.o - a.o,
  'price-asc':(a, b) => a.p - b.p,
  'price-desc':(a, b) => b.p - a.p,
  code:(a, b) => a.c.localeCompare(b.c)
};
/* Próximo código de cada material: el servidor lleva la cuenta (contando las vendidas), así nunca se repite */
const nextCode = m => `${MAT[m].pre}-${String((ULT[m] || 0) + 1).padStart(3, '0')}`;
const autoName = x => `${CAT[x.cat].one} de ${MAT[x.m].name.toLowerCase()}`;
function renderFacts(){
  const reserved = P.filter(p => p.s === 'reservado').length;
  const value = P.reduce((s, p) => s + p.p, 0);
  $('#facts').innerHTML = `<div><dt>Piezas en stock</dt><dd>${P.length}</dd></div><div><dt>Reservadas</dt><dd>${reserved}</dd></div><div><dt>Valor en stock</dt><dd>${money(value)}</dd></div>`;
}
/* Los botones de material se crean una vez y después solo cambian sus números,
   así la burbuja puede deslizarse de uno a otro */
function renderMats(){
  const base = P.filter(p => matches(p, false));
  const items = [[null, 'Todas'], ...Object.entries(MAT).map(([k, v]) => [k, v.name])];
  const box = $('#mats');
  if (!box.querySelector('.mat')) box.innerHTML = '<span class="bubble" aria-hidden="true"></span>' + items.map(([k, label]) => `<button type="button" class="mat" data-m="${k || ''}">${label}<span class="n"></span></button>`).join('');
  items.forEach(([k]) => {
    const b = box.querySelector(`.mat[data-m="${k || ''}"]`);
    b.setAttribute('aria-pressed', String(st.mat === k));
    b.querySelector('.n').textContent = base.filter(p => !k || p.m === k).length;
  });
  placeBubble(box, box.querySelector('.mat[aria-pressed="true"]'));
}
function renderCats(){
  const box = $('#cats');
  if (!box.querySelector('.cat')){
    const items = [[null, 'Todas'], ...Object.entries(CAT).map(([k, v]) => [k, v.pl])];
    box.innerHTML = items.map(([k, label], i) => `<button type="button" class="cat" data-c="${k || ''}"><span class="cat-o" style="--mx:${(i * 137) % 300}px;--my:${(i * 91) % 300}px">${icono(k || 'todas')}</span>${label}</button>`).join('');
  }
  box.querySelectorAll('.cat').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.c || null) === st.cat)));
}
function renderGrid(highlight){
  const list = P.filter(p => matches(p, true)).sort(SORTS[st.sort]);
  const grid = $('#grid');
  if (!list.length){
    grid.innerHTML = `<div class="empty"><p class="empty-t">No hay piezas con esos filtros</p><p>Probá con otro material, otra categoría o una búsqueda más corta.</p><button type="button" class="btn btn-quiet" data-clear>Ver todas las piezas</button></div>`;
    return;
  }
  grid.innerHTML = list.map(p => `<button type="button" class="card${p.s === 'reservado' ? ' is-res' : ''}${highlight && highlight.has(p.c) ? ' is-new' : ''}" data-code="${p.c}">
    <span class="well">${p.img ? `<span class="slot-foto"><img src="${p.img}" alt="" width="200" height="200" loading="lazy" decoding="async"></span>` : `<img src="${art(p)}" alt="" width="200" height="200" loading="lazy" decoding="async">`}</span>
    <span class="etq">
      <span class="etq-code">${p.c}</span>
      <span class="c-name">${txt(p.n)}</span>
      <span class="c-mat">${p.ml}</span>
      <span class="c-price">${money(p.p)}</span>
      ${p.s === 'reservado' ? '<span class="etq-res">Reservada</span>' : ''}
    </span>
  </button>`).join('');
  if (highlight) setTimeout(() => document.querySelectorAll('.card.is-new').forEach(c => c.classList.remove('is-new')), 2600);
}
function renderStock(highlight){ renderFacts(); renderMats(); renderCats(); renderGrid(highlight); }
function clearSearch(){ $('#q').value = ''; st.q = ''; $('#qClear').hidden = true; }
function clearFilters(){
  Object.assign(st, {mat:null, cat:null, sort:'recent'});
  clearSearch(); $('#sort').value = 'recent';
  renderStock();
}

/* ── Por completar ── */
const ART_ES = {material:'el', 'tipo de pieza':'el', precio:'el'};
const missList = x => [!x.m && 'material', !x.cat && 'tipo de pieza', !x.p && 'precio'].filter(Boolean);
function missText(x, full){
  const miss = missList(x);
  if (miss.length === 3) return full ? 'Faltan material, tipo de pieza y precio' : 'Sin datos todavía';
  if (miss.length === 1) return `Falta ${ART_ES[miss[0]]} ${miss[0]}`;
  return miss.length ? `Faltan ${miss[0]} y ${miss[1]}` : '';
}
const knownText = x => [x.m && MAT[x.m].full, x.cat && CAT[x.cat].one, x.p && money(x.p)].filter(Boolean).join(', ');
const ARROW_R = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg>';
const CHECK_BIG = '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="32" cy="32" r="28"/><path d="M20 33l8 8 16-17"/></svg>';
/* Cada foto es una tarjeta blanca: la foto, su número, lo que ya tiene, lo que le falta y "Completar" */
function tileHTML(x){
  const known = knownText(x);
  return `<button type="button" class="ptile" data-id="${x.id}">
    <span class="pwell"><img src="${x.img}" alt="" width="200" height="200" loading="lazy" decoding="async"></span>
    <span class="pt-body">
      <span class="pt-name">Foto ${x.num}</span>
      ${known ? `<span class="pt-known">${known}</span>` : ''}
      <span class="pt-miss">${missText(x)}</span>
      <span class="pt-go">Completar ${ARROW_R}</span>
    </span>
  </button>`;
}
function renderPend(){
  const n = PENDING.length;
  $('#pendLead').textContent = n
    ? 'Fotos de piezas nuevas que todavía no tienen sus datos.'
    : 'Acá aparecen las fotos de las piezas nuevas hasta que les pongas sus datos.';
  $('#pendStart').hidden = !n;
  $('#pendInfo').hidden = !n;
  $('#pendInfo').textContent = n === 1 ? 'Queda 1 foto por completar' : `Quedan ${n} fotos por completar`;
  $('#btnComplete').disabled = !n;
  $('#pgrid').innerHTML = n ? PENDING.map(tileHTML).join('') : `<div class="empty pend-empty">${CHECK_BIG}<p class="empty-t">No hay fotos para completar</p><p>Cuando lleguen piezas nuevas, sacales una foto y subila acá.</p><button type="button" class="btn btn-primary btn-xl" data-up>Subir fotos</button></div>`;
}
function updateCounts(){
  const n = PENDING.length;
  $('#pendCount').textContent = n || '';
  $('#pendCount').hidden = !n;
  placeBubble($('#tabs'), $('.tab[aria-selected="true"]'), true);   /* el número cambia el ancho de la pestaña */
}
function refreshAll(){ renderPend(); updateCounts(); }

const optList = (entries, first) => `<option value="">${first}</option>` + entries.map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
function removePending(ids){
  const removed = [];
  PENDING.forEach((x, i) => { if (ids.includes(x.id)) removed.push([x, i]); });
  for (let i = PENDING.length - 1; i >= 0; i--) if (ids.includes(PENDING[i].id)) PENDING.splice(i, 1);
  return removed;
}
function restorePending(removed){ removed.forEach(([x, i]) => PENDING.splice(Math.min(i, PENDING.length), 0, x)); refreshAll(); }

$('#pgrid').addEventListener('click', e => {
  if (e.target.closest('[data-up]')){ openUpload(); return; }
  const t = e.target.closest('.ptile'); if (t) openEditor(+t.dataset.id);
});
$('#btnComplete').addEventListener('click', () => { if (PENDING.length) openEditor(PENDING[0].id); });
$('#btnUpload2').addEventListener('click', () => openUpload());

/* ── Ventas ── */
let week = [];
const arrow = up => `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${up ? 'M6 10V2M2.5 5.5 6 2l3.5 3.5' : 'M6 2v8M2.5 6.5 6 10l3.5-3.5'}"/></svg>`;
function breakdown(entries, total){
  return entries.map(([label, v]) => `<div class="mrow"><div class="mrow-top"><span>${esc(label)}</span><span class="v"><span class="pc">${total ? Math.round(v / total * 100) : 0}%</span>${money(v)}</span></div><div class="track"><span style="width:${total ? (v / total * 100).toFixed(1) : 0}%"></span></div></div>`).join('');
}
function renderVentas(){
  const total = SALES.reduce((s, v) => s + v.p, 0), count = SALES.length;
  const yesterday = PAST[PAST.length - 1];
  const delta = yesterday ? Math.round((total - yesterday) / yesterday * 100) : 0;
  $('#vDate').textContent = cap(`${DAYS[TODAY.getDay()]} ${TODAY.getDate()} de ${MONTHS[TODAY.getMonth()]}`);
  $('#hTotal').textContent = money(total);
  $('#hDelta').innerHTML = `${arrow(delta >= 0)}<span>${Math.abs(delta)}% ${delta >= 0 ? 'más' : 'menos'} que ayer (${money(yesterday)})</span>`;
  const best = SALES.reduce((a, v) => (!a || v.p > a.p ? v : a), null);
  $('#vFacts').innerHTML = `<div><dt>Ventas</dt><dd>${count}</dd></div><div><dt>Ticket promedio</dt><dd>${money(count ? total / count : 0)}</dd></div><div><dt>Mejor venta</dt><dd>${best ? money(best.p) : '$0'}</dd></div>`;

  $('#ledgerCount').textContent = plural(count, 'venta', 'ventas');
  $('#tkTotal').textContent = money(total);
  $('#tkDate').textContent = `${cap(DAYS[TODAY.getDay()])} ${TODAY.getDate()} de ${MONTHS[TODAY.getMonth()]} de ${TODAY.getFullYear()}`;
  $('#ledger').innerHTML = [...SALES].reverse().map(v => `<div class="row${v.fresh ? ' is-new' : ''}" role="row">
    <span class="r-time" role="cell">${v.t}</span>
    <span class="r-piece" role="cell"><img class="r-thumb" src="${pic(v)}" alt="" width="48" height="48" decoding="async"><span class="r-txt"><span class="r-name">${txt(v.n)}</span><span class="r-code">${v.c}</span><span class="r-sub"><span>${v.c}</span><span>${v.pay}</span><span>${v.t}</span></span></span></span>
    <span class="r-mat" role="cell">${MAT[v.m].full}</span>
    <span class="r-pay" role="cell">${v.pay}</span>
    <span class="r-amt" role="cell">${money(v.p)}</span>
  </div>`).join('');

  const vals = [...PAST, total];
  week = vals.map((v, i) => ({v, k:6 - i, d:daysAgo(6 - i)}));
  const step = 500000, max = Math.max(step, Math.ceil(Math.max(...vals) / step) * step);
  const label = x => x.k === 0 ? 'Hoy' : `${cap(DAYS[x.d.getDay()])} ${x.d.getDate()}`;
  $('#wkSub').textContent = `${money(vals.reduce((s, v) => s + v, 0))} en la semana`;
  $('#wkPlot').innerHTML = [0, max / 2, max].map(t => `<div class="wk-tick${t ? '' : ' base'}" style="bottom:${t / max * 100}%" aria-hidden="true"><span>$${short(t)}</span></div>`).join('') +
    week.map((x, i) => `<div class="wk-col${x.k === 0 ? ' today' : ''}" role="listitem" tabindex="0" data-i="${i}" aria-label="${label(x)}: ${money(x.v)}"><span class="wk-bar" style="height:${Math.max(1.5, x.v / max * 100).toFixed(1)}%"></span></div>`).join('');
  $('#wkAxis').innerHTML = week.map(x => `<span class="${x.k === 0 ? 'today' : ''}">${x.k === 0 ? 'Hoy' : DAYS_SHORT[x.d.getDay()]}</span>`).join('');
  $('#wkRows').innerHTML = week.map(x => `<tr><td>${label(x)}</td><td>${money(x.v)}</td></tr>`).join('');

  const byPay = {}, byMat = {};
  SALES.forEach(v => { byPay[v.pay] = (byPay[v.pay] || 0) + v.p; byMat[MAT[v.m].name] = (byMat[MAT[v.m].name] || 0) + v.p; });
  $('#byPay').innerHTML = breakdown(Object.entries(byPay).sort((a, b) => b[1] - a[1]), total);
  $('#byMat').innerHTML = breakdown(Object.entries(byMat).sort((a, b) => b[1] - a[1]), total);
}

/* Tooltip de las barras: mouse, teclado y toque */
const tip = $('#wkTip'), plot = $('#wkPlot');
function showTip(col){
  const x = week[+col.dataset.i]; if (!x) return;
  const box = $('#week').getBoundingClientRect(), bar = col.firstElementChild.getBoundingClientRect();
  tip.innerHTML = `<b>${money(x.v)}</b><span>${x.k === 0 ? 'Hoy' : cap(DAYS[x.d.getDay()])}, ${x.d.getDate()} de ${MONTHS[x.d.getMonth()]}</span>`;
  const half = tip.offsetWidth / 2, center = bar.left + bar.width / 2 - box.left;
  tip.style.left = Math.min(Math.max(center, half), box.width - half) + 'px';
  tip.style.top = (bar.top - box.top) + 'px';
  tip.classList.add('on');
}
const hideTip = () => tip.classList.remove('on');
plot.addEventListener('pointerover', e => { const c = e.target.closest('.wk-col'); if (c && e.pointerType === 'mouse') showTip(c); });
plot.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hideTip(); });
plot.addEventListener('click', e => { const c = e.target.closest('.wk-col'); if (c) showTip(c); });
plot.addEventListener('focusin', e => { const c = e.target.closest('.wk-col'); if (c) showTip(c); });
plot.addEventListener('focusout', hideTip);
document.addEventListener('click', e => { if (!plot.contains(e.target)) hideTip(); });

/* ── Vistas: se pueden abrir directo con #stock, #por-completar o #ventas, y se recuerda la última ── */
const VIEWS = ['stock', 'pend', 'ventas'];
const HASH = {stock:'stock', pend:'por-completar', ventas:'ventas'};
/* Burbuja de vidrio que se desliza bajo la opción activa (secciones y materiales) */
function placeBubble(box, el, instant){
  const bub = box && box.querySelector(':scope > .bubble');
  if (!bub || !el || !el.offsetWidth) return;
  bub.classList.toggle('instant', !!instant || !bub.dataset.placed);
  bub.style.width = el.offsetWidth + 'px';
  bub.style.transform = `translateX(${el.offsetLeft}px)`;
  bub.dataset.placed = '1';
}
function placeBubbles(instant){
  placeBubble($('#tabs'), $('.tab[aria-selected="true"]'), instant);
  placeBubble($('#mats'), $('#mats .mat[aria-pressed="true"]'), instant);
}
function setView(v){
  document.querySelectorAll('.tab').forEach(t => {
    const on = t.dataset.view === v;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
  });
  VIEWS.forEach(k => { $('#view-' + k).hidden = k !== v; });
  hideTip();
  if (window.scrollY > 0) window.scrollTo({top:0, behavior:'auto'});
  placeBubble($('#tabs'), $('#tab-' + v));
  if (v === 'stock') placeBubble($('#mats'), $('#mats .mat[aria-pressed="true"]'), true);
  try { localStorage.setItem('sm-vista', v); } catch {}
  try { history.replaceState(null, '', '#' + HASH[v]); } catch {}
}
function initialView(){
  const h = decodeURIComponent(location.hash.slice(1));
  const fromHash = VIEWS.find(k => HASH[k] === h);
  if (fromHash) return fromHash;
  try { const s = localStorage.getItem('sm-vista'); if (VIEWS.includes(s)) return s; } catch {}
  return 'stock';
}
$('#tabs').addEventListener('click', e => { const t = e.target.closest('.tab'); if (t) setView(t.dataset.view); });
$('#tabs').addEventListener('keydown', e => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  const tabs = [...document.querySelectorAll('.tab')], i = tabs.indexOf(document.activeElement);
  if (i < 0) return;
  e.preventDefault();
  const j = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
  tabs[j].focus(); setView(tabs[j].dataset.view);
});
/* Si cambia la dirección (#ventas, #por-completar o #stock), se muestra esa sección */
addEventListener('hashchange', () => {
  const v = VIEWS.find(k => HASH[k] === decodeURIComponent(location.hash.slice(1)));
  if (v && $('#tab-' + v).getAttribute('aria-selected') !== 'true') setView(v);
});

/* ── Hoja: ficha de pieza, subida de fotos y editor ──
   Mientras está abierta, todo lo de atrás queda inerte (el foco no se escapa). */
const overlay = $('#overlay'), sheet = $('#sheet'), body = $('#sheetBody'), live = $('#sheetLive');
const root = document.documentElement, isOpen = () => root.classList.contains('locked');
let lastFocus = null, closeTimer = 0, mode = '';
const plain = s => String(s).replace(/<[^>]+>/g, '');
/* Anuncia un cambio a los lectores de pantalla sin moverles el foco */
function say(t){ live.textContent = ''; setTimeout(() => { live.textContent = t; }, 80); }
function setInert(on){
  [...document.body.children].forEach(el => {
    if (el === overlay || el.id === 'toast' || /^(SCRIPT|STYLE|LINK|META|TITLE)$/.test(el.tagName)) return;
    el.inert = on;
  });
}
function openSheet(html, label, wide){
  clearTimeout(closeTimer);
  body.innerHTML = html;
  sheet.setAttribute('aria-label', label);
  sheet.classList.toggle('wide', !!wide);
  if (!isOpen()){
    if (overlay.hidden) lastFocus = toastEl.contains(document.activeElement) ? null : document.activeElement;
    overlay.hidden = false;
    root.classList.add('locked');
    setInert(true);
    requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('open')));
  }
  sheet.scrollTop = 0;
  sheet.focus({preventScroll:true});
}
/* Al cerrar, el foco vuelve a lo que abrió la hoja; si eso ya no está (pieza vendida,
   foto completada, otra pestaña), a la misma tarjeta re-dibujada o al contenido */
function restoreFocus(back){
  const key = back && back.dataset ? (back.dataset.code || back.dataset.id) : '';
  let el = back && back.isConnected && back.getClientRects().length ? back : null;
  if (!el && key) el = document.querySelector(`.card[data-code="${key}"], .ptile[data-id="${key}"]`);
  (el || $('#contenido')).focus({preventScroll:true});
}
function closeSheet(force){
  if (!isOpen()) return;
  if (mode === 'upload' && up.sending){ toast('Esperá a que terminen de subirse las fotos.'); return; }
  if (!force && mode === 'upload' && up.rows.length){ upAskDiscard(); return; }
  if (mode === 'editor') edKeep();
  if (mode === 'editor' || mode === 'finished') freshCodes.clear();
  overlay.classList.remove('open');
  root.classList.remove('locked');
  setInert(false);
  mode = '';
  live.textContent = '';
  const back = lastFocus;
  lastFocus = null;
  closeTimer = setTimeout(() => { overlay.hidden = true; body.innerHTML = ''; sheet.style.transform = ''; }, 200);
  requestAnimationFrame(() => { if (!isOpen()) restoreFocus(back); });
}

/* En el celular la hoja se cierra deslizándola hacia abajo desde la manija */
const grab = $('.grab');
let drag = null;
grab.addEventListener('pointerdown', e => {
  if (getComputedStyle(grab).display === 'none') return;
  drag = {y:e.clientY, dy:0};
  grab.setPointerCapture(e.pointerId);
  sheet.classList.add('dragging');
});
grab.addEventListener('pointermove', e => {
  if (!drag) return;
  drag.dy = Math.max(0, e.clientY - drag.y);
  sheet.style.transform = `translateY(${drag.dy}px)`;
});
function endDrag(){
  if (!drag) return;
  const dy = drag.dy; drag = null;
  sheet.classList.remove('dragging');
  if (dy > 90) closeSheet();
  requestAnimationFrame(() => { sheet.style.transform = ''; });
}
grab.addEventListener('pointerup', endDrag);
grab.addEventListener('pointercancel', endDrag);

/* Ficha de una pieza del stock */
const actionsHTML = p => `<button type="button" class="btn btn-primary btn-block" data-act="sell">Registrar venta</button>
  <button type="button" class="btn btn-quiet btn-block" data-act="${p.s === 'reservado' ? 'unreserve' : 'reserve'}">${p.s === 'reservado' ? 'Quitar reserva' : 'Reservar'}</button>
  <div class="pd-links"><button type="button" class="link" data-act="edit">Editar datos</button><label class="link" for="pdPhoto">${p.img ? 'Cambiar foto' : 'Subir foto'}</label></div>
  <input type="file" id="pdPhoto" name="pdPhoto" class="sr-only" accept="image/*">`;
const sellHTML = p => `${p.s === 'reservado' && p.res && p.res.sena ? `<p class="tipbox">${esc(p.res.who)} dejó una seña de ${money(p.res.sena)}. Resta cobrar ${money(Math.max(0, p.p - p.res.sena))}.</p>` : ''}<fieldset class="pay"><legend>Medio de pago</legend><div class="opts">${PAYS.map((m, i) => `<label class="opt"><input type="radio" name="pay" id="pay-${i}" value="${m}"${i ? '' : ' checked'}><span>${m}</span></label>`).join('')}</div></fieldset>
  <button type="button" class="btn btn-primary btn-block" data-act="confirm">Confirmar venta por ${money(p.p)}</button>
  <button type="button" class="btn btn-text" data-act="back">Volver</button>`;
const reserveHTML = p => `<div class="pd-form">
  <div class="field"><label for="rsWho">Para quién</label><input class="input" id="rsWho" name="rsWho" autocomplete="off" spellcheck="false" enterkeyhint="done" placeholder="Nombre del cliente…"></div>
  <div class="field"><label for="rsSena">Seña <span class="opt-l">(opcional)</span></label><div class="money"><span aria-hidden="true">$</span><input class="input" id="rsSena" name="rsSena" inputmode="numeric" autocomplete="off" enterkeyhint="done" placeholder="0" data-money></div></div>
  <p class="err" id="rsErr" hidden>Escribí el nombre del cliente para guardar la reserva.</p>
  <p class="err" id="rsSenaErr" hidden>La seña no puede ser mayor que el precio (${money(p.p)}).</p>
  <button type="button" class="btn btn-primary btn-block" data-act="reserve-ok">Confirmar reserva</button>
  <button type="button" class="btn btn-text" data-act="back">Volver</button>
</div>`;
const editHTML = p => `<div class="pd-form">
  <div class="field"><label for="pdName">Nombre</label><input class="input" id="pdName" name="pdName" autocomplete="off" enterkeyhint="done" value="${esc(p.n)}"></div>
  <div class="ed-two">
    <div class="field"><label for="pdPrice">Precio</label><div class="money"><span aria-hidden="true">$</span><input class="input" id="pdPrice" name="pdPrice" inputmode="numeric" autocomplete="off" enterkeyhint="done" data-money value="${p.p.toLocaleString('es-AR')}"></div></div>
    <div class="field"><label for="pdCat">Categoría</label><select class="input" id="pdCat" name="pdCat">${Object.entries(CAT).map(([k, v]) => `<option value="${k}"${k === p.cat ? ' selected' : ''}>${v.one}</option>`).join('')}</select></div>
  </div>
  <div class="field"><label for="pdDet">Detalle <span class="opt-l">(opcional)</span></label><input class="input" id="pdDet" name="pdDet" autocomplete="off" enterkeyhint="done" placeholder="Ej.: talle 16, 45 cm, 3,1 g…" value="${esc(p.det || '')}"></div>
  <p class="ed-code">El código ${p.c} y el material no cambian.</p>
  <p class="err" id="pdErr" hidden>Poné un precio mayor a cero para guardar.</p>
  <button type="button" class="btn btn-primary btn-block" data-act="edit-ok">Guardar cambios</button>
  <button type="button" class="btn btn-text" data-act="back">Cancelar</button>
</div>`;
function specsOf(p){
  const rows = [];
  if (p.s === 'reservado' && p.res) rows.push(['Reservada para', `${p.res.who}, ${p.res.sena ? `seña de ${money(p.res.sena)}` : 'sin seña'}, ${since(p.res.d)}`]);
  rows.push(['Material', p.ml], ['Categoría', CAT[p.cat].one]);
  if (p.det) rows.push(['Detalle', p.det]);
  rows.push(['Ingreso', p.d === 0 ? 'Hoy' : longDate(daysAgo(p.d))]);
  return rows;
}
function pieceHTML(p){
  return `<div class="pd" data-code="${p.c}">
    <div class="pd-well"><img src="${pic(p)}" alt="${p.img ? 'Foto' : 'Ilustración'} de ${esc(p.n)}" decoding="async"></div>
    <div class="pd-info">
      <p class="pd-code">${p.c}</p>
      <h2 class="pd-name">${txt(p.n)}</h2>
      <p class="pd-price">${money(p.p)}</p>
      <p class="state ${p.s}">${p.s === 'reservado' ? 'Reservada' : 'Disponible'}</p>
      <dl class="specs">${specsOf(p).map(([k, v]) => `<div><dt>${k}</dt><dd>${txt(v)}</dd></div>`).join('')}</dl>
      <div class="pd-actions">${actionsHTML(p)}</div>
    </div>
  </div>`;
}
function openPiece(code){
  const p = P.find(x => x.c === code);
  if (p){ openSheet(pieceHTML(p), p.n); mode = 'piece'; }
}
function rerenderPiece(p){ body.innerHTML = pieceHTML(p); sheet.setAttribute('aria-label', p.n); sheet.focus({preventScroll:true}); }
/* Errores de formulario: el mensaje se asocia al campo solo mientras se muestra */
function showErr(input, id){
  input.setAttribute('aria-invalid', 'true');
  input.setAttribute('aria-describedby', id);
  $('#' + id).hidden = false;
  input.focus();
}
function clearErr(input){
  const id = input.getAttribute('aria-describedby');
  input.removeAttribute('aria-invalid');
  input.removeAttribute('aria-describedby');
  if (id) $('#' + id).hidden = true;
}
async function sell(p, pay, btn){
  const done = busy(btn, 'Registrando la venta…');
  let r;
  try { r = await api(`/piezas/${enc(p.c)}/vender`, {method:'POST', body:{medio:pay}}); }
  catch (err){ done(); if (!err.sesion) toast(err.message); return; }
  const idx = P.indexOf(p);
  SALES.forEach(s => { delete s.fresh; });
  const sale = {...deVenta(r.venta), fresh:true};
  SALES.push(sale);
  if (idx > -1) P.splice(idx, 1);
  closeSheet(true);
  renderStock(); renderVentas(); renderPend();
  toast(`Venta de ${p.c} registrada`, [
    ['Deshacer', async () => {
      let u;
      try { u = await api(`/ventas/${sale.id}/deshacer`, {method:'POST'}); }
      catch (err){ if (!err.sesion) toast(err.message); return; }
      const i = SALES.indexOf(sale); if (i > -1) SALES.splice(i, 1);
      P.splice(Math.min(Math.max(idx, 0), P.length), 0, dePieza(u.pieza));
      renderStock(); renderVentas(); renderPend();
      toast(`Venta de ${p.c} anulada`);
    }],
    ['Ver ventas', () => setView('ventas')]
  ]);
}
async function changePhoto(file){
  const p = P.find(x => x.c === body.querySelector('.pd')?.dataset.code);
  if (!p || !file) return;
  let foto;
  try { foto = await shrink(file); }
  catch { toast('No se pudo abrir esa foto. Probá con un JPG.'); return; }
  toast('Subiendo la foto…');
  try {
    const r = await apiFoto(`/piezas/${enc(p.c)}/foto`, foto.blob, 'PUT');
    Object.assign(p, dePieza(r.pieza));
  } catch (err){ if (!err.sesion) toast(err.message); return; }
  finally { releaseURL(foto.url); }
  if (body.querySelector('.pd')?.dataset.code === p.c) rerenderPiece(p);
  renderGrid();
  toast(`Foto de ${p.c} actualizada`);
}

/* Subir fotos: sin datos obligatorios, todas a Por completar */
const up = {rows:[], seq:0, confirming:false, sending:false, sent:0, total:0};
const upQueue = [];
let upWorking = false;
function uploadHTML(){
  return `<div class="ld">
    <div class="ld-head">
      <h2 class="np-title">Subir fotos</h2>
      <p class="ld-lead">Subilas todas juntas, sin completar nada. Quedan en Por completar y les cargás los datos cuando tengas un rato.</p>
    </div>
    <p class="tipbox">Conviene sacar cada foto con la etiqueta de precio a la vista. Así después completás los datos mirando la foto, sin ir a buscar la pieza.</p>
    <div class="drop" id="drop">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5h3.2l1.8-2.7h7l1.8 2.7h3.2v10.7h-17z"/><circle cx="12" cy="13.6" r="3.6"/></svg>
      <p class="drop-t">${coarse ? 'Elegí las fotos de la galería o sacá una' : 'Arrastrá las fotos acá o elegilas'}</p>
      <p class="drop-s">Podés subir cientos de una vez. Se achican solas para que pesen poco.</p>
      <div class="drop-btns">${coarse ? '<label class="btn btn-quiet" for="upCam">Sacar foto</label>' : ''}<label class="btn btn-primary" for="upFiles">Elegir fotos</label></div>
      <input type="file" id="upFiles" name="upFiles" class="sr-only" accept="image/*" multiple>
      <input type="file" id="upCam" name="upCam" class="sr-only" accept="image/*" capture="environment">
    </div>
    <div class="up-opt">
      <span class="up-opt-l">¿Son todas del mismo material o del mismo tipo de pieza? Podés elegirlo ahora; si no, lo elegís después en cada foto.</span>
      <select class="input input-sm" id="upMat" name="upMat" aria-label="Material para todas">${optList(Object.entries(MAT).map(([k, v]) => [k, v.full]), 'Material sin definir')}</select>
      <select class="input input-sm" id="upCat" name="upCat" aria-label="Tipo de pieza para todas">${optList(Object.entries(CAT).map(([k, v]) => [k, v.one]), 'Tipo de pieza sin definir')}</select>
    </div>
    <p class="ld-errmsg" id="upErr" hidden>Las fotos marcadas con ! no se pudieron abrir y no se van a agregar. Si son del iPhone (HEIC), mandalas como JPG.</p>
    <div class="up-grid" id="upGrid"></div>
    <div class="ld-foot" id="upFoot"></div>
  </div>`;
}
const utHTML = r => `<div class="ut" data-id="${r.id}"><div class="ut-img${r.status === 'processing' ? ' busy' : ''}">${r.img ? `<img src="${r.img}" alt="" decoding="async">` : r.status === 'error' ? '<span class="ld-err-ico" aria-hidden="true">!</span>' : ''}</div><button type="button" class="ut-x" data-act="up-remove" aria-label="Quitar la foto ${r.id}">${xIcon}</button></div>`;
function openUpload(){
  up.confirming = false;
  openSheet(uploadHTML(), 'Subir fotos', true);
  mode = 'upload';
  $('#upGrid').innerHTML = up.rows.map(utHTML).join('');
  upFoot();
  if (finePointer) $('#upFiles').focus({preventScroll:true});
}
function upAdd(files){
  const imgs = [...files].filter(isImage).sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric:true}));
  if (!imgs.length){ if (files.length) toast('Elegí archivos de imagen (JPG, PNG o HEIC).'); return; }
  const fresh = imgs.map(file => ({id:++up.seq, file, status:'processing', img:''}));
  up.rows.push(...fresh);
  up.confirming = false;
  $('#upGrid').insertAdjacentHTML('beforeend', fresh.map(utHTML).join(''));
  upFoot();
  upQueue.push(...fresh);
  if (!upWorking) upWork();
}
async function upWork(){
  upWorking = true;
  while (upQueue.length){
    const r = upQueue.shift();
    if (!up.rows.includes(r)) continue;
    try { const s = await shrink(r.file, 1600); r.img = s.url; r.blob = s.blob; r.status = 'ready'; }
    catch { r.status = 'error'; }
    r.file = null;
    if (!up.rows.includes(r)){ releaseURL(r.img); continue; }
    const el = body.querySelector(`.ut[data-id="${r.id}"]`);
    if (el) el.outerHTML = utHTML(r);
    upFoot();
  }
  upWorking = false;
}
function upRemove(id){
  if (up.sending) return;
  const r = up.rows.find(x => x.id === id); if (!r) return;
  up.rows = up.rows.filter(x => x !== r);
  releaseURL(r.img);
  body.querySelector(`.ut[data-id="${id}"]`)?.remove();
  upFoot();
}
function upDiscard(){ up.rows.forEach(r => releaseURL(r.img)); up.rows = []; upQueue.length = 0; up.confirming = false; }
function upFoot(){
  const foot = $('#upFoot'); if (!foot || up.confirming) return;
  if (up.sending){
    foot.innerHTML = `<span class="ld-sum">Subiendo ${Math.min(up.sent + 1, up.total)} de ${up.total}… No cierres esta ventana.</span><button type="button" class="btn btn-primary" disabled>Subiendo fotos…</button>`;
    return;
  }
  const total = up.rows.length, ready = up.rows.filter(r => r.status === 'ready').length, bad = up.rows.filter(r => r.status === 'error').length, busy = total - ready - bad;
  let msg;
  if (!total) msg = 'Todavía no elegiste fotos';
  else if (busy) msg = `Procesando ${ready + bad} de ${total} fotos…`;
  else msg = plural(ready, 'foto lista', 'fotos listas') + (bad ? `, ${bad} no se ${bad === 1 ? 'pudo' : 'pudieron'} abrir` : '');
  const label = busy ? 'Procesando fotos…' : ready ? `Agregar ${plural(ready, 'foto', 'fotos')}` : 'Agregar fotos';
  foot.innerHTML = `<span class="ld-sum">${msg}</span><button type="button" class="btn btn-primary" data-act="up-commit"${ready && !busy ? '' : ' disabled'}>${label}</button>`;
  const err = $('#upErr'); if (err) err.hidden = !bad;
}
function upAskDiscard(){
  up.confirming = true;
  const n = up.rows.length, foot = $('#upFoot');
  foot.innerHTML = `<span class="ld-sum warn">¿Descartar ${n === 1 ? 'la foto elegida' : `las ${n} fotos elegidas`}? Todavía no se agregaron.</span><span class="ld-btns"><button type="button" class="btn btn-quiet" data-act="up-keep">Seguir</button><button type="button" class="btn btn-primary" data-act="up-discard">Descartar</button></span>`;
  foot.querySelector('[data-act="up-keep"]').focus();
}
async function upCommit(){
  const ready = up.rows.filter(r => r.status === 'ready');
  if (up.sending || !ready.length || up.rows.some(r => r.status === 'processing')) return;
  const q = new URLSearchParams();
  if ($('#upMat').value) q.set('material', $('#upMat').value);
  if ($('#upCat').value) q.set('categoria', $('#upCat').value);
  const qs = q.toString() ? '?' + q : '';
  up.sending = true; up.sent = 0; up.total = ready.length; upFoot();
  const added = [];
  let fallo = null;
  for (const r of ready){   /* de a una, para no trabar la conexión del local */
    try {
      const res = await apiFoto('/pendientes' + qs, r.blob);
      added.push(dePendiente(res.pendiente));
      up.rows = up.rows.filter(x => x !== r);
      releaseURL(r.img);
      body.querySelector(`.ut[data-id="${r.id}"]`)?.remove();
    } catch (err){ fallo = err; break; }
    up.sent++; upFoot();
  }
  up.sending = false;
  if (added.length){ PENDING.push(...added); refreshAll(); }
  if (fallo){
    if (fallo.sesion) return;   /* la sesión venció: ya se muestra el ingreso */
    upFoot();
    toast(added.length ? `Se subieron ${added.length}. ${fallo.message}` : fallo.message);
    return;
  }
  up.rows = []; upQueue.length = 0;
  closeSheet(true);
  setView('pend');
  toast(`${plural(added.length, 'foto agregada', 'fotos agregadas')} a Por completar`, [['Completar ahora', () => openEditor(added[0].id)]]);
}

/* Editor: completar las fotos de a una, en tres pasos (material, tipo de pieza y precio).
   "Guardar" pide los tres; "Dejar para después" y cerrar guardan lo que haya y siguen.
   Cuando tiene los tres datos pasa al stock con su código. */
let edId = null;
const freshCodes = new Set();   /* piezas que pasaron al stock en esta tanda, para resaltarlas */
function chipsHTML(name, entries, cur){
  return entries.map(([k, label]) => `<label class="opt"><input type="radio" name="${name}" id="${name}-${k}" value="${k}"${k === cur ? ' checked' : ''}><span>${label}</span></label>`).join('');
}
/* Material con su muestra de color y tipo de pieza con su ícono en círculo de mármol, para reconocerlos de un vistazo */
const catIcon = k => `<span class="ico-o" aria-hidden="true">${icono(k)}</span>`;
const matLabel = (k, v) => `<i class="sw sw-${k}" aria-hidden="true"></i>${v.name}`;
const PASOS = {m:['pasoMat', 'el material'], cat:['pasoCat', 'el tipo de pieza'], p:['pasoPre', 'el precio']};
const noticeHTML = n => n ? `<p class="ed-notice${n.ok ? ' ok' : ''}"><span>${n.html}</span></p>` : '';
const pasoL = (n, label) => `<span class="paso-l"><span class="paso-n" aria-hidden="true">${n}</span>${label}<span class="paso-falta" aria-hidden="true">Falta</span></span>`;
function editorHTML(x, notice){
  const pos = PENDING.indexOf(x) + 1, total = PENDING.length;
  return `<div class="ed" data-id="${x.id}">
    <button type="button" class="ed-photo" id="edPhoto" aria-pressed="false" aria-label="Ver la foto ${x.num} más grande"><img src="${x.img}" alt="" decoding="async"><span class="ed-hint" aria-hidden="true">${finePointer ? 'Hacé clic en la foto para verla más grande' : 'Tocá la foto para verla más grande'}</span></button>
    <div class="ed-form">
      ${noticeHTML(notice)}
      <div class="ed-head"><h2 class="np-title">Foto ${x.num}</h2><p class="ld-lead">${total > 1 ? `${pos} de ${total} por completar` : 'Es la última por completar'}</p></div>
      <fieldset class="paso" id="pasoMat"><legend>${pasoL(1, 'Material')}</legend><div class="opts opts-big">${chipsHTML('edMat', Object.entries(MAT).map(([k, v]) => [k, matLabel(k, v)]), x.m)}</div></fieldset>
      <fieldset class="paso" id="pasoCat"><legend>${pasoL(2, 'Tipo de pieza')}</legend><div class="opts opts-cat">${chipsHTML('edCat', Object.entries(CAT).map(([k, v]) => [k, catIcon(k) + v.one]), x.cat)}</div></fieldset>
      <div class="paso" id="pasoPre"><label for="edPrice">${pasoL(3, 'Precio')}</label><div class="money money-big"><span aria-hidden="true">$</span><input class="input" id="edPrice" name="edPrice" inputmode="numeric" autocomplete="off" enterkeyhint="done" data-money value="${x.p ? x.p.toLocaleString('es-AR') : ''}"></div></div>
      <details class="ed-mas"${x.det || x.n ? ' open' : ''}><summary>Agregar detalle o nombre <span class="opt-l">(si querés)</span></summary>
        <div class="ed-mas-in">
          <div class="field"><label for="edDet">Detalle</label><input class="input" id="edDet" name="edDet" autocomplete="off" enterkeyhint="done" placeholder="Ej.: talle 16, 45 cm" value="${esc(x.det)}"></div>
          <div class="field"><label for="edName">Nombre</label><input class="input" id="edName" name="edName" autocomplete="off" enterkeyhint="done" value="${esc(x.n)}"></div>
        </div>
      </details>
      <p class="ed-code" id="edCode"></p>
      <div class="ed-foot" id="edFoot">${edFootHTML()}</div>
    </div>
  </div>`;
}
function edFootHTML(){
  return `<p class="ed-falta" id="edFalta" role="alert"></p>
    <button type="button" class="btn btn-primary btn-xl btn-block" data-act="ed-save">${PENDING.length > 1 ? 'Guardar y pasar a la siguiente' : 'Guardar'}</button>
    <span class="ed-links"><button type="button" class="link" data-act="ed-skip">Dejar para después</button><button type="button" class="link danger" data-act="ed-del">Borrar esta foto</button></span>`;
}
function openEditor(id, notice){
  const x = PENDING.find(p => p.id === id) || PENDING[0];
  if (!x) return;
  edId = x.id;
  openSheet(editorHTML(x, notice), `Completar la foto ${x.num}`, true);
  mode = 'editor';
  edRefresh();
  if (notice) say(plain(notice.html));
  /* En escritorio el foco va al primer dato que falta; en celular no, para no abrir el teclado */
  if (finePointer){
    const el = !x.m ? body.querySelector('input[name="edMat"]') : !x.cat ? body.querySelector('input[name="edCat"]') : $('#edPrice');
    el?.focus({preventScroll:true});
  }
}
function edValues(){
  return {
    m: body.querySelector('input[name="edMat"]:checked')?.value || null,
    cat: body.querySelector('input[name="edCat"]:checked')?.value || null,
    p: Number(digitsOf($('#edPrice')?.value || '')) || 0,
    n: ($('#edName')?.value || '').trim(),
    det: ($('#edDet')?.value || '').trim()
  };
}
function edRefresh(){
  const v = edValues(), el = $('#edCode'); if (!el) return;
  const code = v.m ? nextCode(v.m) : '';
  el.innerHTML = v.m && v.cat && v.p
    ? `Listo para guardar: pasa al stock con el código <b>${code}</b>.`
    : `Cuando tenga los tres datos, pasa al stock${code ? ` con el código <b>${code}</b>` : ' con su código'}.`;
  $('#edName').placeholder = v.m && v.cat ? autoName(v) : 'Si lo dejás vacío se completa solo';
  /* cada paso hecho muestra su tilde; si estaba marcado como faltante, se desmarca */
  let falta = false;
  Object.entries(PASOS).forEach(([k, [id]]) => {
    const s = $('#' + id), ok = !!v[k];
    s.classList.toggle('hecho', ok);
    if (ok) s.classList.remove('falta');
    falta = falta || s.classList.contains('falta');
  });
  const fl = $('#edFalta');
  if (fl && !falta) fl.textContent = '';
}
let edBusy = false;
async function edCommit(){
  const x = PENDING.find(p => p.id === edId);
  if (!x || !body.querySelector('.ed')) return null;
  const v = edValues(), idx = PENDING.indexOf(x);
  const changed = JSON.stringify([x.m, x.cat, x.p, x.n, x.det]) !== JSON.stringify([v.m, v.cat, v.p, v.n, v.det]);
  if (!changed && !(v.m && v.cat && v.p)) return {x, idx, changed, piece:null};
  const r = await api(`/pendientes/${x.id}`, {method:'PATCH', body:{material:v.m, categoria:v.cat, precio:v.p, nombre:v.n, detalle:v.det}});
  if (r.pieza){
    const piece = dePieza(r.pieza);
    const i = PENDING.indexOf(x); if (i > -1) PENDING.splice(i, 1);
    P.push(piece);
    ULT[piece.m] = Math.max(ULT[piece.m] || 0, parseInt(piece.c.slice(4), 10) || 0);
    freshCodes.add(piece.c);
    return {x, idx, changed, piece};
  }
  Object.assign(x, dePendiente(r.pendiente));
  return {x, idx, changed, piece:null};
}
async function edGo(dir, announce){
  if (edBusy) return;
  edBusy = true;
  const done = busy($('#edFoot [data-act="ed-save"]'), 'Guardando…');
  let r;
  try { r = await edCommit(); }
  catch (err){
    done();
    if (!err.sesion){ const fl = $('#edFalta'); if (fl) fl.textContent = err.message; else toast(err.message); }
    return;
  }
  finally { edBusy = false; }
  if (!r) return;
  let notice = null;
  if (r.piece){ notice = {ok:true, html:`Listo. <b>${esc(r.piece.n)}</b> pasó al stock con el código <b>${r.piece.c}</b>. Anotalo en la etiqueta de la pieza.`}; renderStock(); }
  else if (!announce) notice = {ok:false, html:`La foto ${r.x.num} quedó para después${r.changed ? ', con lo que le pusiste guardado' : ''}.`};
  refreshAll();
  if (mode !== 'editor') return;   /* se cerró la hoja mientras se guardaba */
  if (!PENDING.length){ edFinished(notice); return; }
  const n = PENDING.length, i = r.piece ? (dir > 0 ? r.idx : r.idx - 1) : r.idx + dir;
  openEditor(PENDING[((i % n) + n) % n].id, notice);
}
/* "Guardar" pide los tres datos: si falta alguno, se marca el paso y se explica qué hacer */
function edSave(){
  if (!$('#edFalta')) $('#edFoot').innerHTML = edFootHTML();
  const v = edValues(), miss = Object.keys(PASOS).filter(k => !v[k]);
  if (!miss.length){ edGo(1, true); return; }
  Object.entries(PASOS).forEach(([k, [id]]) => $('#' + id).classList.toggle('falta', miss.includes(k)));
  const words = miss.map(k => PASOS[k][1]);
  const what = words.length > 1 ? words.slice(0, -1).join(', ') + ' y ' + words[words.length - 1] : words[0];
  $('#edFalta').innerHTML = `${words.length > 1 ? 'Faltan' : 'Falta'} ${what}. Si no ${words.length > 1 ? 'los' : 'lo'} sabés todavía, podés <b>dejarla para después</b>.`;
  const first = $('#' + PASOS[miss[0]][0]);
  first.scrollIntoView({block:'center', behavior:smooth()});
  (miss[0] === 'p' ? $('#edPrice') : first.querySelector('input:checked') || first.querySelector('input')).focus({preventScroll:true});
}
/* "Dejar para después": guarda lo que haya y pasa a la siguiente; si era la última, cierra */
function edLater(){
  if (PENDING.length > 1){ edGo(1, false); return; }
  const x = PENDING.find(p => p.id === edId), v = edValues();
  closeSheet();
  if (x && !(v.m && v.cat && v.p)) toast(`La foto ${x.num} quedó para después`);
}
/* Borrar pide confirmación ahí mismo, con "No" como opción segura */
function edAskDelete(){
  const x = PENDING.find(p => p.id === edId); if (!x) return;
  $('#edFoot').innerHTML = `<div class="ed-confirm"><p class="ed-confirm-t" id="edConfT">¿Borrar la foto ${x.num}?</p><div class="ed-confirm-btns" role="group" aria-labelledby="edConfT"><button type="button" class="btn btn-quiet btn-xl" data-act="ed-del-no">No, dejarla</button><button type="button" class="btn btn-danger btn-xl" data-act="ed-del-ok">Sí, borrarla</button></div></div>`;
  $('#edFoot [data-act="ed-del-no"]').focus({preventScroll:true});
}
function edCancelDelete(){
  $('#edFoot').innerHTML = edFootHTML();
  $('#edFoot [data-act="ed-del"]').focus({preventScroll:true});
}
async function edDelete(){
  const x = PENDING.find(p => p.id === edId); if (!x) return;
  const done = busy($('#edFoot [data-act="ed-del-ok"]'), 'Borrando…');
  try { await api(`/pendientes/${x.id}`, {method:'DELETE'}); }
  catch (err){ done(); if (!err.sesion){ toast(err.message); if (mode === 'editor') edCancelDelete(); } return; }
  const removed = removePending([x.id]);
  if (!removed.length) return;
  const [[, idx]] = removed;
  refreshAll();
  toast(`Foto ${x.num} borrada`, [['Deshacer', async () => {
    try { await api(`/pendientes/${x.id}/restaurar`, {method:'POST'}); }
    catch (err){ if (!err.sesion) toast(err.message); return; }
    restorePending(removed);
    if (mode === 'editor' || mode === 'finished') openEditor(x.id);
  }]]);
  if (mode !== 'editor') return;
  if (PENDING.length) openEditor(PENDING[idx % PENDING.length].id); else edFinished(null);
}
/* Al cerrar el editor se guarda lo escrito (sin esperar: la hoja se cierra enseguida) */
function edKeep(){
  edCommit().then(r => {
    if (!r) return;
    if (r.piece){ renderStock(); toast(`${r.piece.c} pasó al stock`); }
    refreshAll();
  }).catch(err => { if (!err.sesion) toast(`No se pudo guardar la foto: ${err.message}`); });
}
function edFinished(notice){
  mode = 'finished';
  sheet.setAttribute('aria-label', 'Fotos completas');
  body.innerHTML = `<div class="ld-done"><div class="ld-head">${noticeHTML(notice)}<h2 class="np-title" style="margin-top:${notice ? '18px' : '0'}">No quedan fotos por completar</h2><p class="ld-lead">Todas las piezas tienen sus datos y ya están en el stock.</p></div><div class="np-actions"><button type="button" class="btn btn-quiet" data-act="up-open">Subir más fotos</button><button type="button" class="btn btn-primary" data-act="go-stock">Ver el stock</button></div></div>`;
  sheet.focus({preventScroll:true});
  say((notice ? plain(notice.html) + ' ' : '') + 'No quedan fotos por completar.');
}
function zoomAt(ph, e){
  const r = ph.getBoundingClientRect();
  ph.querySelector('img').style.transformOrigin = `${((e.clientX - r.left) / r.width * 100).toFixed(1)}% ${((e.clientY - r.top) / r.height * 100).toFixed(1)}%`;
}
function toggleZoom(ph, e){
  const on = ph.getAttribute('aria-pressed') !== 'true';
  if (on){ if (e.detail === 0) ph.querySelector('img').style.transformOrigin = '50% 50%'; else zoomAt(ph, e); }
  ph.setAttribute('aria-pressed', String(on));
}

const enFicha = p => body.querySelector('.pd')?.dataset.code === p.c;
async function reserveOk(p, btn){
  const who = $('#rsWho').value.trim(), sena = Number(digitsOf($('#rsSena').value)) || 0;
  if (!who){ showErr($('#rsWho'), 'rsErr'); return; }
  if (sena > p.p){ showErr($('#rsSena'), 'rsSenaErr'); return; }
  const done = busy(btn, 'Guardando…');
  try { const r = await api(`/piezas/${enc(p.c)}/reserva`, {method:'POST', body:{cliente:who, sena}}); Object.assign(p, dePieza(r.pieza)); }
  catch (err){ done(); if (!err.sesion) toast(err.message); return; }
  if (enFicha(p)) rerenderPiece(p);
  renderStock();
  toast(`${p.c} reservada para ${p.res.who}`);
}
async function unreserve(p, btn){
  const prev = p.res;
  const done = busy(btn, 'Quitando…');
  try { const r = await api(`/piezas/${enc(p.c)}/reserva`, {method:'DELETE'}); Object.assign(p, dePieza(r.pieza)); }
  catch (err){ done(); if (!err.sesion) toast(err.message); return; }
  if (enFicha(p)) rerenderPiece(p);
  renderStock();
  toast(`Se quitó la reserva de ${p.c}`, [['Deshacer', async () => {
    try { const r = await api(`/piezas/${enc(p.c)}/reserva`, {method:'POST', body:{cliente:prev.who, sena:prev.sena, dias:prev.d}}); Object.assign(p, dePieza(r.pieza)); }
    catch (err){ if (!err.sesion) toast(err.message); return; }
    renderStock();
    if (enFicha(p)) rerenderPiece(p);
  }]]);
}
async function editOk(p, btn){
  const price = Number(digitsOf($('#pdPrice').value)) || 0;
  if (!price){ showErr($('#pdPrice'), 'pdErr'); return; }
  const done = busy(btn, 'Guardando…');
  try {
    const r = await api(`/piezas/${enc(p.c)}`, {method:'PATCH', body:{nombre:$('#pdName').value.trim(), precio:price, categoria:$('#pdCat').value, detalle:$('#pdDet').value.trim()}});
    Object.assign(p, dePieza(r.pieza));
  } catch (err){ done(); if (!err.sesion) toast(err.message); return; }
  if (enFicha(p)) rerenderPiece(p);
  renderStock();
  toast(`Cambios de ${p.c} guardados`);
}
body.addEventListener('click', e => {
  const ph = e.target.closest('#edPhoto');
  if (ph){ toggleZoom(ph, e); return; }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act;
  switch (act){
    case 'up-remove': upRemove(+b.closest('.ut').dataset.id); return;
    case 'up-commit': upCommit(); return;
    case 'up-keep': up.confirming = false; upFoot(); ($('#upFoot [data-act="up-commit"]:not([disabled])') || sheet).focus({preventScroll:true}); return;
    case 'up-discard': upDiscard(); closeSheet(true); return;
    case 'up-open': openUpload(); return;
    case 'go-stock': {
      const hl = new Set(freshCodes);
      closeSheet(true); setView('stock'); renderGrid(hl);
      if (hl.size) $('#grid').scrollIntoView({block:'start', behavior:smooth()});
      return;
    }
    case 'ed-save': edSave(); return;
    case 'ed-skip': edLater(); return;
    case 'ed-del': edAskDelete(); return;
    case 'ed-del-no': edCancelDelete(); return;
    case 'ed-del-ok': edDelete(); return;
  }
  const p = P.find(x => x.c === body.querySelector('.pd')?.dataset.code); if (!p) return;
  const actions = body.querySelector('.pd-actions');
  const focusIn = s => { if (finePointer) actions.querySelector(s)?.focus(); };
  switch (act){
    case 'sell': actions.innerHTML = sellHTML(p); $('#pay-0').focus(); return;
    case 'back': actions.innerHTML = actionsHTML(p); actions.querySelector('.btn')?.focus({preventScroll:true}); return;
    case 'reserve': actions.innerHTML = reserveHTML(p); focusIn('#rsWho'); return;
    case 'reserve-ok': reserveOk(p, b); return;
    case 'unreserve': unreserve(p, b); return;
    case 'edit': actions.innerHTML = editHTML(p); focusIn('#pdPrice'); return;
    case 'edit-ok': editOk(p, b); return;
    case 'confirm': sell(p, body.querySelector('input[name="pay"]:checked')?.value || PAYS[0], b); return;
  }
});
body.addEventListener('pointermove', e => {
  const ph = e.target.closest('#edPhoto[aria-pressed="true"]');
  if (ph && e.pointerType === 'mouse') zoomAt(ph, e);
});
body.addEventListener('change', e => {
  const t = e.target;
  if (t.name === 'edMat' || t.name === 'edCat') edRefresh();
  else if (t.id === 'upFiles' || t.id === 'upCam'){ const files = [...t.files]; t.value = ''; upAdd(files); }
  else if (t.id === 'pdPhoto'){ const f = t.files[0]; t.value = ''; changePhoto(f); }
});
body.addEventListener('input', e => {
  const t = e.target;
  if (t.matches('[data-money]')) formatMoneyInput(t, e.inputType);
  if (t.getAttribute('aria-invalid') === 'true') clearErr(t);
  if (t.id === 'edPrice' || t.id === 'edName') edRefresh();
});
/* Enter guarda: en el editor pasa a la siguiente; en reservar/editar confirma; en el pago confirma la venta */
body.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || e.target.type === 'file') return;
  if (mode === 'editor' && e.target.closest('.ed-form')){ e.preventDefault(); edSave(); return; }
  if (e.target.name === 'pay'){ e.preventDefault(); body.querySelector('[data-act="confirm"]')?.click(); return; }
  const form = e.target.closest('.pd-form');
  if (form){ e.preventDefault(); form.querySelector('[data-act$="-ok"]')?.click(); }
});

/* Arrastrar fotos: sobre la hoja de subida, o sobre la página para abrirla con esas fotos */
const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
sheet.addEventListener('dragover', e => { if (mode !== 'upload' || !hasFiles(e)) return; e.preventDefault(); $('#drop')?.classList.add('over'); });
sheet.addEventListener('dragleave', e => { if (mode === 'upload' && !sheet.contains(e.relatedTarget)) $('#drop')?.classList.remove('over'); });
sheet.addEventListener('drop', e => { if (mode !== 'upload' || !hasFiles(e)) return; e.preventDefault(); $('#drop')?.classList.remove('over'); upAdd(e.dataTransfer.files); });
document.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
document.addEventListener('drop', e => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  if (!isOpen() && !$('#app').hidden){ openUpload(); upAdd(e.dataTransfer.files); }
});
overlay.addEventListener('click', e => { if (e.target === overlay) closeSheet(); });
$('#sheetClose').addEventListener('click', () => closeSheet());
/* Escape deshace lo último: primero el zoom, después la pregunta de descartar, después la hoja */
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (isOpen()){
    const zoomed = $('#edPhoto[aria-pressed="true"]');
    if (zoomed){ zoomed.setAttribute('aria-pressed', 'false'); return; }
    if (mode === 'upload' && up.confirming){ up.confirming = false; upFoot(); sheet.focus({preventScroll:true}); return; }
    if (mode === 'editor' && $('#edFoot .ed-confirm')){ edCancelDelete(); return; }
    closeSheet(); return;
  }
});
addEventListener('beforeunload', e => { if (up.rows.length){ e.preventDefault(); e.returnValue = ''; } });

/* ── Filtros y búsqueda ── */
$('#mats').addEventListener('click', e => { const b = e.target.closest('.mat'); if (!b) return; st.mat = b.dataset.m || null; renderMats(); renderGrid(); });
$('#cats').addEventListener('click', e => { const b = e.target.closest('.cat'); if (!b) return; st.cat = b.dataset.c || null; renderCats(); renderMats(); renderGrid(); });
let qFrame = 0;
$('#q').addEventListener('input', e => {
  st.q = e.target.value;
  $('#qClear').hidden = !st.q;
  cancelAnimationFrame(qFrame);
  qFrame = requestAnimationFrame(() => { renderMats(); renderGrid(); });
});
$('#q').addEventListener('keydown', e => {
  if (e.key === 'Escape' && e.target.value){ e.preventDefault(); e.stopPropagation(); clearSearch(); renderMats(); renderGrid(); }
  if (e.key === 'Enter' && coarse) e.target.blur();   /* en el celular, Enter cierra el teclado y deja ver los resultados */
});
$('#searchBox').addEventListener('click', e => { if (!e.target.closest('#qClear, #q')) $('#q').focus(); });
$('#qClear').addEventListener('click', () => { clearSearch(); renderMats(); renderGrid(); $('#q').focus(); });
$('#sort').addEventListener('change', e => { st.sort = e.target.value; renderGrid(); });
$('#grid').addEventListener('click', e => {
  if (e.target.closest('[data-clear]')){ clearFilters(); return; }
  const c = e.target.closest('.card'); if (c) openPiece(c.dataset.code);
});
$('#btnAdd').addEventListener('click', () => openUpload());

/* ── Aviso breve: se pausa con el mouse o el foco encima y al cambiar de pestaña ── */
const toastEl = $('#toast');
let tTimer = 0, tClear = 0, tLeft = 0, tStart = 0, tPaused = false;
function toast(msg, actions = []){
  clearTimeout(tClear);
  toastEl.innerHTML = `<span>${esc(msg)}</span>` + actions.map((a, i) => `<button type="button" data-i="${i}">${esc(a[0])}</button>`).join('');
  toastEl.querySelectorAll('button').forEach(b => { b.onclick = () => { hideToast(); actions[+b.dataset.i][1](); }; });
  toastEl.classList.add('show');
  armToast(actions.length ? 6000 : 3200);
}
function armToast(ms){ clearTimeout(tTimer); tPaused = false; tLeft = ms; tStart = Date.now(); tTimer = setTimeout(hideToast, ms); }
function hideToast(){
  clearTimeout(tTimer); tPaused = false;
  toastEl.classList.remove('show');
  /* Si el foco estaba en el aviso, vuelve a la hoja abierta o al contenido */
  if (toastEl.contains(document.activeElement)) (isOpen() ? sheet : $('#contenido')).focus({preventScroll:true});
  /* Al terminar de desaparecer se vacía, para que sus botones no queden enfocables sin verse */
  tClear = setTimeout(() => { if (!toastEl.classList.contains('show')) toastEl.textContent = ''; }, 240);
}
function pauseToast(){ if (!toastEl.classList.contains('show') || tPaused) return; tPaused = true; clearTimeout(tTimer); tLeft -= Date.now() - tStart; }
function resumeToast(){ if (!toastEl.classList.contains('show') || !tPaused) return; armToast(Math.max(tLeft, 1600)); }
toastEl.addEventListener('pointerenter', pauseToast);
toastEl.addEventListener('pointerleave', resumeToast);
toastEl.addEventListener('focusin', pauseToast);
toastEl.addEventListener('focusout', resumeToast);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseToast(); else resumeToast(); });

/* ── Ingreso ──
   La cuenta la revisa el servidor (contraseña guardada con bcrypt y sesión con JWT);
   el navegador solo guarda el token que recibe: en localStorage si se pidió mantener
   la sesión, si no en sessionStorage (se borra al cerrar el navegador). */
const appEl = $('#app'), loginEl = $('#login'), lgForm = $('#loginForm');
const lgUser = $('#lgUser'), lgPass = $('#lgPass'), lgGo = $('#lgGo'), lgErr = $('#lgErr'), lgEye = $('#lgEye');
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: k => { try { localStorage.removeItem(k); } catch {} }
};
const sstore = {
  get: k => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} },
  del: k => { try { sessionStorage.removeItem(k); } catch {} }
};
function setToken(t, keep){
  TOKEN = t || null;
  store.del('sm-token'); sstore.del('sm-token');
  if (TOKEN) (keep ? store : sstore).set('sm-token', TOKEN);
}
/* Si el servidor rechaza el token (venció o cambió la contraseña), se vuelve al ingreso */
function sesionVencida(){
  setToken(null);
  if (isOpen()){ mode = ''; closeSheet(true); }
  hideTip();
  showLogin(false);
  lgErr.textContent = 'Tu sesión venció. Ingresá de nuevo para seguir.';
}
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let lgBusy = false;
function setBusy(on){
  lgBusy = on;
  lgGo.classList.toggle('is-busy', on);
  lgGo.setAttribute('aria-disabled', String(on));
  $('#lgGoText').textContent = on ? 'Entrando…' : 'Entrar al local';
}
function lgFail(input, msg){
  lgErr.textContent = msg;
  input.setAttribute('aria-invalid', 'true');
  input.setAttribute('aria-describedby', 'lgErr');
  input.focus();
}
function lgClear(){
  lgErr.textContent = '';
  [lgUser, lgPass].forEach(i => { i.removeAttribute('aria-invalid'); i.removeAttribute('aria-describedby'); });
}
function showApp(animate){
  loginEl.hidden = true;
  appEl.hidden = false;
  if (animate && !calm()){
    appEl.classList.add('entering');
    requestAnimationFrame(() => requestAnimationFrame(() => appEl.classList.remove('entering')));
  }
  placeBubbles(true);
  $('#contenido').focus({preventScroll:true});
}
/* El acercamiento sale del centro de la puerta, medido con la vista quieta */
function zoomOrigin(){
  const c = $('#calle').getBoundingClientRect(), d = $('.puertas').getBoundingClientRect();
  $('#calle').style.transformOrigin = `${Math.round(d.left + d.width / 2 - c.left)}px ${Math.round(d.top + d.height * .42 - c.top)}px`;
}
function showLogin(animate){
  appEl.hidden = true;
  /* la vista vuelve quieta a la vereda (quedó adentro al entrar) para poder medir la puerta */
  loginEl.classList.add('sin-anim');
  loginEl.classList.remove('abriendo');
  loginEl.hidden = false;
  $('#lgEstado').textContent = 'Cerrado';
  $('#lgEstado').classList.remove('abierto');
  window.scrollTo(0, 0);
  if (animate && !calm()){
    /* al salir, la vista arranca adentro del local y retrocede hasta la vereda mientras se cierran las puertas */
    zoomOrigin();
    loginEl.classList.add('abriendo');
    void loginEl.offsetWidth;
    loginEl.classList.remove('sin-anim');
    requestAnimationFrame(() => requestAnimationFrame(() => loginEl.classList.remove('abriendo')));
  } else { void loginEl.offsetWidth; loginEl.classList.remove('sin-anim'); }
  setBusy(false);
  lgClear();
  lgPass.value = '';
  lgPass.type = 'password';
  lgEye.setAttribute('aria-pressed', 'false');
  lgEye.setAttribute('aria-label', 'Mostrar la contraseña');
  $('#lgCaps').textContent = '';
  if (animate){ loginEl.classList.remove('intro'); void loginEl.offsetWidth; loginEl.classList.add('intro'); }
  if (finePointer) (lgUser.value ? lgPass : lgUser).focus({preventScroll:true});
}
/* La vidriera y el interior del local, con piezas dibujadas como las del stock.
   Cada pieza lleva cuánto aire queda debajo del dibujo, para que se apoye justo en su repisa o peana. */
const VIDRIERA = [
  {rep:[['Aros Argolla Mediana', 'oro', 'aros', 24, 30], ['Reloj Dama Malla Dorada', 'acero', 'reloj', 50, 0], ['Aros Gota con Piedra', 'plata', 'aros', 76, 33]],
   pea:[['Pulsera Rígida Esclava', 'oro', 'pulsera', 22, 52, 60, 28], ['Anillo Solitario Circón', 'oro', 'anillo', 50, 82, 54, 14], ['Pulsera Tennis Circones', 'plata', 'pulsera', 78, 40, 60, 30]]},
  {rep:[['Aros Argolla Mediana', 'plata', 'aros', 24, 30], ['Anillo Corona Circones', 'plata', 'anillo', 50, 14], ['Aros Gota con Piedra', 'oro', 'aros', 76, 33]],
   pea:[['Pulsera Doble Tono', 'plata-oro', 'pulsera', 22, 44, 60, 30], ['Alianza Clásica', 'oro', 'anillo', 50, 78, 54, 30], ['Pulsera Malla Tejida', 'plata', 'pulsera', 78, 56, 60, 31]]}
];
const ADENTRO = [
  [['Anillo Solitario Circón', 'oro', 'anillo'], ['Aros Argolla Mediana', 'oro', 'aros'], ['Reloj Dama Malla Dorada', 'acero', 'reloj'], ['Aros Gota con Piedra', 'plata', 'aros'], ['Alianza Clásica', 'oro', 'anillo']],
  [['Pulsera Dijes Corazón', 'plata', 'pulsera'], ['Anillo Corona Circones', 'plata', 'anillo'], ['Reloj Clásico Cuero', 'acero', 'reloj'], ['Pulsera Doble Tono', 'plata-oro', 'pulsera'], ['Aros Argolla Mediana', 'plata', 'aros']]
];
const joya = (c, [n, m, cat]) => art({c, n, m, cat});
document.querySelectorAll('.vid-exhib').forEach((box, k) => {
  const V = VIDRIERA[k];
  box.innerHTML = '<span class="repisa"></span>' +
    V.rep.map((d, i) => `<img class="vid-pieza" src="${joya('VR' + k + i, d)}" alt="" style="left:${d[3]}%;--off:${d[4]}%">`).join('') +
    V.pea.map((d, i) => `<span class="peana" style="left:${d[3]}%;--h:${d[4]}px;--w:${d[5]}px"><img src="${joya('VP' + k + i, d)}" alt="" style="--off:${d[6]}%"></span>`).join('');
});
document.querySelectorAll('.adentro-fila').forEach((row, f) => {
  row.innerHTML = ADENTRO[f].map((d, i) => `<img src="${joya('AD' + f + i, d)}" alt="">`).join('');
});
lgForm.addEventListener('submit', async e => {
  e.preventDefault();
  if (lgBusy) return;
  lgClear();
  const u = lgUser.value.trim().toLowerCase(), pw = lgPass.value;
  if (!u){ lgFail(lgUser, 'Escribí el usuario.'); return; }
  if (!pw){
    /* Enter en el usuario solo pasa a la contraseña */
    if (document.activeElement === lgUser){ lgPass.focus(); return; }
    lgFail(lgPass, 'Escribí la contraseña.');
    return;
  }
  setBusy(true);
  const keep = $('#lgKeep').checked;
  try {
    const r = await api('/login', {method:'POST', body:{usuario:u, password:pw, recordar:keep}});
    setToken(r.token, keep);
    await loadState();
  } catch (err){
    setBusy(false);
    setToken(null);
    lgFail(lgPass, err.status === 401 ? 'El usuario o la contraseña no coinciden. Revisalos y probá de nuevo.' : err.message);
    lgPass.select();
    return;
  }
  {
    const enter = () => { setBusy(false); showApp(true); };
    /* el cartel pasa a "Abierto", se descuelga, se abren las dos hojas y la vista entra al local */
    $('#lgEstado').textContent = 'Abierto';
    $('#lgEstado').classList.add('abierto');
    if (calm()){ enter(); return; }
    zoomOrigin();
    loginEl.classList.add('abriendo');
    /* entra cuando la vista termina de desvanecerse (o a los 2,6 s, por si el equipo es lento) */
    const calle = $('#calle');
    let dentro = false;
    const listo = () => { if (dentro) return; dentro = true; calle.removeEventListener('transitionend', fin); enter(); };
    const fin = e => { if (e.target === calle && e.propertyName === 'opacity') listo(); };
    calle.addEventListener('transitionend', fin);
    setTimeout(listo, 2600);
  }
});
lgForm.addEventListener('input', () => { if (lgErr.textContent) lgClear(); });
lgEye.addEventListener('click', () => {
  const show = lgPass.type === 'password';
  lgPass.type = show ? 'text' : 'password';
  lgEye.setAttribute('aria-pressed', String(show));
  lgEye.setAttribute('aria-label', show ? 'Ocultar la contraseña' : 'Mostrar la contraseña');
  lgPass.focus({preventScroll:true});
});
/* Aviso de Bloq Mayús mientras se escribe la contraseña */
const capsCheck = e => { if (e.getModifierState) $('#lgCaps').textContent = e.getModifierState('CapsLock') ? 'Está activado Bloq Mayús.' : ''; };
lgPass.addEventListener('keydown', capsCheck);
lgPass.addEventListener('keyup', capsCheck);
lgPass.addEventListener('blur', () => { $('#lgCaps').textContent = ''; });
$('#btnLogout').addEventListener('click', () => {
  setToken(null);
  hideTip();
  /* en una compu compartida no quedan datos a la vista detrás del ingreso */
  P = []; SALES = []; PENDING = [];
  renderStock(); renderVentas(); refreshAll();
  showLogin(true);
  toast('Cerraste la sesión');
});

renderStock();
renderVentas();
refreshAll();
setView(initialView());
/* La barra flotante se vuelve un poco más sólida al desplazarse */
const onScroll = () => root.classList.toggle('scrolled', window.scrollY > 8);
addEventListener('scroll', onScroll, {passive:true});
onScroll();
addEventListener('resize', () => placeBubbles(true));
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => placeBubbles(true));
/* Si quedó una sesión guardada en este navegador, entra directo */
TOKEN = store.get('sm-token') || sstore.get('sm-token');
if (TOKEN){
  loadState()
    .then(() => { $('#cargando').hidden = true; showApp(false); })
    .catch(err => { $('#cargando').hidden = true; if (!err.sesion){ showLogin(false); lgErr.textContent = err.message; } });
} else {
  $('#cargando').hidden = true;
  showLogin(false);
}
})();
