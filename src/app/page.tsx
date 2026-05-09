// Task 15: ISR — trang tĩnh, chỉ rebuild khi có thao tác ghi/xóa
import { sql } from '@vercel/postgres';
import Dashboard from '@/components/Dashboard';
import { shouldBlockPreviewWrites } from '@/lib/environment';

export const revalidate = false; // Static by default, revalidated on demand via revalidatePath

type Player = { id: string; name: string; active?: boolean; [key: string]: unknown };
type Match = { id?: string; date?: string; season?: string; [key: string]: unknown };
type Season = { id: string; name: string; active?: boolean; start_date?: string };

export default async function HomePage() {
  try {
    if (shouldBlockPreviewWrites()) throw new Error('Preview writes disabled');

    await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`;
    await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS delete_group_id VARCHAR(80)`;
    await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`;
    await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS delete_group_id VARCHAR(80)`;
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
  const { rows: matches } = await sql`SELECT * FROM matches WHERE deleted_at IS NULL ORDER BY date DESC LIMIT 500`;
  const config: Record<string, string> = {};
  try {
    const { rows } = await sql`SELECT key, value FROM config`;
    rows.forEach((r) => { config[String(r.key)] = String(r.value); });
  } catch {}

  const activeSeason = config.active_season || 'Season 1';

  let seasons: Season[] = [{ id: activeSeason, name: activeSeason, active: true }];
  try {
    const { rows } = await sql`SELECT id, name, active, start_date FROM seasons WHERE archived = false ORDER BY start_date DESC`;
    if (rows.length > 0) seasons = rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      active: Boolean(r.active),
      start_date: r.start_date ? String(r.start_date) : undefined,
    }));
  } catch {}

  return (
    <div className="space-y-6 sm:space-y-12 animate-in fade-in duration-1000 max-w-[1400px] mx-auto">
      <div className="flex flex-col gap-6 items-center text-center">
        <h1 className="font-black tracking-tighter text-white drop-shadow-[0_0_30px_rgba(34,197,94,0.3)] leading-none text-5xl sm:text-7xl lg:text-[5rem] xl:text-[6rem]">
          Pickleball <span className="text-primary italic">Ranking</span>
        </h1>
        <Dashboard
          initialPlayers={players as Player[]}
          initialMatches={matches as Match[]}
          initialConfig={config}
          initialSeasons={seasons}
          previewWritesBlocked={shouldBlockPreviewWrites()}
        />
      </div>
    </div>
  );
}
