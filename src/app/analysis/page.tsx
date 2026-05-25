import { sql } from '@vercel/postgres';
import { AnalysisCenter } from '@/components/analysis/AnalysisCenter';
import { shouldBlockPreviewWrites } from '@/lib/environment';

export const revalidate = false; // ISR - Chỉ revalidate khi có action ghi dữ liệu

type Player = { id: string; name: string; active?: boolean };
type Match = {
  id?: string;
  date?: string;
  win_1?: string;
  win_2?: string | null;
  lose_1?: string;
  lose_2?: string | null;
  win_score?: number;
  lose_score?: number;
  season?: string;
};
type Season = {
  id: string;
  name: string;
  active?: boolean;
  start_date?: string;
  champion_image_url?: string | null;
  champion_image_path?: string | null;
  champion_image_updated_at?: string | null;
};

export default async function AnalysisPage() {
  try {
    if (shouldBlockPreviewWrites()) throw new Error('Preview writes disabled');

    await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`;
    await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS delete_group_id VARCHAR(80)`;
    await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`;
    await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS delete_group_id VARCHAR(80)`;
    await sql`ALTER TABLE seasons ADD COLUMN IF NOT EXISTS champion_image_url TEXT`;
    await sql`ALTER TABLE seasons ADD COLUMN IF NOT EXISTS champion_image_path TEXT`;
    await sql`ALTER TABLE seasons ADD COLUMN IF NOT EXISTS champion_image_updated_at TIMESTAMP`;
    await sql`
      INSERT INTO players (id, name, active)
      VALUES ('__GUEST__', 'Khách', true)
      ON CONFLICT (id) DO UPDATE SET name = 'Khách', deleted_at = NULL
    `;
    const { rows: oldGuests } = await sql`
      SELECT id FROM players
      WHERE lower(name) IN ('khách mời', 'khach moi', 'guest')
        AND id <> '__GUEST__'
    `;
    for (const row of oldGuests) {
      const oldId = String(row.id);
      await sql`UPDATE matches SET win_1 = '__GUEST__' WHERE win_1 = ${oldId}`;
      await sql`UPDATE matches SET win_2 = '__GUEST__' WHERE win_2 = ${oldId}`;
      await sql`UPDATE matches SET lose_1 = '__GUEST__' WHERE lose_1 = ${oldId}`;
      await sql`UPDATE matches SET lose_2 = '__GUEST__' WHERE lose_2 = ${oldId}`;
      await sql`DELETE FROM players WHERE id = ${oldId}`;
    }
  } catch {}

  const { rows: players } = await sql`SELECT * FROM players WHERE deleted_at IS NULL ORDER BY active DESC, name ASC`;
  const { rows: matches } = await sql`SELECT * FROM matches WHERE deleted_at IS NULL ORDER BY date DESC`;
  const { rows: configRows } = await sql`SELECT * FROM config`;
  let seasons: Season[] = [];
  try {
    const { rows } = await sql`SELECT id, name, active, start_date, champion_image_url, champion_image_path, champion_image_updated_at FROM seasons WHERE archived = false ORDER BY start_date DESC`;
    seasons = rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      active: Boolean(r.active),
      start_date: r.start_date ? String(r.start_date) : undefined,
      champion_image_url: r.champion_image_url ? String(r.champion_image_url) : null,
      champion_image_path: r.champion_image_path ? String(r.champion_image_path) : null,
      champion_image_updated_at: r.champion_image_updated_at ? String(r.champion_image_updated_at) : null,
    }));
  } catch {}
  
  const config: Record<string, string> = {};
  configRows.forEach(row => { config[row.key] = row.value; });
  const loseMoney = Number(config.lose_money || 5000);

  return <AnalysisCenter players={players as Player[]} matches={matches as Match[]} seasons={seasons} config={config} loseMoney={loseMoney} activeSeason={config.active_season || 'Season 1'} />;
}
