/* ============================================================
   app.js — logique de l'interface (Frontend Navigateur)
   ============================================================ */

const UNITS = ['kg','g','litre','ml','bouteille','pièce','paquet','boîte','sac','carton','douzaine','autre'];
const REASONS = ['Repas clients / Riad','Repas staff','Stock','Petit-déjeuner','Déjeuner','Dîner','Événement','Autre'];
const STATUSES = ['Demandé','Validé','Acheté','Reçu','Annulé'];
const STATUS_CLASS = {'Demandé':'status-Demande','Validé':'status-Valide','Acheté':'status-Achete','Reçu':'status-Recu','Annulé':'status-Annule'};
const MONTHS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const POLL_INTERVAL_MS = 15000;

let state = {
  loaded:false,
  apiOk:true,
  role:null,
  pendingRole:null,
  userName:'',
  requests:[],
  passwordError:'',
  changingPassword:false,
  changePasswordError:'',
  kitchenNavDate: todayStr(),
  kitchenShowAll:false,
  kitchenEditingId:null,
  managerTab:'dashboard',
  managerFilters:{dateFrom:'',dateTo:'',product:'',reason:'',status:'',search:''},
  historyFilters:{dateFrom:'',dateTo:'',product:'',reason:'',status:'',search:'',year:''},
  managerEditingId:null,
  historyEditingId:null,
  confirmingDelete:new Set(),
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),
  calSelectedDate: todayStr(),
};
let pollTimer = null;

function pad(n){return String(n).padStart(2,'0');}
function todayStr(){const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
function addDays(dateStr,delta){
  const [y,m,d]=dateStr.split('-').map(Number);
  const dt=new Date(y,m-1,d);
  dt.setDate(dt.getDate()+delta);
  return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`;
}
function formatLong(dateStr){
  const [y,m,d]=dateStr.split('-').map(Number);
  const dt=new Date(y,m-1,d);
  const wd = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'][dt.getDay()];
  return `${wd} ${d} ${MONTHS[m-1]} ${y}`;
}
function capitalize(s){return s.charAt(0).toUpperCase()+s.slice(1);}
function escapeHtml(s){
  return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;n'}[c]));
}
function uniqueProducts(){
  const set=new Set();
  state.requests.forEach(r=>set.add(r.product));
  return Array.from(set).sort();
}

async function apiGetRequests(){
  const res = await fetch('/api/requests');
  if(!res.ok) throw new Error('Échec de chargement');
  return res.json();
}
async function apiCreateRequest(payload){
  const res = await fetch('/api/requests', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
  const data = await res.json();
  if(!res.ok) throw new Error(data.error || 'Échec de création');
  return data;
}
async function apiUpdateRequest(id, payload){
  const res = await fetch(`/api/requests/${id}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
  const data = await res.json();
  if(!res.ok) throw new Error(data.error || 'Échec de mise à jour');
  return data;
}
async function apiDeleteRequest(id){
  const res = await fetch(`/api/requests/${id}`, {method:'DELETE'});
  if(!res.ok && res.status!==204) throw new Error('Échec de suppression');
}
async function apiLogin(password){
  const res = await fetch('/api/auth/login', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({password})});
  return res.json();
}

async function loadAll(){
  try{
    state.requests = await apiGetRequests();
    state.apiOk = true;
  }catch(e){
    state.requests = [];
    state.apiOk = false;
  }
  state.loaded = true;
  renderRoot();
  startPolling();
}
function startPolling(){
  if(pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async ()=>{
    if(!state.role) return;
    try{
      state.requests = await apiGetRequests();
      state.apiOk = true;
    }catch(e){
      state.apiOk = false;
      return;
    }
    if(state.role==='kitchen' && !state.kitchenEditingId) refreshKitchenList();
  }, POLL_INTERVAL_MS);
}

