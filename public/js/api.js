// ══ API CLIENT — GMPOL v2.1 Render Edition ══

const API = {
  async request(method, path, body = null) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== null) opts.body = JSON.stringify(body);
    let res;
    try {
      res = await fetch('/api' + path, opts);
    } catch (e) {
      throw new Error('Sem conexão com o servidor.');
    }
    let data;
    try { data = await res.json(); } catch (e) { throw new Error('Resposta inválida do servidor.'); }
    if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
    return data;
  },

  login:            (user, pass)                     => API.request('POST',   '/login', { user, pass }),
  getUsers:         ()                               => API.request('GET',    '/users'),
  createUser:       (data)                           => API.request('POST',   '/users', data),
  resetSenha:       (username, novaSenha, feitorPor) => API.request('PUT',    `/users/${username}/senha`, { novaSenha, feitorPor }),
  deleteUser:       (username, feitorPor)            => API.request('DELETE', `/users/${username}`, { feitorPor }),
  toggleUserStatus: (username, ativo, feitorPor)     => API.request('PUT',    `/users/${username}/status`, { ativo, feitorPor }),
  updateUserCargo:  (username, cargo, feitorPor)     => API.request('PUT',    `/users/${username}/cargo`, { cargo, feitorPor }),

  getOcs:    ()               => API.request('GET',    '/ocs'),
  createOc:  (oc)             => API.request('POST',   '/ocs', oc),
  updateOc:  (id, data)       => API.request('PUT',    `/ocs/${id}`, data),
  deleteOc:  (id, feitorPor)  => API.request('DELETE', `/ocs/${id}`, { feitorPor }),

  getPuns:       ()                 => API.request('GET',    '/puns'),
  createPun:     (pun)              => API.request('POST',   '/puns', pun),
  deletePunById: (id, feitorPor)    => API.request('DELETE', `/puns/id/${id}`, { feitorPor }),
  deletePun:     (idx, feitorPor)   => API.request('DELETE', `/puns/${idx}`, { feitorPor }),

  getPontos:   ()  => API.request('GET',  '/pontos'),
  createPonto: (p) => API.request('POST', '/pontos', p),

  getAudit:   () => API.request('GET',    '/audit'),
  clearAudit: () => API.request('DELETE', '/audit'),
};

// ══ WEBSOCKET ROBUSTO — compatível com Render ══
let _ws           = null;
let _wsConnected  = false;
let _wsAttempts   = 0;
let _wsTimer      = null;
let _pingInterval = null;

function initWebSocket() {
  clearTimeout(_wsTimer);

  // Render usa HTTPS → wss:// obrigatório
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url   = `${proto}//${window.location.host}/ws`;

  try { _ws = new WebSocket(url); }
  catch (e) { _scheduleReconnect(); return; }

  _ws.onopen = () => {
    _wsConnected = true;
    _wsAttempts  = 0;
    _setWsStatus(true);
    console.log('[WS] Conectado:', url);

    // Ping a cada 20s — Render tem timeout de 55s em conexões inativas
    clearInterval(_pingInterval);
    _pingInterval = setInterval(() => {
      if (_ws && _ws.readyState === WebSocket.OPEN) {
        try { _ws.send(JSON.stringify({ type: 'PING' })); } catch (_) {}
      }
    }, 20000);
  };

  _ws.onmessage = e => {
    try { handleSocketMessage(JSON.parse(e.data)); }
    catch (err) { console.error('[WS] Mensagem inválida:', err); }
  };

  _ws.onclose = evt => {
    _wsConnected = false;
    _setWsStatus(false);
    clearInterval(_pingInterval);
    console.warn(`[WS] Desconectado (${evt.code}). Reconectando...`);
    _scheduleReconnect();
  };

  _ws.onerror = () => { /* onclose cuida da reconexão */ };
}

function _scheduleReconnect() {
  const delay = Math.min(1000 * Math.pow(2, _wsAttempts), 30000);
  _wsAttempts++;
  _wsTimer = setTimeout(initWebSocket, delay);
}

function _setWsStatus(connected) {
  const pill = document.getElementById('ws-pill');
  const bar  = document.getElementById('ws-status');
  if (pill) pill.textContent = connected ? '🟢' : '🔴';
  if (bar)  bar.textContent  = connected ? '🟢 CONECTADO' : '🔴 DESCONECTADO';
}
