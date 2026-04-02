/**
 * GMPOL Sistema Central v2.1
 * Servidor 100% nativo — NÃO precisa de npm install
 * Usa apenas módulos built-in do Node.js (http, fs, path, crypto)
 * Requer Node.js 14+
 */

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// ══ BANCO DE DADOS ══
const DATA_FILE = path.join(__dirname, 'data.json');

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
  try {
    if (fs.existsSync(DATA_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      const def = getDefaultData();
      return {
        users:  Array.isArray(parsed.users)  ? parsed.users  : def.users,
        ocs:    Array.isArray(parsed.ocs)    ? parsed.ocs    : [],
        puns:   Array.isArray(parsed.puns)   ? parsed.puns   : [],
        pontos: Array.isArray(parsed.pontos) ? parsed.pontos : [],
        audit:  Array.isArray(parsed.audit)  ? parsed.audit  : []
      };
    }
  } catch(e) { console.error('[DB] Erro ao carregar:', e.message); }
  const def = getDefaultData();
  fs.writeFileSync(DATA_FILE, JSON.stringify(def, null, 2));
  return def;
}

let _saveTimer = null;
function saveData() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(DB, null, 2)); }
    catch(e) { console.error('[DB] Erro ao salvar:', e.message); }
  }, 200);
}
function saveDataSync() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(DB, null, 2)); }
  catch(e) { console.error('[DB] Erro ao salvar:', e.message); }
}

let DB = loadData();
console.log(`[DB] ${DB.users.length} usuários carregados.`);

// ══ WEBSOCKET NATIVO ══
const wsClients = new Set();

function wsHandshake(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return null; }
  const accept = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  return true;
}

function wsParseFrame(buf) {
  if (buf.length < 2) return null;
  const fin    = (buf[0] & 0x80) !== 0;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let len      = buf[1] & 0x7f;
  let offset   = 2;

  if (len === 126) { len = buf.readUInt16BE(2); offset = 4; }
  else if (len === 127) { len = Number(buf.readBigUInt64BE(2)); offset = 10; }

  if (buf.length < offset + (masked ? 4 : 0) + len) return null;

  let payload;
  if (masked) {
    const mask = buf.slice(offset, offset + 4);
    offset += 4;
    payload = Buffer.alloc(len);
    for (let i = 0; i < len; i++) payload[i] = buf[offset + i] ^ mask[i % 4];
  } else {
    payload = buf.slice(offset, offset + len);
  }
  return { opcode, payload, fin };
}

function wsBuildFrame(data, opcode = 1) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function wsSend(socket, obj) {
  try {
    if (socket.writable) socket.write(wsBuildFrame(JSON.stringify(obj)));
  } catch(_) {}
}

function wsSendPong(socket) {
  try {
    if (socket.writable) socket.write(wsBuildFrame(Buffer.alloc(0), 0x0a));
  } catch(_) {}
}

function wsClose(socket) {
  try { socket.write(wsBuildFrame(Buffer.alloc(0), 0x08)); } catch(_) {}
  wsClients.delete(socket);
  socket.destroy();
}

function broadcast(type, payload) {
  const frame = wsBuildFrame(JSON.stringify({ type, payload }));
  wsClients.forEach(s => { try { if (s.writable) s.write(frame); } catch(_) { wsClients.delete(s); } });
}

// ══ HELPERS ══
function pub(u) { const { pass, ...r } = u; return r; }

function audit(msg, icon = '📋') {
  DB.audit.unshift({ msg, icon, ts: Date.now() });
  DB.audit = DB.audit.slice(0, 300);
  saveData();
  broadcast('AUDIT_NEW', DB.audit[0]);
}

// ══ MIME TYPES ══
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
};

function serveStatic(req, res) {
  let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
  // Segurança: não sair da pasta public
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404); res.end('Not found'); return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 2e6) reject(new Error('Payload muito grande')); });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch(e) { resolve({}); }
    });
    req.on('error', reject);
  });
}

