// ══ CONFIGURAÇÕES E CONSTANTES ══
const K = {
  users: 'gmpol_users_v2',
  ocs:   'gmpol_ocs_v2',
  puns:  'gmpol_puns_v2',
  audit: 'gmpol_audit_v2',
  me:    'gmpol_session_v2'
};

const CARGO_LABEL = {
  guarda:   'Guarda Municipal',
  agente:   'Agente de Polícia',
  tatico:   'Policiamento Tático',
  escrivao: 'Escrivão de Polícia',
  delegado: 'Delegado de Polícia',
  chefe:    'Chefe de Polícia'
};

const CARGO_BADGE_CLASS = {
  guarda:   'cb-guarda',
  agente:   'cb-agente',
  tatico:   'cb-tatico',
  escrivao: 'cb-escrivao',
  delegado: 'cb-delegado',
  chefe:    'cb-chefe'
};

// ══ WEBSOCKET SETUP ══
let socket;
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  socket = new WebSocket(`${protocol}//${host}`);

  socket.onopen = () => console.log('Conectado ao WebSocket');
  
  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleSocketMessage(data);
  };

  socket.onclose = () => {
    console.log('WebSocket desconectado. Tentando reconectar...');
    setTimeout(initWebSocket, 3000);
  };
}

function broadcast(type, payload) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type, payload, sender: me ? me.user : 'system' }));
  }
}

function handleSocketMessage(data) {
  console.log('Mensagem recebida via socket:', data);
  const { type, payload } = data;

  switch (type) {
    case 'NEW_OC':
      // Salva no localstorage local
      const ocs = getOcs();
      if (!ocs.find(o => o.id === payload.id)) {
        ocs.push(payload);
        saveOcs(ocs, false); // false para não gerar loop de broadcast
        updateNotif();
        if (activeTab === 1 && me.cargo === 'chefe') renderTab(1);
        toast(`Nova ocorrência recebida: ${payload.id}`, 'w');
      }
      break;
    case 'OC_UPDATED':
      const allOcs = getOcs();
      const idx = allOcs.findIndex(o => o.id === payload.id);
      if (idx !== -1) {
        allOcs[idx] = payload;
        saveOcs(allOcs, false);
        updateNotif();
        if (me.user === payload.delegadoUser || me.cargo === 'chefe') {
           renderTab(activeTab);
           toast(`Ocorrência ${payload.id} foi atualizada.`, 's');
        }
      }
      break;
    case 'NEW_PUN':
      const puns = getPuns();
      puns.push(payload);
      savePuns(puns, false);
      if (activeTab === (me.cargo === 'chefe' ? 1 : (me.cargo === 'delegado' ? 3 : 1))) renderTab(activeTab);
      break;
    case 'USER_UPDATED':
      // Sincroniza lista de usuários se necessário
      break;
  }
}

// ══ DATA PERSISTENCE ══
function getLocal(key, def=[]) {
  try { return JSON.parse(localStorage.getItem(key)) || def; } catch(e) { return def; }
}

const getUsers = () => getLocal(K.users, [
  {user:'chefe',  pass:'chefe123', cargo:'chefe',    nome:'Comandante Geral', ativo:true},
  {user:'admin',  pass:'admin123', cargo:'chefe',    nome:'Administrador',    ativo:true},
  {user:'del01',  pass:'del123',   cargo:'delegado', nome:'Delegado Silva',   ativo:true}
]);

const getOcs   = () => getLocal(K.ocs);
const getPuns  = () => getLocal(K.puns);
const getAudit = () => getLocal(K.audit);

function saveUsers(data) { localStorage.setItem(K.users, JSON.stringify(data)); }

function saveOcs(data, shouldBroadcast = true) { 
  localStorage.setItem(K.ocs, JSON.stringify(data)); 
  if (shouldBroadcast) {
    // Pega o último item se for adição, ou envia o array todo (simplificado: envia o evento)
    // Para simplificar, vamos enviar apenas o que mudou no futuro, mas por ora:
    // broadcast('OCS_SYNC', data);
  }
}

function savePuns(data, shouldBroadcast = true) { 
  localStorage.setItem(K.puns, JSON.stringify(data)); 
  if (shouldBroadcast) broadcast('PUNS_SYNC', data);
}

function logAudit(msg, icon='📋') {
  const logs = getAudit();
  logs.unshift({msg, icon, ts:Date.now()});
  localStorage.setItem(K.audit, JSON.stringify(logs.slice(0,100)));
}

