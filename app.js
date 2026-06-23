/* ============================================================
   SGV — Frontend conectado a la API real
   ============================================================ */
const API = '/api';
let TOKEN = null;
let USER = null;            // { id, correo, rol }
let VACUNAS = [];          // catálogo cacheado

const ROL_INFO = {
  enfermeria:   { name:'Enfermería',   rol:'Administrador',       perm:'Lectura y escritura',                 tipo:'Cuenta compartida', write:true,  manageUsers:false, av:'EN' },
  coordinadora: { name:'Coordinadora', rol:'Coordinadora',        perm:'Solo lectura + gestión de usuarios',  tipo:'Cuenta personal',   write:false, manageUsers:true,  av:'CO' },
  jefa:         { name:'Jefa',         rol:'Jefa de enfermería',  perm:'Solo lectura',                        tipo:'Cuenta personal',   write:false, manageUsers:false, av:'JE' },
  proveedora:   { name:'Proveedora',   rol:'Proveedora',          perm:'Solo lectura',                        tipo:'Cuenta personal',   write:false, manageUsers:false, av:'PR' },
};

/* ---------- Helpers ---------- */
function $(id){ return document.getElementById(id); }
function msg(id,type,text){
  const ic = type==='err' ? '✕' : type==='ok' ? '✓' : '!';
  $(id).innerHTML = text ? `<div class="msg ${type}"><span class="ic">${ic}</span><span>${text}</span></div>` : '';
}
function today(){ return new Date().toISOString().slice(0,10); }
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
  if (!res.ok) throw new Error(data.error || 'Error del servidor.');
  return data;
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
    msg('login-msg','ok','Ingreso correcto…');
    setTimeout(enterApp, 350);
  }catch(err){
    u.classList.add('bad'); p.classList.add('bad');
    msg('login-msg','err', err.message);
  }
}

async function enterApp(){
  $('gate').style.display = 'none';
  $('app').classList.add('on');
  applyRole();
  await loadVacunas();
  await Promise.all([ loadDashboard(), loadStock(), loadMovimientos() ]);
  if (ROL_INFO[USER.rol].manageUsers) loadUsuarios();
  go('inicio');
}

function logout(){
  TOKEN = null; USER = null;
  $('app').classList.remove('on');
  $('gate').style.display = 'flex';
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
  pill.textContent = info.write ? 'Escritura' : 'Solo lectura';
  pill.className = 'role-pill ' + (info.write ? 'w' : 'r');
  document.querySelectorAll('.enfermeria-only:not(.page)').forEach(e => e.style.display = info.write ? '' : 'none');
  document.querySelectorAll('.coordinadora-only:not(.page)').forEach(e => e.style.display = info.manageUsers ? '' : 'none');
  document.querySelectorAll('.readonly-only').forEach(e => e.style.display = info.write ? 'none' : 'flex');
}

/* ---------- Navegación ---------- */
const TITLES = { inicio:'Inicio', stock:'Stock', mov:'Movimientos', aplicar:'Aplicación', descarte:'Descarte', lote:'Ingresar lote', usuarios:'Usuarios', cuenta:'Mi cuenta' };
function go(page){
  // Bloquear acceso por URL a vistas sin permiso
  const info = ROL_INFO[USER.rol];
  if (['aplicar','descarte','lote'].includes(page) && !info.write) page = 'inicio';
  if (page === 'usuarios' && !info.manageUsers) page = 'inicio';
  document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
  $('page-'+page).classList.add('on');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page===page));
  if (page === 'aplicar' && !$('ap-fecha').value) $('ap-fecha').value = today();
  window.scrollTo(0,0);
}

/* ---------- Carga de datos ---------- */
async function loadVacunas(){
  VACUNAS = await api('/vacunas');
  const opts = '<option value="">Seleccionar…</option>' + VACUNAS.map(v=>`<option value="${v.id}">${v.nombre}</option>`).join('');
  ['ap-vac','de-vac','lo-vac','ex-vac'].forEach(id => { const el=$(id); if(el) el.innerHTML = opts; });
  if ($('ap-fecha')) $('ap-fecha').value = today();
}

async function loadDashboard(){
  const d = await api('/dashboard');
  // KPIs
  const k = d.kpis;
  const nums = document.querySelectorAll('#page-inicio .kpi .num');
  if (nums.length >= 4){
    nums[0].textContent = k.tipos;
    nums[1].textContent = k.unidades;
    nums[2].textContent = k.stockBajo;
    nums[3].textContent = k.porVencer;
  }
  // Alertas
  const low = d.alertas.stockBajo, exp = d.alertas.porVencer;
  const lowUl = document.querySelector('#page-inicio .alert.low ul');
  const expUl = document.querySelector('#page-inicio .alert.exp ul');
  if (lowUl) lowUl.innerHTML = low.length
    ? low.map(a=>`<li>${a.vacuna} — <b>${a.disponible}</b> dosis disponibles</li>`).join('')
    : '<li class="alert-empty">Sin vacunas con stock bajo.</li>';
  if (expUl) expUl.innerHTML = exp.length
    ? exp.map(a=>`<li>${a.vacuna} — vence <b>${fmtFecha(a.vencimiento)}</b></li>`).join('')
    : '<li class="alert-empty">Sin vacunas próximas a vencer.</li>';
}