function sortedByDateDesc(arr){
  return [...arr].sort((a,b)=> a.date===b.date ? (b.createdAt||'').localeCompare(b.createdAt||'') : b.date.localeCompare(a.date));
}
function sortedByDateAsc(arr){
  return [...arr].sort((a,b)=> a.date===b.date ? (a.createdAt||'').localeCompare(b.createdAt||'') : a.date.localeCompare(b.date));
}

function renderRoot(){
  const app = document.getElementById('app');
  if(!state.loaded){
    app.innerHTML = `<div class="loading-screen">Ouverture du registre…</div>`;
    return;
  }
  if(!state.role && state.pendingRole==='manager'){
    app.innerHTML = passwordScreenHtml();
    attachPasswordScreenEvents();
    return;
  }
  if(!state.role){
    app.innerHTML = roleScreenHtml();
    attachRoleScreenEvents();
    return;
  }
  if(state.role==='kitchen'){
    app.innerHTML = kitchenScreenHtml();
    attachKitchenEvents();
    refreshKitchenList();
    return;
  }
  app.innerHTML = managerScreenHtml();
  attachManagerTabEvents();
}

function roleScreenHtml(){
  return `
  <div class="role-screen">
    <div class="role-card">
      <img src="assets/logo.jpg" alt="Le Jardin des Sens" class="role-logo">
      <div class="role-eyebrow">Registre des achats</div>
      <h1 class="role-title">Qui es-tu aujourd'hui ?</h1>
      <p class="role-sub">Choisis ton espace pour commencer.</p>
      <div class="role-options">
        <button class="role-btn" data-role="kitchen">
          <div><div class="rt">Cuisine</div><div class="rd">Créer une demande d'achat, suivre son statut</div></div>
          <div class="arrow">→</div>
        </button>
        <button class="role-btn" data-role="manager">
          <div><div class="rt">Manager</div><div class="rd">Valider, suivre et consulter l'historique des achats</div></div>
          <div class="arrow">→</div>
        </button>
      </div>
      <div class="name-field">
        <label for="userNameInput">Ton prénom (optionnel)</label>
        <input type="text" id="userNameInput" placeholder="ex. Malika" value="${escapeHtml(state.userName)}">
      </div>
    </div>
  </div>`;
}
function attachRoleScreenEvents(){
  document.querySelectorAll('.role-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const nameVal = document.getElementById('userNameInput').value.trim();
      state.userName = nameVal;
      if(btn.dataset.role==='manager'){
        state.pendingRole = 'manager';
        state.passwordError = '';
        renderRoot();
      } else {
        state.role = 'kitchen';
        renderRoot();
      }
    });
  });
}

function passwordScreenHtml(){
  return `
  <div class="role-screen">
    <div class="role-card">
      <img src="assets/logo.jpg" alt="Le Jardin des Sens" class="role-logo">
      <div class="role-eyebrow">Espace Manager</div>
      <h1 class="role-title">Mot de passe</h1>
      <form id="passwordForm">
        <div class="name-field">
          <label for="pwdInput">Mot de passe</label>
          <input type="password" id="pwdInput" autofocus>
        </div>
        ${state.passwordError ? `<div class="form-note" style="color:var(--red);">${escapeHtml(state.passwordError)}</div>` : ''}
        <button type="submit" class="role-enter">Entrer</button>
        <button type="button" class="btn-ghost" id="backToRoleBtn" style="width:100%;margin-top:10px;">← Retour</button>
      </form>
    </div>
  </div>`;
}
function attachPasswordScreenEvents(){
  const form = document.getElementById('passwordForm');
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const val = document.getElementById('pwdInput').value;
    try{
      const {ok} = await apiLogin(val);
      if(ok){
        state.role = 'manager';
        state.pendingRole = null;
        state.passwordError = '';
        renderRoot();
      } else {
        state.passwordError = 'Mot de passe incorrect.';
        renderRoot();
      }
    }catch(err){
      state.passwordError = 'Serveur injoignable.';
      renderRoot();
    }
  });
  document.getElementById('backToRoleBtn').addEventListener('click',()=>{
    state.pendingRole = null;
    state.passwordError = '';
    renderRoot();
  });
}

