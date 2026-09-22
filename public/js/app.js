// ════════════════════════════════════════════════════════════
// ══ VIP LED RGB — anel via border-box conic (NUNCA torto) ══
// ════════════════════════════════════════════════════════════
(function(){
  if(document.getElementById('vip-led-css'))return;
  const st=document.createElement('style');
  st.id='vip-led-css';
  st.textContent=`
    @property --vipang{syntax:'<angle>';initial-value:0deg;inherits:false;}
    @keyframes vipSpin2{to{--vipang:360deg;}}
    @keyframes vipPulse{
      0%,100%{box-shadow:0 0 14px rgba(255,0,76,.40),0 0 30px rgba(0,213,255,.25);}
      33%{box-shadow:0 0 14px rgba(0,255,133,.40),0 0 30px rgba(255,230,0,.25);}
      66%{box-shadow:0 0 14px rgba(123,0,255,.40),0 0 30px rgba(255,0,212,.25);}
    }
    @keyframes vipPulseRed{
      0%,100%{box-shadow:0 0 16px rgba(255,0,0,.45),0 0 34px rgba(255,0,0,.22);}
      50%{box-shadow:0 0 24px rgba(255,60,60,.65),0 0 46px rgba(255,0,0,.35);}
    }
    /* ══ Anel RGB UNIFORME via border-box conic — NUNCA torto ══ */
    .vip-led{position:relative;overflow:hidden;border:4px solid transparent !important;background:linear-gradient(#0e0e10,#0e0e10) padding-box, conic-gradient(from var(--vipang),#ff004c,#ff7b00,#ffe600,#00ff85,#00d5ff,#7b00ff,#ff00d4,#ff004c) border-box !important;animation:vipSpin2 4s linear infinite, vipPulse 3s ease-in-out infinite !important;}
    /* ══ Avatar: foto ENCAIXADA dentro do anel ══ */
    .vip-led-avatar{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;padding:4px;border:4px solid transparent !important;background:linear-gradient(#17171a,#17171a) padding-box, conic-gradient(from var(--vipang),#ff004c,#ff7b00,#ffe600,#00ff85,#00d5ff,#7b00ff,#ff00d4,#ff004c) border-box !important;animation:vipSpin2 3s linear infinite, vipPulse 2.6s ease-in-out infinite !important;}
    .vip-led-avatar>img{position:static !important;inset:auto !important;width:100% !important;height:100% !important;object-fit:cover !important;border-radius:10px !important;display:block !important;}
    .vip-letter{display:flex;width:100%;height:100%;align-items:center;justify-content:center;font-weight:800;}
    /* ══ Modal gigante: contorno VERMELHO correndo ══ */
    .vip-led-red{background:linear-gradient(#0e0e10,#0e0e10) padding-box, conic-gradient(from var(--vipang),#ff0000,#ff5555,#ff0000,#cc0000,#ff2222,#ff0000) border-box !important;animation:vipSpin2 3.2s linear infinite, vipPulseRed 2.6s ease-in-out infinite !important;}
  `;
  document.head.appendChild(st);
})();

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
  const d=new Date(ts);const hoje=brDate();const diaMsg=brDateOf(ts);
  const h=d.toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'});
  if(diaMsg===hoje)return h;
  const ontem=new Date(Date.now()-86400000);
  if(diaMsg===brDateOf(ontem.getTime()))return 'Ontem '+h;
  return diaMsg+' '+h;
}

let me=null,activeTab=0;
let STATE={ocs:[],puns:[],pontos:[],provas:[],users:[],audit:[],feedbacks:[],chats:[],prisoes:[],roletaPremios:[]};
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

// ═══ Não re-renderiza aba se há prova ativa ═══
function renderTabSafe(idx){
  if(_provaAtiva){
    if(typeof updateNotif==='function')updateNotif();
    return;
  }
  renderTab(idx);
}

function handleSocketMessage(data){
  const{type,payload}=data;
  switch(type){
    case 'INIT':updateNotif();if(me)renderTabSafe(activeTab);break;
    case 'NEW_OC':updateNotif();renderTabSafe(activeTab);if(me&&payload.delegadoUser!==me.user)toast('Nova ocorrência: '+payload.id,'w');break;
    case 'OC_UPDATED':updateNotif();renderTabSafe(activeTab);break;
    case 'OC_DELETED':updateNotif();renderTabSafe(activeTab);break;
    case 'NEW_PUN':renderTabSafe(activeTab);toast('Nova punição para '+payload.nome,'w');break;
    case 'PUNS_UPDATED':renderTabSafe(activeTab);break;
    case 'NEW_PONTO':renderTabSafe(activeTab);if(me&&payload.userLogin!==me.user&&payload.type!=='folga')toast(payload.nome+' registrou ponto.','i');break;
    case 'FOLGA_GRANTED':if(me&&payload.userLogin===me.user)toast('🌴 Folga concedida para '+payload.folgaDia+'!','s',8000);renderTabSafe(activeTab);break;
    case 'NEW_PROVA':
      if(activeTab===getTabIdx('aprovas'))renderTabSafe(activeTab);
      if(me&&(CARGO_PERM[me.cargo]||0)>=5&&payload.userLogin!==me.user)toast('📝 Nova '+(payload.tipo==='prisoes'?'avaliação pessoal':'prova')+' de '+payload.nome+' aguardando avaliação.','w');
      break;
    case 'PROVAS_UPDATED':if(activeTab===getTabIdx('aprovas')||activeTab===getTabIdx('provas'))renderTabSafe(activeTab);break;
    case 'PROVA_DECIDIDA':
      if(activeTab===getTabIdx('aprovas')||activeTab===getTabIdx('provas'))renderTabSafe(activeTab);
      if(me&&payload.userLogin===me.user){
        if(payload.decisao==='promovido')toast('🎉 PARABÉNS! Você foi promovido(a) a '+(CARGO_LABEL[payload.cargoAlvo]||payload.cargoAlvo)+'!','s',10000);
        else if(payload.decisao==='aprovado')toast('✅ Sua avaliação pessoal foi APROVADA por '+payload.feitorNome+'!','s',10000);
        else toast('😞 Você não passou na avaliação.','d',10000);
      }
      break;
    case 'USERS_UPDATED':
      if(me){const mu=(payload||[]).find(u=>u.user===me.user);if(mu){me={...me,cargo:mu.cargo,nome:mu.nome,ativo:mu.ativo,girosBonus:(typeof mu.girosBonus==='number'?mu.girosBonus:0),ultimoGiroRoleta:mu.ultimoGiroRoleta||null,vip:mu.vip===true,recado:mu.recado||'',foto:mu.foto||'',horasExtrasAjustadas:mu.horasExtrasAjustadas||0,horasDevidasAjustadas:mu.horasDevidasAjustadas||0};saveSession();const badge=document.getElementById('tb-badge');if(badge){badge.className='cargo-badge '+(CARGO_BADGE_CLASS[me.cargo]||'');badge.textContent=CARGO_LABEL[me.cargo]||me.cargo;}}}
      if(activeTab===getTabIdx('users')||activeTab===getTabIdx('pontos')||activeTab===getTabIdx('vips'))renderTabSafe(activeTab);
      if(activeTab===getTabIdx('chat')){renderChatListaContatos();renderChatMensagens();}
      if(activeTab===getTabIdx('roleta'))renderTabSafe(activeTab);
      break;
    case 'VIP_CHANGED':
      if(activeTab===getTabIdx('vips'))renderTabSafe(activeTab);
      if(me&&payload.userLogin===me.user){
        me.vip=payload.ativo;
        if(!payload.ativo)me.recado='';
        saveSession();
        if(payload.ativo)toast('🌟 Você agora é VIP! Parabéns!','s',8000);
        else toast('❌ Você perdeu o status VIP. Seu recado foi removido.','w',8000);
      }
      break;
    case 'GIROS_GAINED':
      if(me&&payload.userLogin===me.user){me.girosBonus=payload.total;saveSession();toast('🎰 +'+payload.giros+' giro(s) bônus! '+payload.motivo,'s',7000);fecharModalSemGiros();if(activeTab===getTabIdx('roleta'))renderTabSafe(activeTab);}
      break;
    case 'ROLETA_PREMIOS_UPDATED':
      if(activeTab===getTabIdx('roleta'))renderTabSafe(activeTab);
      break;
    case 'NEW_PRISAO':
    case 'PRISOES_UPDATED':
      if(activeTab===getTabIdx('prisoes'))renderTabSafe(activeTab);
      break;
    case 'NEW_MEDALHA':
      if(activeTab===getTabIdx('vips'))renderTabSafe(activeTab);
      if(me&&payload.userLogin===me.user)toast('🏅 Você recebeu uma nova medalha!','s',7000);
      break;
    case 'AUDIT_NEW':if(activeTab===getTabIdx('audit'))renderTabSafe(activeTab);break;
    case 'AUDIT_CLEARED':if(activeTab===getTabIdx('audit'))renderTabSafe(activeTab);break;
    case 'NEW_FEEDBACK':
      if(activeTab===getTabIdx('home'))renderTabSafe(activeTab);
      if(me&&payload.userLogin!==me.user&&(CARGO_PERM[me.cargo]||0)>=5)toast('⭐ '+payload.nome+' avaliou o sistema com '+payload.nota+'★','i');
      break;
    case 'FEEDBACKS_UPDATED':if(activeTab===getTabIdx('home'))renderTabSafe(activeTab);break;
    case 'NEW_CHAT_MSG':
      if(me&&activeTab===getTabIdx('chat')){const outra=payload.from===me.user?payload.to:payload.from;if(_chatContatoAtual===outra)renderChatMensagens();renderChatListaContatos();if(payload.from!==me.user){toast('💬 '+payload.fromNome+': '+payload.texto.slice(0,40)+(payload.texto.length>40?'…':''),'i',3000);_tocarNotifChat();}}
      updateNotif();
      break;
    case 'CHAT_MSG_DELETED':if(me&&activeTab===getTabIdx('chat')){renderChatMensagens();renderChatListaContatos();}break;
    case 'USER_BANNED':
      STATE.users=STATE.users.map(u=>u.user===payload.userLogin?{...u,banExpires:payload.expiresAt,banReason:payload.reason,banBy:payload.banBy}:u);
      if(activeTab===getTabIdx('users'))renderTabSafe(activeTab);
      if(me&&payload.userLogin===me.user)showBanScreen(payload);else if(me)toast('⛔ '+payload.userLogin+' suspenso.','w');break;
    case 'USER_UNBANNED':
      STATE.users=STATE.users.map(u=>u.user===payload.userLogin?{...u,banExpires:null,banReason:null,banBy:null}:u);
      if(activeTab===getTabIdx('users'))renderTabSafe(activeTab);
      if(me&&payload.userLogin===me.user){clearSession();location.reload();}break;
    case 'CARGO_CHANGED':
      STATE.users=STATE.users.map(u=>u.user===payload.userLogin?{...u,cargo:payload.newCargo}:u);
      if(activeTab===getTabIdx('users'))renderTabSafe(activeTab);
      if(me&&payload.userLogin===me.user){me.cargo=payload.newCargo;saveSession();const nl=CARGO_LABEL[payload.newCargo]||payload.newCargo;const msg=payload.tipo==='promovido'?`📈 Você foi promovido para <b>${nl}</b>!`:`📉 Você foi rebaixado para <b>${nl}</b>. Motivo: ${payload.motivo||'não informado'}`;showCargoNotif(msg,payload.tipo==='promovido'?'s':'d');const badge=document.getElementById('tb-badge');if(badge){badge.className='cargo-badge '+(CARGO_BADGE_CLASS[me.cargo]||'');badge.textContent=CARGO_LABEL[me.cargo]||me.cargo;}activeTab=0;buildTabs();renderTab(0);}break;
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
  try{const st=await API.getState();if(st&&Array.isArray(st.users)){const su=st.users.find(u=>u.user===me.user);if(!su||!su.ativo){clearSession();me=null;showLogin();return;}me={...me,cargo:su.cargo,nome:su.nome,ativo:su.ativo,girosBonus:(typeof su.girosBonus==='number'?su.girosBonus:0),ultimoGiroRoleta:su.ultimoGiroRoleta||null,vip:su.vip===true,recado:su.recado||'',foto:su.foto||'',horasExtrasAjustadas:su.horasExtrasAjustadas||0,horasDevidasAjustadas:su.horasDevidasAjustadas||0};saveSession();if(su.banExpires&&su.banExpires>Date.now()){showBanScreen({expiresAt:su.banExpires,reason:su.banReason,banBy:su.banBy});return;}STATE.users=st.users;if(Array.isArray(st.ocs))STATE.ocs=st.ocs;if(Array.isArray(st.puns))STATE.puns=st.puns;if(Array.isArray(st.pontos))STATE.pontos=st.pontos;if(Array.isArray(st.provas))STATE.provas=st.provas;if(Array.isArray(st.audit))STATE.audit=st.audit;if(Array.isArray(st.feedbacks))STATE.feedbacks=st.feedbacks;if(Array.isArray(st.chats))STATE.chats=st.chats;if(Array.isArray(st.prisoes))STATE.prisoes=st.prisoes;if(Array.isArray(st.roletaPremios))STATE.roletaPremios=st.roletaPremios;}}catch(_){}
  showPanel();
}
function _loadStateFromCache(){if(typeof LSCache==='undefined')return;const c=LSCache.load();if(!c)return;if(Array.isArray(c.ocs))STATE.ocs=c.ocs;if(Array.isArray(c.puns))STATE.puns=c.puns;if(Array.isArray(c.pontos))STATE.pontos=c.pontos;if(Array.isArray(c.provas))STATE.provas=c.provas;if(Array.isArray(c.users))STATE.users=c.users;if(Array.isArray(c.audit))STATE.audit=c.audit;if(Array.isArray(c.feedbacks))STATE.feedbacks=c.feedbacks;if(Array.isArray(c.chats))STATE.chats=c.chats;if(Array.isArray(c.prisoes))STATE.prisoes=c.prisoes;if(Array.isArray(c.roletaPremios))STATE.roletaPremios=c.roletaPremios;}

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
  const base=[{label:'▸ INÍCIO',key:'home',notif:false},{label:'▸ INTRODUÇÃO',key:'intro',notif:false}];
  const common=[
    {label:'▸ REGISTRAR',key:'registrar',notif:false},
    {label:'▸ MINHAS OCs',key:'myocs',notif:false},
    {label:'▸ PUNIÇÕES',key:'puns',notif:false},
    {label:'▸ PONTO',key:'pontos',notif:false},
    {label:'▸ PROVAS',key:'provas',notif:false},
    {label:'▸ CHAT',key:'chat',notif:true},
    {label:'▸ ROLETA',key:'roleta',notif:false},
    {label:'▸ MEU VIP',key:'vips',notif:false},
    {label:'▸ HALL DA FAMA',key:'hall',notif:false},
    {label:'▸ PRISÕES',key:'prisoes',notif:false}
  ];
  if(p>=7)return[...base,...common,{label:'▸ PENDENTES',key:'ocs',notif:true},{label:'▸ HISTÓRICO',key:'hist',notif:false},{label:'▸ USUÁRIOS',key:'users',notif:false},{label:'▸ ANÁLISE PROVAS',key:'aprovas',notif:true},{label:'▸ VIPS',key:'vips',notif:false},{label:'▸ AUDITORIA',key:'audit',notif:false}];
  if(p>=6)return[...base,...common,{label:'▸ PENDENTES',key:'ocs',notif:true},{label:'▸ HISTÓRICO',key:'hist',notif:false},{label:'▸ USUÁRIOS',key:'users',notif:false},{label:'▸ ANÁLISE PROVAS',key:'aprovas',notif:true}];
  if(p>=5)return[...base,...common,{label:'▸ PENDENTES',key:'ocs',notif:true},{label:'▸ ANÁLISE PROVAS',key:'aprovas',notif:true}];
  if(p>=4)return[...base,...common,{label:'▸ PENDENTES',key:'ocs',notif:true}];
  return[...base,...common];
}
function buildTabs(){const defs=tabDefs(me.cargo);document.getElementById('tabs').innerHTML=defs.map((t,i)=>'<div class="tab '+(i===0?'active':'')+'" id="tab-'+i+'" onclick="switchTab('+i+')">'+t.label+(t.notif?'<span class="tab-n" id="tn-'+i+'" style="display:none"></span>':'')+' </div>').join('');buildMobileDrawer();}
function buildMobileDrawer(){if(!me)return;const defs=tabDefs(me.cargo);const drawer=document.getElementById('nav-drawer');if(!drawer)return;drawer.innerHTML=defs.map((t,i)=>'<div class="nav-drawer-item'+(i===activeTab?' active':'')+'" onclick="switchTab('+i+');closeNavDrawer();">'+t.label+(t.notif?'<span class="tab-n-badge" id="tnd-'+i+'" style="display:none">0</span>':'')+' </div>').join('');}
function switchTab(idx){
  if(_provaAtiva){toast('⚠ Termine ou cancele a prova antes de trocar de aba.','w');return;}
  activeTab=idx;
  document.querySelectorAll('.tab').forEach((t,i)=>t.classList.toggle('active',i===idx));
  document.querySelectorAll('.nav-drawer-item').forEach((t,i)=>t.classList.toggle('active',i===idx));
  renderTab(idx);closeSettings();
  if(typeof closeNavDrawer==='function')closeNavDrawer();
  window.scrollTo(0,0);document.documentElement.scrollTop=0;document.body.scrollTop=0;
}
function toggleNavDrawer(){const d=document.getElementById('nav-drawer');if(!d)return;if(d.classList.contains('open'))closeNavDrawer();else openNavDrawer();}
function openNavDrawer(){buildMobileDrawer();document.getElementById('nav-drawer')?.classList.add('open');document.getElementById('nav-overlay')?.classList.add('open');}
function closeNavDrawer(){document.getElementById('nav-drawer')?.classList.remove('open');document.getElementById('nav-overlay')?.classList.remove('open');}

