// ══ CONFIGURAÇÕES E CONSTANTES ══
const CARGO_LABEL = {
  rei:       'Rei Master',
  capitao:   'Capitão Arcano',
  observador:'Observador Negro',
  guardiao:  'Guardião',
  cacador:   'Caçador Noturno',
  sentinela: 'Sentinela'
};
const CARGO_BADGE_CLASS = {
  rei:'cb-rei', capitao:'cb-capitao', observador:'cb-observador',
  guardiao:'cb-guardiao', cacador:'cb-cacador', sentinela:'cb-sentinela'
};
const CARGO_PERM = { rei:6, capitao:5, observador:4, guardiao:3, cacador:2, sentinela:1 };

// ══ ESTADO ══
let me=null, activeTab=0;
let STATE={ocs:[],puns:[],pontos:[],users:[],audit:[]};
let _pendingCargoChange=null, _pendingBan=null, _banTimer=null, _clockInterval;

// ══ WEBSOCKET HANDLERS ══
function handleSocketMessage(data){
  const{type,payload}=data;
  switch(type){
    case 'INIT':
      STATE.ocs=payload.ocs||[]; STATE.puns=payload.puns||[];
      STATE.pontos=payload.pontos||[]; STATE.users=payload.users||[]; STATE.audit=payload.audit||[];
      updateNotif(); if(me)renderTab(activeTab); break;
    case 'NEW_OC':
      if(!STATE.ocs.find(o=>o.id===payload.id)){
        STATE.ocs.push(payload); updateNotif(); renderTab(activeTab);
        if(me&&payload.delegadoUser!==me.user) toast('Nova ocorrência: '+payload.id,'w');
      } break;
    case 'OC_UPDATED':{const i=STATE.ocs.findIndex(o=>o.id===payload.id);if(i!==-1){STATE.ocs[i]=payload;updateNotif();renderTab(activeTab);}break;}
    case 'OC_DELETED': STATE.ocs=STATE.ocs.filter(o=>o.id!==payload.id);updateNotif();renderTab(activeTab);break;
    case 'NEW_PUN': STATE.puns.push(payload);renderTab(activeTab);toast('Nova punição para '+payload.nome,'w');break;
    case 'PUNS_UPDATED': STATE.puns=payload;renderTab(activeTab);break;
    case 'NEW_PONTO': STATE.pontos.push(payload);renderTab(activeTab);if(me&&payload.userLogin!==me.user)toast(payload.nome+' bateu ponto às '+payload.hora,'i');break;
    case 'USERS_UPDATED': STATE.users=payload;if(activeTab===getTabIdx('users'))renderTab(activeTab);break;
    case 'AUDIT_NEW': STATE.audit.unshift(payload);if(activeTab===getTabIdx('audit'))renderTab(activeTab);break;
    case 'AUDIT_CLEARED': STATE.audit=[];if(activeTab===getTabIdx('audit'))renderTab(activeTab);break;
    case 'USER_BANNED':
      STATE.users=STATE.users.map(u=>u.user===payload.userLogin?{...u,banExpires:payload.expiresAt,banReason:payload.reason,banBy:payload.banBy}:u);
      if(activeTab===getTabIdx('users'))renderTab(activeTab);
      if(me&&payload.userLogin===me.user){showBanScreen(payload);}
      else if(me){toast('⛔ '+payload.userLogin+' suspenso por '+payload.duracao+'min(s).','w');}
      break;
    case 'USER_UNBANNED':
      STATE.users=STATE.users.map(u=>u.user===payload.userLogin?{...u,banExpires:null,banReason:null,banBy:null}:u);
      if(activeTab===getTabIdx('users'))renderTab(activeTab);
      if(me&&payload.userLogin===me.user){sessionStorage.removeItem('gmpol_session');location.reload();}
      break;
    case 'CARGO_CHANGED':
      STATE.users=STATE.users.map(u=>u.user===payload.userLogin?{...u,cargo:payload.newCargo}:u);
      if(activeTab===getTabIdx('users'))renderTab(activeTab);
      if(me&&payload.userLogin===me.user){
        me.cargo=payload.newCargo; sessionStorage.setItem('gmpol_session',JSON.stringify(me));
        const nl=CARGO_LABEL[payload.newCargo]||payload.newCargo;
        const ic=payload.tipo==='promovido'?'📈':'📉';
        const msg=payload.tipo==='promovido'
          ?`${ic} Você foi promovido para <b>${nl}</b>!`
          :`${ic} Você foi rebaixado para <b>${nl}</b>. Motivo: ${payload.motivo||'não informado'}`;
        showCargoNotif(msg,payload.tipo==='promovido'?'s':'d');
        const badge=document.getElementById('tb-badge');
        if(badge){badge.className='cargo-badge '+(CARGO_BADGE_CLASS[me.cargo]||'');badge.textContent=CARGO_LABEL[me.cargo]||me.cargo;}
        buildTabs(); renderTab(0); activeTab=0;
      } break;
    case 'PONG': break;
  }
}

function getTabIdx(name){if(!me)return -1;return tabDefs(me.cargo).findIndex(t=>t.key===name);}

// ══ SESSION ══
async function checkSession(){
  try{
    const saved=sessionStorage.getItem('gmpol_session');
    if(saved){
      let parsed;
      try{parsed=JSON.parse(saved);}catch(_){sessionStorage.removeItem('gmpol_session');showLogin();return;}
      if(!parsed||!parsed.user||!parsed.cargo){sessionStorage.removeItem('gmpol_session');showLogin();return;}
      // Garantir que pass nunca esteja na sessão
      const{pass:_p,...meSafe}=parsed;
      me=meSafe;
      _loadStateFromCache();
      try{const bc=await API.checkBan(me.user);if(bc&&bc.banned){showBanScreen(bc);return;}}catch(_){}
      showPanel();
    } else showLogin();
  }catch(e){sessionStorage.removeItem('gmpol_session');showLogin();}
}

function _loadStateFromCache(){
  if(typeof LSCache==='undefined')return;
  const c=LSCache.load(); if(!c)return;
  if(Array.isArray(c.ocs))STATE.ocs=c.ocs;
  if(Array.isArray(c.puns))STATE.puns=c.puns;
  if(Array.isArray(c.pontos))STATE.pontos=c.pontos;
  if(Array.isArray(c.users))STATE.users=c.users;
  if(Array.isArray(c.audit))STATE.audit=c.audit;
}

