// ══ CONFIGURAÇÕES E CONSTANTES ══
const CARGO_LABEL = {
  master:   'Administrador Master',
  guarda:   'Guarda Municipal',
  agente:   'Agente de Polícia',
  tatico:   'Policiamento Tático',
  escrivao: 'Escrivão de Polícia',
  delegado: 'Delegado de Polícia',
  chefe:    'Chefe de Polícia'
};

const CARGO_BADGE_CLASS = {
  master:   'cb-master',
  guarda:   'cb-guarda',
  agente:   'cb-agente',
  tatico:   'cb-tatico',
  escrivao: 'cb-escrivao',
  delegado: 'cb-delegado',
  chefe:    'cb-chefe'
};

const CARGO_PERM = {
  master:   5,
  chefe:    4,
  delegado: 3,
  escrivao: 2,
  tatico:   1,
  agente:   1,
  guarda:   1
};

// ══ ESTADO DA APLICAÇÃO ══
let me = null;
let activeTab = 0;

// Cache local (sincronizado via WebSocket + API)
let STATE = {
  ocs: [],
  puns: [],
  pontos: [],
  users: [],
  audit: []
};

// ══ HANDLERS DE WEBSOCKET ══
function handleSocketMessage(data) {
  const { type, payload } = data;

  switch (type) {
    case 'INIT':
      STATE.ocs    = payload.ocs    || [];
      STATE.puns   = payload.puns   || [];
      STATE.pontos = payload.pontos || [];
      STATE.users  = payload.users  || [];
      STATE.audit  = payload.audit  || [];
      updateNotif();
      if (me) renderTab(activeTab);
      break;

    case 'NEW_OC':
      if (!STATE.ocs.find(o => o.id === payload.id)) {
        STATE.ocs.push(payload);
        updateNotif();
        if (activeTab === getTabIdx('ocs') || activeTab === getTabIdx('hist') || me?.cargo === 'master') {
          renderTab(activeTab);
        }
        if (me && me.cargo !== 'delegado' || (me && payload.delegadoUser !== me.user)) {
          toast(`📋 Nova ocorrência: ${payload.id} — por ${payload.delegado}`, 'w');
        }
      }
      break;

    case 'OC_UPDATED':
      const oidx = STATE.ocs.findIndex(o => o.id === payload.id);
      if (oidx !== -1) {
        STATE.ocs[oidx] = payload;
        updateNotif();
        renderTab(activeTab);
        toast(`🔄 Ocorrência ${payload.id} atualizada.`, 'i');
      }
      break;

    case 'OC_DELETED':
      STATE.ocs = STATE.ocs.filter(o => o.id !== payload.id);
      updateNotif();
      renderTab(activeTab);
      break;

    case 'NEW_PUN':
      STATE.puns.push(payload);
      if (canSeePuns()) renderTab(activeTab);
      toast(`⚠️ Nova punição registrada para ${payload.nome}`, 'w');
      break;

    case 'PUNS_UPDATED':
      STATE.puns = payload;
      if (canSeePuns()) renderTab(activeTab);
      break;

    case 'NEW_PONTO':
      STATE.pontos.push(payload);
      if (canSeePontos()) renderTab(activeTab);
      if (me && payload.userLogin !== me.user) {
        toast(`⏱️ ${payload.nome} bateu ponto às ${payload.hora}`, 'i');
      }
      break;

    case 'USERS_UPDATED':
      STATE.users = payload;
      if (activeTab === getTabIdx('users')) renderTab(activeTab);
      break;

    case 'AUDIT_NEW':
      STATE.audit.unshift(payload);
      if (activeTab === getTabIdx('audit')) renderTab(activeTab);
      break;

    case 'PONG':
      break;
  }
}

function canSeePuns() {
  return me && CARGO_PERM[me.cargo] >= 1;
}
function canSeePontos() {
  return me && CARGO_PERM[me.cargo] >= 3;
}
function getTabIdx(name) {
  if (!me) return -1;
  const defs = tabDefs(me.cargo);
  return defs.findIndex(t => t.key === name);
}

// ══ SESSION ══
function checkSession() {
  const saved = sessionStorage.getItem('gmpol_session');
  if (saved) {
    me = JSON.parse(saved);
    showPanel();
  } else {
    showLogin();
  }
}

// ══ LOGIN / LOGOUT ══
async function login() {
  const u = document.getElementById('l-user').value.trim().toLowerCase();
  const p = document.getElementById('l-pass').value;
  if (!u || !p) return toast('Preencha todos os campos.', 'd');

  try {
    const res = await API.login(u, p);
    me = res.user;
    sessionStorage.setItem('gmpol_session', JSON.stringify(me));
    showPanel();
    toast(`Bem-vindo, ${me.nome}!`, 's');
  } catch(e) {
    toast(e.message || 'Erro ao autenticar.', 'd');
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const loginScreen = document.getElementById('s-login');
    if (loginScreen && loginScreen.classList.contains('active')) login();
  }
});

function logout() {
  me = null;
  sessionStorage.removeItem('gmpol_session');
  location.reload();
}

// ══ UI CORE ══
function showLogin() {
  document.getElementById('s-panel').classList.remove('active');
  document.getElementById('s-login').classList.add('active');
}

function showPanel() {
  document.getElementById('s-login').classList.remove('active');
  document.getElementById('s-panel').classList.add('active');

  const badge = document.getElementById('tb-badge');
  badge.className = `cargo-badge ${CARGO_BADGE_CLASS[me.cargo] || 'cb-guarda'}`;
  badge.textContent = CARGO_LABEL[me.cargo] || me.cargo;
  document.getElementById('tb-user').textContent = me.nome;

  buildTabs();
  renderTab(0);
  updateNotif();
}

