/* ============================================================
   app.js — logique de l'interface. Toutes les données passent
   par l'API du backend (fetch), plus de stockage local : c'est
   ce qui permet à plusieurs téléphones de voir les mêmes données.
   ============================================================ */

const UNITS = ['kg','g','litre','ml','bouteille','pièce','paquet','boîte','sac','carton','douzaine','autre'];
const REASONS = ['Repas clients / Riad','Repas staff','Stock','Petit-déjeuner','Déjeuner','Dîner','Événement','Autre'];
const STATUSES = ['Demandé','Validé','Acheté','Reçu','Annulé'];
const STATUS_CLASS = {'Demandé':'status-Demande','Validé':'status-Valide','Acheté':'status-Achete','Reçu':'status-Recu','Annulé':'status-Annule'};
const DOW = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
const MONTHS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const POLL_INTERVAL_MS = 15000; // rafraîchissement périodique pour la synchro multi-appareils

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

/* ================= HELPERS ================= */
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
  return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function uniqueProducts(){
  const set=new Set();
  state.requests.forEach(r=>set.add(r.product));
  return Array.from(set).sort();
}

/* ================= API LAYER ================= */
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
async function apiChangePassword(currentPassword, newPassword){
  const res = await fetch('/api/auth/change-password', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({currentPassword,newPassword})});
  const data = await res.json();
  return {ok: res.ok && data.ok, error: data.error};
}

/* ================= LOAD / POLL ================= */
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
    // Rafraîchit uniquement les listes affichées, jamais les formulaires en cours de saisie.
    if(state.role==='kitchen' && !state.kitchenEditingId) refreshKitchenList();
    if(state.role==='manager'){
      if(state.managerTab==='dashboard' && !state.managerEditingId){
        renderTodayList();
        renderFilteredList('managerFilters','filteredListWrap','manager');
      }
      if(state.managerTab==='calendar' && !state.managerEditingId){
        renderCalGrid();
        renderCalDayPanel();
      }
      if(state.managerTab==='history' && !state.historyEditingId){
        renderFilteredList('historyFilters','historyListWrap','history');
      }
    }
  }, POLL_INTERVAL_MS);
}

/* ================= FILTERING (côté client, sur la liste déjà chargée) ================= */
function matchesFilters(r, f){
  if(f.dateFrom && r.date < f.dateFrom) return false;
  if(f.dateTo && r.date > f.dateTo) return false;
  if(f.product && r.product !== f.product) return false;
  if(f.reason && r.reason !== f.reason) return false;
  if(f.status && r.status !== f.status) return false;
  if(f.year && !r.date.startsWith(f.year)) return false;
  if(f.search){
    const s = f.search.toLowerCase();
    const hay = (r.product+' '+(r.comment||'')+' '+(r.createdBy||'')).toLowerCase();
    if(!hay.includes(s)) return false;
  }
  return true;
}
function sortedByDateDesc(arr){
  return [...arr].sort((a,b)=> a.date===b.date ? (b.createdAt||'').localeCompare(a.createdAt||'') : b.date.localeCompare(a.date));
}
function sortedByDateAsc(arr){
  return [...arr].sort((a,b)=> a.date===b.date ? (a.createdAt||'').localeCompare(b.createdAt||'') : a.date.localeCompare(b.date));
}

/* ================= ROOT RENDER ================= */
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
  renderManagerTabBody();
}

/* ================= ROLE SCREEN ================= */
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
        <label for="userNameInput">Ton prénom (optionnel, pré-remplit le formulaire)</label>
        <input type="text" id="userNameInput" placeholder="ex. Malika" value="${escapeHtml(state.userName)}">
      </div>
      ${!state.apiOk ? `<div class="banner" style="text-align:left;margin-top:20px;">Impossible de contacter le serveur. Vérifie ta connexion, ou que le serveur est bien démarré.</div>` : ''}
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

