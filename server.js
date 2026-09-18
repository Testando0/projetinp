/**
 * GMPOL Sistema Central v5.4
 * NOVO: Sistema de PROVAS (10 questões, 3 min/questão, nota 0-100, análise dos superiores)
 * MASTER (master / masterx512) = acesso total | Horário de Brasília | Folga 6+1
 */

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// ══ FUSO HORÁRIO BRASIL ══
const TZ = 'America/Sao_Paulo';
function brTimeStr(ts){return new Date(ts).toLocaleTimeString('pt-BR',{timeZone:TZ,hour:'2-digit',minute:'2-digit'});}
function brTimeStrSec(ts){return new Date(ts).toLocaleTimeString('pt-BR',{timeZone:TZ,hour:'2-digit',minute:'2-digit',second:'2-digit'});}
function brDateStr(ts){return new Date(ts).toLocaleDateString('pt-BR',{timeZone:TZ});}
function nextBrDateStr(dstr){const p=dstr.split('/');const dd=+p[0],mm=+p[1],yy=+p[2];const t=new Date(Date.UTC(yy,mm-1,dd+1,12));return String(t.getUTCDate()).padStart(2,'0')+'/'+String(t.getUTCMonth()+1).padStart(2,'0')+'/'+t.getUTCFullYear();}

// ══ CARGOS ══
const CARGO_PERM_SRV = { admin: 7, chefe: 6, delegado: 5, escrivao: 4, tatico: 3, agente: 2, gm: 1 };
const CARGO_LABEL_SRV = {
  admin:'Admin master', chefe:'Chefe de polícia', delegado:'Delegado',
  escrivao:'Escrivão', tatico:'Tático', agente:'Agente oficial', gm:'Guarda municipal'
};
const CARGO_BASE_MINUTES = { gm: 90, agente: 150, tatico: 210, escrivao: 240, delegado: 300, chefe: 0, admin: 0 };

// ══ PROVA: QUESTÕES OFICIAIS (correta = índice 0-3) ══
// Se quiser mudar o gabarito, altere o número de "correta" (0=a, 1=b, 2=c, 3=d)
const QUESTOES_PROVA = [
  { enunciado:'O Guarda inicia o serviço na qual patente?',
    alt:['Agente','Guarda','Escrivão','Tático'], correta:1 },
  { enunciado:'Quais equipamentos o Guarda pode utilizar no serviço?',
    alt:['Pistola G18, colete e cassetete','Cassetete, taser, colete e Desert Eagle somente em caso de ameaça','Fuzil M4, pistola e colete','Apenas cassetete e colete'], correta:1 },
  { enunciado:'Onde o Guarda deve permanecer durante o turno?',
    alt:['Em todo o mapa livremente','Somente na Delegacia (DP)','Na rua e na DP','Onde o chefe mandar'], correta:2 },
  { enunciado:'Qual das três regras básicas da PF NÃO faz parte?',
    alt:['Respeito','Comprometimento','Velocidade','Não azaralhar'], correta:2 },
  { enunciado:'A Desert Eagle do Guarda é liberada para uso em qual situação?',
    alt:['Sempre que estiver de plantão','Apenas em caso de ameaça','Nunca, é proibida','Quando o chefe autorizar por rádio'], correta:1 },
  { enunciado:'Quais patentes da PF podem utilizar a arma de fogo liberada (tipo Desert), diferente do Guarda?',
    alt:['Guardas e Agentes','Escrivão, Tático e Delegado/Chefe','Todos os cargos','Apenas o Chefe'], correta:1 },
  { enunciado:'Para o Guarda ser promovido, ele precisa:',
    alt:['Apenas de tempo jogado','Fazer paradinhas e passar pela prova','Pagar a administração','Pedir pra chefe diretamente'], correta:1 },
  { enunciado:'Qual é a ÚNICA patente da PF em que a promoção é feita APENAS por mérito, sem prova?',
    alt:['Agente','Tático','Escrivão','Delegado'], correta:2 },
  { enunciado:'É correto afirmar que o Guarda pode conduzir presos?',
    alt:['Sim, sempre','Não, isso é função do Agente ou superior','Sim, mas só a pé','Só se for autorizado pelo Chefe na hora'], correta:1 },
  { enunciado:'O que o Guarda DEVE fazer ao encontrar um superior no Barra Amiga ou no interior da DP?',
    alt:['Ignorar','Prender','Prestar continência','Pedir hora'], correta:2 }
];

function isMaster(u){ return !!u && u.user === 'master'; }
function findUserByRef(ref){
  if (!ref) return null;
  return DB.users.find(u => u.user === ref) || DB.users.find(u => u.nome === ref) || null;
}

// ══ BANCO DE DADOS ══
const TMP_FILE  = path.join('/tmp', 'gmpol-data.json');
const SEED_FILE = path.join(__dirname, 'data.json');

function getDefaultData() {
  const now = Date.now();
  return {
    users: [
      { user: 'master', pass: 'masterx512', cargo: 'admin', nome: 'Master',       ativo: true, criadoPor: 'sistema', criadoEm: now, cicloDias: [], folgaDia: null },
      { user: 'chefe',  pass: 'chefe123',   cargo: 'chefe', nome: 'Chefe Padrão', ativo: true, criadoPor: 'sistema', criadoEm: now, cicloDias: [], folgaDia: null },
      { user: 'gm',     pass: 'gm123',      cargo: 'gm',    nome: 'GM Padrão',    ativo: true, criadoPor: 'master',  criadoEm: now, cicloDias: [], folgaDia: null }
    ],
    ocs: [], puns: [], pontos: [], provas: [], audit: []
  };
}