function renderTab(idx){
  const defs=tabDefs(me.cargo);const def=defs[idx]||defs[0];
  const views={home:vInicio,intro:vIntroducao,ocs:vOcAdmin,hist:vHistorico,registrar:vRegistrar,myocs:vOcDelegado,puns:vPunicoes,users:vUsuarios,vips:vVips,hall:vHall,prisoes:vPrisoes,pontos:vPontos,provas:vProvas,aprovas:vAnaliseProvas,audit:vAuditoria,chat:vChat,roleta:vRoleta};
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
  if(tnC){const naoLidas=contarMensagensNaoLidas();if(naoLidas>0){tnC.textContent=naoLidas>99?'99+':naoLidas;tnC.style.display='flex';}else tnC.style.display='none';}
}

function shuffle(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

// ══ AVATAR (FOTO DE PERFIL ROBUSTA COM FALLBACK) ══
function avatarLetraDe(u){
  const n=(u&&u.nome)?String(u.nome).trim():'';
  const ch=n?n.charAt(0).toUpperCase():'?';
  return ch||'?';
}
function avatarContent(u){
  const letra=avatarLetraDe(u).replace(/'/g,'');
  if(u&&u.foto){
    const src=String(u.foto).replace(/"/g,'&quot;').replace(/'/g,'%27');
    return `<img src="${src}" alt="" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;" onerror="this.remove();this.parentNode.textContent='${letra}';">`;
  }
  return letra;
}
const AVATAR_POS='position:relative;overflow:hidden;';

// ══ INTRODUÇÃO ══
const INTRO_REGRAS = `Aqui estão disponibilizados os seus estudos diários.
Mantenha-se atualizado, acompanhe os conteúdos e esteja sempre preparado para exercer suas funções com disciplina, conhecimento e profissionalismo

*(Crime de 1 estrela⭐)*

TDF - (TENTATIVA DE FULGA)
ASS - (Agressão)

*(Crime de 2 estrelas⭐⭐)*

DOP - (Desobediência a ordem policial)
AAC - (Apologia ao crime)
LDD - lavagem de dinheiro 
MP - (Multas pendentes)
DDV - (Desmanche de veículos ilegais)
IDP - (invasão de propriedade)
RDV - (Roube de veículos)

*(Crime de 3 estrelas ⭐ ⭐⭐)*

TDH - (Tentativa de homicídio)
TDD - (tráfico de drogas)
TDA - (Tráfico de armas)
PIA - (Porte ilegal de arma)
ODSF - (obtenção de $ sujo/falso

*(Crime de 4 estrelas ⭐⭐⭐⭐)*

DSCT - (Desacato)
Homicídio 

*(Crime de 5 estrelas⭐⭐⭐⭐⭐)*

Suborno
Corrupção 
Estelionato
ADA - (Abuso de autoridade)
RDVE - Roubo de veículo emergencial 

*(Crime de 6⭐⭐⭐⭐⭐⭐)*

Sequestro 
Racismo
Estupro
DPOS - (discriminação por orientação sexual)
Assédio

*CONDUTA OPERACIONAL DAS PTRs*

Toda PTR deverá ser comunicada previamente aos Delegados de turno e devidamente autorizadas, antes do início das atividades operacionais.

As equipes são obrigadas a manter contato constante com o comando, enviando relatórios periódicos sobre suas ações, localizações, abordagens realizadas e demais ocorrências relevantes.

Toda condução de preso deverá ser imediatamente informada aos Delegados de turno, especificando o motivo da prisão, identificação do conduzido e destino da condução.

*• COMPOSIÇÃO DAS PTRs*

As PTRs deverão ser formadas por duas barcas operacionais:

 1ª barca – equipe principal

Composta por 03 ou 04 efetivos, obrigatoriamente sob o comando de um Delegado ou Escrivão, responsável pela coordenação da operação, abordagens, conduções e tomada de decisões operacionais.

 2ª barca – equipe de apoio

Composta por 02 efetivos, responsável por prestar apoio imediato à equipe principal, realizar a segurança da área, proteger o perímetro da ocorrência e auxiliar na condução de detidos quando necessário.

*• FUNÇÕES OPERACIONAIS P1, P2 e P3*

P1 – Motorista da Barca Responsável pela condução da Barca durante toda a operação. Em situações de desembarque, deverá ser o último integrante a sair da Barca garantindo sua segurança e controle.

P2 – Responsável pela Abordagem Responsável por realizar a verbalização da abordagem, conduzir os procedimentos operacionais e manter o contato direto com o abordado durante toda a ação.

P3 – Segurança de Perímetro Responsável pela segurança do local da abordagem, realizando a cobertura da equipe, monitorando possíveis ameaças e garantindo a integridade dos policiais e do abordado.

P4 – Segurança de Perímetro Auxiliar Quando houver um quarto integrante na equipe, este desempenhará as mesmas atribuições do P3, reforçando a segurança do perímetro e ampliando a cobertura operacional.

*• PROCEDIMENTOS GERAIS*

• Manter comunicação constante com o comando;

• Informar toda abordagem relevante e condução de preso;

• Preservar a segurança da equipe e do perímetro operacional;

• Atuar com disciplina profissionalismo e respeito às normas da corporação;

• Evitar ações isoladas sem conhecimento do comando;

• Cumprir rigorosamente as determinações dos Delegados de turno.

O sucesso de uma PTR depende da organização, comunicação, disciplina e trabalho em equipe.

Nenhuma equipe atua sozinha, toda operação deve ser coordenada e supervisionada pelo comando.

*• ABORDAGEM DE ROTINA*

Ao realizar uma abordagem de rotina, o policial deverá informar ao cidadão que se trata de uma fiscalização padrão.
Caso o indivíduo não possua estrelas (registro criminal ativo), deverá ser solicitada apenas a documentação para verificação, não sendo necessária revista pessoal.

Obs: passaporte ou carteira de trabalho;
Se tem veículo, peça a documentação do veículo.

*• ABORDAGEM OSTENSIVA*

Quando o indivíduo possuir estrelas ativas, a abordagem passa a ser ostensiva.
Nesse caso, a equipe deverá:
• Informar o motivo da abordagem;
• Solicitar os documentos;
• Realizar revista pessoal;
• Consultar a situação criminal por meio do sistema /wanted.

Caso o abordado possua 5 ou 6 estrelas, poderá ser conduzido ao PS para os procedimentos cabíveis, sempre sendo devidamente informado sobre o motivo da condução.

*• MANDADO DE BUSCA E APREENSÃO*

Durante o cumprimento de mandados de busca e apreensão, as equipes da PF deverão utilizar o sistema /wanted para localizar indivíduos procurados.

É proibido realizar abordagens ostensivas ou cumprir mandados dentro de mansões de famílias ou nos morros das facções roxo e verde. Nessas situações, a localização e identificação dos procurados deverá ocorrer por meio dos sistemas disponíveis e em áreas permitidas pelas normas operacionais.`;

function vIntroducao(){
  const linhas=INTRO_REGRAS.split('\n');
  let html='';
  linhas.forEach(raw=>{
    const line=raw.trim();
    if(!line){html+='<div style="height:8px;"></div>';return;}
    if(line.length>2&&line.startsWith('*')&&line.endsWith('*')){
      html+='<div class="intro-h">'+line.slice(1,-1).trim()+'</div>';
    }else{
      html+='<p class="intro-p">'+line.replace(/</g,'&lt;')+'</p>';
    }
  });
  return '<div class="stitle">▸ INTRODUÇÃO — REGRAS & ESTUDOS DIÁRIOS</div>'
    +'<style>'
    +'.intro-card{padding:22px 20px;}'
    +'.intro-h{font-family:\'Orbitron\',sans-serif;font-size:.85rem;font-weight:800;color:var(--warn);letter-spacing:.06em;margin:18px 0 8px;padding:8px 12px;background:rgba(224,192,96,.08);border-left:3px solid var(--warn);border-radius:8px;}'
    +'.intro-p{font-size:.88rem;color:var(--text-mid);line-height:1.7;margin:0 0 6px;white-space:pre-wrap;}'
    +'</style>'
    +'<div class="card intro-card">'+html+'</div>';
}

// ══ HUB MASTER VIP: score, patentes, banco de horas e medalhas ══
function vipPatente(score){return score>=90?'DIAMANTE':score>=75?'OURO':score>=50?'PRATA':'BRONZE';}
function vipMin(min){const n=Math.max(0,Number(min)||0);return Math.floor(n/60)+'h'+String(n%60).padStart(2,'0');}
function medalhasHtml(meds, target){return (meds||[]).map((m,i)=>`<span title="${m.motivo||'Por trabalho'}" style="display:inline-flex;align-items:center;gap:4px;padding:6px 9px;margin:3px;border:1px solid rgba(251,191,36,.35);border-radius:10px;background:rgba(251,191,36,.08);font-size:1.15rem;">${m.icone||'🏅'}${isMaster()?`<button class="btn btn-xs btn-danger" style="padding:2px 5px;" onclick="removerMedalha('${target}',${i})">×</button>`:''}</span>`).join('')||'<span style="color:var(--text-dim);font-size:.75rem;">Nenhuma medalha ainda.</span>';}
function vipInfoCard(info){const h=info.horas||{}, p=vipPatente(info.score||0);return `<div class="card vip-dashboard"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;"><div><div class="stitle" style="margin:0 0 8px;">🌟 ${info.user?.nome||me.nome}</div><span class="cargo-badge">${CARGO_LABEL[info.user?.cargo||me.cargo]||me.cargo}</span> <span class="status-chip">${info.vip?'VIP ATIVO':'VIP INATIVO'}</span></div><div style="text-align:right;"><div style="font-size:2.5rem;font-weight:900;color:#fbbf24;line-height:1;">${info.score||0}</div><div style="font-size:.65rem;color:var(--text-dim);">SCORE / 100</div></div></div><div style="height:10px;background:rgba(255,255,255,.08);border-radius:99px;margin:20px 0 12px;overflow:hidden;"><div style="height:100%;width:${info.score||0}%;background:linear-gradient(90deg,#cd7f32,#c0c0c0,#ffd700,#67e8f9);border-radius:99px;"></div></div><div style="display:flex;justify-content:space-between;font-size:.72rem;color:var(--text-mid);"><b>🏅 PATENTE ${p}</b><span>🔥 ${info.sequencia||0} dias/turnos ativos</span><span>⚡ ${info.xp||0} XP</span></div></div><div class="card"><div class="stitle">⏱ BANCO DE HORAS VIP</div><div class="g4"><div class="stat-box"><div class="stat-num">${vipMin(h.normais)}</div><div class="stat-lbl">Normais</div></div><div class="stat-box"><div class="stat-num" style="color:#fbbf24;">${vipMin(h.extras)}</div><div class="stat-lbl">Extras</div></div><div class="stat-box"><div class="stat-num">${vipMin(h.operacao)}</div><div class="stat-lbl">Operação</div></div><div class="stat-box"><div class="stat-num">${vipMin(h.semanais)}</div><div class="stat-lbl">Semana</div></div><div class="stat-box"><div class="stat-num">${vipMin(h.recorde)}</div><div class="stat-lbl">Recorde pessoal</div></div><div class="stat-box"><div class="stat-num">${h.turnos||0}</div><div class="stat-lbl">Turnos</div></div></div></div><div class="card"><div class="stitle">🏅 MEDALHAS EXCLUSIVAS <span style="float:right;font-size:.65rem;color:var(--text-dim);">máx. 5 por patente</span></div><div>${medalhasHtml(info.medalhas,info.user?.user||me.user)}</div></div>`;}
async function vVips(){const target=me.user;const info=await API.getVipInfo(target);let admin='';if(isMaster()){const users=STATE.users.filter(u=>u.user!==me.user);admin=`<div class="card"><div class="stitle">👑 CONTROLE DO ADMIN MASTER</div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>USUÁRIO</th><th>PATENTE VIP</th><th>MEDALHAS</th><th>AÇÕES</th></tr></thead><tbody>${users.map(u=>`<tr><td><b>${u.nome}</b><br><small>@${u.user}</small></td><td>${u.vip?'🌟 VIP':'—'}</td><td>${(u.medalhas||[]).length}/5</td><td><button class="btn ${u.vip?'btn-danger':'btn-success'} btn-sm" onclick="toggleVipUsuario('${u.user}','${u.nome.replace(/'/g,"\\'")}',${!u.vip})">${u.vip?'Remover VIP':'Dar VIP'}</button> <button class="btn btn-warn btn-sm" onclick="darMedalha('${u.user}','${u.nome.replace(/'/g,"\\'")}')">🏅 Medalha</button></td></tr>`).join('')}</tbody></table></div><p class="hint" style="margin-top:12px;">Somente o Admin Master pode conceder medalhas por trabalho. Cada patente comporta até 5 medalhas.</p></div>`;}return `<div class="stitle">▸ MASTER VIP</div>${vipInfoCard(info)}${admin}`;}
async function darMedalha(user,nome){const tipo=prompt(`Medalha para ${nome}: bronze, prata, ouro ou diamante`,'ouro');if(!tipo||!['bronze','prata','ouro','diamante'].includes(tipo.toLowerCase()))return toast('Tipo de medalha inválido.','d');const motivo=prompt('Motivo do trabalho:','Por trabalho');if(motivo===null)return;try{await API.addMedalha(user,tipo.toLowerCase(),motivo,me.user);toast('Medalha concedida.','s');}catch(e){toast(e.message,'d');}}
async function removerMedalha(user,idx){if(!confirm('Remover esta medalha?'))return;try{await API.removeMedalha(user,idx,me.user);toast('Medalha removida.','w');}catch(e){toast(e.message,'d');}}
async function vHall(){const h=await API.getHall();const blocos=[['maisHoras','⏱ Mais horas trabalhadas','min'],['maisOcorrencias','📋 Mais ocorrências registradas','ocorrências'],['maisOperacoes','🚓 Mais operações','operações'],['maiorSequencia','🔥 Maior sequência','dias'],['maiorXp','⚡ Maior XP','XP'],['maisMedalhas','🏅 Mais medalhas','medalhas']];const cards=blocos.map(([key,t,unit])=>`<div class="card"><div class="stitle">${t}</div>${(h[key]||[]).map((x,i)=>`<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.08);"><b style="color:#fbbf24;width:20px;">${i+1}</b><div style="flex:1;"><b>${x.nome}</b><small style="display:block;color:var(--text-dim);">${CARGO_LABEL[x.cargo]||x.cargo}</small></div><strong>${key==='maisHoras'?vipMin(x.valor):x.valor} ${unit}</strong></div>`).join('')||'<div class="hint">Sem dados.</div>'}</div>`).join('');return `<div class="stitle">🏆 HALL DA FAMA</div><div class="card" style="margin-bottom:18px;background:linear-gradient(135deg,rgba(251,191,36,.14),rgba(167,139,250,.08));"><div style="font-size:1.3rem;font-weight:800;">🏆 Funcionário do mês</div><div style="margin-top:8px;font-size:1.05rem;color:#fbbf24;">${h.funcionarioDoMes?.nome||'Ainda não definido'}</div><div class="hint">Destaque automático por horas trabalhadas.</div></div><div class="g2">${cards}</div>`;}
async function vPrisoes(){const rows=(STATE.prisoes||[]).map(p=>`<tr><td>${p.nomePF}</td><td>${p.nomeEnvolvido}</td><td>${p.data||'—'} ${p.hora||'—'}</td><td>${p.motivo}</td><td>${(CARGO_PERM[me.cargo]||0)>=5?`<button class="btn btn-danger btn-xs" onclick="excluirPrisao('${p.id}')">✘</button>`:''}</td></tr>`).join('');return `<div class="stitle">🚓 SISTEMA PRISIONAL</div><div class="card" style="margin-bottom:18px;"><div class="stitle">▸ REGISTRAR APREENSÃO</div><div class="g2"><div class="fg"><label>Nome do PF</label><input id="pri-pf" value="${me.nome||''}"></div><div class="fg"><label>Nome do envolvido</label><input id="pri-envolvido"></div><div class="fg g-full"><label>Motivo da prisão</label><textarea id="pri-motivo" maxlength="200" placeholder="Descreva o motivo da prisão"></textarea></div></div><button class="btn btn-primary" onclick="registrarPrisao()">🚓 REGISTRAR PRISÃO</button></div><div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>PF</th><th>ENVOLVIDO</th><th>HORA DA APREENSÃO</th><th>MOTIVO</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="5" style="text-align:center;padding:30px;">Nenhuma prisão registrada.</td></tr>'}</tbody></table></div></div>`;}
async function registrarPrisao(){const nomePF=document.getElementById('pri-pf')?.value.trim(),nomeEnvolvido=document.getElementById('pri-envolvido')?.value.trim(),motivo=document.getElementById('pri-motivo')?.value.trim();if(!nomePF||!nomeEnvolvido||!motivo)return toast('Preencha todos os campos da prisão.','d');try{await API.createPrisao({nomePF,nomeEnvolvido,motivo,feitorPor:me.user});toast('Prisão registrada.','s');}catch(e){toast(e.message,'d');}}
async function excluirPrisao(id){if(!confirm('Excluir este registro prisional?'))return;try{await API.deletePrisao(id,me.user);toast('Registro excluído.','w');}catch(e){toast(e.message,'d');}}
async function toggleVipUsuario(username,nome,ativo){
  if(!confirm(`${ativo?'Dar VIP para':'Remover VIP de'} ${nome}?`))return;
  try{
    const res=await API.toggleVip(username,ativo,me.user);
    if(res&&res.ok){toast(ativo?`🌟 ${nome} agora é VIP!`:`❌ VIP de ${nome} removido.`,ativo?'s':'w');}
    else toast(res?.error||'Erro.','d');
  }catch(e){toast(e.message||'Erro.','d');}
}

// ══ MEU PERFIL (FOTO + RECAD0 + LED RGB + VERMELHO NO MODAL) ══
function abrirModalPerfil(){
  if(!me)return;
  const u=STATE.users.find(x=>x.user===me.user)||me;
  const isVip=!!u.vip;
  const av=document.getElementById('pf-avatar');
  const cardBox=av?av.parentElement:null;
  const userBox=document.getElementById('pf-user')?document.getElementById('pf-user').parentElement:null;
  const modalBox=document.querySelector('#m-perfil .modal');

  // ══ Wrapper dinâmico arredondado SÓ ao redor do textarea do recado ══
  const recadoInput0=document.getElementById('pf-recado');
  let recadoWrap=document.getElementById('pf-recado-wrap');
  if(recadoInput0&&!recadoWrap){
    recadoWrap=document.createElement('div');
    recadoWrap.id='pf-recado-wrap';
    recadoWrap.style.borderRadius='16px';
    recadoWrap.style.padding='4px';
    recadoInput0.parentNode.insertBefore(recadoWrap,recadoInput0);
    recadoWrap.appendChild(recadoInput0);
  }

  // ══ Foto/avatar com LED RGB (foto ENCAIXADA dentro do anel) ══
  if(av){
    if(isVip&&!u.foto){
      av.innerHTML=`<span class="vip-letter">${avatarLetraDe(u)}</span>`;
    }else{
      av.innerHTML=avatarContent(u);
    }
    av.classList.toggle('vip-led-avatar',isVip);
  }
  // ══ LED RGB nas bolhas (nome, @usuário) e no wrapper do recado ══
  if(cardBox)cardBox.classList.toggle('vip-led',isVip);
  if(userBox)userBox.classList.toggle('vip-led',isVip);
  if(recadoWrap)recadoWrap.classList.toggle('vip-led',isVip);
  // ══ Contorno VERMELHO correndo no modal gigante ══
  if(modalBox){
    modalBox.classList.toggle('vip-led',isVip);
    modalBox.classList.toggle('vip-led-red',isVip);
  }

  document.getElementById('pf-nome').textContent=u.nome||'—';
  document.getElementById('pf-cargo').textContent=CARGO_LABEL[u.cargo]||u.cargo||'—';
  document.getElementById('pf-cargo').className='cargo-badge '+(CARGO_BADGE_CLASS[u.cargo]||'');
  document.getElementById('pf-user').textContent='@'+(u.user||me.user);
  const rm=document.getElementById('pf-foto-remove');
  if(rm)rm.style.display=u.foto?'inline-flex':'none';
  const st=document.getElementById('pf-foto-status');
  if(st)st.textContent='';
  const inp=document.getElementById('pf-foto-input');
  if(inp)inp.value='';
  const vipBadge=document.getElementById('pf-vip-badge');
  const recadoLock=document.getElementById('pf-recado-lock');
  const recadoInput=document.getElementById('pf-recado');
  const saveBtn=document.getElementById('pf-save-btn');
  if(isVip){
    vipBadge.style.display='inline-block';
    recadoLock.style.display='none';
    recadoInput.disabled=false;
    recadoInput.value=u.recado||'';
    saveBtn.style.display='inline-block';
  }else{
    vipBadge.style.display='none';
    recadoLock.style.display='block';
    recadoInput.disabled=true;
    recadoInput.value='';
    saveBtn.style.display='none';
  }
  atualizarContadorRecado();
  openModal('m-perfil');
}

const IMGBB_KEY='599411b1c02c7129d1b0da9bd4634c09';
async function uploadFotoPerfil(){
  const input=document.getElementById('pf-foto-input');
  const status=document.getElementById('pf-foto-status');
  if(!input||!input.files||!input.files.length){toast('Selecione uma imagem primeiro.','w');return;}
  const file=input.files[0];
  if(!file.type.startsWith('image/')){toast('Selecione um arquivo de imagem válido.','d');return;}
  if(file.size>32*1024*1024){toast('A imagem deve ter no máximo 32MB.','d');return;}
  if(status)status.textContent='⏫ Enviando imagem…';
  const fd=new FormData();
  fd.append('image',file);
  try{
    const resp=await fetch('https://api.imgbb.com/1/upload?key='+IMGBB_KEY,{method:'POST',body:fd});
    if(!resp.ok)throw new Error('Erro HTTP: '+resp.status);
    const data=await resp.json();
    if(!(data&&data.success&&data.data&&data.data.url))throw new Error((data.error&&data.error.message)||'Resposta inválida da API');
    const url=data.data.url;
    const res=await API.salvarFotoPerfil(url,me.user);
    if(res&&res.ok){
      me.foto=url;
      const su=STATE.users.find(x=>x.user===me.user);if(su)su.foto=url;
      saveSession();
      toast('✅ Foto de perfil atualizada!','s');
      abrirModalPerfil();
    }else{
      if(status)status.textContent='';
      toast((res&&res.error)||'Erro ao salvar foto.','d');
    }
  }catch(e){
    if(status)status.textContent='';
    toast('Erro ao enviar imagem: '+e.message,'d');
  }finally{
    input.value='';
  }
}
async function removerFotoPerfil(){
  try{
    const res=await API.salvarFotoPerfil('',me.user);
    if(res&&res.ok){
      me.foto='';
      const su=STATE.users.find(x=>x.user===me.user);if(su)su.foto='';
      saveSession();
      toast('Foto removida.','s');
      abrirModalPerfil();
    }else toast((res&&res.error)||'Erro.','d');
  }catch(e){toast(e.message||'Erro.','d');}
}

function atualizarContadorRecado(){
  const input=document.getElementById('pf-recado');
  const count=document.getElementById('pf-recado-count');
  if(!input||!count)return;
  const len=input.value.length;
  count.textContent=len+'/200';
  count.style.color=len>180?'var(--warn)':'var(--text-dim)';
}

async function salvarRecado(){
  const texto=document.getElementById('pf-recado').value.trim();
  if(texto.length>200){toast('Recado muito longo (máx 200 caracteres).','w');return;}
  const btn=document.getElementById('pf-save-btn');
  if(btn){btn.disabled=true;btn.textContent='▸ SALVANDO...';}
  try{
    const res=await API.atualizarRecado(texto,me.user);
    if(res&&res.ok){
      me.recado=texto;
      const su=STATE.users.find(x=>x.user===me.user);if(su)su.recado=texto;
      saveSession();
      toast('✅ Recado salvo!','s');
      closeModal('m-perfil');
    }else toast((res&&res.error)||'Erro ao salvar.','d');
  }catch(e){toast(e.message||'Erro.','d');}
  finally{
    if(btn){btn.disabled=false;btn.textContent='💾 SALVAR RECAD0';}
  }
}

// ══ PROVAS ══
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
      if(p.tipo==='prisoes'){botoes='<button class="btn btn-success btn-sm" onclick="decidirProva(\''+p.id+'\',\'aprovado\')">✅ APROVAR AVALIAÇÃO</button><button class="btn btn-danger btn-sm" onclick="decidirProva(\''+p.id+'\',\'reprovado\')">❌ REPROVAR AVALIAÇÃO</button>';}
      else{botoes='<button class="btn btn-success btn-sm" onclick="decidirProva(\''+p.id+'\',\'promovido\')">🎓 PROMOVER</button><button class="btn btn-danger btn-sm" onclick="decidirProva(\''+p.id+'\',\'reprovado\')">❌ REPROVAR</button>';}
    }
    return '<div class="card" style="margin-bottom:16px;"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px;"><div><b style="font-size:1rem;">'+p.nome+'</b> <span style="font-family:\'Share Tech Mono\',monospace;font-size:.62rem;color:var(--text-dim);">@'+p.userLogin+'</span><br><span style="font-size:.75rem;color:var(--text-mid);">'+(p.tipo==='prisoes'?'🧠 Avaliação pessoal — Prisões':(CARGO_LABEL[p.cargoAtual]||p.cargoAtual)+' → <b style="color:var(--accent);">'+(CARGO_LABEL[p.cargoAlvo]||p.cargoAlvo)+'</b>')+' • '+brDateOf(p.ts)+(p.status==='tempo_esgotado'?' • <span style="color:var(--danger);">⏰ tempo esgotado</span>':'')+'</span></div><div style="font-family:\'Orbitron\',sans-serif;font-size:1.6rem;color:'+(p.nota===null?'var(--warn)':(p.nota>=70?'#4ade80':'#f87171'))+';">'+(p.nota===null?'—':p.nota)+'</div></div><div style="margin-bottom:10px;">'+decBadge+'</div>'+corpo+'<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;"><button class="btn btn-ghost btn-sm" onclick="togglePQ(\'pq-'+p.id+'\')">👁 VER / OCULTAR RESPOSTAS</button>'+botoes+'</div></div>';
  }).join('');
  return '<div class="stitle">▸ ANÁLISE DE PROVAS</div><p style="color:var(--text-mid);font-size:.8rem;margin-bottom:14px;">Resposta errada em <span style="color:#f87171;">vermelho</span> • correta em <span style="color:#4ade80;">verde</span>.</p>'+cards;
}
function togglePQ(id){const el=document.getElementById(id);if(!el)return;if(el.style.display==='none'||el.style.display===''){el.style.display='block';}else{el.style.display='none';}}
async function decidirProva(id,decisao){
  const p=STATE.provas.find(x=>x.id===id);if(!p)return;
  let txt;
  if(decisao==='promovido')txt='PROMOVER '+p.nome+' para '+(CARGO_LABEL[p.cargoAlvo]||p.cargoAlvo)+'?';
  else if(decisao==='aprovado')txt='APROVAR a avaliação pessoal de '+p.nome+'? (Sem promoção de cargo.)';
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
  const cardAvaliacao=`<div class="card" style="margin-bottom:20px;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;"><div style="font-family:'Orbitron',sans-serif;font-size:.72rem;color:var(--warn);letter-spacing:.14em;">⭐ AVALIE O SISTEMA</div><div style="font-family:'Share Tech Mono',monospace;font-size:.62rem;color:var(--text-dim);">MÉDIA GERAL: <b style="color:var(--warn);font-size:.75rem;">${mediaStr}★</b> (${totalFbs} aval.)</div></div><div style="margin-bottom:8px;display:flex;align-items:center;gap:6px;">${estrelasMedia}</div>${podeAvaliar?`<p style="color:var(--text-mid);font-size:.85rem;margin-bottom:12px;line-height:1.5;">Sua opinião ajuda a melhorar o GMPOL. <b>De uma nota de 1 a 5 estrelas</b> e deixe suas sugestões.</p><div id="fb-estrelas" style="display:flex;gap:6px;margin-bottom:12px;user-select:none;"><span class="fb-star" data-n="1" onclick="setEstrela(1)" style="font-size:1.8rem;cursor:pointer;transition:transform .15s;color:var(--text-dim);">★</span><span class="fb-star" data-n="2" onclick="setEstrela(2)" style="font-size:1.8rem;cursor:pointer;transition:transform .15s;color:var(--text-dim);">★</span><span class="fb-star" data-n="3" onclick="setEstrela(3)" style="font-size:1.8rem;cursor:pointer;transition:transform .15s;color:var(--text-dim);">★</span><span class="fb-star" data-n="4" onclick="setEstrela(4)" style="font-size:1.8rem;cursor:pointer;transition:transform .15s;color:var(--text-dim);">★</span><span class="fb-star" data-n="5" onclick="setEstrela(5)" style="font-size:1.8rem;cursor:pointer;transition:transform .15s;color:var(--text-dim);">★</span><span id="fb-nota-txt" style="margin-left:10px;font-family:'Share Tech Mono',monospace;font-size:.75rem;color:var(--text-mid);">(clique para avaliar)</span></div><div class="fg"><label>Sugestões e melhorias</label><textarea id="fb-texto" placeholder="O que podemos melhorar?" style="min-height:80px;"></textarea></div><button class="btn btn-warn" id="btn-fb-enviar" onclick="enviarFeedback()" style="max-width:280px;">📤 ENVIAR AVALIAÇÃO</button>`:`<div style="padding:12px 14px;background:rgba(224,192,96,.06);border:1px solid rgba(224,192,96,.2);border-radius:4px;margin-bottom:10px;"><div style="font-size:.85rem;color:var(--warn);margin-bottom:4px;">✅ Você já avaliou recentemente!</div><div style="font-size:.72rem;color:var(--text-dim);font-family:'Share Tech Mono',monospace;">Sua nota: <b style="color:var(--warn);">${meuUltimoFb.nota}★</b> • novamente em <b>${horasRestantes}h</b></div></div><div style="font-size:.82rem;color:var(--text-mid);line-height:1.5;margin-bottom:6px;"><b>Sua sugestão foi:</b></div><div class="dep-box" style="margin-bottom:0;">${(meuUltimoFb.texto||'').replace(/</g,'&lt;')}</div>`}</div>`;
  let histFbHtml='';
  if((CARGO_PERM[me.cargo]||0)>=5&&totalFbs>0){
    const ultimos=fbs.slice(0,10);
    histFbHtml=`<div class="card" style="margin-bottom:20px;"><div style="font-family:'Orbitron',sans-serif;font-size:.72rem;color:var(--accent);letter-spacing:.14em;margin-bottom:12px;">📊 ÚLTIMAS AVALIAÇÕES RECEBIDAS</div>${ultimos.map(f=>{const dt=new Date(f.ts).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});const stars=renderEstrelasHtml(f.nota);const podeDel=(CARGO_PERM[me.cargo]||0)>=6;return `<div style="padding:10px 0;border-bottom:1px solid var(--border);"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;"><div style="flex:1;min-width:180px;"><div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;"><b style="font-size:.9rem;">${f.nome}</b><span class="cargo-badge ${CARGO_BADGE_CLASS[f.cargo]||''}" style="font-size:.55rem;">${CARGO_LABEL[f.cargo]||f.cargo}</span></div><div style="margin-bottom:4px;">${stars}</div><div style="font-size:.82rem;color:var(--text-mid);line-height:1.5;">${(f.texto||'').replace(/</g,'&lt;')}</div><div style="font-family:'Share Tech Mono',monospace;font-size:.6rem;color:var(--text-dim);margin-top:4px;">${dt}</div></div>${podeDel?`<button class="btn btn-danger btn-xs" onclick="excluirFeedback('${f.id}')">🗑</button>`:''}</div></div>`;}).join('')}</div>`;
  }
  const msgs={admin:isMaster()?'ACESSO TOTAL ABSOLUTO.':'Acesso total.',chefe:'Você pode alterar cargos, gerenciar usuários, avaliar provas e supervisionar a corporação.',delegado:'Você pode aceitar ou recusar ocorrências, avaliar provas e supervisionar os Escrivãos.',escrivao:'Você pode aceitar ou recusar ocorrências e fazer a Prova de Delegado.',tatico:'Você pode solicitar rebaixamento ou punição e fazer a Prova de Tático.',agente:'Você pode registrar ocorrências, bater ponto e fazer a Prova de Agente.',gm:'Você pode registrar ocorrências, bater seu ponto e fazer a Prova de Guarda.'};
  const today=brDateLong();
  const statsCards=p>=3?`<div class="g3" style="grid-template-columns:repeat(4,1fr);"><div class="card c-warn stat-box"><div class="stat-num" style="color:var(--warn);">${pend}</div><div class="stat-lbl">PENDENTES</div></div><div class="card c-success stat-box"><div class="stat-num" style="color:var(--accent3);">${ace}</div><div class="stat-lbl">ACEITAS</div></div><div class="card c-danger stat-box"><div class="stat-num" style="color:var(--danger);">${rec}</div><div class="stat-lbl">RECUSADAS</div></div><div class="card stat-box"><div class="stat-num" style="color:var(--text-dim);">${can}</div><div class="stat-lbl">CANCELADAS</div></div></div>`:'';
  const auditRecent=STATE.audit.slice(0,5).map(l=>`<div class="log-entry" style="padding:8px 0;border-bottom:1px solid var(--border);"><div class="log-time">${new Date(l.ts).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div><div class="log-icon">${l.icon||'📋'}</div><div class="log-txt" style="font-size:.8rem;">${l.msg}</div></div>`).join('')||'<p style="color:var(--text-dim);font-size:.8rem;">Nenhuma atividade.</p>';
  return `<div class="stitle">▸ PAINEL INICIAL</div><div class="card" style="margin-bottom:20px;"><div style="display:flex;align-items:center;gap:14px;margin-bottom:10px;"><div class="u-avatar" style="width:56px;height:56px;font-size:1.5rem;${AVATAR_POS}">${avatarContent(me)}</div><div><div style="font-family:'Orbitron',sans-serif;font-size:1.15rem;color:var(--accent);">${me.nome}</div><div style="font-family:'Share Tech Mono',monospace;font-size:.65rem;color:var(--text-dim);letter-spacing:.1em;">${(CARGO_LABEL[me.cargo]||me.cargo).toUpperCase()} — GMPOL SISTEMA CENTRAL</div></div></div><div style="font-family:'Share Tech Mono',monospace;font-size:.6rem;color:var(--text-dim);margin-bottom:14px;">${today}</div><p style="color:var(--text-mid);font-size:.92rem;line-height:1.6;">${msgs[me.cargo]||'Bem-vindo.'}</p></div>${cardAvaliacao}${histFbHtml}${statsCards}<div class="card" style="margin-top:20px;"><div style="font-family:'Orbitron',sans-serif;font-size:.7rem;color:var(--accent);letter-spacing:.12em;margin-bottom:12px;">▸ ÚLTIMAS ATIVIDADES</div>${auditRecent}</div>`;
}
function renderEstrelasHtml(n){let s='';for(let i=1;i<=5;i++){s+=`<span style="color:${i<=n?'var(--warn)':'var(--text-dim)'};font-size:1rem;">★</span>`;}return s;}
let _fbNotaAtual=0;
function setEstrela(n){_fbNotaAtual=n;document.querySelectorAll('#fb-estrelas .fb-star').forEach((el,idx)=>{const ativa=idx+1<=n;el.style.color=ativa?'var(--warn)':'var(--text-dim)';el.style.transform=ativa?'scale(1.12)':'scale(1)';el.style.textShadow=ativa?'0 0 8px rgba(224,192,96,.5)':'none';});const labels=['','Péssimo','Ruim','Regular','Bom','Excelente'];const txt=document.getElementById('fb-nota-txt');if(txt)txt.innerHTML=`<b style="color:var(--warn);">${n}★ ${labels[n]}</b>`;}
async function enviarFeedback(){const nota=_fbNotaAtual;const texto=(document.getElementById('fb-texto')?.value||'').trim();if(!nota||nota<1||nota>5){toast('Selecione uma nota de 1 a 5 estrelas.','d');return;}if(texto.length<3){toast('Escreva pelo menos 3 caracteres.','w');return;}const btn=document.getElementById('btn-fb-enviar');if(btn){btn.disabled=true;btn.textContent='▸ ENVIANDO...';}try{await API.createFeedback({userLogin:me.user,nome:me.nome,nota,texto});toast('✅ Avaliação enviada!','s',7000);_fbNotaAtual=0;renderTab(activeTab);}catch(e){toast(e.message||'Erro.','d');if(btn){btn.disabled=false;btn.textContent='📤 ENVIAR AVALIAÇÃO';}}}
async function excluirFeedback(id){if(!confirm('Excluir esta avaliação?'))return;try{await API.deleteFeedback(id,me.user);toast('Avaliação excluída.','w');renderTab(activeTab);}catch(e){toast(e.message||'Erro.','d');}}

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