// ══ LOGIN / LOGOUT ══
async function login(){
  const u=document.getElementById('l-user').value.trim().toLowerCase();
  const p=document.getElementById('l-pass').value;
  if(!u||!p)return toast('Preencha todos os campos.','d');
  const btn=document.getElementById('btn-login');
  if(btn){btn.disabled=true;btn.textContent='▸ AUTENTICANDO…';}
  try{
    const res=await API.login(u,p);
    if(!res){throw new Error('Resposta inválida do servidor.');}
    if(res.banned){showBanScreen({expiresAt:res.expiresAt,reason:res.reason,banBy:res.banBy});return;}
    if(!res.user){throw new Error('Dados de usuário inválidos.');}
    // Garantir que o campo 'pass' nunca seja armazenado localmente
    const{pass:_p,...meSafe}=res.user;
    me=meSafe;
    sessionStorage.setItem('gmpol_session',JSON.stringify(me));
    activeTab=0; showPanel(); toast('Bem-vindo, '+me.nome+'!','s');
  }catch(e){toast(e.message||'Erro ao autenticar.','d');}
  finally{if(btn){btn.disabled=false;btn.textContent='▸ AUTENTICAR';}}
}

function toggleSenhaVisivel(){
  const i=document.getElementById('l-pass'),b=document.getElementById('eye-btn');
  if(!i)return;
  if(i.type==='password'){i.type='text';if(b){b.textContent='🙈';b.title='Ocultar senha';}}
  else{i.type='password';if(b){b.textContent='👁';b.title='Mostrar senha';}}
}

document.addEventListener('keydown',e=>{if(e.key==='Enter'){const s=document.getElementById('s-login');if(s&&s.classList.contains('active'))login();}});

function logout(){
  me=null;activeTab=0;
  sessionStorage.removeItem('gmpol_session');
  clearInterval(_clockInterval);clearInterval(_banTimer);
  location.reload();
}

// ══ TELA DE SUSPENSÃO ══
function showBanScreen(info){
  document.getElementById('s-login').classList.remove('active');
  document.getElementById('s-panel').classList.remove('active');
  const s=document.getElementById('s-ban');
  if(!s)return; s.classList.add('active');
  document.getElementById('ban-by').textContent=info.banBy||'Sistema';
  document.getElementById('ban-reason').textContent=info.reason||'Suspensão temporária.';
  document.getElementById('ban-expires').textContent=new Date(info.expiresAt).toLocaleString('pt-BR');
  startBanCountdown(info.expiresAt);
}