function migrate(d) {
  let m = d.users.find(u => u.user === 'master');
  if (!m) {
    const old = d.users.find(u => u.user === 'admin');
    if (old) { old.user = 'master'; old.pass = 'masterx512'; old.nome = 'Master'; }
    else d.users.push({ user:'master', pass:'masterx512', cargo:'admin', nome:'Master', ativo:true, criadoPor:'sistema', criadoEm:Date.now(), cicloDias:[], folgaDia:null });
  } else { m.pass = 'masterx512'; m.cargo = 'admin'; }
  return d;
}

function loadData() {
  try {
    if (fs.existsSync(TMP_FILE)) {
      const p = JSON.parse(fs.readFileSync(TMP_FILE, 'utf8'));
      if (p && Array.isArray(p.users) && p.users.length > 0) { console.log('[DB] Carregado de /tmp'); return migrate(sanitize(p)); }
    }
  } catch (e) { console.warn('[DB] /tmp ilegível:', e.message); }
  try {
    if (fs.existsSync(SEED_FILE)) {
      const p = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
      if (p && Array.isArray(p.users)) {
        console.log('[DB] Carregado de seed');
        const data = migrate(sanitize(p));
        try { fs.writeFileSync(TMP_FILE, JSON.stringify(data, null, 2)); } catch (_) {}
        return data;
      }
    }
  } catch (e) { console.warn('[DB] Seed ilegível:', e.message); }
  console.log('[DB] Usando dados padrão.');
  const def = migrate(getDefaultData());
  try { fs.writeFileSync(TMP_FILE, JSON.stringify(def, null, 2)); } catch (_) {}
  return def;
}

function sanitize(p) {
  const def = getDefaultData();
  const users = (Array.isArray(p.users) ? p.users : def.users).map(u => ({
    ...u, cicloDias: Array.isArray(u.cicloDias) ? u.cicloDias : [], folgaDia: u.folgaDia || null
  }));
  return {
    users,
    ocs:    Array.isArray(p.ocs)    ? p.ocs    : [],
    puns:   Array.isArray(p.puns)   ? p.puns   : [],
    pontos: Array.isArray(p.pontos) ? p.pontos : [],
    provas: Array.isArray(p.provas) ? p.provas : [],
    audit:  Array.isArray(p.audit)  ? p.audit  : []
  };
}

let _saveTimer = null;
function saveData() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try { fs.writeFileSync(TMP_FILE, JSON.stringify(DB, null, 2)); }
    catch (e) { console.error('[DB] Erro ao salvar:', e.message); }
  }, 150);
}
function saveDataSync() {
  try { fs.writeFileSync(TMP_FILE, JSON.stringify(DB, null, 2)); }
  catch (e) { console.error('[DB] Erro sync:', e.message); }
}

let DB = loadData();
console.log(`[DB] ${DB.users.length} usuários | ${DB.ocs.length} OCs | ${DB.puns.length} punições | ${DB.provas.length} provas`);

// ══ WEBSOCKET NATIVO ══
const wsClients = new Set();

function wsHandshake(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return false; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  return true;
}
function wsParseFrame(buf) {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f, offset = 2;
  if (len === 126) { if (buf.length < 4) return null; len = buf.readUInt16BE(2); offset = 4; }
  else if (len === 127) { if (buf.length < 10) return null; len = Number(buf.readBigUInt64BE(2)); offset = 10; }
  if (buf.length < offset + (masked ? 4 : 0) + len) return null;
  let payload;
  if (masked) {
    const mask = buf.slice(offset, offset + 4); offset += 4;
    payload = Buffer.alloc(len);
    for (let i = 0; i < len; i++) payload[i] = buf[offset + i] ^ mask[i % 4];
  } else { payload = buf.slice(offset, offset + len); }
  return { opcode, payload, frameLen: offset + len };
}
function wsBuildFrame(data, opcode = 1) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126)        { header = Buffer.alloc(2);  header[0] = 0x80 | opcode; header[1] = len; }
  else if (len < 65536) { header = Buffer.alloc(4);  header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(len, 2); }
  else                  { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([header, payload]);
}
function wsSend(socket, obj) { try { if (socket.writable) socket.write(wsBuildFrame(JSON.stringify(obj))); } catch (_) {} }
function broadcast(type, payload) {
  const frame = wsBuildFrame(JSON.stringify({ type, payload }));
  wsClients.forEach(s => { try { if (s.writable) s.write(frame); } catch (_) { wsClients.delete(s); } });
}

function pub(u) { const { pass, ...r } = u; return r; }

function audit(msg, icon = '📋') {
  DB.audit.unshift({ msg, icon, ts: Date.now() });
  DB.audit = DB.audit.slice(0, 300);
  saveData();
  broadcast('AUDIT_NEW', DB.audit[0]);
}

// ══ STATIC ══
const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'application/javascript', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.ico':'image/x-icon', '.svg':'image/svg+xml' };

