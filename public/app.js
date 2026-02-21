'use strict';

// ─── API CLIENT ───────────────────────────────────────────────────────────────

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  const token = localStorage.getItem('admin_token');
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch('/api' + path, opts);
  const data = await res.json().catch(() => ({ error: 'Error de red' }));
  if (res.status === 401) {
    localStorage.removeItem('admin_token');
    throw new Error(data.error || 'No autorizado');
  }
  if (!res.ok) throw new Error(data.error || 'Error del servidor');
  return data;
}
const GET  = path       => api('GET',    path);
const POST = (path, b)  => api('POST',   path, b);
const PUT  = (path, b)  => api('PUT',    path, b);
const DEL  = path       => api('DELETE', path);

// ─── ROUTER ───────────────────────────────────────────────────────────────────

function navigate(hash) { window.location.hash = hash; }

async function route() {
  const h = window.location.hash.slice(1) || '/';
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const mTourney     = h.match(/^\/tournaments\/(\d+)$/);
    const mRound       = h.match(/^\/rounds\/(\d+)$/);
    const mLeaderboard = h.match(/^\/tournaments\/(\d+)\/leaderboard$/);
    const mPrint       = h.match(/^\/tournaments\/(\d+)\/print$/);

    if (mLeaderboard) return await renderLeaderboard(mLeaderboard[1]);
    if (mPrint)       return await renderPrint(mPrint[1]);
    if (mTourney)     return await renderTournament(mTourney[1]);
    if (mRound)       return await renderRound(mRound[1]);
    await renderHome();
  } catch (e) {
    document.getElementById('app').innerHTML = `
      <div class="header"><h1>🎾 Padel CVA</h1></div>
      <div class="card" style="margin:20px 14px;padding:20px;text-align:center;">
        <p style="color:#c62828;margin-bottom:16px;">⚠️ ${esc(e.message)}</p>
        <button class="btn btn-primary" onclick="navigate('/')">Volver al inicio</button>
      </div>`;
  }
}

window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', route);

// ─── AUTH ─────────────────────────────────────────────────────────────────────

function isAdmin() { return !!localStorage.getItem('admin_token'); }

function adminBtn() {
  return isAdmin()
    ? `<button class="admin-btn admin-btn-out" onclick="logout()">🔓 Salir</button>`
    : `<button class="admin-btn" onclick="showLogin()">🔐 Admin</button>`;
}