function tabDefs(c) {
  const base = [{ label: '▸ INÍCIO', key: 'home', notif: false }];

  // Abas comuns a TODOS os cargos
  const commonTabs = [
    { label: '▸ REGISTRAR', key: 'registrar', notif: false },
    { label: '▸ MINHAS OCs', key: 'myocs', notif: false },
    { label: '▸ PUNIÇÕES', key: 'puns', notif: false },
    { label: '▸ PONTO', key: 'pontos', notif: false }
  ];

  if (c === 'master') return [
    ...base,
    ...commonTabs,
    { label: '▸ PENDENTES', key: 'ocs', notif: true },
    { label: '▸ HISTÓRICO', key: 'hist', notif: false },
    { label: '▸ USUÁRIOS', key: 'users', notif: false },
    { label: '▸ AUDITORIA', key: 'audit', notif: false }
  ];

  if (c === 'chefe') return [
    ...base,
    ...commonTabs,
    { label: '▸ PENDENTES', key: 'ocs', notif: true },
    { label: '▸ HISTÓRICO', key: 'hist', notif: false },
    { label: '▸ USUÁRIOS', key: 'users', notif: false },
    { label: '▸ AUDITORIA', key: 'audit', notif: false }
  ];

  if (c === 'delegado') return [
    ...base,
    ...commonTabs,
    { label: '▸ PENDENTES', key: 'ocs', notif: true },
    { label: '▸ HISTÓRICO', key: 'hist', notif: false }
  ];

  // guarda, agente, tatico, escrivao — apenas abas comuns
  return [
    ...base,
    ...commonTabs
  ];
}

function buildTabs() {
  const defs = tabDefs(me.cargo);
  document.getElementById('tabs').innerHTML = defs.map((t, i) => `
    <div class="tab ${i === 0 ? 'active' : ''}" id="tab-${i}" onclick="switchTab(${i})">
      ${t.label}${t.notif ? `<span class="tab-n" id="tn-${i}" style="display:none"></span>` : ''}
    </div>`).join('');
}

function switchTab(idx) {
  activeTab = idx;
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', i === idx));
  renderTab(idx);
  closeSettings();
}

function renderTab(idx) {
  const defs = tabDefs(me.cargo);
  const def = defs[idx] || defs[0];
  let html = '';

  const views = {
    home:      vInicio,
    ocs:       vOcAdmin,
    hist:      vHistorico,
    registrar: vRegistrar,
    myocs:     vOcDelegado,
    puns:      vPunicoes,
    users:     vUsuarios,
    pontos:    vPontos,
    audit:     vAuditoria
  };

  html = (views[def.key] || vInicio)();
  document.getElementById('content').innerHTML = html;
}

function updateNotif() {
  if (!me) return;
  const pend = STATE.ocs.filter(o => o.status === 'pendente').length;
  const pill = document.getElementById('notif-pill');
  const txt  = document.getElementById('notif-txt');
  const defs = tabDefs(me.cargo);
  const ocTabIdx = defs.findIndex(t => t.key === 'ocs');
  const tn = document.getElementById(`tn-${ocTabIdx}`);

  if (['delegado','chefe','master'].includes(me.cargo) && pend > 0) {
    if (pill) { pill.classList.add('show'); }
    if (txt)  { txt.textContent = pend + ' PENDENTE' + (pend > 1 ? 'S' : ''); }
    if (tn)   { tn.textContent = pend; tn.style.display = 'flex'; }
  } else {
    if (pill) pill.classList.remove('show');
    if (tn)   tn.style.display = 'none';
  }
}

