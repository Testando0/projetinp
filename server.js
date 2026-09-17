/**
 * GMPOL Sistema Central v4.0
 * Novos cargos: Guarda municipal, Agente oficial, Tático, Escrivão, Delegado, Chefe de polícia, Admin master
 * Sistema de ponto com entrada, saída e cálculo de horas extras
 */

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// ══ CARGO PERM (server-side) ══
const CARGO_PERM_SRV = {
  admin: 7, chefe: 6, delegado: 5, escrivao: 4, tatico: 3, agente: 2, gm: 1
};
const CARGO_LABEL_SRV = {
  admin:     'Admin master',
  chefe:     'Chefe de polícia',
  delegado:  'Delegado',
  escrivao:  'Escrivão',
  tatico:    'Tático',
  agente:    'Agente oficial',
  gm:        'Guarda municipal'
};

const CARGO_BASE_MINUTES = {
  gm: 90,        // 1h30
  agente: 150,   // 2h30
  tatico: 210,   // 3h30
  escrivao: 240, // 4h00
  delegado: 300, // 5h00
  chefe: 0,      
  admin: 0       
};

// ══ BANCO DE DADOS ══
const TMP_FILE  = path.join('/tmp', 'gmpol-data.json');
const SEED_FILE = path.join(__dirname, 'data.json');

function getDefaultData() {
  const now = Date.now();
  return {
    users: [
      { user: 'admin',   pass: 'admin123',   cargo: 'admin',   nome: 'Admin Master',     ativo: true, criadoPor: 'sistema', criadoEm: now },
      { user: 'chefe',   pass: 'chefe123',   cargo: 'chefe',   nome: 'Chefe Padrão',     ativo: true, criadoPor: 'sistema', criadoEm: now },
      { user: 'gm',      pass: 'gm123',      cargo: 'gm',      nome: 'GM Padrão',        ativo: true, criadoPor: 'chefe',   criadoEm: now }
    ],
    ocs: [], puns: [], pontos: [], audit: []
  };
}

function loadData() {
  try {
    if (fs.existsSync(TMP_FILE)) {
      const raw = fs.readFileSync(TMP_FILE, 'utf8');
      const p   = JSON.parse(raw);
      if (p && Array.isArray(p.users) && p.users.length > 0) {
        console.log('[DB] Carregado de /tmp:', TMP_FILE);
        return sanitize(p);
      }
    }
  } catch (e) { console.warn('[DB] /tmp ilegível:', e.message); }
  try {
    if (fs.existsSync(SEED_FILE)) {
      const raw = fs.readFileSync(SEED_FILE, 'utf8');
      const p   = JSON.parse(raw);
      if (p && Array.isArray(p.users)) {
        console.log('[DB] Carregado de seed:', SEED_FILE);
        const data = sanitize(p);
        try { fs.writeFileSync(TMP_FILE, JSON.stringify(data, null, 2)); } catch (_) {}
        return data;
      }
    }
  } catch (e) { console.warn('[DB] Seed ilegível:', e.message); }
  console.log('[DB] Usando dados padrão.');
  const def = getDefaultData();
  try { fs.writeFileSync(TMP_FILE, JSON.stringify(def, null, 2)); } catch (_) {}
  return def;
}