function showLogin() {
  let mc = document.getElementById('modal-container');
  if (!mc) { mc = document.createElement('div'); mc.id = 'modal-container'; document.body.appendChild(mc); }
  mc.innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal">
        <div class="modal-title">
          Acceso Admin
          <button class="modal-close" onclick="closeModal()">×</button>
        </div>
        <div class="form-group">
          <label>Contraseña</label>
          <input id="admin-pw" type="password" class="form-control" placeholder="Contraseña de administrador"
            onkeydown="if(event.key==='Enter')doLogin()" />
        </div>
        <button class="btn btn-primary btn-full btn-lg" onclick="doLogin()">Entrar</button>
      </div>
    </div>`;
  setTimeout(() => document.getElementById('admin-pw').focus(), 100);
}

async function doLogin() {
  const password = document.getElementById('admin-pw').value;
  if (!password) { toast('Ingresa la contraseña', 'error'); return; }
  try {
    const { token } = await api('POST', '/auth/login', { password });
    localStorage.setItem('admin_token', token);
    closeModal();
    toast('Sesión iniciada ✓');
    route();
  } catch (e) { toast(e.message, 'error'); }
}

function logout() {
  localStorage.removeItem('admin_token');
  toast('Sesión cerrada');
  route();
}

// ─── UTILS ────────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function genderLabel(g) { return g === 'F' ? '♀ Femenino' : '♂ Masculino'; }
function genderBadge(g) {
  return `<span class="badge badge-${g}">${g === 'F' ? '♀ F' : '♂ M'}</span>`;
}
function statusBadge(s) {
  const lbl = { setup: 'Configuración', active: 'En juego', finished: 'Finalizado', pending: 'Pendiente' };
  return `<span class="badge badge-${s}">${lbl[s] || s}</span>`;
}

let _toast;
function toast(msg, type = 'success') {
  if (!document.getElementById('toast')) {
    const el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  const t = document.getElementById('toast');
  t.className = type;
  t.textContent = msg;
  clearTimeout(_toast);
  requestAnimationFrame(() => {
    t.classList.add('show');
    _toast = setTimeout(() => t.classList.remove('show'), 2800);
  });
}

function closeModal() {
  const m = document.getElementById('modal-container');
  if (m) m.innerHTML = '';
}

// ─── HOME PAGE ────────────────────────────────────────────────────────────────

async function renderHome() {
  const tournaments = await GET('/tournaments');

  const list = tournaments.length === 0
    ? '<p class="empty-msg">No hay torneos. ¡Crea el primero!</p>'
    : tournaments.map(t => `
      <div class="list-item" onclick="navigate('/tournaments/${t.id}')">
        <div class="list-item-content">
          <div class="list-item-title">${esc(t.name)}</div>
          <div class="list-item-sub">
            ${genderLabel(t.gender)} &middot; ${t.num_courts} canchas
            &middot; ${t.player_count} jugadores &middot; ${t.round_count} rondas
          </div>
        </div>
        <div class="list-item-right">
          ${statusBadge(t.status)}
          <span class="chevron">›</span>
        </div>
      </div>`).join('');

  document.getElementById('app').innerHTML = `
    <div class="header">
      <h1>🎾 Padel CVA</h1>
      ${adminBtn()}
    </div>
    <div class="card" style="margin-top:14px;">
      <div class="card-header">Torneos</div>
      <div class="card-body p0">${list}</div>
    </div>
    ${isAdmin() ? `
    <div class="page-actions">
      <button class="btn btn-primary btn-full btn-lg" onclick="showCreateTournament()">+ Nuevo Torneo</button>
    </div>` : ''}
    <div id="modal-container"></div>`;
}

function showCreateTournament() {
  document.getElementById('modal-container').innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal">
        <div class="modal-title">
          Nuevo Torneo
          <button class="modal-close" onclick="closeModal()">×</button>
        </div>
        <div class="form-group">
          <label>Nombre del torneo</label>
          <input id="t-name" class="form-control" placeholder="Ej: Torneo Femenino CVA" />
        </div>
        <div class="form-group">
          <label>Género</label>
          <div class="radio-group">
            <div class="radio-option selected" id="opt-F" onclick="selectGender('F')">♀ Femenino</div>
            <div class="radio-option"           id="opt-M" onclick="selectGender('M')">♂ Masculino</div>
          </div>
        </div>
        <div class="form-group">
          <label>Número de canchas</label>
          <select id="t-courts" class="form-control">
            <option value="2">2 canchas</option>
            <option value="3">3 canchas</option>
            <option value="4" selected>4 canchas</option>
            <option value="5">5 canchas</option>
            <option value="6">6 canchas</option>
          </select>
        </div>
        <button class="btn btn-primary btn-full btn-lg" onclick="createTournament()">Crear Torneo</button>
      </div>
    </div>`;
  setTimeout(() => document.getElementById('t-name').focus(), 100);
}

window._selectedGender = 'F';
function selectGender(g) {
  window._selectedGender = g;
  document.getElementById('opt-F').className = 'radio-option' + (g === 'F' ? ' selected' : '');
  document.getElementById('opt-M').className = 'radio-option' + (g === 'M' ? ' selected' : '');
}

async function createTournament() {
  const name      = document.getElementById('t-name').value.trim();
  const gender    = window._selectedGender;
  const num_courts = parseInt(document.getElementById('t-courts').value);
  if (!name) { toast('Ingresa un nombre para el torneo', 'error'); return; }
  try {
    const t = await POST('/tournaments', { name, gender, num_courts });
    closeModal();
    navigate(`/tournaments/${t.id}`);
  } catch (e) { toast(e.message, 'error'); }
}

// ─── TOURNAMENT PAGE ──────────────────────────────────────────────────────────