function startBanCountdown(expiresAt){
  clearInterval(_banTimer);
  function update(){
    const rem=expiresAt-Date.now();
    const el=document.getElementById('ban-timer');
    if(!el){clearInterval(_banTimer);return;}
    if(rem<=0){
      clearInterval(_banTimer); el.textContent='00:00:00';
      const m=document.getElementById('ban-status-msg');
      if(m){m.textContent='✅ Suspensão encerrada. Redirecionando...';m.style.color='#4ade80';}
      setTimeout(()=>{sessionStorage.removeItem('gmpol_session');location.reload();},3000);
      return;
    }
    const h=Math.floor(rem/3600000),mn=Math.floor((rem%3600000)/60000),s=Math.floor((rem%60000)/1000);
    el.textContent=`${String(h).padStart(2,'0')}:${String(mn).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  update(); _banTimer=setInterval(update,1000);
}

function showCargoNotif(html,type){
  const n=document.createElement('div');
  n.className='cargo-notif cargo-notif-'+type;
  n.innerHTML='<div class="cargo-notif-inner">'+html+'</div>';
  document.body.appendChild(n);
  setTimeout(()=>n.classList.add('cargo-notif-show'),50);
  setTimeout(()=>{n.classList.remove('cargo-notif-show');setTimeout(()=>n.remove(),600);},7000);
}

// ══ UI CORE ══
function showLogin(){
  document.getElementById('s-panel').classList.remove('active');
  document.getElementById('s-ban').classList.remove('active');
  document.getElementById('s-login').classList.add('active');
  setTimeout(()=>{const e=document.getElementById('l-user');if(e)e.focus();},80);
}

function showPanel(){
  document.getElementById('s-login').classList.remove('active');
  document.getElementById('s-ban').classList.remove('active');
  document.getElementById('s-panel').classList.add('active');
  const badge=document.getElementById('tb-badge');
  badge.className='cargo-badge '+(CARGO_BADGE_CLASS[me.cargo]||'cb-sentinela');
  badge.textContent=CARGO_LABEL[me.cargo]||me.cargo;
  document.getElementById('tb-user').textContent=me.nome;
  activeTab=0; buildTabs(); renderTab(0); updateNotif();
}

function tabDefs(c){
  const p=CARGO_PERM[c]||0;
  const base=[{label:'▸ INÍCIO',key:'home',notif:false}];
  const common=[
    {label:'▸ REGISTRAR',key:'registrar',notif:false},
    {label:'▸ MINHAS OCs',key:'myocs',notif:false},
    {label:'▸ PUNIÇÕES',key:'puns',notif:false},
    {label:'▸ PONTO',key:'pontos',notif:false}
  ];
  if(p>=5)return[...base,...common,{label:'▸ PENDENTES',key:'ocs',notif:true},{label:'▸ HISTÓRICO',key:'hist',notif:false},{label:'▸ USUÁRIOS',key:'users',notif:false},{label:'▸ AUDITORIA',key:'audit',notif:false}];
  if(p>=4)return[...base,...common,{label:'▸ PENDENTES',key:'ocs',notif:true},{label:'▸ HISTÓRICO',key:'hist',notif:false},{label:'▸ USUÁRIOS',key:'users',notif:false}];
  return[...base,...common];
}

function buildTabs(){
  const defs=tabDefs(me.cargo);
  document.getElementById('tabs').innerHTML=defs.map((t,i)=>'<div class="tab '+(i===0?'active':'')+'" id="tab-'+i+'" onclick="switchTab('+i+')">'+t.label+(t.notif?'<span class="tab-n" id="tn-'+i+'" style="display:none"></span>':'')+' </div>').join('');
  buildMobileDrawer();
}

function buildMobileDrawer(){
  if(!me)return;
  const defs=tabDefs(me.cargo);
  const drawer=document.getElementById('nav-drawer');
  if(!drawer)return;
  drawer.innerHTML=defs.map((t,i)=>'<div class="nav-drawer-item'+(i===activeTab?' active':'')+'" onclick="switchTab('+i+');closeNavDrawer();">'+t.label+(t.notif?'<span class="tab-n-badge" id="tnd-'+i+'" style="display:none">0</span>':'')+' </div>').join('');
}

function switchTab(idx){
  activeTab=idx;
  document.querySelectorAll('.tab').forEach((t,i)=>t.classList.toggle('active',i===idx));
  document.querySelectorAll('.nav-drawer-item').forEach((t,i)=>t.classList.toggle('active',i===idx));
  renderTab(idx); closeSettings();
  if(typeof closeNavDrawer==='function')closeNavDrawer();
}

function toggleNavDrawer(){const d=document.getElementById('nav-drawer');if(!d)return;if(d.classList.contains('open'))closeNavDrawer();else openNavDrawer();}
function openNavDrawer(){buildMobileDrawer();document.getElementById('nav-drawer')?.classList.add('open');document.getElementById('nav-overlay')?.classList.add('open');}
function closeNavDrawer(){document.getElementById('nav-drawer')?.classList.remove('open');document.getElementById('nav-overlay')?.classList.remove('open');}

function renderTab(idx){
  const defs=tabDefs(me.cargo);
  const def=defs[idx]||defs[0];
  const views={home:vInicio,ocs:vOcAdmin,hist:vHistorico,registrar:vRegistrar,myocs:vOcDelegado,puns:vPunicoes,users:vUsuarios,pontos:vPontos,audit:vAuditoria};
  document.getElementById('content').innerHTML=(views[def.key]||vInicio)();
  if(def.key==='pontos')setTimeout(startClock,50); else clearInterval(_clockInterval);
}

function updateNotif(){
  if(!me)return;
  const pend=STATE.ocs.filter(o=>o.status==='pendente').length;
  const pill=document.getElementById('notif-pill'),txt=document.getElementById('notif-txt');
  const ocIdx=tabDefs(me.cargo).findIndex(t=>t.key==='ocs');
  const tn=document.getElementById('tn-'+ocIdx);
  const canSee=(CARGO_PERM[me.cargo]||0)>=4;
  if(canSee&&pend>0){if(pill)pill.classList.add('show');if(txt)txt.textContent=pend+' PENDENTE'+(pend>1?'S':'');if(tn){tn.textContent=pend;tn.style.display='flex';}}
  else{if(pill)pill.classList.remove('show');if(tn)tn.style.display='none';}
}

// ══ VIEWS ══
function vInicio(){
  const p=CARGO_PERM[me.cargo]||0;
  const pend=STATE.ocs.filter(o=>o.status==='pendente').length;
  const ace=STATE.ocs.filter(o=>o.status==='aceita').length;
  const rec=STATE.ocs.filter(o=>o.status==='recusada').length;
  const can=STATE.ocs.filter(o=>o.status==='cancelada').length;
  const msgs={
    rei:'Acesso total ao sistema. Você controla tudo: registros, usuários, punições, cargos e auditoria. O Rei Master é irrebaixável.',
    capitao:'Você pode rebaixar e aumentar cargos, aplicar punições para menores patentes e gerenciar usuários.',
    observador:'Você pode punir diretamente sem aprovação e aplicar suspensões temporárias. Revise os registros pendentes.',
    guardiao:'Você controla Sentinelas e Caçadores Noturnos, podendo revisar e gerenciar suas atividades.',
    cacador:'Você pode registrar ocorrências, bater ponto e solicitar punições para Sentinelas.',
    sentinela:'Você pode registrar ocorrências, bater ponto e solicitar advertências para os demais membros.'
  };
  const today=new Date().toLocaleDateString('pt-BR',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  return `<div class="stitle">▸ PAINEL INICIAL</div>
    <div class="card" style="margin-bottom:20px;">
      <div style="font-family:'Orbitron',sans-serif;font-size:1.15rem;color:var(--accent);margin-bottom:4px;">${me.nome}</div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:.65rem;color:var(--text-dim);margin-bottom:4px;letter-spacing:.1em;">${(CARGO_LABEL[me.cargo]||me.cargo).toUpperCase()} — SISTEMA CENTRAL</div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:.6rem;color:var(--text-dim);margin-bottom:14px;">${today.toUpperCase()}</div>
      <p style="color:var(--text-mid);font-size:.92rem;line-height:1.6;">${msgs[me.cargo]||'Bem-vindo ao sistema.'}</p>
    </div>
    ${p>=3?`<div class="g3" style="grid-template-columns:repeat(4,1fr);"><div class="card c-warn stat-box"><div class="stat-num" style="color:var(--warn);">${pend}</div><div class="stat-lbl">PENDENTES</div></div><div class="card c-success stat-box"><div class="stat-num" style="color:var(--accent3);">${ace}</div><div class="stat-lbl">ACEITAS</div></div><div class="card c-danger stat-box"><div class="stat-num" style="color:var(--danger);">${rec}</div><div class="stat-lbl">RECUSADAS</div></div><div class="card stat-box"><div class="stat-num" style="color:var(--text-dim);">${can}</div><div class="stat-lbl">CANCELADAS</div></div></div>`:''}
    <div class="card" style="margin-top:20px;">
      <div style="font-family:'Orbitron',sans-serif;font-size:.7rem;color:var(--accent);letter-spacing:.12em;margin-bottom:12px;">▸ ÚLTIMAS ATIVIDADES</div>
      ${STATE.audit.slice(0,5).map(l=>`<div class="log-entry" style="padding:8px 0;border-bottom:1px solid var(--border);"><div class="log-time">${new Date(l.ts).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div><div class="log-icon">${l.icon||'📋'}</div><div class="log-txt" style="font-size:.8rem;">${l.msg}</div></div>`).join('')||'<p style="color:var(--text-dim);font-size:.8rem;">Nenhuma atividade.</p>'}
    </div>`;
}

function vRegistrar(){
  return `<div class="stitle">▸ REGISTRAR OCORRÊNCIA / DENÚNCIA</div>
    <div class="card">
      <p style="color:var(--text-mid);font-size:.88rem;margin-bottom:18px;line-height:1.6;">Qualquer membro pode registrar. Será analisado por Observadores, Capitães ou pelo Rei.</p>
      <div class="g2">
        <div class="fg"><label>Tipo</label><select id="oc-tipo"><option value="Ocorrência">Ocorrência</option><option value="Denúncia">Denúncia</option></select></div>
        <div class="fg"><label>Nome do Envolvido</label><input id="oc-nome" placeholder="Nome completo"></div>
        <div class="fg"><label>Cargo do Envolvido</label><select id="oc-cargo"><option>Sentinela</option><option>Caçador Noturno</option><option>Guardião</option><option>Observador Negro</option><option>Capitão Arcano</option><option>Rei Master</option><option>Civil</option><option>Outro</option></select></div>
        <div class="fg g-full"><label>Depoimento / Relato</label><textarea id="oc-dep" placeholder="Descreva detalhadamente…"></textarea></div>
      </div>
      <button class="btn btn-primary" style="margin-top:8px;max-width:260px;" onclick="registrarOc()">▸ ENVIAR REGISTRO</button>
    </div>`;
}

async function registrarOc(){
  const tipo=document.getElementById('oc-tipo')?.value||'Ocorrência';
  const nome=document.getElementById('oc-nome')?.value.trim();
  const cargo=document.getElementById('oc-cargo')?.value;
  const dep=document.getElementById('oc-dep')?.value.trim();
  if(!nome||!dep){toast('Preencha nome e depoimento.','d');return;}
  const oc={id:(tipo==='Denúncia'?'DN':'OC')+'-'+Date.now(),tipo,autor:me.nome,autorUser:me.user,autorCargo:me.cargo,delegado:me.nome,delegadoUser:me.user,nome,cargo,depoimento:dep,status:'pendente',resposta:'',ts:Date.now()};
  try{await API.createOc(oc);toast(tipo+' enviada!','s');const i=tabDefs(me.cargo).findIndex(t=>t.key==='myocs');if(i!==-1)switchTab(i);}
  catch(e){toast(e.message||'Erro.','d');}
}

function vOcDelegado(){const ocs=STATE.ocs.filter(o=>o.delegadoUser===me.user).reverse();return '<div class="stitle">▸ MEUS REGISTROS</div>'+(ocs.length?ocs.map(o=>ocCard(o,false,false)).join(''):empty('📋','Nenhum registro enviado.'));}

function vOcAdmin(){
  const myP=CARGO_PERM[me.cargo]||0;
  const ocs=STATE.ocs.filter(o=>o.status==='pendente').reverse();
  return '<div class="stitle">▸ REGISTROS PENDENTES</div>'+(ocs.length?ocs.map(o=>ocCard(o,myP>=4,myP>=6)).join(''):empty('✅','Nenhum registro pendente.'));
}

function vHistorico(){
  const ocs=STATE.ocs.filter(o=>o.status!=='pendente').reverse();
  const isRei=(CARGO_PERM[me.cargo]||0)>=6;
  return `<div class="stitle">▸ HISTÓRICO</div>
    <div class="filter-bar"><button class="btn btn-sm btn-ghost" onclick="filtrarHist('')">TODOS</button><button class="btn btn-sm btn-ghost" onclick="filtrarHist('aceita')">✅ ACEITAS</button><button class="btn btn-sm btn-ghost" onclick="filtrarHist('recusada')">❌ RECUSADAS</button><button class="btn btn-sm btn-ghost" onclick="filtrarHist('cancelada')">🚫 CANCELADAS</button></div>
    <div id="hist-list">${ocs.length?ocs.map(o=>ocCard(o,false,isRei)).join(''):empty('📂','Nenhuma ocorrência processada.')}</div>`;
}

function filtrarHist(status){
  const ocs=STATE.ocs.filter(o=>o.status!=='pendente'&&(!status||o.status===status)).reverse();
  const el=document.getElementById('hist-list');
  if(el)el.innerHTML=ocs.length?ocs.map(o=>ocCard(o,false,(CARGO_PERM[me.cargo]||0)>=6)).join(''):empty('📂','Nenhuma ocorrência nesta categoria.');
}

function ocCard(o,actions,masterMode){
  const scMap={pendente:'sc-p',aceita:'sc-a',recusada:'sc-r',cancelada:'sc-c'};
  const scLbl={pendente:'⏳ Pendente',aceita:'✅ Aceita',recusada:'❌ Recusada',cancelada:'🚫 Cancelada'};
  const dt=new Date(o.ts).toLocaleString('pt-BR');
  const tipoBadge=o.tipo==='Denúncia'?'<span class="tipo-badge tipo-denuncia">📢 DENÚNCIA</span>':'<span class="tipo-badge tipo-oc">📋 OCORRÊNCIA</span>';
  const masterBtns=masterMode?`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;padding-top:8px;border-top:1px solid var(--border);"><span style="font-family:'Share Tech Mono',monospace;font-size:.6rem;color:var(--accent);align-self:center;">REI:</span><button class="btn btn-warn btn-xs" onclick="abrirEditarOc('${o.id}')">✏️ EDITAR</button><button class="btn btn-danger btn-xs" onclick="confirmarDeleteOc('${o.id}')">🗑 DELETAR</button>${o.status!=='cancelada'?'<button class="btn btn-xs" style="background:var(--text-dim);color:#000;" onclick="cancelarOc(\''+o.id+'\')">🚫 CANCELAR</button>':''}</div>`:'';
  const actHTML=actions?`<div class="oc-actions"><button class="btn btn-success btn-sm" onclick="abrirDecisao('${o.id}','aceita')">✔ ACEITAR</button><button class="btn btn-danger btn-sm" onclick="abrirDecisao('${o.id}','recusada')">✘ RECUSAR</button></div><div class="decide-zone" id="dz-${o.id}"><div class="fg" style="margin-top:10px;"><label>Motivo</label><textarea id="dm-${o.id}"></textarea><div style="display:flex;gap:8px;margin-top:8px;"><button class="btn btn-sm" id="dc-${o.id}" onclick="decidir('${o.id}')">CONFIRMAR</button><button class="btn btn-ghost btn-sm" onclick="fecharDecisao('${o.id}')">CANCELAR</button></div></div></div>`:(o.resposta?'<div><span class="resp-lbl">Resposta</span><div class="dep-box" style="margin-bottom:0;">'+o.resposta+'</div></div>':'');
  return `<div class="oc-wrap"><div class="oc-top"><div class="oc-meta"><div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">${tipoBadge}<span style="font-size:.72rem;font-weight:700;color:var(--text);">${o.id}</span></div><div>${dt}</div><div>POR: <b>${o.autor||o.delegado}</b></div></div><span class="status-chip ${scMap[o.status]||'sc-p'}">${scLbl[o.status]||o.status}</span></div><div class="oc-fields"><div class="oc-f"><label>Envolvido</label><span>${o.nome}</span></div><div class="oc-f"><label>Cargo</label><span>${o.cargo}</span></div></div><div style="font-family:'Share Tech Mono',monospace;font-size:.58rem;color:var(--text-dim);margin-bottom:5px;letter-spacing:.08em;">RELATO</div><div class="dep-box">${o.depoimento}</div>${actHTML}${masterBtns}</div>`;
}

let _decAcao={};
function abrirDecisao(id,acao){
  document.querySelectorAll('.decide-zone').forEach(z=>{if(z.id!=='dz-'+id)z.classList.remove('open');});
  const dz=document.getElementById('dz-'+id),dc=document.getElementById('dc-'+id);
  if(!dz)return;
  if(_decAcao[id]===acao&&dz.classList.contains('open')){fecharDecisao(id);return;}
  _decAcao[id]=acao; dz.classList.add('open');
  dc.textContent=acao==='aceita'?'✔ CONFIRMAR ACEITAR':'✘ CONFIRMAR RECUSAR';
  dc.className='btn btn-sm '+(acao==='aceita'?'btn-success':'btn-danger');
}
function fecharDecisao(id){const dz=document.getElementById('dz-'+id);if(dz)dz.classList.remove('open');delete _decAcao[id];}
async function decidir(id){
  const acao=_decAcao[id],motivo=document.getElementById('dm-'+id)?.value.trim();
  if(!acao){toast('Selecione aceitar ou recusar.','d');return;}
  if(!motivo){toast('Digite o motivo.','w');return;}
  const oc=STATE.ocs.find(o=>o.id===id);if(!oc)return;
  try{await API.updateOc(id,{...oc,status:acao,resposta:me.nome+': '+motivo,decididoPor:me.user,decididoEm:Date.now()});toast('Ocorrência '+(acao==='aceita'?'aceita ✅':'recusada ❌')+'!',acao==='aceita'?'s':'d');updateNotif();}
  catch(e){toast(e.message||'Erro.','d');}
}

let _editOcId=null;
function abrirEditarOc(id){
  const oc=STATE.ocs.find(o=>o.id===id);if(!oc)return;
  _editOcId=id;
  document.getElementById('eo-nome').value=oc.nome;
  document.getElementById('eo-cargo').value=oc.cargo;
  document.getElementById('eo-delegado').value=oc.delegado;
  document.getElementById('eo-status').value=oc.status;
  document.getElementById('eo-dep').value=oc.depoimento;
  document.getElementById('eo-resp').value=oc.resposta||'';
  openModal('m-edit-oc');
}
async function salvarEdicaoOc(){
  if(!_editOcId)return;
  const oc=STATE.ocs.find(o=>o.id===_editOcId);if(!oc)return;
  try{await API.updateOc(_editOcId,{...oc,nome:document.getElementById('eo-nome').value.trim(),cargo:document.getElementById('eo-cargo').value.trim(),delegado:document.getElementById('eo-delegado').value.trim(),status:document.getElementById('eo-status').value,depoimento:document.getElementById('eo-dep').value.trim(),resposta:document.getElementById('eo-resp').value.trim(),editadoPor:me.user,editadoEm:Date.now()});closeModal('m-edit-oc');toast('Editado!','s');}
  catch(e){toast(e.message||'Erro.','d');}
}
function confirmarDeleteOc(id){
  const oc=STATE.ocs.find(o=>o.id===id);if(!oc)return;
  document.getElementById('del-info').innerHTML='Excluir <b>'+id+'</b>?';
  document.getElementById('del-confirm-btn').onclick=()=>{closeModal('m-confirm-del');deleteOc(id);};
  openModal('m-confirm-del');
}
async function deleteOc(id){try{await API.deleteOc(id,me.user);toast('Excluída.','w');}catch(e){toast(e.message,'d');}}
async function cancelarOc(id){
  const oc=STATE.ocs.find(o=>o.id===id);if(!oc)return;
  try{await API.updateOc(id,{...oc,status:'cancelada',canceladoPor:me.user,canceladoEm:Date.now()});toast('Cancelada.','w');}catch(e){toast(e.message,'d');}
}

// ══ VIEW: USUÁRIOS ══
function vUsuarios(){
  const myP=CARGO_PERM[me.cargo]||0;
  const rows=STATE.users.map(u=>{
    const isMe=u.user===me.user, tP=CARGO_PERM[u.cargo]||0;
    const canAct=!isMe&&myP>tP;
    const isRei=u.cargo==='rei';
    const isBanned=u.banExpires&&u.banExpires>Date.now();
    const bannedBadge=isBanned?'<span class="ban-badge">⛔ SUSPENSO</span>':'';
    const opts=Object.entries(CARGO_LABEL).filter(([k])=>(CARGO_PERM[k]||0)<myP).map(([k,v])=>'<option value="'+k+'" '+(u.cargo===k?'selected':'')+'>'+v+'</option>').join('');
    const cargoCell=(canAct&&!isRei&&opts)
      ?'<select class="cargo-select" onchange="alterarCargo(\''+u.user+'\', this.value, this)">'+opts+'</select>'
      :'<span class="cargo-badge '+(CARGO_BADGE_CLASS[u.cargo]||'')+'">'+(CARGO_LABEL[u.cargo]||u.cargo)+'</span>';
    const nn=u.nome.replace(/'/g,"\\'");
    return '<tr>'+
      '<td><div style="display:flex;align-items:center;gap:10px;"><div class="u-avatar">'+u.nome.charAt(0).toUpperCase()+'</div>'+
      '<div><div style="font-weight:600;">'+u.nome+' '+bannedBadge+'</div>'+
      '<div style="font-family:\'Share Tech Mono\',monospace;font-size:.6rem;color:var(--text-dim);">@'+u.user+'</div></div></div></td>'+
      '<td>'+cargoCell+'</td>'+
      '<td><span class="status-chip '+(u.ativo?'sc-a':'sc-r')+'">'+(u.ativo?'✅ Ativo':'❌ Inativo')+'</span></td>'+
      '<td style="font-family:\'Share Tech Mono\',monospace;font-size:.62rem;color:var(--text-dim);">'+(u.criadoPor||'padrão')+'</td>'+
      '<td><div style="display:flex;gap:5px;flex-wrap:wrap;">'+
        (isMe?'<span style="font-family:\'Share Tech Mono\',monospace;font-size:.6rem;color:var(--accent);">VOCÊ</span>':'')+
        (canAct?'<button class="btn btn-warn btn-xs" onclick="abrirResetSenha(\''+u.user+'\',\''+nn+'\')">🔑</button>':'')+
        (canAct&&!isBanned?'<button class="btn btn-danger btn-xs" onclick="abrirBanModal(\''+u.user+'\',\''+nn+'\',\''+u.cargo+'\')">⛔ SUSPENDER</button>':'')+
        (canAct&&isBanned?'<button class="btn btn-success btn-xs" onclick="removerBan(\''+u.user+'\',\''+nn+'\')">✅ LIBERAR</button>':'')+
        (canAct&&myP>=5?'<button class="btn btn-xs '+(u.ativo?'btn-danger':'btn-success')+'" onclick="toggleStatus(\''+u.user+'\','+((!u.ativo))+')">'+( u.ativo?'🚫':'✅')+'</button>':'')+
        (myP>=6&&!isMe?'<button class="btn btn-danger btn-xs" onclick="confirmarDeleteUser(\''+u.user+'\',\''+nn+'\')">🗑</button>':'')+
      '</div></td></tr>';
  }).join('');
  return '<div class="stitle">▸ GERENCIAR USUÁRIOS</div>'+
    (myP>=5?'<div style="display:flex;justify-content:flex-end;margin-bottom:16px;"><button class="btn btn-success btn-sm" onclick="abrirCriarUsuario()">+ CRIAR USUÁRIO</button></div>':'')+
    '<div class="card c-none" style="padding:0;overflow:hidden;"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>USUÁRIO</th><th>CARGO</th><th>STATUS</th><th>CRIADO POR</th><th>AÇÕES</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>'+
    '<div style="margin-top:10px;" class="hint">Total: <span>'+STATE.users.length+'</span> usuário(s).</div>';
}

async function criarUsuario(){
  const nome=document.getElementById('nu-nome').value.trim(),user=document.getElementById('nu-user').value.trim().toLowerCase().replace(/\s/g,''),cargo=document.getElementById('nu-cargo').value,pass=document.getElementById('nu-pass').value;
  if(!nome||!user||!cargo||!pass){toast('Preencha todos os campos.','d');return;}
  if(pass.length<6){toast('Senha mínima: 6 caracteres.','w');return;}
  if(!/^[a-z0-9_]+$/.test(user)){toast('Login: apenas letras, números e _.','w');return;}
  // Não permitir criar usuário com cargo >= o seu
  if((CARGO_PERM[cargo]||0)>=(CARGO_PERM[me.cargo]||0)){toast('Você não pode criar usuários com cargo igual ou superior ao seu.','d');return;}
  try{await API.createUser({nome,user,cargo,pass,criadoPor:me.user});toast('Usuário '+nome+' criado!','s');closeModal('m-novo-user');['nu-nome','nu-user','nu-pass'].forEach(id=>document.getElementById(id).value='');}
  catch(e){toast(e.message||'Erro.','d');}
}

function abrirCriarUsuario(){
  // Preencher select com cargos menores que o do usuário atual
  const myP=CARGO_PERM[me.cargo]||0;
  const sel=document.getElementById('nu-cargo');
  if(sel){
    sel.innerHTML=Object.entries(CARGO_LABEL)
      .filter(([k])=>(CARGO_PERM[k]||0)<myP)
      .reverse()
      .map(([k,v])=>'<option value="'+k+'">'+v+'</option>')
      .join('');
  }
  ['nu-nome','nu-user','nu-pass'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  openModal('m-novo-user');
}

function abrirResetSenha(username,nome){
  document.getElementById('rs-info').innerHTML='Redefinindo senha de: <b>'+nome+'</b>';
  document.getElementById('rs-target').value=username;
  document.getElementById('rs-nova').value='';document.getElementById('rs-conf').value='';
  openModal('m-reset-senha');
}
async function confirmarResetSenha(){
  const un=document.getElementById('rs-target').value,nova=document.getElementById('rs-nova').value,conf=document.getElementById('rs-conf').value;
  if(!nova||!conf){toast('Preencha.','d');return;}if(nova.length<6){toast('Mínimo 6 caracteres.','w');return;}if(nova!==conf){toast('Senhas não coincidem.','d');return;}
  try{await API.resetSenha(un,nova,me.nome);toast('Senha redefinida!','s');closeModal('m-reset-senha');}catch(e){toast(e.message,'d');}
}

function confirmarDeleteUser(username,nome){
  document.getElementById('del-info').innerHTML='Excluir <b>'+nome+'</b>?';
  document.getElementById('del-confirm-btn').onclick=()=>{closeModal('m-confirm-del');deleteUser(username);};
  openModal('m-confirm-del');
}
async function deleteUser(un){try{await API.deleteUser(un,me.nome);toast('Excluído.','w');}catch(e){toast(e.message,'d');}}
async function toggleStatus(un,ativo){try{await API.toggleUserStatus(un,ativo,me.nome);toast('Conta '+(ativo?'ativada':'desativada')+'.', ativo?'s':'w');}catch(e){toast(e.message,'d');}}

// ── Alterar cargo — rebaixamento exige motivo ──
function alterarCargo(username,novoCargo,selectEl){
  const tU=STATE.users.find(u=>u.user===username);if(!tU)return;
  const oP=CARGO_PERM[tU.cargo]||0, nP=CARGO_PERM[novoCargo]||0;
  if(nP<oP){
    _pendingCargoChange={username,novoCargo,oldCargo:tU.cargo,selectEl};
    document.getElementById('rb-info').innerHTML='Rebaixando <b>'+tU.nome+'</b>:<br><span style="color:var(--accent3);">'+(CARGO_LABEL[tU.cargo]||tU.cargo)+'</span> → <span style="color:var(--danger);">'+(CARGO_LABEL[novoCargo]||novoCargo)+'</span>';
    document.getElementById('rb-motivo').value='';
    openModal('m-rebaixar');
  } else _doCargoChange(username,novoCargo,null);
}

async function _doCargoChange(username,cargo,motivo){
  try{await API.updateUserCargo(username,cargo,me.nome,motivo);toast('Cargo alterado!','s');}
  catch(e){toast(e.message||'Erro.','d');if(_pendingCargoChange?.selectEl)_pendingCargoChange.selectEl.value=_pendingCargoChange.oldCargo;_pendingCargoChange=null;}
}

async function confirmarRebaixar(){
  const motivo=document.getElementById('rb-motivo')?.value.trim();
  if(!motivo){toast('Informe o motivo.','d');return;}
  if(!_pendingCargoChange){closeModal('m-rebaixar');return;}
  const{username,novoCargo}=_pendingCargoChange;
  closeModal('m-rebaixar');
  await _doCargoChange(username,novoCargo,motivo);
  _pendingCargoChange=null;
}

function cancelarRebaixar(){
  if(_pendingCargoChange?.selectEl)_pendingCargoChange.selectEl.value=_pendingCargoChange.oldCargo;
  _pendingCargoChange=null; closeModal('m-rebaixar');
}

// ── Suspensão temporária ──
function abrirBanModal(username,nome,cargo){
  _pendingBan={username,nome};
  document.getElementById('bn-info').innerHTML='Suspender <b>'+nome+'</b> — <span class="cargo-badge '+(CARGO_BADGE_CLASS[cargo]||'')+'" style="font-size:.55rem;">'+(CARGO_LABEL[cargo]||cargo)+'</span>';
  document.getElementById('bn-duracao').value='';document.getElementById('bn-motivo').value='';
  openModal('m-ban');
}

async function confirmarBan(){
  if(!_pendingBan){closeModal('m-ban');return;}
  const dur=parseInt(document.getElementById('bn-duracao').value)||0;
  const motivo=document.getElementById('bn-motivo').value.trim();
  if(dur<=0){toast('Duração inválida (em minutos).','d');return;}
  if(!motivo){toast('Informe o motivo.','d');return;}
  try{await API.applyBan(_pendingBan.username,dur,motivo,me.user,me.nome);toast(_pendingBan.nome+' suspenso por '+dur+' min(s).','w');closeModal('m-ban');_pendingBan=null;}
  catch(e){toast(e.message||'Erro.','d');}
}

async function removerBan(username,nome){
  try{await API.removeBan(username,me.nome);toast('Suspensão de '+nome+' removida.','s');}
  catch(e){toast(e.message||'Erro.','d');}
}

// ══ VIEW: PUNIÇÕES ══
function vPunicoes(){
  const myP=CARGO_PERM[me.cargo]||0, canEdit=myP>=4;
  const nc=n=>({Leve:'sc-a',Médio:'sc-p',Grave:'sc-r'})[n]||'sc-p';
  const form=canEdit?`<div class="card" style="margin-bottom:22px;">
    <div style="font-family:'Orbitron',sans-serif;font-size:.72rem;color:var(--accent);letter-spacing:.14em;margin-bottom:16px;">▸ REGISTRAR PUNIÇÃO</div>
    <div class="g2"><div class="fg"><label>Nome do Agente</label><input id="pn-nome"></div><div class="fg"><label>Nível</label><select id="pn-nivel"><option>Leve</option><option>Médio</option><option>Grave</option></select></div><div class="fg g-full"><label>Motivo</label><input id="pn-motivo"></div></div>
    <button class="btn btn-primary" style="margin-top:10px;max-width:200px;" onclick="addPun()">▸ REGISTRAR</button>
  </div>`:`<div class="card c-none" style="margin-bottom:16px;padding:12px 16px;border:1px solid var(--border);font-family:'Share Tech Mono',monospace;font-size:.68rem;color:var(--text-dim);">▸ Apenas Observadores Negros e acima podem registrar punições diretamente.</div>`;
  const rows=[...STATE.puns].reverse().map((p,ri)=>{
    const realIdx=STATE.puns.length-1-ri;
    return '<tr><td style="font-weight:600;">'+p.nome+'</td><td style="color:var(--text-mid);">'+p.motivo+'</td><td><span class="status-chip '+nc(p.nivel)+'">'+p.nivel+'</span></td><td style="font-family:\'Share Tech Mono\',monospace;font-size:.62rem;color:var(--text-dim);">'+p.autor+'</td><td style="font-family:\'Share Tech Mono\',monospace;font-size:.6rem;color:var(--text-dim);">'+new Date(p.ts).toLocaleDateString('pt-BR')+'</td>'+(canEdit?'<td><button class="btn btn-danger btn-xs" onclick="delPun('+realIdx+')">✘</button></td>':'<td></td>')+'</tr>';
  }).join('');
  return '<div class="stitle">▸ QUADRO DE PUNIÇÕES</div>'+form+'<div class="card c-none" style="padding:0;overflow:hidden;"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>NOME</th><th>MOTIVO</th><th>NÍVEL</th><th>REGISTRADO POR</th><th>DATA</th><th></th></tr></thead><tbody>'+(rows||'<tr><td colspan="6" style="text-align:center;padding:30px;font-family:\'Share Tech Mono\',monospace;font-size:.68rem;color:var(--text-dim);">Nenhuma punição registrada.</td></tr>')+'</tbody></table></div></div>';
}
async function addPun(){
  const nome=document.getElementById('pn-nome')?.value.trim(),motivo=document.getElementById('pn-motivo')?.value.trim(),nivel=document.getElementById('pn-nivel')?.value;
  if(!nome||!motivo){toast('Preencha nome e motivo.','d');return;}
  try{await API.createPun({nome,motivo,nivel,autor:me.nome,ts:Date.now()});toast('Punição registrada.','s');document.getElementById('pn-nome').value='';document.getElementById('pn-motivo').value='';}
  catch(e){toast(e.message||'Erro.','d');}
}
async function delPun(idx){
  try{const p=STATE.puns[idx];if(p&&p.id)await API.deletePunById(p.id,me.nome);else await API.deletePun(idx,me.nome);toast('Removida.','w');}
  catch(e){toast(e.message||'Erro.','d');}
}

// ══ VIEW: PONTO ══
function vPontos(){
  const myP=CARGO_PERM[me.cargo]||0, isSuperv=myP>=3;
  const mine=STATE.pontos.filter(p=>p.userLogin===me.user);
  const hoje=new Date().toDateString(), jaHoje=mine.some(p=>new Date(p.ts).toDateString()===hoje);
  const porUser={};STATE.pontos.forEach(p=>{if(!porUser[p.userLogin])porUser[p.userLogin]=[];porUser[p.userLogin].push(p);});
  const hoje2=STATE.pontos.filter(p=>new Date(p.ts).toDateString()===hoje);

  const FM="font-family:'Share Tech Mono',monospace;";
  const FO="font-family:'Orbitron',sans-serif;";

  const minhaTab=mine.length
    ?'<table class="tbl"><thead><tr><th>DATA</th><th>HORA</th><th>DIA</th></tr></thead><tbody>'
      +[...mine].reverse().slice(0,20).map(function(p){const d=new Date(p.ts);return(
        '<tr><td style="'+FM+'">'+d.toLocaleDateString('pt-BR')+'</td>'
        +'<td style="'+FM+'color:var(--accent);font-weight:700;">'+p.hora+'</td>'
        +'<td style="'+FM+'font-size:.65rem;color:var(--text-dim);">'+d.toLocaleDateString('pt-BR',{weekday:'long'}).toUpperCase()+'</td></tr>'
      );}).join('')+'</tbody></table>'
    :'<p style="color:var(--text-dim);'+FM+'font-size:.68rem;">Nenhum ponto.</p>';

  const botaoPonto=jaHoje
    ?'<div style="display:inline-block;padding:10px 24px;background:rgba(var(--accent3-rgb),.1);border:1px solid var(--accent3);border-radius:4px;'+FM+'font-size:.7rem;color:var(--accent3);">\u2705 PONTO REGISTRADO HOJE</div>'
    :'<button class="btn btn-primary" style="font-size:.85rem;padding:12px 32px;" onclick="baterPonto()">\u25b8 BATER PONTO AGORA</button>';

  var supervHtml='';
  if(isSuperv){
    const tabelaHoje=hoje2.length
      ?'<table class="tbl"><thead><tr><th>AGENTE</th><th>HORA</th><th>CARGO</th></tr></thead><tbody>'
        +hoje2.map(function(p){return(
          '<tr><td><b>'+p.nome+'</b></td>'
          +'<td style="'+FM+'color:var(--accent);font-weight:700;">'+p.hora+'</td>'
          +'<td><span class="cargo-badge '+(CARGO_BADGE_CLASS[p.cargo]||'')+'" style="font-size:.55rem;">'+(CARGO_LABEL[p.cargo]||p.cargo)+'</span></td></tr>'
        );}).join('')+'</tbody></table>'
      :'<p style="color:var(--text-dim);'+FM+'font-size:.68rem;">Nenhum hoje.</p>';

    const tabelaAgentes=Object.entries(porUser).map(function(kv){
      const login=kv[0],pts=kv[1];
      const u=STATE.users.find(function(u){return u.user===login;});
      const nm=u?u.nome:login;
      const cg=u?u.cargo:'';
      const rows=[...pts].reverse().map(function(p){
        const d=new Date(p.ts);
        return '<tr>'
          +'<td style="'+FM+'">'+d.toLocaleDateString('pt-BR')+'</td>'
          +'<td style="'+FM+'color:var(--accent);font-weight:700;">'+p.hora+'</td>'
          +'<td style="'+FM+'font-size:.65rem;color:var(--text-dim);">'+d.toLocaleDateString('pt-BR',{weekday:'long'}).toUpperCase()+'</td>'
          +'</tr>';
      }).join('');
      return '<div class="ponto-agente-block">'
        +'<div class="ponto-agente-header" onclick="togglePontoAgente(\'pa-'+login+'\')">'
          +'<div><div class="u-avatar" style="display:inline-flex;width:28px;height:28px;font-size:.7rem;">'+nm.charAt(0)+'</div>'
          +'<b style="margin-left:8px;">'+nm+'</b>'
          +'<span class="cargo-badge '+(CARGO_BADGE_CLASS[cg]||'')+'" style="font-size:.5rem;margin-left:8px;">'+(CARGO_LABEL[cg]||cg)+'</span></div>'
          +'<span style="'+FM+'font-size:.65rem;color:var(--text-dim);">'+pts.length+' reg. \u25be</span>'
        +'</div>'
        +'<div id="pa-'+login+'" style="display:none;">'
          +'<table class="tbl"><thead><tr><th>DATA</th><th>HORA</th><th>DIA</th></tr></thead><tbody>'+rows+'</tbody></table>'
        +'</div></div>';
    }).join('');

    supervHtml=
      '<div class="card" style="margin-bottom:20px;">'
        +'<div style="'+FO+'font-size:.68rem;color:var(--accent);letter-spacing:.12em;margin-bottom:12px;">\u25b8 PONTOS HOJE</div>'
        +tabelaHoje
      +'</div>'
      +'<div class="card">'
        +'<div style="'+FO+'font-size:.68rem;color:var(--accent);letter-spacing:.12em;margin-bottom:12px;">\u25b8 HIST\u00d3RICO POR AGENTE</div>'
        +tabelaAgentes
      +'</div>';
  }

  return '<div class="stitle">\u25b8 BATER PONTO</div>'
    +'<div class="card" style="margin-bottom:20px;text-align:center;">'
      +'<div style="'+FO+'font-size:.7rem;color:var(--accent);letter-spacing:.14em;margin-bottom:12px;">\u25b8 REGISTRO DE PONTO</div>'
      +'<div id="rel-clock" style="'+FO+'font-size:2rem;color:var(--text);margin-bottom:8px;letter-spacing:.1em;">--:--:--</div>'
      +'<div id="rel-date" style="'+FM+'font-size:.65rem;color:var(--text-dim);margin-bottom:20px;"></div>'
      +botaoPonto
    +'</div>'
    +'<div class="card" style="margin-bottom:20px;">'
      +'<div style="'+FO+'font-size:.68rem;color:var(--accent);letter-spacing:.12em;margin-bottom:12px;">\u25b8 MEUS REGISTROS</div>'
      +minhaTab
    +'</div>'
    +supervHtml;
}
function togglePontoAgente(id){const el=document.getElementById(id);if(el)el.style.display=el.style.display==='none'?'':'none';}

function startClock(){
  clearInterval(_clockInterval);
  _clockInterval=setInterval(()=>{
    const now=new Date(),ce=document.getElementById('rel-clock'),de=document.getElementById('rel-date');
    if(!ce){clearInterval(_clockInterval);return;}
    ce.textContent=now.toLocaleTimeString('pt-BR');
    if(de)de.textContent=now.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).toUpperCase();
  },1000);
}
async function baterPonto(){
  const now=new Date();
  const p={userLogin:me.user,nome:me.nome,cargo:me.cargo,hora:now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}),data:now.toLocaleDateString('pt-BR'),ts:now.getTime()};
  try{await API.createPonto(p);toast('✅ Ponto às '+p.hora+'!','s');renderTab(activeTab);}catch(e){toast(e.message||'Erro.','d');}
}

