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
  const nextVersion = Date.now();
  const updates = [
    [DATA_VERSION_KEY, String(nextVersion)],
    [GLOBAL_VERSION_KEY, String(nextVersion)],
    ...selectedParts.map((part) => [VERSION_KEYS[part], String(nextVersion)]),
  ];

  for (const [key, value] of updates) {
    await query`
      INSERT INTO config (key, value)
      VALUES (${key}, ${value})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;
  }

  return nextVersion;
}

export async function bumpDataVersion() {
  return bumpDataVersions([...APP_DATA_PARTS]);
}

export async function getAppManifest(): Promise<AppDataManifest> {
  const [versions, matchCount, playerCount, seasonCount, playerSeasonSettingCount] = await Promise.all([
    getPartVersions(),
    sql`SELECT COUNT(*)::int AS count FROM matches WHERE deleted_at IS NULL`,
    sql`SELECT COUNT(*)::int AS count FROM players WHERE deleted_at IS NULL`,
    sql`SELECT COUNT(*)::int AS count FROM seasons WHERE archived = false`,
    sql`SELECT COUNT(*)::int AS count FROM player_season_settings`,
  ]);
  const globalVersion = Math.max(...Object.values(versions), await getDataVersion());

  return {
    globalVersion,
    parts: versions,
    counts: {
      matches: Number(matchCount.rows[0]?.count || 0),
      players: Number(playerCount.rows[0]?.count || 0),
      seasons: Number(seasonCount.rows[0]?.count || 0),
      playerSeasonSettings: Number(playerSeasonSettingCount.rows[0]?.count || 0),
    },
    checkedAt: Date.now(),
  };
}
