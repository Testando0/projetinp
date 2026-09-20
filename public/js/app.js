// ══ CONFIG ══
const CARGO_LABEL={admin:'Admin master',chefe:'Chefe de polícia',delegado:'Delegado',escrivao:'Escrivão',tatico:'Tático',agente:'Agente oficial',gm:'Guarda municipal'};
const CARGO_BADGE_CLASS={admin:'cb-master',chefe:'cb-chefe',delegado:'cb-delegado',escrivao:'cb-escrivao',tatico:'cb-tatico',agente:'cb-agente',gm:'cb-guarda'};
const CARGO_PERM={admin:7,chefe:6,delegado:5,escrivao:4,tatico:3,agente:2,gm:1};
const CARGO_BASE_MINUTES={gm:90,agente:150,tatico:210,escrivao:240,delegado:300,chefe:0,admin:0};
const SESSION_KEY='gmpol_session';
function isMaster(){return !!me&&me.user==='master';}
function brTimeSec(){return new Date().toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',second:'2-digit'});}
function brDate(){return new Date().toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'});}
function brDateOf(ts){return new Date(ts).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'});}
function brDateLong(){return new Date().toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',weekday:'long',day:'2-digit',month:'long',year:'numeric'}).toUpperCase();}
function fmtChatTime(ts){
  const d=new Date(ts);
  const hoje=brDate();
  const diaMsg=brDateOf(ts);
  const h=d.toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'});
  if(diaMsg===hoje)return h;
  const ontem=new Date(Date.now()-86400000);
  if(diaMsg===brDateOf(ontem.getTime()))return 'Ontem '+h;
  return diaMsg+' '+h;
}

let me=null,activeTab=0;
let STATE={ocs:[],puns:[],pontos:[],provas:[],users:[],audit:[],feedbacks:[],chats:[]};
let _pendingCargoChange=null,_pendingBan=null,_banTimer=null,_clockInterval;
let _busyPonto=false,_busyPun=false,_keepIv=null;
let QUESTIONARIO=null,QUESTIONARIO_PRISOES=null,_provaAtiva=null;
let _chatContatoAtual=null,_chatTimer=null;
const PROVA_TEMPO_QUESTAO=180;
const NOMES_PROVA={gm:'PROVA DE PATENTE GUARDA',agente:'PROVA DE PATENTE AGENTE',tatico:'PROVA DE PATENTE TÁTICO',escrivao:'PROVA DE PATENTE DELEGADO'};
const CSS_PROVA='<style>.pv-alt{display:block;padding:12px 14px;margin-bottom:8px;border:1px solid var(--border2);border-radius:4px;cursor:pointer;background:var(--surface2);transition:border-color .15s,background .15s,box-shadow .15s;}.pv-alt:hover{border-color:var(--text-mid);}.pv-alt.sel{border-color:#4ade80 !important;background:rgba(74,222,128,.10) !important;box-shadow:0 0 0 1px #4ade80;}</style>';
const PRISOES_QUESTOES_LOCAL=['Cite todos os comandos em ordem para efetuar prisões.','Qual procedimento para levar o preso para comer?','Como funciona o QTH PS?','Como funciona o QTH HP?','Cite 4 regras da PF que não podem ser quebradas.','O que é abuso de poder? Cite 3 exemplos.','Quais regras de carregamento?','Cite abaixo todas as estrelas e abreviação. Ex.: ASS - 1 ESTRELA (10 MINUTOS).','Cite a cadeia de comando e a hierarquia.','O que é insubordinação?'];

function startKeepAlive(){stopKeepAlive();_keepIv=setInterval(()=>{fetch('/health',{cache:'no-store'}).catch(()=>{});},240000);}
function stopKeepAlive(){clearInterval(_keepIv);_keepIv=null;}

async function ensureQuestionario(cargo){QUESTIONARIO=QUESTIONARIO||{};if(QUESTIONARIO[cargo])return QUESTIONARIO[cargo];try{QUESTIONARIO[cargo]=await API.request('GET','/prova/questionario?cargo='+cargo);}catch(e){console.error('[q]',e);QUESTIONARIO[cargo]=[];}return QUESTIONARIO[cargo];}
async function ensureQuestionarioPrisoes(){if(QUESTIONARIO_PRISOES)return QUESTIONARIO_PRISOES;try{QUESTIONARIO_PRISOES=await API.request('GET','/prova/questionario?tipo=prisoes');}catch(e){console.error('[q]',e);return[];}return QUESTIONARIO_PRISOES;}

function handleSocketMessage(data){
  const{type,payload}=data;
  switch(type){
    case 'INIT':updateNotif();if(me)renderTab(activeTab);break;
    case 'NEW_OC':updateNotif();renderTab(activeTab);if(me&&payload.delegadoUser!==me.user)toast('Nova ocorrência: '+payload.id,'w');break;
    case 'OC_UPDATED':updateNotif();renderTab(activeTab);break;
    case 'OC_DELETED':updateNotif();renderTab(activeTab);break;
    case 'NEW_PUN':renderTab(activeTab);toast('Nova punição para '+payload.nome,'w');break;
    case 'PUNS_UPDATED':renderTab(activeTab);break;
    case 'NEW_PONTO':renderTab(activeTab);if(me&&payload.userLogin!==me.user&&payload.type!=='folga')toast(payload.nome+' registrou ponto.','i');break;
    case 'FOLGA_GRANTED':if(me&&payload.userLogin===me.user)toast('🌴 Folga concedida para '+payload.folgaDia+'!','s',8000);renderTab(activeTab);break;
    case 'NEW_PROVA':
      if(activeTab===getTabIdx('aprovas'))renderTab(activeTab);
      if(me&&(CARGO_PERM[me.cargo]||0)>=5&&payload.userLogin!==me.user)toast('📝 Nova '+(payload.tipo==='prisoes'?'avaliação pessoal':'prova')+' de '+payload.nome+' aguardando avaliação.','w');
      break;
    case 'PROVAS_UPDATED':if(activeTab===getTabIdx('aprovas')||activeTab===getTabIdx('provas'))renderTab(activeTab);break;
    case 'PROVA_DECIDIDA':
      if(activeTab===getTabIdx('aprovas')||activeTab===getTabIdx('provas'))renderTab(activeTab);
      if(me&&payload.userLogin===me.user){
        if(payload.decisao==='promovido')toast('🎉 PARABÉNS! Você foi promovido(a) a '+(CARGO_LABEL[payload.cargoAlvo]||payload.cargoAlvo)+'!','s',10000);
        else if(payload.decisao==='aprovado')toast('✅ Sua avaliação pessoal foi APROVADA por '+payload.feitorNome+'! Continue firme.','s',10000);
        else toast('😞 Você não passou na avaliação.','d',10000);
      }
      break;
    case 'USERS_UPDATED':
      if(me){const mu=(payload||[]).find(u=>u.user===me.user);if(mu){me={...me,cargo:mu.cargo,nome:mu.nome,ativo:mu.ativo,girosBonus:(typeof mu.girosBonus==='number'?mu.girosBonus:0),ultimoGiroRoleta:mu.ultimoGiroRoleta||null};saveSession();const badge=document.getElementById('tb-badge');if(badge){badge.className='cargo-badge '+(CARGO_BADGE_CLASS[me.cargo]||'');badge.textContent=CARGO_LABEL[me.cargo]||me.cargo;}}}
      if(activeTab===getTabIdx('users')||activeTab===getTabIdx('pontos'))renderTab(activeTab);
      if(activeTab===getTabIdx('chat'))renderChatListaContatos();
      if(activeTab===getTabIdx('roleta'))renderTab(activeTab);
      break;
    case 'GIROS_GAINED':
      if(me&&payload.userLogin===me.user){
        me.girosBonus=payload.total;saveSession();
        toast('🎰 +'+payload.giros+' giro(s) bônus! '+payload.motivo,'s',7000);
        fecharModalSemGiros();
        if(activeTab===getTabIdx('roleta'))renderTab(activeTab);
      }
      break;
    case 'AUDIT_NEW':if(activeTab===getTabIdx('audit'))renderTab(activeTab);break;
    case 'AUDIT_CLEARED':if(activeTab===getTabIdx('audit'))renderTab(activeTab);break;
    case 'NEW_FEEDBACK':
      if(activeTab===getTabIdx('home'))renderTab(activeTab);
      if(me&&payload.userLogin!==me.user&&(CARGO_PERM[me.cargo]||0)>=5)toast('⭐ '+payload.nome+' avaliou o sistema com '+payload.nota+'★','i');
      break;
    case 'FEEDBACKS_UPDATED':if(activeTab===getTabIdx('home'))renderTab(activeTab);break;
    case 'NEW_CHAT_MSG':
      if(me&&activeTab===getTabIdx('chat')){
        const outra=payload.from===me.user?payload.to:payload.from;
        if(_chatContatoAtual===outra)renderChatMensagens();
        renderChatListaContatos();
        if(payload.from!==me.user){
          toast('💬 '+payload.fromNome+': '+payload.texto.slice(0,40)+(payload.texto.length>40?'…':''),'i',3000);
          _tocarNotifChat();
        }
      }
      updateNotif();
      break;
    case 'CHAT_MSG_DELETED':
      if(me&&activeTab===getTabIdx('chat')){renderChatMensagens();renderChatListaContatos();}
      break;
    case 'USER_BANNED':
      STATE.users=STATE.users.map(u=>u.user===payload.userLogin?{...u,banExpires:payload.expiresAt,banReason:payload.reason,banBy:payload.banBy}:u);
      if(activeTab===getTabIdx('users'))renderTab(activeTab);
      if(me&&payload.userLogin===me.user)showBanScreen(payload);else if(me)toast('⛔ '+payload.userLogin+' suspenso.','w');break;
    case 'USER_UNBANNED':
      STATE.users=STATE.users.map(u=>u.user===payload.userLogin?{...u,banExpires:null,banReason:null,banBy:null}:u);
      if(activeTab===getTabIdx('users'))renderTab(activeTab);
      if(me&&payload.userLogin===me.user){clearSession();location.reload();}break;
    case 'CARGO_CHANGED':
      STATE.users=STATE.users.map(u=>u.user===payload.userLogin?{...u,cargo:payload.newCargo}:u);
      if(activeTab===getTabIdx('users'))renderTab(activeTab);
      if(me&&payload.userLogin===me.user){
        me.cargo=payload.newCargo;saveSession();
        const nl=CARGO_LABEL[payload.newCargo]||payload.newCargo;
        const msg=payload.tipo==='promovido'?`📈 Você foi promovido para <b>${nl}</b>!`:`📉 Você foi rebaixado para <b>${nl}</b>. Motivo: ${payload.motivo||'não informado'}`;
        showCargoNotif(msg,payload.tipo==='promovido'?'s':'d');
        const badge=document.getElementById('tb-badge');if(badge){badge.className='cargo-badge '+(CARGO_BADGE_CLASS[me.cargo]||'');badge.textContent=CARGO_LABEL[me.cargo]||me.cargo;}
        activeTab=0;buildTabs();renderTab(0);
      }break;
  }
}

function getTabIdx(name){if(!me)return -1;return tabDefs(me.cargo).findIndex(t=>t.key===name);}
function saveSession(){try{localStorage.setItem(SESSION_KEY,JSON.stringify(me));}catch(_){}}
function clearSession(){try{localStorage.removeItem(SESSION_KEY);sessionStorage.removeItem(SESSION_KEY);}catch(_){}}
function readSession(){try{let s=localStorage.getItem(SESSION_KEY);if(!s){const ss=sessionStorage.getItem(SESSION_KEY);if(ss){localStorage.setItem(SESSION_KEY,ss);sessionStorage.removeItem(SESSION_KEY);s=ss;}}return s;}catch(_){return null;}}

async function checkSession(){
  const saved=readSession();if(!saved){showLogin();return;}
  let parsed;try{parsed=JSON.parse(saved);}catch(_){clearSession();showLogin();return;}
  if(!parsed||!parsed.user||!parsed.cargo){clearSession();showLogin();return;}
  if(parsed.user==='admin'){clearSession();showLogin();return;}
  const{pass:_p,...meSafe}=parsed;me=meSafe;_loadStateFromCache();
  try{const st=await API.getState();if(st&&Array.isArray(st.users)){const su=st.users.find(u=>u.user===me.user);if(!su||!su.ativo){clearSession();me=null;showLogin();return;}me={...me,cargo:su.cargo,nome:su.nome,ativo:su.ativo,girosBonus:(typeof su.girosBonus==='number'?su.girosBonus:0),ultimoGiroRoleta:su.ultimoGiroRoleta||null};saveSession();if(su.banExpires&&su.banExpires>Date.now()){showBanScreen({expiresAt:su.banExpires,reason:su.banReason,banBy:su.banBy});return;}STATE.users=st.users;if(Array.isArray(st.ocs))STATE.ocs=st.ocs;if(Array.isArray(st.puns))STATE.puns=st.puns;if(Array.isArray(st.pontos))STATE.pontos=st.pontos;if(Array.isArray(st.provas))STATE.provas=st.provas;if(Array.isArray(st.audit))STATE.audit=st.audit;if(Array.isArray(st.feedbacks))STATE.feedbacks=st.feedbacks;if(Array.isArray(st.chats))STATE.chats=st.chats;}}catch(_){}
  showPanel();
}

function _loadStateFromCache(){if(typeof LSCache==='undefined')return;const c=LSCache.load();if(!c)return;if(Array.isArray(c.ocs))STATE.ocs=c.ocs;if(Array.isArray(c.puns))STATE.puns=c.puns;if(Array.isArray(c.pontos))STATE.pontos=c.pontos;if(Array.isArray(c.provas))STATE.provas=c.provas;if(Array.isArray(c.users))STATE.users=c.users;if(Array.isArray(c.audit))STATE.audit=c.audit;if(Array.isArray(c.feedbacks))STATE.feedbacks=c.feedbacks;if(Array.isArray(c.chats))STATE.chats=c.chats;}

async function apiLoginRetry(u,p,btn){let lastErr=null;for(let i=0;i<3;i++){try{return await API.login(u,p);}catch(e){lastErr=e;const msg=e.message||'';const retryable=/Sem conexão|Resposta inválida|Erro 50\d|Erro 429|Erro 52\d/i.test(msg);if(!retryable)throw e;if(btn)btn.textContent='▸ ACORDANDO… ('+(i+2)+'/3)';await new Promise(r=>setTimeout(r,1200*(i+1)));}}throw lastErr;}

async function login(){
  const u=document.getElementById('l-user').value.trim().toLowerCase();const p=document.getElementById('l-pass').value;
  if(!u||!p)return toast('Preencha todos os campos.','d');
  const btn=document.getElementById('btn-login');if(btn){btn.disabled=true;btn.textContent='▸ AUTENTICANDO…';}
  try{const res=await apiLoginRetry(u,p,btn);if(!res)throw new Error('Resposta inválida.');if(res.banned){showBanScreen({expiresAt:res.expiresAt,reason:res.reason,banBy:res.banBy});return;}if(!res.user)throw new Error('Dados inválidos.');const{pass:_p,...meSafe}=res.user;me=meSafe;saveSession();activeTab=0;showPanel();toast('Bem-vindo, '+me.nome+'!','s');}catch(e){toast(e.message||'Erro ao autenticar.','d');}finally{if(btn){btn.disabled=false;btn.textContent='▸ AUTENTICAR';}}
}

function toggleSenhaVisivel(){const i=document.getElementById('l-pass'),b=document.getElementById('eye-btn');if(!i)return;if(i.type==='password'){i.type='text';if(b){b.textContent='🙈';b.title='Ocultar senha';}}else{i.type='password';if(b){b.textContent='👁';b.title='Mostrar senha';}}}
document.addEventListener('keydown',e=>{if(e.key==='Enter'){const s=document.getElementById('s-login');if(s&&s.classList.contains('active'))login();}});

function logout(){me=null;activeTab=0;clearSession();stopKeepAlive();clearInterval(_clockInterval);clearInterval(_banTimer);clearInterval(_cdInterval);clearInterval(_ledInterval);clearInterval(_semGirosInterval);if(_provaAtiva){clearInterval(_provaAtiva.timer);_provaAtiva=null;}document.body.classList.remove('chat-mode');if(typeof LSCache!=='undefined')LSCache.clear();location.reload();}

function showBanScreen(info){document.getElementById('s-login').classList.remove('active');document.getElementById('s-panel').classList.remove('active');const s=document.getElementById('s-ban');if(!s)return;s.classList.add('active');document.getElementById('ban-by').textContent=info.banBy||'Sistema';document.getElementById('ban-reason').textContent=info.reason||'Suspensão temporária.';document.getElementById('ban-expires').textContent=new Date(info.expiresAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});startBanCountdown(info.expiresAt);}
function startBanCountdown(expiresAt){clearInterval(_banTimer);function update(){const rem=expiresAt-Date.now();const el=document.getElementById('ban-timer');if(!el){clearInterval(_banTimer);return;}if(rem<=0){clearInterval(_banTimer);el.textContent='00:00:00';const m=document.getElementById('ban-status-msg');if(m){m.textContent='✅ Suspensão encerrada.';m.style.color='#4ade80';}setTimeout(()=>{clearSession();location.reload();},3000);return;}const h=Math.floor(rem/3600000),mn=Math.floor((rem%3600000)/60000),s=Math.floor((rem%60000)/1000);el.textContent=`${String(h).padStart(2,'0')}:${String(mn).padStart(2,'0')}:${String(s).padStart(2,'0')}`;}update();_banTimer=setInterval(update,1000);}

function showCargoNotif(html,type){const n=document.createElement('div');n.className='cargo-notif cargo-notif-'+type;n.innerHTML='<div class="cargo-notif-inner">'+html+'</div>';document.body.appendChild(n);setTimeout(()=>n.classList.add('cargo-notif-show'),50);setTimeout(()=>{n.classList.remove('cargo-notif-show');setTimeout(()=>n.remove(),600);},7000);}

function showLogin(){document.getElementById('s-panel').classList.remove('active');document.getElementById('s-ban').classList.remove('active');document.getElementById('s-login').classList.add('active');setTimeout(()=>{const e=document.getElementById('l-user');if(e)e.focus();},80);}
function showPanel(){document.getElementById('s-login').classList.remove('active');document.getElementById('s-ban').classList.remove('active');document.getElementById('s-panel').classList.add('active');const badge=document.getElementById('tb-badge');badge.className='cargo-badge '+(CARGO_BADGE_CLASS[me.cargo]||'cb-guarda');badge.textContent=CARGO_LABEL[me.cargo]||me.cargo;document.getElementById('tb-user').textContent=me.nome;startKeepAlive();activeTab=0;buildTabs();renderTab(0);updateNotif();}

function tabDefs(c){
  const p=CARGO_PERM[c]||0;
  const base=[{label:'▸ INÍCIO',key:'home',notif:false}];
  const common=[
    {label:'▸ REGISTRAR',key:'registrar',notif:false},
    {label:'▸ MINHAS OCs',key:'myocs',notif:false},
    {label:'▸ PUNIÇÕES',key:'puns',notif:false},
    {label:'▸ PONTO',key:'pontos',notif:false},
    {label:'▸ PROVAS',key:'provas',notif:false},
    {label:'▸ CHAT',key:'chat',notif:true},
    {label:'▸ ROLETA',key:'roleta',notif:false}
  ];
  if(p>=7)return[...base,...common,{label:'▸ PENDENTES',key:'ocs',notif:true},{label:'▸ HISTÓRICO',key:'hist',notif:false},{label:'▸ USUÁRIOS',key:'users',notif:false},{label:'▸ ANÁLISE PROVAS',key:'aprovas',notif:true},{label:'▸ AUDITORIA',key:'audit',notif:false}];
  if(p>=6)return[...base,...common,{label:'▸ PENDENTES',key:'ocs',notif:true},{label:'▸ HISTÓRICO',key:'hist',notif:false},{label:'▸ USUÁRIOS',key:'users',notif:false},{label:'▸ ANÁLISE PROVAS',key:'aprovas',notif:true}];
  if(p>=5)return[...base,...common,{label:'▸ PENDENTES',key:'ocs',notif:true},{label:'▸ ANÁLISE PROVAS',key:'aprovas',notif:true}];
  if(p>=4)return[...base,...common,{label:'▸ PENDENTES',key:'ocs',notif:true}];
  return[...base,...common];
}
function buildTabs(){const defs=tabDefs(me.cargo);document.getElementById('tabs').innerHTML=defs.map((t,i)=>'<div class="tab '+(i===0?'active':'')+'" id="tab-'+i+'" onclick="switchTab('+i+')">'+t.label+(t.notif?'<span class="tab-n" id="tn-'+i+'" style="display:none"></span>':'')+' </div>').join('');buildMobileDrawer();}
function buildMobileDrawer(){if(!me)return;const defs=tabDefs(me.cargo);const drawer=document.getElementById('nav-drawer');if(!drawer)return;drawer.innerHTML=defs.map((t,i)=>'<div class="nav-drawer-item'+(i===activeTab?' active':'')+'" onclick="switchTab('+i+');closeNavDrawer();">'+t.label+(t.notif?'<span class="tab-n-badge" id="tnd-'+i+'" style="display:none">0</span>':'')+' </div>').join('');}
function switchTab(idx){
  if(_provaAtiva){ toast('⚠ Termine ou cancele a prova antes de trocar de aba.','w'); return; }
  activeTab=idx;
  document.querySelectorAll('.tab').forEach((t,i)=>t.classList.toggle('active',i===idx));
  document.querySelectorAll('.nav-drawer-item').forEach((t,i)=>t.classList.toggle('active',i===idx));
  renderTab(idx); closeSettings();
  if(typeof closeNavDrawer==='function')closeNavDrawer();
  // ══ FIX: reseta o scroll da janela ao trocar de aba ══
  window.scrollTo(0,0);
  document.documentElement.scrollTop=0;
  document.body.scrollTop=0;
}
function toggleNavDrawer(){const d=document.getElementById('nav-drawer');if(!d)return;if(d.classList.contains('open'))closeNavDrawer();else openNavDrawer();}
function openNavDrawer(){buildMobileDrawer();document.getElementById('nav-drawer')?.classList.add('open');document.getElementById('nav-overlay')?.classList.add('open');}
function closeNavDrawer(){document.getElementById('nav-drawer')?.classList.remove('open');document.getElementById('nav-overlay')?.classList.remove('open');}

function renderTab(idx){
  const defs=tabDefs(me.cargo);const def=defs[idx]||defs[0];
  const views={home:vInicio,ocs:vOcAdmin,hist:vHistorico,registrar:vRegistrar,myocs:vOcDelegado,puns:vPunicoes,users:vUsuarios,pontos:vPontos,provas:vProvas,aprovas:vAnaliseProvas,audit:vAuditoria,chat:vChat,roleta:vRoleta};
  const fn=views[def.key]||vInicio;
  const contentEl=document.getElementById('content');
  if(contentEl)contentEl.classList.toggle('chat-mode',def.key==='chat');
  document.body.classList.toggle('chat-mode',def.key==='chat');
  const aplicar=(html)=>{if(activeTab!==idx)return;contentEl.innerHTML=html;if(def.key==='pontos')setTimeout(startClock,50);else clearInterval(_clockInterval);if(def.key==='chat')setTimeout(()=>{renderChatListaContatos();renderChatMensagens();startChatPolling();},60);else stopChatPolling();if(def.key==='roleta')setTimeout(inicializarRoleta,80);};
  try{
    const result=fn();
    if(result&&typeof result.then==='function'){
      contentEl.innerHTML='<div style="text-align:center;padding:40px;color:var(--text-mid);">Carregando...</div>';
      result.then(aplicar).catch(e=>{console.error('[renderTab]',e);aplicar('<div class="card">Erro: '+String(e.message||e)+'</div>');});
    }else{aplicar(result);}
  }catch(e){console.error('[renderTab]',e);aplicar('<div class="card">Erro: '+String(e.message||e)+'</div>');}
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
  const apIdx=tabDefs(me.cargo).findIndex(t=>t.key==='aprovas');
  const tnA=document.getElementById('tn-'+apIdx);
  if(tnA){const pendProvas=STATE.provas.filter(p=>!p.decisao).length;if((CARGO_PERM[me.cargo]||0)>=5&&pendProvas>0){tnA.textContent=pendProvas;tnA.style.display='flex';}else tnA.style.display='none';}
  const chatIdx=tabDefs(me.cargo).findIndex(t=>t.key==='chat');
  const tnC=document.getElementById('tn-'+chatIdx);
  if(tnC){
    const naoLidas=contarMensagensNaoLidas();
    if(naoLidas>0){tnC.textContent=naoLidas>99?'99+':naoLidas;tnC.style.display='flex';}
    else tnC.style.display='none';
  }
}

function shuffle(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

function vProvas(){
  const myP=CARGO_PERM[me.cargo]||0;const temProva=!!NOMES_PROVA[me.cargo];const minhas=STATE.provas.filter(p=>p.userLogin===me.user).reverse();
  const opcoes=Object.entries(CARGO_LABEL).filter(([k])=>(CARGO_PERM[k]||0)>myP&&(CARGO_PERM[k]||0)<6).map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('');
  const cardProva=temProva?'<div class="card" style="margin-bottom:20px;"><div style="font-family:\'Orbitron\',sans-serif;font-size:.72rem;color:var(--accent);letter-spacing:.14em;margin-bottom:6px;">'+NOMES_PROVA[me.cargo]+' — PF RIO RISE</div><p style="color:var(--text-mid);font-size:.85rem;line-height:1.6;margin-bottom:16px;">Questões em ordem aleatória • 3 minutos por questão • nota 0–100 • mínimo 70.<br>⚠ Se o temporizador zerar, <b style="color:var(--danger);">você perde a prova</b>.</p><div class="g2"><div class="fg"><label>Seu usuário</label><input id="pv-user" value="'+me.user+'"></div><div class="fg"><label>Cargo que deseja ser promovido</label><select id="pv-alvo">'+(opcoes||'<option value="">Nenhum</option>')+'</select></div></div><button class="btn btn-primary" style="max-width:260px;" onclick="iniciarProva()">▸ INICIAR PROVA</button></div>':'<div class="card c-none" style="margin-bottom:20px;padding:14px 16px;border:1px solid var(--border);font-family:\'Share Tech Mono\',monospace;font-size:.7rem;color:var(--text-dim);">Seu cargo (<b>'+(CARGO_LABEL[me.cargo]||me.cargo)+'</b>) não possui prova de promoção.</div>';
  const cardPrisoes='<div class="card" style="margin-bottom:20px;"><div style="font-family:\'Orbitron\',sans-serif;font-size:.72rem;color:var(--warn);letter-spacing:.14em;margin-bottom:6px;">🧠 PROVA CONHECIMENTO PRISÕES — AVALIAÇÃO PESSOAL</div><p style="color:var(--text-mid);font-size:.85rem;line-height:1.6;margin-bottom:16px;">10 questões dissertativas • <b>sem tempo</b> • não é vinculada a cargo • os superiores avaliarão.</p><button class="btn btn-warn" style="max-width:300px;" onclick="iniciarProvaPrisoes()">▸ INICIAR AVALIAÇÃO PESSOAL</button></div>';
  const hist=minhas.length?'<table class="tbl"><thead><tr><th>DATA</th><th>TIPO</th><th>ALVO</th><th>NOTA</th><th>STATUS</th><th>DECISÃO</th></tr></thead><tbody>'+minhas.map(p=>{const dec=p.decisao==='promovido'?'<span class="status-chip sc-a">🎓 PROMOVIDO</span>':p.decisao==='aprovado'?'<span class="status-chip sc-a">✅ APROVADO</span>':p.decisao==='reprovado'?'<span class="status-chip sc-r">❌ REPROVADO</span>':'<span class="status-chip sc-p">⏳ AGUARDANDO</span>';const st=p.status==='tempo_esgotado'?'<span style="color:var(--danger);">⏰ Tempo esgotado</span>':'<span style="color:var(--accent3);">Concluída</span>';const tipo=p.tipo==='prisoes'?'<span style="color:var(--warn);">🧠 Prisões</span>':'<span style="color:var(--accent);">📝 Patente</span>';return '<tr><td style="font-family:\'Share Tech Mono\',monospace;">'+brDateOf(p.ts)+'</td><td>'+tipo+'</td><td>'+(p.cargoAlvo?(CARGO_LABEL[p.cargoAlvo]||p.cargoAlvo):'—')+'</td><td style="font-weight:700;color:'+(p.nota===null?'var(--warn)':(p.nota>=70?'#4ade80':'#f87171'))+';">'+(p.nota===null?'—':p.nota)+'</td><td>'+st+'</td><td>'+dec+'</td></tr>';}).join('')+'</tbody></table>':'<p style="color:var(--text-dim);font-family:\'Share Tech Mono\',monospace;font-size:.68rem;">Você ainda não fez nenhuma prova.</p>';
  return '<div class="stitle">▸ PROVAS</div>'+cardProva+cardPrisoes+'<div class="card"><div style="font-family:\'Orbitron\',sans-serif;font-size:.68rem;color:var(--accent);letter-spacing:.12em;margin-bottom:12px;">▸ MINHAS PROVAS</div>'+hist+'</div>';
}

async function iniciarProva(){
  const userInput=(document.getElementById('pv-user')?.value||'').trim().toLowerCase();if(userInput!==me.user){toast('Use o SEU próprio usuário: '+me.user,'d');return;}
  const alvo=document.getElementById('pv-alvo')?.value;if(!alvo){toast('Selecione o cargo alvo.','d');return;}
  if((CARGO_PERM[alvo]||0)<=(CARGO_PERM[me.cargo]||0)){toast('Escolha um cargo ACIMA do seu.','d');return;}
  let q;try{q=await ensureQuestionario(me.cargo);}catch(e){toast(e.message||'Erro ao carregar questões.','d');return;}
  if(!q||!q.length){toast('Não há questões para o seu cargo.','d');return;}
  const ordem=shuffle(q.map(x=>x.q));const alts={};ordem.forEach(i=>{alts[i]=shuffle([0,1,2,3]);});
  _provaAtiva={modo:'cargo',ordem,alts,atual:0,respostas:[],tempo:PROVA_TEMPO_QUESTAO,timer:null,cargoAlvo:alvo};
  renderQuestaoProva();iniciarTimerProva();
}
function iniciarTimerProva(){clearInterval(_provaAtiva.timer);_provaAtiva.tempo=PROVA_TEMPO_QUESTAO;atualizarTimerProva();_provaAtiva.timer=setInterval(()=>{if(!_provaAtiva)return;_provaAtiva.tempo--;atualizarTimerProva();if(_provaAtiva.tempo<=0){clearInterval(_provaAtiva.timer);perderProvaTempo();}},1000);}
function atualizarTimerProva(){const el=document.getElementById('prova-timer');if(!el||!_provaAtiva)return;const m=Math.floor(_provaAtiva.tempo/60),s=_provaAtiva.tempo%60;el.textContent=String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');el.style.color=_provaAtiva.tempo<=30?'var(--danger)':(_provaAtiva.tempo<=60?'var(--warn)':'var(--accent)');}
function selAlt(el){document.querySelectorAll('.pv-alt').forEach(x=>x.classList.remove('sel'));el.classList.add('sel');const r=el.querySelector('input[type=radio]');if(r)r.checked=true;}
function renderQuestaoProva(){
  const P=_provaAtiva;if(!P)return;const qi=P.ordem[P.atual];const quest=QUESTIONARIO[me.cargo].find(x=>x.q===qi);const letras=['a','b','c','d'];
  const altHtml=P.alts[qi].map((origIdx,pos)=>'<label class="pv-alt" onclick="selAlt(this)"><input type="radio" name="pv-alt" value="'+origIdx+'" style="margin-right:10px;"><b style="color:var(--accent);">'+letras[pos]+')</b> '+quest.alt[origIdx]+'</label>').join('');
  document.getElementById('content').innerHTML=CSS_PROVA+'<div class="stitle">▸ '+NOMES_PROVA[me.cargo]+' — QUESTÃO '+(P.atual+1)+' DE '+P.ordem.length+'</div><div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;"><div style="font-family:\'Share Tech Mono\',monospace;font-size:.68rem;color:var(--text-dim);">Alvo: <b style="color:var(--accent);">'+(CARGO_LABEL[P.cargoAlvo]||P.cargoAlvo)+'</b></div><div style="font-family:\'Orbitron\',sans-serif;font-size:1.4rem;letter-spacing:.1em;" id="prova-timer">03:00</div></div><div style="font-size:1rem;font-weight:700;color:var(--text);margin-bottom:16px;line-height:1.5;">'+quest.enunciado+'</div>'+altHtml+'<div class="fg" style="margin-top:14px;"><label>Justifique sua resposta <span style="color:var(--danger);">*</span></label><textarea id="pv-just" placeholder="Explique…" style="min-height:90px;"></textarea></div><div style="display:flex;gap:10px;"><button class="btn btn-primary" onclick="confirmarRespostaProva()">▸ CONFIRMAR RESPOSTA</button><button class="btn btn-ghost" onclick="cancelarProva()">CANCELAR PROVA</button></div></div>';
  atualizarTimerProva();
}
function confirmarRespostaProva(){const P=_provaAtiva;if(!P)return;const sel=document.querySelector('input[name="pv-alt"]:checked');if(!sel){toast('Selecione uma alternativa.','d');return;}const just=(document.getElementById('pv-just')?.value||'').trim();if(just.length<3){toast('Justifique sua resposta.','d');return;}P.respostas.push({q:P.ordem[P.atual],escolha:parseInt(sel.value),justificativa:just});proximaQuestaoProva();}
function proximaQuestaoProva(){const P=_provaAtiva;if(!P)return;P.atual++;if(P.atual>=P.ordem.length){finalizarProva(false);return;}renderQuestaoProva();iniciarTimerProva();}
function perderProvaTempo(){toast('⏰ TEMPO ESGOTADO!','d',8000);finalizarProva(true);}
function cancelarProva(){if(!confirm('Cancelar a prova?'))return;finalizarProva(true);}

async function finalizarProva(perdida){
  const P=_provaAtiva;if(!P)return;clearInterval(P.timer);_provaAtiva=null;
  try{
    const res=await API.createProva({userLogin:me.user,cargoAlvo:P.cargoAlvo,respostas:P.respostas,perdidaPorTempo:perdida});
    const prova=res&&res.prova?res.prova:null;
    if(prova){
      let msg;
      if(prova.nota<70)msg='😞 Você fez <b>'+prova.nota+'</b> pontos (mínimo 70).';
      else msg='🎉 Você fez <b>'+prova.nota+'</b> pontos!<br>Seus justificativos serão avaliados pelos superiores.';
      if(perdida)msg='⏰ Prova perdida por tempo.<br>'+msg;
      document.getElementById('content').innerHTML='<div class="stitle">▸ RESULTADO DA PROVA</div><div class="card" style="text-align:center;"><div style="font-family:\'Orbitron\',sans-serif;font-size:3rem;color:'+(prova.nota>=70?'#4ade80':'#f87171')+';">'+prova.nota+'</div><div style="font-family:\'Share Tech Mono\',monospace;font-size:.7rem;color:var(--text-dim);margin-bottom:18px;">NOTA FINAL (0–100)</div><div style="font-size:.95rem;line-height:1.7;color:var(--text-mid);">'+msg+'</div></div>';
    }else renderTab(activeTab);
  }catch(e){toast(e.message||'Erro ao enviar prova.','d');renderTab(activeTab);}
}

async function iniciarProvaPrisoes(){
  let q;try{q=await ensureQuestionarioPrisoes();}catch(e){toast(e.message||'Erro ao carregar questões.','d');return;}
  if(!q||!q.length){toast('Não há questões cadastradas.','d');return;}
  _provaAtiva={modo:'prisoes',quest:q,timer:null};
  document.getElementById('content').innerHTML=CSS_PROVA+'<div class="stitle">▸ PROVA CONHECIMENTO PRISÕES — AVALIAÇÃO PESSOAL</div><div class="card"><p style="color:var(--text-mid);font-size:.85rem;margin-bottom:16px;">Responda todas as questões abaixo. <b>Sem tempo limite.</b></p>'+q.map((qq,i)=>'<div class="fg"><label>'+(i+1)+'. '+qq.enunciado+'</label><textarea id="prj-'+i+'" style="min-height:70px;" placeholder="Sua resposta…"></textarea></div>').join('')+'<div style="display:flex;gap:10px;margin-top:10px;"><button class="btn btn-warn" onclick="enviarProvaPrisoes()">▸ ENVIAR AVALIAÇÃO</button><button class="btn btn-ghost" onclick="cancelarProvaPrisoes()">CANCELAR</button></div></div>';
}
async function enviarProvaPrisoes(){
  const P=_provaAtiva;if(!P||P.modo!=='prisoes')return;
  const rs=P.quest.map((qq,i)=>({q:i,texto:(document.getElementById('prj-'+i)?.value||'').trim()}));
  if(rs.some(r=>r.texto.length<3)){toast('Responda TODAS as questões (mínimo 3 caracteres cada).','d');return;}
  _provaAtiva=null;
  try{await API.createProva({tipo:'prisoes',userLogin:me.user,respostas:rs});toast('✅ Avaliação pessoal enviada!','s',9000);renderTab(activeTab);}catch(e){toast(e.message||'Erro ao enviar.','d');}
}
function cancelarProvaPrisoes(){_provaAtiva=null;renderTab(activeTab);}

async function vAnaliseProvas(){
  if((CARGO_PERM[me.cargo]||0)<5)return empty('🔒','Acesso restrito a Master, Chefe de Polícia e Delegado.');
  const provas=[...STATE.provas].reverse();
  if(!provas.length)return '<div class="stitle">▸ ANÁLISE DE PROVAS</div>'+empty('📝','Nenhuma prova realizada ainda.');
  const cargosUnicos=[...new Set(provas.filter(p=>p.tipo==='cargo'&&p.cargoAtual).map(p=>p.cargoAtual))];
  for(const cargo of cargosUnicos){await ensureQuestionario(cargo);}
  const cards=provas.map(p=>{
    const decBadge=p.decisao==='promovido'?'<span class="status-chip sc-a">🎓 PROMOVIDO por '+p.decididoPor+'</span>':p.decisao==='aprovado'?'<span class="status-chip sc-a">✅ APROVADO por '+p.decididoPor+'</span>':p.decisao==='reprovado'?'<span class="status-chip sc-r">❌ REPROVADO por '+p.decididoPor+'</span>':'<span class="status-chip sc-p">⏳ AGUARDANDO AVALIAÇÃO</span>';
    let corpo='';
    if(p.tipo==='prisoes'){
      corpo='<div id="pq-'+p.id+'" style="display:none;">'+p.respostas.map((r,i)=>'<div style="margin-bottom:14px;padding:12px;border:1px solid var(--border);border-radius:4px;background:var(--surface);"><div style="font-weight:700;font-size:.88rem;margin-bottom:6px;">'+(i+1)+'. '+(PRISOES_QUESTOES_LOCAL[i]||'')+'</div><div style="font-size:.82rem;color:var(--text-mid);white-space:pre-wrap;">'+(r.texto||'<i>sem resposta</i>')+'</div></div>').join('')+'</div>';
    }else{
      corpo='<div id="pq-'+p.id+'" style="display:none;">'+p.respostas.map((r,ni)=>{
        const quest=(QUESTIONARIO&&QUESTIONARIO[p.cargoAtual])?QUESTIONARIO[p.cargoAtual].find(x=>x.q===r.q):null;
        if(!quest)return '<div style="padding:10px;border:1px solid var(--border);border-radius:4px;font-size:.8rem;color:var(--text-dim);">Questão '+(ni+1)+': gabarito indisponível.</div>';
        const letras=['a','b','c','d'];
        const altsHtml=quest.alt.map((txt,idx)=>{let style='padding:8px 12px;margin:4px 0;border:1px solid var(--border);border-radius:4px;font-size:.82rem;';let tag='';if(idx===r.escolha&&r.correta){style+='border-color:#4ade80;background:rgba(74,222,128,.08);color:#4ade80;';tag=' ✔ CANDIDATO (CORRETA)';}else if(idx===r.escolha&&!r.correta){style+='border-color:#f87171;background:rgba(248,113,113,.08);color:#f87171;';tag=' ✘ CANDIDATO (ERRADA)';}return '<div style="'+style+'"><b>'+letras[idx]+')</b> '+txt+tag+'</div>';}).join('');
        const corretaHtml=!r.correta?'<div style="margin-top:6px;padding:8px 12px;border:1px solid #4ade80;background:rgba(74,222,128,.1);border-radius:4px;color:#4ade80;font-size:.82rem;">✅ RESPOSTA CORRETA: <b>'+letras[r.corretaIdx]+')</b> '+quest.alt[r.corretaIdx]+'</div>':'';
        return '<div style="margin-bottom:16px;padding:12px;border:1px solid var(--border);border-radius:4px;background:var(--surface);"><div style="font-weight:700;font-size:.88rem;margin-bottom:8px;">Questão '+(ni+1)+': '+quest.enunciado+'</div>'+altsHtml+corretaHtml+'<div style="margin-top:8px;font-size:.78rem;color:var(--text-mid);"><b>Justificativa:</b> '+(r.justificativa||'<i>não respondida</i>')+'</div></div>';
      }).join('')+'</div>';
    }
    let botoes='';
    if(!p.decisao){
      if(p.tipo==='prisoes'){
        botoes='<button class="btn btn-success btn-sm" onclick="decidirProva(\''+p.id+'\',\'aprovado\')">✅ APROVAR AVALIAÇÃO</button><button class="btn btn-danger btn-sm" onclick="decidirProva(\''+p.id+'\',\'reprovado\')">❌ REPROVAR AVALIAÇÃO</button>';
      }else{
        botoes='<button class="btn btn-success btn-sm" onclick="decidirProva(\''+p.id+'\',\'promovido\')">🎓 PROMOVER</button><button class="btn btn-danger btn-sm" onclick="decidirProva(\''+p.id+'\',\'reprovado\')">❌ REPROVAR</button>';
      }
    }
    return '<div class="card" style="margin-bottom:16px;"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px;"><div><b style="font-size:1rem;">'+p.nome+'</b> <span style="font-family:\'Share Tech Mono\',monospace;font-size:.62rem;color:var(--text-dim);">@'+p.userLogin+'</span><br><span style="font-size:.75rem;color:var(--text-mid);">'+(p.tipo==='prisoes'?'🧠 Avaliação pessoal — Prisões':(CARGO_LABEL[p.cargoAtual]||p.cargoAtual)+' → <b style="color:var(--accent);">'+(CARGO_LABEL[p.cargoAlvo]||p.cargoAlvo)+'</b>')+' • '+brDateOf(p.ts)+(p.status==='tempo_esgotado'?' • <span style="color:var(--danger);">⏰ tempo esgotado</span>':'')+'</span></div><div style="font-family:\'Orbitron\',sans-serif;font-size:1.6rem;color:'+(p.nota===null?'var(--warn)':(p.nota>=70?'#4ade80':'#f87171'))+';">'+(p.nota===null?'—':p.nota)+'</div></div><div style="margin-bottom:10px;">'+decBadge+'</div>'+corpo+'<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;"><button class="btn btn-ghost btn-sm" onclick="togglePQ(\'pq-'+p.id+'\')">👁 VER / OCULTAR RESPOSTAS</button>'+botoes+'</div></div>';
  }).join('');
  return '<div class="stitle">▸ ANÁLISE DE PROVAS</div><p style="color:var(--text-mid);font-size:.8rem;margin-bottom:14px;">Resposta errada em <span style="color:#f87171;">vermelho</span> • correta em <span style="color:#4ade80;">verde</span>. Avaliações pessoais mostram <b>APROVAR</b> (sem promoção) e <b>REPROVAR</b>. Provas de cargo mostram <b>PROMOVER</b> e <b>REPROVAR</b>.</p>'+cards;
}
function togglePQ(id){const el=document.getElementById(id);if(!el)return;if(el.style.display==='none'||el.style.display===''){el.style.display='block';}else{el.style.display='none';}}
async function decidirProva(id,decisao){
  const p=STATE.provas.find(x=>x.id===id);if(!p)return;
  let txt;
  if(decisao==='promovido')txt='PROMOVER '+p.nome+' para '+(CARGO_LABEL[p.cargoAlvo]||p.cargoAlvo)+'?';
  else if(decisao==='aprovado')txt='APROVAR a avaliação pessoal de '+p.nome+'? (Não haverá promoção de cargo, apenas registro da aprovação.)';
  else txt='REPROVAR a '+(p.tipo==='prisoes'?'avaliação pessoal de ':'prova de ')+p.nome+'?';
  if(!confirm(txt))return;
  try{await API.decidirProva(id,decisao,me.user);toast(decisao==='promovido'?'🎓 '+p.nome+' promovido(a)!':decisao==='aprovado'?'✅ Avaliação de '+p.nome+' aprovada!':'❌ '+p.nome+' reprovado(a).',decisao==='reprovado'?'w':'s');}catch(e){toast(e.message||'Erro.','d');}
}

function vInicio(){
  const p=CARGO_PERM[me.cargo]||0;
  const pend=STATE.ocs.filter(o=>o.status==='pendente').length;
  const ace=STATE.ocs.filter(o=>o.status==='aceita').length;
  const rec=STATE.ocs.filter(o=>o.status==='recusada').length;
  const can=STATE.ocs.filter(o=>o.status==='cancelada').length;
  const fbs=STATE.feedbacks||[];
  const totalFbs=fbs.length;
  const mediaFb=totalFbs>0?(fbs.reduce((a,f)=>a+(f.nota||0),0)/totalFbs):0;
  const mediaStr=mediaFb>0?mediaFb.toFixed(1):'—';
  const estrelasMedia=mediaFb>0?renderEstrelasHtml(Math.round(mediaFb)):'<span style="color:var(--text-dim);font-size:.8rem;">sem avaliações</span>';
  const meuUltimoFb=fbs.find(f=>f.userLogin===me.user);
  const cooldownMs=24*60*60*1000;
  const podeAvaliar=!meuUltimoFb||(Date.now()-meuUltimoFb.ts)>=cooldownMs;
  const horasRestantes=meuUltimoFb?Math.max(0,Math.ceil((cooldownMs-(Date.now()-meuUltimoFb.ts))/3600000)):0;
  const cardAvaliacao=`<div class="card" style="margin-bottom:20px;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;"><div style="font-family:'Orbitron',sans-serif;font-size:.72rem;color:var(--warn);letter-spacing:.14em;">⭐ AVALIE O SISTEMA</div><div style="font-family:'Share Tech Mono',monospace;font-size:.62rem;color:var(--text-dim);">MÉDIA GERAL: <b style="color:var(--warn);font-size:.75rem;">${mediaStr}★</b> (${totalFbs} aval.)</div></div><div style="margin-bottom:8px;display:flex;align-items:center;gap:6px;">${estrelasMedia}</div>${podeAvaliar?`<p style="color:var(--text-mid);font-size:.85rem;margin-bottom:12px;line-height:1.5;">Sua opinião ajuda a melhorar o GMPOL. <b>De uma nota de 1 a 5 estrelas</b> e deixe suas sugestões.</p><div id="fb-estrelas" style="display:flex;gap:6px;margin-bottom:12px;user-select:none;"><span class="fb-star" data-n="1" onclick="setEstrela(1)" style="font-size:1.8rem;cursor:pointer;transition:transform .15s;color:var(--text-dim);">★</span><span class="fb-star" data-n="2" onclick="setEstrela(2)" style="font-size:1.8rem;cursor:pointer;transition:transform .15s;color:var(--text-dim);">★</span><span class="fb-star" data-n="3" onclick="setEstrela(3)" style="font-size:1.8rem;cursor:pointer;transition:transform .15s;color:var(--text-dim);">★</span><span class="fb-star" data-n="4" onclick="setEstrela(4)" style="font-size:1.8rem;cursor:pointer;transition:transform .15s;color:var(--text-dim);">★</span><span class="fb-star" data-n="5" onclick="setEstrela(5)" style="font-size:1.8rem;cursor:pointer;transition:transform .15s;color:var(--text-dim);">★</span><span id="fb-nota-txt" style="margin-left:10px;font-family:'Share Tech Mono',monospace;font-size:.75rem;color:var(--text-mid);">(clique para avaliar)</span></div><div class="fg"><label>Sugestões e melhorias</label><textarea id="fb-texto" placeholder="O que podemos melhorar? Tem alguma ideia nova? Conte aqui…" style="min-height:80px;"></textarea></div><button class="btn btn-warn" id="btn-fb-enviar" onclick="enviarFeedback()" style="max-width:280px;">📤 ENVIAR AVALIAÇÃO</button>`:`<div style="padding:12px 14px;background:rgba(224,192,96,.06);border:1px solid rgba(224,192,96,.2);border-radius:4px;margin-bottom:10px;"><div style="font-size:.85rem;color:var(--warn);margin-bottom:4px;">✅ Você já avaliou recentemente!</div><div style="font-size:.72rem;color:var(--text-dim);font-family:'Share Tech Mono',monospace;">Sua nota: <b style="color:var(--warn);">${meuUltimoFb.nota}★</b> • poderá avaliar novamente em <b>${horasRestantes}h</b></div></div><div style="font-size:.82rem;color:var(--text-mid);line-height:1.5;margin-bottom:6px;"><b>Sua sugestão foi:</b></div><div class="dep-box" style="margin-bottom:0;">${(meuUltimoFb.texto||'').replace(/</g,'&lt;')}</div>`}</div>`;
  let histFbHtml='';
  if((CARGO_PERM[me.cargo]||0)>=5&&totalFbs>0){
    const ultimos=fbs.slice(0,10);
    histFbHtml=`<div class="card" style="margin-bottom:20px;"><div style="font-family:'Orbitron',sans-serif;font-size:.72rem;color:var(--accent);letter-spacing:.14em;margin-bottom:12px;">📊 ÚLTIMAS AVALIAÇÕES RECEBIDAS</div>${ultimos.map(f=>{const dt=new Date(f.ts).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});const stars=renderEstrelasHtml(f.nota);const podeDel=(CARGO_PERM[me.cargo]||0)>=6;return `<div style="padding:10px 0;border-bottom:1px solid var(--border);"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;"><div style="flex:1;min-width:180px;"><div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;"><b style="font-size:.9rem;">${f.nome}</b><span class="cargo-badge ${CARGO_BADGE_CLASS[f.cargo]||''}" style="font-size:.55rem;">${CARGO_LABEL[f.cargo]||f.cargo}</span></div><div style="margin-bottom:4px;">${stars}</div><div style="font-size:.82rem;color:var(--text-mid);line-height:1.5;">${(f.texto||'').replace(/</g,'&lt;')}</div><div style="font-family:'Share Tech Mono',monospace;font-size:.6rem;color:var(--text-dim);margin-top:4px;">${dt}</div></div>${podeDel?`<button class="btn btn-danger btn-xs" onclick="excluirFeedback('${f.id}')">🗑</button>`:''}</div></div>`;}).join('')}</div>`;
  }
  const msgs={admin:isMaster()?'ACESSO TOTAL ABSOLUTO.':'Acesso total.',chefe:'Você pode alterar cargos, gerenciar usuários, avaliar provas e supervisionar a corporação.',delegado:'Você pode aceitar ou recusar ocorrências, avaliar provas e supervisionar os Escrivãos.',escrivao:'Você pode aceitar ou recusar ocorrências e fazer a Prova de Delegado.',tatico:'Você pode solicitar rebaixamento ou punição e fazer a Prova de Tático.',agente:'Você pode registrar ocorrências, bater ponto e fazer a Prova de Agente.',gm:'Você pode registrar ocorrências, bater seu ponto e fazer a Prova de Guarda.'};
  const today=brDateLong();
  const statsCards=p>=3?`<div class="g3" style="grid-template-columns:repeat(4,1fr);"><div class="card c-warn stat-box"><div class="stat-num" style="color:var(--warn);">${pend}</div><div class="stat-lbl">PENDENTES</div></div><div class="card c-success stat-box"><div class="stat-num" style="color:var(--accent3);">${ace}</div><div class="stat-lbl">ACEITAS</div></div><div class="card c-danger stat-box"><div class="stat-num" style="color:var(--danger);">${rec}</div><div class="stat-lbl">RECUSADAS</div></div><div class="card stat-box"><div class="stat-num" style="color:var(--text-dim);">${can}</div><div class="stat-lbl">CANCELADAS</div></div></div>`:'';
  const auditRecent=STATE.audit.slice(0,5).map(l=>`<div class="log-entry" style="padding:8px 0;border-bottom:1px solid var(--border);"><div class="log-time">${new Date(l.ts).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div><div class="log-icon">${l.icon||'📋'}</div><div class="log-txt" style="font-size:.8rem;">${l.msg}</div></div>`).join('')||'<p style="color:var(--text-dim);font-size:.8rem;">Nenhuma atividade.</p>';
  return `<div class="stitle">▸ PAINEL INICIAL</div><div class="card" style="margin-bottom:20px;"><div style="font-family:'Orbitron',sans-serif;font-size:1.15rem;color:var(--accent);margin-bottom:4px;">${me.nome}</div><div style="font-family:'Share Tech Mono',monospace;font-size:.65rem;color:var(--text-dim);margin-bottom:4px;letter-spacing:.1em;">${(CARGO_LABEL[me.cargo]||me.cargo).toUpperCase()} — GMPOL SISTEMA CENTRAL</div><div style="font-family:'Share Tech Mono',monospace;font-size:.6rem;color:var(--text-dim);margin-bottom:14px;">${today}</div><p style="color:var(--text-mid);font-size:.92rem;line-height:1.6;">${msgs[me.cargo]||'Bem-vindo.'}</p></div>${cardAvaliacao}${histFbHtml}${statsCards}<div class="card" style="margin-top:20px;"><div style="font-family:'Orbitron',sans-serif;font-size:.7rem;color:var(--accent);letter-spacing:.12em;margin-bottom:12px;">▸ ÚLTIMAS ATIVIDADES</div>${auditRecent}</div>`;
}

function renderEstrelasHtml(n){let s='';for(let i=1;i<=5;i++){s+=`<span style="color:${i<=n?'var(--warn)':'var(--text-dim)'};font-size:1rem;">★</span>`;}return s;}
let _fbNotaAtual=0;
function setEstrela(n){_fbNotaAtual=n;document.querySelectorAll('#fb-estrelas .fb-star').forEach((el,idx)=>{const ativa=idx+1<=n;el.style.color=ativa?'var(--warn)':'var(--text-dim)';el.style.transform=ativa?'scale(1.12)':'scale(1)';el.style.textShadow=ativa?'0 0 8px rgba(224,192,96,.5)':'none';});const labels=['','Péssimo','Ruim','Regular','Bom','Excelente'];const txt=document.getElementById('fb-nota-txt');if(txt)txt.innerHTML=`<b style="color:var(--warn);">${n}★ ${labels[n]}</b>`;}
async function enviarFeedback(){const nota=_fbNotaAtual;const texto=(document.getElementById('fb-texto')?.value||'').trim();if(!nota||nota<1||nota>5){toast('Selecione uma nota de 1 a 5 estrelas.','d');return;}if(texto.length<3){toast('Escreva pelo menos 3 caracteres nas sugestões.','w');return;}const btn=document.getElementById('btn-fb-enviar');if(btn){btn.disabled=true;btn.textContent='▸ ENVIANDO...';}try{await API.createFeedback({userLogin:me.user,nome:me.nome,nota,texto});toast('✅ Avaliação enviada! Obrigado pelo seu feedback.','s',7000);_fbNotaAtual=0;renderTab(activeTab);}catch(e){toast(e.message||'Erro ao enviar avaliação.','d');if(btn){btn.disabled=false;btn.textContent='📤 ENVIAR AVALIAÇÃO';}}}
async function excluirFeedback(id){if(!confirm('Excluir esta avaliação?'))return;try{await API.deleteFeedback(id,me.user);toast('Avaliação excluída.','w');renderTab(activeTab);}catch(e){toast(e.message||'Erro ao excluir.','d');}}

function vRegistrar(){return `<div class="stitle">▸ REGISTRAR OCORRÊNCIA / DENÚNCIA</div><div class="card"><p style="color:var(--text-mid);font-size:.88rem;margin-bottom:18px;line-height:1.6;">Qualquer membro pode registrar.</p><div class="g2"><div class="fg"><label>Tipo</label><select id="oc-tipo"><option value="Ocorrência">Ocorrência</option><option value="Denúncia">Denúncia</option></select></div><div class="fg"><label>Nome do Envolvido</label><input id="oc-nome" placeholder="Nome completo"></div><div class="fg"><label>Cargo do Envolvido</label><select id="oc-cargo"><option>Guarda municipal</option><option>Agente oficial</option><option>Tático</option><option>Escrivão</option><option>Delegado</option><option>Chefe de polícia</option><option>Admin master</option><option>Civil</option><option>Outro</option></select></div><div class="fg g-full"><label>Depoimento / Relato</label><textarea id="oc-dep" placeholder="Descreva…"></textarea></div></div><button class="btn btn-primary" style="margin-top:8px;max-width:260px;" onclick="registrarOc()">▸ ENVIAR REGISTRO</button></div>`;}
async function registrarOc(){const tipo=document.getElementById('oc-tipo')?.value||'Ocorrência';const nome=document.getElementById('oc-nome')?.value.trim();const cargo=document.getElementById('oc-cargo')?.value;const dep=document.getElementById('oc-dep')?.value.trim();if(!nome||!dep){toast('Preencha nome e depoimento.','d');return;}const oc={id:(tipo==='Denúncia'?'DN':'OC')+'-'+Date.now(),tipo,autor:me.nome,autorUser:me.user,autorCargo:me.cargo,delegado:me.nome,delegadoUser:me.user,nome,cargo,depoimento:dep,status:'pendente',resposta:'',ts:Date.now()};try{await API.createOc(oc);toast(tipo+' enviada!','s');const i=tabDefs(me.cargo).findIndex(t=>t.key==='myocs');if(i!==-1)switchTab(i);}catch(e){toast(e.message||'Erro.','d');}}

function vOcDelegado(){const ocs=STATE.ocs.filter(o=>o.delegadoUser===me.user).reverse();return '<div class="stitle">▸ MEUS REGISTROS</div>'+(ocs.length?ocs.map(o=>ocCard(o,false,false)).join(''):empty('📋','Nenhum registro.'));}
function vOcAdmin(){const myP=CARGO_PERM[me.cargo]||0;const ocs=STATE.ocs.filter(o=>o.status==='pendente').reverse();return '<div class="stitle">▸ REGISTROS PENDENTES</div>'+(ocs.length?ocs.map(o=>ocCard(o,myP>=4,myP>=7||isMaster())).join(''):empty('✅','Nenhum pendente.'));}
function vHistorico(){const ocs=STATE.ocs.filter(o=>o.status!=='pendente').reverse();const isRei=(CARGO_PERM[me.cargo]||0)>=7||isMaster();return `<div class="stitle">▸ HISTÓRICO</div><div class="filter-bar"><button class="btn btn-sm btn-ghost" onclick="filtrarHist('')">TODOS</button><button class="btn btn-sm btn-ghost" onclick="filtrarHist('aceita')">✅ ACEITAS</button><button class="btn btn-sm btn-ghost" onclick="filtrarHist('recusada')">❌ RECUSADAS</button><button class="btn btn-sm btn-ghost" onclick="filtrarHist('cancelada')">🚫 CANCELADAS</button></div><div id="hist-list">${ocs.length?ocs.map(o=>ocCard(o,false,isRei)).join(''):empty('📂','Nenhuma.')}</div>`;}
function filtrarHist(status){const ocs=STATE.ocs.filter(o=>o.status!=='pendente'&&(!status||o.status===status)).reverse();const el=document.getElementById('hist-list');if(el)el.innerHTML=ocs.length?ocs.map(o=>ocCard(o,false,(CARGO_PERM[me.cargo]||0)>=7||isMaster())).join(''):empty('📂','Nenhuma.');}
function ocCard(o,actions,masterMode){const scMap={pendente:'sc-p',aceita:'sc-a',recusada:'sc-r',cancelada:'sc-c'};const scLbl={pendente:'⏳ Pendente',aceita:'✅ Aceita',recusada:'❌ Recusada',cancelada:'🚫 Cancelada'};const dt=new Date(o.ts).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});const tipoBadge=o.tipo==='Denúncia'?'<span class="tipo-badge tipo-denuncia">📢 DENÚNCIA</span>':'<span class="tipo-badge tipo-oc">📋 OCORRÊNCIA</span>';const masterBtns=masterMode?`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;padding-top:8px;border-top:1px solid var(--border);"><span style="font-family:'Share Tech Mono',monospace;font-size:.6rem;color:var(--accent);">ADMIN:</span><button class="btn btn-warn btn-xs" onclick="abrirEditarOc('${o.id}')">✏️ EDITAR</button><button class="btn btn-danger btn-xs" onclick="confirmarDeleteOc('${o.id}')">🗑 DELETAR</button>${o.status!=='cancelada'?'<button class="btn btn-xs" style="background:var(--text-dim);color:#000;" onclick="cancelarOc(\''+o.id+'\')">🚫 CANCELAR</button>':''}</div>`:'';const actHTML=actions?`<div class="oc-actions"><button class="btn btn-success btn-sm" onclick="abrirDecisao('${o.id}','aceita')">✔ ACEITAR</button><button class="btn btn-danger btn-sm" onclick="abrirDecisao('${o.id}','recusada')">✘ RECUSAR</button></div><div class="decide-zone" id="dz-${o.id}"><div class="fg" style="margin-top:10px;"><label>Motivo</label><textarea id="dm-${o.id}"></textarea><div style="display:flex;gap:8px;margin-top:8px;"><button class="btn btn-sm" id="dc-${o.id}" onclick="decidir('${o.id}')">CONFIRMAR</button><button class="btn btn-ghost btn-sm" onclick="fecharDecisao('${o.id}')">CANCELAR</button></div></div></div>`:(o.resposta?'<div><span class="resp-lbl">Resposta</span><div class="dep-box" style="margin-bottom:0;">'+o.resposta+'</div></div>':'');return `<div class="oc-wrap"><div class="oc-top"><div class="oc-meta"><div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">${tipoBadge}<span style="font-size:.72rem;font-weight:700;color:var(--text);">${o.id}</span></div><div>${dt}</div><div>POR: <b>${o.autor||o.delegado}</b></div></div><span class="status-chip ${scMap[o.status]||'sc-p'}">${scLbl[o.status]||o.status}</span></div><div class="oc-fields"><div class="oc-f"><label>Envolvido</label><span>${o.nome}</span></div><div class="oc-f"><label>Cargo</label><span>${o.cargo}</span></div></div><div style="font-family:'Share Tech Mono',monospace;font-size:.58rem;color:var(--text-dim);margin-bottom:5px;letter-spacing:.08em;">RELATO</div><div class="dep-box">${o.depoimento}</div>${actHTML}${masterBtns}</div>`;}
let _decAcao={};
function abrirDecisao(id,acao){document.querySelectorAll('.decide-zone').forEach(z=>{if(z.id!=='dz-'+id)z.classList.remove('open');});const dz=document.getElementById('dz-'+id),dc=document.getElementById('dc-'+id);if(!dz)return;if(_decAcao[id]===acao&&dz.classList.contains('open')){fecharDecisao(id);return;}_decAcao[id]=acao;dz.classList.add('open');dc.textContent=acao==='aceita'?'✔ CONFIRMAR ACEITAR':'✘ CONFIRMAR RECUSAR';dc.className='btn btn-sm '+(acao==='aceita'?'btn-success':'btn-danger');}
function fecharDecisao(id){const dz=document.getElementById('dz-'+id);if(dz)dz.classList.remove('open');delete _decAcao[id];}
async function decidir(id){const acao=_decAcao[id],motivo=document.getElementById('dm-'+id)?.value.trim();if(!acao){toast('Selecione aceitar ou recusar.','d');return;}if(!motivo){toast('Digite o motivo.','w');return;}const oc=STATE.ocs.find(o=>o.id===id);if(!oc)return;try{await API.updateOc(id,{...oc,status:acao,resposta:me.nome+': '+motivo,decididoPor:me.user,decididoEm:Date.now()});toast('Ocorrência '+(acao==='aceita'?'aceita ✅':'recusada ❌')+'!',acao==='aceita'?'s':'d');updateNotif();}catch(e){toast(e.message||'Erro.','d');}}
let _editOcId=null;
function abrirEditarOc(id){const oc=STATE.ocs.find(o=>o.id===id);if(!oc)return;_editOcId=id;document.getElementById('eo-nome').value=oc.nome;document.getElementById('eo-cargo').value=oc.cargo;document.getElementById('eo-delegado').value=oc.delegado;document.getElementById('eo-status').value=oc.status;document.getElementById('eo-dep').value=oc.depoimento;document.getElementById('eo-resp').value=oc.resposta||'';openModal('m-edit-oc');}
async function salvarEdicaoOc(){if(!_editOcId)return;const oc=STATE.ocs.find(o=>o.id===_editOcId);if(!oc)return;try{await API.updateOc(_editOcId,{...oc,nome:document.getElementById('eo-nome').value.trim(),cargo:document.getElementById('eo-cargo').value.trim(),delegado:document.getElementById('eo-delegado').value.trim(),status:document.getElementById('eo-status').value,depoimento:document.getElementById('eo-dep').value.trim(),resposta:document.getElementById('eo-resp').value.trim(),editadoPor:me.user,editadoEm:Date.now()});closeModal('m-edit-oc');toast('Editado!','s');}catch(e){toast(e.message||'Erro.','d');}}
function confirmarDeleteOc(id){const oc=STATE.ocs.find(o=>o.id===id);if(!oc)return;document.getElementById('del-info').innerHTML='Excluir <b>'+id+'</b>?';document.getElementById('del-confirm-btn').onclick=()=>{closeModal('m-confirm-del');deleteOc(id);};openModal('m-confirm-del');}
async function deleteOc(id){try{await API.deleteOc(id,me.user);toast('Excluída.','w');}catch(e){toast(e.message,'d');}}
async function cancelarOc(id){const oc=STATE.ocs.find(o=>o.id===id);if(!oc)return;try{await API.updateOc(id,{...oc,status:'cancelada',canceladoPor:me.user,canceladoEm:Date.now()});toast('Cancelada.','w');}catch(e){toast(e.message,'d');}}

function vUsuarios(){const myP=CARGO_PERM[me.cargo]||0;const master=isMaster();const rows=STATE.users.map(u=>{const isMe=u.user===me.user,tP=CARGO_PERM[u.cargo]||0;const canAct=!isMe&&(master||myP>tP);const isRei=(u.cargo==='admin')&&!master;const isBanned=u.banExpires&&u.banExpires>Date.now();const bannedBadge=isBanned?'<span class="ban-badge">⛔ SUSPENSO</span>':'';const opts=Object.entries(CARGO_LABEL).filter(([k])=>master||(CARGO_PERM[k]||0)<myP).map(([k,v])=>'<option value="'+k+'" '+(u.cargo===k?'selected':'')+'>'+v+'</option>').join('');const cargoCell=(canAct&&!isRei&&(master||myP>=6)&&opts)?'<select class="cargo-select" onchange="alterarCargo(\''+u.user+'\', this.value, this)">'+opts+'</select>':'<span class="cargo-badge '+(CARGO_BADGE_CLASS[u.cargo]||'')+'">'+(CARGO_LABEL[u.cargo]||u.cargo)+'</span>';const nn=u.nome.replace(/'/g,"\\'");return '<tr><td><div style="display:flex;align-items:center;gap:10px;"><div class="u-avatar">'+u.nome.charAt(0).toUpperCase()+'</div><div><div style="font-weight:600;">'+u.nome+' '+bannedBadge+'</div><div style="font-family:\'Share Tech Mono\',monospace;font-size:.6rem;color:var(--text-dim);">@'+u.user+'</div></div></div></td><td>'+cargoCell+'</td><td><span class="status-chip '+(u.ativo?'sc-a':'sc-r')+'">'+(u.ativo?'✅ Ativo':'❌ Inativo')+'</span></td><td style="font-family:\'Share Tech Mono\',monospace;font-size:.62rem;color:var(--text-dim);">'+(u.criadoPor||'padrão')+'</td><td><div style="display:flex;gap:5px;flex-wrap:wrap;">'+(isMe?'<span style="font-family:\'Share Tech Mono\',monospace;font-size:.6rem;color:var(--accent);">VOCÊ</span>':'')+(canAct?'<button class="btn btn-warn btn-xs" onclick="abrirResetSenha(\''+u.user+'\',\''+nn+'\')">🔑</button>':'')+(canAct&&!isBanned?'<button class="btn btn-danger btn-xs" onclick="abrirBanModal(\''+u.user+'\',\''+nn+'\',\''+u.cargo+'\')">⛔ SUSPENDER</button>':'')+(canAct&&isBanned?'<button class="btn btn-success btn-xs" onclick="removerBan(\''+u.user+'\',\''+nn+'\')">✅ LIBERAR</button>':'')+(canAct&&(master||myP>=6)?'<button class="btn btn-xs '+(u.ativo?'btn-danger':'btn-success')+'" onclick="toggleStatus(\''+u.user+'\','+((!u.ativo))+')">'+(u.ativo?'🚫':'✅')+'</button>':'')+((master||myP>=7)&&!isMe?'<button class="btn btn-danger btn-xs" onclick="confirmarDeleteUser(\''+u.user+'\',\''+nn+'\')">🗑</button>':'')+'</div></td></tr>';}).join('');return '<div class="stitle">▸ GERENCIAR USUÁRIOS</div>'+((master||myP>=6)?'<div style="display:flex;justify-content:flex-end;margin-bottom:16px;"><button class="btn btn-success btn-sm" onclick="abrirCriarUsuario()">+ CRIAR USUÁRIO</button></div>':'')+'<div class="card c-none" style="padding:0;overflow:hidden;"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>USUÁRIO</th><th>CARGO</th><th>STATUS</th><th>CRIADO POR</th><th>AÇÕES</th></tr></thead><tbody>'+rows+'</tbody></table></div></div><div style="margin-top:10px;" class="hint">Total: <span>'+STATE.users.length+'</span> usuário(s).</div>';}
async function criarUsuario(){const nome=document.getElementById('nu-nome').value.trim(),user=document.getElementById('nu-user').value.trim().toLowerCase().replace(/\s/g,''),cargo=document.getElementById('nu-cargo').value,pass=document.getElementById('nu-pass').value;if(!nome||!user||!cargo||!pass){toast('Preencha todos os campos.','d');return;}if(pass.length<6){toast('Senha mínima: 6 caracteres.','w');return;}if(!/^[a-z0-9_]+$/.test(user)){toast('Login: apenas letras, números e _.','w');return;}if(!isMaster()&&(CARGO_PERM[cargo]||0)>=(CARGO_PERM[me.cargo]||0)){toast('Não pode criar usuários com cargo igual ou superior.','d');return;}try{await API.createUser({nome,user,cargo,pass,criadoPor:me.user});toast('Usuário '+nome+' criado!','s');closeModal('m-novo-user');['nu-nome','nu-user','nu-pass'].forEach(id=>document.getElementById(id).value='');}catch(e){toast(e.message||'Erro.','d');}}
function abrirCriarUsuario(){const myP=CARGO_PERM[me.cargo]||0;const sel=document.getElementById('nu-cargo');if(sel){sel.innerHTML=Object.entries(CARGO_LABEL).filter(([k])=>isMaster()||(CARGO_PERM[k]||0)<myP).reverse().map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('');}['nu-nome','nu-user','nu-pass'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});openModal('m-novo-user');}
function abrirResetSenha(username,nome){document.getElementById('rs-info').innerHTML='Redefinindo senha de: <b>'+nome+'</b>';document.getElementById('rs-target').value=username;document.getElementById('rs-nova').value='';document.getElementById('rs-conf').value='';openModal('m-reset-senha');}
async function confirmarResetSenha(){const un=document.getElementById('rs-target').value,nova=document.getElementById('rs-nova').value,conf=document.getElementById('rs-conf').value;if(!nova||!conf){toast('Preencha.','d');return;}if(nova.length<6){toast('Mínimo 6 caracteres.','w');return;}if(nova!==conf){toast('Senhas não coincidem.','d');return;}try{await API.resetSenha(un,nova,me.nome);toast('Senha redefinida!','s');closeModal('m-reset-senha');}catch(e){toast(e.message,'d');}}
function confirmarDeleteUser(username,nome){document.getElementById('del-info').innerHTML='Excluir <b>'+nome+'</b>?';document.getElementById('del-confirm-btn').onclick=()=>{closeModal('m-confirm-del');deleteUser(username);};openModal('m-confirm-del');}
async function deleteUser(un){try{await API.deleteUser(un,me.nome);toast('Excluído.','w');}catch(e){toast(e.message,'d');}}
async function toggleStatus(un,ativo){try{await API.toggleUserStatus(un,ativo,me.nome);toast('Conta '+(ativo?'ativada':'desativada')+'.',ativo?'s':'w');}catch(e){toast(e.message,'d');}}
function alterarCargo(username,novoCargo,selectEl){const tU=STATE.users.find(u=>u.user===username);if(!tU)return;const oP=CARGO_PERM[tU.cargo]||0,nP=CARGO_PERM[novoCargo]||0;if(nP<oP){_pendingCargoChange={username,novoCargo,oldCargo:tU.cargo,selectEl};document.getElementById('rb-info').innerHTML='Rebaixando <b>'+tU.nome+'</b>';document.getElementById('rb-motivo').value='';openModal('m-rebaixar');}else _doCargoChange(username,novoCargo,null);}
async function _doCargoChange(username,cargo,motivo){try{await API.updateUserCargo(username,cargo,me.nome,motivo);toast('Cargo alterado!','s');}catch(e){toast(e.message||'Erro.','d');if(_pendingCargoChange?.selectEl)_pendingCargoChange.selectEl.value=_pendingCargoChange.oldCargo;_pendingCargoChange=null;}}
async function confirmarRebaixar(){const motivo=document.getElementById('rb-motivo')?.value.trim();if(!motivo){toast('Informe o motivo.','d');return;}if(!_pendingCargoChange){closeModal('m-rebaixar');return;}const{username,novoCargo}=_pendingCargoChange;closeModal('m-rebaixar');await _doCargoChange(username,novoCargo,motivo);_pendingCargoChange=null;}
function cancelarRebaixar(){if(_pendingCargoChange?.selectEl)_pendingCargoChange.selectEl.value=_pendingCargoChange.oldCargo;_pendingCargoChange=null;closeModal('m-rebaixar');}
function abrirBanModal(username,nome,cargo){_pendingBan={username,nome};document.getElementById('bn-info').innerHTML='Suspender <b>'+nome+'</b>';document.getElementById('bn-duracao').value='';document.getElementById('bn-motivo').value='';openModal('m-ban');}
async function confirmarBan(){if(!_pendingBan){closeModal('m-ban');return;}const dur=parseInt(document.getElementById('bn-duracao').value)||0;const motivo=document.getElementById('bn-motivo').value.trim();if(dur<=0){toast('Duração inválida (em minutos).','d');return;}if(!motivo){toast('Informe o motivo.','d');return;}try{await API.applyBan(_pendingBan.username,dur,motivo,me.user,me.nome);toast(_pendingBan.nome+' suspenso por '+dur+' min(s).','w');closeModal('m-ban');_pendingBan=null;}catch(e){toast(e.message||'Erro.','d');}}
async function removerBan(username,nome){try{await API.removeBan(username,me.nome);toast('Suspensão de '+nome+' removida.','s');}catch(e){toast(e.message||'Erro.','d');}}

function vPunicoes(){const myP=CARGO_PERM[me.cargo]||0,canEdit=myP>=3;const nc=n=>({Leve:'sc-a',Médio:'sc-p',Grave:'sc-r'})[n]||'sc-p';const form=canEdit?`<div class="card" style="margin-bottom:22px;"><div style="font-family:'Orbitron',sans-serif;font-size:.72rem;color:var(--accent);letter-spacing:.14em;margin-bottom:16px;">▸ REGISTRAR PUNIÇÃO</div><div class="g2"><div class="fg"><label>Nome do Agente</label><input id="pn-nome"></div><div class="fg"><label>Nível</label><select id="pn-nivel"><option>Leve</option><option>Médio</option><option>Grave</option></select></div><div class="fg g-full"><label>Motivo</label><input id="pn-motivo"></div></div><button class="btn btn-primary" id="btn-addpun" style="margin-top:10px;max-width:200px;" onclick="addPun()">▸ REGISTRAR</button></div>`:`<div class="card c-none" style="margin-bottom:16px;padding:12px 16px;border:1px solid var(--border);font-family:'Share Tech Mono',monospace;font-size:.68rem;color:var(--text-dim);">▸ Apenas Táticos e acima podem registrar punições.</div>`;const rows=[...STATE.puns].reverse().map((p,ri)=>{const realIdx=STATE.puns.length-1-ri;return '<tr><td style="font-weight:600;">'+p.nome+'</td><td style="color:var(--text-mid);">'+p.motivo+'</td><td><span class="status-chip '+nc(p.nivel)+'">'+p.nivel+'</span></td><td style="font-family:\'Share Tech Mono\',monospace;font-size:.62rem;color:var(--text-dim);">'+p.autor+'</td><td style="font-family:\'Share Tech Mono\',monospace;font-size:.6rem;color:var(--text-dim);">'+new Date(p.ts).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'})+'</td>'+(canEdit?'<td><button class="btn btn-danger btn-xs" onclick="delPun('+realIdx+')">✘</button></td>':'<td></td>')+'</tr>';}).join('');return '<div class="stitle">▸ QUADRO DE PUNIÇÕES</div>'+form+'<div class="card c-none" style="padding:0;overflow:hidden;"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>NOME</th><th>MOTIVO</th><th>NÍVEL</th><th>REGISTRADO POR</th><th>DATA</th><th></th></tr></thead><tbody>'+(rows||'<tr><td colspan="6" style="text-align:center;padding:30px;">Nenhuma punição registrada.</td></tr>')+'</tbody></table></div></div>';}
async function addPun(){if(_busyPun)return;_busyPun=true;const btn=document.getElementById('btn-addpun');if(btn){btn.disabled=true;btn.textContent='▸ REGISTRANDO…';}try{const nome=document.getElementById('pn-nome')?.value.trim(),motivo=document.getElementById('pn-motivo')?.value.trim(),nivel=document.getElementById('pn-nivel')?.value;if(!nome||!motivo){toast('Preencha nome e motivo.','d');return;}await API.createPun({nome,motivo,nivel,autor:me.nome,ts:Date.now()});toast('Punição registrada.','s');const n=document.getElementById('pn-nome'),m=document.getElementById('pn-motivo');if(n)n.value='';if(m)m.value='';}catch(e){toast(e.message||'Erro.','d');}finally{setTimeout(()=>{_busyPun=false;const b=document.getElementById('btn-addpun');if(b){b.disabled=false;b.textContent='▸ REGISTRAR';}},1200);}}
async function delPun(idx){try{const p=STATE.puns[idx];if(p&&p.id)await API.deletePunById(p.id,me.nome);else await API.deletePun(idx,me.nome);toast('Removida.','w');}catch(e){toast(e.message||'Erro.','d');}}

function fmtHM(mins){if(!mins||mins<=0)return '0h';const h=Math.floor(mins/60),m=mins%60;return h+'h'+(m>0?m.toString().padStart(2,'0'):'');}
function somarBancoHoras(userLogin){const pontosUser=STATE.pontos.filter(p=>p.userLogin===userLogin&&p.type==='saida'&&p.trabalhado!==undefined);let totalTrab=0,totalExtra=0,totalDebt=0,totalReais=0,turnos=0;pontosUser.forEach(p=>{totalTrab+=(p.trabalhado||0);totalExtra+=(p.extraMins||0);totalDebt+=(p.debtMins||0);totalReais+=(p.extraReais||0);turnos++;});return{totalTrab,totalExtra,totalDebt,totalReais,turnos};}

function vPontos(){
  const myP=CARGO_PERM[me.cargo]||0,isSuperv=myP>=3;
  const mine=STATE.pontos.filter(p=>p.userLogin===me.user);
  const lastPonto=mine.length?mine[mine.length-1]:null;
  const isClockedIn=lastPonto&&lastPonto.type==='entrada';
  const porUser={};STATE.pontos.forEach(p=>{if(!porUser[p.userLogin])porUser[p.userLogin]=[];porUser[p.userLogin].push(p);});
  const hojeBr=brDate();const hoje2=STATE.pontos.filter(p=>brDateOf(p.ts)===hojeBr);
  const FM="font-family:'Share Tech Mono',monospace;";const FO="font-family:'Orbitron',sans-serif;";
  const uMe=STATE.users.find(u=>u.user===me.user);
  const cicloLen=(uMe&&Array.isArray(uMe.cicloDias))?uMe.cicloDias.length:0;
  const folgaDia=(uMe&&uMe.folgaDia)?uMe.folgaDia:null;
  let folgaHtml='';
  if(folgaDia===hojeBr)folgaHtml='<div style="margin-top:14px;padding:10px 14px;border:1px solid rgba(224,192,96,.4);background:rgba(224,192,96,.08);border-radius:4px;'+FM+'font-size:.7rem;color:var(--warn);">🌴 HOJE É SEU DIA DE FOLGA!</div>';
  else if(folgaDia)folgaHtml='<div style="margin-top:14px;'+FM+'font-size:.66rem;color:var(--warn);">🌴 Próxima folga concedida: '+folgaDia+'</div>';
  const cicloHtml='<div style="margin-top:10px;'+FM+'font-size:.66rem;color:var(--text-mid);">CICLO DE FOLGA: '+cicloLen+'/6 dias</div>';
  const bh=somarBancoHoras(me.user);
  const saldoMin=bh.totalExtra-bh.totalDebt;
  const saldoStr=saldoMin>=0?'+'+fmtHM(saldoMin):'-'+fmtHM(Math.abs(saldoMin));
  const saldoColor=saldoMin>=0?'#4ade80':'#f87171';
  const bancoHorasHtml=`<div class="card" style="margin-bottom:20px;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;"><div style="font-family:'Orbitron',sans-serif;font-size:.72rem;color:var(--accent);letter-spacing:.14em;">💼 MEU BANCO DE HORAS</div><div style="font-family:'Share Tech Mono',monospace;font-size:.62rem;color:var(--text-dim);">${bh.turnos} turno(s) encerrado(s)</div></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px;"><div style="padding:14px;background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:12px;text-align:center;"><div style="${FO}font-size:1.5rem;color:var(--text);font-weight:800;margin-bottom:2px;">${fmtHM(bh.totalTrab)}</div><div style="${FM}font-size:.6rem;color:var(--text-dim);letter-spacing:.1em;text-transform:uppercase;">TRABALHADAS</div></div><div style="padding:14px;background:rgba(74,222,128,.06);border:1px solid rgba(74,222,128,.2);border-radius:12px;text-align:center;"><div style="${FO}font-size:1.5rem;color:#4ade80;font-weight:800;margin-bottom:2px;">+${fmtHM(bh.totalExtra)}</div><div style="${FM}font-size:.6rem;color:var(--text-dim);letter-spacing:.1em;text-transform:uppercase;">HORAS EXTRAS</div><div style="${FM}font-size:.68rem;color:#4ade80;margin-top:4px;">R$ ${bh.totalReais.toFixed(2).replace('.',',')}</div></div><div style="padding:14px;background:rgba(248,113,113,.06);border:1px solid rgba(248,113,113,.2);border-radius:12px;text-align:center;"><div style="${FO}font-size:1.5rem;color:#f87171;font-weight:800;margin-bottom:2px;">-${fmtHM(bh.totalDebt)}</div><div style="${FM}font-size:.6rem;color:var(--text-dim);letter-spacing:.1em;text-transform:uppercase;">HORAS DEVIDAS</div></div><div style="padding:14px;background:rgba(255,255,255,.03);border:1px solid var(--border2);border-radius:12px;text-align:center;"><div style="${FO}font-size:1.5rem;color:${saldoColor};font-weight:800;margin-bottom:2px;">${saldoStr}</div><div style="${FM}font-size:.6rem;color:var(--text-dim);letter-spacing:.1em;text-transform:uppercase;">SALDO</div></div></div><div style="${FM}font-size:.64rem;color:var(--text-dim);line-height:1.5;padding:10px 12px;background:rgba(255,255,255,.02);border-radius:8px;">💡 <b style="color:var(--text-mid);">Como funciona:</b> cada cargo tem uma carga diária (${CARGO_BASE_MINUTES[me.cargo]||0} min). Trabalhar <b style="color:#4ade80;">acima</b> gera horas extras (+R$ 20 a cada 30min) e <b style="color:#a78bfa;">+1 🎰 giro de roleta por hora extra</b>. Trabalhar <b style="color:#f87171;">abaixo</b> gera horas devidas.</div></div>`;
  const minhaTab=mine.length?'<table class="tbl"><thead><tr><th>DATA</th><th>TIPO</th><th>HORA</th><th>DETALHES</th></tr></thead><tbody>'+[...mine].reverse().slice(0,20).map(function(p){let det='';let tipoLbl,tipoCor;if(p.type==='entrada'){tipoLbl='▶ ENTRADA';tipoCor='color:#4ade80;';}else if(p.type==='folga'){tipoLbl='🌴 FOLGA';tipoCor='color:var(--warn);';det='<span style="color:var(--warn);font-size:.65rem;">Dia de folga</span>';}else{tipoLbl='⏹ SAÍDA';tipoCor='color:#f87171;';}if(p.type==='saida'&&p.trabalhado!==undefined){const h=Math.floor(p.trabalhado/60),m=p.trabalhado%60;det='<b style="color:var(--accent);">'+h+'h'+(m>0?m.toString().padStart(2,'0'):'00')+'</b>';if(p.extraReais>0)det+='<br><span style="color:#4ade80;font-size:.65rem;">+ R$ '+p.extraReais+'</span>';if(p.extraMins>=60)det+='<br><span style="color:#a78bfa;font-size:.65rem;">🎰 +'+Math.floor(p.extraMins/60)+' giro(s)</span>';if(p.debtMins>0){const dh=Math.floor(p.debtMins/60),dm=p.debtMins%60;det+='<br><span style="color:#f87171;font-size:.65rem;">Faltou '+dh+'h'+dm.toString().padStart(2,'0')+'</span>';}}return('<tr><td style="'+FM+'">'+(p.data||brDateOf(p.ts))+'</td><td style="'+FM+tipoCor+'">'+tipoLbl+'</td><td style="'+FM+'color:var(--accent);font-weight:700;">'+p.hora+'</td><td style="font-size:.75rem;line-height:1.2;">'+det+'</td></tr>');}).join('')+'</tbody></table>':'<p style="color:var(--text-dim);'+FM+'font-size:.68rem;">Nenhum ponto.</p>';
  const botaoPonto=isClockedIn?'<button class="btn btn-danger" style="font-size:.85rem;padding:12px 32px;" onclick="baterPonto(\'saida\')">⏹ ENCERRAR TURNO</button><div style="margin-top:10px;'+FM+'font-size:.68rem;color:var(--accent);">Entrada: '+lastPonto.hora+'</div>':'<button class="btn btn-primary" id="btn-ponto" style="font-size:.85rem;padding:12px 32px;" onclick="baterPonto(\'entrada\')">▶ BATER ENTRADA</button>';
  var supervHtml='';
  if(isSuperv){
    const tabelaHoje=hoje2.length?'<table class="tbl"><thead><tr><th>AGENTE</th><th>HORA</th><th>CARGO</th></tr></thead><tbody>'+hoje2.map(function(p){const lbl=p.type==='folga'?'🌴':p.hora;return('<tr><td><b>'+p.nome+'</b></td><td style="'+FM+'color:var(--accent);font-weight:700;">'+lbl+'</td><td><span class="cargo-badge '+(CARGO_BADGE_CLASS[p.cargo]||'')+'" style="font-size:.55rem;">'+(CARGO_LABEL[p.cargo]||p.cargo)+'</span></td></tr>');}).join('')+'</tbody></table>':'<p style="color:var(--text-dim);'+FM+'font-size:.68rem;">Nenhum hoje.</p>';
    const tabelaAgentes=Object.entries(porUser).map(function(kv){const login=kv[0],pts=kv[1];const u=STATE.users.find(function(u){return u.user===login;});const nm=u?u.nome:login;const cg=u?u.cargo:'';const rows=[...pts].reverse().map(function(p){return '<tr><td style="'+FM+'">'+(p.data||brDateOf(p.ts))+'</td><td style="'+FM+'color:var(--accent);font-weight:700;">'+p.hora+'</td><td style="'+FM+'font-size:.65rem;color:var(--text-dim);">'+(p.type==='folga'?'FOLGA':p.type.toUpperCase())+'</td></tr>';}).join('');return '<div class="ponto-agente-block"><div class="ponto-agente-header" onclick="togglePontoAgente(\'pa-'+login+'\')"><div><div class="u-avatar" style="display:inline-flex;width:28px;height:28px;font-size:.7rem;">'+nm.charAt(0)+'</div><b style="margin-left:8px;">'+nm+'</b><span class="cargo-badge '+(CARGO_BADGE_CLASS[cg]||'')+'" style="font-size:.5rem;margin-left:8px;">'+(CARGO_LABEL[cg]||cg)+'</span></div><span style="'+FM+'font-size:.65rem;color:var(--text-dim);">'+pts.length+' reg. ▾</span></div><div id="pa-'+login+'" style="display:none;"><table class="tbl"><thead><tr><th>DATA</th><th>HORA</th><th>TIPO</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';}).join('');
    supervHtml='<div class="card" style="margin-bottom:20px;"><div style="'+FO+'font-size:.68rem;color:var(--accent);letter-spacing:.12em;margin-bottom:12px;">▸ PONTOS HOJE</div>'+tabelaHoje+'</div><div class="card"><div style="'+FO+'font-size:.68rem;color:var(--accent);letter-spacing:.12em;margin-bottom:12px;">▸ HISTÓRICO POR AGENTE</div>'+tabelaAgentes+'</div>';
  }
  return '<div class="stitle">▸ BATER PONTO</div>'+'<div class="card" style="margin-bottom:20px;text-align:center;"><div style="'+FO+'font-size:.7rem;color:var(--accent);letter-spacing:.14em;margin-bottom:12px;">▸ REGISTRO DE PONTO</div><div id="rel-clock" style="'+FO+'font-size:2rem;color:var(--text);margin-bottom:8px;letter-spacing:.1em;">--:--:--</div><div id="rel-date" style="'+FM+'font-size:.65rem;color:var(--text-dim);margin-bottom:20px;"></div>'+botaoPonto+folgaHtml+cicloHtml+'</div>'+bancoHorasHtml+'<div class="card" style="margin-bottom:20px;"><div style="'+FO+'font-size:.68rem;color:var(--accent);letter-spacing:.12em;margin-bottom:12px;">▸ MEUS REGISTROS</div>'+minhaTab+'</div>'+supervHtml;
}
function togglePontoAgente(id){const el=document.getElementById(id);if(el)el.style.display=el.style.display==='none'?'':'none';}
function startClock(){clearInterval(_clockInterval);_clockInterval=setInterval(()=>{const ce=document.getElementById('rel-clock'),de=document.getElementById('rel-date');if(!ce){clearInterval(_clockInterval);return;}ce.textContent=brTimeSec();if(de)de.textContent=brDateLong();},1000);}
async function baterPonto(type){if(_busyPonto)return;_busyPonto=true;try{const p={userLogin:me.user,nome:me.nome,cargo:me.cargo,type:type,hora:brTimeSec(),data:brDate(),ts:Date.now()};const res=await API.createPonto(p);if(res&&res.error){toast(res.error,'d');return;}if(type==='entrada'){toast('✅ Entrada registrada às '+p.hora+'!','s');}else{const rp=(res&&res.ponto)?res.ponto:{};if(rp.trabalhado!==undefined){const h=Math.floor(rp.trabalhado/60),m=rp.trabalhado%60;let msg='✅ Turno encerrado às '+p.hora+'! Total: '+h+'h'+(m>0?m.toString().padStart(2,'0'):'00');if(rp.extraReais>0)msg+='<br><b style="color:#4ade80;">Extras: R$ '+rp.extraReais+'</b>';if(res.girosGanhos>0)msg+='<br><b style="color:#a78bfa;">🎰 +'+res.girosGanhos+' giro(s) de roleta!</b>';if(rp.debtMins>0){const dh=Math.floor(rp.debtMins/60),dm=rp.debtMins%60;msg+='<br><b style="color:#f87171;">Faltou '+dh+'h'+dm.toString().padStart(2,'0')+'</b>';}if(rp.folgaDia)msg+='<br><b style="color:var(--warn);">🌴 Folga: '+rp.folgaDia+'</b>';toast(msg,'s',9000);}else toast('✅ Saída registrada às '+p.hora+'!','s');}renderTab(activeTab);}catch(e){toast(e.message||'Erro.','d');}finally{setTimeout(()=>{_busyPonto=false;},1500);}}

function vAuditoria(){const logs=STATE.audit;if(!logs.length)return'<div class="stitle">▸ AUDITORIA</div>'+empty('🔍','Nenhum evento.');return'<div class="stitle">▸ AUDITORIA DO SISTEMA</div><div style="display:flex;justify-content:flex-end;margin-bottom:12px;"><button class="btn btn-danger btn-sm" onclick="limparAuditoria()">🗑 LIMPAR LOG</button></div><div class="card c-none" style="max-height:580px;overflow-y:auto;">'+logs.map(l=>'<div class="log-entry"><div class="log-time">'+new Date(l.ts).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+'</div><div class="log-icon">'+(l.icon||'📋')+'</div><div class="log-txt">'+l.msg+'</div></div>').join('')+'</div><div style="margin-top:10px;" class="hint">'+logs.length+' evento(s).</div>';}
async function limparAuditoria(){if(!confirm('Limpar auditoria?'))return;try{await API.clearAudit();toast('Auditoria limpa.','w');}catch(e){toast(e.message,'d');}}

async function alterarSenhaPropria(){const at=document.getElementById('s-atual').value,nv=document.getElementById('s-nova').value,cf=document.getElementById('s-conf').value;if(!at||!nv||!cf){toast('Preencha todos os campos.','d');return;}if(nv.length<6){toast('Nova senha: mínimo 6 caracteres.','w');return;}if(nv!==cf){toast('Confirmação não confere.','d');return;}try{const check=await API.login(me.user,at);if(!check||check.banned){toast('Senha atual incorreta.','d');return;}if(!check.user){toast('Senha atual incorreta.','d');return;}}catch(e){toast('Senha atual incorreta.','d');return;}try{await API.resetSenha(me.user,nv,me.nome);toast('Senha alterada!','s');closeModal('m-senha');['s-atual','s-nova','s-conf'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});}catch(e){toast(e.message||'Erro.','d');}}

// ════════════════════════════════════════════════════════════
// ══ ROLETA — CASSINO PRO + SERVIDOR (MASTER ILIMITADO) ═══
// ════════════════════════════════════════════════════════════
const ROLETA_CARGOS_PERMITIDOS=['gm','agente','tatico','escrivao'];
const ROLETA_COOLDOWN_MS=24*60*60*1000;
const ROLETA_PREMIOS=[
  {valor:100,   peso:70,  cor:'#10b981', cor2:'#059669', corBorda:'#34d399', nome:'Comum',      icone:'💵', raridade:'common'},
  {valor:500,   peso:20,  cor:'#3b82f6', cor2:'#1d4ed8', corBorda:'#60a5fa', nome:'Incomum',    icone:'💰', raridade:'uncommon'},
  {valor:2000,  peso:40,  cor:'#f59e0b', cor2:'#b45309', corBorda:'#fbbf24', nome:'Raro',       icone:'💎', raridade:'rare'},
  {valor:3000,  peso:5,   cor:'#ef4444', cor2:'#991b1b', corBorda:'#f87171', nome:'Muito Raro', icone:'🏆', raridade:'epic'},
  {valor:4000,  peso:5,   cor:'#8b5cf6', cor2:'#5b21b6', corBorda:'#a78bfa', nome:'Épico',      icone:'👑', raridade:'epic2'},
  {valor:10000, peso:0.5, cor:'#ec4899', cor2:'#9d174d', corBorda:'#f9a8d4', nome:'LENDÁRIO',   icone:'💠', raridade:'legendary'}
];

function _roletaStatus(){
  const master=isMaster();
  const giros=(me&&typeof me.girosBonus==='number')?me.girosBonus:0;
  const ultimo=(me&&me.ultimoGiroRoleta)?me.ultimoGiroRoleta:null;
  const agora=Date.now();
  const cooldownOk=!ultimo||(agora-ultimo)>=ROLETA_COOLDOWN_MS;
  const podeGirar=master||cooldownOk||giros>0;
  const resta=ultimo?Math.max(0,ROLETA_COOLDOWN_MS-(agora-ultimo)):0;
  return{master,giros,ultimo,cooldownOk,podeGirar,resta};
}

function vRoleta(){
  const cargoPermitido=ROLETA_CARGOS_PERMITIDOS.includes(me.cargo)||isMaster();
  const st=_roletaStatus();
  const hRest=Math.floor(st.resta/3600000),mRest=Math.floor((st.resta%3600000)/60000),sRest=Math.floor((st.resta%60000)/1000);
  const cdTxt=hRest>0?`${hRest}h ${mRest}m ${sRest}s`:`${mRest}m ${sRest}s`;

  if(!cargoPermitido){
    return `<div class="stitle">▸ ROLETA DA SORTE</div>
      <div class="card" style="text-align:center;padding:50px 20px;">
        <div style="font-size:4rem;margin-bottom:20px;">🔒</div>
        <div style="font-size:1.3rem;font-weight:800;color:var(--text);margin-bottom:10px;letter-spacing:.04em;">ACESSO RESTRITO</div>
        <div style="color:var(--text-mid);font-size:.88rem;line-height:1.7;max-width:400px;margin:0 auto;">
          A roleta está disponível apenas para:<br>
          <b style="color:var(--accent);">Guarda municipal, Agente oficial, Tático e Escrivão</b>
        </div>
      </div>`;
  }

  const adminBtn=st.master?`
    <button class="roleta-master-btn" onclick="abrirModalBonus()" title="Liberar giros para usuários">
      <span class="roleta-master-btn-ico">🎁</span>
      <span>LIBERAR GIROS</span>
    </button>`:'';

  const bannerMaster=st.master?`
    <div class="roleta-master-banner">
      <div class="roleta-master-glow"></div>
      <div class="roleta-master-content">
        <span class="roleta-master-ico">👑</span>
        <div class="roleta-master-txt">
          <div class="roleta-master-main">ACESSO ILIMITADO</div>
          <div class="roleta-master-sub">Master pode girar quantas vezes quiser, sem limite</div>
        </div>
      </div>
    </div>`:'';

  const bannerBonus=st.giros>0?`
    <div class="roleta-bonus-banner">
      <div class="roleta-bonus-glow"></div>
      <div class="roleta-bonus-content">
        <span class="roleta-bonus-ico">🎁</span>
        <div class="roleta-bonus-txt">
          <div class="roleta-bonus-main">Você tem <b>${st.giros}</b> giro(s) bônus!</div>
          <div class="roleta-bonus-sub">Ganhos por hora extra trabalhada ou liberados pelo Master</div>
        </div>
      </div>
    </div>`:'';

  const bannerCooldown=(!st.podeGirar&&!st.master)?`
    <div class="roleta-cooldown-banner">
      <div class="roleta-cooldown-ico">⏳</div>
      <div class="roleta-cooldown-txt">
        <div class="roleta-cooldown-main">Próximo giro gratuito em</div>
        <div class="roleta-cooldown-timer" id="roleta-cd-timer">${cdTxt}</div>
        <div class="roleta-cooldown-hint">💡 Faça horas extras no ponto para ganhar +1 giro por hora!</div>
      </div>
    </div>`:'';

  return `
  <style>
    .roleta-hero{position:relative;padding:28px 24px;border-radius:20px;margin-bottom:20px;background:radial-gradient(circle at 20% 30%,rgba(245,158,11,.15) 0%,transparent 50%),radial-gradient(circle at 80% 70%,rgba(139,92,246,.15) 0%,transparent 50%),linear-gradient(135deg,rgba(14,14,16,.95) 0%,rgba(20,20,24,.95) 100%);border:1px solid rgba(255,255,255,.15);overflow:hidden;}
    .roleta-hero::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.4),transparent);}
    .roleta-hero-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px;}
    .roleta-hero-title{font-family:'Orbitron',sans-serif;font-size:1.4rem;font-weight:900;background:linear-gradient(135deg,#fbbf24 0%,#f59e0b 50%,#dc2626 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;letter-spacing:.08em;}
    .roleta-hero-sub{font-size:.78rem;color:var(--text-mid);letter-spacing:.04em;}
    .roleta-master-btn{display:flex;align-items:center;gap:8px;padding:10px 16px;background:linear-gradient(135deg,#7c3aed 0%,#ec4899 100%);border:none;border-radius:10px;color:#fff;font-weight:700;font-size:.75rem;cursor:pointer;letter-spacing:.05em;box-shadow:0 4px 16px rgba(236,72,153,.4);transition:all .2s;}
    .roleta-master-btn:hover{transform:translateY(-2px);box-shadow:0 6px 24px rgba(236,72,153,.6);}
    .roleta-master-btn-ico{font-size:1rem;}
    .roleta-master-banner{position:relative;padding:14px 18px;margin-bottom:18px;background:linear-gradient(135deg,rgba(167,139,250,.15) 0%,rgba(236,72,153,.1) 100%);border:1px solid rgba(167,139,250,.5);border-radius:14px;overflow:hidden;}
    .roleta-master-glow{position:absolute;top:-50%;left:-50%;width:200%;height:200%;background:radial-gradient(circle,rgba(167,139,250,.3) 0%,transparent 50%);animation:roletaPulse 3s ease-in-out infinite;}
    .roleta-master-content{position:relative;display:flex;align-items:center;gap:14px;}
    .roleta-master-ico{font-size:2rem;filter:drop-shadow(0 0 8px rgba(167,139,250,.8));}
    .roleta-master-main{font-weight:800;color:#a78bfa;font-size:.92rem;letter-spacing:.05em;}
    .roleta-master-sub{font-size:.72rem;color:var(--text-mid);margin-top:2px;}
    .roleta-bonus-banner{position:relative;padding:14px 18px;margin-bottom:18px;background:linear-gradient(135deg,rgba(16,185,129,.15) 0%,rgba(34,197,94,.08) 100%);border:1px solid rgba(34,197,94,.4);border-radius:14px;overflow:hidden;}
    .roleta-bonus-glow{position:absolute;top:-50%;left:-50%;width:200%;height:200%;background:radial-gradient(circle,rgba(34,197,94,.3) 0%,transparent 50%);animation:roletaPulse 3s ease-in-out infinite;}
    @keyframes roletaPulse{0%,100%{transform:scale(1);opacity:.5;}50%{transform:scale(1.1);opacity:1;}}
    .roleta-bonus-content{position:relative;display:flex;align-items:center;gap:14px;}
    .roleta-bonus-ico{font-size:2rem;filter:drop-shadow(0 0 8px rgba(34,197,94,.6));}
    .roleta-bonus-main{font-weight:700;color:#4ade80;font-size:.92rem;}
    .roleta-bonus-main b{font-size:1.1rem;}
    .roleta-bonus-sub{font-size:.72rem;color:var(--text-mid);margin-top:2px;}
    .roleta-cooldown-banner{display:flex;align-items:center;gap:14px;padding:14px 18px;margin-bottom:18px;background:rgba(224,192,96,.08);border:1px solid rgba(224,192,96,.3);border-radius:14px;}
    .roleta-cooldown-ico{font-size:2rem;}
    .roleta-cooldown-main{font-size:.78rem;color:var(--text-mid);letter-spacing:.04em;}
    .roleta-cooldown-timer{font-family:'Orbitron',sans-serif;font-size:1.3rem;font-weight:800;color:var(--warn);letter-spacing:.05em;margin-top:2px;}
    .roleta-cooldown-hint{font-size:.68rem;color:var(--text-dim);margin-top:6px;font-style:italic;}
    .roleta-stage{position:relative;display:flex;flex-direction:column;align-items:center;padding:30px 0;}
    .roleta-wheel-wrap{position:relative;width:min(420px,92vw);aspect-ratio:1;}
    .roleta-canvas-container{position:relative;width:100%;height:100%;filter:drop-shadow(0 12px 40px rgba(0,0,0,.6));}
    #roleta-canvas{width:100%;height:100%;transition:transform 5.5s cubic-bezier(0.15,0.7,0.1,1);transform:rotate(0deg);}
    .roleta-pointer{position:absolute;top:-18px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:22px solid transparent;border-right:22px solid transparent;border-top:44px solid #fff;filter:drop-shadow(0 4px 10px rgba(0,0,0,.6)) drop-shadow(0 0 16px rgba(251,191,36,.6));z-index:10;}
    .roleta-pointer::after{content:'';position:absolute;top:-48px;left:-8px;width:16px;height:16px;background:#fbbf24;border-radius:50%;box-shadow:0 0 20px rgba(251,191,36,.8);}
    .roleta-leds{position:absolute;top:50%;left:50%;width:100%;height:100%;transform:translate(-50%,-50%);pointer-events:none;}
    .roleta-led{position:absolute;width:10px;height:10px;border-radius:50%;}
    .roleta-led.on{background:#fbbf24;box-shadow:0 0 12px #fbbf24,0 0 20px #fbbf24;}
    .roleta-led.off{background:rgba(255,255,255,.15);box-shadow:0 0 4px rgba(255,255,255,.1);}
    .roleta-spin-btn{margin-top:30px;position:relative;padding:18px 48px;background:linear-gradient(135deg,#fbbf24 0%,#f59e0b 50%,#dc2626 100%);border:none;border-radius:999px;color:#000;font-family:'Orbitron',sans-serif;font-size:1rem;font-weight:900;letter-spacing:.1em;cursor:pointer;box-shadow:0 8px 32px rgba(245,158,11,.5),inset 0 2px 0 rgba(255,255,255,.3);transition:all .2s;overflow:hidden;}
    .roleta-spin-btn::before{content:'';position:absolute;top:0;left:-100%;width:100%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.4),transparent);transition:left .6s;}
    .roleta-spin-btn:hover::before{left:100%;}
    .roleta-spin-btn:hover{transform:translateY(-2px);box-shadow:0 12px 40px rgba(245,158,11,.7),inset 0 2px 0 rgba(255,255,255,.3);}
    .roleta-spin-btn.spinning{pointer-events:none;opacity:.7;}
    .roleta-prizes{margin-top:28px;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;}
    .roleta-prize-card{position:relative;padding:18px 14px;border-radius:16px;text-align:center;overflow:hidden;transition:transform .25s;}
    .roleta-prize-card:hover{transform:translateY(-4px);}
    .roleta-prize-card::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 50% 0%,var(--card-glow) 0%,transparent 70%);opacity:.6;pointer-events:none;}
    .roleta-prize-card::after{content:'';position:absolute;top:-50%;left:-50%;width:200%;height:200%;background:linear-gradient(45deg,transparent 40%,rgba(255,255,255,.1) 50%,transparent 60%);animation:roletaShimmer 3s linear infinite;pointer-events:none;}
    @keyframes roletaShimmer{0%{transform:translateX(-50%) translateY(-50%);}100%{transform:translateX(50%) translateY(50%);}}
    .roleta-prize-icon{font-size:2.2rem;margin-bottom:8px;filter:drop-shadow(0 0 12px var(--card-glow));}
    .roleta-prize-value{font-family:'Orbitron',sans-serif;font-size:1.35rem;font-weight:900;color:var(--card-color);letter-spacing:.04em;margin-bottom:4px;text-shadow:0 0 12px var(--card-glow);}
    .roleta-prize-name{font-size:.72rem;color:var(--card-color);letter-spacing:.08em;text-transform:uppercase;font-weight:700;}
    .roleta-prize-rarity{position:absolute;top:8px;right:8px;font-size:.55rem;padding:2px 6px;border-radius:6px;font-weight:700;background:rgba(0,0,0,.5);color:var(--card-color);letter-spacing:.05em;border:1px solid var(--card-color);}
    .roleta-prize-card.common{--card-color:#4ade80;--card-glow:rgba(74,222,128,.5);background:linear-gradient(135deg,rgba(16,185,129,.12) 0%,rgba(5,150,105,.06) 100%);border:1px solid rgba(74,222,128,.4);}
    .roleta-prize-card.uncommon{--card-color:#60a5fa;--card-glow:rgba(96,165,250,.5);background:linear-gradient(135deg,rgba(59,130,246,.12) 0%,rgba(29,78,216,.06) 100%);border:1px solid rgba(96,165,250,.4);}
    .roleta-prize-card.rare{--card-color:#fbbf24;--card-glow:rgba(251,191,36,.5);background:linear-gradient(135deg,rgba(245,158,11,.12) 0%,rgba(180,83,9,.06) 100%);border:1px solid rgba(251,191,36,.4);}
    .roleta-prize-card.epic{--card-color:#f87171;--card-glow:rgba(248,113,113,.5);background:linear-gradient(135deg,rgba(239,68,68,.12) 0%,rgba(153,27,27,.06) 100%);border:1px solid rgba(248,113,113,.4);}
    .roleta-prize-card.epic2{--card-color:#a78bfa;--card-glow:rgba(167,139,250,.5);background:linear-gradient(135deg,rgba(139,92,246,.12) 0%,rgba(91,33,182,.06) 100%);border:1px solid rgba(167,139,250,.4);}
    .roleta-prize-card.legendary{--card-color:#f9a8d4;--card-glow:rgba(236,72,153,.7);background:linear-gradient(135deg,rgba(236,72,153,.18) 0%,rgba(157,23,77,.08) 100%);border:2px solid rgba(249,168,212,.6);animation:legendaryPulse 2.5s ease-in-out infinite;}
    @keyframes legendaryPulse{0%,100%{box-shadow:0 0 0 0 rgba(236,72,153,.4);}50%{box-shadow:0 0 30px 8px rgba(236,72,153,.3);}}
    .roleta-modal{position:fixed;inset:0;background:rgba(0,0,0,.85);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;}
    .roleta-result{position:relative;max-width:440px;width:100%;padding:36px 30px;background:linear-gradient(135deg,rgba(14,14,16,.98) 0%,rgba(20,20,24,.98) 100%);border-radius:24px;border:2px solid var(--result-color,#fbbf24);box-shadow:0 0 60px var(--result-glow,rgba(251,191,36,.5)),0 20px 60px rgba(0,0,0,.7);text-align:center;overflow:hidden;animation:resultEnter .5s cubic-bezier(.34,1.56,.64,1);}
    @keyframes resultEnter{0%{transform:scale(.7) translateY(40px);opacity:0;}100%{transform:scale(1) translateY(0);opacity:1;}}
    .roleta-result::before{content:'';position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,transparent,var(--result-color,#fbbf24),transparent);animation:resultShine 2s ease-in-out infinite;}
    @keyframes resultShine{0%,100%{opacity:.5;}50%{opacity:1;}}
    .roleta-result-icon{font-size:4rem;margin-bottom:12px;filter:drop-shadow(0 0 20px var(--result-glow));}
    .roleta-result-rarity{display:inline-block;padding:4px 14px;margin-bottom:14px;background:rgba(0,0,0,.4);border:1px solid var(--result-color);color:var(--result-color);border-radius:999px;font-size:.72rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;}
    .roleta-result-value{font-family:'Orbitron',sans-serif;font-size:3.2rem;font-weight:900;color:var(--result-color);margin:8px 0 16px;letter-spacing:.04em;text-shadow:0 0 30px var(--result-glow);animation:resultValuePulse 1.5s ease-in-out infinite;}
    @keyframes resultValuePulse{0%,100%{transform:scale(1);}50%{transform:scale(1.05);}}
    .roleta-result-msg{color:var(--text-mid);font-size:.88rem;line-height:1.6;margin-bottom:22px;}
    .roleta-result-msg b{color:var(--text);}
    .roleta-result-cta{padding:8px 16px;background:rgba(251,191,36,.1);border:1px dashed rgba(251,191,36,.4);border-radius:10px;font-size:.78rem;color:var(--warn);margin-bottom:20px;}
    .roleta-result-btn{padding:14px 32px;background:linear-gradient(135deg,#fff 0%,#fbbf24 100%);border:none;border-radius:999px;color:#000;font-family:'Orbitron',sans-serif;font-size:.9rem;font-weight:900;letter-spacing:.1em;cursor:pointer;box-shadow:0 8px 24px rgba(251,191,36,.4);transition:transform .2s;}
    .roleta-result-btn:hover{transform:translateY(-2px);}
    .confetti-piece{position:fixed;width:10px;height:10px;top:-10px;z-index:9998;pointer-events:none;animation:confettiFall 3s linear forwards;}
    @keyframes confettiFall{0%{transform:translateY(0) rotate(0deg);opacity:1;}100%{transform:translateY(100vh) rotate(720deg);opacity:0;}}
    .roleta-info{padding:18px 20px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.1);border-radius:14px;margin-top:20px;}
    .roleta-info-title{font-size:.78rem;font-weight:700;color:var(--accent);letter-spacing:.08em;margin-bottom:10px;text-transform:uppercase;}
    .roleta-info-text{font-size:.82rem;color:var(--text-mid);line-height:1.7;}
    .roleta-info-text b{color:var(--text);}
    .roleta-info-step{display:flex;gap:10px;align-items:flex-start;margin-bottom:8px;}
    .roleta-info-step-num{flex:0 0 24px;height:24px;background:linear-gradient(135deg,#fbbf24,#dc2626);color:#000;font-weight:800;font-size:.75rem;border-radius:50%;display:flex;align-items:center;justify-content:center;}
    .sg-price-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 14px;margin-bottom:8px;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.35);border-radius:12px;}
    .sg-price-qtd{font-weight:800;color:var(--text);font-size:.9rem;}
    .sg-price-val{font-family:'Orbitron',sans-serif;font-weight:800;color:#fbbf24;font-size:.95rem;}
    .sg-best{background:rgba(74,222,128,.1);border-color:rgba(74,222,128,.45);}
    .sg-best .sg-price-val{color:#4ade80;}
    .sg-slogan{margin-top:12px;font-family:'Orbitron',sans-serif;font-size:.82rem;font-weight:800;color:#4ade80;letter-spacing:.06em;line-height:1.5;}
    .bonus-modal{position:fixed;inset:0;background:rgba(0,0,0,.88);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;z-index:10000;padding:20px;}
    .bonus-modal-content{max-width:480px;width:100%;max-height:85vh;overflow-y:auto;padding:28px;background:linear-gradient(135deg,rgba(14,14,16,.98) 0%,rgba(20,20,24,.98) 100%);border:2px solid rgba(139,92,246,.5);border-radius:20px;box-shadow:0 0 60px rgba(139,92,246,.3);}
    .bonus-modal-title{font-family:'Orbitron',sans-serif;font-size:1.15rem;font-weight:800;background:linear-gradient(135deg,#a78bfa,#ec4899);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;text-align:center;margin-bottom:6px;letter-spacing:.08em;}
    .bonus-modal-sub{text-align:center;font-size:.78rem;color:var(--text-mid);margin-bottom:22px;}
    .bonus-user-list{display:flex;flex-direction:column;gap:8px;max-height:50vh;overflow-y:auto;padding-right:4px;}
    .bonus-user-item{display:flex;align-items:center;gap:12px;padding:12px 14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.12);border-radius:12px;cursor:pointer;transition:all .2s;}
    .bonus-user-item:hover{background:rgba(255,255,255,.06);border-color:rgba(139,92,246,.5);transform:translateX(2px);}
    .bonus-user-avatar{flex:0 0 42px;width:42px;height:42px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#ec4899);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.1rem;color:#fff;}
    .bonus-user-info{flex:1;min-width:0;}
    .bonus-user-name{font-weight:700;font-size:.92rem;color:var(--text);}
    .bonus-user-cargo{font-size:.7rem;color:var(--text-mid);margin-top:2px;}
    .bonus-user-giros{display:inline-flex;align-items:center;gap:4px;margin-top:4px;padding:2px 8px;background:rgba(74,222,128,.15);border:1px solid rgba(74,222,128,.4);border-radius:999px;font-size:.68rem;font-weight:700;color:#4ade80;}
    .bonus-modal-close{margin-top:18px;width:100%;padding:10px;background:transparent;border:1px solid rgba(255,255,255,.2);border-radius:10px;color:var(--text-mid);font-weight:600;cursor:pointer;transition:all .2s;}
    .bonus-modal-close:hover{background:rgba(255,255,255,.05);color:var(--text);}
    @media (max-width:520px){
      .roleta-hero{padding:20px 16px;}
      .roleta-hero-title{font-size:1.15rem;}
      .roleta-prizes{grid-template-columns:repeat(2,1fr);gap:10px;}
      .roleta-prize-card{padding:14px 10px;}
      .roleta-prize-icon{font-size:1.8rem;}
      .roleta-prize-value{font-size:1.1rem;}
      .roleta-prize-name{font-size:.62rem;}
      .roleta-spin-btn{padding:16px 36px;font-size:.88rem;}
      .roleta-result-value{font-size:2.4rem;}
      .roleta-result-icon{font-size:3rem;}
    }
  </style>

  <div class="roleta-hero">
    <div class="roleta-hero-header">
      <div>
        <div class="roleta-hero-title">🎰 ROLETA DA SORTE</div>
        <div class="roleta-hero-sub">1 giro/dia • +1 giro por hora extra • Master ilimitado</div>
      </div>
      ${adminBtn}
    </div>

    ${bannerMaster}
    ${bannerBonus}
    ${bannerCooldown}

    <div class="roleta-stage">
      <div class="roleta-wheel-wrap">
        <div class="roleta-pointer"></div>
        <div class="roleta-canvas-container">
          <canvas id="roleta-canvas" width="600" height="600"></canvas>
          <div class="roleta-leds" id="roleta-leds"></div>
        </div>
      </div>
      <button class="roleta-spin-btn" id="roleta-spin-btn" onclick="girarRoleta()">
        ${st.master?'👑 GIRAR (ILIMITADO)':(st.podeGirar?'🎰 GIRAR ROLETA':'🎰 OBTER GIROS')}
      </button>
    </div>

    <div class="roleta-prizes">
      ${ROLETA_PREMIOS.map(p=>`
        <div class="roleta-prize-card ${p.raridade}">
          <div class="roleta-prize-rarity">${p.raridade==='legendary'?'★ LENDÁRIO':p.nome.toUpperCase()}</div>
          <div class="roleta-prize-icon">${p.icone}</div>
          <div class="roleta-prize-value">R$ ${p.valor.toLocaleString('pt-BR')}</div>
          <div class="roleta-prize-name">${p.nome}</div>
        </div>
      `).join('')}
    </div>

    <div class="roleta-info">
      <div class="roleta-info-title">📋 Como Funciona</div>
      <div class="roleta-info-step"><div class="roleta-info-step-num">1</div><div class="roleta-info-text">Gire a roleta <b>1x por dia</b> (ou use giros bônus)</div></div>
      <div class="roleta-info-step"><div class="roleta-info-step-num">2</div><div class="roleta-info-text"><b>+1 giro bônus</b> a cada hora extra trabalhada no ponto</div></div>
      <div class="roleta-info-step"><div class="roleta-info-step-num">3</div><div class="roleta-info-text">Ao ganhar, <b>tire um print</b> e envie no Chat para validar</div></div>
    </div>
  </div>`;
}

function desenharRoleta(){
  const canvas=document.getElementById('roleta-canvas');
  if(!canvas)return;
  const ctx=canvas.getContext('2d');
  const W=canvas.width,H=canvas.height;
  const cx=W/2,cy=H/2;
  const raio=W/2-20;
  ctx.clearRect(0,0,W,H);
  ctx.save();
  ctx.translate(cx,cy);
  const numFatias=ROLETA_PREMIOS.length;
  const angFatia=(2*Math.PI)/numFatias;
  const gradAnel=ctx.createRadialGradient(0,0,raio-10,0,0,raio+8);
  gradAnel.addColorStop(0,'#fbbf24');gradAnel.addColorStop(0.5,'#f59e0b');gradAnel.addColorStop(1,'#78350f');
  ctx.fillStyle=gradAnel;
  ctx.beginPath();ctx.arc(0,0,raio+8,0,2*Math.PI);ctx.fill();
  ROLETA_PREMIOS.forEach((p,i)=>{
    const ini=i*angFatia-Math.PI/2;
    const fim=ini+angFatia;
    const grad=ctx.createRadialGradient(0,0,0,0,0,raio);
    grad.addColorStop(0,p.cor2);grad.addColorStop(0.6,p.cor);grad.addColorStop(1,p.cor);
    ctx.fillStyle=grad;
    ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,raio,ini,fim);ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,.4)';ctx.lineWidth=2;ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,.3)';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(ini)*raio,Math.sin(ini)*raio);ctx.stroke();
  });
  ctx.textAlign='center';ctx.textBaseline='middle';
  ROLETA_PREMIOS.forEach((p,i)=>{
    const ang=i*angFatia+angFatia/2-Math.PI/2;
    ctx.save();ctx.rotate(ang);
    ctx.font='48px system-ui, sans-serif';
    ctx.fillText(p.icone,raio*0.62,0);
    ctx.fillStyle='#fff';ctx.shadowColor='rgba(0,0,0,.8)';ctx.shadowBlur=6;
    ctx.font='bold 32px "Orbitron", system-ui, sans-serif';
    ctx.fillText('R$ '+p.valor.toLocaleString('pt-BR'),raio*0.36,0);
    ctx.shadowBlur=0;ctx.restore();
  });
  const gradCentro=ctx.createRadialGradient(0,0,0,0,0,60);
  gradCentro.addColorStop(0,'#fbbf24');gradCentro.addColorStop(0.5,'#dc2626');gradCentro.addColorStop(1,'#7f1d1d');
  ctx.fillStyle=gradCentro;
  ctx.beginPath();ctx.arc(0,0,55,0,2*Math.PI);ctx.fill();
  ctx.strokeStyle='#fbbf24';ctx.lineWidth=4;ctx.stroke();
  ctx.strokeStyle='rgba(255,255,255,.5)';ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle='#fff';ctx.shadowColor='rgba(0,0,0,.8)';ctx.shadowBlur=4;
  ctx.font='bold 28px "Orbitron", system-ui';ctx.fillText('GMPOL',0,-6);
  ctx.font='600 14px system-ui';ctx.fillText('SORTE',0,14);
  ctx.shadowBlur=0;
  ctx.restore();
}

function inicializarLEDs(){
  const wrap=document.getElementById('roleta-leds');
  if(!wrap||wrap.children.length>0)return;
  const numLeds=20;
  for(let i=0;i<numLeds;i++){
    const led=document.createElement('div');
    led.className='roleta-led off';
    const ang=(i/numLeds)*360;
    const angRad=(ang-90)*Math.PI/180;
    const x=50+Math.cos(angRad)*50;
    const y=50+Math.sin(angRad)*50;
    led.style.left=x+'%';led.style.top=y+'%';
    led.style.transform='translate(-50%,-50%)';
    wrap.appendChild(led);
  }
  animarLEDs();
}

let _ledInterval=null;
function animarLEDs(){
  if(_ledInterval)clearInterval(_ledInterval);
  const leds=document.querySelectorAll('.roleta-led');
  if(!leds.length)return;
  let frame=0;
  _ledInterval=setInterval(()=>{
    leds.forEach((led,i)=>{led.className='roleta-led '+(((i+frame)%3===0)?'on':'off');});
    frame++;
  },300);
}

let _cdInterval=null;
function iniciarTimerCooldown(){
  if(_cdInterval)clearInterval(_cdInterval);
  if(!document.getElementById('roleta-cd-timer'))return;
  const tick=()=>{
    const el=document.getElementById('roleta-cd-timer');
    if(!el||!me){clearInterval(_cdInterval);_cdInterval=null;return;}
    const st=_roletaStatus();
    if(st.podeGirar){clearInterval(_cdInterval);_cdInterval=null;renderTab(activeTab);return;}
    const h=Math.floor(st.resta/3600000),m=Math.floor((st.resta%3600000)/60000),s=Math.floor((st.resta%60000)/1000);
    el.textContent=h>0?`${h}h ${m}m ${s}s`:`${m}m ${s}s`;
  };
  tick();
  _cdInterval=setInterval(tick,1000);
}

function inicializarRoleta(){
  desenharRoleta();
  inicializarLEDs();
  iniciarTimerCooldown();
}

let _roletaGirando=false;
async function girarRoleta(){
  if(_roletaGirando)return;
  const st=_roletaStatus();
  // ══ SEM GIROS: abre o modal de "comprar giros" ══
  if(!st.podeGirar){mostrarModalSemGiros();return;}
  _roletaGirando=true;
  const btn=document.getElementById('roleta-spin-btn');
  if(btn){btn.classList.add('spinning');btn.disabled=true;}

  const totalPeso=ROLETA_PREMIOS.reduce((s,p)=>s+p.peso,0);
  let random=Math.random()*totalPeso;
  let premio=ROLETA_PREMIOS[0],idxPremio=0;
  for(let i=0;i<ROLETA_PREMIOS.length;i++){
    random-=ROLETA_PREMIOS[i].peso;
    if(random<=0){premio=ROLETA_PREMIOS[i];idxPremio=i;break;}
  }

  const numFatias=ROLETA_PREMIOS.length;
  const angFatia=360/numFatias;
  const centroFatia=idxPremio*angFatia+angFatia/2;
  const voltas=7+Math.floor(Math.random()*3);
  const offsetAleatorio=(Math.random()-0.5)*angFatia*0.6;
  const anguloFinal=voltas*360+(360-centroFatia)+offsetAleatorio;

  const canvas=document.getElementById('roleta-canvas');
  if(!canvas){_roletaGirando=false;return;}
  canvas.style.transition='none';
  canvas.style.transform='rotate(0deg)';
  canvas.offsetHeight;
  canvas.style.transition='transform 5.5s cubic-bezier(0.15,0.7,0.1,1)';
  canvas.style.transform=`rotate(${anguloFinal}deg)`;
  try{tocarSomRoleta();}catch(_){}

  setTimeout(async()=>{
    try{
      const res=await API.girarRoleta(me.user);
      if(res&&res.ok){
        if(typeof res.girosBonus==='number')me.girosBonus=res.girosBonus;
        if(res.ultimoGiro)me.ultimoGiroRoleta=res.ultimoGiro;
        saveSession();
        mostrarResultadoRoleta(premio);
        if(premio.valor>=2000)lancarConfete();
      }else{
        toast((res&&res.error)||'Não foi possível registrar o giro.','w');
        _reverterRoda();
      }
    }catch(e){
      toast(e.message||'Erro ao registrar giro.','d');
      _reverterRoda();
    }finally{
      _roletaGirando=false;
      renderTab(activeTab);
    }
  },5600);
}

function _reverterRoda(){
  const canvas=document.getElementById('roleta-canvas');
  if(canvas){canvas.style.transition='transform .6s ease-out';canvas.style.transform='rotate(0deg)';}
}

// ════════════════════════════════════════════════════════════
// ══ MODAL "SEM GIROS" — COMPRA DE GIROS (NOVO) ════════════
// ════════════════════════════════════════════════════════════
let _semGirosInterval=null;

function mostrarModalSemGiros(){
  fecharModalSemGiros();
  const modal=document.createElement('div');
  modal.className='roleta-modal';
  modal.id='sem-giros-modal';
  modal.innerHTML=`
    <div class="roleta-result" style="--result-color:#fbbf24;--result-glow:rgba(251,191,36,.45);max-width:470px;">
      <div class="roleta-result-icon">😔</div>
      <div class="roleta-result-rarity">VOCÊ FICOU SEM GIROS</div>
      <div style="font-size:.85rem;color:var(--text-mid);margin-bottom:4px;">Aguarde:</div>
      <div class="roleta-result-value" id="sg-timer" style="font-size:2.3rem;margin:4px 0 18px;">--:--:--</div>
      <div style="border-top:1px dashed rgba(251,191,36,.4);padding-top:16px;margin-bottom:14px;">
        <div style="font-family:'Orbitron',sans-serif;font-size:1rem;font-weight:800;color:var(--text);margin-bottom:12px;">Quer obter mais giros?</div>
        <div class="sg-price-row"><span class="sg-price-qtd">1 giro</span><span class="sg-price-val">R$ 500 no RP</span></div>
        <div class="sg-price-row"><span class="sg-price-qtd">5 giros</span><span class="sg-price-val">R$ 2.500</span></div>
        <div class="sg-price-row sg-best"><span class="sg-price-qtd">10 giros</span><span class="sg-price-val">R$ 5.000</span></div>
        <div class="sg-slogan">INVESTIMENTO FÁCIL<br>PARA DINHEIRO FÁCIL 🤑</div>
      </div>
      <div class="roleta-result-cta">💸 Pague o valor em dinheiro no RP e <b>mande o print para um Admin (Master)</b> para receber seus giros na hora.</div>
      <button class="roleta-result-btn" onclick="fecharModalSemGiros()">✓ ENTENDI</button>
    </div>`;
  document.body.appendChild(modal);
  try{tocarSomRoleta();}catch(_){}
  const tick=()=>{
    const modalEl=document.getElementById('sem-giros-modal');
    if(!modalEl){clearInterval(_semGirosInterval);_semGirosInterval=null;return;}
    const st=_roletaStatus();
    if(st.podeGirar){clearInterval(_semGirosInterval);_semGirosInterval=null;fecharModalSemGiros();return;}
    const el=document.getElementById('sg-timer');
    if(!el)return;
    const r=st.resta;
    const h=Math.floor(r/3600000),m=Math.floor((r%3600000)/60000),s=Math.floor((r%60000)/1000);
    el.textContent=`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  };
  tick();
  _semGirosInterval=setInterval(tick,1000);
}

function fecharModalSemGiros(){
  if(_semGirosInterval){clearInterval(_semGirosInterval);_semGirosInterval=null;}
  const m=document.getElementById('sem-giros-modal');
  if(m)m.remove();
}

function tocarSomRoleta(){
  try{
    const ctx=new (window.AudioContext||window.webkitAudioContext)();
    const osc=ctx.createOscillator();const gain=ctx.createGain();
    osc.connect(gain);gain.connect(ctx.destination);
    osc.frequency.value=600;osc.type='triangle';
    gain.gain.setValueAtTime(0.0001,ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.1,ctx.currentTime+0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+0.15);
    osc.start();osc.stop(ctx.currentTime+0.16);
  }catch(_){}
}

function mostrarResultadoRoleta(premio){
  const agora=new Date();
  const dataHora=agora.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const giroId='GIR-'+agora.getTime()+'-'+Math.random().toString(36).slice(2,6).toUpperCase();
  
  const modal=document.createElement('div');modal.className='roleta-modal';
  modal.innerHTML=`<div class="roleta-result" style="--result-color:${premio.corBorda};--result-glow:${premio.corBorda}40;">
    <div class="roleta-result-icon">${premio.icone}</div>
    <div class="roleta-result-rarity">${premio.nome.toUpperCase()}</div>
    <div class="roleta-result-value">R$ ${premio.valor.toLocaleString('pt-BR')}</div>
    <div class="roleta-result-msg"><b>🎉 PARABÉNS!</b><br>Você ganhou um prêmio <b>${premio.nome}</b>!</div>
    <div style="background:rgba(0,0,0,.3);border:1px dashed rgba(251,191,36,.4);border-radius:10px;padding:12px 16px;margin-bottom:16px;text-align:left;">
      <div style="font-family:'Share Tech Mono',monospace;font-size:.68rem;color:var(--text-dim);letter-spacing:.08em;margin-bottom:4px;">DATA E HORA</div>
      <div style="font-family:'Orbitron',sans-serif;font-size:.95rem;font-weight:800;color:#fbbf24;margin-bottom:8px;">📅 ${dataHora}</div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:.62rem;color:var(--text-dim);letter-spacing:.08em;margin-bottom:4px;">ID DO GIRO</div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:.78rem;color:var(--text);letter-spacing:.05em;">#${giroId}</div>
    </div>
    <div class="roleta-result-cta">📸 Tire um PRINT mostrando <b>DATA/HORA e ID</b> e envie no Chat para validar</div>
    <button class="roleta-result-btn" onclick="fecharResultadoRoleta(this)">✓ ENTENDI</button>
  </div>`;
  document.body.appendChild(modal);
  try{tocarSomVitoria();}catch(_){}
  toast(`🎉 Você ganhou R$ ${premio.valor.toLocaleString('pt-BR')}! Envie o print com data/hora no chat.`,'s',10000);
}

function tocarSomVitoria(){
  try{
    const ctx=new (window.AudioContext||window.webkitAudioContext)();
    [523.25,659.25,783.99,1046.50].forEach((freq,i)=>{
      const osc=ctx.createOscillator();const gain=ctx.createGain();
      osc.connect(gain);gain.connect(ctx.destination);
      osc.frequency.value=freq;osc.type='triangle';
      const t=ctx.currentTime+i*0.12;
      gain.gain.setValueAtTime(0.0001,t);
      gain.gain.exponentialRampToValueAtTime(0.12,t+0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001,t+0.25);
      osc.start(t);osc.stop(t+0.26);
    });
  }catch(_){}
}

function lancarConfete(){
  const cores=['#fbbf24','#ec4899','#8b5cf6','#4ade80','#60a5fa','#f87171','#fff'];
  for(let i=0;i<80;i++){
    const p=document.createElement('div');
    p.className='confetti-piece';
    p.style.left=(Math.random()*100)+'vw';
    p.style.background=cores[Math.floor(Math.random()*cores.length)];
    p.style.animationDelay=(Math.random()*0.8)+'s';
    p.style.animationDuration=(2.5+Math.random()*2)+'s';
    p.style.width=(6+Math.random()*8)+'px';
    p.style.height=(6+Math.random()*8)+'px';
    if(Math.random()>0.5)p.style.borderRadius='50%';
    document.body.appendChild(p);
    setTimeout(()=>p.remove(),5000);
  }
}

function fecharResultadoRoleta(btn){
  const modal=btn.closest('.roleta-modal');
  if(modal)modal.remove();
  renderTab(activeTab);
}

function abrirModalBonus(){
  if(!isMaster())return;
  const usuarios=STATE.users.filter(u=>ROLETA_CARGOS_PERMITIDOS.includes(u.cargo)&&u.ativo!==false);
  const modal=document.createElement('div');
  modal.className='bonus-modal';
  modal.id='bonus-modal';
  modal.innerHTML=`
    <div class="bonus-modal-content">
      <div class="bonus-modal-title">🎁 LIBERAR GIROS BÔNUS</div>
      <div class="bonus-modal-sub">Selecione um usuário e informe a quantidade de giros</div>
      <div class="bonus-user-list">
        ${usuarios.length===0?'<div style="text-align:center;padding:20px;color:var(--text-dim);font-size:.85rem;">Nenhum usuário elegível.</div>':
        usuarios.map(u=>{
          const g=(typeof u.girosBonus==='number')?u.girosBonus:0;
          return `
            <div class="bonus-user-item" onclick="selecionarUsuarioBonus('${u.user}','${u.nome.replace(/'/g,"\\'")}')">
              <div class="bonus-user-avatar">${u.nome.charAt(0).toUpperCase()}</div>
              <div class="bonus-user-info">
                <div class="bonus-user-name">${u.nome}</div>
                <div class="bonus-user-cargo">${CARGO_LABEL[u.cargo]||u.cargo}</div>
                ${g>0?`<div class="bonus-user-giros">🎁 ${g} bônus</div>`:''}
              </div>
            </div>`;
        }).join('')}
      </div>
      <button class="bonus-modal-close" onclick="fecharModalBonus()">FECHAR</button>
    </div>`;
  document.body.appendChild(modal);
}

async function selecionarUsuarioBonus(user,nome){
  if(!isMaster())return;
  const giros=prompt(`Quantos giros bônus deseja liberar para ${nome}?\n\nDigite um número:`);
  if(!giros)return;
  const num=parseInt(giros);
  if(isNaN(num)||num<1){toast('Digite um número válido maior que 0.','w');return;}
  if(num>100){toast('Máximo de 100 giros por vez.','w');return;}
  try{
    const res=await API.liberarGiros(user,num,me.user);
    if(res&&res.ok){
      toast(`✅ ${num} giro(s) bônus liberado(s) para ${nome}!`,'s',6000);
      fecharModalBonus();
      if(user===me.user)renderTab(activeTab);
    }else{
      toast((res&&res.error)||'Erro ao liberar giros.','d');
    }
  }catch(e){
    toast('Erro: '+(e.message||'Tente novamente.'),'d');
  }
}

function fecharModalBonus(){
  const modal=document.getElementById('bonus-modal');
  if(modal)modal.remove();
}

// ════════════════════════════════════════════════════════════
// ══ CHAT PRIVADO 1:1 ═══════════════════════════════════
// ════════════════════════════════════════════════════════════
const CHAT_LS_KEY='gmpol_chat_lidos_v1';
function _lerLidos(){try{return JSON.parse(localStorage.getItem(CHAT_LS_KEY)||'{}');}catch(_){return{};}}
function _salvarLido(obj){try{localStorage.setItem(CHAT_LS_KEY,JSON.stringify(obj));}catch(_){}}
function contarMensagensNaoLidas(){
  if(!me)return 0;
  const lidos=_lerLidos();
  let total=0;
  (STATE.chats||[]).forEach(m=>{
    if(m.to===me.user&&m.from!==me.user){
      if(!lidos[m.id]){total++;}
    }
  });
  return total;
}
function _marcarConversaComoLida(outroUser){
  const lidos=_lerLidos();
  let mudou=false;
  (STATE.chats||[]).forEach(m=>{
    if(m.from===outroUser&&m.to===me.user&&!lidos[m.id]){lidos[m.id]=1;mudou=true;}
  });
  if(mudou){_salvarLido(lidos);updateNotif();}
}

function vChat(){
  return `<div class="stitle">▸ CHAT PRIVADO</div>
    <div id="chat-container" class="chat-container">
      <div id="chat-view-lista" class="chat-view chat-view-lista">
        <div class="chat-card">
          <div class="chat-card-head">
            <div style="font-family:'Orbitron',sans-serif;font-size:.72rem;color:var(--accent);letter-spacing:.14em;">CONTATOS</div>
          </div>
          <div class="chat-busca-wrap">
            <input id="chat-busca" placeholder="Buscar contato…" oninput="renderChatListaContatos()">
          </div>
          <div id="chat-lista" class="chat-scroll"></div>
        </div>
      </div>
      <div id="chat-view-conversa" class="chat-view chat-view-conversa">
        <div class="chat-card">
          <div id="chat-header" class="chat-card-head">
            <button type="button" class="chat-voltar" onclick="voltarParaLista()" aria-label="Voltar">‹</button>
            <span style="color:var(--text-dim);font-size:.85rem;">Selecione um contato</span>
          </div>
          <div id="chat-msgs" class="chat-scroll chat-msgs-area"></div>
          <div id="chat-input-wrap" class="chat-input-wrap">
            <textarea id="chat-input" placeholder="Digite uma mensagem…" onkeydown="chatInputKeydown(event)"></textarea>
            <button type="button" class="btn btn-primary chat-send" onclick="enviarMsgChat()">➤</button>
          </div>
        </div>
      </div>
    </div>
    <style>
      .chat-container{position:relative;display:grid;grid-template-columns:300px 1fr;gap:14px;height:calc(100vh - 215px);min-height:460px;}
      @supports (height:100dvh){.chat-container{height:calc(100dvh - 215px);}}
      .chat-card{height:100%;display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--border);border-radius:14px;overflow:hidden;min-height:0;}
      .chat-card-head{flex:0 0 auto;padding:12px 14px;border-bottom:1px solid var(--border);background:rgba(255,255,255,.02);display:flex;align-items:center;gap:8px;min-height:52px;}
      .chat-busca-wrap{flex:0 0 auto;padding:8px 10px;border-bottom:1px solid var(--border);}
      .chat-busca-wrap input{width:100%;font-size:.82rem;padding:8px 10px;}
      .chat-scroll{flex:1 1 auto;overflow-y:auto;min-height:0;-webkit-overflow-scrolling:touch;}
      .chat-msgs-area{padding:14px;background:rgba(0,0,0,.22);}
      .chat-input-wrap{flex:0 0 auto;display:none;gap:8px;align-items:flex-end;padding:10px;border-top:1px solid var(--border);background:rgba(255,255,255,.02);padding-bottom:calc(10px + env(safe-area-inset-bottom,0px));}
      .chat-input-wrap textarea{flex:1;min-height:42px;max-height:110px;resize:none;font-size:.9rem;padding:10px 12px;line-height:1.4;}
      .chat-send{flex:0 0 auto;padding:10px 16px;font-size:1rem;}
      .chat-voltar{background:none;border:none;color:var(--accent);font-size:1.6rem;line-height:1;cursor:pointer;padding:2px 10px 2px 4px;margin-left:-6px;}
      .chat-item{display:flex;align-items:center;gap:10px;padding:11px 12px;cursor:pointer;transition:background .15s;border-bottom:1px solid var(--border);}
      .chat-item:hover{background:rgba(255,255,255,.04);}
      .chat-item.ativo{background:rgba(255,255,255,.08);box-shadow:inset 3px 0 0 var(--accent);}
      .chat-item-avatar{width:38px;height:38px;border-radius:10px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;background:var(--surface2);border:1px solid var(--border2);font-weight:700;font-size:.9rem;}
      .chat-item-body{flex:1;min-width:0;}
      .chat-item-top{display:flex;justify-content:space-between;gap:6px;align-items:center;}
      .chat-item-nome{font-size:.88rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .chat-item-prev{font-size:.72rem;color:var(--text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;}
      .chat-nao-lido{min-width:18px;height:18px;padding:0 5px;background:var(--danger);color:#fff;border-radius:9px;font-size:.62rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex:0 0 auto;}
      .chat-msg-wrap{display:flex;margin-bottom:8px;}
      .chat-msg-wrap.enviada{justify-content:flex-end;}
      .chat-msg-wrap.recebida{justify-content:flex-start;}
      .chat-msg-col{max-width:78%;}
      .chat-msg{padding:8px 12px;border-radius:16px;font-size:.9rem;line-height:1.45;word-wrap:break-word;overflow-wrap:anywhere;}
      .chat-msg.enviada{background:rgba(74,222,128,.16);border:1px solid rgba(74,222,128,.28);border-bottom-right-radius:4px;}
      .chat-msg.recebida{background:rgba(255,255,255,.06);border:1px solid var(--border2);border-bottom-left-radius:4px;}
      .chat-msg-time{font-family:'Share Tech Mono',monospace;font-size:.58rem;color:var(--text-dim);margin-top:2px;text-align:right;}
      @media (max-width:768px){
        body.chat-mode{overflow:hidden !important;}
        body.chat-mode #s-panel{height:100vh;height:100dvh;min-height:0;overflow:hidden !important;}
        .content.chat-mode{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow:hidden;padding:8px 8px 10px !important;max-width:100%;}
        .content.chat-mode .stitle{flex:0 0 auto;margin-bottom:8px;}
        .chat-container{display:block;position:relative;flex:1 1 auto;min-height:0;height:auto !important;}
        .chat-view{position:absolute;top:0;left:0;right:0;bottom:0;display:none;}
        .chat-view-lista{display:block;}
        .chat-view-lista.escondido{display:none;}
        .chat-view-conversa.ativo{display:block;}
        .chat-card{border-radius:12px;}
        .chat-msg-col{max-width:86%;}
        .chat-voltar{display:inline-block;}
      }
      @media (min-width:769px){
        .chat-view{position:static;display:block !important;}
        .chat-view-lista.escondido{display:block !important;}
        .chat-voltar{display:none !important;}
      }
    </style>`;
}

function renderChatListaContatos(){
  const lista=document.getElementById('chat-lista');
  if(!lista||!me)return;
  const busca=(document.getElementById('chat-busca')?.value||'').toLowerCase().trim();
  const outros=STATE.users.filter(u=>u.user!==me.user&&u.ativo!==false).sort((a,b)=>(a.nome||'').localeCompare(b.nome||''));
  const ultimaMsg={};
  (STATE.chats||[]).forEach(m=>{
    if(m.from===me.user||m.to===me.user){
      const outro=m.from===me.user?m.to:m.from;
      if(!ultimaMsg[outro]||m.ts>ultimaMsg[outro].ts)ultimaMsg[outro]=m;
    }
  });
  outros.sort((a,b)=>{
    const ta=ultimaMsg[a.user]?.ts||0;
    const tb=ultimaMsg[b.user]?.ts||0;
    return tb-ta;
  });
  const filtrados=busca?outros.filter(u=>(u.nome||'').toLowerCase().includes(busca)||(u.user||'').toLowerCase().includes(busca)):outros;
  if(!filtrados.length){lista.innerHTML='<div style="padding:24px;text-align:center;color:var(--text-dim);font-size:.8rem;">Nenhum contato encontrado.</div>';return;}
  const lidos=_lerLidos();
  lista.innerHTML=filtrados.map(u=>{
    const ult=ultimaMsg[u.user];
    const preview=ult?((ult.from===me.user?'Você: ':'')+ult.texto.slice(0,34)+(ult.texto.length>34?'…':'')):'';
    const naoLidas=(STATE.chats||[]).filter(m=>m.from===u.user&&m.to===me.user&&!lidos[m.id]).length;
    const ativo=_chatContatoAtual===u.user?'ativo':'';
    return `<div class="chat-item ${ativo}" onclick="abrirChatCom('${u.user}')">
      <div class="chat-item-avatar">${(u.nome||'?').charAt(0).toUpperCase()}</div>
      <div class="chat-item-body">
        <div class="chat-item-top">
          <span class="chat-item-nome">${u.nome}</span>
          <span class="cargo-badge ${CARGO_BADGE_CLASS[u.cargo]||''}" style="font-size:.48rem;padding:2px 6px;">${CARGO_LABEL[u.cargo]||''}</span>
        </div>
        <div class="chat-item-prev">${preview||'<i>sem mensagens</i>'}</div>
      </div>
      ${naoLidas>0?`<div class="chat-nao-lido">${naoLidas>99?'99+':naoLidas}</div>`:''}
    </div>`;
  }).join('');
}

function abrirChatCom(userLogin){
  _chatContatoAtual=userLogin;
  _marcarConversaComoLida(userLogin);
  const u=STATE.users.find(x=>x.user===userLogin);
  const header=document.getElementById('chat-header');
  if(header&&u){
    header.innerHTML=`<button type="button" class="chat-voltar" onclick="voltarParaLista()" aria-label="Voltar">‹</button>
      <div class="chat-item-avatar" style="width:36px;height:36px;font-size:.85rem;">${u.nome.charAt(0).toUpperCase()}</div>
      <div style="min-width:0;">
        <div style="font-weight:700;font-size:.92rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${u.nome}</div>
        <div style="font-size:.66rem;color:var(--text-mid);">${CARGO_LABEL[u.cargo]||u.cargo} • @${u.user}</div>
      </div>`;
  }
  const inputWrap=document.getElementById('chat-input-wrap');
  if(inputWrap)inputWrap.style.display='flex';
  const viewLista=document.getElementById('chat-view-lista');
  const viewConversa=document.getElementById('chat-view-conversa');
  if(viewLista&&viewConversa&&window.matchMedia('(max-width:768px)').matches){
    viewLista.classList.add('escondido');
    viewConversa.classList.add('ativo');
  }
  renderChatListaContatos();
  renderChatMensagens();
  setTimeout(()=>{scrollChatBottom();const inp=document.getElementById('chat-input');if(inp)inp.focus();},80);
}

function voltarParaLista(){
  _chatContatoAtual=null;
  const viewLista=document.getElementById('chat-view-lista');
  const viewConversa=document.getElementById('chat-view-conversa');
  if(viewLista&&viewConversa){
    viewLista.classList.remove('escondido');
    viewConversa.classList.remove('ativo');
  }
  const inputWrap=document.getElementById('chat-input-wrap');
  if(inputWrap)inputWrap.style.display='none';
  renderChatListaContatos();
}

function renderChatMensagens(){
  const area=document.getElementById('chat-msgs');
  if(!area)return;
  if(!me||!_chatContatoAtual){
    area.innerHTML='<div style="text-align:center;padding:40px 20px;color:var(--text-dim);font-size:.85rem;">Selecione um contato ao lado para ver a conversa</div>';
    return;
  }
  const msgs=(STATE.chats||[]).filter(m=>
    (m.from===me.user&&m.to===_chatContatoAtual)||(m.from===_chatContatoAtual&&m.to===me.user)
  ).sort((a,b)=>a.ts-b.ts);
  if(!msgs.length){
    area.innerHTML='<div style="text-align:center;padding:40px 20px;color:var(--text-dim);font-size:.85rem;">Nenhuma mensagem ainda.<br><span style="font-size:.72rem;">Envie a primeira!</span></div>';
    return;
  }
  area.innerHTML=msgs.map(m=>{
    const enviada=m.from===me.user;
    const cls=enviada?'enviada':'recebida';
    const textoSafe=(m.texto||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
    return `<div class="chat-msg-wrap ${cls}">
      <div class="chat-msg-col">
        <div class="chat-msg ${cls}">${textoSafe}</div>
        <div class="chat-msg-time">${fmtChatTime(m.ts)}${enviada?' ✓':''}</div>
      </div>
    </div>`;
  }).join('');
  scrollChatBottom();
}

function scrollChatBottom(){
  const area=document.getElementById('chat-msgs');
  if(area)area.scrollTop=area.scrollHeight;
}

function chatInputKeydown(ev){
  if(ev.key==='Enter'&&!ev.shiftKey){ev.preventDefault();enviarMsgChat();}
}

async function enviarMsgChat(){
  if(!me||!_chatContatoAtual)return;
  const input=document.getElementById('chat-input');
  if(!input)return;
  const texto=input.value.trim();
  if(!texto)return;
  if(texto.length>2000){toast('Mensagem muito longa (máx 2000 caracteres).','w');return;}
  input.value='';
  try{
    await API.sendChatMsg(me.user,_chatContatoAtual,texto);
    renderChatListaContatos();
    renderChatMensagens();
  }catch(e){
    toast(e.message||'Erro ao enviar mensagem.','d');
    input.value=texto;
  }
}

function startChatPolling(){stopChatPolling();_chatTimer=setInterval(()=>{if(activeTab===getTabIdx('chat')&&_chatContatoAtual){renderChatListaContatos();}},3000);}
function stopChatPolling(){if(_chatTimer){clearInterval(_chatTimer);_chatTimer=null;}}

function _tocarNotifChat(){
  try{
    const ctx=new (window.AudioContext||window.webkitAudioContext)();
    const osc=ctx.createOscillator();const gain=ctx.createGain();
    osc.connect(gain);gain.connect(ctx.destination);
    osc.frequency.value=880;osc.type='sine';
    gain.gain.setValueAtTime(0.0001,ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15,ctx.currentTime+0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+0.25);
    osc.start();osc.stop(ctx.currentTime+0.26);
  }catch(_){}
}

function openModal(id){document.getElementById(id)?.classList.add('open');}
function closeModal(id){document.getElementById(id)?.classList.remove('open');}
function toggleSettings(){document.getElementById('settings-menu')?.classList.toggle('open');}
function closeSettings(){document.getElementById('settings-menu')?.classList.remove('open');}
document.addEventListener('click',e=>{const menu=document.getElementById('settings-menu'),btn=document.querySelector('.settings-btn');if(menu&&!menu.contains(e.target)&&e.target!==btn)closeSettings();if(e.target.classList.contains('modal-overlay'))e.target.classList.remove('open');});
function toast(txt,type='i',duration=3800){const c=document.getElementById('toast-container'),t=document.createElement('div');t.className='toast '+type;t.innerHTML='<span>'+txt+'</span>';c.appendChild(t);setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),400);},duration);}
function empty(ico,txt){return'<div class="empty"><div class="empty-ico">'+ico+'</div><p>'+txt+'</p></div>';}

window.onload=()=>{initWebSocket();checkSession();};