function topbarHtml(roleLabel){
  return `
  <div class="topbar">
    <div class="brand-block">
      <img src="assets/logo.jpg" alt="Le Jardin des Sens" class="brand-logo">
      <div class="brand">Registre des achats <span class="who">— ${roleLabel}</span></div>
    </div>
    <div class="topbar-right">
      <button class="switch-role" id="switchRoleBtn">Changer d'espace</button>
    </div>
  </div>`;
}
function attachTopbarEvents(){
  const b = document.getElementById('switchRoleBtn');
  if(b) b.addEventListener('click',()=>{
    state.role=null; state.pendingRole=null; renderRoot();
  });
}

function kitchenScreenHtml(){
  return `
  <div class="shell">
    ${topbarHtml('Cuisine')}
    <div class="section-head"><h2>Nouvelle demande</h2></div>
    <div class="form-card" id="kitchenFormWrap">${kitchenFormHtml()}</div>
    <div class="section-head">
      <h2>Demandes</h2>
      <div class="date-nav" id="kitchenDateNav">
        <button class="navbtn" id="kPrev">‹</button>
        <span class="current-date" id="kCurrentDate">${capitalize(formatLong(state.kitchenNavDate))}</span>
        <button class="navbtn" id="kNext">›</button>
        <button class="today-btn" id="kToday">Aujourd'hui</button>
        <button class="today-btn" id="kToggleAll">${state.kitchenShowAll ? 'Voir ce jour' : 'Voir tout'}</button>
      </div>
    </div>
    <div id="kitchenListWrap"></div>
  </div>`;
}
function kitchenFormHtml(editing){
  const r = editing || {};
  const dateVal = r.date || state.kitchenNavDate || todayStr();
  return `
  <form id="kitchenForm" data-editing="${editing?editing.id:''}">
    <div class="form-grid">
      <div class="field"><label>Date</label><input type="date" name="date" value="${dateVal}" required></div>
      <div class="field"><label>Produit</label><input type="text" name="product" list="productList" value="${escapeHtml(r.product||'')}" required><datalist id="productList">${uniqueProducts().map(p=>`<option value="${escapeHtml(p)}">`).join('')}</datalist></div>
      <div class="field full"><div class="qty-row">
        <div class="field"><label>Quantité</label><input type="number" name="quantity" min="0" step="0.01" value="${r.quantity!=null?r.quantity:''}" required></div>
        <div class="field"><label>Unité</label><select name="unit" required><option value="" disabled ${!r.unit?'selected':''}>Choisir…</option>${UNITS.map(u=>`<option value="${u}" ${r.unit===u?'selected':''}>${u}</option>`).join('')}</select></div>
      </div></div>
      <div class="field full"><label>Raison</label><select name="reason" required><option value="" disabled ${!r.reason?'selected':''}>Choisir…</option>${REASONS.map(rs=>`<option value="${rs}" ${r.reason===rs?'selected':''}>${rs}</option>`).join('')}</select></div>
      <div class="field"><label>Repas</label><input type="number" name="meals" min="0" value="${r.mealsCount!=null?r.mealsCount:''}"></div>
      <div class="field"><label>Personnes</label><input type="number" name="people" min="0" value="${r.peopleCount!=null?r.peopleCount:''}"></div>
      <div class="field full"><label>Nom</label><input type="text" name="requester" value="${escapeHtml(r.createdBy!=null?r.createdBy:state.userName)}" required></div>
      <div class="field full"><label>Commentaire</label><textarea name="comment">${escapeHtml(r.comment||'')}</textarea></div>
    </div>
    <div class="form-actions">
      <button type="submit" class="btn-primary">${editing?'Modifier':'Ajouter'}</button>
      ${editing?`<button type="button" class="btn-ghost" id="cancelEditBtn">Annuler</button>`:''}
    </div>
  </form>`;
}
function attachKitchenEvents(){
  attachTopbarEvents();
  document.getElementById('kPrev').addEventListener('click',()=>{state.kitchenNavDate=addDays(state.kitchenNavDate,-1);refreshKitchenList();});
  document.getElementById('kNext').addEventListener('click',()=>{state.kitchenNavDate=addDays(state.kitchenNavDate,1);refreshKitchenList();});
  document.getElementById('kToday').addEventListener('click',()=>{state.kitchenNavDate=todayStr();refreshKitchenList();});
  document.getElementById('kToggleAll').addEventListener('click',()=>{state.kitchenShowAll=!state.kitchenShowAll;renderRoot();});
  attachKitchenFormEvents();
}
function attachKitchenFormEvents(){
  const form = document.getElementById('kitchenForm');
  if(!form) return;
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const fd = new FormData(form);
    const editingId = form.dataset.editing;
    const payload = {
      date: fd.get('date'),
      product: fd.get('product').trim(),
      quantity: parseFloat(fd.get('quantity')),
      unit: fd.get('unit'),
      reason: fd.get('reason'),
      mealsCount: fd.get('meals') ? parseInt(fd.get('meals')) : null,
      peopleCount: fd.get('people') ? parseInt(fd.get('people')) : null,
      comment: fd.get('comment').trim(),
      createdBy: fd.get('requester').trim(),
    };
    try{
      if(editingId){ await apiUpdateRequest(editingId, payload); state.kitchenEditingId = null; }
      else { await apiCreateRequest(payload); state.userName = payload.createdBy; }
      state.requests = await apiGetRequests();
      renderRoot();
    }catch(err){ alert(err.message); }
  });
  const cancel = document.getElementById('cancelEditBtn');
  if(cancel) cancel.addEventListener('click',()=>{ state.kitchenEditingId=null; renderRoot(); });
}
function refreshKitchenList(){
  const wrap = document.getElementById('kitchenListWrap');
  if(!wrap) return;
  const list = state.kitchenShowAll ? sortedByDateDesc(state.requests) : sortedByDateAsc(state.requests.filter(r=>r.date===state.kitchenNavDate));
  wrap.innerHTML = ledgerHtml(list, 'kitchen');
  attachLedgerEvents(wrap, 'kitchen');
}