function sanitize(p) {
  const def = getDefaultData();
  return {
    users:  Array.isArray(p.users)  ? p.users  : def.users,
    ocs:    Array.isArray(p.ocs)    ? p.ocs    : [],
    puns:   Array.isArray(p.puns)   ? p.puns   : [],
    pontos: Array.isArray(p.pontos) ? p.pontos : [],
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
console.log(`[DB] ${DB.users.length} usuários | ${DB.ocs.length} OCs | ${DB.puns.length} punições`);

// ══ WEBSOCKET NATIVO ══
const wsClients = new Set();

function wsHandshake(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return false; }
  const accept = crypto.createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
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

function wsSend(socket, obj) {
  try { if (socket.writable) socket.write(wsBuildFrame(JSON.stringify(obj))); } catch (_) {}
}
function broadcast(type, payload) {
  const frame = wsBuildFrame(JSON.stringify({ type, payload }));
  wsClients.forEach(s => {
    try { if (s.writable) s.write(frame); }
    catch (_) { wsClients.delete(s); }
  });
}

function pub(u) { const { pass, ...r } = u; return r; }

function audit(msg, icon = '📋') {
  DB.audit.unshift({ msg, icon, ts: Date.now() });
  DB.audit = DB.audit.slice(0, 300);
  saveData();
  broadcast('AUDIT_NEW', DB.audit[0]);
}

// ══ MIME TYPES ══
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css',
  '.js': 'application/javascript',     '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
};

function serveStatic(req, res) {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(__dirname, 'public', urlPath);
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(__dirname, 'public', 'index.html'), (e2, d2) => {
        if (e2) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d2);
      });
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
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
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  let body = {};
  if (['POST', 'PUT', 'DELETE'].includes(method)) {
    try { body = await readBody(req); }
    catch (e) { return jsonRes(res, 400, { error: 'Body inválido.' }); }
  }

  if (method === 'GET' && url === '/health') {
    return jsonRes(res, 200, {
      ok: true, uptime: Math.floor(process.uptime()),
      clientes: wsClients.size, usuarios: DB.users.length,
      ocs: DB.ocs.length, puns: DB.puns.length, pontos: DB.pontos.length
    });
  }

  if (method === 'GET' && url === '/api/state') {
    return jsonRes(res, 200, {
      ocs: DB.ocs, puns: DB.puns, pontos: DB.pontos,
      users: DB.users.map(pub), audit: DB.audit
    });
  }

  if (method === 'POST' && url === '/api/login') {
    const { user, pass } = body;
    if (!user || !pass) return jsonRes(res, 400, { error: 'Preencha usuário e senha.' });
    const u = DB.users.find(u =>
      u.user === String(user).trim().toLowerCase() &&
      u.pass === String(pass) && u.ativo
    );
    if (!u) return jsonRes(res, 401, { error: 'Credenciais inválidas ou conta desativada.' });
    if (u.banExpires && u.banExpires > Date.now()) {
      return jsonRes(res, 403, {
        banned:    true,
        expiresAt: u.banExpires,
        reason:    u.banReason || 'Suspensão temporária.',
        banBy:     u.banBy     || 'Sistema'
      });
    }
    return jsonRes(res, 200, { ok: true, user: pub(u) });
  }

  if (method === 'GET' && url === '/api/users') return jsonRes(res, 200, DB.users.map(pub));

  if (method === 'POST' && url === '/api/users') {
    const { nome, user, cargo, pass, criadoPor } = body;
    if (!nome || !user || !cargo || !pass) return jsonRes(res, 400, { error: 'Todos os campos são obrigatórios.' });
    const login = String(user).trim().toLowerCase().replace(/\s/g, '');
    if (DB.users.find(u => u.user === login)) return jsonRes(res, 400, { error: 'Login já existe.' });
    if (pass.length < 6) return jsonRes(res, 400, { error: 'Senha mínima: 6 caracteres.' });
    
    const criador = DB.users.find(u => u.user === criadoPor);
    if (!criador || (CARGO_PERM_SRV[criador.cargo]||0) < 6) {
      return jsonRes(res, 403, { error: 'Apenas Chefes de Polícia podem criar usuários.' });
    }
    if ((CARGO_PERM_SRV[cargo]||0) >= (CARGO_PERM_SRV[criador.cargo]||0)) {
      return jsonRes(res, 403, { error: 'Você não pode criar usuários com cargo igual ou superior ao seu.' });
    }
    const novo = { user: login, pass, cargo, nome, ativo: true, criadoPor: criadoPor || 'sistema', criadoEm: Date.now() };
    DB.users.push(novo);
    saveData();
    audit(`<b>${criadoPor}</b> criou o usuário <b>${nome}</b> (${CARGO_LABEL_SRV[cargo]||cargo})`, '👤');
    broadcast('USERS_UPDATED', DB.users.map(pub));
    return jsonRes(res, 200, { ok: true });
  }

  const mBanCheck = url.match(/^\/api\/users\/([^/]+)\/bancheck$/);
  if (method === 'GET' && mBanCheck) {
    const u = DB.users.find(u => u.user === mBanCheck[1]);
    if (!u) return jsonRes(res, 200, { banned: false });
    if (u.banExpires && u.banExpires > Date.now()) {
      return jsonRes(res, 200, { banned: true, expiresAt: u.banExpires, reason: u.banReason, banBy: u.banBy });
    }
    return jsonRes(res, 200, { banned: false });
  }

  const mSenha = url.match(/^\/api\/users\/([^/]+)\/senha$/);
  if (method === 'PUT' && mSenha) {
    const i = DB.users.findIndex(u => u.user === mSenha[1]);
    if (i === -1) return jsonRes(res, 404, { error: 'Usuário não encontrado.' });
    const { novaSenha, feitorPor } = body;
    if (!novaSenha || novaSenha.length < 6) return jsonRes(res, 400, { error: 'Senha mínima: 6 caracteres.' });
    DB.users[i].pass = novaSenha;
    saveData();
    audit(`<b>${feitorPor}</b> redefiniu a senha de <b>${DB.users[i].nome}</b>`, '🔑');
    broadcast('USERS_UPDATED', DB.users.map(pub));
    return jsonRes(res, 200, { ok: true });
  }

  const mStatus = url.match(/^\/api\/users\/([^/]+)\/status$/);
  if (method === 'PUT' && mStatus) {
    const i = DB.users.findIndex(u => u.user === mStatus[1]);
    if (i === -1) return jsonRes(res, 404, { error: 'Usuário não encontrado.' });
    const { ativo, feitorPor } = body;
    DB.users[i].ativo = Boolean(ativo);
    saveData();
    audit(`<b>${feitorPor}</b> ${ativo ? 'ativou' : 'desativou'} <b>${DB.users[i].nome}</b>`, ativo ? '✅' : '🚫');
    broadcast('USERS_UPDATED', DB.users.map(pub));
    return jsonRes(res, 200, { ok: true });
  }

  const mCargo = url.match(/^\/api\/users\/([^/]+)\/cargo$/);
  if (method === 'PUT' && mCargo) {
    const i = DB.users.findIndex(u => u.user === mCargo[1]);
    if (i === -1) return jsonRes(res, 404, { error: 'Usuário não encontrado.' });

    const { cargo, feitorPor, motivo } = body;
    const targetUser = DB.users[i];

    if (targetUser.cargo === 'admin') {
      return jsonRes(res, 403, { error: 'O Admin Master não pode ser rebaixado.' });
    }

    const executor = DB.users.find(u => u.user === feitorPor);
    if (!executor || (CARGO_PERM_SRV[executor.cargo]||0) < 6) {
      return jsonRes(res, 403, { error: 'Apenas Chefes de Polícia podem alterar cargos.' });
    }
    const execPerm = CARGO_PERM_SRV[executor.cargo]||0;
    if ((CARGO_PERM_SRV[cargo]||0) >= execPerm) {
      return jsonRes(res, 403, { error: 'Você não pode atribuir cargo igual ou superior ao seu.' });
    }

    const oldPerm = CARGO_PERM_SRV[targetUser.cargo] || 0;
    const newPerm = CARGO_PERM_SRV[cargo] || 0;
    const isRebaixamento = newPerm < oldPerm;

    if (isRebaixamento && !motivo) {
      return jsonRes(res, 400, { error: 'Motivo obrigatório para rebaixamento.' });
    }

    const oldCargo = targetUser.cargo;
    DB.users[i].cargo = cargo;
    saveData();

    let logMsg, logIcon;
    if (isRebaixamento) {
      logMsg = `<b>${feitorPor}</b> rebaixou <b>${DB.users[i].nome}</b> de ${CARGO_LABEL_SRV[oldCargo]||oldCargo} para ${CARGO_LABEL_SRV[cargo]||cargo} — motivo: ${motivo}`;
      logIcon = '📉';
    } else {
      logMsg = `<b>${feitorPor}</b> promoveu <b>${DB.users[i].nome}</b> de ${CARGO_LABEL_SRV[oldCargo]||oldCargo} para ${CARGO_LABEL_SRV[cargo]||cargo}`;
      logIcon = '📈';
    }

    audit(logMsg, logIcon);
    broadcast('USERS_UPDATED', DB.users.map(pub));
    broadcast('CARGO_CHANGED', {
      userLogin:    DB.users[i].user,
      oldCargo,
      newCargo:     cargo,
      tipo:         isRebaixamento ? 'rebaixado' : 'promovido',
      motivo:       motivo || null,
      feitorPorNome: feitorPor
    });
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
      
      const executor = DB.users.find(u => u.user === feitorPor);
      const execPerm = executor ? (CARGO_PERM_SRV[executor.cargo]||0) : 0;
      const tgtPerm  = CARGO_PERM_SRV[DB.users[i].cargo]||0;
      if (execPerm <= tgtPerm || execPerm < 3) return jsonRes(res, 403, { error: 'Permissão insuficiente para suspender este usuário.' });
      
      const expiresAt = Date.now() + mins * 60 * 1000;
      DB.users[i].banExpires = expiresAt;
      DB.users[i].banReason  = motivo;
      DB.users[i].banBy      = feitorPorNome || feitorPor;
      saveData();
      const nome = DB.users[i].nome;
      audit(`<b>${feitorPorNome||feitorPor}</b> suspendeu <b>${nome}</b> por ${mins} min(s) — motivo: ${motivo}`, '⛔');
      broadcast('USERS_UPDATED', DB.users.map(pub));
      broadcast('USER_BANNED', {
        userLogin: DB.users[i].user,
        expiresAt,
        reason:   motivo,
        banBy:    feitorPorNome || feitorPor,
        duracao:  mins
      });
      return jsonRes(res, 200, { ok: true });
    }
    if (method === 'DELETE') {
      const i = DB.users.findIndex(u => u.user === mBan[1]);
      if (i === -1) return jsonRes(res, 404, { error: 'Usuário não encontrado.' });
      const { feitorPor } = body;
      const nome = DB.users[i].nome;
      DB.users[i].banExpires = null;
      DB.users[i].banReason  = null;
      DB.users[i].banBy      = null;
      saveData();
      audit(`<b>${feitorPor}</b> removeu a suspensão de <b>${nome}</b>`, '✅');
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
    const nome = DB.users[i].nome;
    DB.users.splice(i, 1);
    saveData();
    audit(`<b>${feitorPor}</b> excluiu o usuário <b>${nome}</b>`, '🗑');
    broadcast('USERS_UPDATED', DB.users.map(pub));
    return jsonRes(res, 200, { ok: true });
  }

  if (method === 'GET'  && url === '/api/ocs') return jsonRes(res, 200, DB.ocs);
  if (method === 'POST' && url === '/api/ocs') {
    const oc = body;
    if (!oc || !oc.id) return jsonRes(res, 400, { error: 'Dados inválidos.' });
    if (!DB.ocs.find(o => o.id === oc.id)) {
      DB.ocs.push(oc);
      saveData();
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
      Object.assign(DB.ocs[i], body);
      saveData();
      audit(`Ocorrência <b>${id}</b> atualizada por <b>${body.editadoPor || body.decididoPor || 'sistema'}</b>`, '📋');
      broadcast('OC_UPDATED', DB.ocs[i]);
      return jsonRes(res, 200, { ok: true });
    }
    if (method === 'DELETE') {
      const i = DB.ocs.findIndex(o => o.id === id);
      if (i === -1) return jsonRes(res, 404, { error: 'Ocorrência não encontrada.' });
      DB.ocs.splice(i, 1);
      saveData();
      audit(`<b>${body.feitorPor}</b> excluiu a ocorrência <b>${id}</b>`, '🗑');
      broadcast('OC_DELETED', { id });
      return jsonRes(res, 200, { ok: true });
    }
  }

  if (method === 'GET'  && url === '/api/puns') return jsonRes(res, 200, DB.puns);
  if (method === 'POST' && url === '/api/puns') {
    const pun = body;
    if (!pun || !pun.nome) return jsonRes(res, 400, { error: 'Dados inválidos.' });
    pun.id = `PUN-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    DB.puns.push(pun);
    saveData();
    audit(`<b>${pun.autor}</b> registrou punição <b>${pun.nivel}</b> para <b>${pun.nome}</b>`, '⚠️');
    broadcast('NEW_PUN', pun);
    return jsonRes(res, 200, { ok: true });
  }

  const mPunId = url.match(/^\/api\/puns\/id\/([^/]+)$/);
  if (method === 'DELETE' && mPunId) {
    const i = DB.puns.findIndex(p => p.id === mPunId[1]);
    if (i === -1) return jsonRes(res, 404, { error: 'Punição não encontrada.' });
    const nome = DB.puns[i].nome;
    DB.puns.splice(i, 1);
    saveData();
    audit(`<b>${body.feitorPor}</b> removeu punição de <b>${nome}</b>`, '🗑');
    broadcast('PUNS_UPDATED', DB.puns);
    return jsonRes(res, 200, { ok: true });
  }

  const mPunIdx = url.match(/^\/api\/puns\/(\d+)$/);
  if (method === 'DELETE' && mPunIdx) {
    const i = parseInt(mPunIdx[1]);
    if (isNaN(i) || i < 0 || i >= DB.puns.length) return jsonRes(res, 404, { error: 'Índice inválido.' });
    const nome = DB.puns[i].nome;
    DB.puns.splice(i, 1);
    saveData();
    audit(`<b>${body.feitorPor}</b> removeu punição de <b>${nome}</b>`, '🗑');
    broadcast('PUNS_UPDATED', DB.puns);
    return jsonRes(res, 200, { ok: true });
  }

  if (method === 'GET'  && url === '/api/pontos') return jsonRes(res, 200, DB.pontos);
  if (method === 'POST' && url === '/api/pontos') {
    const ponto = body;
    if (!ponto || !ponto.userLogin || !ponto.type) return jsonRes(res, 400, { error: 'Dados inválidos.' });
    
    DB.pontos.push(ponto);
    
    if (ponto.type === 'saida') {
        const entradas = DB.pontos.filter(p => p.userLogin === ponto.userLogin && p.type === 'entrada').sort((a,b) => b.ts - a.ts);
        if (entradas.length > 0) {
            const entrada = entradas[0];
            const diffMs = ponto.ts - entrada.ts;
            const diffMins = Math.round(diffMs / 60000);
            const baseMins = CARGO_BASE_MINUTES[ponto.cargo] || 0;
            
            const extraMins = Math.max(0, diffMins - baseMins);
            const extraBlocks = Math.floor(extraMins / 30);
            const extraMoney = extraBlocks * 20;
            
            const debtMins = Math.max(0, baseMins - diffMins);
            
            ponto.trabalhado = diffMins;
            ponto.extraMins = extraMins;
            ponto.extraReais = extraMoney;
            ponto.debtMins = debtMins;
        }
    }

    saveData();
    const hora = new Date(ponto.ts).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
    let auditMsg = `<b>${ponto.nome}</b> ${ponto.type === 'entrada' ? 'bateu ponto às ' + hora : 'encerrou o turno às ' + hora}`;
    if (ponto.type === 'saida' && ponto.trabalhado !== undefined) {
        const h = Math.floor(ponto.trabalhado / 60);
        const m = ponto.trabalhado % 60;
        auditMsg += ` — total de ${h} horas${m > 0 ? ' e ' + m + ' minutos' : ''} trabalhadas.`;
        if (ponto.extraReais > 0) {
            auditMsg += ` <b style="color:#4ade80;">(Total horas extras ${Math.floor(ponto.extraMins/30)} - R$ ${ponto.extraReais})</b>`;
        }
        if (ponto.debtMins > 0) {
            auditMsg += ` <b style="color:#f87171;">(Deve horas: ${Math.floor(ponto.debtMins/60)}h${(ponto.debtMins%60).toString().padStart(2,'0')})</b>`;
        }
    }
    audit(auditMsg, '⏱️');
    broadcast('NEW_PONTO', ponto);
    return jsonRes(res, 200, { ok: true, ponto });
  }

  if (method === 'GET'    && url === '/api/audit') return jsonRes(res, 200, DB.audit);
  if (method === 'DELETE' && url === '/api/audit') {
    DB.audit = [];
    saveData();
    broadcast('AUDIT_CLEARED', {});
    return jsonRes(res, 200, { ok: true });
  }

  return jsonRes(res, 404, { error: 'Rota não encontrada.' });
}

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
  wsSend(socket, {
    type: 'INIT',
    payload: { ocs: DB.ocs, puns: DB.puns, pontos: DB.pontos, users: DB.users.map(pub), audit: DB.audit }
  });
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
        try {
          const msg = JSON.parse(frame.payload.toString('utf8'));
          if (msg.type === 'PING') wsSend(socket, { type: 'PONG', ts: Date.now() });
        } catch (_) {}
      }
    }
  });
  socket.on('close', () => { wsClients.delete(socket); console.log(`[WS] - ${ip} | Total: ${wsClients.size}`); });
  socket.on('error', (e) => { wsClients.delete(socket); console.error(`[WS] Erro (${ip}):`, e.message); });
});

function wsSendPong(socket, payload) {
  try { if (socket.writable) socket.write(wsBuildFrame(payload || Buffer.alloc(0), 0x0a)); } catch (_) {}
}
function wsClose(socket) {
  try { if (socket.writable) socket.write(wsBuildFrame(Buffer.alloc(0), 0x08)); } catch (_) {}
  wsClients.delete(socket);
  try { socket.destroy(); } catch (_) {}
}

setInterval(() => {
  wsClients.forEach(s => {
    if (!s.isAlive) { wsClose(s); return; }
    s.isAlive = false;
    try { s.write(wsBuildFrame(Buffer.alloc(0), 0x09)); }
    catch (_) { wsClose(s); }
  });
}, 25000);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('\n╔═══════════════════════════════════════════╗');
  console.log('║   👑  GMPOL Sistema Central v4.0         ║');
  console.log('╠═══════════════════════════════════════════╣');
  console.log(`║   Porta: ${PORT.toString().padEnd(35)}║`);
  console.log('╠═══════════════════════════════════════════╣');
  console.log('║   admin     / admin123                   ║');
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