// ══ SESSION ══
let me = null;
function checkSession() {
  const saved = localStorage.getItem(K.me);
  if (saved) {
    me = JSON.parse(saved);
    showPanel();
  } else {
    showLogin();
  }
}

// ══ UI CORE ══
function showLogin() {
  document.getElementById('s-panel').classList.remove('active');
  document.getElementById('s-login').classList.add('active');
}

function login() {
  const u = document.getElementById('l-user').value.trim().toLowerCase();
  const p = document.getElementById('l-pass').value;
  if (!u || !p) return toast('Preencha todos os campos.', 'd');

  const found = getUsers().find(x => x.user === u && x.pass === p);
  if (!found) return toast('Usuário ou senha incorretos.', 'd');
  if (!found.ativo) return toast('Sua conta está desativada.', 'd');

  me = found;
  localStorage.setItem(K.me, JSON.stringify(me));
  logAudit(`<b>${me.nome}</b> acessou o sistema`, '🔓');
  showPanel();
  toast(`Bem-vindo, ${me.nome}!`, 's');
}

function logout() {
  logAudit(`<b>${me.nome}</b> saiu do sistema`, '🔒');
  me = null;
  localStorage.removeItem(K.me);
  location.reload();
}

// ══ PANEL SETUP ══
let activeTab = 0;

function showPanel() {
  document.getElementById('s-login').classList.remove('active');
  document.getElementById('s-panel').classList.add('active');
  const badge = document.getElementById('tb-badge');
  badge.className = `cargo-badge ${CARGO_BADGE_CLASS[me.cargo]}`;
  badge.textContent = CARGO_LABEL[me.cargo];
  document.getElementById('tb-user').textContent = me.nome;
  buildTabs(); 
  renderTab(0); 
  updateNotif();
}

function tabDefs(c) {
  const base = [{label:'▸ INÍCIO', notif:false}];
  if (c==='chefe')    return [...base,{label:'▸ OCORRÊNCIAS',notif:true},{label:'▸ HISTÓRICO',notif:false},{label:'▸ USUÁRIOS',notif:false},{label:'▸ AUDITORIA',notif:false}];
  if (c==='delegado') return [...base,{label:'▸ REGISTRAR',notif:false},{label:'▸ OCORRÊNCIAS',notif:false},{label:'▸ PUNIÇÕES',notif:false}];
  return [...base,{label:'▸ PUNIÇÕES',notif:false}];
}

function buildTabs() {
  const defs = tabDefs(me.cargo);
  document.getElementById('tabs').innerHTML = defs.map((t,i) => `
    <div class="tab ${i===0?'active':''}" id="tab-${i}" onclick="switchTab(${i})">
      ${t.label}${t.notif?`<span class="tab-n" id="tn-${i}" style="display:none"></span>`:''}
    </div>`).join('');
}

function switchTab(idx) {
  activeTab = idx;
  document.querySelectorAll('.tab').forEach((t,i) => t.classList.toggle('active',i===idx));
  renderTab(idx);
  closeSettings();
}

function renderTab(idx) {
  const c = me.cargo;
  let html = '';
  if (c==='chefe')    { const v=[vInicio,vOcChefe,vHistorico,vUsuarios,vAuditoria]; html=(v[idx]||vInicio)(); }
  else if (c==='delegado') { const v=[vInicio,vRegistrar,vOcDelegado,vPunicoes];   html=(v[idx]||vInicio)(); }
  else { const v=[vInicio,vPunicoes]; html=(v[idx]||vInicio)(); }
  document.getElementById('content').innerHTML = html;
}

function updateNotif() {
  if (!me) return;
  const pend = getOcs().filter(o=>o.status==='pendente').length;
  const pill = document.getElementById('notif-pill');
  const txt  = document.getElementById('notif-txt');
  const tn   = document.getElementById('tn-1');
  if (me.cargo==='chefe' && pend>0) {
    pill.classList.add('show'); txt.textContent = pend+' PENDENTE'+(pend>1?'S':'');
    if(tn){tn.textContent=pend;tn.style.display='flex';}
  } else {
    pill.classList.remove('show');
    if(tn) tn.style.display='none';
  }
}

