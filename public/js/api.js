// ══ API CLIENT — GMPOL v5.4 (provas + retry + WS único) ══
const LS_KEY = 'gmpol_state_v3';

const LSCache = {
  save(state) {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ ts: Date.now(), ...state })); } catch (_) {}
  },
  load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (Date.now() - (data.ts || 0) > 7 * 86400 * 1000) { localStorage.removeItem(LS_KEY); return null; }
      return data;
    } catch (_) { return null; }
  },
  merge(key, items) {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const data = raw ? JSON.parse(raw) : {};
      data[key] = items; data.ts = Date.now();
      localStorage.setItem(LS_KEY, JSON.stringify(data));
    } catch (_) {}
  },
  clear() { try { localStorage.removeItem(LS_KEY); } catch (_) {} }
};

function _sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

const API = {
  async request(method, path, body = null, _retry = 0) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== null) opts.body = JSON.stringify(body);
    let res;
    try {
      res = await fetch('/api' + path, opts);
    } catch (e) {
      if (_retry < 2) { await _sleep(900 * (_retry + 1)); return API.request(method, path, body, _retry + 1); }
      throw new Error('Sem conexão com o servidor.');
    }
    let data;
    const txt = await res.text();
    try { data = txt ? JSON.parse(txt) : {}; }
    catch (_) {
      if (_retry < 2) { await _sleep(900 * (_retry + 1)); return API.request(method, path, body, _retry + 1); }
      throw new Error('Resposta inválida do servidor.');
    }
    if (res.status === 403 && data && data.banned) return data;
    if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
    return data;
  },

  login:            (user, pass)                              => API.request('POST',   '/login', { user, pass }),
  getState:         ()                                        => API.request('GET',    '/state'),
  getUsers:         ()                                        => API.request('GET',    '/users'),
  createUser:       (data)                                    => API.request('POST',   '/users', data),
  resetSenha:       (username, novaSenha, feitorPor)          => API.request('PUT',    `/users/${username}/senha`, { novaSenha, feitorPor }),
  deleteUser:       (username, feitorPor)                     => API.request('DELETE', `/users/${username}`, { feitorPor }),
  toggleUserStatus: (username, ativo, feitorPor)              => API.request('PUT',    `/users/${username}/status`, { ativo, feitorPor }),
  updateUserCargo:  (username, cargo, feitorPor, motivo)      => API.request('PUT',    `/users/${username}/cargo`, { cargo, feitorPor, motivo }),
  checkBan:         (username)                                => API.request('GET',    `/users/${username}/bancheck`),
  applyBan:         (username, duracao, motivo, feitorPor, feitorPorNome) =>
                      API.request('POST', `/users/${username}/ban`, { duracao, motivo, feitorPor, feitorPorNome }),
  removeBan:        (username, feitorPor)                     => API.request('DELETE', `/users/${username}/ban`, { feitorPor }),

  getOcs:    ()              => API.request('GET',    '/ocs'),
  createOc:  (oc)            => API.request('POST',   '/ocs', oc),
  updateOc:  (id, data)      => API.request('PUT',    `/ocs/${id}`, data),
  deleteOc:  (id, feitorPor) => API.request('DELETE', `/ocs/${id}`, { feitorPor }),

  getPuns:       ()               => API.request('GET',    '/puns'),
  createPun:     (pun)            => API.request('POST',   '/puns', pun),
  deletePunById: (id, feitorPor)  => API.request('DELETE', `/puns/id/${id}`, { feitorPor }),
  deletePun:     (idx, feitorPor) => API.request('DELETE', `/puns/${idx}`, { feitorPor }),

  getPontos:   ()  => API.request('GET',  '/pontos'),
  createPonto: (p) => API.request('POST', '/pontos', p),

  // ══ PROVAS ══
  getProvas:      ()                  => API.request('GET',  '/provas'),
  getQuestionario:()                  => API.request('GET',  '/prova/questionario'),
  createProva:    (p)                 => API.request('POST', '/provas', p),
  decidirProva:   (id, decisao, feitorPor) => API.request('PUT', `/provas/${id}/decisao`, { decisao, feitorPor }),

  getAudit:   () => API.request('GET',    '/audit'),
  clearAudit: () => API.request('DELETE', '/audit'),
};

// ══ WEBSOCKET ROBUSTO — CONEXÃO ÚNICA ══
let _ws = null, _wsConnected = false, _wsAttempts = 0, _wsTimer = null, _pingIv = null, _pollIv = null;

function initWebSocket() {
  clearTimeout(_wsTimer);
  if (_ws && (_ws.readyState === WebSocket.OPEN || _ws.readyState === WebSocket.CONNECTING)) return;
  if (_ws) { try { _ws.onopen = null; _ws.onmessage = null; _ws.onclose = null; _ws.onerror = null; _ws.close(); } catch (_) {} _ws = null; }

  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url   = `${proto}//${window.location.host}/ws`;
  try { _ws = new WebSocket(url); } catch (_) { _scheduleReconnect(); return; }

  const myWs = _ws;
  myWs.onopen = () => {
    if (_ws !== myWs) return;
    _wsConnected = true; _wsAttempts = 0;
    _setWsStatus(true); _stopPolling();
    clearInterval(_pingIv);
    _pingIv = setInterval(() => {
      if (_ws === myWs && myWs.readyState === WebSocket.OPEN) {
        try { myWs.send(JSON.stringify({ type: 'PING' })); } catch (_) {}
      }
    }, 20000);
  };

  myWs.onmessage = e => {
    if (_ws !== myWs) return;
    try { _handleServerMsg(JSON.parse(e.data)); } catch (err) { console.error('[WS] Msg inválida:', err); }
  };

  myWs.onclose = () => {
    if (_ws !== myWs) return;
    _wsConnected = false; _ws = null; _setWsStatus(false); clearInterval(_pingIv);
    _startPolling(); _scheduleReconnect();
  };
  myWs.onerror = () => {};
}