// ══ USUÁRIOS (+ AJUSTE DE HORAS) ══
function vUsuarios(){
  const myP=CARGO_PERM[me.cargo]||0;const master=isMaster();
  const rows=STATE.users.map(u=>{
    const isMe=u.user===me.user,tP=CARGO_PERM[u.cargo]||0;
    const canAct=!isMe&&(master||myP>tP);
    const isRei=(u.cargo==='admin')&&!master;
    const isBanned=u.banExpires&&u.banExpires>Date.now();
    const bannedBadge=isBanned?'<span class="ban-badge">⛔ SUSPENSO</span>':'';
    const opts=Object.entries(CARGO_LABEL).filter(([k])=>master||(CARGO_PERM[k]||0)<myP).map(([k,v])=>'<option value="'+k+'" '+(u.cargo===k?'selected':'')+'>'+v+'</option>').join('');
    const cargoCell=(canAct&&!isRei&&(master||myP>=6)&&opts)?'<select class="cargo-select" onchange="alterarCargo(\''+u.user+'\', this.value, this)">'+opts+'</select>':'<span class="cargo-badge '+(CARGO_BADGE_CLASS[u.cargo]||'')+'">'+(CARGO_LABEL[u.cargo]||u.cargo)+'</span>';
    const nn=u.nome.replace(/'/g,"\\'");
    const horasExtras=u.horasExtrasAjustadas||0;
    const horasDevidas=u.horasDevidasAjustadas||0;
    const horasBadge=(master&&!isMe)?`<div style="display:flex;gap:4px;margin-top:4px;">${horasExtras>0?`<span style="font-size:.58rem;padding:2px 6px;background:rgba(74,222,128,.15);border:1px solid rgba(74,222,128,.4);border-radius:999px;color:#4ade80;">+${horasExtras}min</span>`:''}${horasDevidas>0?`<span style="font-size:.58rem;padding:2px 6px;background:rgba(248,113,113,.15);border:1px solid rgba(248,113,113,.4);border-radius:999px;color:#f87171;">-${horasDevidas}min</span>`:''}</div>`:'';
    return '<tr><td><div style="display:flex;align-items:center;gap:10px;"><div class="u-avatar" style="'+AVATAR_POS+'">'+avatarContent(u)+'</div><div><div style="font-weight:600;">'+u.nome+' '+bannedBadge+'</div><div style="font-family:\'Share Tech Mono\',monospace;font-size:.6rem;color:var(--text-dim);">@'+u.user+'</div>'+horasBadge+'</div></div></td><td>'+cargoCell+'</td><td><span class="status-chip '+(u.ativo?'sc-a':'sc-r')+'">'+(u.ativo?'✅ Ativo':'❌ Inativo')+'</span></td><td style="font-family:\'Share Tech Mono\',monospace;font-size:.62rem;color:var(--text-dim);">'+(u.criadoPor||'padrão')+'</td><td><div style="display:flex;gap:5px;flex-wrap:wrap;">'+(isMe?'<span style="font-family:\'Share Tech Mono\',monospace;font-size:.6rem;color:var(--accent);">VOCÊ</span>':'')+(master&&!isMe?'<button class="btn btn-warn btn-xs" onclick="abrirModalHoras(\''+u.user+'\',\''+nn+'\')" title="Ajustar horas">⏱️</button>':'')+(canAct?'<button class="btn btn-warn btn-xs" onclick="abrirResetSenha(\''+u.user+'\',\''+nn+'\')">🔑</button>':'')+(canAct&&!isBanned?'<button class="btn btn-danger btn-xs" onclick="abrirBanModal(\''+u.user+'\',\''+nn+'\',\''+u.cargo+'\')">⛔ SUSPENDER</button>':'')+(canAct&&isBanned?'<button class="btn btn-success btn-xs" onclick="removerBan(\''+u.user+'\',\''+nn+'\')">✅ LIBERAR</button>':'')+(canAct&&(master||myP>=6)?'<button class="btn btn-xs '+(u.ativo?'btn-danger':'btn-success')+'" onclick="toggleStatus(\''+u.user+'\','+((!u.ativo))+')">'+(u.ativo?'🚫':'✅')+'</button>':'')+((master||myP>=7)&&!isMe?'<button class="btn btn-danger btn-xs" onclick="confirmarDeleteUser(\''+u.user+'\',\''+nn+'\')">🗑</button>':'')+'</div></td></tr>';
  }).join('');
  return '<div class="stitle">▸ GERENCIAR USUÁRIOS</div>'+((master||myP>=6)?'<div style="display:flex;justify-content:flex-end;margin-bottom:16px;"><button class="btn btn-success btn-sm" onclick="abrirCriarUsuario()">+ CRIAR USUÁRIO</button></div>':'')+'<div class="card c-none" style="padding:0;overflow:hidden;"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>USUÁRIO</th><th>CARGO</th><th>STATUS</th><th>CRIADO POR</th><th>AÇÕES</th></tr></thead><tbody>'+rows+'</tbody></table></div></div><div style="margin-top:10px;" class="hint">Total: <span>'+STATE.users.length+'</span> usuário(s).'+(master?' • <b style="color:var(--warn);">⏱️ = Ajustar horas do usuário</b>':'')+'</div>';
}

function abrirModalHoras(username,nome){
  if(!isMaster())return;
  const u=STATE.users.find(x=>x.user===username);
  if(!u)return;
  const extras=u.horasExtrasAjustadas||0;
  const devidas=u.horasDevidasAjustadas||0;
  const modal=document.createElement('div');
  modal.className='bonus-modal';
  modal.id='horas-modal';
  modal.innerHTML=`
    <div class="bonus-modal-content" style="border-color:rgba(251,191,36,.5);">
      <div class="bonus-modal-title" style="background:linear-gradient(135deg,#fbbf24,#f59e0b);-webkit-background-clip:text;background-clip:text;">⏱️ AJUSTAR HORAS</div>
      <div class="bonus-modal-sub">${nome} (@${username})</div>
      <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:14px;margin-bottom:16px;">
        <div style="font-size:.75rem;color:var(--text-dim);margin-bottom:6px;">SALDO ATUAL DE AJUSTES</div>
        <div style="display:flex;gap:14px;">
          <div style="flex:1;"><span style="color:var(--text-dim);font-size:.7rem;">Horas extras:</span> <b style="color:#4ade80;">+${extras} min</b></div>
          <div style="flex:1;"><span style="color:var(--text-dim);font-size:.7rem;">Horas devidas:</span> <b style="color:#f87171;">-${devidas} min</b></div>
        </div>
      </div>
      <div class="fg" style="margin-bottom:10px;">
        <label>⏱️ Horas extras a ADICIONAR (minutos)</label>
        <input type="number" id="h-extras" placeholder="Ex: 60, -30, 0" value="0">
        <div style="font-size:.68rem;color:var(--text-dim);margin-top:4px;">Use valores <b>negativos</b> para subtrair</div>
      </div>
      <div class="fg" style="margin-bottom:16px;">
        <label>⛔ Horas devidas a ADICIONAR (minutos)</label>
        <input type="number" id="h-devidas" placeholder="Ex: 30, 0" value="0">
        <div style="font-size:.68rem;color:var(--text-dim);margin-top:4px;">Valores sempre positivos (débito aumenta)</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
        <button class="btn btn-success btn-xs" onclick="setHorasRapido('extras',60)">+1h extras</button>
        <button class="btn btn-success btn-xs" onclick="setHorasRapido('extras',120)">+2h extras</button>
        <button class="btn btn-warn btn-xs" onclick="setHorasRapido('extras',-60)">-1h extras</button>
        <button class="btn btn-danger btn-xs" onclick="setHorasRapido('devidas',60)">+1h devidas</button>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-danger btn-sm" onclick="zerarHorasUsuario('${username}')" style="flex:1;">🗑️ ZERAR TUDO</button>
        <button class="btn btn-warn btn-sm" onclick="zerarSoExtras('${username}')" style="flex:1;">Zerar extras</button>
        <button class="btn btn-warn btn-sm" onclick="zerarSoDevidas('${username}')" style="flex:1;">Zerar devidas</button>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;">
        <button class="bonus-modal-close" onclick="fecharModalHoras()" style="flex:0 0 auto;">CANCELAR</button>
        <button class="btn btn-primary btn-sm" onclick="salvarHorasUsuario('${username}')" style="flex:1;">💾 SALVAR AJUSTES</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}
function setHorasRapido(tipo,min){
  const input=document.getElementById(tipo==='extras'?'h-extras':'h-devidas');
  if(input)input.value=parseInt(input.value||0)+min;
}
function fecharModalHoras(){const m=document.getElementById('horas-modal');if(m)m.remove();}
async function salvarHorasUsuario(username){
  const extras=parseInt(document.getElementById('h-extras').value)||0;
  const devidas=parseInt(document.getElementById('h-devidas').value)||0;
  if(extras===0&&devidas===0){toast('Nenhum valor informado.','w');return;}
  try{
    const res=await API.ajustarHoras(username,{acao:'ajustar',extrasMins:extras,devidasMins:devidas,feitorPor:me.user});
    if(res&&res.ok){
      toast(`✅ Horas ajustadas: ${extras>=0?'+':''}${extras}min extras, ${devidas>=0?'+':''}${devidas}min devidas`,'s',6000);
      fecharModalHoras();
    }else toast(res?.error||'Erro.','d');
  }catch(e){toast(e.message||'Erro.','d');}
}
async function zerarHorasUsuario(username){
  if(!confirm('Zerar TODAS as horas extras e devidas deste usuário?'))return;
  try{
    const res=await API.ajustarHoras(username,{acao:'zerar',feitorPor:me.user});
    if(res&&res.ok){toast('✅ Todas as horas zeradas!','s');fecharModalHoras();}
    else toast(res?.error||'Erro.','d');
  }catch(e){toast(e.message||'Erro.','d');}
}
async function zerarSoExtras(username){
  if(!confirm('Zerar apenas as HORAS EXTRAS deste usuário?'))return;
  try{
    const res=await API.ajustarHoras(username,{acao:'zerar_extras',feitorPor:me.user});
    if(res&&res.ok){toast('✅ Horas extras zeradas!','s');fecharModalHoras();}
    else toast(res?.error||'Erro.','d');
  }catch(e){toast(e.message||'Erro.','d');}
}
async function zerarSoDevidas(username){
  if(!confirm('Zerar apenas as HORAS DEVIDAS deste usuário?'))return;
  try{
    const res=await API.ajustarHoras(username,{acao:'zerar_devidas',feitorPor:me.user});
    if(res&&res.ok){toast('✅ Horas devidas zeradas!','s');fecharModalHoras();}
    else toast(res?.error||'Erro.','d');
  }catch(e){toast(e.message||'Erro.','d');}
}

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
function somarBancoHoras(userLogin){
  const u=STATE.users.find(x=>x.user===userLogin);
  const pontosUser=STATE.pontos.filter(p=>p.userLogin===userLogin&&p.type==='saida'&&p.trabalhado!==undefined);
  let totalTrab=0,totalExtraCalc=0,totalDebtCalc=0,totalPausa=0,turnos=0;
  pontosUser.forEach(p=>{
    totalTrab+=(p.trabalhado||0);
    totalPausa+=(p.pausaMins||0);
    totalExtraCalc+=(p.extraMins||0);
    totalDebtCalc+=(p.debtMins||0);
    turnos++;
  });
  const ajE=u?.horasExtrasAjustadas||0;
  const ajD=u?.horasDevidasAjustadas||0;
  const totalExtra=Math.max(0,totalExtraCalc+ajE);
  const totalDebt=Math.max(0,totalDebtCalc+ajD);
  const totalReais=Math.floor(Math.max(0,totalExtra)/30)*20;
  return{totalTrab,totalExtra,totalDebt,totalReais,turnos,totalPausa,ajE,ajD};
}
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
  const ajustesBadge=(bh.ajE>0||bh.ajD>0)?`<div style="margin-top:10px;padding:10px 14px;background:rgba(139,92,246,.08);border:1px solid rgba(139,92,246,.3);border-radius:10px;${FM}font-size:.72rem;color:#a78bfa;">⏱️ <b>AJUSTES DO MASTER:</b> ${bh.ajE>0?`+${bh.ajE}min extras `:''}${bh.ajD>0?`+${bh.ajD}min devidas`:''}</div>`:'';
  const bancoHorasHtml=`<div class="card" style="margin-bottom:20px;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;"><div style="font-family:'Orbitron',sans-serif;font-size:.72rem;color:var(--accent);letter-spacing:.14em;">💼 MEU BANCO DE HORAS</div><div style="font-family:'Share Tech Mono',monospace;font-size:.62rem;color:var(--text-dim);">${bh.turnos} turno(s)</div></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px;"><div style="padding:14px;background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:12px;text-align:center;"><div style="${FO}font-size:1.5rem;color:var(--text);font-weight:800;margin-bottom:2px;">${fmtHM(bh.totalTrab)}</div><div style="${FM}font-size:.6rem;color:var(--text-dim);letter-spacing:.1em;text-transform:uppercase;">TRABALHADAS</div></div><div style="padding:14px;background:rgba(74,222,128,.06);border:1px solid rgba(74,222,128,.2);border-radius:12px;text-align:center;"><div style="${FO}font-size:1.5rem;color:#4ade80;font-weight:800;margin-bottom:2px;">+${fmtHM(bh.totalExtra)}</div><div style="${FM}font-size:.6rem;color:var(--text-dim);letter-spacing:.1em;text-transform:uppercase;">HORAS EXTRAS</div><div style="${FM}font-size:.68rem;color:#4ade80;margin-top:4px;">R$ ${bh.totalReais.toFixed(2).replace('.',',')}</div></div><div style="padding:14px;background:rgba(248,113,113,.06);border:1px solid rgba(248,113,113,.2);border-radius:12px;text-align:center;"><div style="${FO}font-size:1.5rem;color:#f87171;font-weight:800;margin-bottom:2px;">-${fmtHM(bh.totalDebt)}</div><div style="${FM}font-size:.6rem;color:var(--text-dim);letter-spacing:.1em;text-transform:uppercase;">HORAS DEVIDAS</div></div><div style="padding:14px;background:rgba(255,255,255,.03);border:1px solid var(--border2);border-radius:12px;text-align:center;"><div style="${FO}font-size:1.5rem;color:${saldoColor};font-weight:800;margin-bottom:2px;">${saldoStr}</div><div style="${FM}font-size:.6rem;color:var(--text-dim);letter-spacing:.1em;text-transform:uppercase;">SALDO</div></div></div>${ajustesBadge}<div style="${FM}font-size:.64rem;color:var(--text-dim);line-height:1.5;padding:10px 12px;background:rgba(255,255,255,.02);border-radius:8px;">💡 <b style="color:var(--text-mid);">Como funciona:</b> carga diária por cargo; <b style="color:#4ade80;">acima</b> gera extras (+R$20/30min) e <b style="color:#a78bfa;">+1 🎰 giro/hora extra</b>; <b style="color:#f87171;">abaixo</b> gera horas devidas.</div></div>`;
  const minhaTab=mine.length?'<table class="tbl"><thead><tr><th>DATA</th><th>TIPO</th><th>HORA</th><th>DETALHES</th></tr></thead><tbody>'+[...mine].reverse().slice(0,30).map(function(p){let det='';let tipoLbl,tipoCor;if(p.type==='entrada'){tipoLbl='▶ ENTRADA';tipoCor='color:#4ade80;';}else if(p.type==='folga'){tipoLbl='🌴 FOLGA';tipoCor='color:var(--warn);';det='<span style="color:var(--warn);font-size:.65rem;">Dia de folga</span>';}else if(p.type==='pausa_inicio'){tipoLbl='⏸ PAUSA';tipoCor='color:var(--warn);';det='<span style="color:var(--warn);font-size:.65rem;">Início da pausa</span>';}else if(p.type==='pausa_fim'){tipoLbl='▶ RETOMADA';tipoCor='color:#60a5fa;';det='<span style="color:#60a5fa;font-size:.65rem;">Fim da pausa</span>';}else{tipoLbl='⏹ SAÍDA';tipoCor='color:#f87171;';}if(p.type==='saida'&&p.trabalhado!==undefined){const h=Math.floor(p.trabalhado/60),m=p.trabalhado%60;det='<b style="color:var(--accent);">'+h+'h'+(m>0?m.toString().padStart(2,'0'):'00')+'</b> líquido';if(p.pausaMins>0)det+='<br><span style="color:var(--warn);font-size:.65rem;">⏸ '+p.pausaMins+'min de pausa</span>';if(p.extraReais>0)det+='<br><span style="color:#4ade80;font-size:.65rem;">+ R$ '+p.extraReais+'</span>';if(p.extraMins>=60)det+='<br><span style="color:#a78bfa;font-size:.65rem;">🎰 +'+Math.floor(p.extraMins/60)+' giro(s)</span>';if(p.debtMins>0){const dh=Math.floor(p.debtMins/60),dm=p.debtMins%60;det+='<br><span style="color:#f87171;font-size:.65rem;">Faltou '+dh+'h'+dm.toString().padStart(2,'0')+'</span>';}}return('<tr><td style="'+FM+'">'+(p.data||brDateOf(p.ts))+'</td><td style="'+FM+tipoCor+'">'+tipoLbl+'</td><td style="'+FM+'color:var(--accent);font-weight:700;">'+p.hora+'</td><td style="font-size:.75rem;line-height:1.2;">'+det+'</td></tr>');}).join('')+'</tbody></table>':'<p style="color:var(--text-dim);'+FM+'font-size:.68rem;">Nenhum ponto.</p>';
  const emPausa=lastPonto&&lastPonto.type==='pausa_inicio';
  const emTurno=lastPonto&&(lastPonto.type==='entrada'||lastPonto.type==='pausa_retomar'||lastPonto.type==='pausa_fim');
  const ultimaEntrada=[...mine].reverse().find(p=>p.type==='entrada');
  let botaoPonto='';
  if(!lastPonto||lastPonto.type==='saida'||lastPonto.type==='folga'){
    botaoPonto='<button class="btn btn-primary" id="btn-ponto" style="font-size:.85rem;padding:12px 32px;" onclick="baterPonto(\'entrada\')">▶ BATER ENTRADA</button>';
  }else if(emPausa){
    botaoPonto='<div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;"><button class="btn btn-success" style="font-size:.85rem;padding:12px 24px;" onclick="baterPonto(\'pausa_fim\')">▶ RETOMAR TURNO</button></div>'
      +'<div style="margin-top:12px;padding:10px 14px;background:rgba(224,192,96,.08);border:1px solid rgba(224,192,96,.3);border-radius:10px;'+FM+'font-size:.75rem;color:var(--warn);">⏸️ <b>EM PAUSA</b> desde '+lastPonto.hora+' — o tempo <b>não</b> está contando.</div>';
  }else if(emTurno){
    botaoPonto='<div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;">'
      +'<button class="btn btn-warn" style="font-size:.85rem;padding:12px 20px;" onclick="baterPonto(\'pausa_inicio\')">⏸ PAUSAR</button>'
      +'<button class="btn btn-danger" style="font-size:.85rem;padding:12px 20px;" onclick="baterPonto(\'saida\')">⏹ ENCERRAR TURNO</button>'
      +'</div>'
      +'<div style="margin-top:10px;'+FM+'font-size:.68rem;color:var(--accent);">Turno ativo desde '+(ultimaEntrada?ultimaEntrada.hora:'--')+'</div>';
  }
  var supervHtml='';
  if(isSuperv){
    const tabelaHoje=hoje2.length?'<table class="tbl"><thead><tr><th>AGENTE</th><th>HORA</th><th>CARGO</th></tr></thead><tbody>'+hoje2.map(function(p){const lbl=p.type==='folga'?'🌴':p.hora;return('<tr><td><b>'+p.nome+'</b></td><td style="'+FM+'color:var(--accent);font-weight:700;">'+lbl+'</td><td><span class="cargo-badge '+(CARGO_BADGE_CLASS[p.cargo]||'')+'" style="font-size:.55rem;">'+(CARGO_LABEL[p.cargo]||p.cargo)+'</span></td></tr>');}).join('')+'</tbody></table>':'<p style="color:var(--text-dim);'+FM+'font-size:.68rem;">Nenhum hoje.</p>';
    const tabelaAgentes=Object.entries(porUser).map(function(kv){const login=kv[0],pts=kv[1];const u=STATE.users.find(function(u){return u.user===login;});const nm=u?u.nome:login;const cg=u?u.cargo:'';const rows=[...pts].reverse().map(function(p){return '<tr><td style="'+FM+'">'+(p.data||brDateOf(p.ts))+'</td><td style="'+FM+'color:var(--accent);font-weight:700;">'+p.hora+'</td><td style="'+FM+'font-size:.65rem;color:var(--text-dim);">'+(p.type==='folga'?'FOLGA':p.type==='pausa_inicio'?'⏸ PAUSA':p.type==='pausa_fim'?'▶ RETOMADA':p.type.toUpperCase())+'</td></tr>';}).join('');return '<div class="ponto-agente-block"><div class="ponto-agente-header" onclick="togglePontoAgente(\'pa-'+login+'\')"><div><div class="u-avatar" style="display:inline-flex;width:28px;height:28px;font-size:.7rem;'+AVATAR_POS+'">'+avatarContent(u)+'</div><b style="margin-left:8px;">'+nm+'</b><span class="cargo-badge '+(CARGO_BADGE_CLASS[cg]||'')+'" style="font-size:.5rem;margin-left:8px;">'+(CARGO_LABEL[cg]||cg)+'</span></div><span style="'+FM+'font-size:.65rem;color:var(--text-dim);">'+pts.length+' reg. ▾</span></div><div id="pa-'+login+'" style="display:none;"><table class="tbl"><thead><tr><th>DATA</th><th>HORA</th><th>TIPO</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';}).join('');
    supervHtml='<div class="card" style="margin-bottom:20px;"><div style="'+FO+'font-size:.68rem;color:var(--accent);letter-spacing:.12em;margin-bottom:12px;">▸ PONTOS HOJE</div>'+tabelaHoje+'</div><div class="card"><div style="'+FO+'font-size:.68rem;color:var(--accent);letter-spacing:.12em;margin-bottom:12px;">▸ HISTÓRICO POR AGENTE</div>'+tabelaAgentes+'</div>';
  }
  return '<div class="stitle">▸ BATER PONTO</div>'+'<div class="card" style="margin-bottom:20px;text-align:center;"><div style="'+FO+'font-size:.7rem;color:var(--accent);letter-spacing:.14em;margin-bottom:12px;">▸ REGISTRO DE PONTO</div><div id="rel-clock" style="'+FO+'font-size:2rem;color:var(--text);margin-bottom:8px;letter-spacing:.1em;">--:--:--</div><div id="rel-date" style="'+FM+'font-size:.65rem;color:var(--text-dim);margin-bottom:20px;"></div>'+botaoPonto+folgaHtml+cicloHtml+'</div>'+bancoHorasHtml+'<div class="card" style="margin-bottom:20px;"><div style="'+FO+'font-size:.68rem;color:var(--accent);letter-spacing:.12em;margin-bottom:12px;">▸ MEUS REGISTROS</div>'+minhaTab+'</div>'+supervHtml;
}
function togglePontoAgente(id){const el=document.getElementById(id);if(el)el.style.display=el.style.display==='none'?'':'none';}
function startClock(){clearInterval(_clockInterval);_clockInterval=setInterval(()=>{const ce=document.getElementById('rel-clock'),de=document.getElementById('rel-date');if(!ce){clearInterval(_clockInterval);return;}ce.textContent=brTimeSec();if(de)de.textContent=brDateLong();},1000);}
async function baterPonto(type){
  if(_busyPonto)return;
  _busyPonto=true;
  try{
    const p={userLogin:me.user,nome:me.nome,cargo:me.cargo,type:type,hora:brTimeSec(),data:brDate(),ts:Date.now()};
    const res=await API.createPonto(p);
    if(res&&res.error){toast(res.error,'d');return;}
    if(type==='entrada'){
      toast('✅ Entrada registrada às '+p.hora+'!','s');
    }else if(type==='pausa_inicio'){
      toast('⏸️ Pausa iniciada às '+p.hora+' — o tempo não está contando.','s',6000);
    }else if(type==='pausa_fim'){
      toast('▶️ Turno retomado às '+p.hora+'!','s');
    }else if(type==='saida'){
      const rp=(res&&res.ponto)?res.ponto:{};
      if(rp.trabalhado!==undefined){
        const h=Math.floor(rp.trabalhado/60),m=rp.trabalhado%60;
        let msg='✅ Turno encerrado às '+p.hora+'!<br><b>'+h+'h'+(m>0?m.toString().padStart(2,'0'):'00')+'</b> trabalhadas (líquido)';
        if(rp.pausaMins>0)msg+='<br><b style="color:var(--warn);">⏸️ '+rp.pausaMins+'min descontado(s) de pausa</b>';
        if(rp.extraReais>0)msg+='<br><b style="color:#4ade80;">💰 Extras: R$ '+rp.extraReais+'</b>';
        if(res.girosGanhos>0)msg+='<br><b style="color:#a78bfa;">🎰 +'+res.girosGanhos+' giro(s) de roleta!</b>';
        if(rp.debtMins>0){const dh=Math.floor(rp.debtMins/60),dm=rp.debtMins%60;msg+='<br><b style="color:#f87171;">Faltou '+dh+'h'+dm.toString().padStart(2,'0')+'</b>';}
        if(rp.folgaDia)msg+='<br><b style="color:var(--warn);">🌴 Folga: '+rp.folgaDia+'</b>';
        toast(msg,'s',9000);
      }else toast('✅ Saída registrada às '+p.hora+'!','s');
    }
    renderTab(activeTab);
  }catch(e){toast(e.message||'Erro.','d');}
  finally{setTimeout(()=>{_busyPonto=false;},1500);}
}

function vAuditoria(){const logs=STATE.audit;if(!logs.length)return'<div class="stitle">▸ AUDITORIA</div>'+empty('🔍','Nenhum evento.');return'<div class="stitle">▸ AUDITORIA DO SISTEMA</div><div style="display:flex;justify-content:flex-end;margin-bottom:12px;"><button class="btn btn-danger btn-sm" onclick="limparAuditoria()">🗑 LIMPAR LOG</button></div><div class="card c-none" style="max-height:580px;overflow-y:auto;">'+logs.map(l=>'<div class="log-entry"><div class="log-time">'+new Date(l.ts).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+'</div><div class="log-icon">'+(l.icon||'📋')+'</div><div class="log-txt">'+l.msg+'</div></div>').join('')+'</div><div style="margin-top:10px;" class="hint">'+logs.length+' evento(s).</div>';}
async function limparAuditoria(){if(!confirm('Limpar auditoria?'))return;try{await API.clearAudit();toast('Auditoria limpa.','w');}catch(e){toast(e.message,'d');}}

async function alterarSenhaPropria(){const at=document.getElementById('s-atual').value,nv=document.getElementById('s-nova').value,cf=document.getElementById('s-conf').value;if(!at||!nv||!cf){toast('Preencha todos os campos.','d');return;}if(nv.length<6){toast('Nova senha: mínimo 6 caracteres.','w');return;}if(nv!==cf){toast('Confirmação não confere.','d');return;}try{const check=await API.login(me.user,at);if(!check||check.banned){toast('Senha atual incorreta.','d');return;}if(!check.user){toast('Senha atual incorreta.','d');return;}}catch(e){toast('Senha atual incorreta.','d');return;}try{await API.resetSenha(me.user,nv,me.nome);toast('Senha alterada!','s');closeModal('m-senha');['s-atual','s-nova','s-conf'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});}catch(e){toast(e.message||'Erro.','d');}}