function ledgerHtml(list, context){
  if(list.length===0) return `<div class="empty-state">Aucune demande.</div>`;
  let html = `<div class="ledger">`;
  list.forEach((r,i)=>{
    const canEdit = context==='kitchen' ? r.status==='Demandé' : true;
    html += `
    <div class="entry" data-id="${r.id}">
      <div class="num">${i+1}.</div>
      <div class="main">
        <div class="product-line"><span class="product">${escapeHtml(r.product)}</span> <span class="qty">${r.quantity} ${escapeHtml(r.unit)}</span></div>
        <div class="sub">${formatLong(r.date)} · ${escapeHtml(r.reason)} · par ${escapeHtml(r.createdBy||'—')}</div>
        ${r.comment ? `<div class="comment">${escapeHtml(r.comment)}</div>` : ''}
      </div>
      <div class="side">
        <span class="status-tag ${STATUS_CLASS[r.status]}">${r.status}</span>
        <div class="row-actions">${canEdit ? `<button class="link-btn" data-action="edit" data-id="${r.id}">Modifier</button>` : ''}</div>
      </div>
    </div>`;
  });
  html += `</div>`;
  return html;
}
function attachLedgerEvents(container, context){
  container.querySelectorAll('[data-action="edit"]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const id = btn.dataset.id;
      if(context==='kitchen'){ state.kitchenEditingId=id; refreshKitchenList(); }
    });
  });
}

function managerScreenHtml(){
  return `<div class="shell">${topbarHtml('Manager')}<div class="section-head"><h2>Espace Manager</h2></div><p>Connexion réussie. Bienvenue dans l'espace de gestion.</p></div>`;
}
function attachManagerTabEvents(){ attachTopbarEvents(); }

// Lancement de l'application
loadAll();
