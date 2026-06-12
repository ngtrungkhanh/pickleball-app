import { sql } from '@vercel/postgres';

export const DATA_VERSION_KEY = 'data_version';
export const GLOBAL_VERSION_KEY = 'version_global';

export const APP_DATA_PARTS = [
  'matches',
  'players',
  'seasons',
  'config',
  'playerSeasonSettings',
  'admin',
] as const;

export type AppDataPart = typeof APP_DATA_PARTS[number];

export type AppPartVersions = Record<AppDataPart, number>;

export type AppDataManifest = {
  globalVersion: number;
  parts: AppPartVersions;
  counts: {
    matches: number;
    players: number;
    seasons: number;
    playerSeasonSettings: number;
  };
  checkedAt: number;
};

const VERSION_KEYS: Record<AppDataPart, string> = {
  matches: 'version_matches',
  players: 'version_players',
  seasons: 'version_seasons',
  config: 'version_config',
  playerSeasonSettings: 'version_player_season_settings',
  admin: 'version_admin',
};

type SqlTag = typeof sql;
type SqlRunner = {
  sql: SqlTag;
};

function db(runner?: SqlRunner) {
  return runner?.sql ? runner.sql.bind(runner) as SqlTag : sql;
}

export async function ensureConfigTable(runner?: SqlRunner) {
  const query = db(runner);
  await query`
    CREATE TABLE IF NOT EXISTS config (
      key VARCHAR(50) PRIMARY KEY,
      value VARCHAR(255) NOT NULL
    )
  `;
}

export async function ensureDataVersionCounter(runner?: SqlRunner) {
  const query = db(runner);
  await ensureConfigTable(runner);
  await query`
    CREATE TABLE IF NOT EXISTS app_version_counter (
      id SMALLINT PRIMARY KEY CHECK (id = 1),
      value BIGINT NOT NULL
    )
  `;
  await query`
    INSERT INTO app_version_counter (id, value)
    SELECT
      1,
      GREATEST(
        FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT,
        COALESCE(MAX(
          CASE
            WHEN value ~ '^[0-9]+$' THEN value::BIGINT
            ELSE 0
          END
        ), 0)
      )
    FROM config
    ON CONFLICT (id) DO UPDATE
    SET value = GREATEST(app_version_counter.value, EXCLUDED.value)
  `;
}

export async function nextDataVersion(runner?: SqlRunner) {
  const query = db(runner);
  const allocate = async () => {
    const { rows } = await query`
      UPDATE app_version_counter
      SET value = GREATEST(
        value + 1,
        FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT
      )
      WHERE id = 1
      RETURNING value
    `;
    const version = Number(rows[0]?.value || 0);
    if (!Number.isSafeInteger(version) || version <= 0) {
      throw new Error('Data version counter is unavailable');
    }
    return version;
  };

  try {
    return await allocate();
  } catch (error) {
    if (runner) throw error;
    await ensureDataVersionCounter();
    return allocate();
  }
}

function emptyPartVersions(): AppPartVersions {
  return {
    matches: 0,
    players: 0,
    seasons: 0,
    config: 0,
    playerSeasonSettings: 0,
    admin: 0,
  };
}

function normalizeParts(parts: AppDataPart[]) {
  return APP_DATA_PARTS.filter((part) => parts.includes(part));
}

export async function getDataVersion() {
  const { rows } = await sql`
    SELECT key, value FROM config
    WHERE key IN (${DATA_VERSION_KEY}, ${GLOBAL_VERSION_KEY})
  `;
  const config: Record<string, string> = {};
  rows.forEach((row) => {
    config[String(row.key)] = String(row.value);
  });
  return Number(config[GLOBAL_VERSION_KEY] || config[DATA_VERSION_KEY] || 0) || 0;
}

export async function getPartVersions(): Promise<AppPartVersions> {
  const { rows } = await sql`SELECT key, value FROM config`;
  const config: Record<string, string> = {};
  rows.forEach((row) => {
    config[String(row.key)] = String(row.value);
  });

  const legacyVersion = Number(config[GLOBAL_VERSION_KEY] || config[DATA_VERSION_KEY] || 0) || 0;
  const versions = emptyPartVersions();
  APP_DATA_PARTS.forEach((part) => {
    versions[part] = Number(config[VERSION_KEYS[part]] || legacyVersion || 0) || 0;
  });
  return versions;
}

export async function bumpDataVersions(parts: AppDataPart[], runner?: SqlRunner) {
  const query = db(runner);
  await ensureConfigTable(runner);
  const selectedParts = normalizeParts(parts);
  const nextVersion = await nextDataVersion(runner);
  const updates = [
    [DATA_VERSION_KEY, String(nextVersion)],
    [GLOBAL_VERSION_KEY, String(nextVersion)],
    ...selectedParts.map((part) => [VERSION_KEYS[part], String(nextVersion)]),
  ];

  for (const [key, value] of updates) {
    await query`
      INSERT INTO config (key, value)
      VALUES (${key}, ${value})
      ON CONFLICT (key) DO UPDATE SET value = (
        GREATEST(
          CASE
            WHEN config.value ~ '^[0-9]+$' THEN config.value::BIGINT
            ELSE 0
          END,
          EXCLUDED.value::BIGINT
        )
      )::TEXT
    `;
  }

  return nextVersion;
}

export async function bumpDataVersion() {
  return bumpDataVersions([...APP_DATA_PARTS]);
}

export async function getAppManifest(): Promise<AppDataManifest> {
  const versions = await getPartVersions();
  const globalVersion = Math.max(...Object.values(versions));

  return {
    globalVersion,
    parts: versions,
    counts: {
      matches: 0,
      players: 0,
      seasons: 0,
      playerSeasonSettings: 0,
    },
    checkedAt: Date.now(),
  };
}