async function renderTournament(id) {
  const t = await GET(`/tournaments/${id}`);
  const playersNeeded = t.num_courts * 4;
  const numBench = t.players.length - playersNeeded;
  const canGenerate = t.players.length >= playersNeeded;

  const playerRows = t.players.length === 0
    ? '<p class="empty-msg">Sin jugadores aún</p>'
    : t.players.map(p => `
      <div class="player-item">
        <span class="player-name">${esc(p.name)}</span>
        <span class="player-stats">${p.games_won} games · ${p.matches_played} partidos</span>
        ${t.status === 'setup' && isAdmin()
          ? `<button class="btn btn-sm btn-ghost-red" onclick="deletePlayer(${p.id},${id})">✕</button>`
          : ''}
      </div>`).join('');

  const roundRows = t.rounds.length === 0
    ? '<p class="empty-msg">Sin rondas aún</p>'
    : t.rounds.map(r => `
      <div class="round-item" onclick="navigate('/rounds/${r.id}')">
        <span class="round-item-num">Ronda ${r.round_number}</span>
        <span class="round-item-progress">${r.finished_matches}/${r.total_matches} partidos</span>
        ${statusBadge(r.status)}
        <span class="chevron">›</span>
      </div>`).join('');

  const infoMsg = canGenerate
    ? (numBench > 0
      ? `<div class="info-box">ℹ️ Con ${t.players.length} jugadores y ${t.num_courts} canchas, ${numBench} jugador${numBench > 1 ? 'es' : ''} quedarán en banca por ronda.</div>`
      : '')
    : `<div class="info-box" style="background:#ffebee;border-color:#ef9a9a;color:#b71c1c;">
        ⚠️ Se necesitan al menos ${playersNeeded} jugadores para ${t.num_courts} canchas.
        Faltan ${playersNeeded - t.players.length}.
       </div>`;

  document.getElementById('app').innerHTML = `
    <div class="header">
      <button class="btn-back" onclick="navigate('/')">‹</button>
      <div style="flex:1;min-width:0;">
        <h1 style="font-size:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(t.name)}</h1>
        <span class="subtitle">${genderLabel(t.gender)} · ${t.num_courts} canchas</span>
      </div>
      ${genderBadge(t.gender)}
      ${adminBtn()}
    </div>

    <div class="card" style="margin-top:12px;">
      <div class="stat-grid">
        <div class="stat-cell"><div class="stat-val">${t.players.length}</div><div class="stat-lbl">Jugadores</div></div>
        <div class="stat-cell"><div class="stat-val">${t.rounds.length}</div><div class="stat-lbl">Rondas</div></div>
        <div class="stat-cell">${statusBadge(t.status)}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        Jugadores (${t.players.length})
        ${isAdmin() ? `<button class="btn btn-sm" style="background:rgba(255,255,255,0.2);color:white;" onclick="showAddPlayers(${id})">+ Agregar</button>` : ''}
      </div>
      <div class="card-body p0">${playerRows}</div>
    </div>

    ${infoMsg}

    <div class="card">
      <div class="card-header dark">Rondas</div>
      <div class="card-body p0">${roundRows}</div>
    </div>

    <div class="page-actions">
      ${isAdmin() ? `
        <button class="btn btn-orange btn-full btn-lg" onclick="generateRound(${id})"
          ${canGenerate ? '' : 'disabled'}>
          ⚡ Generar Ronda ${t.rounds.length + 1}
        </button>` : ''}
      ${t.rounds.length > 0 ? `
        <button class="btn btn-primary btn-full" onclick="navigate('/tournaments/${id}/leaderboard')">
          🏆 Ver Clasificación
        </button>` : ''}
      ${t.rounds.length > 0 ? `
        <button class="btn btn-ghost btn-full" onclick="navigate('/tournaments/${id}/print')">
          🖨️ Imprimir rondas (PDF)
        </button>` : ''}
      ${t.rounds.length > 0 && isAdmin() ? `
        <button class="btn btn-ghost-red btn-full btn-sm" onclick="deleteLastRound(${id}, ${t.rounds[t.rounds.length - 1].id})">
          🗑 Eliminar última ronda
        </button>` : ''}
    </div>
    <div id="modal-container"></div>`;
}