async function loadStock(){
  const stock = await api('/stock');
  const ETIQ = { ok:'OK', low:'Stock bajo', exp:'Por vencer' };
  $('stockBody').innerHTML = stock.length ? stock.map(r=>
    `<tr>
       <td data-label="Vacuna"><b>${r.vacuna}</b></td>
       <td data-label="Lote">${r.numero_lote}</td>
       <td data-label="Vencimiento">${fmtFecha(r.vencimiento)}</td>
       <td data-label="Cant. inicial">${r.cantidad_inicial}</td>
       <td data-label="Disp.">${r.disponible}</td>
       <td data-label="Estado"><span class="pill ${r.estado}">${ETIQ[r.estado]}</span></td>
     </tr>`).join('')
    : '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px">Sin stock cargado todavía.</td></tr>';
}

async function loadMovimientos(){
  const mov = await api('/movimientos');
  const TIPO = { aplicacion:['apl','Aplicación'], descarte:['des','Descarte'], ingreso:['ing','Ingreso lote'] };
  $('movBody').innerHTML = mov.length ? mov.map(m=>{
    const [cls,lbl] = TIPO[m.tipo];
    return `<tr>
       <td data-label="Fecha mov.">${fmtFecha(m.fecha_mov)}</td>
       <td data-label="Fecha aplic.">${fmtFecha(m.fecha_aplicacion)}</td>
       <td data-label="Vacuna"><b>${m.vacuna}</b></td>
       <td data-label="Lote">${m.numero_lote}</td>
       <td data-label="Tipo"><span class="pill ${cls}">${lbl}</span></td>
       <td data-label="Motivo">${m.motivo || '<span class="muted-dash">—</span>'}</td>
       <td data-label="Cant.">${m.cantidad}</td>
       <td data-label="Resp.">${m.responsable}</td>
     </tr>`; }).join('')
    : '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:24px">Sin movimientos registrados.</td></tr>';
}

/* ---------- Selectores de lote ---------- */
async function loadLotes(pref){
  const vacId = $(pref+'-vac').value;
  const sel = $(pref+'-lote');
  if(!vacId){ sel.innerHTML = '<option value="">Seleccionar vacuna primero…</option>'; return; }
  try{
    const lotes = await api(`/vacunas/${vacId}/lotes`);
    sel.innerHTML = lotes.length
      ? '<option value="">Seleccionar…</option>' + lotes.map(l=>`<option value="${l.id}" data-disp="${l.disponible}">${l.numero_lote} · vence ${fmtFecha(l.vencimiento)} · disp. ${l.disponible}</option>`).join('')
      : '<option value="">Sin lotes disponibles</option>';
  }catch(err){ toast('err', err.message); }
}

/* ---------- Acciones de escritura ---------- */
function checkFields(ids){
  let bad=false;
  ids.forEach(id=>{ const e=$(id); e.classList.remove('bad'); if(!e.value||!String(e.value).trim()){ e.classList.add('bad'); bad=true; } });
  return !bad;
}

async function saveAplicacion(pref){
  if(!checkFields([pref+'-vac',pref+'-lote',pref+'-cant',pref+'-fecha'])) return msg(pref+'-msg','err','Completá todos los campos obligatorios.');
  try{
    await api('/aplicaciones', { method:'POST', body: JSON.stringify({
      lote_id: $(pref+'-lote').value,
      cantidad: Number($(pref+'-cant').value),
      fecha_aplicacion: $(pref+'-fecha').value,
    })});
    msg(pref+'-msg',''); toast('ok','Aplicación registrada con éxito');
    clearAplicacion(pref);
    await Promise.all([loadStock(), loadMovimientos(), loadDashboard()]);
    go('mov');
  }catch(err){ msg(pref+'-msg','err', err.message); }
}
function clearAplicacion(pref){
  ['-vac','-lote','-cant'].forEach(s=>$(pref+s).value='');
  $(pref+'-lote').innerHTML='<option value="">Seleccionar vacuna primero…</option>';
  $(pref+'-fecha').value=today();
  $(pref+'-msg').innerHTML='';
  ['-vac','-lote','-cant','-fecha'].forEach(s=>$(pref+s).classList.remove('bad'));
}