// ══ VIEW: INÍCIO ══
function vInicio() {
  const ocs  = STATE.ocs;
  const pend = ocs.filter(o => o.status === 'pendente').length;
  const ace  = ocs.filter(o => o.status === 'aceita').length;
  const rec  = ocs.filter(o => o.status === 'recusada').length;
  const can  = ocs.filter(o => o.status === 'cancelada').length;

  const showStats = CARGO_PERM[me.cargo] >= 3;

  const msgs = {
    master:   'Acesso total ao sistema. Você pode registrar ocorrências/denúncias, editar, deletar e gerenciar todos os dados e usuários.',
    guarda:   'Você pode registrar ocorrências e denúncias, consultar punições e bater ponto.',
    agente:   'Você pode registrar ocorrências e denúncias, consultar punições e bater ponto.',
    tatico:   'Você pode registrar ocorrências e denúncias, consultar punições e bater ponto.',
    escrivao: 'Você pode registrar ocorrências e denúncias, gerenciar punições e bater ponto.',
    delegado: 'Você pode registrar ocorrências e denúncias, aceitar/recusar registros de outros membros e gerenciar punições.',
    chefe:    'Você analisa todos os registros da corporação, pode aceitar/recusar, gerenciar usuários e auditar o sistema.',
  };

  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return `
    <div class="stitle">▸ PAINEL INICIAL</div>
    <div class="card" style="margin-bottom:20px;">
      <div style="font-family:'Orbitron',sans-serif;font-size:1.15rem;color:var(--accent);margin-bottom:4px;">${me.nome}</div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:.65rem;color:var(--text-dim);margin-bottom:4px;letter-spacing:.1em;">${CARGO_LABEL[me.cargo].toUpperCase()} — SISTEMA CENTRAL</div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:.6rem;color:var(--text-dim);margin-bottom:14px;">${today.toUpperCase()}</div>
      <p style="color:var(--text-mid);font-size:.92rem;line-height:1.6;">${msgs[me.cargo]}</p>
    </div>
    ${showStats ? `
    <div class="g3" style="grid-template-columns:repeat(4,1fr);">
      <div class="card c-warn stat-box"><div class="stat-num" style="color:var(--warn);">${pend}</div><div class="stat-lbl">PENDENTES</div></div>
      <div class="card c-success stat-box"><div class="stat-num" style="color:var(--accent3);">${ace}</div><div class="stat-lbl">ACEITAS</div></div>
      <div class="card c-danger stat-box"><div class="stat-num" style="color:var(--danger);">${rec}</div><div class="stat-lbl">RECUSADAS</div></div>
      <div class="card stat-box"><div class="stat-num" style="color:var(--text-dim);">${can}</div><div class="stat-lbl">CANCELADAS</div></div>
    </div>` : ''}
    <div class="card" style="margin-top:20px;">
      <div style="font-family:'Orbitron',sans-serif;font-size:.7rem;color:var(--accent);letter-spacing:.12em;margin-bottom:12px;">▸ ÚLTIMAS ATIVIDADES</div>
      ${STATE.audit.slice(0, 5).map(l => `
        <div class="log-entry" style="padding:8px 0;border-bottom:1px solid var(--border);">
          <div class="log-time">${new Date(l.ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
          <div class="log-icon">${l.icon || '📋'}</div>
          <div class="log-txt" style="font-size:.8rem;">${l.msg}</div>
        </div>`).join('') || '<p style="color:var(--text-dim);font-size:.8rem;">Nenhuma atividade registrada.</p>'}
    </div>`;
}

// ══ VIEW: REGISTRAR OCORRÊNCIA (Delegado) ══
function vRegistrar() {
  return `
    <div class="stitle">▸ REGISTRAR OCORRÊNCIA / DENÚNCIA</div>
    <div class="card">
      <p style="color:var(--text-mid);font-size:.88rem;margin-bottom:18px;line-height:1.6;">
        Qualquer membro da corporação pode registrar uma ocorrência ou denúncia.
        O registro será analisado pelo Delegado, Chefe ou Master, que poderão aceitar ou recusar.
      </p>
      <div class="g2">
        <div class="fg"><label>Tipo de Registro</label>
          <select id="oc-tipo">
            <option value="Ocorrência">Ocorrência</option>
            <option value="Denúncia">Denúncia</option>
          </select>
        </div>
        <div class="fg"><label>Nome do Envolvido / Agente</label><input id="oc-nome" placeholder="Nome completo"></div>
        <div class="fg"><label>Cargo do Envolvido</label>
          <select id="oc-cargo">
            <option>Guarda Municipal</option>
            <option>Agente de Polícia</option>
            <option>Policiamento Tático</option>
            <option>Escrivão de Polícia</option>
            <option>Delegado de Polícia</option>
            <option>Chefe de Polícia</option>
            <option>Civil</option>
            <option>Outro</option>
          </select>
        </div>
        <div class="fg g-full"><label>Depoimento / Relato</label>
          <textarea id="oc-dep" placeholder="Descreva detalhadamente o ocorrido, testemunhas, local, horário e evidências relevantes…"></textarea>
        </div>
      </div>
      <button class="btn btn-primary" style="margin-top:8px;max-width:260px;" onclick="registrarOc()">▸ ENVIAR REGISTRO</button>
    </div>`;
}

async function registrarOc() {
  const tipo  = document.getElementById('oc-tipo')?.value || 'Ocorrência';
  const nome  = document.getElementById('oc-nome')?.value.trim();
  const cargo = document.getElementById('oc-cargo')?.value;
  const dep   = document.getElementById('oc-dep')?.value.trim();
  if (!nome || !dep) { toast('Preencha nome e depoimento.', 'd'); return; }

  const prefix = tipo === 'Denúncia' ? 'DN' : 'OC';
  const newOc = {
    id: `${prefix}-${Date.now()}`,
    tipo,
    autor: me.nome,
    autorUser: me.user,
    autorCargo: me.cargo,
    // Manter "delegado/delegadoUser" por compatibilidade com o restante do código
    delegado: me.nome,
    delegadoUser: me.user,
    nome,
    cargo,
    depoimento: dep,
    status: 'pendente',
    resposta: '',
    ts: Date.now()
  };

  try {
    await API.createOc(newOc);
    toast(`${tipo} enviada para análise!`, 's');
    const idx = tabDefs(me.cargo).findIndex(t => t.key === 'myocs');
    if (idx !== -1) switchTab(idx);
  } catch(e) {
    toast(e.message || 'Erro ao registrar.', 'd');
  }
}

// ══ VIEW: MEUS REGISTROS (todos) ══
function vOcDelegado() {
  const ocs = STATE.ocs.filter(o => o.delegadoUser === me.user).reverse();
  return `
    <div class="stitle">▸ MEUS REGISTROS</div>
    ${ocs.length ? ocs.map(o => ocCard(o, false, false)).join('') : empty('📋', 'Nenhum registro enviado por você.')}`;
}

// ══ VIEW: REGISTROS PENDENTES (Delegado/Chefe/Master) ══
function vOcAdmin() {
  const ocs = STATE.ocs.filter(o => o.status === 'pendente').reverse();
  const isMaster = me.cargo === 'master';
  const canDecide = ['delegado','chefe','master'].includes(me.cargo);
  return `
    <div class="stitle">▸ REGISTROS PENDENTES${isMaster ? ' <span style="font-size:.65rem;color:var(--text-dim);">[MASTER]</span>' : ''}</div>
    ${ocs.length ? ocs.map(o => ocCard(o, canDecide, isMaster)).join('') : empty('✅', 'Nenhum registro pendente.')}`;
}

// ══ VIEW: HISTÓRICO (Chefe/Master) ══
function vHistorico() {
  const ocs = STATE.ocs.filter(o => o.status !== 'pendente').reverse();
  const isMaster = me.cargo === 'master';
  return `
    <div class="stitle">▸ HISTÓRICO DE OCORRÊNCIAS</div>
    <div class="filter-bar" style="margin-bottom:16px;display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-sm btn-ghost" onclick="filtrarHist('')">TODOS</button>
      <button class="btn btn-sm btn-ghost" onclick="filtrarHist('aceita')">✅ ACEITAS</button>
      <button class="btn btn-sm btn-ghost" onclick="filtrarHist('recusada')">❌ RECUSADAS</button>
      <button class="btn btn-sm btn-ghost" onclick="filtrarHist('cancelada')">🚫 CANCELADAS</button>
    </div>
    <div id="hist-list">
      ${ocs.length ? ocs.map(o => ocCard(o, false, isMaster)).join('') : empty('📂', 'Nenhuma ocorrência processada.')}
    </div>`;
}

let _histFiltro = '';
function filtrarHist(status) {
  _histFiltro = status;
  const ocs = STATE.ocs.filter(o => o.status !== 'pendente' && (!status || o.status === status)).reverse();
  const isMaster = me.cargo === 'master';
  document.getElementById('hist-list').innerHTML = ocs.length
    ? ocs.map(o => ocCard(o, false, isMaster)).join('')
    : empty('📂', 'Nenhuma ocorrência nesta categoria.');
}

// ══ CARD DE OCORRÊNCIA/DENÚNCIA ══
function ocCard(o, actions, masterMode) {
  const scMap = { pendente: 'sc-p', aceita: 'sc-a', recusada: 'sc-r', cancelada: 'sc-c' };
  const scLbl = { pendente: '⏳ Pendente', aceita: '✅ Aceita', recusada: '❌ Recusada', cancelada: '🚫 Cancelada' };
  const dt = new Date(o.ts).toLocaleString('pt-BR');
  const tipoBadge = o.tipo === 'Denúncia'
    ? `<span class="tipo-badge tipo-denuncia">📢 DENÚNCIA</span>`
    : `<span class="tipo-badge tipo-oc">📋 OCORRÊNCIA</span>`;

  const autorLabel = CARGO_LABEL[o.autorCargo] || 'Membro';
  const autorNome  = o.autor || o.delegado;

  const masterBtns = masterMode ? `
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;padding-top:8px;border-top:1px solid var(--border);">
      <span style="font-family:'Share Tech Mono',monospace;font-size:.6rem;color:var(--accent);align-self:center;">MASTER:</span>
      <button class="btn btn-warn btn-xs" onclick="abrirEditarOc('${o.id}')">✏️ EDITAR</button>
      <button class="btn btn-danger btn-xs" onclick="confirmarDeleteOc('${o.id}')">🗑 DELETAR</button>
      ${o.status !== 'cancelada' ? `<button class="btn btn-xs" style="background:var(--text-dim);color:#000;" onclick="cancelarOc('${o.id}')">🚫 CANCELAR</button>` : ''}
    </div>` : '';

  const actHTML = actions ? `
    <div class="oc-actions">
      <button class="btn btn-success btn-sm" onclick="abrirDecisao('${o.id}','aceita')">✔ ACEITAR</button>
      <button class="btn btn-danger btn-sm" onclick="abrirDecisao('${o.id}','recusada')">✘ RECUSAR</button>
    </div>
    <div class="decide-zone" id="dz-${o.id}">
      <div class="fg" style="margin-top:10px;"><label>Motivo da decisão</label>
        <textarea id="dm-${o.id}" placeholder="Digite o motivo de aceitar ou recusar este registro…"></textarea>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button class="btn btn-sm" id="dc-${o.id}" onclick="decidir('${o.id}')">CONFIRMAR</button>
          <button class="btn btn-ghost btn-sm" onclick="fecharDecisao('${o.id}')">CANCELAR</button>
        </div>
      </div>
    </div>` :
    (o.resposta ? `<div><span class="resp-lbl">Resposta da autoridade</span><div class="dep-box" style="margin-bottom:0;">${o.resposta}</div></div>` : '');

  return `
    <div class="oc-wrap">
      <div class="oc-top">
        <div class="oc-meta">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            ${tipoBadge}
            <span style="font-size:.72rem;font-weight:700;color:var(--text);">${o.id}</span>
          </div>
          <div>${dt}</div>
          <div>REGISTRADO POR: <b>${autorNome}</b> <span style="color:var(--text-dim);font-size:.78em;">(${autorLabel})</span></div>
        </div>
        <span class="status-chip ${scMap[o.status] || 'sc-p'}">${scLbl[o.status] || o.status}</span>
      </div>
      <div class="oc-fields">
        <div class="oc-f"><label>Nome do Envolvido</label><span>${o.nome}</span></div>
        <div class="oc-f"><label>Cargo</label><span>${o.cargo}</span></div>
      </div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:.58rem;color:var(--text-dim);margin-bottom:5px;letter-spacing:.08em;text-transform:uppercase;">Relato / Depoimento</div>
      <div class="dep-box">${o.depoimento}</div>
      ${actHTML}
      ${masterBtns}
    </div>`;
}

// ══ DECISÃO DE OCORRÊNCIA ══
let _decAcao = {};

function abrirDecisao(id, acao) {
  document.querySelectorAll('.decide-zone').forEach(z => {
    if (z.id !== `dz-${id}`) z.classList.remove('open');
  });
  const dz = document.getElementById(`dz-${id}`);
  const dc = document.getElementById(`dc-${id}`);
  if (!dz) return;
  if (_decAcao[id] === acao && dz.classList.contains('open')) { fecharDecisao(id); return; }
  _decAcao[id] = acao;
  dz.classList.add('open');
  dc.textContent = acao === 'aceita' ? '✔ CONFIRMAR ACEITAR' : '✘ CONFIRMAR RECUSAR';
  dc.className = `btn btn-sm ${acao === 'aceita' ? 'btn-success' : 'btn-danger'}`;
}

function fecharDecisao(id) {
  const dz = document.getElementById(`dz-${id}`);
  if (dz) dz.classList.remove('open');
  delete _decAcao[id];
}

async function decidir(id) {
  const acao   = _decAcao[id];
  const motivo = document.getElementById(`dm-${id}`)?.value.trim();
  if (!acao)   { toast('Selecione aceitar ou recusar.', 'd'); return; }
  if (!motivo) { toast('Digite o motivo antes de confirmar.', 'w'); return; }

  const oc = STATE.ocs.find(o => o.id === id);
  if (!oc) return;

  try {
    await API.updateOc(id, {
      ...oc,
      status: acao,
      resposta: `${me.nome}: ${motivo}`,
      decididoPor: me.user,
      decididoEm: Date.now()
    });
    toast(`Ocorrência ${acao === 'aceita' ? 'aceita ✅' : 'recusada ❌'}!`, acao === 'aceita' ? 's' : 'd');
    updateNotif();
  } catch(e) {
    toast(e.message || 'Erro ao processar decisão.', 'd');
  }
}

// ══ MASTER: EDITAR OCORRÊNCIA ══
let _editOcId = null;

function abrirEditarOc(id) {
  const oc = STATE.ocs.find(o => o.id === id);
  if (!oc) return;
  _editOcId = id;
  document.getElementById('eo-nome').value    = oc.nome;
  document.getElementById('eo-cargo').value   = oc.cargo;
  document.getElementById('eo-delegado').value = oc.delegado;
  document.getElementById('eo-status').value  = oc.status;
  document.getElementById('eo-dep').value     = oc.depoimento;
  document.getElementById('eo-resp').value    = oc.resposta || '';
  openModal('m-edit-oc');
}

async function salvarEdicaoOc() {
  if (!_editOcId) return;
  const oc = STATE.ocs.find(o => o.id === _editOcId);
  if (!oc) return;

  try {
    await API.updateOc(_editOcId, {
      ...oc,
      nome:       document.getElementById('eo-nome').value.trim(),
      cargo:      document.getElementById('eo-cargo').value.trim(),
      delegado:   document.getElementById('eo-delegado').value.trim(),
      status:     document.getElementById('eo-status').value,
      depoimento: document.getElementById('eo-dep').value.trim(),
      resposta:   document.getElementById('eo-resp').value.trim(),
      editadoPor: me.user,
      editadoEm:  Date.now()
    });
    closeModal('m-edit-oc');
    toast('Ocorrência editada com sucesso!', 's');
  } catch(e) {
    toast(e.message || 'Erro ao editar ocorrência.', 'd');
  }
}

function confirmarDeleteOc(id) {
  const oc = STATE.ocs.find(o => o.id === id);
  if (!oc) return;
  document.getElementById('del-info').innerHTML =
    `Tem certeza que deseja <b>EXCLUIR PERMANENTEMENTE</b> a ocorrência <b>${id}</b> registrada por ${oc.delegado} sobre ${oc.nome}? Esta ação não pode ser desfeita.`;
  document.getElementById('del-confirm-btn').onclick = () => {
    closeModal('m-confirm-del');
    deleteOc(id);
  };
  openModal('m-confirm-del');
}

async function deleteOc(id) {
  try {
    await API.deleteOc(id, me.user);
    toast('Ocorrência excluída.', 'w');
  } catch(e) {
    toast(e.message || 'Erro ao excluir ocorrência.', 'd');
  }
}

async function cancelarOc(id) {
  const oc = STATE.ocs.find(o => o.id === id);
  if (!oc) return;
  try {
    await API.updateOc(id, { ...oc, status: 'cancelada', canceladoPor: me.user, canceladoEm: Date.now() });
    toast('Ocorrência cancelada.', 'w');
  } catch(e) {
    toast(e.message || 'Erro ao cancelar ocorrência.', 'd');
  }
}

// ══ VIEW: USUÁRIOS ══
function vUsuarios() {
  const users  = STATE.users;
  const isMaster = me.cargo === 'master';
  const isChefe  = me.cargo === 'chefe';

  const rows = users.map(u => {
    const isMe    = u.user === me.user;
    const isM     = u.cargo === 'master';

    // Chefe não pode mexer em master, só master pode mexer em tudo
    const canEdit = (isMaster && !isMe) || (isChefe && !isMe && !isM);

    return `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:10px;">
            <div class="u-avatar">${u.nome.charAt(0).toUpperCase()}</div>
            <div>
              <div style="font-weight:600;">${u.nome}</div>
              <div style="font-family:'Share Tech Mono',monospace;font-size:.6rem;color:var(--text-dim);">@${u.user}</div>
            </div>
          </div>
        </td>
        <td>
          ${isMaster && !isMe && !isM ? `
            <select class="cargo-select" onchange="alterarCargo('${u.user}', this.value)">
              ${Object.entries(CARGO_LABEL).filter(([k]) => k !== 'master').map(([k, v]) =>
                `<option value="${k}" ${u.cargo === k ? 'selected' : ''}>${v}</option>`
              ).join('')}
            </select>` :
            `<span class="cargo-badge ${CARGO_BADGE_CLASS[u.cargo] || ''}">${CARGO_LABEL[u.cargo] || u.cargo}</span>`
          }
        </td>
        <td>
          <span class="status-chip ${u.ativo ? 'sc-a' : 'sc-r'}">${u.ativo ? '✅ Ativo' : '❌ Inativo'}</span>
        </td>
        <td style="font-family:'Share Tech Mono',monospace;font-size:.62rem;color:var(--text-dim);">
          ${u.criadoPor || 'padrão'}
        </td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${isMe ? `<span style="font-family:'Share Tech Mono',monospace;font-size:.6rem;color:var(--accent);">VOCÊ</span>` : ''}
            ${canEdit ? `<button class="btn btn-warn btn-xs" onclick="abrirResetSenha('${u.user}','${u.nome}')">🔑 SENHA</button>` : ''}
            ${canEdit && isMaster ? `
              <button class="btn btn-xs ${u.ativo ? 'btn-danger' : 'btn-success'}" onclick="toggleStatus('${u.user}',${!u.ativo})">
                ${u.ativo ? '🚫 Desativar' : '✅ Ativar'}
              </button>
              <button class="btn btn-danger btn-xs" onclick="confirmarDeleteUser('${u.user}','${u.nome}')">🗑 EXCLUIR</button>
            ` : ''}
            ${canEdit && !isMaster ? `
              <button class="btn btn-danger btn-xs" onclick="confirmarDeleteUser('${u.user}','${u.nome}')">✘ REMOVER</button>
            ` : ''}
          </div>
        </td>
      </tr>`;
  }).join('');

  return `
    <div class="stitle">▸ GERENCIAR USUÁRIOS</div>
    <div style="display:flex;justify-content:flex-end;margin-bottom:16px;">
      <button class="btn btn-success btn-sm" onclick="openModal('m-novo-user')">+ CRIAR USUÁRIO</button>
    </div>
    <div class="card c-none" style="padding:0;overflow:hidden;">
      <table class="tbl">
        <thead><tr><th>USUÁRIO</th><th>CARGO</th><th>STATUS</th><th>CRIADO POR</th><th>AÇÕES</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="margin-top:10px;" class="hint">Total: <span>${users.length}</span> usuário(s) registrado(s).</div>`;
}

// ══ AÇÕES DE USUÁRIO ══
async function criarUsuario() {
  const nome  = document.getElementById('nu-nome').value.trim();
  const user  = document.getElementById('nu-user').value.trim().toLowerCase().replace(/\s/g, '');
  const cargo = document.getElementById('nu-cargo').value;
  const pass  = document.getElementById('nu-pass').value;

  if (!nome || !user || !cargo || !pass) { toast('Preencha todos os campos.', 'd'); return; }
  if (pass.length < 6)                   { toast('Senha mínima: 6 caracteres.', 'w'); return; }
  if (!/^[a-z0-9_]+$/.test(user))       { toast('Login: apenas letras, números e _.', 'w'); return; }

  try {
    await API.createUser({ nome, user, cargo, pass, criadoPor: me.user });
    toast(`Usuário ${nome} criado com sucesso!`, 's');
    closeModal('m-novo-user');
    ['nu-nome', 'nu-user', 'nu-pass'].forEach(id => document.getElementById(id).value = '');
  } catch(e) {
    toast(e.message || 'Erro ao criar usuário.', 'd');
  }
}

function abrirResetSenha(username, nome) {
  document.getElementById('rs-info').innerHTML = `Redefinindo senha de: <b>${nome}</b> (@${username})`;
  document.getElementById('rs-target').value = username;
  document.getElementById('rs-nova').value = '';
  document.getElementById('rs-conf').value = '';
  openModal('m-reset-senha');
}

async function confirmarResetSenha() {
  const username = document.getElementById('rs-target').value;
  const nova = document.getElementById('rs-nova').value;
  const conf = document.getElementById('rs-conf').value;

  if (!nova || !conf)      { toast('Preencha os campos.', 'd'); return; }
  if (nova.length < 6)    { toast('Senha mínima: 6 caracteres.', 'w'); return; }
  if (nova !== conf)       { toast('As senhas não coincidem.', 'd'); return; }

  try {
    await API.resetSenha(username, nova, me.nome);
    toast('Senha redefinida com sucesso!', 's');
    closeModal('m-reset-senha');
  } catch(e) {
    toast(e.message || 'Erro ao redefinir senha.', 'd');
  }
}

function confirmarDeleteUser(username, nome) {
  document.getElementById('del-info').innerHTML =
    `Tem certeza que deseja <b>EXCLUIR</b> o usuário <b>${nome}</b> (@${username})? Esta ação remove o acesso permanentemente.`;
  document.getElementById('del-confirm-btn').onclick = () => {
    closeModal('m-confirm-del');
    deleteUser(username);
  };
  openModal('m-confirm-del');
}

async function deleteUser(username) {
  try {
    await API.deleteUser(username, me.nome);
    toast('Usuário excluído.', 'w');
  } catch(e) {
    toast(e.message || 'Erro ao excluir usuário.', 'd');
  }
}

async function toggleStatus(username, ativo) {
  try {
    await API.toggleUserStatus(username, ativo, me.nome);
    toast(`Conta ${ativo ? 'ativada' : 'desativada'} com sucesso.`, ativo ? 's' : 'w');
  } catch(e) {
    toast(e.message || 'Erro ao alterar status.', 'd');
  }
}

async function alterarCargo(username, cargo) {
  try {
    await API.updateUserCargo(username, cargo, me.nome);
    toast('Cargo alterado com sucesso.', 's');
  } catch(e) {
    toast(e.message || 'Erro ao alterar cargo.', 'd');
  }
}

// ══ VIEW: PUNIÇÕES ══
function vPunicoes() {
  const puns   = STATE.puns;
  const canEdit = CARGO_PERM[me.cargo] >= 2;
  const isMaster = me.cargo === 'master';

  const form = canEdit ? `
    <div class="card" style="margin-bottom:22px;">
      <div style="font-family:'Orbitron',sans-serif;font-size:.72rem;color:var(--accent);letter-spacing:.14em;margin-bottom:16px;">▸ ADICIONAR PUNIÇÃO</div>
      <div class="g2">
        <div class="fg"><label>Nome do Agente</label><input id="pn-nome" placeholder="Nome completo"></div>
        <div class="fg"><label>Nível</label>
          <select id="pn-nivel"><option>Leve</option><option>Médio</option><option>Grave</option></select>
        </div>
        <div class="fg g-full"><label>Motivo da Punição</label><input id="pn-motivo" placeholder="Descreva o motivo"></div>
      </div>
      <button class="btn btn-primary" style="margin-top:10px;max-width:200px;" onclick="addPun()">▸ REGISTRAR</button>
    </div>` : '';

  const nc = n => ({ Leve: 'sc-a', Médio: 'sc-p', Grave: 'sc-r' })[n] || 'sc-p';

  const rows = [...puns].reverse().map((p, ri) => {
    const realIdx = puns.length - 1 - ri;
    const canDel = canEdit || isMaster;
    return `<tr>
      <td style="font-weight:600;">${p.nome}</td>
      <td style="color:var(--text-mid);font-size:.88rem;">${p.motivo}</td>
      <td><span class="status-chip ${nc(p.nivel)}">${p.nivel}</span></td>
      <td style="font-family:'Share Tech Mono',monospace;font-size:.62rem;color:var(--text-dim);">${p.autor}</td>
      <td style="font-family:'Share Tech Mono',monospace;font-size:.6rem;color:var(--text-dim);">${new Date(p.ts).toLocaleDateString('pt-BR')}</td>
      ${canDel ? `<td><button class="btn btn-danger btn-xs" onclick="delPun(${realIdx})">✘</button></td>` : '<td></td>'}
    </tr>`;
  }).join('');

  return `
    <div class="stitle">▸ QUADRO DE PUNIÇÕES</div>
    ${form}
    <div class="card c-none" style="padding:0;overflow:hidden;">
      <table class="tbl">
        <thead><tr><th>NOME</th><th>MOTIVO</th><th>NÍVEL</th><th>REGISTRADO POR</th><th>DATA</th><th></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6" style="text-align:center;padding:30px;font-family:'Share Tech Mono',monospace;font-size:.68rem;color:var(--text-dim);">Nenhuma punição registrada.</td></tr>`}</tbody>
      </table>
    </div>`;
}

async function addPun() {
  const nome   = document.getElementById('pn-nome')?.value.trim();
  const motivo = document.getElementById('pn-motivo')?.value.trim();
  const nivel  = document.getElementById('pn-nivel')?.value;
  if (!nome || !motivo) { toast('Preencha nome e motivo.', 'd'); return; }

  try {
    await API.createPun({ nome, motivo, nivel, autor: me.nome, ts: Date.now() });
    toast('Punição registrada.', 's');
    document.getElementById('pn-nome').value = '';
    document.getElementById('pn-motivo').value = '';
  } catch(e) {
    toast(e.message || 'Erro ao registrar punição.', 'd');
  }
}

async function delPun(idx) {
  try {
    await API.deletePun(idx, me.nome);
    toast('Punição removida.', 'w');
  } catch(e) {
    toast(e.message || 'Erro ao remover punição.', 'd');
  }
}

// ══ VIEW: BATER PONTO ══
function vPontos() {
  const isSupervisor = CARGO_PERM[me.cargo] >= 3;

  // Pontos do usuário atual
  const meusPontos = STATE.pontos.filter(p => p.userLogin === me.user);
  const jaHoje = meusPontos.some(p => {
    const d = new Date(p.ts);
    const hoje = new Date();
    return d.toDateString() === hoje.toDateString();
  });

  // Agrupar pontos por usuário (para supervisores)
  const porUsuario = {};
  STATE.pontos.forEach(p => {
    if (!porUsuario[p.userLogin]) porUsuario[p.userLogin] = [];
    porUsuario[p.userLogin].push(p);
  });

  const pontosHoje = STATE.pontos.filter(p => {
    const d = new Date(p.ts);
    return d.toDateString() === new Date().toDateString();
  });

  return `
    <div class="stitle">▸ BATER PONTO</div>

    <!-- Card: Bater ponto -->
    <div class="card" style="margin-bottom:20px;text-align:center;">
      <div style="font-family:'Orbitron',sans-serif;font-size:.7rem;color:var(--accent);letter-spacing:.14em;margin-bottom:12px;">▸ REGISTRO DE PONTO</div>
      <div id="rel-clock" style="font-family:'Orbitron',sans-serif;font-size:2rem;color:var(--text);margin-bottom:8px;letter-spacing:.1em;">--:--:--</div>
      <div id="rel-date" style="font-family:'Share Tech Mono',monospace;font-size:.65rem;color:var(--text-dim);margin-bottom:20px;"></div>
      ${jaHoje ? `
        <div style="display:inline-block;padding:10px 24px;background:rgba(var(--accent3-rgb),.1);border:1px solid var(--accent3);border-radius:4px;font-family:'Share Tech Mono',monospace;font-size:.7rem;color:var(--accent3);">
          ✅ PONTO REGISTRADO HOJE
        </div>
        <div style="margin-top:10px;font-size:.78rem;color:var(--text-dim);">
          ${meusPontos.filter(p => new Date(p.ts).toDateString() === new Date().toDateString())
            .map(p => `Às ${p.hora}`).join(' — ')}
        </div>` : `
        <button class="btn btn-primary" style="font-size:.85rem;padding:12px 32px;" onclick="baterPonto()">
          ▸ BATER PONTO AGORA
        </button>`}
    </div>

    <!-- Meus registros recentes -->
    <div class="card" style="margin-bottom:20px;">
      <div style="font-family:'Orbitron',sans-serif;font-size:.68rem;color:var(--accent);letter-spacing:.12em;margin-bottom:12px;">▸ MEUS REGISTROS</div>
      ${meusPontos.length ? `
        <table class="tbl">
          <thead><tr><th>DATA</th><th>HORA</th><th>DIA DA SEMANA</th></tr></thead>
          <tbody>
            ${[...meusPontos].reverse().slice(0, 20).map(p => {
              const d = new Date(p.ts);
              return `<tr>
                <td style="font-family:'Share Tech Mono',monospace;">${d.toLocaleDateString('pt-BR')}</td>
                <td style="font-family:'Share Tech Mono',monospace;color:var(--accent);font-weight:700;">${p.hora}</td>
                <td style="font-family:'Share Tech Mono',monospace;font-size:.65rem;color:var(--text-dim);">${d.toLocaleDateString('pt-BR',{weekday:'long'}).toUpperCase()}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>` : `<p style="color:var(--text-dim);font-family:'Share Tech Mono',monospace;font-size:.68rem;">Nenhum ponto registrado.</p>`}
    </div>

    ${isSupervisor ? `
    <!-- Supervisão: Pontos de hoje -->
    <div class="card" style="margin-bottom:20px;">
      <div style="font-family:'Orbitron',sans-serif;font-size:.68rem;color:var(--accent);letter-spacing:.12em;margin-bottom:12px;">▸ PONTOS DE HOJE — TODOS OS AGENTES</div>
      ${pontosHoje.length ? `
        <table class="tbl">
          <thead><tr><th>AGENTE</th><th>HORA</th><th>CARGO</th></tr></thead>
          <tbody>
            ${pontosHoje.map(p => `<tr>
              <td><b>${p.nome}</b></td>
              <td style="font-family:'Share Tech Mono',monospace;color:var(--accent);font-weight:700;">${p.hora}</td>
              <td><span class="cargo-badge ${CARGO_BADGE_CLASS[p.cargo] || ''}" style="font-size:.55rem;">${CARGO_LABEL[p.cargo] || p.cargo}</span></td>
            </tr>`).join('')}
          </tbody>
        </table>` : `<p style="color:var(--text-dim);font-family:'Share Tech Mono',monospace;font-size:.68rem;">Nenhum agente bateu ponto hoje.</p>`}
    </div>

    <!-- Histórico completo por agente -->
    <div class="card">
      <div style="font-family:'Orbitron',sans-serif;font-size:.68rem;color:var(--accent);letter-spacing:.12em;margin-bottom:12px;">▸ HISTÓRICO COMPLETO POR AGENTE</div>
      ${Object.keys(porUsuario).length ? Object.entries(porUsuario).map(([login, pts]) => {
        const u = STATE.users.find(u => u.user === login);
        const nome = u ? u.nome : login;
        const cargo = u ? u.cargo : '';
        return `
          <div class="ponto-agente-block">
            <div class="ponto-agente-header" onclick="togglePontoAgente('pa-${login}')">
              <div>
                <div class="u-avatar" style="display:inline-flex;width:28px;height:28px;font-size:.7rem;">${nome.charAt(0)}</div>
                <b style="margin-left:8px;">${nome}</b>
                <span class="cargo-badge ${CARGO_BADGE_CLASS[cargo] || ''}" style="font-size:.5rem;margin-left:8px;">${CARGO_LABEL[cargo] || cargo}</span>
              </div>
              <span style="font-family:'Share Tech Mono',monospace;font-size:.65rem;color:var(--text-dim);">${pts.length} registro(s) ▾</span>
            </div>
            <div id="pa-${login}" class="ponto-agente-body" style="display:none;">
              <table class="tbl">
                <thead><tr><th>DATA</th><th>HORA</th><th>DIA</th></tr></thead>
                <tbody>
                  ${[...pts].reverse().map(p => {
                    const d = new Date(p.ts);
                    return `<tr>
                      <td style="font-family:'Share Tech Mono',monospace;">${d.toLocaleDateString('pt-BR')}</td>
                      <td style="font-family:'Share Tech Mono',monospace;color:var(--accent);font-weight:700;">${p.hora}</td>
                      <td style="font-family:'Share Tech Mono',monospace;font-size:.65rem;color:var(--text-dim);">${d.toLocaleDateString('pt-BR',{weekday:'long'}).toUpperCase()}</td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>`;
      }).join('') : `<p style="color:var(--text-dim);font-family:'Share Tech Mono',monospace;font-size:.68rem;">Nenhum registro de ponto no sistema.</p>`}
    </div>` : ''}`;
}

function togglePontoAgente(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
}

// Relógio em tempo real
let _clockInterval;
function startClock() {
  clearInterval(_clockInterval);
  _clockInterval = setInterval(() => {
    const now = new Date();
    const clockEl = document.getElementById('rel-clock');
    const dateEl  = document.getElementById('rel-date');
    if (clockEl) clockEl.textContent = now.toLocaleTimeString('pt-BR');
    if (dateEl)  dateEl.textContent  = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase();
  }, 1000);
}

// Observer para iniciar o relógio quando a aba aparecer
const _origRenderTab = renderTab;
// (overridden below)

async function baterPonto() {
  const now = new Date();
  const ponto = {
    userLogin: me.user,
    nome: me.nome,
    cargo: me.cargo,
    hora: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    data: now.toLocaleDateString('pt-BR'),
    ts: now.getTime()
  };

  try {
    await API.createPonto(ponto);
    toast(`✅ Ponto registrado às ${ponto.hora}!`, 's');
    // Re-render this tab
    renderTab(activeTab);
  } catch(e) {
    toast(e.message || 'Erro ao bater ponto.', 'd');
  }
}

// ══ VIEW: AUDITORIA ══
function vAuditoria() {
  const logs = STATE.audit;
  if (!logs.length) return `<div class="stitle">▸ AUDITORIA</div>${empty('🔍', 'Nenhum evento registrado.')}`;

  const items = logs.map(l => `
    <div class="log-entry">
      <div class="log-time">${new Date(l.ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
      <div class="log-icon">${l.icon || '📋'}</div>
      <div class="log-txt">${l.msg}</div>
    </div>`).join('');

  return `
    <div class="stitle">▸ AUDITORIA DO SISTEMA</div>
    <div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
      <button class="btn btn-danger btn-sm" onclick="limparAuditoria()">🗑 LIMPAR LOG</button>
    </div>
    <div class="card c-none" style="max-height:580px;overflow-y:auto;">${items}</div>
    <div style="margin-top:10px;" class="hint">Últimos <span>${logs.length}</span> evento(s) registrado(s).</div>`;
}

async function limparAuditoria() {
  if (!confirm('Limpar todo o histórico de auditoria?')) return;
  try {
    await API.clearAudit();
    STATE.audit = [];
    toast('Auditoria limpa.', 'w');
    renderTab(activeTab);
  } catch(e) {
    toast(e.message || 'Erro ao limpar auditoria.', 'd');
  }
}

// ══ ALTERAR SENHA PRÓPRIA ══
async function alterarSenhaPropria() {
  const atual = document.getElementById('s-atual').value;
  const nova  = document.getElementById('s-nova').value;
  const conf  = document.getElementById('s-conf').value;

  if (!atual || !nova || !conf)   { toast('Preencha todos os campos.', 'd'); return; }
  if (nova.length < 6)            { toast('Nova senha: mínimo 6 caracteres.', 'w'); return; }
  if (nova !== conf)              { toast('As senhas não coincidem.', 'd'); return; }

  // Verifica senha atual no servidor (simplificado: login local)
  try {
    await API.login(me.user, atual);
  } catch(e) {
    toast('Senha atual incorreta.', 'd'); return;
  }

  try {
    await API.resetSenha(me.user, nova, me.nome);
    me.pass = nova;
    sessionStorage.setItem('gmpol_session', JSON.stringify(me));
    toast('Senha alterada com sucesso!', 's');
    closeModal('m-senha');
    ['s-atual', 's-nova', 's-conf'].forEach(id => document.getElementById(id).value = '');
  } catch(e) {
    toast(e.message || 'Erro ao alterar senha.', 'd');
  }
}

// ══ MODALS ══
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
function toggleSettings() { document.getElementById('settings-menu')?.classList.toggle('open'); }
function closeSettings()  { document.getElementById('settings-menu')?.classList.remove('open'); }

document.addEventListener('click', (e) => {
  const menu = document.getElementById('settings-menu');
  const btn  = document.querySelector('.settings-btn');
  if (menu && !menu.contains(e.target) && e.target !== btn) {
    closeSettings();
  }
  // Fechar modals ao clicar fora
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

// ══ TOAST ══
function toast(txt, type = 'i') {
  const container = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${txt}</span>`;
  container.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 3800);
}

function empty(ico, txt) {
  return `<div class="empty"><div class="empty-ico">${ico}</div><p>${txt}</p></div>`;
}

// ══ OVERRIDE renderTab para iniciar relógio ══
const _origRender = renderTab;
// Wrap renderTab to start clock when pontos tab is active
const _renderTabOriginal = window.renderTab;
window.renderTab = function(idx) {
  _origRender(idx);
  const defs = me ? tabDefs(me.cargo) : [];
  if (defs[idx]?.key === 'pontos') {
    setTimeout(startClock, 50);
  } else {
    clearInterval(_clockInterval);
  }
};
// Fix switchTab reference
window.switchTab = function(idx) {
  activeTab = idx;
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', i === idx));
  window.renderTab(idx);
  closeSettings();
};

// ══ INICIALIZAÇÃO ══
window.onload = () => {
  initWebSocket();
  checkSession();
};
