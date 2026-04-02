const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');
const path      = require('path');
const fs        = require('fs');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server, path: '/ws' });

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// CORS para acesso remoto
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ══ BANCO DE DADOS (data.json) ══
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
  } catch(e) {
    console.error('[DB] Erro ao carregar:', e.message);
  }
  const def = getDefaultData();
  fs.writeFileSync(DATA_FILE, JSON.stringify(def, null, 2));
  console.log('[DB] data.json criado com usuários padrão.');
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
  catch(e) { console.error('[DB] Erro ao salvar (sync):', e.message); }
}

let DB = loadData();
console.log(`[DB] ${DB.users.length} usuários | ${DB.ocs.length} OCs | ${DB.puns.length} punições`);

// ══ HELPERS ══
function pub(u) { const { pass, ...r } = u; return r; }

function broadcast(type, payload) {
  const msg = JSON.stringify({ type, payload });
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) try { c.send(msg); } catch(_) {}
  });
}

function audit(msg, icon = '📋') {
  DB.audit.unshift({ msg, icon, ts: Date.now() });
  DB.audit = DB.audit.slice(0, 300);
  saveData();
  broadcast('AUDIT_NEW', DB.audit[0]);
}

// ══ ROTAS: AUTH ══
app.post('/api/login', (req, res) => {
  const { user, pass } = req.body || {};
  if (!user || !pass) return res.status(400).json({ error: 'Preencha usuário e senha.' });
  const u = DB.users.find(u => u.user === String(user).trim().toLowerCase() && u.pass === String(pass) && u.ativo);
  if (!u) return res.status(401).json({ error: 'Credenciais inválidas ou conta desativada.' });
  res.json({ ok: true, user: pub(u) });
});

// ══ ROTAS: USUÁRIOS ══
app.get('/api/users', (_, res) => res.json(DB.users.map(pub)));

app.post('/api/users', (req, res) => {
  const { nome, user, cargo, pass, criadoPor } = req.body || {};
  if (!nome || !user || !cargo || !pass) return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
  const login = String(user).trim().toLowerCase().replace(/\s/g, '');
  if (DB.users.find(u => u.user === login)) return res.status(400).json({ error: 'Login já existe.' });
  if (pass.length < 6) return res.status(400).json({ error: 'Senha mínima: 6 caracteres.' });
  const novo = { user: login, pass, cargo, nome, ativo: true, criadoPor: criadoPor || 'sistema', criadoEm: Date.now() };
  DB.users.push(novo);
  saveData();
  audit(`<b>${criadoPor}</b> criou o usuário <b>${nome}</b> (${cargo})`, '👤');
  broadcast('USERS_UPDATED', DB.users.map(pub));
  res.json({ ok: true });
});

app.put('/api/users/:username/senha', (req, res) => {
  const { novaSenha, feitorPor } = req.body || {};
  if (!novaSenha || novaSenha.length < 6) return res.status(400).json({ error: 'Senha mínima: 6 caracteres.' });
  const i = DB.users.findIndex(u => u.user === req.params.username);
  if (i === -1) return res.status(404).json({ error: 'Usuário não encontrado.' });
  DB.users[i].pass = novaSenha;
  saveData();
  audit(`<b>${feitorPor}</b> redefiniu a senha de <b>${DB.users[i].nome}</b>`, '🔑');
  broadcast('USERS_UPDATED', DB.users.map(pub));
  res.json({ ok: true });
});

app.delete('/api/users/:username', (req, res) => {
  const { feitorPor } = req.body || {};
  const i = DB.users.findIndex(u => u.user === req.params.username);
  if (i === -1) return res.status(404).json({ error: 'Usuário não encontrado.' });
  const nome = DB.users[i].nome;
  DB.users.splice(i, 1);
  saveData();
  audit(`<b>${feitorPor}</b> excluiu o usuário <b>${nome}</b>`, '🗑');
  broadcast('USERS_UPDATED', DB.users.map(pub));
  res.json({ ok: true });
});