function showAddPlayers(tournamentId) {
  document.getElementById('modal-container').innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal">
        <div class="modal-title">
          Agregar Jugadores
          <button class="modal-close" onclick="closeModal()">×</button>
        </div>
        <div class="form-group">
          <label>Nombres (uno por línea)</label>
          <textarea id="players-input" class="form-control" rows="10"
            placeholder="Ana García&#10;María López&#10;Carla Ruiz&#10;..."></textarea>
        </div>
        <button class="btn btn-primary btn-full btn-lg" onclick="addPlayers(${tournamentId})">
          Guardar Jugadores
        </button>
      </div>
    </div>`;
  setTimeout(() => document.getElementById('players-input').focus(), 100);
}

async function addPlayers(tournamentId) {
  const raw   = document.getElementById('players-input').value;
  const names = raw.split('\n').map(n => n.trim()).filter(Boolean);
  if (names.length === 0) { toast('Ingresa al menos un nombre', 'error'); return; }
  try {
    const added = await POST(`/tournaments/${tournamentId}/players`, { names });
    closeModal();
    toast(`${added.length} jugador${added.length !== 1 ? 'es' : ''} agregado${added.length !== 1 ? 's' : ''}`);
    navigate(`/tournaments/${tournamentId}`);
  } catch (e) { toast(e.message, 'error'); }
}

async function deletePlayer(playerId, tournamentId) {
  if (!confirm('¿Eliminar jugador?')) return;
  try {
    await DEL(`/players/${playerId}`);
    navigate(`/tournaments/${tournamentId}`);
  } catch (e) { toast(e.message, 'error'); }
}

async function generateRound(tournamentId) {
  try {
    const round = await POST(`/tournaments/${tournamentId}/rounds`);
    toast('¡Ronda generada!');
    navigate(`/rounds/${round.id}`);
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteLastRound(tournamentId, roundId) {
  if (!confirm('¿Eliminar la última ronda? Esto revertirá los resultados registrados en ella.')) return;
  try {
    await DEL(`/rounds/${roundId}`);
    toast('Ronda eliminada');
    navigate(`/tournaments/${tournamentId}`);
  } catch (e) { toast(e.message, 'error'); }
}

// ─── ROUND PAGE ───────────────────────────────────────────────────────────────

async function renderRound(id) {
  const r = await GET(`/rounds/${id}`);

  const benchSection = r.benched.length > 0 ? `
    <div class="bench-section">
      <div class="bench-title">⏸ En banca esta ronda</div>
      <div class="bench-names">${r.benched.map(p => esc(p.name)).join(', ')}</div>
    </div>` : '';

  const matchCards = r.matches.map(m => buildMatchCard(m, r.id)).join('');

  const allDone   = r.matches.every(m => m.status === 'finished');
  const doneSome  = r.matches.some(m => m.status === 'finished');

  document.getElementById('app').innerHTML = `
    <div class="header">
      <button class="btn-back" onclick="navigate('/tournaments/${r.tournament_id}')">‹</button>
      <div style="flex:1;min-width:0;">
        <h1 style="font-size:18px;">Ronda ${r.round_number}</h1>
        <span class="subtitle">${esc(r.tournament_name)}</span>
      </div>
      ${statusBadge(r.status)}
      ${adminBtn()}
    </div>

    ${benchSection}
    ${matchCards}

    <div class="page-actions" style="margin-top:4px;">
      <button class="btn btn-primary btn-full" onclick="navigate('/tournaments/${r.tournament_id}/leaderboard')">
        🏆 Ver Clasificación
      </button>
      <button class="btn btn-ghost btn-full" onclick="navigate('/tournaments/${r.tournament_id}')">
        Volver al torneo
      </button>
    </div>
    <div id="modal-container"></div>`;
}

function buildMatchCard(m, roundId) {
  const team1 = m.players.filter(p => p.team === 1);
  const team2 = m.players.filter(p => p.team === 2);
  const done  = m.status === 'finished';

  const t1names = team1.map(p => esc(p.name));
  const t2names = team2.map(p => esc(p.name));

  if (done) {
    const winner = m.team1_games > m.team2_games ? 1 : (m.team2_games > m.team1_games ? 2 : 0);
    return `
      <div class="match-card">
        <div class="match-card-header done">
          CANCHA ${m.court_number} · ✅ Finalizado
        </div>
        <div class="match-body">
          <div class="team-row">
            <div class="team-names">
              <div class="team-name">${t1names[0] || ''} ${winner===1?'🏅':''}</div>
              <div class="team-name-2">${t1names[1] || ''}</div>
            </div>
            <div class="score-display">${m.team1_games} - ${m.team2_games}</div>
            <div class="team-names" style="text-align:right;">
              <div class="team-name">${t2names[0] || ''} ${winner===2?'🏅':''}</div>
              <div class="team-name-2">${t2names[1] || ''}</div>
            </div>
          </div>
          ${isAdmin() ? `
          <div class="match-actions">
            <button class="btn btn-ghost btn-sm" onclick="editMatchScore(${m.id}, ${roundId}, ${m.team1_games}, ${m.team2_games})">
              ✏️ Editar resultado
            </button>
          </div>` : ''}
        </div>
      </div>`;
  }

  if (!isAdmin()) {
    return `
      <div class="match-card">
        <div class="match-card-header">CANCHA ${m.court_number}</div>
        <div class="match-body">
          <div class="team-row">
            <div class="team-names">
              <div class="team-name">${t1names[0] || ''}</div>
              <div class="team-name-2">${t1names[1] || ''}</div>
            </div>
            <span class="score-pending">· · ·</span>
          </div>
          <div class="vs-divider">— vs —</div>
          <div class="team-row">
            <div class="team-names">
              <div class="team-name">${t2names[0] || ''}</div>
              <div class="team-name-2">${t2names[1] || ''}</div>
            </div>
          </div>
        </div>
      </div>`;
  }

  return `
    <div class="match-card">
      <div class="match-card-header">CANCHA ${m.court_number}</div>
      <div class="match-body">
        <div class="team-row">
          <div class="team-names">
            <div class="team-name">${t1names[0] || ''}</div>
            <div class="team-name-2">${t1names[1] || ''}</div>
          </div>
          <div class="score-control">
            <button class="score-btn" onclick="changeScore('t1g-${m.id}', -1)">−</button>
            <span class="score-value" id="t1g-${m.id}">0</span>
            <button class="score-btn" onclick="changeScore('t1g-${m.id}', 1)">+</button>
          </div>
        </div>
        <div class="vs-divider">— vs —</div>
        <div class="team-row">
          <div class="team-names">
            <div class="team-name">${t2names[0] || ''}</div>
            <div class="team-name-2">${t2names[1] || ''}</div>
          </div>
          <div class="score-control">
            <button class="score-btn" onclick="changeScore('t2g-${m.id}', -1)">−</button>
            <span class="score-value" id="t2g-${m.id}">0</span>
            <button class="score-btn" onclick="changeScore('t2g-${m.id}', 1)">+</button>
          </div>
        </div>
        <div class="match-actions">
          <button class="btn btn-primary btn-full" onclick="saveMatchResult(${m.id}, ${roundId})">
            💾 Guardar resultado
          </button>
        </div>
      </div>
    </div>`;
}

function changeScore(elId, delta) {
  const el  = document.getElementById(elId);
  const cur = parseInt(el.textContent);
  const next = Math.max(0, Math.min(10, cur + delta));
  el.textContent = next;
}

async function saveMatchResult(matchId, roundId) {
  const t1 = parseInt(document.getElementById(`t1g-${matchId}`).textContent);
  const t2 = parseInt(document.getElementById(`t2g-${matchId}`).textContent);
  try {
    await PUT(`/matches/${matchId}/result`, { team1_games: t1, team2_games: t2 });
    toast('Resultado guardado ✓');
    await renderRound(roundId);
  } catch (e) { toast(e.message, 'error'); }
}

function editMatchScore(matchId, roundId, curT1, curT2) {
  document.getElementById('modal-container').innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal">
        <div class="modal-title">
          Editar Resultado
          <button class="modal-close" onclick="closeModal()">×</button>
        </div>
        <div style="display:flex;gap:24px;justify-content:center;align-items:center;padding:16px 0;">
          <div style="text-align:center;">
            <div style="font-size:12px;color:var(--text-light);margin-bottom:8px;">EQUIPO 1</div>
            <div class="score-control" style="justify-content:center;">
              <button class="score-btn" onclick="changeScore('edit-t1', -1)">−</button>
              <span class="score-value" id="edit-t1">${curT1}</span>
              <button class="score-btn" onclick="changeScore('edit-t1', 1)">+</button>
            </div>
          </div>
          <div style="font-size:24px;font-weight:800;color:var(--text-light);">vs</div>
          <div style="text-align:center;">
            <div style="font-size:12px;color:var(--text-light);margin-bottom:8px;">EQUIPO 2</div>
            <div class="score-control" style="justify-content:center;">
              <button class="score-btn" onclick="changeScore('edit-t2', -1)">−</button>
              <span class="score-value" id="edit-t2">${curT2}</span>
              <button class="score-btn" onclick="changeScore('edit-t2', 1)">+</button>
            </div>
          </div>
        </div>
        <button class="btn btn-primary btn-full btn-lg" onclick="saveEditedResult(${matchId}, ${roundId})">
          Guardar
        </button>
      </div>
    </div>`;
}

