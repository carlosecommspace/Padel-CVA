'use strict';

const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── DB INIT ─────────────────────────────────────────────────────────────────

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS tournaments (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(255) NOT NULL,
        gender      VARCHAR(10)  NOT NULL,
        num_courts  INTEGER      NOT NULL DEFAULT 4,
        status      VARCHAR(20)  NOT NULL DEFAULT 'setup',
        created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS players (
        id             SERIAL PRIMARY KEY,
        tournament_id  INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
        name           VARCHAR(255) NOT NULL,
        bench_count    INTEGER NOT NULL DEFAULT 0,
        matches_played INTEGER NOT NULL DEFAULT 0,
        games_won      INTEGER NOT NULL DEFAULT 0,
        created_at     TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS rounds (
        id             SERIAL PRIMARY KEY,
        tournament_id  INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
        round_number   INTEGER NOT NULL,
        status         VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at     TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS bench_assignments (
        id         SERIAL PRIMARY KEY,
        round_id   INTEGER REFERENCES rounds(id) ON DELETE CASCADE,
        player_id  INTEGER REFERENCES players(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS matches (
        id           SERIAL PRIMARY KEY,
        round_id     INTEGER REFERENCES rounds(id) ON DELETE CASCADE,
        court_number INTEGER NOT NULL,
        status       VARCHAR(20) NOT NULL DEFAULT 'pending',
        team1_games  INTEGER,
        team2_games  INTEGER,
        created_at   TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS match_players (
        id         SERIAL PRIMARY KEY,
        match_id   INTEGER REFERENCES matches(id) ON DELETE CASCADE,
        player_id  INTEGER REFERENCES players(id) ON DELETE CASCADE,
        team       INTEGER NOT NULL
      );
    `);
    console.log('✅ Base de datos inicializada');
  } finally {
    client.release();
  }
}

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────

const wrap = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ─── HEALTH ──────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ─── TOURNAMENTS ─────────────────────────────────────────────────────────────

app.get('/api/tournaments', wrap(async (req, res) => {
  const result = await pool.query(`
    SELECT t.*,
      (SELECT COUNT(*) FROM players WHERE tournament_id = t.id)::int AS player_count,
      (SELECT COUNT(*) FROM rounds  WHERE tournament_id = t.id)::int AS round_count
    FROM tournaments t
    ORDER BY created_at DESC
  `);
  res.json(result.rows);
}));

app.post('/api/tournaments', wrap(async (req, res) => {
  const { name, gender, num_courts = 4 } = req.body;
  if (!name || !gender) return res.status(400).json({ error: 'Nombre y género requeridos' });
  const result = await pool.query(
    'INSERT INTO tournaments (name, gender, num_courts) VALUES ($1, $2, $3) RETURNING *',
    [name.trim(), gender, parseInt(num_courts)]
  );
  res.json(result.rows[0]);
}));

app.get('/api/tournaments/:id', wrap(async (req, res) => {
  const { id } = req.params;
  const [t, players, rounds] = await Promise.all([
    pool.query('SELECT * FROM tournaments WHERE id = $1', [id]),
    pool.query('SELECT * FROM players WHERE tournament_id = $1 ORDER BY games_won DESC, name ASC', [id]),
    pool.query(`
      SELECT r.*,
        (SELECT COUNT(*) FROM matches WHERE round_id = r.id)::int              AS total_matches,
        (SELECT COUNT(*) FROM matches WHERE round_id = r.id AND status = 'finished')::int AS finished_matches
      FROM rounds r
      WHERE tournament_id = $1
      ORDER BY round_number
    `, [id]),
  ]);
  if (!t.rows[0]) return res.status(404).json({ error: 'Torneo no encontrado' });
  res.json({ ...t.rows[0], players: players.rows, rounds: rounds.rows });
}));

app.patch('/api/tournaments/:id', wrap(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const result = await pool.query(
    'UPDATE tournaments SET status = $1 WHERE id = $2 RETURNING *',
    [status, id]
  );
  res.json(result.rows[0]);
}));

app.delete('/api/tournaments/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM tournaments WHERE id = $1', [req.params.id]);
  res.json({ success: true });
}));

// ─── PLAYERS ─────────────────────────────────────────────────────────────────

app.post('/api/tournaments/:id/players', wrap(async (req, res) => {
  const { id } = req.params;
  const { names } = req.body;
  if (!Array.isArray(names) || names.length === 0)
    return res.status(400).json({ error: 'Se requiere un array de nombres' });

  const results = [];
  for (const name of names) {
    if (!name.trim()) continue;
    const r = await pool.query(
      'INSERT INTO players (tournament_id, name) VALUES ($1, $2) RETURNING *',
      [id, name.trim()]
    );
    results.push(r.rows[0]);
  }
  res.json(results);
}));

app.delete('/api/players/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM players WHERE id = $1', [req.params.id]);
  res.json({ success: true });
}));

// ─── ROUNDS ──────────────────────────────────────────────────────────────────

// Fisher-Yates shuffle
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

app.post('/api/tournaments/:id/rounds', wrap(async (req, res) => {
  const { id } = req.params;

  const [tRes, pRes, cntRes] = await Promise.all([
    pool.query('SELECT * FROM tournaments WHERE id = $1', [id]),
    pool.query('SELECT * FROM players WHERE tournament_id = $1', [id]),
    pool.query('SELECT COUNT(*)::int AS count FROM rounds WHERE tournament_id = $1', [id]),
  ]);

  const t = tRes.rows[0];
  if (!t) return res.status(404).json({ error: 'Torneo no encontrado' });

  const playerList   = pRes.rows;
  const numCourts    = t.num_courts;
  const playersNeeded = numCourts * 4;
  const numBenched   = playerList.length - playersNeeded;
  const roundNumber  = cntRes.rows[0].count + 1;

  if (playerList.length < playersNeeded) {
    return res.status(400).json({
      error: `Se necesitan al menos ${playersNeeded} jugadores para ${numCourts} canchas. Hay ${playerList.length}.`,
    });
  }

  // Sort by bench_count asc, then random tiebreak → first numBenched sit out
  const sorted = playerList
    .map(p => ({ ...p, _r: Math.random() }))
    .sort((a, b) => a.bench_count - b.bench_count || a._r - b._r);

  const benchedPlayers = numBenched > 0 ? sorted.slice(0, numBenched) : [];
  const activePlayers  = shuffle(numBenched > 0 ? sorted.slice(numBenched) : sorted);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const roundRes = await client.query(
      'INSERT INTO rounds (tournament_id, round_number) VALUES ($1, $2) RETURNING *',
      [id, roundNumber]
    );
    const round = roundRes.rows[0];

    for (const p of benchedPlayers) {
      await client.query(
        'INSERT INTO bench_assignments (round_id, player_id) VALUES ($1, $2)',
        [round.id, p.id]
      );
      await client.query('UPDATE players SET bench_count = bench_count + 1 WHERE id = $1', [p.id]);
    }

    for (let court = 0; court < numCourts; court++) {
      const cp = activePlayers.slice(court * 4, court * 4 + 4);
      const mRes = await client.query(
        'INSERT INTO matches (round_id, court_number) VALUES ($1, $2) RETURNING *',
        [round.id, court + 1]
      );
      const match = mRes.rows[0];
      for (let i = 0; i < 4; i++) {
        await client.query(
          'INSERT INTO match_players (match_id, player_id, team) VALUES ($1, $2, $3)',
          [match.id, cp[i].id, i < 2 ? 1 : 2]
        );
      }
    }

    await client.query("UPDATE tournaments SET status = 'active' WHERE id = $1", [id]);
    await client.query('COMMIT');
    res.json(round);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

app.get('/api/rounds/:id', wrap(async (req, res) => {
  const { id } = req.params;

  const [rRes, mRes, bRes] = await Promise.all([
    pool.query(`
      SELECT r.*, t.name AS tournament_name, t.gender, t.num_courts, t.id AS tournament_id
      FROM rounds r JOIN tournaments t ON r.tournament_id = t.id
      WHERE r.id = $1
    `, [id]),
    pool.query(`
      SELECT m.*,
        json_agg(
          json_build_object('id', p.id, 'name', p.name, 'team', mp.team)
          ORDER BY mp.team, p.name
        ) AS players
      FROM matches m
      JOIN match_players mp ON mp.match_id = m.id
      JOIN players p ON p.id = mp.player_id
      WHERE m.round_id = $1
      GROUP BY m.id
      ORDER BY m.court_number
    `, [id]),
    pool.query(`
      SELECT p.id, p.name, p.bench_count
      FROM bench_assignments ba JOIN players p ON p.id = ba.player_id
      WHERE ba.round_id = $1
      ORDER BY p.name
    `, [id]),
  ]);

  if (!rRes.rows[0]) return res.status(404).json({ error: 'Ronda no encontrada' });
  res.json({ ...rRes.rows[0], matches: mRes.rows, benched: bRes.rows });
}));

app.delete('/api/rounds/:id', wrap(async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Reverse finished match stats
    const rows = await client.query(
      `SELECT m.team1_games, m.team2_games, mp.player_id, mp.team
       FROM matches m JOIN match_players mp ON mp.match_id = m.id
       WHERE m.round_id = $1 AND m.status = 'finished'`,
      [id]
    );
    for (const row of rows.rows) {
      const g = row.team === 1 ? row.team1_games : row.team2_games;
      await client.query(
        'UPDATE players SET games_won = games_won - $1, matches_played = matches_played - 1 WHERE id = $2',
        [g || 0, row.player_id]
      );
    }

    // Reverse bench counts
    const benched = await client.query(
      'SELECT player_id FROM bench_assignments WHERE round_id = $1', [id]
    );
    for (const row of benched.rows) {
      await client.query('UPDATE players SET bench_count = bench_count - 1 WHERE id = $1', [row.player_id]);
    }

    await client.query('DELETE FROM rounds WHERE id = $1', [id]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

// ─── MATCHES ─────────────────────────────────────────────────────────────────

app.put('/api/matches/:id/result', wrap(async (req, res) => {
  const { id } = req.params;
  const { team1_games, team2_games } = req.body;
  if (team1_games === undefined || team2_games === undefined)
    return res.status(400).json({ error: 'Se requieren games de ambos equipos' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const mRes = await client.query('SELECT * FROM matches WHERE id = $1 FOR UPDATE', [id]);
    const m = mRes.rows[0];
    if (!m) return res.status(404).json({ error: 'Partido no encontrado' });

    const mpRes = await client.query('SELECT * FROM match_players WHERE match_id = $1', [id]);

    // Reverse previous result if already finished
    if (m.status === 'finished' && m.team1_games !== null) {
      for (const mp of mpRes.rows) {
        const prev = mp.team === 1 ? m.team1_games : m.team2_games;
        await client.query(
          'UPDATE players SET games_won = games_won - $1, matches_played = matches_played - 1 WHERE id = $2',
          [prev, mp.player_id]
        );
      }
    }

    await client.query(
      "UPDATE matches SET team1_games = $1, team2_games = $2, status = 'finished' WHERE id = $3",
      [parseInt(team1_games), parseInt(team2_games), id]
    );

    for (const mp of mpRes.rows) {
      const g = mp.team === 1 ? parseInt(team1_games) : parseInt(team2_games);
      await client.query(
        'UPDATE players SET games_won = games_won + $1, matches_played = matches_played + 1 WHERE id = $2',
        [g, mp.player_id]
      );
    }

    // Update round status
    const cnt = await client.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'finished')::int AS finished
       FROM matches WHERE round_id = $1`,
      [m.round_id]
    );
    const { total, finished } = cnt.rows[0];
    const newStatus = total === finished ? 'finished' : 'active';
    await client.query('UPDATE rounds SET status = $1 WHERE id = $2', [newStatus, m.round_id]);

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

// ─── LEADERBOARD ─────────────────────────────────────────────────────────────

app.get('/api/tournaments/:id/leaderboard', wrap(async (req, res) => {
  const result = await pool.query(`
    SELECT id, name, games_won, matches_played, bench_count,
      CASE WHEN matches_played > 0
        THEN ROUND(games_won::numeric / matches_played, 2)
        ELSE 0
      END AS avg_games
    FROM players
    WHERE tournament_id = $1
    ORDER BY games_won DESC, avg_games DESC, name ASC
  `, [req.params.id]);
  res.json(result.rows);
}));

// ─── ERROR HANDLER ───────────────────────────────────────────────────────────

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Error interno del servidor' });
});

// ─── START ───────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;

// Arrancar el servidor HTTP primero para que el healthcheck de Railway responda
// mientras la base de datos termina de levantarse.
app.listen(PORT, '0.0.0.0', () =>
  console.log(`🎾 Padel CVA corriendo en http://localhost:${PORT}`)
);

// Conectar a la DB con reintentos (Railway puede tardar unos segundos en
// tener el PostgreSQL listo después de que el proceso arranca).
async function initWithRetry(attempts = 8, delayMs = 3000) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await initDB();
      return;
    } catch (err) {
      console.error(`[DB] Intento ${i}/${attempts} fallido: ${err.message}`);
      if (i < attempts) {
        await new Promise(r => setTimeout(r, delayMs));
        delayMs = Math.min(delayMs * 1.5, 15000); // backoff exponencial, máx 15 s
      }
    }
  }
  console.error('[DB] No se pudo conectar a la base de datos. Las peticiones fallarán hasta que esté disponible.');
}

initWithRetry();