app.put('/api/users/:username/status', (req, res) => {
  const { ativo, feitorPor } = req.body || {};
  const i = DB.users.findIndex(u => u.user === req.params.username);
  if (i === -1) return res.status(404).json({ error: 'Usuário não encontrado.' });
  DB.users[i].ativo = Boolean(ativo);
  saveData();
  audit(`<b>${feitorPor}</b> ${ativo ? 'ativou' : 'desativou'} a conta de <b>${DB.users[i].nome}</b>`, ativo ? '✅' : '🚫');
  broadcast('USERS_UPDATED', DB.users.map(pub));
  res.json({ ok: true });
});

app.put('/api/users/:username/cargo', (req, res) => {
  const { cargo, feitorPor } = req.body || {};
  const i = DB.users.findIndex(u => u.user === req.params.username);
  if (i === -1) return res.status(404).json({ error: 'Usuário não encontrado.' });
  const antigo = DB.users[i].cargo;
  DB.users[i].cargo = cargo;
  saveData();
  audit(`<b>${feitorPor}</b> alterou cargo de <b>${DB.users[i].nome}</b>: ${antigo} → ${cargo}`, '🏷️');
  broadcast('USERS_UPDATED', DB.users.map(pub));
  res.json({ ok: true });
});

// ══ ROTAS: OCORRÊNCIAS ══
app.get('/api/ocs', (_, res) => res.json(DB.ocs));

app.post('/api/ocs', (req, res) => {
  const oc = req.body;
  if (!oc || !oc.id) return res.status(400).json({ error: 'Dados inválidos.' });
  DB.ocs.push(oc);
  saveData();
  audit(`<b>${oc.delegado}</b> registrou ocorrência sobre <b>${oc.nome}</b>`, '📝');
  broadcast('NEW_OC', oc);
  res.json({ ok: true });
});

