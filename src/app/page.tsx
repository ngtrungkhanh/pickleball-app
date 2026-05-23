// Task 15: ISR — trang tĩnh, chỉ rebuild khi có thao tác ghi/xóa
import { sql } from '@vercel/postgres';
import Link from 'next/link';
import Dashboard from '@/components/Dashboard';
import { shouldBlockPreviewWrites } from '@/lib/environment';
import { buildHallOfFameEntries, getLatestHallOfFameEntry, type HallOfFameEntry } from '@/lib/hall-of-fame';
import { getAvatarLetter } from '@/lib/utils';

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
  const { rows: matches } = await sql`SELECT * FROM matches WHERE deleted_at IS NULL ORDER BY date DESC`;
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

  const loseMoney = Number(config.lose_money || 5000);
  const previousChampion = getLatestHallOfFameEntry(
    buildHallOfFameEntries(players as Player[], matches as Match[], seasons, activeSeason, loseMoney)
  );

  return (
    <div className="space-y-6 sm:space-y-10 animate-in fade-in duration-1000 max-w-[1400px] mx-auto">
      <div className="relative flex flex-col gap-5 sm:gap-6 items-center text-center">
        {previousChampion && (
          <ChampionPlaqueDesktop champion={previousChampion} />
        )}
        <h1 className="font-black tracking-tighter text-white drop-shadow-[0_0_30px_rgba(34,197,94,0.3)] leading-none text-5xl sm:text-7xl lg:text-[5rem] xl:text-[6rem]">
          Pickleball <span className="text-primary italic">Ranking</span>
        </h1>
        <Dashboard
          initialPlayers={players as Player[]}
          initialMatches={matches as Match[]}
          initialConfig={config}
          initialSeasons={seasons}
          previousChampion={previousChampion}
          previewWritesBlocked={shouldBlockPreviewWrites()}
        />
      </div>
    </div>
  );
}

function ChampionPlaqueDesktop({ champion }: { champion: HallOfFameEntry }) {
  return (
    <Link
      href="/analysis?zone=hall"
      className="group absolute left-0 top-1 z-10 hidden w-[168px] rounded-2xl border border-amber-300/35 bg-[#17243c]/95 p-3 text-left shadow-[0_18px_52px_rgba(0,0,0,0.26)] transition-all hover:border-amber-200/65 hover:bg-[#1d2d4b] xl:block 2xl:w-[180px]"
      aria-label={`Xem bảng vinh danh ${champion.season}`}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/70 to-transparent" />
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="rounded-full border border-amber-300/35 bg-amber-300/12 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-amber-100">
          Mùa trước
        </span>
        <span className="truncate text-[9px] font-black uppercase tracking-[0.18em] text-white/40">{champion.season}</span>
      </div>

      <div className="relative mx-auto mb-3 h-[124px] w-[93px] overflow-hidden rounded-xl border border-amber-200/45 bg-slate-950/80 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] xl:h-[136px] xl:w-[102px]">
        <div className="absolute inset-1.5 rounded-lg border border-amber-100/15" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,rgba(251,191,36,0.24),transparent_42%),linear-gradient(145deg,rgba(251,191,36,0.16),rgba(15,23,42,0.05)_42%,rgba(255,255,255,0.08)_43%,rgba(15,23,42,0.50))]" />
        <div className="relative flex h-full items-center justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-amber-100/40 bg-amber-200/10 text-3xl font-black text-amber-100 shadow-[0_0_34px_rgba(251,191,36,0.16)]">
            {getAvatarLetter(champion.playerName)}
          </div>
        </div>
      </div>

      <div className="truncate text-base font-black uppercase leading-tight tracking-[0.04em] text-white">
        {champion.playerName}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[10px] font-black uppercase tracking-[0.1em] text-white/45">
        <span>{Math.round(champion.winRate)}%</span>
        <span>{champion.wins}W-{champion.losses}L</span>
      </div>
      <div className="mt-2 text-[9px] font-black uppercase tracking-[0.18em] text-amber-100/70 transition-colors group-hover:text-amber-100">
        Xem vinh danh
      </div>
    </Link>
  );
}
