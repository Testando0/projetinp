// ══ API CLIENT — Comunicação com o servidor ══

const API = {
  async request(method, path, body = null) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch('/api' + path, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro no servidor');
    return data;
  },

  login: (user, pass) => API.request('POST', '/login', { user, pass }),

  // Users
  getUsers: () => API.request('GET', '/users'),
  createUser: (data) => API.request('POST', '/users', data),
  resetSenha: (username, novaSenha, feitorPor) => API.request('PUT', `/users/${username}/senha`, { novaSenha, feitorPor }),
  deleteUser: (username, feitorPor) => API.request('DELETE', `/users/${username}`, { feitorPor }),
  toggleUserStatus: (username, ativo, feitorPor) => API.request('PUT', `/users/${username}/status`, { ativo, feitorPor }),
  updateUserCargo: (username, cargo, feitorPor) => API.request('PUT', `/users/${username}/cargo`, { cargo, feitorPor }),

  // OCs
  getOcs: () => API.request('GET', '/ocs'),
  createOc: (oc) => API.request('POST', '/ocs', oc),
  updateOc: (id, data) => API.request('PUT', `/ocs/${id}`, data),
  deleteOc: (id, feitorPor) => API.request('DELETE', `/ocs/${id}`, { feitorPor }),

  // Punições
  getPuns: () => API.request('GET', '/puns'),
  createPun: (pun) => API.request('POST', '/puns', pun),
  deletePun: (idx, feitorPor) => API.request('DELETE', `/puns/${idx}`, { feitorPor }),

  // Pontos
  getPontos: () => API.request('GET', '/pontos'),
  createPonto: (ponto) => API.request('POST', '/pontos', ponto),

  // Auditoria
  getAudit: () => API.request('GET', '/audit'),
  clearAudit: () => API.request('DELETE', '/audit'),
};

// ══ WEBSOCKET ══
let socket;
let wsReconnectTimer;
let wsConnected = false;

function initWebSocket() {
  clearTimeout(wsReconnectTimer);
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;

  try {
    socket = new WebSocket(`${protocol}//${host}`);
  } catch(e) {
    scheduleReconnect();
    return;
  }

  socket.onopen = () => {
    wsConnected = true;
    updateWsStatus(true);
    console.log('[WS] Conectado');
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleSocketMessage(data);
    } catch(e) { console.error('[WS] Erro ao processar mensagem:', e); }
  };

  socket.onclose = () => {
    wsConnected = false;
    updateWsStatus(false);
    console.log('[WS] Desconectado. Reconectando em 3s...');
    scheduleReconnect();
  };

  socket.onerror = (err) => {
    console.error('[WS] Erro:', err);
  };
}

function scheduleReconnect() {
  wsReconnectTimer = setTimeout(initWebSocket, 3000);
}

function updateWsStatus(connected) {
  const pill = document.getElementById('ws-pill');
  const bar = document.getElementById('ws-status');
  if (pill) pill.textContent = connected ? '🟢' : '🔴';
  if (bar) bar.textContent = connected ? '🟢 CONECTADO' : '🔴 DESCONECTADO';
}