async function saveDescarte(){
  if(!checkFields(['de-vac','de-lote','de-cant','de-motivo'])) return msg('de-msg','err','Completá todos los campos obligatorios.');
  try{
    await api('/descartes', { method:'POST', body: JSON.stringify({
      lote_id: $('de-lote').value,
      cantidad: Number($('de-cant').value),
      motivo: $('de-motivo').value,
    })});
    msg('de-msg',''); toast('ok','Descarte registrado');
    clearDescarte();
    await Promise.all([loadStock(), loadMovimientos(), loadDashboard()]);
    go('mov');
  }catch(err){ msg('de-msg','err', err.message); }
}
function clearDescarte(){
  ['de-vac','de-lote','de-cant','de-motivo'].forEach(id=>{ $(id).value=''; $(id).classList.remove('bad'); });
  $('de-lote').innerHTML='<option value="">Seleccionar vacuna primero…</option>';
  $('de-msg').innerHTML='';
}

async function saveLote(){
  if(!checkFields(['lo-vac','lo-num','lo-venc','lo-cant'])) return msg('lo-msg','err','Completá todos los campos obligatorios.');
  if($('lo-venc').value < today()){ $('lo-venc').classList.add('bad'); return msg('lo-msg','err','La fecha de vencimiento no puede ser anterior a hoy.'); }
  try{
    await api('/lotes', { method:'POST', body: JSON.stringify({
      vacuna_id: $('lo-vac').value,
      numero_lote: $('lo-num').value,
      vencimiento: $('lo-venc').value,
      cantidad: Number($('lo-cant').value),
    })});
    msg('lo-msg',''); toast('ok','Lote ingresado con éxito');
    clearLote();
    await Promise.all([loadStock(), loadMovimientos(), loadDashboard()]);
    go('stock');
  }catch(err){ msg('lo-msg','err', err.message); }
}
function clearLote(){
  ['lo-vac','lo-num','lo-venc','lo-cant'].forEach(id=>{ $(id).value=''; $(id).classList.remove('bad'); });
  $('lo-msg').innerHTML='';
}

/* ---------- Usuarios (coordinadora) ---------- */
async function loadUsuarios(){
  const tbody = document.querySelector('#page-usuarios tbody');
  if(!tbody) return;
  try{
    const us = await api('/usuarios');
    const ROL = { enfermeria:'Enfermería', coordinadora:'Coordinadora', jefa:'Jefa', proveedora:'Proveedora' };
    tbody.innerHTML = us.map(u=>`
      <tr>
        <td data-label="Correo">${u.correo}</td>
        <td data-label="Rol">${ROL[u.rol]||u.rol}</td>
        <td data-label="Estado"><span class="pill ${u.activo?'act':'ina'}">${u.activo?'Activo':'Inactivo'}</span></td>
        <td data-label="Acciones">
          <button class="iconbtn" onclick="resetPass(${u.id})">Resetear</button>
          <button class="iconbtn ${u.activo?'del':''}" onclick="toggleUser(${u.id})">${u.activo?'Desactivar':'Activar'}</button>
        </td>
      </tr>`).join('');
  }catch(err){ toast('err', err.message); }
}
async function toggleUser(id){
  try{ const r = await api(`/usuarios/${id}/estado`, { method:'PATCH' }); toast('ok', r.mensaje); loadUsuarios(); }
  catch(err){ toast('err', err.message); }
}
async function resetPass(id){
  const nueva = prompt('Nueva contraseña para el usuario:');
  if(!nueva) return;
  try{ const r = await api(`/usuarios/${id}/password`, { method:'PATCH', body: JSON.stringify({ password:nueva }) }); toast('ok', r.mensaje); }
  catch(err){ toast('err', err.message); }
}

/* ---------- Excel (representado: la generación real se implementa en la etapa final) ---------- */
function openExcelEsp(){ $('ex-msg').innerHTML=''; $('ex-vac').value=''; $('ovExcel').classList.add('on'); }
function doExcelEsp(){ const v=$('ex-vac'); if(!v.value){ v.classList.add('bad'); return msg('ex-msg','err','Elegí una vacuna.'); } v.classList.remove('bad'); closeOv('ovExcel'); toast('info','Generando Excel — Stock de '+v.options[v.selectedIndex].text+'… (en desarrollo)'); }
function openExcelMov(){ $('exm-msg').innerHTML=''; $('exm-tipo').value=''; $('ovExcelMov').classList.add('on'); }
function doExcelMov(){ const t=$('exm-tipo'); if(!t.value){ t.classList.add('bad'); return msg('exm-msg','err','Elegí un tipo de movimiento.'); } t.classList.remove('bad'); closeOv('ovExcelMov'); toast('info','Generando Excel — '+t.value+'… (en desarrollo)'); }
function closeOv(id){ $(id).classList.remove('on'); }

/* ---------- Init ---------- */
$('p').addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });
