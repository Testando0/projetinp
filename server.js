const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ══ ARQUIVO DE DADOS (persistência local) ══
const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch(e) { console.error('Erro ao carregar dados:', e); }
  return getDefaultData();
}

function getDefaultData() {
  return {
    users: [
      { user: 'master',   pass: 'master123',  cargo: 'master',   nome: 'Administrador Master',   ativo: true, criadoPor: 'sistema', criadoEm: Date.now() },
      { user: 'chefe',    pass: 'chefe123',   cargo: 'chefe',    nome: 'Chefe de Polícia',        ativo: true, criadoPor: 'sistema', criadoEm: Date.now() },
      { user: 'delegado', pass: 'del123',     cargo: 'delegado', nome: 'Delegado Silva',          ativo: true, criadoPor: 'chefe',   criadoEm: Date.now() }
    ],
    ocs: [],
    puns: [],
    pontos: [],
    audit: []
  };
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch(e) { console.error('Erro ao salvar dados:', e); }
}

let DB = loadData();

// ══ BROADCAST PARA TODOS OS CLIENTES ══
function broadcastAll(type, payload, senderWs = null) {
  const msg = JSON.stringify({ type, payload });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

// ══ API REST ══

// AUTH
app.post('/api/login', (req, res) => {
  const { user, pass } = req.body;
  const found = DB.users.find(u => u.user === user && u.pass === pass && u.ativo);
  if (!found) return res.status(401).json({ error: 'Credenciais inválidas ou conta desativada.' });
  res.json({ ok: true, user: { ...found, pass: undefined } });
});

// USERS
app.get('/api/users', (req, res) => {
  res.json(DB.users.map(u => ({ ...u, pass: undefined })));
});

app.post('/api/users', (req, res) => {
  const { nome, user, cargo, pass, criadoPor } = req.body;
  if (DB.users.find(u => u.user === user)) return res.status(400).json({ error: 'Login já existe.' });
  const novo = { user, pass, cargo, nome, ativo: true, criadoPor, criadoEm: Date.now() };
  DB.users.push(novo);
  saveData(DB);
  logAudit(`<b>${criadoPor}</b> criou o usuário <b>${nome}</b> (${cargo})`, '👤');
  broadcastAll('USERS_UPDATED', DB.users.map(u => ({ ...u, pass: undefined })));
  res.json({ ok: true });
});

app.put('/api/users/:username/senha', (req, res) => {
  const { username } = req.params;
  const { novaSenha, feitorPor } = req.body;
  const idx = DB.users.findIndex(u => u.user === username);
  if (idx === -1) return res.status(404).json({ error: 'Usuário não encontrado.' });
  DB.users[idx].pass = novaSenha;
  saveData(DB);
  logAudit(`<b>${feitorPor}</b> redefiniu a senha de <b>${DB.users[idx].nome}</b>`, '🔑');
  broadcastAll('USERS_UPDATED', DB.users.map(u => ({ ...u, pass: undefined })));
  res.json({ ok: true });
});

app.delete('/api/users/:username', (req, res) => {
  const { username } = req.params;
  const { feitorPor } = req.body;
  const idx = DB.users.findIndex(u => u.user === username);
  if (idx === -1) return res.status(404).json({ error: 'Usuário não encontrado.' });
  const nome = DB.users[idx].nome;
  DB.users.splice(idx, 1);
  saveData(DB);
  logAudit(`<b>${feitorPor}</b> excluiu o usuário <b>${nome}</b>`, '🗑');
  broadcastAll('USERS_UPDATED', DB.users.map(u => ({ ...u, pass: undefined })));
  res.json({ ok: true });
});

app.put('/api/users/:username/status', (req, res) => {
  const { username } = req.params;
  const { ativo, feitorPor } = req.body;
  const idx = DB.users.findIndex(u => u.user === username);
  if (idx === -1) return res.status(404).json({ error: 'Usuário não encontrado.' });
  DB.users[idx].ativo = ativo;
  saveData(DB);
  logAudit(`<b>${feitorPor}</b> ${ativo ? 'ativou' : 'desativou'} a conta de <b>${DB.users[idx].nome}</b>`, ativo ? '✅' : '🚫');
  broadcastAll('USERS_UPDATED', DB.users.map(u => ({ ...u, pass: undefined })));
  res.json({ ok: true });
});

app.put('/api/users/:username/cargo', (req, res) => {
  const { username } = req.params;
  const { cargo, feitorPor } = req.body;
  const idx = DB.users.findIndex(u => u.user === username);
  if (idx === -1) return res.status(404).json({ error: 'Usuário não encontrado.' });
  const antigo = DB.users[idx].cargo;
  DB.users[idx].cargo = cargo;
  saveData(DB);
  logAudit(`<b>${feitorPor}</b> alterou o cargo de <b>${DB.users[idx].nome}</b>: ${antigo} → ${cargo}`, '🏷️');
  broadcastAll('USERS_UPDATED', DB.users.map(u => ({ ...u, pass: undefined })));
  res.json({ ok: true });
});

// OCORRÊNCIAS
app.get('/api/ocs', (req, res) => res.json(DB.ocs));

app.post('/api/ocs', (req, res) => {
  const oc = req.body;
  DB.ocs.push(oc);
  saveData(DB);
  logAudit(`<b>${oc.delegado}</b> registrou ocorrência sobre <b>${oc.nome}</b>`, '📝');
  broadcastAll('NEW_OC', oc);
  res.json({ ok: true });
});

app.put('/api/ocs/:id', (req, res) => {
  const { id } = req.params;
  const idx = DB.ocs.findIndex(o => o.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Ocorrência não encontrada.' });
  Object.assign(DB.ocs[idx], req.body);
  saveData(DB);
  logAudit(`Ocorrência <b>${id}</b> atualizada`, '📋');
  broadcastAll('OC_UPDATED', DB.ocs[idx]);
  res.json({ ok: true });
});

app.delete('/api/ocs/:id', (req, res) => {
  const { id } = req.params;
  const { feitorPor } = req.body;
  const idx = DB.ocs.findIndex(o => o.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Ocorrência não encontrada.' });
  DB.ocs.splice(idx, 1);
  saveData(DB);
  logAudit(`<b>${feitorPor}</b> excluiu a ocorrência <b>${id}</b>`, '🗑');
  broadcastAll('OC_DELETED', { id });
  res.json({ ok: true });
});

// PUNIÇÕES
app.get('/api/puns', (req, res) => res.json(DB.puns));

app.post('/api/puns', (req, res) => {
  const pun = req.body;
  DB.puns.push(pun);
  saveData(DB);
  logAudit(`<b>${pun.autor}</b> registrou punição <b>${pun.nivel}</b> para <b>${pun.nome}</b>`, '⚠️');
  broadcastAll('NEW_PUN', pun);
  res.json({ ok: true });
});

app.delete('/api/puns/:idx', (req, res) => {
  const idx = parseInt(req.params.idx);
  const { feitorPor } = req.body;
  if (isNaN(idx) || idx < 0 || idx >= DB.puns.length) return res.status(404).json({ error: 'Índice inválido.' });
  const nome = DB.puns[idx].nome;
  DB.puns.splice(idx, 1);
  saveData(DB);
  logAudit(`<b>${feitorPor}</b> removeu punição de <b>${nome}</b>`, '🗑');
  broadcastAll('PUNS_UPDATED', DB.puns);
  res.json({ ok: true });
});

// PONTOS
app.get('/api/pontos', (req, res) => res.json(DB.pontos));

app.post('/api/pontos', (req, res) => {
  const ponto = req.body;
  DB.pontos.push(ponto);
  saveData(DB);
  logAudit(`<b>${ponto.nome}</b> bateu ponto`, '⏱️');
  broadcastAll('NEW_PONTO', ponto);
  res.json({ ok: true });
});

// AUDITORIA
app.get('/api/audit', (req, res) => res.json(DB.audit));

app.delete('/api/audit', (req, res) => {
  DB.audit = [];
  saveData(DB);
  res.json({ ok: true });
});

function logAudit(msg, icon = '📋') {
  DB.audit.unshift({ msg, icon, ts: Date.now() });
  DB.audit = DB.audit.slice(0, 200);
  saveData(DB);
  broadcastAll('AUDIT_NEW', DB.audit[0]);
}

// ══ WEBSOCKET ══
wss.on('connection', (ws) => {
  console.log('Cliente WebSocket conectado. Total:', wss.clients.size);

  // Envia estado atual ao novo cliente
  ws.send(JSON.stringify({ type: 'INIT', payload: {
    ocs: DB.ocs,
    puns: DB.puns,
    pontos: DB.pontos,
    users: DB.users.map(u => ({ ...u, pass: undefined })),
    audit: DB.audit
  }}));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      // Mensagens de ping/heartbeat
      if (data.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG' }));
      }
    } catch(e) { console.error('Erro ao processar mensagem:', e); }
  });

  ws.on('close', () => {
    console.log('Cliente WebSocket desconectado. Total:', wss.clients.size);
  });

  ws.on('error', (err) => {
    console.error('Erro WebSocket:', err);
  });
});

// Heartbeat para detectar conexões mortas
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  });
}, 30000);

wss.on('close', () => clearInterval(heartbeatInterval));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚔 GMPOL Sistema Central rodando na porta ${PORT}`);
  console.log(`   Acesse: http://localhost:${PORT}\n`);
});