/* ================= PASSWORD SCREEN ================= */
function passwordScreenHtml(){
  return `
  <div class="role-screen">
    <div class="role-card">
      <img src="assets/logo.jpg" alt="Le Jardin des Sens" class="role-logo">
      <div class="role-eyebrow">Espace Manager</div>
      <h1 class="role-title">Mot de passe</h1>
      <p class="role-sub">Cet espace permet de valider, modifier et supprimer les demandes.</p>
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
      state.passwordError = 'Impossible de vérifier le mot de passe (serveur injoignable).';
      renderRoot();
    }
  });
  document.getElementById('backToRoleBtn').addEventListener('click',()=>{
    state.pendingRole = null;
    state.passwordError = '';
    renderRoot();
  });
}

/* ================= SHARED: TOPBAR ================= */
function topbarHtml(roleLabel, showChangePwd){
  return `
  <div class="topbar">
    <div class="brand-block">
      <img src="assets/logo.jpg" alt="Le Jardin des Sens" class="brand-logo">
      <div class="brand">Registre des achats <span class="who">— ${roleLabel}</span></div>
    </div>
    <div class="topbar-right">
      ${showChangePwd ? `<button class="switch-role" id="changePwdBtn">Changer le mot de passe</button>` : ''}
      <button class="switch-role" id="switchRoleBtn">Changer d'espace</button>
    </div>
  </div>
  ${!state.apiOk ? `<div class="banner">Connexion au serveur momentanément indisponible — les dernières actions n'ont peut-être pas été enregistrées.</div>` : ''}
  `;
}
function attachTopbarEvents(){
  const b = document.getElementById('switchRoleBtn');
  if(b) b.addEventListener('click',()=>{
    state.role=null;
    state.pendingRole=null;
    state.changingPassword=false;
    renderRoot();
  });
  const p = document.getElementById('changePwdBtn');
  if(p) p.addEventListener('click',()=>{
    state.changingPassword = true;
    state.changePasswordError = '';
    renderRoot();
  });
}

/* ================= CHANGE PASSWORD ================= */
function changePasswordFormHtml(){
  return `
  <div class="form-card" style="margin-bottom:26px;">
    <div class="section-head" style="margin-top:0;"><h2>Changer le mot de passe manager</h2></div>
    <form id="changePwdForm">
      <div class="form-grid">
        <div class="field full"><label>Mot de passe actuel</label><input type="password" name="current" required></div>
        <div class="field"><label>Nouveau mot de passe</label><input type="password" name="new1" required minlength="4"></div>
        <div class="field"><label>Confirmer le nouveau</label><input type="password" name="new2" required minlength="4"></div>
      </div>
      ${state.changePasswordError ? `<div class="form-note" style="color:var(--red);">${escapeHtml(state.changePasswordError)}</div>` : ''}
      <div class="form-actions">
        <button type="submit" class="btn-primary">Enregistrer</button>
        <button type="button" class="btn-ghost" id="cancelChangePwd">Annuler</button>
      </div>
    </form>
  </div>`;
}
function attachChangePasswordEvents(){
  const form = document.getElementById('changePwdForm');
  if(!form) return;
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const fd = new FormData(form);
    const new1 = fd.get('new1'), new2 = fd.get('new2');
    if(new1 !== new2){
      state.changePasswordError = 'Les deux nouveaux mots de passe ne correspondent pas.';
      renderRoot();
      return;
    }
    try{
      const {ok, error} = await apiChangePassword(fd.get('current'), new1);
      if(ok){
        state.changingPassword = false;
        state.changePasswordError = '';
      } else {
        state.changePasswordError = error || 'Échec du changement de mot de passe.';
      }
    }catch(err){
      state.changePasswordError = 'Serveur injoignable — réessaie dans un instant.';
    }
    renderRoot();
  });
  const cancel = document.getElementById('cancelChangePwd');
  if(cancel) cancel.addEventListener('click',()=>{
    state.changingPassword = false;
    state.changePasswordError = '';
    renderRoot();
  });
}

/* ================= KITCHEN SCREEN ================= */
function kitchenScreenHtml(){
  return `
  <div class="shell">
    ${topbarHtml('Cuisine')}

    <div class="section-head"><h2>Nouvelle demande</h2></div>
    <div class="form-card" id="kitchenFormWrap">
      ${kitchenFormHtml()}
    </div>

    <div class="section-head">
      <h2>Demandes</h2>
      <div class="date-nav" id="kitchenDateNav">
        <button class="navbtn" id="kPrev">‹</button>
        <span class="current-date" id="kCurrentDate">${capitalize(formatLong(state.kitchenNavDate))}</span>
        <button class="navbtn" id="kNext">›</button>
        <button class="today-btn" id="kToday">Aujourd'hui</button>
        <button class="today-btn" id="kToggleAll">${state.kitchenShowAll ? 'Voir ce jour' : 'Voir toutes les demandes'}</button>
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
      <div class="field">
        <label>Date</label>
        <input type="date" name="date" value="${dateVal}" required>
      </div>
      <div class="field">
        <label>Produit</label>
        <input type="text" name="product" list="productList" placeholder="ex. Tomates" value="${escapeHtml(r.product||'')}" required>
        <datalist id="productList">${uniqueProducts().map(p=>`<option value="${escapeHtml(p)}">`).join('')}</datalist>
      </div>
      <div class="field full">
        <div class="qty-row">
          <div class="field">
            <label>Quantité</label>
            <input type="number" name="quantity" min="0" step="0.01" value="${r.quantity!=null?r.quantity:''}" required>
          </div>
          <div class="field">
            <label>Unité</label>
            <select name="unit" required>
              <option value="" disabled ${!r.unit?'selected':''}>Choisir…</option>
              ${UNITS.map(u=>`<option value="${u}" ${r.unit===u?'selected':''}>${u}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
      <div class="field full">
        <label>Raison</label>
        <select name="reason" required>
          <option value="" disabled ${!r.reason?'selected':''}>Choisir…</option>
          ${REASONS.map(rs=>`<option value="${rs}" ${r.reason===rs?'selected':''}>${rs}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Nombre de repas (facultatif)</label>
        <input type="number" name="meals" min="0" step="1" value="${r.mealsCount!=null?r.mealsCount:''}">
      </div>
      <div class="field">
        <label>Nombre de personnes (facultatif)</label>
        <input type="number" name="people" min="0" step="1" value="${r.peopleCount!=null?r.peopleCount:''}">
      </div>
      <div class="field full">
        <label>Nom (demandé par)</label>
        <input type="text" name="requester" placeholder="ex. Malika" value="${escapeHtml(r.createdBy!=null?r.createdBy:state.userName)}" required>
      </div>
      <div class="field full">
        <label>Commentaire (facultatif)</label>
        <textarea name="comment" placeholder="ex. Pour le dîner">${escapeHtml(r.comment||'')}</textarea>
      </div>
    </div>
    <div class="form-actions">
      <button type="submit" class="btn-primary">${editing?'Enregistrer les modifications':'Ajouter la demande'}</button>
      ${editing?`<button type="button" class="btn-ghost" id="cancelEditBtn">Annuler</button>`:''}
    </div>
    ${state.kitchenFormError ? `<div class="form-note" style="color:var(--red);">${escapeHtml(state.kitchenFormError)}</div>` : ''}
    ${!editing?`<div class="form-note">La demande est enregistrée avec la date et l'heure actuelles.</div>`:''}
  </form>`;
}
function attachKitchenEvents(){
  attachTopbarEvents();
  document.getElementById('kPrev').addEventListener('click',()=>{state.kitchenNavDate=addDays(state.kitchenNavDate,-1);state.kitchenShowAll=false;updateKitchenHeader();refreshKitchenList();});
  document.getElementById('kNext').addEventListener('click',()=>{state.kitchenNavDate=addDays(state.kitchenNavDate,1);state.kitchenShowAll=false;updateKitchenHeader();refreshKitchenList();});
  document.getElementById('kToday').addEventListener('click',()=>{state.kitchenNavDate=todayStr();state.kitchenShowAll=false;updateKitchenHeader();refreshKitchenList();});
  document.getElementById('kToggleAll').addEventListener('click',()=>{state.kitchenShowAll=!state.kitchenShowAll;renderRoot();});
  attachKitchenFormEvents();
}
function updateKitchenHeader(){
  document.getElementById('kCurrentDate').textContent = capitalize(formatLong(state.kitchenNavDate));
}
function attachKitchenFormEvents(){
  const form = document.getElementById('kitchenForm');
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
      if(editingId){
        await apiUpdateRequest(editingId, payload);
        state.kitchenEditingId = null;
      } else {
        await apiCreateRequest(payload);
        state.userName = payload.createdBy;
      }
      state.requests = await apiGetRequests();
      state.apiOk = true;
      state.kitchenFormError = '';
      renderRoot();
    }catch(err){
      state.kitchenFormError = err.message || 'Une erreur est survenue, réessaie.';
      renderRoot();
    }
  });
  const cancelBtn = document.getElementById('cancelEditBtn');
  if(cancelBtn) cancelBtn.addEventListener('click',()=>{ state.kitchenEditingId=null; renderRoot(); });
}
function refreshKitchenList(){
  const wrap = document.getElementById('kitchenListWrap');
  if(!wrap) return;
  let list;
  if(state.kitchenShowAll){
    list = sortedByDateDesc(state.requests);
  } else {
    list = sortedByDateAsc(state.requests.filter(r=>r.date===state.kitchenNavDate));
  }
  if(state.kitchenEditingId){
    const req = state.requests.find(r=>r.id===state.kitchenEditingId);
    wrap.innerHTML = `<div class="inline-edit">${kitchenFormHtml(req)}</div>` + ledgerHtml(list, 'kitchen');
    attachKitchenFormEvents();
  } else {
    wrap.innerHTML = ledgerHtml(list, 'kitchen');
  }
  attachLedgerEvents(wrap, 'kitchen');
}

/* ================= LEDGER (rendu partagé des listes) ================= */
function ledgerHtml(list, context){
  if(list.length===0){
    return `<div class="empty-state">Aucune demande pour l'instant. La première apparaîtra ici dès qu'elle sera ajoutée.</div>`;
  }
  let html = `<div class="ledger">`;
  list.forEach((r,i)=>{
    const canEdit = context==='kitchen' ? r.status==='Demandé' : true;
    const confirming = state.confirmingDelete.has(r.id);
    html += `
    <div class="entry" data-id="${r.id}">
      <div class="num">${i+1}.</div>
      <div class="main">
        <div class="product-line">
          <span class="product">${escapeHtml(r.product)}</span>
          <span class="qty">${r.quantity} ${escapeHtml(r.unit)}</span>
        </div>
        <div class="sub">${formatLong(r.date)} · ${escapeHtml(r.reason)} · demandé par ${escapeHtml(r.createdBy||'—')}${(r.mealsCount||r.peopleCount) ? ' · '+[r.mealsCount?`${r.mealsCount} repas`:null, r.peopleCount?`${r.peopleCount} pers.`:null].filter(Boolean).join(' · ') : ''}</div>
        ${r.comment ? `<div class="comment">${escapeHtml(r.comment)}</div>` : ''}
      </div>
      <div class="side">
        ${context==='manager' ? `
          <select class="status-select" data-action="setstatus" data-id="${r.id}">
            ${STATUSES.map(s=>`<option value="${s}" ${r.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
        ` : `<span class="status-tag ${STATUS_CLASS[r.status]}">${r.status}</span>`}
        <div class="row-actions">
          ${canEdit ? `<button class="link-btn" data-action="edit" data-id="${r.id}">Modifier</button>` : ''}
          ${context==='manager' ? `<button class="link-btn danger" data-action="delete" data-id="${r.id}">${confirming?'Confirmer ?':'Supprimer'}</button>` : ''}
        </div>
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
      else if(context==='manager'){ state.managerEditingId=id; renderManagerTabBody(); }
      else if(context==='history'){ state.historyEditingId=id; renderManagerTabBody(); }
    });
  });
  container.querySelectorAll('[data-action="delete"]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.id;
      if(state.confirmingDelete.has(id)){
        try{
          await apiDeleteRequest(id);
          state.requests = await apiGetRequests();
          state.apiOk = true;
        }catch(e){ state.apiOk = false; }
        state.confirmingDelete.delete(id);
        renderManagerTabBody();
      } else {
        state.confirmingDelete.add(id);
        renderManagerTabBody();
      }
    });
  });
  container.querySelectorAll('[data-action="setstatus"]').forEach(sel=>{
    sel.addEventListener('change', async ()=>{
      const id = sel.dataset.id;
      try{
        await apiUpdateRequest(id, {status: sel.value});
        state.requests = await apiGetRequests();
        state.apiOk = true;
      }catch(e){ state.apiOk = false; }
      renderManagerTabBody();
    });
  });
}

/* ================= MANAGER SCREEN ================= */
function managerScreenHtml(){
  return `
  <div class="shell">
    ${topbarHtml('Manager', true)}
    ${state.changingPassword ? changePasswordFormHtml() : ''}
    <div class="tabs">
      <button class="tab-btn ${state.managerTab==='dashboard'?'active':''}" data-tab="dashboard">Tableau de bord</button>
      <button class="tab-btn ${state.managerTab==='calendar'?'active':''}" data-tab="calendar">Calendrier</button>
      <button class="tab-btn ${state.managerTab==='history'?'active':''}" data-tab="history">Historique</button>
    </div>
    <div id="managerTabBody"></div>
  </div>`;
}
function attachManagerTabEvents(){
  attachTopbarEvents();
  attachChangePasswordEvents();
  document.querySelectorAll('.tab-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      state.managerTab = btn.dataset.tab;
      renderRoot();
    });
  });
}
function renderManagerTabBody(){
  const body = document.getElementById('managerTabBody');
  if(state.managerTab==='dashboard') return renderDashboardTab(body);
  if(state.managerTab==='calendar') return renderCalendarTab(body);
  return renderHistoryTab(body);
}

/* ---------- dashboard tab ---------- */
function renderDashboardTab(body){
  const today = todayStr();
  const counts = {
    today: state.requests.filter(r=>r.date===today).length,
    pending: state.requests.filter(r=>r.status==='Demandé').length,
    validated: state.requests.filter(r=>r.status==='Validé').length,
    purchased: state.requests.filter(r=>r.status==='Acheté').length,
    received: state.requests.filter(r=>r.status==='Reçu').length,
  };
  body.innerHTML = `
    <div class="stats-row">
      <div class="stat"><div class="n">${counts.today}</div><div class="l">Achats à traiter aujourd'hui</div></div>
      <div class="stat"><div class="n">${counts.pending}</div><div class="l">Demandes en attente</div></div>
      <div class="stat"><div class="n">${counts.validated}</div><div class="l">Demandes validées</div></div>
      <div class="stat"><div class="n">${counts.purchased}</div><div class="l">Achats effectués</div></div>
      <div class="stat"><div class="n">${counts.received}</div><div class="l">Achats reçus</div></div>
    </div>

    <div class="section-head"><h2>Achats du jour</h2><span class="meta">${capitalize(formatLong(today))}</span></div>
    <div id="todayListWrap"></div>

    <div class="section-head"><h2>Toutes les demandes</h2></div>
    ${filtersHtml('managerFilters')}
    <div id="filteredListWrap"></div>
  `;
  renderTodayList();
  attachFilterEvents('managerFilters','filteredListWrap','manager');
  renderFilteredList('managerFilters','filteredListWrap','manager');
}
function renderTodayList(){
  const wrap = document.getElementById('todayListWrap');
  if(!wrap) return;
  const today = todayStr();
  let list = sortedByDateAsc(state.requests.filter(r=>r.date===today));
  if(state.managerEditingId && list.some(r=>r.id===state.managerEditingId)){
    const req = state.requests.find(r=>r.id===state.managerEditingId);
    wrap.innerHTML = `<div class="inline-edit">${managerEditFormHtml(req)}</div>` + ledgerHtml(list,'manager');
    attachManagerEditFormEvents();
  } else {
    wrap.innerHTML = ledgerHtml(list,'manager');
  }
  attachLedgerEvents(wrap,'manager');
}

/* ---------- filters (dashboard + historique) ---------- */
function filtersHtml(stateKey, includeYear){
  const f = state[stateKey];
  return `
  <div class="filters" id="${stateKey}Filters">
    <div class="field"><label>Du</label><input type="date" data-f="dateFrom" value="${f.dateFrom||''}"></div>
    <div class="field"><label>Au</label><input type="date" data-f="dateTo" value="${f.dateTo||''}"></div>
    <div class="field"><label>Produit</label>
      <select data-f="product">
        <option value="">Tous</option>
        ${uniqueProducts().map(p=>`<option value="${escapeHtml(p)}" ${f.product===p?'selected':''}>${escapeHtml(p)}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>Raison</label>
      <select data-f="reason">
        <option value="">Toutes</option>
        ${REASONS.map(rs=>`<option value="${rs}" ${f.reason===rs?'selected':''}>${rs}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>Statut</label>
      <select data-f="status">
        <option value="">Tous</option>
        ${STATUSES.map(s=>`<option value="${s}" ${f.status===s?'selected':''}>${s}</option>`).join('')}
      </select>
    </div>
    ${includeYear ? `
    <div class="field"><label>Année</label>
      <input type="number" data-f="year" placeholder="Toutes" value="${escapeHtml(f.year||'')}">
    </div>` : `<div class="field"><label>Recherche</label><input type="text" data-f="search" placeholder="produit, nom, note…" value="${escapeHtml(f.search||'')}"></div>`}
    ${includeYear ? `<div class="field full-search"><label>Recherche</label><input type="text" data-f="search" placeholder="produit, nom, note…" value="${escapeHtml(f.search||'')}"></div>` : ''}
    <div class="clear"><button class="link-btn" id="${stateKey}Clear" type="button">Réinitialiser les filtres</button></div>
  </div>`;
}
function attachFilterEvents(stateKey, resultsId, context){
  const box = document.getElementById(stateKey+'Filters');
  box.querySelectorAll('[data-f]').forEach(el=>{
    const evt = el.tagName==='SELECT' ? 'change' : 'input';
    el.addEventListener(evt, ()=>{
      state[stateKey][el.dataset.f] = el.value;
      renderFilteredList(stateKey, resultsId, context);
    });
  });
  document.getElementById(stateKey+'Clear').addEventListener('click',()=>{
    Object.keys(state[stateKey]).forEach(k=>state[stateKey][k]='');
    box.querySelectorAll('[data-f]').forEach(el=>el.value='');
    renderFilteredList(stateKey, resultsId, context);
  });
}
function renderFilteredList(stateKey, resultsId, context){
  const wrap = document.getElementById(resultsId);
  if(!wrap) return;
  const f = state[stateKey];
  let list = sortedByDateDesc(state.requests.filter(r=>matchesFilters(r,f)));
  const editingId = context==='manager' ? state.managerEditingId : state.historyEditingId;
  if(editingId && list.some(r=>r.id===editingId)){
    const req = state.requests.find(r=>r.id===editingId);
    wrap.innerHTML = `<div class="table-hint">${list.length} demande(s) correspondent aux filtres</div><div class="inline-edit">${managerEditFormHtml(req)}</div>` + ledgerHtml(list, context==='manager'?'manager':'history');
    attachManagerEditFormEvents();
  } else {
    wrap.innerHTML = `<div class="table-hint">${list.length} demande(s) correspondent aux filtres</div>` + ledgerHtml(list, context==='manager'?'manager':'history');
  }
  attachLedgerEvents(wrap, context==='manager'?'manager':'history');
}

/* ---------- formulaire d'édition manager (tous les champs) ---------- */
function managerEditFormHtml(r){
  return `
  <form id="managerEditForm" data-editing="${r.id}">
    <div class="form-grid">
      <div class="field"><label>Date</label><input type="date" name="date" value="${r.date}" required></div>
      <div class="field"><label>Produit</label><input type="text" name="product" value="${escapeHtml(r.product)}" required></div>
      <div class="field full">
        <div class="qty-row">
          <div class="field"><label>Quantité</label><input type="number" name="quantity" min="0" step="0.01" value="${r.quantity}" required></div>
          <div class="field"><label>Unité</label><select name="unit">${UNITS.map(u=>`<option value="${u}" ${r.unit===u?'selected':''}>${u}</option>`).join('')}</select></div>
        </div>
      </div>
      <div class="field full"><label>Raison</label><select name="reason">${REASONS.map(rs=>`<option value="${rs}" ${r.reason===rs?'selected':''}>${rs}</option>`).join('')}</select></div>
      <div class="field"><label>Nombre de repas</label><input type="number" name="meals" min="0" step="1" value="${r.mealsCount!=null?r.mealsCount:''}"></div>
      <div class="field"><label>Nombre de personnes</label><input type="number" name="people" min="0" step="1" value="${r.peopleCount!=null?r.peopleCount:''}"></div>
      <div class="field"><label>Statut</label><select name="status">${STATUSES.map(s=>`<option value="${s}" ${r.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
      <div class="field"><label>Demandé par</label><input type="text" name="requester" value="${escapeHtml(r.createdBy||'')}" required></div>
      <div class="field full"><label>Commentaire</label><textarea name="comment">${escapeHtml(r.comment||'')}</textarea></div>
    </div>
    <div class="form-actions">
      <button type="submit" class="btn-primary">Enregistrer</button>
      <button type="button" class="btn-ghost" id="cancelManagerEdit">Annuler</button>
    </div>
  </form>`;
}
function attachManagerEditFormEvents(){
  const form = document.getElementById('managerEditForm');
  if(!form) return;
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const id = form.dataset.editing;
    const fd = new FormData(form);
    const payload = {
      date: fd.get('date'),
      product: fd.get('product').trim(),
      quantity: parseFloat(fd.get('quantity')),
      unit: fd.get('unit'),
      reason: fd.get('reason'),
      mealsCount: fd.get('meals') ? parseInt(fd.get('meals')) : null,
      peopleCount: fd.get('people') ? parseInt(fd.get('people')) : null,
      status: fd.get('status'),
      createdBy: fd.get('requester').trim(),
      comment: fd.get('comment').trim(),
    };
    try{
      await apiUpdateRequest(id, payload);
      state.requests = await apiGetRequests();
      state.apiOk = true;
      state.managerEditingId = null;
      state.historyEditingId = null;
      renderManagerTabBody();
    }catch(err){
      alert('Erreur lors de la modification : ' + err.message);
    }
  });
  const cancel = document.getElementById('cancelManagerEdit');
  if(cancel) cancel.addEventListener('click', ()=>{
    state.managerEditingId = null;
    state.historyEditingId = null;
    renderManagerTabBody();
  });
}

/* ---------- CALENDAR TAB ---------- */
function renderCalendarTab(body){
  body.innerHTML = `
    <div class="cal-container">
      <div class="cal-main">
        <div class="cal-header">
          <button class="navbtn" id="calPrev">‹</button>
          <span class="current-date" id="calMonthYear"></span>
          <button class="navbtn" id="calNext">›</button>
          <button class="today-btn" id="calToday">Aujourd'hui</button>
        </div>
        <div class="cal-dow">${DOW.map(d=>`<div>${d}</div>`).join('')}</div>
        <div class="cal-grid" id="calGrid"></div>
      </div>
      <div class="cal-side" id="calDayPanel"></div>
    </div>
  `;
  attachCalEvents();
  renderCalGrid();
  renderCalDayPanel();
}
function attachCalEvents(){
  document.getElementById('calPrev').addEventListener('click', ()=>{
    state.calMonth--;
    if(state.calMonth < 0){ state.calMonth = 11; state.calYear--; }
    renderCalGrid();
  });
  document.getElementById('calNext').addEventListener('click', ()=>{
    state.calMonth++;
    if(state.calMonth > 11){ state.calMonth = 0; state.calYear++; }
    renderCalGrid();
  });
  document.getElementById('calToday').addEventListener('click', ()=>{
    const now = new Date();
    state.calYear = now.getFullYear();
    state.calMonth = now.getMonth();
    state.calSelectedDate = todayStr();
    renderCalGrid();
    renderCalDayPanel();
  });
}
function renderCalGrid(){
  const title = document.getElementById('calMonthYear');
  if(!title) return;
  title.textContent = `${capitalize(MONTHS[state.calMonth])} ${state.calYear}`;

  const grid = document.getElementById('calGrid');
  const firstDay = new Date(state.calYear, state.calMonth, 1);
  let startingDay = firstDay.getDay() - 1; 
  if(startingDay < 0) startingDay = 6;

  const totalDays = new Date(state.calYear, state.calMonth + 1, 0).getDate();
  const prevMonthDays = new Date(state.calYear, state.calMonth, 0).getDate();

  let html = '';
  // Jours du mois précédent
  for(let i = startingDay - 1; i >= 0; i--){
    html += `<div class="cal-cell other-month">${prevMonthDays - i}</div>`;
  }

  // Jours du mois en cours
  const today = todayStr();
  for(let d = 1; d <= totalDays; d++){
    const dateStr = `${state.calYear}-${pad(state.calMonth + 1)}-${pad(d)}`;
    const dayReqs = state.requests.filter(r => r.date === dateStr);
    const isToday = dateStr === today;
    const isSelected = dateStr === state.calSelectedDate;

    let badges = '';
    if(dayReqs.length > 0){
      badges = `<div class="cal-badge">${dayReqs.length} achat${dayReqs.length>1?'s':''}</div>`;
    }

    html += `
      <div class="cal-cell ${isToday?'today':''} ${isSelected?'selected':''}" data-date="${dateStr}">
        <span class="day-num">${d}</span>
        ${badges}
      </div>
    `;
  }

  // Completer la grille à la fin si besoin
  const totalCells = startingDay + totalDays;
  const nextDays = (7 - (totalCells % 7)) % 7;
  for(let i = 1; i <= nextDays; i++){
    html += `<div class="cal-cell other-month">${i}</div>`;
  }

  grid.innerHTML = html;

  grid.querySelectorAll('.cal-cell[data-date]').forEach(cell => {
    cell.addEventListener('click', ()=>{
      state.calSelectedDate = cell.dataset.date;
      renderCalGrid();
      renderCalDayPanel();
    });
  });
}
function renderCalDayPanel(){
  const panel = document.getElementById('calDayPanel');
  if(!panel) return;

  const list = sortedByDateAsc(state.requests.filter(r => r.date === state.calSelectedDate));
  panel.innerHTML = `
    <div class="section-head" style="margin-top:0;">
      <h2>${capitalize(formatLong(state.calSelectedDate))}</h2>
    </div>
    ${ledgerHtml(list, 'manager')}
  `;
  attachLedgerEvents(panel, 'manager');
}

/* ---------- HISTORY TAB ---------- */
function renderHistoryTab(body){
  body.innerHTML = `
    <div class="section-head"><h2>Historique complet</h2></div>
    ${filtersHtml('historyFilters', true)}
    <div id="historyListWrap"></div>
  `;
  attachFilterEvents('historyFilters', 'historyListWrap', 'history');
  renderFilteredList('historyFilters', 'historyListWrap', 'history');
}

/* ================= INITIALIZATION ================= */
document.addEventListener('DOMContentLoaded', loadAll);