// ══ VIEWS ══
function vInicio() {
  const ocs  = getOcs();
  const pend = ocs.filter(o=>o.status==='pendente').length;
  const ace  = ocs.filter(o=>o.status==='aceita').length;
  const rec  = ocs.filter(o=>o.status==='recusada').length;
  const showStats = me.cargo==='delegado'||me.cargo==='chefe';
  const msgs = {
    guarda:'Você tem acesso de leitura ao quadro de punições da corporação.',
    agente:'Você tem acesso de leitura ao quadro de punições da corporação.',
    tatico:'Você tem acesso de leitura ao quadro de punições da corporação.',
    escrivao:'Você pode consultar e registrar punições no quadro da corporação.',
    delegado:'Registre ocorrências sobre membros, acompanhe respostas do Chefe e gerencie punições.',
    chefe:'Você recebe e analisa todas as ocorrências dos Delegados, gerencia usuários e audita o sistema.',
  };
  return `
    <div class="stitle">▸ PAINEL INICIAL</div>
    <div class="card" style="margin-bottom:20px;">
      <div style="font-family:'Orbitron',sans-serif;font-size:1.15rem;color:var(--accent);margin-bottom:6px;">${me.nome}</div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:.65rem;color:var(--text-dim);margin-bottom:14px;letter-spacing:.1em;">${CARGO_LABEL[me.cargo].toUpperCase()} — SISTEMA CENTRAL</div>
      <p style="color:var(--text-mid);font-size:.92rem;line-height:1.6;">${msgs[me.cargo]}</p>
    </div>
    ${showStats?`
    <div class="g3">
      <div class="card c-warn stat-box"><div class="stat-num" style="color:var(--warn);">${pend}</div><div class="stat-lbl">PENDENTES</div></div>
      <div class="card c-success stat-box"><div class="stat-num" style="color:var(--accent3);">${ace}</div><div class="stat-lbl">ACEITAS</div></div>
      <div class="card c-danger stat-box"><div class="stat-num" style="color:var(--danger);">${rec}</div><div class="stat-lbl">RECUSADAS</div></div>
    </div>`:''}
  `;
}

function vRegistrar() {
  return `
    <div class="stitle">▸ REGISTRAR OCORRÊNCIA</div>
    <div class="card">
      <div class="g2">
        <div class="fg"><label>Nome do Jogador / Agente</label><input id="oc-nome" placeholder="Nome completo do agente"></div>
        <div class="fg"><label>Cargo do Agente</label>
          <select id="oc-cargo">
            <option>Guarda Municipal</option><option>Agente</option>
            <option selected>Tático</option><option>Escrivão</option>
          </select>
        </div>
        <div class="fg g-full"><label>Depoimento / Relato da Ocorrência</label>
          <textarea id="oc-dep" placeholder="Descreva detalhadamente o ocorrido, testemunhas, local, horário e evidências relevantes…"></textarea>
        </div>
      </div>
      <button class="btn btn-primary" style="margin-top:8px;max-width:260px;" onclick="registrarOc()">▸ REGISTRAR OCORRÊNCIA</button>
    </div>
  `;
}

function registrarOc() {
  const nome = document.getElementById('oc-nome')?.value.trim();
  const cargo= document.getElementById('oc-cargo')?.value;
  const dep  = document.getElementById('oc-dep')?.value.trim();
  if (!nome||!dep) { toast('Preencha nome e depoimento.','d'); return; }
  
  const ocs = getOcs();
  const newOc = {
    id:'OC-'+Date.now(), 
    delegado:me.nome, 
    delegadoUser:me.user, 
    nome, 
    cargo, 
    depoimento:dep, 
    status:'pendente', 
    resposta:'', 
    ts:Date.now()
  };
  
  ocs.push(newOc);
  saveOcs(ocs);
  broadcast('NEW_OC', newOc); // Envia para o servidor
  
  logAudit(`<b>${me.nome}</b> registrou ocorrência sobre <b>${nome}</b> (${cargo})`, '📝');
  toast('Ocorrência enviada ao Chefe de Polícia!','s');
  switchTab(2);
}

function vOcDelegado() {
  const ocs = getOcs().filter(o=>o.delegadoUser===me.user).reverse();
  return `<div class="stitle">▸ MINHAS OCORRÊNCIAS</div>${ocs.length?ocs.map(o=>ocCard(o,false)).join(''):empty('📋','Nenhuma ocorrência registrada.')}`;
}

