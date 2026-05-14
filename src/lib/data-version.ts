import { sql } from '@vercel/postgres';

export const DATA_VERSION_KEY = 'data_version';

export async function ensureConfigTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS config (
      key VARCHAR(50) PRIMARY KEY,
      value VARCHAR(255) NOT NULL
    )
  `;
}

export async function getDataVersion() {
  await ensureConfigTable();
  const { rows } = await sql`SELECT value FROM config WHERE key = ${DATA_VERSION_KEY} LIMIT 1`;
  return rows[0]?.value ? Number(rows[0].value) || 0 : 0;
}

export async function bumpDataVersion() {
  await ensureConfigTable();
  const nextVersion = Date.now();
  await sql`
    INSERT INTO config (key, value)
    VALUES (${DATA_VERSION_KEY}, ${String(nextVersion)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
  return nextVersion;
}
