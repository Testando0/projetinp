/**
 * GMPOL Sistema Central v2.2 — Render Edition
 * Persistência corrigida: /tmp + seed de data.json
 * WebSocket robusto + HTTP fallback endpoints
 */

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// ══ BANCO DE DADOS ══
// Render free tier: app dir é READ-ONLY. Sempre escreve em /tmp.
// Na inicialização, lê /tmp. Se vazio, semeia de __dirname/data.json.
const TMP_FILE  = path.join('/tmp', 'gmpol-data.json');
const SEED_FILE = path.join(__dirname, 'data.json');

function getDefaultData() {
  const now = Date.now();
  return {
    users: [
      { user: 'master',   pass: 'master123', cargo: 'master',   nome: 'Administrador Master', ativo: true, criadoPor: 'sistema', criadoEm: now },
      { user: 'chefe',    pass: 'chefe123',  cargo: 'chefe',    nome: 'Chefe de Polícia',      ativo: true, criadoPor: 'sistema', criadoEm: now },
      { user: 'delegado', pass: 'del123',    cargo: 'delegado', nome: 'Delegado Silva',         ativo: true, criadoPor: 'chefe',   criadoEm: now }
    ],
    ocs: [], puns: [], pontos: [], audit: []
  };
}

function loadData() {
  // 1) Tenta /tmp (dados ao vivo de sessões anteriores)
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

  // 2) Tenta seed de __dirname/data.json
  try {
    if (fs.existsSync(SEED_FILE)) {
      const raw = fs.readFileSync(SEED_FILE, 'utf8');
      const p   = JSON.parse(raw);
      if (p && Array.isArray(p.users)) {
        console.log('[DB] Carregado de seed:', SEED_FILE);
        const data = sanitize(p);
        // Copia para /tmp para próximas inicializações
        try { fs.writeFileSync(TMP_FILE, JSON.stringify(data, null, 2)); } catch (_) {}
        return data;
      }
    }
  } catch (e) { console.warn('[DB] Seed ilegível:', e.message); }

  // 3) Dados padrão
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
  if (len < 126)       { header = Buffer.alloc(2);  header[0] = 0x80 | opcode; header[1] = len; }
  else if (len < 65536){ header = Buffer.alloc(4);  header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(len, 2); }
  else                 { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
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
  '.js': 'application/javascript',    '.json': 'application/json',
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

  // ── HEALTH ──
  if (method === 'GET' && url === '/health') {
    return jsonRes(res, 200, {
      ok: true, uptime: Math.floor(process.uptime()),
      clientes: wsClients.size, usuarios: DB.users.length,
      ocs: DB.ocs.length, puns: DB.puns.length, pontos: DB.pontos.length
    });
  }

  // ── ESTADO COMPLETO (HTTP fallback para clientes sem WS) ──
  if (method === 'GET' && url === '/api/state') {
    return jsonRes(res, 200, {
      ocs: DB.ocs, puns: DB.puns, pontos: DB.pontos,
      users: DB.users.map(pub), audit: DB.audit
    });
  }

  // ── AUTH ──
  if (method === 'POST' && url === '/api/login') {
    const { user, pass } = body;
    if (!user || !pass) return jsonRes(res, 400, { error: 'Preencha usuário e senha.' });
    const u = DB.users.find(u =>
      u.user === String(user).trim().toLowerCase() &&
      u.pass === String(pass) && u.ativo
    );
    if (!u) return jsonRes(res, 401, { error: 'Credenciais inválidas ou conta desativada.' });
    return jsonRes(res, 200, { ok: true, user: pub(u) });
  }

  // ── USUÁRIOS ──
  if (method === 'GET'  && url === '/api/users') return jsonRes(res, 200, DB.users.map(pub));

  if (method === 'POST' && url === '/api/users') {
    const { nome, user, cargo, pass, criadoPor } = body;
    if (!nome || !user || !cargo || !pass) return jsonRes(res, 400, { error: 'Todos os campos são obrigatórios.' });
    const login = String(user).trim().toLowerCase().replace(/\s/g, '');
    if (DB.users.find(u => u.user === login)) return jsonRes(res, 400, { error: 'Login já existe.' });
    if (pass.length < 6) return jsonRes(res, 400, { error: 'Senha mínima: 6 caracteres.' });
    const novo = { user: login, pass, cargo, nome, ativo: true, criadoPor: criadoPor || 'sistema', criadoEm: Date.now() };
    DB.users.push(novo);
    saveData();
    audit(`<b>${criadoPor}</b> criou o usuário <b>${nome}</b> (${cargo})`, '👤');
    broadcast('USERS_UPDATED', DB.users.map(pub));
    return jsonRes(res, 200, { ok: true });
  }

  const mSenha  = url.match(/^\/api\/users\/([^/]+)\/senha$/);
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

  const mCargo  = url.match(/^\/api\/users\/([^/]+)\/cargo$/);
  if (method === 'PUT' && mCargo) {
    const i = DB.users.findIndex(u => u.user === mCargo[1]);
    if (i === -1) return jsonRes(res, 404, { error: 'Usuário não encontrado.' });
    const { cargo, feitorPor } = body;
    const old = DB.users[i].cargo;
    DB.users[i].cargo = cargo;
    saveData();
    audit(`<b>${feitorPor}</b> alterou cargo de <b>${DB.users[i].nome}</b>: ${old} → ${cargo}`, '🏷️');
    broadcast('USERS_UPDATED', DB.users.map(pub));
    return jsonRes(res, 200, { ok: true });
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

  // ── OCORRÊNCIAS ──
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

  // ── PUNIÇÕES ──
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

  const mPunId  = url.match(/^\/api\/puns\/id\/([^/]+)$/);
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

  // ── PONTOS ──
  if (method === 'GET'  && url === '/api/pontos') return jsonRes(res, 200, DB.pontos);

  if (method === 'POST' && url === '/api/pontos') {
    const ponto = body;
    if (!ponto || !ponto.userLogin) return jsonRes(res, 400, { error: 'Dados inválidos.' });
    DB.pontos.push(ponto);
    saveData();
    audit(`<b>${ponto.nome}</b> bateu ponto às ${ponto.hora}`, '⏱️');
    broadcast('NEW_PONTO', ponto);
    return jsonRes(res, 200, { ok: true });
  }

  // ── AUDITORIA ──
  if (method === 'GET'    && url === '/api/audit') return jsonRes(res, 200, DB.audit);
  if (method === 'DELETE' && url === '/api/audit') {
    DB.audit = [];
    saveData();
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

// ══ WEBSOCKET UPGRADE ══
httpServer.on('upgrade', (req, socket, head) => {
  if (req.url !== '/ws') { socket.destroy(); return; }
  if (!wsHandshake(req, socket)) return;

  socket.isAlive = true;
  socket._buffer = Buffer.alloc(0);
  wsClients.add(socket);

  const ip = req.headers['x-forwarded-for'] || socket.remoteAddress || '?';
  console.log(`[WS] + ${ip} | Total: ${wsClients.size}`);

  // Envia estado completo ao conectar
  wsSend(socket, {
    type: 'INIT',
    payload: {
      ocs: DB.ocs, puns: DB.puns, pontos: DB.pontos,
      users: DB.users.map(pub), audit: DB.audit
    }
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

// Heartbeat a cada 25s (Render timeout = 55s)
setInterval(() => {
  wsClients.forEach(s => {
    if (!s.isAlive) { wsClose(s); return; }
    s.isAlive = false;
    try { s.write(wsBuildFrame(Buffer.alloc(0), 0x09)); }
    catch (_) { wsClose(s); }
  });
}, 25000);

// ══ START ══
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('\n╔═══════════════════════════════════════════╗');
  console.log('║   🚔  GMPOL Sistema Central v2.2         ║');
  console.log('╠═══════════════════════════════════════════╣');
  console.log(`║   Porta: ${PORT.toString().padEnd(35)}║`);
  console.log('╠═══════════════════════════════════════════╣');
  console.log('║   master   / master123                   ║');
  console.log('║   chefe    / chefe123                    ║');
  console.log('║   delegado / del123                      ║');
  console.log('╚═══════════════════════════════════════════╝\n');
});

process.on('SIGTERM', () => { saveDataSync(); httpServer.close(() => process.exit(0)); });
process.on('SIGINT',  () => { saveDataSync(); httpServer.close(() => process.exit(0)); });
process.on('uncaughtException', (e) => { console.error('[FATAL]', e); saveDataSync(); });

// ══ KEEP-ALIVE (Render Free Tier) ══
// Faz auto-ping a cada 14 min para evitar que o serviço durma.
// Também configure o UptimeRobot (gratuito) apontando para:
//   https://SEU-APP.onrender.com/health
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || null;
if (RENDER_URL) {
  const keepAliveUrl = RENDER_URL.replace(/\/$/, '') + '/health';
  setInterval(() => {
    const proto = keepAliveUrl.startsWith('https') ? require('https') : require('http');
    const req = proto.get(keepAliveUrl, (res) => {
      console.log(`[KeepAlive] Ping OK — status ${res.statusCode}`);
      res.resume();
    });
    req.on('error', (e) => console.warn('[KeepAlive] Ping falhou:', e.message));
    req.end();
  }, 14 * 60 * 1000); // 14 minutos
  console.log(`[KeepAlive] Auto-ping ativo → ${keepAliveUrl}`);
} else {
  console.log('[KeepAlive] Defina RENDER_EXTERNAL_URL nas env vars do Render para ativar o auto-ping.');
}