app.put('/api/ocs/:id', (req, res) => {
  const i = DB.ocs.findIndex(o => o.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Ocorrência não encontrada.' });
  Object.assign(DB.ocs[i], req.body);
  saveData();
  const por = req.body.editadoPor || req.body.decididoPor || 'sistema';
  audit(`Ocorrência <b>${req.params.id}</b> atualizada por <b>${por}</b>`, '📋');
  broadcast('OC_UPDATED', DB.ocs[i]);
  res.json({ ok: true });
});

app.delete('/api/ocs/:id', (req, res) => {
  const { feitorPor } = req.body || {};
  const i = DB.ocs.findIndex(o => o.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Ocorrência não encontrada.' });
  DB.ocs.splice(i, 1);
  saveData();
  audit(`<b>${feitorPor}</b> excluiu a ocorrência <b>${req.params.id}</b>`, '🗑');
  broadcast('OC_DELETED', { id: req.params.id });
  res.json({ ok: true });
});

// ══ ROTAS: PUNIÇÕES ══
app.get('/api/puns', (_, res) => res.json(DB.puns));

app.post('/api/puns', (req, res) => {
  const pun = req.body;
  if (!pun || !pun.nome) return res.status(400).json({ error: 'Dados inválidos.' });
  pun.id = `PUN-${Date.now()}`;
  DB.puns.push(pun);
  saveData();
  audit(`<b>${pun.autor}</b> registrou punição <b>${pun.nivel}</b> para <b>${pun.nome}</b>`, '⚠️');
  broadcast('NEW_PUN', pun);
  res.json({ ok: true });
});

// Excluir por ID único (sem race condition)
app.delete('/api/puns/id/:punId', (req, res) => {
  const { feitorPor } = req.body || {};
  const i = DB.puns.findIndex(p => p.id === req.params.punId);
  if (i === -1) return res.status(404).json({ error: 'Punição não encontrada.' });
  const nome = DB.puns[i].nome;
  DB.puns.splice(i, 1);
  saveData();
  audit(`<b>${feitorPor}</b> removeu punição de <b>${nome}</b>`, '🗑');
  broadcast('PUNS_UPDATED', DB.puns);
  res.json({ ok: true });
});

// Fallback por índice
app.delete('/api/puns/:idx', (req, res) => {
  const { feitorPor } = req.body || {};
  const i = parseInt(req.params.idx);
  if (isNaN(i) || i < 0 || i >= DB.puns.length) return res.status(404).json({ error: 'Índice inválido.' });
  const nome = DB.puns[i].nome;
  DB.puns.splice(i, 1);
  saveData();
  audit(`<b>${feitorPor}</b> removeu punição de <b>${nome}</b>`, '🗑');
  broadcast('PUNS_UPDATED', DB.puns);
  res.json({ ok: true });
});

// ══ ROTAS: PONTOS ══
app.get('/api/pontos', (_, res) => res.json(DB.pontos));

app.post('/api/pontos', (req, res) => {
  const ponto = req.body;
  if (!ponto || !ponto.userLogin) return res.status(400).json({ error: 'Dados inválidos.' });
  DB.pontos.push(ponto);
  saveData();
  audit(`<b>${ponto.nome}</b> bateu ponto às ${ponto.hora}`, '⏱️');
  broadcast('NEW_PONTO', ponto);
  res.json({ ok: true });
});

// ══ ROTAS: AUDITORIA ══
app.get('/api/audit', (_, res) => res.json(DB.audit));

app.delete('/api/audit', (_, res) => {
  DB.audit = [];
  saveData();
  broadcast('AUDIT_CLEARED', {});
  res.json({ ok: true });
});

// ══ SAÚDE ══
app.get('/health', (_, res) => res.json({
  ok: true, uptime: Math.floor(process.uptime()),
  clientes: wss.clients.size, usuarios: DB.users.length,
  ocs: DB.ocs.length, punicoes: DB.puns.length
}));

// ══ WEBSOCKET ══
wss.on('connection', (ws, req) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '?';
  console.log(`[WS] + ${ip} | Total: ${wss.clients.size}`);
  ws.isAlive = true;

  // Envia estado completo ao novo cliente
  try {
    ws.send(JSON.stringify({
      type: 'INIT',
      payload: {
        ocs:    DB.ocs,
        puns:   DB.puns,
        pontos: DB.pontos,
        users:  DB.users.map(pub),
        audit:  DB.audit
      }
    }));
  } catch(e) { console.error('[WS] Erro INIT:', e.message); }

  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => {
    try {
      const d = JSON.parse(raw);
      if (d.type === 'PING') ws.send(JSON.stringify({ type: 'PONG', ts: Date.now() }));
    } catch(_) {}
  });
  ws.on('close', () => console.log(`[WS] - ${ip} | Total: ${wss.clients.size}`));
  ws.on('error', e => console.error(`[WS] Erro (${ip}):`, e.message));
});

// Heartbeat: mata conexões zumbis a cada 25s
const hb = setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    try { ws.ping(); } catch(_) {}
  });
}, 25000);
wss.on('close', () => clearInterval(hb));

// ══ INICIAR ══
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║  🚔  GMPOL Sistema Central v2.1      ║');
  console.log('╠═══════════════════════════════════════╣');
  console.log(`║  http://0.0.0.0:${PORT}               ║`);
  console.log(`║  ws://0.0.0.0:${PORT}/ws              ║`);
  console.log('╠═══════════════════════════════════════╣');
  console.log('║  LOGINS PADRÃO (altere após uso)     ║');
  console.log('║  master   / master123                ║');
  console.log('║  chefe    / chefe123                 ║');
  console.log('║  delegado / del123                   ║');
  console.log('╚═══════════════════════════════════════╝\n');
});

process.on('SIGTERM', () => { saveDataSync(); server.close(() => process.exit(0)); });
process.on('SIGINT',  () => { saveDataSync(); server.close(() => process.exit(0)); });
