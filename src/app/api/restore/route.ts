import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { shouldBlockPreviewWrites } from '@/lib/environment';
import { bumpDataVersions, ensureConfigTable } from '@/lib/data-version';
import { recordAppDataReset } from '@/lib/data-delta';

type BackupMatch = {
  id?: string;
  date?: string;
  season?: string;
  [key: string]: unknown;
};

type BackupSeason = {
  id?: string;
  name?: string;
  start_date?: string;
  end_date?: string | null;
  active?: boolean;
  archived?: boolean;
  champion_image_url?: string | null;
  champion_image_path?: string | null;
  champion_image_updated_at?: string | null;
  created_at?: string;
  lose_money?: number;
};

function synthesizeSeasons(matches: BackupMatch[], config: Record<string, unknown>): BackupSeason[] {
  const bySeason = new Map<string, { name: string; startDate: string }>();

  for (const match of matches) {
    const name = String(match.season || 'Season 1').trim() || 'Season 1';
    const date = String(match.date || new Date().toISOString());
    const current = bySeason.get(name);
    if (!current || new Date(date).getTime() < new Date(current.startDate).getTime()) {
      bySeason.set(name, { name, startDate: date });
    }
  }

  if (bySeason.size === 0) {
    const activeSeason = String(config.active_season || 'Season 1');
    bySeason.set(activeSeason, { name: activeSeason, startDate: new Date().toISOString() });
  }

  return Array.from(bySeason.values()).map(row => ({
    id: row.name,
    name: row.name,
    start_date: row.startDate,
    active: false,
    archived: false,
  }));
}

function normalizeBackupTimestamp(value: unknown, fallback?: string) {
  if (value === null || value === undefined || value === '') return fallback ?? null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? (fallback ?? null) : date.toISOString();
}