function vOcChefe() {
  const ocs = getOcs().filter(o=>o.status==='pendente').reverse();
  return `<div class="stitle">▸ OCORRÊNCIAS PENDENTES</div>${ocs.length?ocs.map(o=>ocCard(o,true)).join(''):empty('✅','Nenhuma ocorrência pendente.')}`;
}

function vHistorico() {
  const ocs = getOcs().filter(o=>o.status!=='pendente').reverse();
  return `<div class="stitle">▸ HISTÓRICO DE OCORRÊNCIAS</div>${ocs.length?ocs.map(o=>ocCard(o,false)).join(''):empty('📂','Nenhuma ocorrência processada.')}`;
}

function ocCard(o, actions) {
  const scMap = {pendente:'sc-p',aceita:'sc-a',recusada:'sc-r'};
  const scLbl = {pendente:'⏳ Pendente',aceita:'✅ Aceita',recusada:'❌ Recusada'};
  const dt    = new Date(o.ts).toLocaleString('pt-BR');
  const actHTML = actions ? `
    <div class="oc-actions">
      <button class="btn btn-success btn-sm" onclick="abrirDecisao('${o.id}','aceita')">✔ ACEITAR</button>
      <button class="btn btn-danger btn-sm"  onclick="abrirDecisao('${o.id}','recusada')">✘ RECUSAR</button>
    </div>
    <div class="decide-zone" id="dz-${o.id}">
      <div class="fg" style="margin-top:10px;"><label>Motivo da decisão</label>
        <textarea id="dm-${o.id}" placeholder="Digite o motivo de aceitar ou recusar esta ocorrência…"></textarea>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button class="btn btn-sm" id="dc-${o.id}" onclick="decidir('${o.id}')">CONFIRMAR</button>
          <button class="btn btn-ghost btn-sm" onclick="fecharDecisao('${o.id}')">CANCELAR</button>
        </div>
      </div>
    </div>` :
    (o.resposta?`<div><span class="resp-lbl">Resposta do Chefe de Polícia</span><div class="dep-box" style="margin-bottom:0;">${o.resposta}</div></div>`:'');
  
  return `
    <div class="oc-wrap">
      <div class="oc-top">
        <div class="oc-meta">
          <div style="font-size:.72rem;font-weight:700;color:var(--text);margin-bottom:2px;">${o.id}</div>
          <div>${dt}</div><div>DELEGADO: <b>${o.delegado}</b></div>
        </div>
        <span class="status-chip ${scMap[o.status]}">${scLbl[o.status]}</span>
      </div>
      <div class="oc-fields">
        <div class="oc-f"><label>Nome do Agente</label><span>${o.nome}</span></div>
        <div class="oc-f"><label>Cargo</label><span>${o.cargo}</span></div>
      </div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:.58rem;color:var(--text-dim);margin-bottom:5px;letter-spacing:.08em;text-transform:uppercase;">Depoimento</div>
      <div class="dep-box">${o.depoimento}</div>
      ${actHTML}
    </div>`;
}

let _decAcao = {};
function abrirDecisao(id, acao) {
  document.querySelectorAll('.decide-zone').forEach(z => { if(z.id!==`dz-${id}`) z.classList.remove('open'); });
  const dz = document.getElementById(`dz-${id}`);
  const dc = document.getElementById(`dc-${id}`);
  if (!dz) return;
  if (_decAcao[id]===acao && dz.classList.contains('open')) { fecharDecisao(id); return; }
  _decAcao[id] = acao;
  dz.classList.add('open');
  dc.textContent = acao==='aceita'?'✔ CONFIRMAR ACEITAR':'✘ CONFIRMAR RECUSAR';
  dc.className   = `btn btn-sm ${acao==='aceita'?'btn-success':'btn-danger'}`;
}

function fecharDecisao(id) {
  const dz = document.getElementById(`dz-${id}`);
  if(dz) dz.classList.remove('open');
  delete _decAcao[id];
}