function serveStatic(req, res) {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(__dirname, 'public', urlPath);
  if (!filePath.startsWith(path.join(__dirname, 'public'))) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(__dirname, 'public', 'index.html'), (e2, d2) => {
        if (e2) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d2);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 2e6) reject(new Error('Payload grande')); });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch (_) { resolve({}); } });
    req.on('error', reject);
  });
}

function jsonRes(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

// ══ ROTEADOR API ══
async function handleAPI(req, res) {
  const method = req.method;
  const url    = req.url.split('?')[0];

  if (method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers':'Content-Type' });
    return res.end();
  }

  let body = {};
  if (['POST', 'PUT', 'DELETE'].includes(method)) {
    try { body = await readBody(req); } catch (e) { return jsonRes(res, 400, { error: 'Body inválido.' }); }
  }

  if (method === 'GET' && url === '/health') {
    return jsonRes(res, 200, { ok: true, uptime: Math.floor(process.uptime()), clientes: wsClients.size, usuarios: DB.users.length, ocs: DB.ocs.length, puns: DB.puns.length, pontos: DB.pontos.length, provas: DB.provas.length });
  }

  if (method === 'GET' && url === '/api/state') {
    return jsonRes(res, 200, { ocs: DB.ocs, puns: DB.puns, pontos: DB.pontos, provas: DB.provas, users: DB.users.map(pub), audit: DB.audit });
  }

  // ── LOGIN ──
  if (method === 'POST' && url === '/api/login') {
    const { user, pass } = body;
    if (!user || !pass) return jsonRes(res, 400, { error: 'Preencha usuário e senha.' });
    const u = DB.users.find(u => u.user === String(user).trim().toLowerCase() && u.pass === String(pass) && u.ativo);
    if (!u) return jsonRes(res, 401, { error: 'Credenciais inválidas ou conta desativada.' });
    if (u.banExpires && u.banExpires > Date.now()) {
      return jsonRes(res, 403, { banned: true, expiresAt: u.banExpires, reason: u.banReason || 'Suspensão temporária.', banBy: u.banBy || 'Sistema' });
    }
    return jsonRes(res, 200, { ok: true, user: pub(u) });
  }

  // ── USUÁRIOS ──
  if (method === 'GET' && url === '/api/users') return jsonRes(res, 200, DB.users.map(pub));

  if (method === 'POST' && url === '/api/users') {
    const { nome, user, cargo, pass, criadoPor } = body;
    if (!nome || !user || !cargo || !pass) return jsonRes(res, 400, { error: 'Todos os campos são obrigatórios.' });
    const login = String(user).trim().toLowerCase().replace(/\s/g, '');
    if (DB.users.find(u => u.user === login)) return jsonRes(res, 400, { error: 'Login já existe.' });
    if (pass.length < 6) return jsonRes(res, 400, { error: 'Senha mínima: 6 caracteres.' });
    const criador = findUserByRef(criadoPor);
    if (!criador) return jsonRes(res, 403, { error: 'Executor não encontrado.' });
    const master = isMaster(criador);
    if (!master && (CARGO_PERM_SRV[criador.cargo]||0) < 6) return jsonRes(res, 403, { error: 'Apenas Chefes de Polícia podem criar usuários.' });
    if (!master && (CARGO_PERM_SRV[cargo]||0) >= (CARGO_PERM_SRV[criador.cargo]||0)) return jsonRes(res, 403, { error: 'Você não pode criar usuários com cargo igual ou superior ao seu.' });
    DB.users.push({ user: login, pass, cargo, nome, ativo: true, criadoPor: criador.user, criadoEm: Date.now(), cicloDias: [], folgaDia: null });
    saveData();
    audit(`<b>${criador.nome}</b> criou o usuário <b>${nome}</b> (${CARGO_LABEL_SRV[cargo]||cargo})`, '👤');
    broadcast('USERS_UPDATED', DB.users.map(pub));
    return jsonRes(res, 200, { ok: true });
  }

  const mBanCheck = url.match(/^\/api\/users\/([^/]+)\/bancheck$/);
  if (method === 'GET' && mBanCheck) {
    const u = DB.users.find(u => u.user === mBanCheck[1]);
    if (!u) return jsonRes(res, 200, { banned: false });
    if (u.banExpires && u.banExpires > Date.now()) return jsonRes(res, 200, { banned: true, expiresAt: u.banExpires, reason: u.banReason, banBy: u.banBy });
    return jsonRes(res, 200, { banned: false });
  }

  const mSenha = url.match(/^\/api\/users\/([^/]+)\/senha$/);
  if (method === 'PUT' && mSenha) {
    const i = DB.users.findIndex(u => u.user === mSenha[1]);
    if (i === -1) return jsonRes(res, 404, { error: 'Usuário não encontrado.' });
    const { novaSenha, feitorPor } = body;
    if (!novaSenha || novaSenha.length < 6) return jsonRes(res, 400, { error: 'Senha mínima: 6 caracteres.' });
    const executor = findUserByRef(feitorPor);
    const master = isMaster(executor);
    const self = executor && executor.user === DB.users[i].user;
    if (!master && !self) {
      if (!executor || (CARGO_PERM_SRV[executor.cargo]||0) <= (CARGO_PERM_SRV[DB.users[i].cargo]||0))
        return jsonRes(res, 403, { error: 'Permissão insuficiente.' });
    }
    DB.users[i].pass = novaSenha;
    saveData();
    audit(`<b>${executor ? executor.nome : feitorPor}</b> redefiniu a senha de <b>${DB.users[i].nome}</b>`, '🔑');
    broadcast('USERS_UPDATED', DB.users.map(pub));
    return jsonRes(res, 200, { ok: true });
  }

  const mStatus = url.match(/^\/api\/users\/([^/]+)\/status$/);
  if (method === 'PUT' && mStatus) {
    const i = DB.users.findIndex(u => u.user === mStatus[1]);
    if (i === -1) return jsonRes(res, 404, { error: 'Usuário não encontrado.' });
    const { ativo, feitorPor } = body;
    const executor = findUserByRef(feitorPor);
    if (!executor) return jsonRes(res, 403, { error: 'Executor não encontrado.' });
    if (executor.user === mStatus[1]) return jsonRes(res, 403, { error: 'Você não pode ativar/desativar a si mesmo.' });
    const master = isMaster(executor);
    if (!master && (CARGO_PERM_SRV[executor.cargo]||0) <= (CARGO_PERM_SRV[DB.users[i].cargo]||0))
      return jsonRes(res, 403, { error: 'Permissão insuficiente.' });
    DB.users[i].ativo = Boolean(ativo);
    saveData();
    audit(`<b>${executor.nome}</b> ${ativo ? 'ativou' : 'desativou'} <b>${DB.users[i].nome}</b>`, ativo ? '✅' : '🚫');
    broadcast('USERS_UPDATED', DB.users.map(pub));
    return jsonRes(res, 200, { ok: true });
  }

  const mCargo = url.match(/^\/api\/users\/([^/]+)\/cargo$/);
  if (method === 'PUT' && mCargo) {
    const i = DB.users.findIndex(u => u.user === mCargo[1]);
    if (i === -1) return jsonRes(res, 404, { error: 'Usuário não encontrado.' });
    const { cargo, feitorPor, motivo } = body;
    const targetUser = DB.users[i];
    const executor = findUserByRef(feitorPor);
    if (!executor) return jsonRes(res, 403, { error: 'Executor não encontrado.' });
    const master = isMaster(executor);
    if (targetUser.user === executor.user) return jsonRes(res, 403, { error: 'Você não pode alterar o próprio cargo.' });
    if (!master && (CARGO_PERM_SRV[executor.cargo]||0) < 6) return jsonRes(res, 403, { error: 'Apenas Chefes de Polícia podem alterar cargos.' });
    if (!master && (CARGO_PERM_SRV[cargo]||0) >= (CARGO_PERM_SRV[executor.cargo]||0)) return jsonRes(res, 403, { error: 'Você não pode atribuir cargo igual ou superior ao seu.' });
    if (!master && targetUser.cargo === 'admin') return jsonRes(res, 403, { error: 'O Admin Master não pode ser rebaixado.' });
    const oldPerm = CARGO_PERM_SRV[targetUser.cargo] || 0, newPerm = CARGO_PERM_SRV[cargo] || 0;
    const isRebaixamento = newPerm < oldPerm;
    if (isRebaixamento && !motivo) return jsonRes(res, 400, { error: 'Motivo obrigatório para rebaixamento.' });
    const oldCargo = targetUser.cargo;
    DB.users[i].cargo = cargo;
    saveData();
    const logMsg = isRebaixamento
      ? `<b>${executor.nome}</b> rebaixou <b>${DB.users[i].nome}</b> de ${CARGO_LABEL_SRV[oldCargo]||oldCargo} para ${CARGO_LABEL_SRV[cargo]||cargo} — motivo: ${motivo}`
      : `<b>${executor.nome}</b> promoveu <b>${DB.users[i].nome}</b> de ${CARGO_LABEL_SRV[oldCargo]||oldCargo} para ${CARGO_LABEL_SRV[cargo]||cargo}`;
    audit(logMsg, isRebaixamento ? '📉' : '📈');
    broadcast('USERS_UPDATED', DB.users.map(pub));
    broadcast('CARGO_CHANGED', { userLogin: DB.users[i].user, oldCargo, newCargo: cargo, tipo: isRebaixamento ? 'rebaixado' : 'promovido', motivo: motivo || null, feitorPorNome: executor.nome });
    return jsonRes(res, 200, { ok: true });
  }

  const mBan = url.match(/^\/api\/users\/([^/]+)\/ban$/);
  if (mBan) {
    if (method === 'POST') {
      const i = DB.users.findIndex(u => u.user === mBan[1]);
      if (i === -1) return jsonRes(res, 404, { error: 'Usuário não encontrado.' });
      const { duracao, motivo, feitorPor, feitorPorNome } = body;
      const mins = parseInt(duracao) || 0;
      if (mins <= 0) return jsonRes(res, 400, { error: 'Duração inválida.' });
      if (!motivo)   return jsonRes(res, 400, { error: 'Motivo obrigatório.' });
      const executor = findUserByRef(feitorPor) || findUserByRef(feitorPorNome);
      if (!executor) return jsonRes(res, 403, { error: 'Executor não encontrado.' });
      if (DB.users[i].user === executor.user) return jsonRes(res, 403, { error: 'Você não pode suspender a si mesmo.' });
      const master = isMaster(executor);
      const execPerm = CARGO_PERM_SRV[executor.cargo]||0;
      const tgtPerm  = CARGO_PERM_SRV[DB.users[i].cargo]||0;
      if (!master && (execPerm <= tgtPerm || execPerm < 3)) return jsonRes(res, 403, { error: 'Permissão insuficiente para suspender este usuário.' });
      const expiresAt = Date.now() + mins * 60 * 1000;
      DB.users[i].banExpires = expiresAt; DB.users[i].banReason = motivo; DB.users[i].banBy = executor.nome;
      saveData();
      audit(`<b>${executor.nome}</b> suspendeu <b>${DB.users[i].nome}</b> por ${mins} min(s) — motivo: ${motivo}`, '⛔');
      broadcast('USERS_UPDATED', DB.users.map(pub));
      broadcast('USER_BANNED', { userLogin: DB.users[i].user, expiresAt, reason: motivo, banBy: executor.nome, duracao: mins });
      return jsonRes(res, 200, { ok: true });
    }
    if (method === 'DELETE') {
      const i = DB.users.findIndex(u => u.user === mBan[1]);
      if (i === -1) return jsonRes(res, 404, { error: 'Usuário não encontrado.' });
      const { feitorPor } = body;
      const executor = findUserByRef(feitorPor);
      const nome = DB.users[i].nome;
      DB.users[i].banExpires = null; DB.users[i].banReason = null; DB.users[i].banBy = null;
      saveData();
      audit(`<b>${executor ? executor.nome : feitorPor}</b> removeu a suspensão de <b>${nome}</b>`, '✅');
      broadcast('USERS_UPDATED', DB.users.map(pub));
      broadcast('USER_UNBANNED', { userLogin: DB.users[i].user });
      return jsonRes(res, 200, { ok: true });
    }
  }

  const mDelUser = url.match(/^\/api\/users\/([^/]+)$/);
  if (method === 'DELETE' && mDelUser) {
    const i = DB.users.findIndex(u => u.user === mDelUser[1]);
    if (i === -1) return jsonRes(res, 404, { error: 'Usuário não encontrado.' });
    const { feitorPor } = body;
    const executor = findUserByRef(feitorPor);
    if (!executor) return jsonRes(res, 403, { error: 'Executor não encontrado.' });
    if (mDelUser[1] === executor.user) return jsonRes(res, 403, { error: 'Você não pode excluir a si mesmo.' });
    const master = isMaster(executor);
    if (!master && (CARGO_PERM_SRV[executor.cargo]||0) <= (CARGO_PERM_SRV[DB.users[i].cargo]||0))
      return jsonRes(res, 403, { error: 'Permissão insuficiente.' });
    const nome = DB.users[i].nome;
    DB.users.splice(i, 1);
    saveData();
    audit(`<b>${executor.nome}</b> excluiu o usuário <b>${nome}</b>`, '🗑');
    broadcast('USERS_UPDATED', DB.users.map(pub));
    return jsonRes(res, 200, { ok: true });
  }

  // ── OCORRÊNCIAS ──
  if (method === 'GET'  && url === '/api/ocs') return jsonRes(res, 200, DB.ocs);
  if (method === 'POST' && url === '/api/ocs') {
    const oc = body;
    if (!oc || !oc.id) return jsonRes(res, 400, { error: 'Dados inválidos.' });
    if (!DB.ocs.find(o => o.id === oc.id)) {
      DB.ocs.push(oc); saveData();
      audit(`<b>${oc.delegado}</b> registrou ${oc.tipo || 'ocorrência'} sobre <b>${oc.nome}</b>`, '📝');
      broadcast('NEW_OC', oc);
    }
    return jsonRes(res, 200, { ok: true });
  }
  const mOc = url.match(/^\/api\/ocs\/([^/]+)$/);
  if (mOc) {
    const id = mOc[1];
    if (method === 'PUT') {
      const i = DB.ocs.findIndex(o => o.id === id);
      if (i === -1) return jsonRes(res, 404, { error: 'Ocorrência não encontrada.' });
      Object.assign(DB.ocs[i], body); saveData();
      audit(`Ocorrência <b>${id}</b> atualizada por <b>${body.editadoPor || body.decididoPor || 'sistema'}</b>`, '📋');
      broadcast('OC_UPDATED', DB.ocs[i]);
      return jsonRes(res, 200, { ok: true });
    }
    if (method === 'DELETE') {
      const i = DB.ocs.findIndex(o => o.id === id);
      if (i === -1) return jsonRes(res, 404, { error: 'Ocorrência não encontrada.' });
      DB.ocs.splice(i, 1); saveData();
      audit(`<b>${body.feitorPor}</b> excluiu a ocorrência <b>${id}</b>`, '🗑');
      broadcast('OC_DELETED', { id });
      return jsonRes(res, 200, { ok: true });
    }
  }

  // ── PUNIÇÕES ──
  if (method === 'GET'  && url === '/api/puns') return jsonRes(res, 200, DB.puns);
  if (method === 'POST' && url === '/api/puns') {
    const pun = body;
    if (!pun || !pun.nome) return jsonRes(res, 400, { error: 'Dados inválidos.' });
    const dup = DB.puns.find(p => p.nome === pun.nome && p.motivo === pun.motivo && p.nivel === pun.nivel && p.autor === pun.autor && (Date.now() - (p.ts||0)) < 3000);
    if (dup) return jsonRes(res, 200, { ok: true, pun: dup, dup: true });
    pun.id = `PUN-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    pun.ts = pun.ts || Date.now();
    DB.puns.push(pun); saveData();
    audit(`<b>${pun.autor}</b> registrou punição <b>${pun.nivel}</b> para <b>${pun.nome}</b>`, '⚠️');
    broadcast('NEW_PUN', pun);
    return jsonRes(res, 200, { ok: true, pun });
  }
  const mPunId = url.match(/^\/api\/puns\/id\/([^/]+)$/);
  if (method === 'DELETE' && mPunId) {
    const i = DB.puns.findIndex(p => p.id === mPunId[1]);
    if (i === -1) return jsonRes(res, 404, { error: 'Punição não encontrada.' });
    const nome = DB.puns[i].nome;
    DB.puns.splice(i, 1); saveData();
    audit(`<b>${body.feitorPor}</b> removeu punição de <b>${nome}</b>`, '🗑');
    broadcast('PUNS_UPDATED', DB.puns);
    return jsonRes(res, 200, { ok: true });
  }
  const mPunIdx = url.match(/^\/api\/puns\/(\d+)$/);
  if (method === 'DELETE' && mPunIdx) {
    const i = parseInt(mPunIdx[1]);
    if (isNaN(i) || i < 0 || i >= DB.puns.length) return jsonRes(res, 404, { error: 'Índice inválido.' });
    const nome = DB.puns[i].nome;
    DB.puns.splice(i, 1); saveData();
    audit(`<b>${body.feitorPor}</b> removeu punição de <b>${nome}</b>`, '🗑');
    broadcast('PUNS_UPDATED', DB.puns);
    return jsonRes(res, 200, { ok: true });
  }

  // ── PONTOS ──
  if (method === 'GET'  && url === '/api/pontos') return jsonRes(res, 200, DB.pontos);
  if (method === 'POST' && url === '/api/pontos') {
    const ponto = body;
    if (!ponto || !ponto.userLogin || !ponto.type) return jsonRes(res, 400, { error: 'Dados inválidos.' });
    const u = DB.users.find(x => x.user === ponto.userLogin);
    if (!u) return jsonRes(res, 404, { error: 'Usuário não encontrado.' });
    if (!Array.isArray(u.cicloDias)) u.cicloDias = [];
    if (!u.folgaDia) u.folgaDia = null;
    ponto.ts = ponto.ts || Date.now();
    const dBr = brDateStr(ponto.ts);
    if (ponto.type === 'entrada' && u.folgaDia === dBr) {
      return jsonRes(res, 403, { error: '🌴 Hoje (' + dBr + ') é seu dia de FOLGA concedido pelo sistema! Descanse, você mereceu.' });
    }
    const last = [...DB.pontos].reverse().find(p => p.userLogin === ponto.userLogin);
    if (last && last.type === ponto.type && (ponto.ts - last.ts) < 3000) {
      return jsonRes(res, 200, { ok: true, ponto: last, dup: true });
    }
    ponto.id   = 'PON-' + ponto.ts + '-' + Math.random().toString(36).slice(2, 7);
    ponto.hora = brTimeStrSec(ponto.ts);
    ponto.data = dBr;
    DB.pontos.push(ponto);
    if (ponto.type === 'saida') {
      const entradas = DB.pontos.filter(p => p.userLogin === ponto.userLogin && p.type === 'entrada').sort((a,b) => b.ts - a.ts);
      if (entradas.length > 0) {
        const entrada  = entradas[0];
        const diffMins = Math.round((ponto.ts - entrada.ts) / 60000);
        const baseMins = CARGO_BASE_MINUTES[ponto.cargo] || 0;
        const extraMins  = Math.max(0, diffMins - baseMins);
        ponto.trabalhado = diffMins;
        ponto.extraMins  = extraMins;
        ponto.extraReais = Math.floor(extraMins / 30) * 20;
        ponto.debtMins   = Math.max(0, baseMins - diffMins);
      }
      if (!u.cicloDias.includes(dBr)) u.cicloDias.push(dBr);
      if (u.cicloDias.length >= 6) {
        const fd = nextBrDateStr(dBr);
        u.folgaDia = fd; u.cicloDias = [];
        const folgaRec = { id:'FOL-'+Date.now()+'-'+Math.random().toString(36).slice(2,6), userLogin:u.user, nome:u.nome, cargo:u.cargo, type:'folga', hora:'FOLGA', data:fd, ts:ponto.ts + 86400000 };
        DB.pontos.push(folgaRec);
        audit(`<b>${u.nome}</b> completou 6 dias trabalhados — 🌴 FOLGA concedida para ${fd}`, '🌴');
        broadcast('NEW_PONTO', folgaRec);
        broadcast('FOLGA_GRANTED', { userLogin: u.user, folgaDia: fd });
      }
      ponto.ciclo = u.cicloDias.length; ponto.folgaDia = u.folgaDia;
    }
    saveData();
    const hora = brTimeStr(ponto.ts);
    let auditMsg = `<b>${ponto.nome}</b> ${ponto.type === 'entrada' ? 'bateu ponto às ' + hora : 'encerrou o turno às ' + hora}`;
    if (ponto.type === 'saida' && ponto.trabalhado !== undefined) {
      const h = Math.floor(ponto.trabalhado / 60), m = ponto.trabalhado % 60;
      auditMsg += ` — total de ${h} horas${m > 0 ? ' e ' + m + ' minutos' : ''} trabalhadas.`;
      if (ponto.extraReais > 0) auditMsg += ` <b style="color:#4ade80;">(Total horas extras ${Math.floor(ponto.extraMins/30)} - R$ ${ponto.extraReais})</b>`;
      if (ponto.debtMins > 0)   auditMsg += ` <b style="color:#f87171;">(Deve horas: ${Math.floor(ponto.debtMins/60)}h${(ponto.debtMins%60).toString().padStart(2,'0')})</b>`;
    }
    audit(auditMsg, '⏱️');
    broadcast('NEW_PONTO', ponto);
    broadcast('USERS_UPDATED', DB.users.map(pub));
    return jsonRes(res, 200, { ok: true, ponto });
  }

  // ══════════ PROVAS ══════════
  if (method === 'GET' && url === '/api/provas') return jsonRes(res, 200, DB.provas);

  // Questionário SEM gabarito (para o painel renderizar)
  if (method === 'GET' && url === '/api/prova/questionario') {
    return jsonRes(res, 200, QUESTOES_PROVA.map((q, i) => ({ q: i, enunciado: q.enunciado, alt: q.alt })));
  }

  // Entregar prova concluída (servidor corrige — gabarito fica só no servidor)
  if (method === 'POST' && url === '/api/provas') {
    const { userLogin, cargoAlvo, respostas, perdidaPorTempo } = body;
    const u = DB.users.find(x => x.user === userLogin);
    if (!u) return jsonRes(res, 404, { error: 'Usuário não encontrado.' });
    const myPerm = CARGO_PERM_SRV[u.cargo] || 0;
    const alvoPerm = CARGO_PERM_SRV[cargoAlvo] || 0;
    if (alvoPerm <= myPerm) return jsonRes(res, 400, { error: 'Escolha um cargo ACIMA do seu.' });
    if (alvoPerm >= 7) return jsonRes(res, 400, { error: 'O cargo Admin master não é obtido por prova.' });

    const respMap = {};
    (respostas || []).forEach(r => { respMap[r.q] = r; });
    const corrigidas = QUESTOES_PROVA.map((q, i) => {
      const r = respMap[i];
      const escolha = (r && r.escolha !== undefined && r.escolha !== null) ? r.escolha : null;
      return {
        q: i,
        escolha,
        justificativa: (r && r.justificativa) ? String(r.justificativa) : '',
        correta: escolha === q.correta,
        corretaIdx: q.correta,
        semResposta: escolha === null
      };
    });
    const nota = corrigidas.filter(r => r.correta).length * 10;

    const prova = {
      id: 'PRV-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      userLogin: u.user,
      nome: u.nome,
      cargoAtual: u.cargo,
      cargoAlvo,
      respostas: corrigidas,
      nota,
      status: perdidaPorTempo ? 'tempo_esgotado' : 'concluida',
      ts: Date.now(),
      decisao: null, decididoPor: null, decididoEm: null
    };
    DB.provas.push(prova);
    saveData();
    audit(`<b>${u.nome}</b> concluiu a prova para <b>${CARGO_LABEL_SRV[cargoAlvo]||cargoAlvo}</b> — nota ${nota}${perdidaPorTempo ? ' (tempo esgotado)' : ''}`, '📝');
    broadcast('NEW_PROVA', prova);
    return jsonRes(res, 200, { ok: true, prova });
  }

  // Decisão dos superiores (master, chefe, delegado = perm >= 5)
  const mProvaDec = url.match(/^\/api\/provas\/([^/]+)\/decisao$/);
  if (method === 'PUT' && mProvaDec) {
    const i = DB.provas.findIndex(p => p.id === mProvaDec[1]);
    if (i === -1) return jsonRes(res, 404, { error: 'Prova não encontrada.' });
    const { decisao, feitorPor } = body;
    if (decisao !== 'promovido' && decisao !== 'reprovado') return jsonRes(res, 400, { error: 'Decisão inválida.' });
    const executor = findUserByRef(feitorPor);
    if (!executor) return jsonRes(res, 403, { error: 'Executor não encontrado.' });
    if ((CARGO_PERM_SRV[executor.cargo]||0) < 5) return jsonRes(res, 403, { error: 'Apenas Master, Chefe de Polícia e Delegado podem avaliar provas.' });
    if (executor.user === DB.provas[i].userLogin) return jsonRes(res, 403, { error: 'Você não pode avaliar a própria prova.' });

    const prova = DB.provas[i];
    prova.decisao = decisao;
    prova.decididoPor = executor.nome;
    prova.decididoEm = Date.now();

    if (decisao === 'promovido') {
      const alvo = DB.users.find(x => x.user === prova.userLogin);
      if (!alvo) return jsonRes(res, 404, { error: 'Usuário da prova não encontrado.' });
      const oldCargo = alvo.cargo;
      alvo.cargo = prova.cargoAlvo;
      saveData();
      audit(`<b>${executor.nome}</b> APROVOU a prova de <b>${prova.nome}</b> e promoveu para <b>${CARGO_LABEL_SRV[prova.cargoAlvo]||prova.cargoAlvo}</b>`, '🎓');
      broadcast('USERS_UPDATED', DB.users.map(pub));
      broadcast('CARGO_CHANGED', { userLogin: alvo.user, oldCargo, newCargo: alvo.cargo, tipo: 'promovido', motivo: 'Aprovado na prova por ' + executor.nome, feitorPorNome: executor.nome });
    } else {
      saveData();
      audit(`<b>${executor.nome}</b> REPROVOU a prova de <b>${prova.nome}</b> para <b>${CARGO_LABEL_SRV[prova.cargoAlvo]||prova.cargoAlvo}</b>`, '❌');
    }
    broadcast('PROVA_DECIDIDA', { id: prova.id, userLogin: prova.userLogin, decisao, cargoAlvo: prova.cargoAlvo, feitorNome: executor.nome, nota: prova.nota });
    broadcast('PROVAS_UPDATED', DB.provas);
    return jsonRes(res, 200, { ok: true, prova });
  }

  // ── AUDITORIA ──
  if (method === 'GET'    && url === '/api/audit') return jsonRes(res, 200, DB.audit);
  if (method === 'DELETE' && url === '/api/audit') {
    DB.audit = []; saveData();
    broadcast('AUDIT_CLEARED', {});
    return jsonRes(res, 200, { ok: true });
  }

  return jsonRes(res, 404, { error: 'Rota não encontrada.' });
}

// ══ HTTP SERVER ══
const httpServer = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url.startsWith('/api') || req.url === '/health') return handleAPI(req, res);
  serveStatic(req, res);
});

httpServer.on('upgrade', (req, socket, head) => {
  if (req.url !== '/ws') { socket.destroy(); return; }
  if (!wsHandshake(req, socket)) return;
  socket.isAlive = true;
  socket._buffer = Buffer.alloc(0);
  wsClients.add(socket);
  const ip = req.headers['x-forwarded-for'] || socket.remoteAddress || '?';
  console.log(`[WS] + ${ip} | Total: ${wsClients.size}`);
  wsSend(socket, { type: 'INIT', payload: { ocs: DB.ocs, puns: DB.puns, pontos: DB.pontos, provas: DB.provas, users: DB.users.map(pub), audit: DB.audit } });
  socket.on('data', (chunk) => {
    socket._buffer = Buffer.concat([socket._buffer, chunk]);
    while (socket._buffer.length >= 2) {
      const frame = wsParseFrame(socket._buffer);
      if (!frame) break;
      socket._buffer = socket._buffer.slice(frame.frameLen);
      if (frame.opcode === 0x08) { wsClose(socket); return; }
      if (frame.opcode === 0x09) { wsSendPong(socket, frame.payload); continue; }
      if (frame.opcode === 0x0a) { socket.isAlive = true; continue; }
      if (frame.opcode === 0x01 || frame.opcode === 0x02) {
        try { const msg = JSON.parse(frame.payload.toString('utf8')); if (msg.type === 'PING') wsSend(socket, { type: 'PONG', ts: Date.now() }); } catch (_) {}
      }
    }
  });
  socket.on('close', () => { wsClients.delete(socket); console.log(`[WS] - ${ip} | Total: ${wsClients.size}`); });
  socket.on('error', (e) => { wsClients.delete(socket); console.error(`[WS] Erro (${ip}):`, e.message); });
});

function wsSendPong(socket, payload) { try { if (socket.writable) socket.write(wsBuildFrame(payload || Buffer.alloc(0), 0x0a)); } catch (_) {} }
function wsClose(socket) {
  try { if (socket.writable) socket.write(wsBuildFrame(Buffer.alloc(0), 0x08)); } catch (_) {}
  wsClients.delete(socket);
  try { socket.destroy(); } catch (_) {}
}

setInterval(() => {
  wsClients.forEach(s => {
    if (!s.isAlive) { wsClose(s); return; }
    s.isAlive = false;
    try { s.write(wsBuildFrame(Buffer.alloc(0), 0x09)); } catch (_) { wsClose(s); }
  });
}, 25000);

// ══ START ══
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('\n╔═══════════════════════════════════════════╗');
  console.log('║   🚔  GMPOL Sistema Central v5.4         ║');
  console.log('╠═══════════════════════════════════════════╣');
  console.log(`║   Porta: ${PORT.toString().padEnd(35)}║`);
  console.log('╠═══════════════════════════════════════════╣');
  console.log('║   master    / masterx512  (ACESSO TOTAL) ║');
  console.log('║   chefe     / chefe123                   ║');
  console.log('║   gm        / gm123                      ║');
  console.log('╚═══════════════════════════════════════════╝\n');
});

process.on('SIGTERM', () => { saveDataSync(); httpServer.close(() => process.exit(0)); });
process.on('SIGINT',  () => { saveDataSync(); httpServer.close(() => process.exit(0)); });
process.on('uncaughtException', (e) => { console.error('[FATAL]', e); saveDataSync(); });

const RENDER_URL = process.env.RENDER_EXTERNAL_URL || null;
if (RENDER_URL) {
  const keepAliveUrl = RENDER_URL.replace(/\/$/, '') + '/health';
  setInterval(() => {
    const proto = keepAliveUrl.startsWith('https') ? require('https') : require('http');
    const req = proto.get(keepAliveUrl, (res) => { res.resume(); });
    req.on('error', (e) => console.warn('[KeepAlive] Ping falhou:', e.message));
    req.end();
  }, 14 * 60 * 1000);
  console.log(`[KeepAlive] Auto-ping → ${keepAliveUrl}`);
  }
