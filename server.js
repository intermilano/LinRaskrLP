import express from 'express';
import mysql from 'mysql2/promise';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '10mb' }));

const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'linraskrlp',
  password: process.env.DB_PASSWORD || 'linraskrlp_pass',
  database: process.env.DB_NAME || 'linraskrlp',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4'
};

let pool;

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function initDb() {
  for (let i = 1; i <= 30; i++) {
    try {
      pool = mysql.createPool(dbConfig);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS projects (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL DEFAULT 'Раскрой Профиль',
          reason VARCHAR(100) NULL,
          data_json LONGTEXT NOT NULL,
          result_json LONGTEXT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS actions (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          action_type VARCHAR(100) NOT NULL,
          payload_json LONGTEXT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);
      return;
    } catch (err) {
      console.log(`DB wait ${i}/30: ${err.message}`);
      await wait(2000);
    }
  }
  throw new Error('Database is not available');
}

function parseJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; }
  catch { return fallback; }
}

function projectSummary(row) {
  const data = parseJson(row.data_json, {});
  const result = parseJson(row.result_json, {});
  const requested = Number(result.requested || 0);
  const undone = Array.isArray(result.undone) ? result.undone.length : 0;
  const cuts = Array.isArray(result.cuts) ? result.cuts : [];
  const totalRest = cuts.reduce((sum, cut) => sum + Number(cut.rest || 0), 0);
  const totalStock = cuts.reduce((sum, cut) => sum + Number(cut.stock || 0), 0);
  const totalUsed = cuts.reduce((sum, cut) => sum + Number(cut.used || 0), 0);
  const usefulLimit = Number(data.settings?.usefulRest || 0);
  const usefulRest = cuts.reduce((sum, cut) => sum + (Number(cut.rest || 0) >= usefulLimit ? Number(cut.rest || 0) : 0), 0);
  const cleanWaste = totalRest - usefulRest;
  const wastePct = totalStock ? cleanWaste / totalStock * 100 : 0;
  return {
    requested,
    done: Math.max(0, requested - undone),
    undone,
    stockUsed: cuts.length,
    totalUsed,
    totalRest,
    cleanWaste,
    wastePct: Number(wastePct.toFixed(2)),
    stockRows: Array.isArray(data.stock) ? data.stock.length : 0,
    partRows: Array.isArray(data.parts) ? data.parts.length : 0,
    mode: String(result.mode || '').toUpperCase()
  };
}

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/projects', async (req, res) => {
  const name = String(req.body?.name || 'Раскрой Профиль').slice(0, 255);
  const reason = String(req.body?.reason || 'manual').slice(0, 100);
  const data = JSON.stringify(req.body?.data || {});
  const result = JSON.stringify(req.body?.result || {});
  const [r] = await pool.execute(
    'INSERT INTO projects (name, reason, data_json, result_json) VALUES (?, ?, ?, ?)',
    [name, reason, data, result]
  );
  res.json({ ok: true, id: r.insertId });
});

app.get('/api/projects', async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, name, reason, data_json, result_json, created_at, updated_at FROM projects ORDER BY id DESC LIMIT 50'
  );
  res.json({
    ok: true,
    items: rows.map(row => ({
      id: row.id,
      name: row.name,
      reason: row.reason,
      created_at: row.created_at,
      updated_at: row.updated_at,
      summary: projectSummary(row)
    }))
  });
});

app.get('/api/projects/:id', async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM projects WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ ok: false, error: 'Not found' });
  const row = rows[0];
  res.json({
    ok: true,
    item: {
      id: row.id,
      name: row.name,
      reason: row.reason,
      data: parseJson(row.data_json, {}),
      result: parseJson(row.result_json, {}),
      created_at: row.created_at,
      updated_at: row.updated_at
    }
  });
});

app.post('/api/actions', async (req, res) => {
  const type = String(req.body?.type || 'action').slice(0, 100);
  const payload = JSON.stringify(req.body?.payload || {});
  const [r] = await pool.execute(
    'INSERT INTO actions (action_type, payload_json) VALUES (?, ?)',
    [type, payload]
  );
  res.json({ ok: true, id: r.insertId });
});

app.get('/api/actions', async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, action_type, payload_json, created_at FROM actions ORDER BY id DESC LIMIT 100'
  );
  res.json({
    ok: true,
    items: rows.map(row => ({
      id: row.id,
      type: row.action_type,
      payload: parseJson(row.payload_json, {}),
      created_at: row.created_at
    }))
  });
});

app.use(express.static(path.join(__dirname, 'public')));

await initDb();
app.listen(port, () => console.log(`Раскрой Профиль listening on ${port}`));