function _scheduleReconnect() {
  const delay = Math.min(1000 * Math.pow(2, _wsAttempts), 30000);
  _wsAttempts++;
  _wsTimer = setTimeout(initWebSocket, delay);
}

function _startPolling() {
  if (_pollIv) return;
  _pollIv = setInterval(async () => {
    if (_wsConnected) { _stopPolling(); return; }
    try { const state = await API.getState(); _applyServerState(state); } catch (_) {}
  }, 8000);
}
function _stopPolling() { clearInterval(_pollIv); _pollIv = null; }

function _applyServerState(payload) {
  if (!payload) return;
  if (typeof STATE !== 'undefined') {
    if (Array.isArray(payload.ocs))    STATE.ocs    = payload.ocs;
    if (Array.isArray(payload.puns))   STATE.puns   = payload.puns;
    if (Array.isArray(payload.pontos)) STATE.pontos = payload.pontos;
    if (Array.isArray(payload.provas)) STATE.provas = payload.provas;
    if (Array.isArray(payload.users))  STATE.users  = payload.users;
    if (Array.isArray(payload.audit))  STATE.audit  = payload.audit;
  }
  LSCache.save({
    ocs: payload.ocs||[], puns: payload.puns||[],
    pontos: payload.pontos||[], provas: payload.provas||[],
    users: payload.users||[], audit: payload.audit||[]
  });
  if (typeof updateNotif === 'function') updateNotif();
  if (typeof me !== 'undefined' && me && typeof renderTab === 'function' && typeof activeTab !== 'undefined') {
    renderTab(activeTab);
  }
}

function _handleServerMsg(msg) {
  const { type, payload } = msg;
  if (type === 'INIT') { _applyServerState(payload); return; }

  if (type === 'NEW_OC' && typeof STATE !== 'undefined') {
    if (!STATE.ocs.find(o => o.id === payload.id)) { STATE.ocs.push(payload); LSCache.merge('ocs', STATE.ocs); }
  }
  if (type === 'OC_UPDATED' && typeof STATE !== 'undefined') {
    const i = STATE.ocs.findIndex(o => o.id === payload.id);
    if (i !== -1) { STATE.ocs[i] = payload; LSCache.merge('ocs', STATE.ocs); }
  }
  if (type === 'OC_DELETED' && typeof STATE !== 'undefined') {
    STATE.ocs = STATE.ocs.filter(o => o.id !== payload.id); LSCache.merge('ocs', STATE.ocs);
  }
  if (type === 'NEW_PUN' && typeof STATE !== 'undefined') {
    if (!STATE.puns.find(x => x.id === payload.id)) { STATE.puns.push(payload); LSCache.merge('puns', STATE.puns); }
  }
  if (type === 'PUNS_UPDATED' && typeof STATE !== 'undefined') {
    STATE.puns = payload; LSCache.merge('puns', STATE.puns);
  }
  if (type === 'NEW_PONTO' && typeof STATE !== 'undefined') {
    if (!STATE.pontos.find(x => x.id === payload.id)) { STATE.pontos.push(payload); LSCache.merge('pontos', STATE.pontos); }
  }
  if (type === 'NEW_PROVA' && typeof STATE !== 'undefined') {
    if (!STATE.provas.find(x => x.id === payload.id)) { STATE.provas.push(payload); LSCache.merge('provas', STATE.provas); }
  }
  if (type === 'PROVAS_UPDATED' && typeof STATE !== 'undefined') {
    STATE.provas = payload; LSCache.merge('provas', STATE.provas);
  }
  if (type === 'USERS_UPDATED' && typeof STATE !== 'undefined') {
    STATE.users = payload; LSCache.merge('users', STATE.users);
  }
  if (type === 'AUDIT_NEW' && typeof STATE !== 'undefined') {
    if (!STATE.audit.find(a => a.ts === payload.ts && a.msg === payload.msg)) {
      STATE.audit.unshift(payload); STATE.audit = STATE.audit.slice(0, 300); LSCache.merge('audit', STATE.audit);
    }
  }
  if (type === 'AUDIT_CLEARED' && typeof STATE !== 'undefined') {
    STATE.audit = []; LSCache.merge('audit', []);
  }

  if (typeof handleSocketMessage === 'function') {
    try { handleSocketMessage(msg); } catch (_) {}
  }
}

function _setWsStatus(connected) {
  const pill = document.getElementById('ws-pill');
  const bar  = document.getElementById('ws-status');
  if (pill) pill.textContent = connected ? '🟢' : '🔴';
  if (bar)  bar.textContent  = connected ? '🟢 CONECTADO' : '🔴 RECONECTANDO…';
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (!_wsConnected || !_ws || _ws.readyState !== WebSocket.OPEN) {
      clearTimeout(_wsTimer);
      initWebSocket();
    }
    API.getState().then(s => _applyServerState(s)).catch(() => {});
  }
});

window.addEventListener('focus', () => {
  if (!_wsConnected || !_ws || _ws.readyState !== WebSocket.OPEN) {
    clearTimeout(_wsTimer);
    initWebSocket();
  }
});