// ══ VIEW: AUDITORIA ══
function vAuditoria(){
  const logs=STATE.audit;
  if(!logs.length)return'<div class="stitle">▸ AUDITORIA</div>'+empty('🔍','Nenhum evento.');
  return'<div class="stitle">▸ AUDITORIA DO SISTEMA</div><div style="display:flex;justify-content:flex-end;margin-bottom:12px;"><button class="btn btn-danger btn-sm" onclick="limparAuditoria()">🗑 LIMPAR LOG</button></div><div class="card c-none" style="max-height:580px;overflow-y:auto;">'+logs.map(l=>'<div class="log-entry"><div class="log-time">'+new Date(l.ts).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+'</div><div class="log-icon">'+(l.icon||'📋')+'</div><div class="log-txt">'+l.msg+'</div></div>').join('')+'</div><div style="margin-top:10px;" class="hint">'+logs.length+' evento(s).</div>';
}
async function limparAuditoria(){
  if(!confirm('Limpar auditoria?'))return;
  try{await API.clearAudit();toast('Auditoria limpa.','w');}catch(e){toast(e.message,'d');}
}

// ══ ALTERAR SENHA PRÓPRIA ══
async function alterarSenhaPropria(){
  const at=document.getElementById('s-atual').value,nv=document.getElementById('s-nova').value,cf=document.getElementById('s-conf').value;
  if(!at||!nv||!cf){toast('Preencha todos os campos.','d');return;}
  if(nv.length<6){toast('Nova senha: mínimo 6 caracteres.','w');return;}
  if(nv!==cf){toast('Confirmação de senha não confere.','d');return;}
  // Verificar senha atual via login
  try{
    const check=await API.login(me.user,at);
    if(!check||check.banned){toast('Senha atual incorreta.','d');return;}
    if(!check.user){toast('Senha atual incorreta.','d');return;}
  }catch(e){toast('Senha atual incorreta.','d');return;}
  try{
    await API.resetSenha(me.user,nv,me.nome);
    toast('Senha alterada com sucesso!','s');
    closeModal('m-senha');
    ['s-atual','s-nova','s-conf'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  }catch(e){toast(e.message||'Erro ao alterar senha.','d');}
}

// ══ HELPERS ══
function openModal(id){document.getElementById(id)?.classList.add('open');}
function closeModal(id){document.getElementById(id)?.classList.remove('open');}
function toggleSettings(){document.getElementById('settings-menu')?.classList.toggle('open');}
function closeSettings(){document.getElementById('settings-menu')?.classList.remove('open');}

document.addEventListener('click',e=>{
  const menu=document.getElementById('settings-menu'),btn=document.querySelector('.settings-btn');
  if(menu&&!menu.contains(e.target)&&e.target!==btn)closeSettings();
  if(e.target.classList.contains('modal-overlay'))e.target.classList.remove('open');
});

function toast(txt,type='i'){
  const c=document.getElementById('toast-container'),t=document.createElement('div');
  t.className='toast '+type; t.innerHTML='<span>'+txt+'</span>'; c.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),400);},3800);
}
function empty(ico,txt){return'<div class="empty"><div class="empty-ico">'+ico+'</div><p>'+txt+'</p></div>';}

// ══ INIT ══
window.onload=()=>{initWebSocket();checkSession();};
