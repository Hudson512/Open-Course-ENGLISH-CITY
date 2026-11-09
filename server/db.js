// Player save persistence. Postgres when DATABASE_URL is set; otherwise the game runs
// without server-side saves (the browser's localStorage is still the primary copy).
import crypto from 'node:crypto';

const hash = token => crypto.createHash('sha256').update(String(token)).digest('hex');

export const validId = id => /^p_[a-z0-9]{4,40}$/.test(String(id));
export const validToken = t => /^[a-f0-9]{32,64}$/.test(String(t));

// Both stores share one contract:
//   put(id, token, data) -> true, or false when the save belongs to another token
//   get(id, token)       -> { data, updatedAt } | null (missing) | false (wrong token)
export function memoryStore() {
  const rows = new Map();
  return {
    async put(id, token, data) {
      const row = rows.get(id);
      if (row && row.tokenHash !== hash(token)) return false;
      rows.set(id, { tokenHash: hash(token), data, updatedAt: new Date() });
      return true;
    },
    async get(id, token) {
      const row = rows.get(id);
      if (!row) return null;
      return row.tokenHash === hash(token) ? { data: row.data, updatedAt: row.updatedAt } : false;
    }
  };
}

export async function postgresStore(url, { retries = 10, delayMs = 1500 } = {}) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: url, max: 5 });
  pool.on('error', e => console.error('[db]', e.message));
  for (let i = 0; ; i++) {
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS saves (
        player_id  text PRIMARY KEY,
        token_hash text NOT NULL,
        data       jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
      break;
    } catch (e) {
      if (i >= retries) throw e;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return {
    async put(id, token, data) {
      const r = await pool.query(
        `INSERT INTO saves (player_id, token_hash, data) VALUES ($1, $2, $3)
         ON CONFLICT (player_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
         WHERE saves.token_hash = EXCLUDED.token_hash`,
        [id, hash(token), JSON.stringify(data)]);
      return r.rowCount === 1;
    },
    async get(id, token) {
      const r = await pool.query('SELECT token_hash, data, updated_at FROM saves WHERE player_id = $1', [id]);
      if (!r.rowCount) return null;
      return r.rows[0].token_hash === hash(token) ? { data: r.rows[0].data, updatedAt: r.rows[0].updated_at } : false;
    },
    close: () => pool.end()
  };
}
