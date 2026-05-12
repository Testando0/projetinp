// ══ API CLIENT — GMPOL v3.0 ══
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

const API = {
  async request(method, path, body = null) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== null) opts.body = JSON.stringify(body);
    let res;
    try { res = await fetch('/api' + path, opts); }
    catch (e) { throw new Error('Sem conexão com o servidor.'); }
    let data;
    try { data = await res.json(); } catch (_) { throw new Error('Resposta inválida do servidor.'); }
    // Caso especial: usuário suspenso retorna 403 com banned:true
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

  getAudit:   () => API.request('GET',    '/audit'),
  clearAudit: () => API.request('DELETE', '/audit'),
};

// ══ WEBSOCKET ROBUSTO ══
let _ws = null, _wsConnected = false, _wsAttempts = 0, _wsTimer = null, _pingIv = null, _pollIv = null;

function initWebSocket() {
  clearTimeout(_wsTimer);
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url   = `${proto}//${window.location.host}/ws`;
  try { _ws = new WebSocket(url); } catch (_) { _scheduleReconnect(); return; }

  _ws.onopen = () => {
    _wsConnected = true; _wsAttempts = 0;
    _setWsStatus(true); _stopPolling();
    clearInterval(_pingIv);
    _pingIv = setInterval(() => {
      if (_ws && _ws.readyState === WebSocket.OPEN) {
        try { _ws.send(JSON.stringify({ type: 'PING' })); } catch (_) {}
      }
    }, 20000);
  };

  _ws.onmessage = e => {
    try { _handleServerMsg(JSON.parse(e.data)); } catch (err) { console.error('[WS] Msg inválida:', err); }
  };

  _ws.onclose = evt => {
    _wsConnected = false; _setWsStatus(false); clearInterval(_pingIv);
    _startPolling(); _scheduleReconnect();
  };
  _ws.onerror = () => {};
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
    if (Array.isArray(payload.users))  STATE.users  = payload.users;
    if (Array.isArray(payload.audit))  STATE.audit  = payload.audit;
  }
  LSCache.save({
    ocs: payload.ocs||[], puns: payload.puns||[],
    pontos: payload.pontos||[], users: payload.users||[], audit: payload.audit||[]
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
    STATE.puns.push(payload); LSCache.merge('puns', STATE.puns);
  }
  if (type === 'PUNS_UPDATED' && typeof STATE !== 'undefined') {
    STATE.puns = payload; LSCache.merge('puns', STATE.puns);
  }
  if (type === 'NEW_PONTO' && typeof STATE !== 'undefined') {
    STATE.pontos.push(payload); LSCache.merge('pontos', STATE.pontos);
  }
  if (type === 'USERS_UPDATED' && typeof STATE !== 'undefined') {
    STATE.users = payload; LSCache.merge('users', STATE.users);
  }
  if (type === 'AUDIT_NEW' && typeof STATE !== 'undefined') {
    STATE.audit.unshift(payload); STATE.audit = STATE.audit.slice(0, 300); LSCache.merge('audit', STATE.audit);
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

// Reconectar quando a aba voltar a ficar visível (mobile vai dormir)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (!_wsConnected || !_ws || _ws.readyState !== WebSocket.OPEN) {
      clearTimeout(_wsTimer);
      initWebSocket();
    }
    // Forçar refresh de estado via polling imediato
    API.getState().then(s => _applyServerState(s)).catch(() => {});
  }
});

// Reconectar ao ganhar foco (troca de aba no desktop)
window.addEventListener('focus', () => {
  if (!_wsConnected || !_ws || _ws.readyState !== WebSocket.OPEN) {
    clearTimeout(_wsTimer);
    initWebSocket();
  }
});