async function saveEditedResult(matchId, roundId) {
  const t1 = parseInt(document.getElementById('edit-t1').textContent);
  const t2 = parseInt(document.getElementById('edit-t2').textContent);
  try {
    await PUT(`/matches/${matchId}/result`, { team1_games: t1, team2_games: t2 });
    closeModal();
    toast('Resultado actualizado ✓');
    await renderRound(roundId);
  } catch (e) { toast(e.message, 'error'); }
}

// ─── LEADERBOARD PAGE ─────────────────────────────────────────────────────────

async function renderLeaderboard(id) {
  const [t, board] = await Promise.all([
    GET(`/tournaments/${id}`),
    GET(`/tournaments/${id}/leaderboard`),
  ]);

  const top3   = board.slice(0, 3);
  const rest   = board.slice(3);
  const medals = ['🥇', '🥈', '🥉'];
  const heights= ['podium-1', 'podium-2', 'podium-3'];

  // Podium order: 2nd, 1st, 3rd
  const podiumOrder = top3.length >= 2 ? [top3[1], top3[0], top3[2]].filter(Boolean) : top3;
  const podiumCls   = top3.length >= 2 ? ['podium-2','podium-1','podium-3'] : ['podium-1'];
  const podiumMed   = top3.length >= 2 ? ['🥈','🥇','🥉'] : ['🥇'];

  const podiumHtml = podiumOrder.length > 0 ? `
    <div class="card" style="margin-top:12px;">
      <div class="card-header">🏆 Podio</div>
      <div class="podium">
        ${podiumOrder.map((p, i) => `
          <div class="podium-place ${podiumCls[i]}">
            <div class="podium-emoji">${podiumMed[i]}</div>
            <div class="podium-name">${esc(p.name)}</div>
            <div class="podium-score">${p.games_won}</div>
            <div class="podium-sub">${p.matches_played} partidos</div>
          </div>`).join('')}
      </div>
    </div>` : '';

  const rankRows = board.map((p, i) => `
    <div class="rank-row">
      <div class="rank-pos">${i < 3 ? medals[i] : `${i+1}.`}</div>
      <div class="rank-name">${esc(p.name)}</div>
      <div class="rank-stats">
        <div class="rank-games">${p.games_won}</div>
        <div class="rank-sub">${p.matches_played} partidos · ${p.avg_games} prom.</div>
      </div>
    </div>`).join('');

  document.getElementById('app').innerHTML = `
    <div class="header">
      <button class="btn-back" onclick="navigate('/tournaments/${id}')">‹</button>
      <div style="flex:1;min-width:0;">
        <h1 style="font-size:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(t.name)}</h1>
        <span class="subtitle">Clasificación individual</span>
      </div>
      ${adminBtn()}
    </div>

    ${podiumHtml}

    <div class="card" style="margin-top:12px;">
      <div class="card-header">Ranking por games ganados</div>
      <div class="card-body p0">${board.length ? rankRows : '<p class="empty-msg">Sin datos aún</p>'}</div>
    </div>

    <div class="page-actions">
      ${isAdmin() ? `
        <button class="btn btn-orange btn-full" onclick="generateRound(${id})">
          ⚡ Generar Ronda ${t.rounds.length + 1}
        </button>` : ''}
      <button class="btn btn-ghost btn-full" onclick="navigate('/tournaments/${id}')">
        ← Volver al torneo
      </button>
    </div>
    <div id="modal-container"></div>`;
}