// ══ ROLETA ══
const ROLETA_CARGOS_PERMITIDOS=['gm','agente','tatico','escrivao'];
const ROLETA_COOLDOWN_MS=24*60*60*1000;
const ROLETA_PREMIOS_DEFAULT=[
  {id:'p1',valor:100,peso:70,cor:'#10b981',cor2:'#059669',corBorda:'#34d399',nome:'Comum',icone:'💵',raridade:'common'},
  {id:'p2',valor:500,peso:20,cor:'#3b82f6',cor2:'#1d4ed8',corBorda:'#60a5fa',nome:'Incomum',icone:'💰',raridade:'uncommon'},
  {id:'p3',valor:2000,peso:40,cor:'#f59e0b',cor2:'#b45309',corBorda:'#fbbf24',nome:'Raro',icone:'💎',raridade:'rare'},
  {id:'p4',valor:3000,peso:5,cor:'#ef4444',cor2:'#991b1b',corBorda:'#f87171',nome:'Muito Raro',icone:'🏆',raridade:'epic'},
  {id:'p5',valor:4000,peso:5,cor:'#8b5cf6',cor2:'#5b21b6',corBorda:'#a78bfa',nome:'Épico',icone:'👑',raridade:'epic2'},
  {id:'p6',valor:10000,peso:0.5,cor:'#ec4899',cor2:'#9d174d',corBorda:'#f9a8d4',nome:'LENDÁRIO',icone:'💠',raridade:'legendary'}
];
function getPremiosAtuais(){return (STATE.roletaPremios&&STATE.roletaPremios.length>0)?STATE.roletaPremios:ROLETA_PREMIOS_DEFAULT;}
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
  const premios=getPremiosAtuais();
  if(!cargoPermitido){return `<div class="stitle">▸ ROLETA DA SORTE</div><div class="card" style="text-align:center;padding:50px 20px;"><div style="font-size:4rem;margin-bottom:20px;">🔒</div><div style="font-size:1.3rem;font-weight:800;color:var(--text);margin-bottom:10px;">ACESSO RESTRITO</div><div style="color:var(--text-mid);font-size:.88rem;line-height:1.7;max-width:400px;margin:0 auto;">Disponível apenas para:<br><b style="color:var(--accent);">Guarda, Agente, Tático e Escrivão</b></div></div>`;}
  const botoesAdmin=st.master?`<div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="roleta-master-btn" onclick="abrirModalBonus()"><span class="roleta-master-btn-ico">🎁</span><span>LIBERAR GIROS</span></button><button class="roleta-master-btn" style="background:linear-gradient(135deg,#10b981,#059669);box-shadow:0 4px 16px rgba(16,185,129,.4);" onclick="abrirEditorPremios()"><span class="roleta-master-btn-ico">🎰</span><span>EDITAR PRÊMIOS</span></button></div>`:'';
  const bannerMaster=st.master?`<div class="roleta-master-banner"><div class="roleta-master-glow"></div><div class="roleta-master-content"><span class="roleta-master-ico">👑</span><div class="roleta-master-txt"><div class="roleta-master-main">ACESSO ILIMITADO</div><div class="roleta-master-sub">Master gira quantas vezes quiser</div></div></div></div>`:'';
  const bannerBonus=st.giros>0?`<div class="roleta-bonus-banner"><div class="roleta-bonus-glow"></div><div class="roleta-bonus-content"><span class="roleta-bonus-ico">🎁</span><div class="roleta-bonus-txt"><div class="roleta-bonus-main">Você tem <b>${st.giros}</b> giro(s) bônus!</div><div class="roleta-bonus-sub">Por hora extra ou liberados pelo Master</div></div></div></div>`:'';
  const bannerCooldown=(!st.podeGirar&&!st.master)?`<div class="roleta-cooldown-banner"><div class="roleta-cooldown-ico">⏳</div><div class="roleta-cooldown-txt"><div class="roleta-cooldown-main">Próximo giro gratuito em</div><div class="roleta-cooldown-timer" id="roleta-cd-timer">${cdTxt}</div><div class="roleta-cooldown-hint">💡 Faça horas extras para +1 giro/hora!</div></div></div>`:'';
  return `<div class="roleta-hero"><div class="roleta-hero-header"><div><div class="roleta-hero-title">🎰 ROLETA DA SORTE</div><div class="roleta-hero-sub">1 giro/dia • +1 giro/hora extra • Master ilimitado</div></div>${botoesAdmin}</div>${bannerMaster}${bannerBonus}${bannerCooldown}<div class="roleta-stage"><div class="roleta-wheel-wrap"><div class="roleta-pointer"></div><div class="roleta-canvas-container"><canvas id="roleta-canvas" width="600" height="600"></canvas><div class="roleta-leds" id="roleta-leds"></div></div></div><button class="roleta-spin-btn" id="roleta-spin-btn" onclick="girarRoleta()">${st.master?'👑 GIRAR (ILIMITADO)':(st.podeGirar?'🎰 GIRAR ROLETA':'🎰 OBTER GIROS')}</button></div><div class="roleta-prizes">${premios.map(p=>`<div class="roleta-prize-card ${p.raridade}"><div class="roleta-prize-rarity">${p.raridade==='legendary'?'★ LENDÁRIO':p.nome.toUpperCase()}</div><div class="roleta-prize-icon">${p.icone}</div><div class="roleta-prize-value">R$ ${p.valor.toLocaleString('pt-BR')}</div><div class="roleta-prize-name">${p.nome}</div></div>`).join('')}</div><div class="roleta-info"><div class="roleta-info-title">📋 Como Funciona</div><div class="roleta-info-step"><div class="roleta-info-step-num">1</div><div class="roleta-info-text">Gire <b>1x por dia</b> (ou use giros bônus)</div></div><div class="roleta-info-step"><div class="roleta-info-step-num">2</div><div class="roleta-info-text"><b>+1 giro</b> a cada hora extra no ponto</div></div><div class="roleta-info-step"><div class="roleta-info-step-num">3</div><div class="roleta-info-text">Ao ganhar, <b>tire print</b> e envie no Chat</div></div></div></div>`;
}
function desenharRoleta(){
  const canvas=document.getElementById('roleta-canvas');if(!canvas)return;
  const ctx=canvas.getContext('2d');const W=canvas.width,H=canvas.height;const cx=W/2,cy=H/2;const raio=W/2-20;
  const premios=getPremiosAtuais();
  ctx.clearRect(0,0,W,H);ctx.save();ctx.translate(cx,cy);
  const numFatias=premios.length;const angFatia=(2*Math.PI)/numFatias;
  const gradAnel=ctx.createRadialGradient(0,0,raio-10,0,0,raio+8);gradAnel.addColorStop(0,'#fbbf24');gradAnel.addColorStop(0.5,'#f59e0b');gradAnel.addColorStop(1,'#78350f');
  ctx.fillStyle=gradAnel;ctx.beginPath();ctx.arc(0,0,raio+8,0,2*Math.PI);ctx.fill();
  premios.forEach((p,i)=>{const ini=i*angFatia-Math.PI/2;const fim=ini+angFatia;const grad=ctx.createRadialGradient(0,0,0,0,0,raio);grad.addColorStop(0,p.cor2);grad.addColorStop(0.6,p.cor);grad.addColorStop(1,p.cor);ctx.fillStyle=grad;ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,raio,ini,fim);ctx.closePath();ctx.fill();ctx.strokeStyle='rgba(0,0,0,.4)';ctx.lineWidth=2;ctx.stroke();ctx.strokeStyle='rgba(255,255,255,.3)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(ini)*raio,Math.sin(ini)*raio);ctx.stroke();});
  ctx.textAlign='center';ctx.textBaseline='middle';
  premios.forEach((p,i)=>{const ang=i*angFatia+angFatia/2-Math.PI/2;ctx.save();ctx.rotate(ang);ctx.font='48px system-ui, sans-serif';ctx.fillText(p.icone,raio*0.62,0);ctx.fillStyle='#fff';ctx.shadowColor='rgba(0,0,0,.8)';ctx.shadowBlur=6;ctx.font='bold 32px "Orbitron", system-ui, sans-serif';ctx.fillText('R$ '+p.valor.toLocaleString('pt-BR'),raio*0.36,0);ctx.shadowBlur=0;ctx.restore();});
  const gradCentro=ctx.createRadialGradient(0,0,0,0,0,60);gradCentro.addColorStop(0,'#fbbf24');gradCentro.addColorStop(0.5,'#dc2626');gradCentro.addColorStop(1,'#7f1d1d');
  ctx.fillStyle=gradCentro;ctx.beginPath();ctx.arc(0,0,55,0,2*Math.PI);ctx.fill();
  ctx.strokeStyle='#fbbf24';ctx.lineWidth=4;ctx.stroke();ctx.strokeStyle='rgba(255,255,255,.5)';ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle='#fff';ctx.shadowColor='rgba(0,0,0,.8)';ctx.shadowBlur=4;ctx.font='bold 28px "Orbitron", system-ui';ctx.fillText('GMPOL',0,-6);ctx.font='600 14px system-ui';ctx.fillText('SORTE',0,14);ctx.shadowBlur=0;ctx.restore();
}
function inicializarLEDs(){
  const wrap=document.getElementById('roleta-leds');if(!wrap||wrap.children.length>0)return;
  const numLeds=20;
  for(let i=0;i<numLeds;i++){const led=document.createElement('div');led.className='roleta-led off';const ang=(i/numLeds)*360;const angRad=(ang-90)*Math.PI/180;const x=50+Math.cos(angRad)*50;const y=50+Math.sin(angRad)*50;led.style.left=x+'%';led.style.top=y+'%';led.style.transform='translate(-50%,-50%)';wrap.appendChild(led);}
  animarLEDs();
}
let _ledInterval=null;
function animarLEDs(){if(_ledInterval)clearInterval(_ledInterval);const leds=document.querySelectorAll('.roleta-led');if(!leds.length)return;let frame=0;_ledInterval=setInterval(()=>{leds.forEach((led,i)=>{led.className='roleta-led '+(((i+frame)%3===0)?'on':'off');});frame++;},300);}
let _cdInterval=null;
function iniciarTimerCooldown(){
  if(_cdInterval)clearInterval(_cdInterval);
  if(!document.getElementById('roleta-cd-timer'))return;
  const tick=()=>{const el=document.getElementById('roleta-cd-timer');if(!el||!me){clearInterval(_cdInterval);_cdInterval=null;return;}const st=_roletaStatus();if(st.podeGirar){clearInterval(_cdInterval);_cdInterval=null;renderTab(activeTab);return;}const h=Math.floor(st.resta/3600000),m=Math.floor((st.resta%3600000)/60000),s=Math.floor((st.resta%60000)/1000);el.textContent=h>0?`${h}h ${m}m ${s}s`:`${m}m ${s}s`;};
  tick();_cdInterval=setInterval(tick,1000);
}
function inicializarRoleta(){desenharRoleta();inicializarLEDs();iniciarTimerCooldown();}
let _roletaGirando=false;
async function girarRoleta(){
  if(_roletaGirando)return;
  const st=_roletaStatus();
  if(!st.podeGirar){mostrarModalSemGiros();return;}
  _roletaGirando=true;
  const btn=document.getElementById('roleta-spin-btn');if(btn){btn.classList.add('spinning');btn.disabled=true;}
  const premios=getPremiosAtuais();
  const totalPeso=premios.reduce((s,p)=>s+p.peso,0);
  let random=Math.random()*totalPeso;let premio=premios[0],idxPremio=0;
  for(let i=0;i<premios.length;i++){random-=premios[i].peso;if(random<=0){premio=premios[i];idxPremio=i;break;}}
  const numFatias=premios.length;const angFatia=360/numFatias;const centroFatia=idxPremio*angFatia+angFatia/2;
  const voltas=7+Math.floor(Math.random()*3);const offsetAleatorio=(Math.random()-0.5)*angFatia*0.6;
  const anguloFinal=voltas*360+(360-centroFatia)+offsetAleatorio;
  const canvas=document.getElementById('roleta-canvas');if(!canvas){_roletaGirando=false;return;}
  canvas.style.transition='none';canvas.style.transform='rotate(0deg)';canvas.offsetHeight;
  canvas.style.transition='transform 5.5s cubic-bezier(0.15,0.7,0.1,1)';canvas.style.transform=`rotate(${anguloFinal}deg)`;
  try{tocarSomRoleta();}catch(_){}
  setTimeout(async()=>{
    try{
      const res=await API.girarRoleta(me.user);
      if(res&&res.ok){if(typeof res.girosBonus==='number')me.girosBonus=res.girosBonus;if(res.ultimoGiro)me.ultimoGiroRoleta=res.ultimoGiro;saveSession();mostrarResultadoRoleta(premio);if(premio.valor>=2000)lancarConfete();}
      else{toast((res&&res.error)||'Não foi possível registrar o giro.','w');_reverterRoda();}
    }catch(e){toast(e.message||'Erro ao registrar giro.','d');_reverterRoda();}
    finally{_roletaGirando=false;renderTab(activeTab);}
  },5600);
}
function _reverterRoda(){const canvas=document.getElementById('roleta-canvas');if(canvas){canvas.style.transition='transform .6s ease-out';canvas.style.transform='rotate(0deg)';}}
let _semGirosInterval=null;
function mostrarModalSemGiros(){
  fecharModalSemGiros();
  const modal=document.createElement('div');modal.className='roleta-modal';modal.id='sem-giros-modal';
  modal.innerHTML=`<div class="roleta-result" style="--result-color:#fbbf24;--result-glow:rgba(251,191,36,.45);max-width:470px;"><div class="roleta-result-icon">😔</div><div class="roleta-result-rarity">VOCÊ FICOU SEM GIROS</div><div style="font-size:.85rem;color:var(--text-mid);margin-bottom:4px;">Aguarde:</div><div class="roleta-result-value" id="sg-timer" style="font-size:2.3rem;margin:4px 0 18px;">--:--:--</div><div style="border-top:1px dashed rgba(251,191,36,.4);padding-top:16px;margin-bottom:14px;"><div style="font-family:'Orbitron',sans-serif;font-size:1rem;font-weight:800;color:var(--text);margin-bottom:12px;">Quer obter mais giros?</div><div class="sg-price-row"><span class="sg-price-qtd">1 giro</span><span class="sg-price-val">R$ 500 no RP</span></div><div class="sg-price-row"><span class="sg-price-qtd">5 giros</span><span class="sg-price-val">R$ 2.500</span></div><div class="sg-price-row sg-best"><span class="sg-price-qtd">10 giros</span><span class="sg-price-val">R$ 5.000</span></div><div class="sg-slogan">INVESTIMENTO FÁCIL<br>PARA DINHEIRO FÁCIL 🤑</div></div><div class="roleta-result-cta">💸 Pague no RP e <b>mande o print para um Admin (Master)</b> para receber seus giros.</div><button class="roleta-result-btn" onclick="fecharModalSemGiros()">✓ ENTENDI</button></div>`;
  document.body.appendChild(modal);
  try{tocarSomRoleta();}catch(_){}
  const tick=()=>{const modalEl=document.getElementById('sem-giros-modal');if(!modalEl){clearInterval(_semGirosInterval);_semGirosInterval=null;return;}const st=_roletaStatus();if(st.podeGirar){clearInterval(_semGirosInterval);_semGirosInterval=null;fecharModalSemGiros();return;}const el=document.getElementById('sg-timer');if(!el)return;const r=st.resta;const h=Math.floor(r/3600000),m=Math.floor((r%3600000)/60000),s=Math.floor((r%60000)/1000);el.textContent=`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;};
  tick();_semGirosInterval=setInterval(tick,1000);
}
function fecharModalSemGiros(){if(_semGirosInterval){clearInterval(_semGirosInterval);_semGirosInterval=null;}const m=document.getElementById('sem-giros-modal');if(m)m.remove();}
function tocarSomRoleta(){try{const ctx=new (window.AudioContext||window.webkitAudioContext)();const osc=ctx.createOscillator();const gain=ctx.createGain();osc.connect(gain);gain.connect(ctx.destination);osc.frequency.value=600;osc.type='triangle';gain.gain.setValueAtTime(0.0001,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(0.1,ctx.currentTime+0.02);gain.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+0.15);osc.start();osc.stop(ctx.currentTime+0.16);}catch(_){}}
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
function tocarSomVitoria(){try{const ctx=new (window.AudioContext||window.webkitAudioContext)();[523.25,659.25,783.99,1046.50].forEach((freq,i)=>{const osc=ctx.createOscillator();const gain=ctx.createGain();osc.connect(gain);gain.connect(ctx.destination);osc.frequency.value=freq;osc.type='triangle';const t=ctx.currentTime+i*0.12;gain.gain.setValueAtTime(0.0001,t);gain.gain.exponentialRampToValueAtTime(0.12,t+0.02);gain.gain.exponentialRampToValueAtTime(0.0001,t+0.25);osc.start(t);osc.stop(t+0.26);});}catch(_){}}
function lancarConfete(){const cores=['#fbbf24','#ec4899','#8b5cf6','#4ade80','#60a5fa','#f87171','#fff'];for(let i=0;i<80;i++){const p=document.createElement('div');p.className='confetti-piece';p.style.left=(Math.random()*100)+'vw';p.style.background=cores[Math.floor(Math.random()*cores.length)];p.style.animationDelay=(Math.random()*0.8)+'s';p.style.animationDuration=(2.5+Math.random()*2)+'s';p.style.width=(6+Math.random()*8)+'px';p.style.height=(6+Math.random()*8)+'px';if(Math.random()>0.5)p.style.borderRadius='50%';document.body.appendChild(p);setTimeout(()=>p.remove(),5000);}}
function fecharResultadoRoleta(btn){const modal=btn.closest('.roleta-modal');if(modal)modal.remove();renderTab(activeTab);}
function abrirModalBonus(){
  if(!isMaster())return;
  const usuarios=STATE.users.filter(u=>ROLETA_CARGOS_PERMITIDOS.includes(u.cargo)&&u.ativo!==false);
  const modal=document.createElement('div');modal.className='bonus-modal';modal.id='bonus-modal';
  modal.innerHTML=`<div class="bonus-modal-content"><div class="bonus-modal-title">🎁 LIBERAR GIROS BÔNUS</div><div class="bonus-modal-sub">Selecione um usuário e informe a quantidade</div><div class="bonus-user-list">${usuarios.length===0?'<div style="text-align:center;padding:20px;color:var(--text-dim);font-size:.85rem;">Nenhum usuário elegível.</div>':usuarios.map(u=>{const g=(typeof u.girosBonus==='number')?u.girosBonus:0;return `<div class="bonus-user-item" onclick="selecionarUsuarioBonus('${u.user}','${u.nome.replace(/'/g,"\\'")}')"><div class="bonus-user-avatar" style="${AVATAR_POS}">${avatarContent(u)}</div><div class="bonus-user-info"><div class="bonus-user-name">${u.nome}</div><div class="bonus-user-cargo">${CARGO_LABEL[u.cargo]||u.cargo}</div>${g>0?`<div class="bonus-user-giros">🎁 ${g} bônus</div>`:''}</div></div>`;}).join('')}</div><button class="bonus-modal-close" onclick="fecharModalBonus()">FECHAR</button></div>`;
  document.body.appendChild(modal);
}
async function selecionarUsuarioBonus(user,nome){
  if(!isMaster())return;
  const giros=prompt(`Quantos giros bônus para ${nome}?\n\nDigite um número:`);
  if(!giros)return;
  const num=parseInt(giros);
  if(isNaN(num)||num<1){toast('Número válido maior que 0.','w');return;}
  if(num>100){toast('Máximo 100 giros.','w');return;}
  try{const res=await API.liberarGiros(user,num,me.user);if(res&&res.ok){toast(`✅ ${num} giro(s) para ${nome}!`,'s',6000);fecharModalBonus();if(user===me.user)renderTab(activeTab);}else{toast((res&&res.error)||'Erro.','d');}}
  catch(e){toast('Erro: '+(e.message||'Tente novamente.'),'d');}
}
function fecharModalBonus(){const modal=document.getElementById('bonus-modal');if(modal)modal.remove();}
function abrirEditorPremios(){
  if(!isMaster())return;
  const premios=getPremiosAtuais();
  const raridades=['common','uncommon','rare','epic','epic2','legendary'];
  const rarLabels={common:'Comum',uncommon:'Incomum',rare:'Raro',epic:'Muito Raro',epic2:'Épico',legendary:'Lendário'};
  const rows=premios.map((p,i)=>`
    <div class="ep-row" data-idx="${i}" style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.15);border-radius:14px;padding:14px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="font-family:'Orbitron',sans-serif;font-size:.78rem;font-weight:800;color:var(--accent);letter-spacing:.06em;">PRÊMIO #${i+1}</div>
        <button class="btn btn-danger btn-xs" onclick="removerPremioEditor(${i})">🗑 REMOVER</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div class="fg" style="margin-bottom:8px;"><label>Ícone (emoji)</label><input type="text" class="ep-icone" value="${p.icone}" maxlength="4"></div>
        <div class="fg" style="margin-bottom:8px;"><label>Nome</label><input type="text" class="ep-nome" value="${p.nome}" maxlength="30"></div>
        <div class="fg" style="margin-bottom:8px;"><label>Valor (R$)</label><input type="number" class="ep-valor" value="${p.valor}" min="0"></div>
        <div class="fg" style="margin-bottom:8px;"><label>Peso (probabilidade)</label><input type="number" class="ep-peso" value="${p.peso}" min="0" step="0.1"><div style="font-size:.62rem;color:var(--text-dim);">Quanto maior, mais comum</div></div>
        <div class="fg" style="margin-bottom:8px;"><label>Raridade</label><select class="ep-raridade">${raridades.map(r=>`<option value="${r}" ${p.raridade===r?'selected':''}>${rarLabels[r]}</option>`).join('')}</select></div>
        <div class="fg" style="margin-bottom:8px;"><label>Cor principal</label><input type="color" class="ep-cor" value="${p.cor}" style="height:38px;padding:2px;"></div>
      </div>
    </div>
  `).join('');
  const modal=document.createElement('div');
  modal.className='bonus-modal';
  modal.id='premios-modal';
  modal.innerHTML=`
    <div class="bonus-modal-content" style="max-width:600px;border-color:rgba(16,185,129,.5);">
      <div class="bonus-modal-title" style="background:linear-gradient(135deg,#10b981,#059669);-webkit-background-clip:text;background-clip:text;">🎰 EDITOR DE PRÊMIOS DA ROLETA</div>
      <div class="bonus-modal-sub">Edite os prêmios, probabilidades e cores da roleta</div>
      <div style="max-height:55vh;overflow-y:auto;padding-right:6px;margin-bottom:14px;">
        <div id="ep-container">${rows}</div>
        <button class="btn btn-success btn-sm" onclick="adicionarPremioEditor()" style="width:100%;margin-top:8px;">+ ADICIONAR NOVO PRÊMIO</button>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-warn btn-sm" onclick="restaurarPremiosPadrao()" style="flex:1;">🔄 RESTAURAR PADRÃO</button>
        <button class="bonus-modal-close" onclick="fecharEditorPremios()" style="flex:0 0 auto;">CANCELAR</button>
        <button class="btn btn-primary btn-sm" onclick="salvarPremios()" style="flex:1;">💾 SALVAR PRÊMIOS</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}
function fecharEditorPremios(){const m=document.getElementById('premios-modal');if(m)m.remove();}
function adicionarPremioEditor(){
  const container=document.getElementById('ep-container');
  if(!container)return;
  if(container.children.length>=20){toast('Máximo de 20 prêmios.','w');return;}
  const raridades=['common','uncommon','rare','epic','epic2','legendary'];
  const rarLabels={common:'Comum',uncommon:'Incomum',rare:'Raro',epic:'Muito Raro',epic2:'Épico',legendary:'Lendário'};
  const i=container.children.length;
  const novo=`
    <div class="ep-row" data-idx="${i}" style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.15);border-radius:14px;padding:14px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="font-family:'Orbitron',sans-serif;font-size:.78rem;font-weight:800;color:var(--accent);letter-spacing:.06em;">PRÊMIO #${i+1}</div>
        <button class="btn btn-danger btn-xs" onclick="removerPremioEditor(${i})">🗑 REMOVER</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div class="fg" style="margin-bottom:8px;"><label>Ícone (emoji)</label><input type="text" class="ep-icone" value="🎁" maxlength="4"></div>
        <div class="fg" style="margin-bottom:8px;"><label>Nome</label><input type="text" class="ep-nome" value="Novo Prêmio" maxlength="30"></div>
        <div class="fg" style="margin-bottom:8px;"><label>Valor (R$)</label><input type="number" class="ep-valor" value="100" min="0"></div>
        <div class="fg" style="margin-bottom:8px;"><label>Peso (probabilidade)</label><input type="number" class="ep-peso" value="10" min="0" step="0.1"></div>
        <div class="fg" style="margin-bottom:8px;"><label>Raridade</label><select class="ep-raridade">${raridades.map(r=>`<option value="${r}">${rarLabels[r]}</option>`).join('')}</select></div>
        <div class="fg" style="margin-bottom:8px;"><label>Cor principal</label><input type="color" class="ep-cor" value="#10b981" style="height:38px;padding:2px;"></div>
      </div>
    </div>`;
  container.insertAdjacentHTML('beforeend',novo);
}
function removerPremioEditor(idx){
  const container=document.getElementById('ep-container');
  if(!container)return;
  const row=container.querySelector(`[data-idx="${idx}"]`);
  if(row){
    if(!confirm('Remover este prêmio?'))return;
    row.remove();
    Array.from(container.children).forEach((r,i)=>r.dataset.idx=i);
  }
}
function coletarPremiosDoEditor(){
  const rows=document.querySelectorAll('#ep-container .ep-row');
  const premios=[];
  rows.forEach((row,i)=>{
    premios.push({
      id:'p-'+Date.now()+'-'+i,
      icone:row.querySelector('.ep-icone').value.trim()||'🎁',
      nome:row.querySelector('.ep-nome').value.trim()||'Prêmio',
      valor:parseInt(row.querySelector('.ep-valor').value)||0,
      peso:parseFloat(row.querySelector('.ep-peso').value)||1,
      raridade:row.querySelector('.ep-raridade').value,
      cor:row.querySelector('.ep-cor').value,
      cor2:row.querySelector('.ep-cor').value,
      corBorda:row.querySelector('.ep-cor').value
    });
  });
  return premios;
}
async function salvarPremios(){
  const premios=coletarPremiosDoEditor();
  if(premios.length===0){toast('Adicione pelo menos 1 prêmio.','d');return;}
  if(premios.length>20){toast('Máximo 20 prêmios.','w');return;}
  try{
    const res=await API.salvarRoletaPremios(premios,me.user);
    if(res&&res.ok){
      toast(`✅ ${premios.length} prêmio(s) salvos com sucesso!`,'s',6000);
      fecharEditorPremios();
    }else toast(res?.error||'Erro ao salvar.','d');
  }catch(e){toast(e.message||'Erro.','d');}
}
function restaurarPremiosPadrao(){
  if(!confirm('Restaurar os prêmios padrão? Isso substituirá a configuração atual.'))return;
  const padrao=ROLETA_PREMIOS_DEFAULT;
  const container=document.getElementById('ep-container');
  if(!container)return;
  const raridades=['common','uncommon','rare','epic','epic2','legendary'];
  const rarLabels={common:'Comum',uncommon:'Incomum',rare:'Raro',epic:'Muito Raro',epic2:'Épico',legendary:'Lendário'};
  container.innerHTML=padrao.map((p,i)=>`
    <div class="ep-row" data-idx="${i}" style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.15);border-radius:14px;padding:14px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="font-family:'Orbitron',sans-serif;font-size:.78rem;font-weight:800;color:var(--accent);letter-spacing:.06em;">PRÊMIO #${i+1}</div>
        <button class="btn btn-danger btn-xs" onclick="removerPremioEditor(${i})">🗑 REMOVER</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div class="fg" style="margin-bottom:8px;"><label>Ícone (emoji)</label><input type="text" class="ep-icone" value="${p.icone}" maxlength="4"></div>
        <div class="fg" style="margin-bottom:8px;"><label>Nome</label><input type="text" class="ep-nome" value="${p.nome}" maxlength="30"></div>
        <div class="fg" style="margin-bottom:8px;"><label>Valor (R$)</label><input type="number" class="ep-valor" value="${p.valor}" min="0"></div>
        <div class="fg" style="margin-bottom:8px;"><label>Peso (probabilidade)</label><input type="number" class="ep-peso" value="${p.peso}" min="0" step="0.1"></div>
        <div class="fg" style="margin-bottom:8px;"><label>Raridade</label><select class="ep-raridade">${raridades.map(r=>`<option value="${r}" ${p.raridade===r?'selected':''}>${rarLabels[r]}</option>`).join('')}</select></div>
        <div class="fg" style="margin-bottom:8px;"><label>Cor principal</label><input type="color" class="ep-cor" value="${p.cor}" style="height:38px;padding:2px;"></div>
      </div>
    </div>
  `).join('');
  toast('🔄 Prêmios padrão carregados. Clique em SALVAR para aplicar.','i');
}

// ══ CHAT ══
const CHAT_LS_KEY='gmpol_chat_lidos_v1';
function _lerLidos(){try{return JSON.parse(localStorage.getItem(CHAT_LS_KEY)||'{}');}catch(_){return{};}}
function _salvarLido(obj){try{localStorage.setItem(CHAT_LS_KEY,JSON.stringify(obj));}catch(_){}}
function contarMensagensNaoLidas(){if(!me)return 0;const lidos=_lerLidos();let total=0;(STATE.chats||[]).forEach(m=>{if(m.to===me.user&&m.from!==me.user){if(!lidos[m.id]){total++;}}});return total;}
function _marcarConversaComoLida(outroUser){const lidos=_lerLidos();let mudou=false;(STATE.chats||[]).forEach(m=>{if(m.from===outroUser&&m.to===me.user&&!lidos[m.id]){lidos[m.id]=1;mudou=true;}});if(mudou){_salvarLido(lidos);updateNotif();}}
function vChat(){
  return `<div class="stitle">▸ CHAT PRIVADO</div>
    <div id="chat-container" class="chat-container">
      <div id="chat-view-lista" class="chat-view chat-view-lista"><div class="chat-card"><div class="chat-card-head"><div style="font-family:'Orbitron',sans-serif;font-size:.72rem;color:var(--accent);letter-spacing:.14em;">CONTATOS</div></div><div class="chat-busca-wrap"><input id="chat-busca" placeholder="Buscar contato…" oninput="renderChatListaContatos()"></div><div id="chat-lista" class="chat-scroll"></div></div></div>
      <div id="chat-view-conversa" class="chat-view chat-view-conversa"><div class="chat-card"><div id="chat-header" class="chat-card-head"><button type="button" class="chat-voltar" onclick="voltarParaLista()" aria-label="Voltar">‹</button><span style="color:var(--text-dim);font-size:.85rem;">Selecione um contato</span></div><div id="chat-msgs" class="chat-scroll chat-msgs-area"></div><div id="chat-input-wrap" class="chat-input-wrap"><textarea id="chat-input" placeholder="Digite uma mensagem… (Enter envia)" onkeydown="chatInputKeydown(event)"></textarea><button type="button" class="btn btn-primary chat-send" onclick="enviarMsgChat()">➤</button></div></div></div>
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
  const lista=document.getElementById('chat-lista');if(!lista||!me)return;
  const busca=(document.getElementById('chat-busca')?.value||'').toLowerCase().trim();
  const outros=STATE.users.filter(u=>u.user!==me.user&&u.ativo!==false).sort((a,b)=>(a.nome||'').localeCompare(b.nome||''));
  const ultimaMsg={};
  (STATE.chats||[]).forEach(m=>{if(m.from===me.user||m.to===me.user){const outro=m.from===me.user?m.to:m.from;if(!ultimaMsg[outro]||m.ts>ultimaMsg[outro].ts)ultimaMsg[outro]=m;}});
  outros.sort((a,b)=>{const ta=ultimaMsg[a.user]?.ts||0;const tb=ultimaMsg[b.user]?.ts||0;return tb-ta;});
  const filtrados=busca?outros.filter(u=>(u.nome||'').toLowerCase().includes(busca)||(u.user||'').toLowerCase().includes(busca)):outros;
  if(!filtrados.length){lista.innerHTML='<div style="padding:24px;text-align:center;color:var(--text-dim);font-size:.8rem;">Nenhum contato encontrado.</div>';return;}
  const lidos=_lerLidos();
  lista.innerHTML=filtrados.map(u=>{
    const ult=ultimaMsg[u.user];
    const preview=ult?((ult.from===me.user?'Você: ':'')+ult.texto.slice(0,34)+(ult.texto.length>34?'…':'')):'';
    const naoLidas=(STATE.chats||[]).filter(m=>m.from===u.user&&m.to===me.user&&!lidos[m.id]).length;
    const ativo=_chatContatoAtual===u.user?'ativo':'';
    return `<div class="chat-item ${ativo}" onclick="abrirChatCom('${u.user}')"><div class="chat-item-avatar" style="${AVATAR_POS}">${avatarContent(u)}</div><div class="chat-item-body"><div class="chat-item-top"><span class="chat-item-nome">${u.nome}</span><span class="cargo-badge ${CARGO_BADGE_CLASS[u.cargo]||''}" style="font-size:.48rem;padding:2px 6px;">${CARGO_LABEL[u.cargo]||''}</span></div><div class="chat-item-prev">${preview||'<i>sem mensagens</i>'}</div></div>${naoLidas>0?`<div class="chat-nao-lido">${naoLidas>99?'99+':naoLidas}</div>`:''}</div>`;
  }).join('');
}
function abrirChatCom(userLogin){
  _chatContatoAtual=userLogin;_marcarConversaComoLida(userLogin);
  const u=STATE.users.find(x=>x.user===userLogin);
  const header=document.getElementById('chat-header');
  if(header&&u){header.innerHTML=`<button type="button" class="chat-voltar" onclick="voltarParaLista()" aria-label="Voltar">‹</button><div class="chat-item-avatar" style="width:36px;height:36px;font-size:.85rem;${AVATAR_POS}">${avatarContent(u)}</div><div style="min-width:0;"><div style="font-weight:700;font-size:.92rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${u.nome}</div><div style="font-size:.66rem;color:var(--text-mid);">${CARGO_LABEL[u.cargo]||u.cargo} • @${u.user}</div></div>`;}
  const inputWrap=document.getElementById('chat-input-wrap');if(inputWrap)inputWrap.style.display='flex';
  const viewLista=document.getElementById('chat-view-lista');const viewConversa=document.getElementById('chat-view-conversa');
  if(viewLista&&viewConversa&&window.matchMedia('(max-width:768px)').matches){viewLista.classList.add('escondido');viewConversa.classList.add('ativo');}
  renderChatListaContatos();renderChatMensagens();
  setTimeout(()=>{scrollChatBottom();const inp=document.getElementById('chat-input');if(inp)inp.focus();},80);
}
function voltarParaLista(){
  _chatContatoAtual=null;
  const viewLista=document.getElementById('chat-view-lista');const viewConversa=document.getElementById('chat-view-conversa');
  if(viewLista&&viewConversa){viewLista.classList.remove('escondido');viewConversa.classList.remove('ativo');}
  const inputWrap=document.getElementById('chat-input-wrap');if(inputWrap)inputWrap.style.display='none';
  renderChatListaContatos();
}
function renderChatMensagens(){
  const area=document.getElementById('chat-msgs');if(!area)return;
  if(!me||!_chatContatoAtual){area.innerHTML='<div style="text-align:center;padding:40px 20px;color:var(--text-dim);font-size:.85rem;">Selecione um contato ao lado</div>';return;}
  const msgs=(STATE.chats||[]).filter(m=>(m.from===me.user&&m.to===_chatContatoAtual)||(m.from===_chatContatoAtual&&m.to===me.user)).sort((a,b)=>a.ts-b.ts);
  if(!msgs.length){area.innerHTML='<div style="text-align:center;padding:40px 20px;color:var(--text-dim);font-size:.85rem;">Nenhuma mensagem ainda.<br><span style="font-size:.72rem;">Envie a primeira!</span></div>';return;}
  area.innerHTML=msgs.map(m=>{const enviada=m.from===me.user;const cls=enviada?'enviada':'recebida';const textoSafe=(m.texto||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');return `<div class="chat-msg-wrap ${cls}"><div class="chat-msg-col"><div class="chat-msg ${cls}">${textoSafe}</div><div class="chat-msg-time">${fmtChatTime(m.ts)}${enviada?' ✓':''}</div></div></div>`;}).join('');
  scrollChatBottom();
}
function scrollChatBottom(){const area=document.getElementById('chat-msgs');if(area)area.scrollTop=area.scrollHeight;}
function chatInputKeydown(ev){if(ev.key==='Enter'&&!ev.shiftKey){ev.preventDefault();enviarMsgChat();}}
async function enviarMsgChat(){
  if(!me||!_chatContatoAtual)return;
  const input=document.getElementById('chat-input');if(!input)return;
  const texto=input.value.trim();if(!texto)return;
  if(texto.length>2000){toast('Mensagem muito longa.','w');return;}
  input.value='';
  try{await API.sendChatMsg(me.user,_chatContatoAtual,texto);renderChatListaContatos();renderChatMensagens();}
  catch(e){toast(e.message||'Erro ao enviar.','d');input.value=texto;}
}
function startChatPolling(){stopChatPolling();_chatTimer=setInterval(()=>{if(activeTab===getTabIdx('chat')&&_chatContatoAtual){renderChatListaContatos();}},3000);}
function stopChatPolling(){if(_chatTimer){clearInterval(_chatTimer);_chatTimer=null;}}
function _tocarNotifChat(){try{const ctx=new (window.AudioContext||window.webkitAudioContext)();const osc=ctx.createOscillator();const gain=ctx.createGain();osc.connect(gain);gain.connect(ctx.destination);osc.frequency.value=880;osc.type='sine';gain.gain.setValueAtTime(0.0001,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(0.15,ctx.currentTime+0.02);gain.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+0.25);osc.start();osc.stop(ctx.currentTime+0.26);}catch(_){}}

function openModal(id){document.getElementById(id)?.classList.add('open');}
function closeModal(id){document.getElementById(id)?.classList.remove('open');}
function toggleSettings(){document.getElementById('settings-menu')?.classList.toggle('open');}
function closeSettings(){document.getElementById('settings-menu')?.classList.remove('open');}
document.addEventListener('click',e=>{const menu=document.getElementById('settings-menu'),btn=document.querySelector('.settings-btn');if(menu&&!menu.contains(e.target)&&e.target!==btn)closeSettings();if(e.target.classList.contains('modal-overlay'))e.target.classList.remove('open');});
function toast(txt,type='i',duration=3800){const c=document.getElementById('toast-container'),t=document.createElement('div');t.className='toast '+type;t.innerHTML='<span>'+txt+'</span>';c.appendChild(t);setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),400);},duration);}
function empty(ico,txt){return'<div class="empty"><div class="empty-ico">'+ico+'</div><p>'+txt+'</p></div>';}

window.onload=()=>{initWebSocket();checkSession();};
