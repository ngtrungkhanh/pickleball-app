// Task 15: ISR — trang tĩnh, chỉ rebuild khi có thao tác ghi/xóa
import { sql } from '@vercel/postgres';
import Dashboard from '@/components/Dashboard';

export const revalidate = false; // Static by default, revalidated on demand via revalidatePath

type Player = { id: string; name: string; active?: boolean; [key: string]: unknown };
type Match = { id?: string; date?: string; season?: string; [key: string]: unknown };
type Season = { id: string; name: string; active?: boolean; start_date?: string };

export default async function HomePage() {
  const { rows: players } = await sql`SELECT * FROM players ORDER BY active DESC, name ASC`;
  const { rows: matches } = await sql`SELECT * FROM matches ORDER BY date DESC LIMIT 50`;
  const config: Record<string, string> = {};
  try {
    const { rows } = await sql`SELECT key, value FROM config`;
    rows.forEach((r) => { config[String(r.key)] = String(r.value); });
  } catch {}

  const activeSeason = config.active_season || 'Season 1';

  // Task 18: Fetch pre-calculated stats for the active season
  let stats: any[] = [];
  try {
    const { rows } = await sql`SELECT * FROM player_stats WHERE season = ${activeSeason}`;
    stats = rows;
  } catch {}

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
          initialStats={stats}
          initialConfig={config}
          initialSeasons={seasons}
        />
      </div>
    </div>
  );
}
