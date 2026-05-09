import { sql } from '@vercel/postgres';
import Link from 'next/link';
import { ArrowLeft, Clock, Calendar } from 'lucide-react';
import { DeleteMatchButton } from '@/components/DeleteMatchButton';
import { shouldBlockPreviewWrites } from '@/lib/environment';

export const revalidate = 0;

export default async function HistoryPage() {
  const previewWritesBlocked = shouldBlockPreviewWrites();

  try {
    if (previewWritesBlocked) throw new Error('Preview writes disabled');

    await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`;
    await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`;
  } catch {}

  const { rows: players } = await sql`SELECT * FROM players WHERE deleted_at IS NULL ORDER BY name ASC`;
  const { rows: matches } = await sql`SELECT * FROM matches WHERE deleted_at IS NULL ORDER BY date DESC`;

  const getName = (id: string) => players.find((p: any) => p.id === id)?.name || id;

  const grouped: Record<string, typeof matches> = {};
  matches.forEach((m: any) => {
    const season = m.season || 'Season 1';
    if (!grouped[season]) grouped[season] = [];
    grouped[season].push(m);
  });

  return (
    <div className="max-w-[1000px] mx-auto px-4 pb-20 space-y-8 animate-in fade-in duration-700">
      {/* Back header */}
      <div className="flex items-center gap-4 pt-2">
        <Link
          href="/"
          className="flex items-center gap-2 text-white/40 hover:text-white transition-colors font-black text-sm uppercase tracking-widest group"
        >
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          Quay lại
        </Link>
        <span className="text-white/10">|</span>
        <h1 className="font-black text-2xl sm:text-4xl tracking-tighter text-white/90">
          Toàn bộ lịch sử
          <span className="ml-4 text-sm font-black text-white/20 uppercase tracking-widest align-middle">
            {matches.length} trận
          </span>
        </h1>
      </div>

      {Object.entries(grouped).map(([season, seasonMatches]) => (
        <div key={season} className="space-y-4">
          <div className="flex items-center gap-4">
            <span className="font-black text-xs uppercase tracking-[0.4em] text-primary/60 px-3 py-1.5 bg-primary/10 rounded-full">
              {season}
            </span>
            <span className="text-white/20 font-bold text-sm">{seasonMatches.length} trận</span>
          </div>

          <div className="grid gap-3">
            {seasonMatches.map((m: any) => {
              const date = new Date(m.date);
              const timeText = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
              const dateText = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' });

              return (
                <div key={m.id} className="glass rounded-2xl border border-white/5 overflow-hidden hover:border-white/10 transition-all">
                  {/* Meta bar */}
                  <div className="bg-white/[0.02] px-5 py-2.5 border-b border-white/[0.04] flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/30">
                      <Calendar className="w-3.5 h-3.5" /> {dateText}
                      <span className="text-white/10 mx-1">•</span>
                      <Clock className="w-3.5 h-3.5" /> {timeText}
                    </span>
                    {!previewWritesBlocked && <DeleteMatchButton matchId={m.id} />}
                  </div>

                  {/* Match row */}
                  <div className="px-5 py-4 grid grid-cols-12 items-center gap-3">
                    <div className="col-span-5 flex flex-col gap-1 text-right">
                      <span className="text-sm sm:text-base font-black text-white/90 truncate">{getName(m.win_1)}</span>
                      {m.win_2 && <span className="text-sm sm:text-base font-black text-white/90 truncate">{getName(m.win_2)}</span>}
                    </div>
                    <div className="col-span-2 flex items-center justify-center">
                      <div className="bg-primary/10 border border-primary/20 text-primary px-3 py-1.5 rounded-xl font-black text-base sm:text-lg tracking-tighter whitespace-nowrap">
                        {m.win_score}–{m.lose_score}
                      </div>
                    </div>
                    <div className="col-span-5 flex flex-col gap-1 text-left">
                      <span className="text-sm sm:text-base font-black text-white/90 truncate">{getName(m.lose_1)}</span>
                      {m.lose_2 && <span className="text-sm sm:text-base font-black text-white/90 truncate">{getName(m.lose_2)}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {matches.length === 0 && (
        <div className="glass p-20 rounded-[2.5rem] text-center border border-white/5">
          <p className="text-white/20 font-black uppercase tracking-[0.4em] text-sm">Chưa có trận đấu nào</p>
        </div>
      )}
    </div>
  );
}