// ─── PRINT VIEW ───────────────────────────────────────────────────────────────

async function renderPrint(id) {
  const [t, board] = await Promise.all([
    GET(`/tournaments/${id}`),
    GET(`/tournaments/${id}/leaderboard`),
  ]);

  let rounds = [];
  if (t.rounds.length > 0) {
    rounds = await Promise.all(t.rounds.map(r => GET(`/rounds/${r.id}`)));
  }

  const medals = ['🥇', '🥈', '🥉'];

  const roundsHtml = rounds.map(r => {
    const benchHtml = r.benched.length > 0
      ? `<p class="pv-bench">En banca: ${r.benched.map(p => esc(p.name)).join(', ')}</p>`
      : '';

    const matchRows = r.matches.map(m => {
      const team1 = m.players.filter(p => p.team === 1);
      const team2 = m.players.filter(p => p.team === 2);
      const score = m.status === 'finished'
        ? `<strong>${m.team1_games} — ${m.team2_games}</strong>`
        : `<span class="pv-dash">—</span>`;
      return `
        <tr>
          <td class="pv-court">Cancha ${m.court_number}</td>
          <td class="pv-team">${team1.map(p => esc(p.name)).join('<br>')}</td>
          <td class="pv-score">${score}</td>
          <td class="pv-team">${team2.map(p => esc(p.name)).join('<br>')}</td>
        </tr>`;
    }).join('');

    return `
      <div class="pv-section">
        <h3 class="pv-section-title">Ronda ${r.round_number}</h3>
        ${benchHtml}
        <table class="pv-table"><tbody>${matchRows}</tbody></table>
      </div>`;
  }).join('');

  const boardRows = board.map((p, i) => `
    <tr>
      <td class="pv-pos">${i < 3 ? medals[i] : `${i + 1}.`}</td>
      <td>${esc(p.name)}</td>
      <td class="pv-num">${p.games_won}</td>
      <td class="pv-num">${p.matches_played}</td>
      <td class="pv-num">${p.avg_games}</td>
    </tr>`).join('');

  const leaderboardHtml = board.length > 0 ? `
    <div class="pv-section">
      <h3 class="pv-section-title">Clasificación</h3>
      <table class="pv-table pv-board">
        <thead>
          <tr>
            <th>#</th><th>Jugador/a</th>
            <th class="pv-num">Games</th>
            <th class="pv-num">Partidos</th>
            <th class="pv-num">Prom.</th>
          </tr>
        </thead>
        <tbody>${boardRows}</tbody>
      </table>
    </div>` : '';

  document.getElementById('app').innerHTML = `
    <div class="pv-topbar no-print">
      <button class="btn btn-ghost" onclick="navigate('/tournaments/${id}')">‹ Volver</button>
      <span class="pv-topbar-title">${esc(t.name)}</span>
      <button class="btn btn-primary" onclick="window.print()">🖨️ Imprimir / PDF</button>
    </div>
    <div class="pv-doc">
      <div class="pv-header">
        <div class="pv-header-logo">🎾 Padel CVA</div>
        <h2 class="pv-header-name">${esc(t.name)}</h2>
        <p class="pv-header-sub">${genderLabel(t.gender)} &middot; ${t.num_courts} canchas &middot; ${t.rounds.length} rondas</p>
      </div>
      ${roundsHtml}
      ${leaderboardHtml}
    </div>`;
}