function decidir(id) {
  const acao   = _decAcao[id];
  const motivo = document.getElementById(`dm-${id}`)?.value.trim();
  if (!acao)   { toast('Selecione aceitar ou recusar.','d'); return; }
  if (!motivo) { toast('Digite o motivo antes de confirmar.','w'); return; }
  
  const ocs = getOcs();
  const idx = ocs.findIndex(o=>o.id===id);
  if(idx===-1) return;
  
  ocs[idx].status   = acao;
  ocs[idx].resposta = `${me.nome}: ${motivo}`;
  saveOcs(ocs);
  broadcast('OC_UPDATED', ocs[idx]); // Sincroniza decisão
  
  logAudit(`<b>${me.nome}</b> ${acao==='aceita'?'aceitou':'recusou'} a ocorrência <b>${id}</b> — agente: ${ocs[idx].nome}`, acao==='aceita'?'✅':'❌');
  toast(`Ocorrência ${acao==='aceita'?'aceita ✅':'recusada ❌'}!`, acao==='aceita'?'s':'d');
  renderTab(activeTab); 
  updateNotif();
}

function vUsuarios() {
  const users = getUsers();
  const rows  = users.map(u => {
    const isMe = u.user===me.user;
    const isChefe = u.cargo==='chefe';
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
        <td><span class="cargo-badge ${CARGO_BADGE_CLASS[u.cargo]}">${CARGO_LABEL[u.cargo]}</span></td>
        <td><span style="font-family:'Share Tech Mono',monospace;font-size:.62rem;color:var(--text-dim);">${u.criadoPor||'padrão'}</span></td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${isMe ? `<span style="font-family:'Share Tech Mono',monospace;font-size:.6rem;color:var(--accent);">VOCÊ</span>` : ''}
            ${!isMe&&!isChefe ? `<button class="btn btn-warn btn-xs" onclick="pedirResetSenha('${u.user}')">🔑 SENHA</button>` : ''}
            ${!isMe&&!isChefe ? `<button class="btn btn-danger btn-xs" onclick="pedirDelUsuario('${u.user}')">✘ REMOVER</button>` : ''}
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
        <thead><tr><th>USUÁRIO</th><th>CARGO</th><th>CRIADO POR</th><th>AÇÕES</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="margin-top:10px;" class="hint">Total: <span>${users.length}</span> usuário(s) registrado(s).</div>
  `;
}

function vAuditoria() {
  const logs = getAudit();
  if (!logs.length) return `<div class="stitle">▸ AUDITORIA</div>${empty('🔍','Nenhum evento registrado.')}`;
  const items = logs.map(l=>`
    <div class="log-entry">
      <div class="log-time">${new Date(l.ts).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div>
      <div class="log-icon">${l.icon||'📋'}</div>
      <div class="log-txt">${l.msg}</div>
    </div>`).join('');
  return `
    <div class="stitle">▸ AUDITORIA DO SISTEMA</div>
    <div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
      <button class="btn btn-danger btn-sm" onclick="limparAuditoria()">🗑 LIMPAR LOG</button>
    </div>
    <div class="card c-none" style="max-height:580px;overflow-y:auto;">${items}</div>
    <div style="margin-top:10px;" class="hint">Últimos <span>${logs.length}</span> evento(s) registrado(s).</div>
  `;
}

function limparAuditoria() {
  if(!confirm('Limpar todo o histórico de auditoria?')) return;
  localStorage.setItem(K.audit,'[]');
  toast('Auditoria limpa.','w');
  renderTab(activeTab);
}

function vPunicoes() {
  const puns   = getPuns();
  const canEdit= me.cargo==='escrivao'||me.cargo==='delegado'||me.cargo==='chefe';
  const form   = canEdit?`
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
    </div>`:''
  ;
  const nc = n => ({Leve:'sc-a',Médio:'sc-p',Grave:'sc-r'})[n]||'sc-p';
  const rows = [...puns].reverse().map((p,ri)=>{
    const realIdx = puns.length-1-ri;
    return `<tr>
      <td style="font-weight:600;">${p.nome}</td>
      <td style="color:var(--text-mid);font-size:.88rem;">${p.motivo}</td>
      <td><span class="status-chip ${nc(p.nivel)}">${p.nivel}</span></td>
      <td style="font-family:'Share Tech Mono',monospace;font-size:.62rem;color:var(--text-dim);">${p.autor}</td>
      ${canEdit?`<td><button class="btn btn-danger btn-xs" onclick="delPun(${realIdx})">✘</button></td>`:'<td></td>'}
    </tr>`;
  }).join('');
  return `
    <div class="stitle">▸ QUADRO DE PUNIÇÕES</div>
    ${form}
    <div class="card c-none" style="padding:0;overflow:hidden;">
      <table class="tbl">
        <thead><tr><th>NOME</th><th>MOTIVO</th><th>NÍVEL</th><th>REGISTRADO POR</th><th></th></tr></thead>
        <tbody>${rows||`<tr><td colspan="5" style="text-align:center;padding:30px;font-family:'Share Tech Mono',monospace;font-size:.68rem;color:var(--text-dim);">Nenhuma punição registrada.</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function addPun() {
  const nome  = document.getElementById('pn-nome')?.value.trim();
  const motivo= document.getElementById('pn-motivo')?.value.trim();
  const nivel = document.getElementById('pn-nivel')?.value;
  if(!nome||!motivo){toast('Preencha nome e motivo.','d');return;}
  
  const puns = getPuns();
  const newPun = {nome,motivo,nivel,autor:me.nome,ts:Date.now()};
  puns.push(newPun);
  savePuns(puns);
  broadcast('NEW_PUN', newPun);
  
  logAudit(`<b>${me.nome}</b> registrou punição <b>${nivel}</b> para <b>${nome}</b>`,'⚠️');
  toast('Punição registrada.','s');
  renderTab(activeTab);
}

function delPun(idx) {
  const puns = getPuns();
  const nome = puns[idx]?.nome||'';
  puns.splice(idx,1);
  savePuns(puns);
  logAudit(`<b>${me.nome}</b> removeu punição de <b>${nome}</b>`,'🗑');
  toast('Punição removida.','w');
  renderTab(activeTab);
}

// ══ MODALS & UTILS ══
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function toggleSettings() { document.getElementById('settings-menu').classList.toggle('open'); }
function closeSettings() { document.getElementById('settings-menu').classList.remove('open'); }

function toast(txt, type='i') {
  const container = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${txt}</span>`;
  container.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

function empty(ico,txt) {
  return `<div class="empty"><div class="empty-ico">${ico}</div><p>${txt}</p></div>`;
}

// ══ ALTERAR SENHA (própria) ══
function alterarSenha() {
  const atual = document.getElementById('s-atual').value;
  const nova  = document.getElementById('s-nova').value;
  const conf  = document.getElementById('s-conf').value;
  if (!atual||!nova||!conf)   { toast('Preencha todos os campos.','d'); return; }
  if (atual !== me.pass)      { toast('Senha atual incorreta.','d'); return; }
  if (nova.length < 6)        { toast('Nova senha: mínimo 6 caracteres.','w'); return; }
  if (nova !== conf)          { toast('As senhas não coincidem.','d'); return; }

  const users = getUsers();
  const idx   = users.findIndex(u => u.user === me.user);
  if (idx===-1) return;
  users[idx].pass = nova;
  me.pass = nova;
  saveUsers(users);
  localStorage.setItem(K.me, JSON.stringify(me));
  logAudit(`<b>${me.nome}</b> alterou a própria senha`, '🔑');
  toast('Senha alterada com sucesso!','s');
  closeModal('m-senha');
  ['s-atual','s-nova','s-conf'].forEach(id => document.getElementById(id).value='');
}

// ══ CRIAR USUÁRIO (Chefe) ══
function criarUsuario() {
  const nome  = document.getElementById('nu-nome').value.trim();
  const user  = document.getElementById('nu-user').value.trim().toLowerCase().replace(/\s/g,'');
  const cargo = document.getElementById('nu-cargo').value;
  const pass  = document.getElementById('nu-pass').value;
  if (!nome||!user||!cargo||!pass) { toast('Preencha todos os campos.','d'); return; }
  if (pass.length < 6) { toast('Senha mínima: 6 caracteres.','w'); return; }
  if (!/^[a-z0-9_]+$/.test(user)) { toast('Login: apenas letras, números e _.','w'); return; }
  const users = getUsers();
  if (users.find(u => u.user===user)) { toast('Login já existe no sistema.','d'); return; }
  users.push({user, pass, cargo, nome, ativo:true, criadoPor:me.user, criadoEm:Date.now()});
  saveUsers(users);
  logAudit(`<b>${me.nome}</b> criou o usuário <b>${nome}</b> (${CARGO_LABEL[cargo]})`, '👤');
  toast(`Usuário ${nome} criado com sucesso!`,'s');
  closeModal('m-novo-user');
  ['nu-nome','nu-user','nu-pass'].forEach(id => document.getElementById(id).value='');
  renderTab(activeTab);
}

// ══ INICIALIZAÇÃO ══
window.onload = () => {
  initWebSocket();
  checkSession();
};