function jsonRes(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

// ══ ROTEADOR ══
async function handleAPI(req, res) {
  const method = req.method;
  const url    = req.url.split('?')[0];
  let body = {};
  if (['POST','PUT','DELETE'].includes(method)) {
    try { body = await readBody(req); } catch(e) { return jsonRes(res, 400, { error: 'Body inválido.' }); }
  }

  // OPTIONS (CORS preflight)
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  // ── AUTH ──
  if (method === 'POST' && url === '/api/login') {
    const { user, pass } = body;
    if (!user || !pass) return jsonRes(res, 400, { error: 'Preencha usuário e senha.' });
    const u = DB.users.find(u => u.user === String(user).trim().toLowerCase() && u.pass === String(pass) && u.ativo);
    if (!u) return jsonRes(res, 401, { error: 'Credenciais inválidas ou conta desativada.' });
    return jsonRes(res, 200, { ok: true, user: pub(u) });
  }

  // ── USUÁRIOS ──
  if (method === 'GET' && url === '/api/users') {
    return jsonRes(res, 200, DB.users.map(pub));
  }
  if (method === 'POST' && url === '/api/users') {
    const { nome, user, cargo, pass, criadoPor } = body;
    if (!nome || !user || !cargo || !pass) return jsonRes(res, 400, { error: 'Todos os campos são obrigatórios.' });
    const login = String(user).trim().toLowerCase().replace(/\s/g,'');
    if (DB.users.find(u => u.user === login)) return jsonRes(res, 400, { error: 'Login já existe.' });
    if (pass.length < 6) return jsonRes(res, 400, { error: 'Senha mínima: 6 caracteres.' });
    const novo = { user: login, pass, cargo, nome, ativo: true, criadoPor: criadoPor||'sistema', criadoEm: Date.now() };
    DB.users.push(novo);
    saveData();
    audit(`<b>${criadoPor}</b> criou o usuário <b>${nome}</b> (${cargo})`, '👤');
    broadcast('USERS_UPDATED', DB.users.map(pub));
    return jsonRes(res, 200, { ok: true });
  }

  // PUT /api/users/:username/senha
  const mSenha = url.match(/^\/api\/users\/([^/]+)\/senha$/);
  if (method === 'PUT' && mSenha) {
    const username = mSenha[1];
    const { novaSenha, feitorPor } = body;
    if (!novaSenha || novaSenha.length < 6) return jsonRes(res, 400, { error: 'Senha mínima: 6 caracteres.' });
    const i = DB.users.findIndex(u => u.user === username);
    if (i === -1) return jsonRes(res, 404, { error: 'Usuário não encontrado.' });
    DB.users[i].pass = novaSenha;
    saveData();
    audit(`<b>${feitorPor}</b> redefiniu a senha de <b>${DB.users[i].nome}</b>`, '🔑');
    broadcast('USERS_UPDATED', DB.users.map(pub));
    return jsonRes(res, 200, { ok: true });
  }

  // PUT /api/users/:username/status
  const mStatus = url.match(/^\/api\/users\/([^/]+)\/status$/);
  if (method === 'PUT' && mStatus) {
    const username = mStatus[1];
    const { ativo, feitorPor } = body;
    const i = DB.users.findIndex(u => u.user === username);
    if (i === -1) return jsonRes(res, 404, { error: 'Usuário não encontrado.' });
    DB.users[i].ativo = Boolean(ativo);
    saveData();
    audit(`<b>${feitorPor}</b> ${ativo?'ativou':'desativou'} a conta de <b>${DB.users[i].nome}</b>`, ativo?'✅':'🚫');
    broadcast('USERS_UPDATED', DB.users.map(pub));
    return jsonRes(res, 200, { ok: true });
  }

  // PUT /api/users/:username/cargo
  const mCargo = url.match(/^\/api\/users\/([^/]+)\/cargo$/);
  if (method === 'PUT' && mCargo) {
    const username = mCargo[1];
    const { cargo, feitorPor } = body;
    const i = DB.users.findIndex(u => u.user === username);
    if (i === -1) return jsonRes(res, 404, { error: 'Usuário não encontrado.' });
    const antigo = DB.users[i].cargo;
    DB.users[i].cargo = cargo;
    saveData();
    audit(`<b>${feitorPor}</b> alterou cargo de <b>${DB.users[i].nome}</b>: ${antigo} → ${cargo}`, '🏷️');
    broadcast('USERS_UPDATED', DB.users.map(pub));
    return jsonRes(res, 200, { ok: true });
  }

  // DELETE /api/users/:username
  const mDelUser = url.match(/^\/api\/users\/([^/]+)$/);
  if (method === 'DELETE' && mDelUser) {
    const username = mDelUser[1];
    const { feitorPor } = body;
    const i = DB.users.findIndex(u => u.user === username);
    if (i === -1) return jsonRes(res, 404, { error: 'Usuário não encontrado.' });
    const nome = DB.users[i].nome;
    DB.users.splice(i, 1);
    saveData();
    audit(`<b>${feitorPor}</b> excluiu o usuário <b>${nome}</b>`, '🗑');
    broadcast('USERS_UPDATED', DB.users.map(pub));
    return jsonRes(res, 200, { ok: true });
  }

  // ── OCORRÊNCIAS ──
  if (method === 'GET' && url === '/api/ocs') return jsonRes(res, 200, DB.ocs);

  if (method === 'POST' && url === '/api/ocs') {
    const oc = body;
    if (!oc || !oc.id) return jsonRes(res, 400, { error: 'Dados inválidos.' });
    DB.ocs.push(oc);
    saveData();
    audit(`<b>${oc.delegado}</b> registrou ocorrência sobre <b>${oc.nome}</b>`, '📝');
    broadcast('NEW_OC', oc);
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
      audit(`Ocorrência <b>${id}</b> atualizada por <b>${body.editadoPor||body.decididoPor||'sistema'}</b>`, '📋');
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
  if (method === 'GET' && url === '/api/puns') return jsonRes(res, 200, DB.puns);

  if (method === 'POST' && url === '/api/puns') {
    const pun = body;
    if (!pun || !pun.nome) return jsonRes(res, 400, { error: 'Dados inválidos.' });
    pun.id = `PUN-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    DB.puns.push(pun);
    saveData();
    audit(`<b>${pun.autor}</b> registrou punição <b>${pun.nivel}</b> para <b>${pun.nome}</b>`, '⚠️');
    broadcast('NEW_PUN', pun);
    return jsonRes(res, 200, { ok: true });
  }

  // DELETE /api/puns/id/:punId (por ID único)
  const mPunId = url.match(/^\/api\/puns\/id\/([^/]+)$/);
  if (method === 'DELETE' && mPunId) {
    const punId = mPunId[1];
    const i = DB.puns.findIndex(p => p.id === punId);
    if (i === -1) return jsonRes(res, 404, { error: 'Punição não encontrada.' });
    const nome = DB.puns[i].nome;
    DB.puns.splice(i, 1);
    saveData();
    audit(`<b>${body.feitorPor}</b> removeu punição de <b>${nome}</b>`, '🗑');
    broadcast('PUNS_UPDATED', DB.puns);
    return jsonRes(res, 200, { ok: true });
  }

  // DELETE /api/puns/:idx (fallback por índice)
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
  if (method === 'GET' && url === '/api/pontos') return jsonRes(res, 200, DB.pontos);

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
  if (method === 'GET' && url === '/api/audit') return jsonRes(res, 200, DB.audit);

  if (method === 'DELETE' && url === '/api/audit') {
    DB.audit = [];
    saveData();
    broadcast('AUDIT_CLEARED', {});
    return jsonRes(res, 200, { ok: true });
  }

  // ── SAÚDE ──
  if (method === 'GET' && url === '/health') {
    return jsonRes(res, 200, { ok: true, uptime: Math.floor(process.uptime()), clientes: wsClients.size, usuarios: DB.users.length });
  }

  jsonRes(res, 404, { error: 'Rota não encontrada.' });
}

// ══ SERVIDOR HTTP ══
const httpServer = http.createServer(async (req, res) => {
  // Headers CORS para todas as respostas
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.url.startsWith('/api') || req.url === '/health') {
    return handleAPI(req, res);
  }
  serveStatic(req, res);
});

// ══ UPGRADE PARA WEBSOCKET ══
httpServer.on('upgrade', (req, socket, head) => {
  if (req.url !== '/ws') { socket.destroy(); return; }

  const ok = wsHandshake(req, socket);
  if (!ok) return;

  socket.isAlive = true;
  socket._buffer = Buffer.alloc(0);
  wsClients.add(socket);

  const ip = req.headers['x-forwarded-for'] || socket.remoteAddress || '?';
  console.log(`[WS] + ${ip} | Total: ${wsClients.size}`);

  // Enviar estado completo ao novo cliente
  wsSend(socket, {
    type: 'INIT',
    payload: {
      ocs:    DB.ocs,
      puns:   DB.puns,
      pontos: DB.pontos,
      users:  DB.users.map(pub),
      audit:  DB.audit
    }
  });

  socket.on('data', (chunk) => {
    socket._buffer = Buffer.concat([socket._buffer, chunk]);
    while (socket._buffer.length >= 2) {
      const frame = wsParseFrame(socket._buffer);
      if (!frame) break;

      // Calcular tamanho do frame consumido
      let len = socket._buffer[1] & 0x7f;
      let offset = 2;
      if (len === 126) { len = socket._buffer.readUInt16BE(2); offset = 4; }
      else if (len === 127) { len = Number(socket._buffer.readBigUInt64BE(2)); offset = 10; }
      const masked = (socket._buffer[1] & 0x80) !== 0;
      if (masked) offset += 4;
      socket._buffer = socket._buffer.slice(offset + len);

      if (frame.opcode === 0x08) { wsClose(socket); return; }     // close
      if (frame.opcode === 0x09) { wsSendPong(socket); continue; } // ping
      if (frame.opcode === 0x0a) { socket.isAlive = true; continue; } // pong

      if (frame.opcode === 0x01 || frame.opcode === 0x02) {
        try {
          const msg = JSON.parse(frame.payload.toString('utf8'));
          if (msg.type === 'PING') wsSend(socket, { type: 'PONG', ts: Date.now() });
        } catch(_) {}
      }
    }
  });

  socket.on('close', () => {
    wsClients.delete(socket);
    console.log(`[WS] - ${ip} | Total: ${wsClients.size}`);
  });

  socket.on('error', (e) => {
    wsClients.delete(socket);
    console.error(`[WS] Erro (${ip}):`, e.message);
  });
});

// Heartbeat — detecta conexões mortas a cada 25s
setInterval(() => {
  wsClients.forEach(socket => {
    if (!socket.isAlive) { wsClose(socket); return; }
    socket.isAlive = false;
    try {
      // Enviar frame ping
      socket.write(wsBuildFrame(Buffer.alloc(0), 0x09));
    } catch(_) { wsClose(socket); }
  });
}, 25000);

// ══ INICIAR ══
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('\n╔═══════════════════════════════════════════╗');
  console.log('║   🚔  GMPOL Sistema Central v2.1         ║');
  console.log('╠═══════════════════════════════════════════╣');
  console.log(`║   Acesse: http://localhost:${PORT}         ║`);
  console.log(`║   WebSocket: ws://localhost:${PORT}/ws     ║`);
  console.log('╠═══════════════════════════════════════════╣');
  console.log('║   LOGINS PADRÃO                          ║');
  console.log('║   master   / master123                   ║');
  console.log('║   chefe    / chefe123                    ║');
  console.log('║   delegado / del123                      ║');
  console.log('╚═══════════════════════════════════════════╝\n');
});

process.on('SIGTERM', () => { saveDataSync(); httpServer.close(() => process.exit(0)); });
process.on('SIGINT',  () => { saveDataSync(); httpServer.close(() => process.exit(0)); });