async function ensureRestoreColumns() {
  await ensureConfigTable();
  await sql`ALTER TABLE seasons ADD COLUMN IF NOT EXISTS champion_image_url TEXT`;
  await sql`ALTER TABLE seasons ADD COLUMN IF NOT EXISTS champion_image_path TEXT`;
  await sql`ALTER TABLE seasons ADD COLUMN IF NOT EXISTS champion_image_updated_at TIMESTAMP`;
  await sql`ALTER TABLE seasons ADD COLUMN IF NOT EXISTS lose_money INT DEFAULT 5000`;
  await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS client_request_id VARCHAR(120)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS matches_client_request_id_unique ON matches (client_request_id) WHERE client_request_id IS NOT NULL`;
  await sql`
    CREATE TABLE IF NOT EXISTS player_season_settings (
      player_id VARCHAR(80) NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      season VARCHAR(80) NOT NULL,
      active BOOLEAN DEFAULT TRUE,
      pay_fine BOOLEAN DEFAULT TRUE,
      hidden BOOLEAN DEFAULT FALSE,
      PRIMARY KEY (player_id, season)
    )
  `;
}

export async function POST(request: Request) {
  try {
    if (shouldBlockPreviewWrites()) {
      return NextResponse.json(
        { error: 'Preview writes are blocked because Preview uses the production database.' },
        { status: 403 },
      );
    }

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'File backup không hợp lệ.' }, { status: 400 });
    }

    const text = await file.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: 'File không đúng định dạng JSON.' }, { status: 400 });
    }

    const {
      players = [],
      matches = [],
      logs = [],
      archives = [],
      seasons = [],
      config = {},
      playerSeasonSettings = [],
    } = data;

    await ensureRestoreColumns();

    const explicitSeasons: BackupSeason[] = Array.isArray(seasons) && seasons.length > 0
      ? seasons
      : synthesizeSeasons(matches, config);
    const sourceSeasons: BackupSeason[] = [...explicitSeasons];
    const explicitSeasonNames = new Set(explicitSeasons.map((season) => String(season.name || season.id || '').trim()).filter(Boolean));
    for (const synthesized of synthesizeSeasons(matches, config)) {
      const name = String(synthesized.name || synthesized.id || '').trim();
      if (name && !explicitSeasonNames.has(name)) {
        sourceSeasons.push(synthesized);
        explicitSeasonNames.add(name);
      }
    }
    const restoredSeasonNames = new Set(
      sourceSeasons
        .map((season) => String(season.name || season.id || '').trim())
        .filter(Boolean)
    );
    const configuredActiveSeason = String(config.active_season || '').trim();
    const rowActiveSeason = sourceSeasons.find((season) => season.active)?.name || sourceSeasons.find((season) => season.active)?.id || '';
    const resolvedActiveSeason = restoredSeasonNames.has(configuredActiveSeason)
      ? configuredActiveSeason
      : restoredSeasonNames.has(String(rowActiveSeason))
        ? String(rowActiveSeason)
        : Array.from(restoredSeasonNames)[0] || 'Season 1';

    // Delete in reverse dependency order to prevent FK violations
    await sql`DELETE FROM audit_logs`;
    await sql`DELETE FROM archives`;
    await sql`DELETE FROM player_season_settings`;
    await sql`DELETE FROM matches`;
    await sql`DELETE FROM players`;
    await sql`DELETE FROM seasons`;
    await sql`DELETE FROM config`;

    // 1. Restore Seasons
    for (const s of sourceSeasons) {
      const name = String(s.name || s.id || '').trim();
      if (!name) continue;
      const id = String(s.id || name);
      await sql`
        INSERT INTO seasons (id, name, start_date, end_date, active, archived, champion_image_url, champion_image_path, champion_image_updated_at, created_at, lose_money)
        VALUES (${id}, ${name}, ${normalizeBackupTimestamp(s.start_date, new Date().toISOString())}, ${normalizeBackupTimestamp(s.end_date)}, ${name === resolvedActiveSeason}, ${s.archived ? true : false}, ${s.champion_image_url || null}, ${s.champion_image_path || null}, ${normalizeBackupTimestamp(s.champion_image_updated_at)}, ${normalizeBackupTimestamp(s.created_at, new Date().toISOString())}, ${Number(s.lose_money || 5000) || 5000})
      `;
    }

    // 2. Restore Players
    const restoredPlayerIds = new Set<string>();
    for (const p of players) {
      if (!p.id) continue;
      restoredPlayerIds.add(String(p.id));
      await sql`
        INSERT INTO players (id, name, active, pay_fine, hidden, deleted_at, delete_group_id)
        VALUES (${p.id}, ${p.name}, ${p.active ? true : false}, ${p.pay_fine !== false ? true : false}, ${p.hidden ? true : false}, ${p.deleted_at || null}, ${p.delete_group_id || null})
      `;
    }

    // 3. Restore Matches
    for (const m of matches) {
      await sql`
        INSERT INTO matches (id, date, win_1, win_2, lose_1, lose_2, win_score, lose_score, season, created_by, client_request_id, deleted_at, delete_group_id)
        VALUES (${m.id}, ${normalizeBackupTimestamp(m.date, new Date().toISOString())}, ${m.win_1}, ${m.win_2 || null}, ${m.lose_1}, ${m.lose_2 || null}, ${m.win_score || 0}, ${m.lose_score || 0}, ${m.season || 'Season 1'}, ${m.created_by || 'SYSTEM'}, ${m.client_request_id || null}, ${normalizeBackupTimestamp(m.deleted_at)}, ${m.delete_group_id || null})
      `;
    }

    // 4. Restore Config
    const configEntries = Object.entries(config as Record<string, unknown>)
      .filter(([key]) => key !== 'data_version' && key !== 'active_season');
    for (const [key, value] of configEntries) {
      await sql`
        INSERT INTO config (key, value)
        VALUES (${key}, ${value !== undefined && value !== null ? String(value) : ''})
      `;
    }
    await sql`
      INSERT INTO config (key, value)
      VALUES ('active_season', ${resolvedActiveSeason})
    `;

    // 5. Restore player-season settings
    for (const setting of playerSeasonSettings) {
      const playerId = String(setting.player_id || '').trim();
      const season = String(setting.season || '').trim();
      if (!playerId || !season || !restoredPlayerIds.has(playerId) || !restoredSeasonNames.has(season)) continue;
      await sql`
        INSERT INTO player_season_settings (player_id, season, active, pay_fine, hidden)
        VALUES (${playerId}, ${season}, ${setting.active !== false}, ${setting.pay_fine !== false}, ${setting.hidden === true})
      `;
    }

    // 6. Restore Archives
    for (const a of archives) {
      await sql`
        INSERT INTO archives (type, original_id, name, data, deleted_at)
        VALUES (${a.type}, ${a.original_id}, ${a.name || null}, ${JSON.stringify(a.data)}, ${normalizeBackupTimestamp(a.deleted_at, new Date().toISOString())})
      `;
    }

    // 7. Restore Logs
    for (const l of logs) {
      await sql`
        INSERT INTO audit_logs (id, action_type, details, created_at)
        VALUES (${l.id}, ${l.action_type}, ${l.details}, ${normalizeBackupTimestamp(l.created_at, new Date().toISOString())})
      `;
    }

    const dataVersion = await bumpDataVersions(['matches', 'players', 'seasons', 'config', 'playerSeasonSettings', 'admin']);
    await recordAppDataReset('matches', dataVersion);

    revalidatePath('/');
    revalidatePath('/admin');
    revalidatePath('/analysis');

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('JSON Restore error:', error);
    return NextResponse.json({ error: message || 'Khôi phục thất bại.' }, { status: 500 });
  }
}
