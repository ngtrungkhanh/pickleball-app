'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { calculateLeaderboard, getPlayerAdvancedStats } from '@/lib/stats';

type Player = {
  id: string;
  name: string;
  active?: boolean;
  [key: string]: unknown;
};

type Match = {
  date?: unknown;
  season?: string;
  [key: string]: unknown;
};

type Season = {
  id?: string;
  name: string;
  active?: boolean;
  start_date?: string;
};

type AdvancedStats = {
  recent?: string[];
  formComment?: string;
  bestPartner?: {
    name: string;
    label: string;
    rate: number;
    wins: number;
    total: number;
  } | null;
  toughestRival?: {
    name: string;
    label: string;
    lossRate: number;
    losses: number;
    total: number;
  } | null;
};

function formatShortDate(value: unknown) {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function RankBadge({ i }: { i: number }) {
  if (i === 0) return <span className="text-xl leading-none">🥇</span>;
  return <span className="text-[14px] font-black text-white/35 tabular-nums">#{i + 1}</span>;
}

function WinRatePill({ rate }: { rate: number }) {
  const color = rate >= 60 ? '#22c55e' : rate >= 40 ? '#94a3b8' : '#f87171';

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="font-black text-[15px] tabular-nums leading-none" style={{ color }}>{rate}%</span>
      <div className="w-12 h-[2px] bg-white/[0.07] rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${rate}%`, background: color, opacity: 0.75 }} />
      </div>
    </div>
  );
}

function DetailPanel({ adv }: { adv: AdvancedStats }) {
  const recent = adv.recent?.length ? adv.recent : [];

  return (
    <div className="overflow-hidden bg-slate-950/60" style={{ animation: 'expandDown 0.2s ease-out' }}>
      <style>{`
        @keyframes expandDown {
          from { opacity: 0; max-height: 0; transform: translateY(-5px); }
          to { opacity: 1; max-height: 400px; transform: translateY(0); }
        }
      `}</style>
      <div className="px-4 sm:px-8 py-4 sm:py-5 border-t border-white/[0.05]">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 items-stretch">
          <div className="min-w-0 rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 py-4 flex flex-col items-center justify-center text-center gap-2.5">
            <div className="font-black text-white/40 uppercase tracking-widest text-xs sm:text-sm">Phong độ</div>
            <div className="min-w-0 w-full text-base sm:text-lg font-black text-white/90 leading-snug break-words">
              {adv.formComment || 'Đang duy trì ổn định.'}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {recent.length > 0 ? (
                recent.map((r: string, x: number) => (
                  <span
                    key={x}
                    className={cn(
                      'w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-black',
                      r === 'W' ? 'bg-green-500 text-black' : 'bg-red-500 text-white',
                    )}
                  >
                    {r}
                  </span>
                ))
              ) : (
                <span className="text-xs sm:text-sm font-bold text-white/45">Chưa đủ dữ liệu</span>
              )}
            </div>
          </div>

          <div className={cn(
            'min-w-0 rounded-xl border px-4 py-4 flex flex-col items-center justify-center text-center gap-2.5',
            adv.bestPartner?.label === 'Cạ cứng'
              ? 'border-emerald-300/20 bg-emerald-400/[0.06]'
              : 'border-white/[0.06] bg-white/[0.025]',
          )}>
            <div className={cn(
              'font-black uppercase tracking-widest text-xs sm:text-sm',
              adv.bestPartner?.label === 'Cạ cứng' ? 'text-emerald-200/80' : 'text-white/40',
            )}>
              {adv.bestPartner?.label === 'Cạ cứng' ? '🤝 Cạ cứng' : adv.bestPartner?.label || 'Đối tác tin cậy'}
            </div>
            {adv.bestPartner ? (
              <>
                <div className="min-w-0 w-full text-base sm:text-lg font-black text-white/90 leading-snug break-words">
                  {adv.bestPartner.name}
                </div>
                <div className={cn(
                  'min-w-0 w-full text-xs sm:text-sm font-extrabold leading-snug break-words',
                  adv.bestPartner.label === 'Cạ cứng' ? 'text-emerald-200' : 'text-primary/90',
                )}>
                  {Math.round(adv.bestPartner.rate)}% thắng • Thắng {adv.bestPartner.wins}/{adv.bestPartner.total} trận
                </div>
              </>
            ) : (
              <>
                <div className="text-base sm:text-lg font-black text-white/55">Chưa có cặp ăn ý</div>
                <div className="text-xs sm:text-sm font-bold text-white/35">Cần trên 50% thắng và ít nhất 5 trận chung</div>
              </>
            )}
          </div>

          <div className="min-w-0 rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 py-4 flex flex-col items-center justify-center text-center gap-2.5">
            <div className="font-black text-white/40 uppercase tracking-widest text-xs sm:text-sm">
              {adv.toughestRival?.label === 'Thiên địch' ? '☠ Thiên địch' : adv.toughestRival?.label || 'Kèo khó'}
            </div>
            {adv.toughestRival ? (
              <>
                <div className="min-w-0 w-full text-base sm:text-lg font-black text-white/90 leading-snug break-words">
                  Gặp {adv.toughestRival.name}
                </div>
                <div className="min-w-0 w-full text-xs sm:text-sm font-extrabold text-red-400/90 leading-snug break-words">
                  {Math.round(adv.toughestRival.lossRate)}% thua • Thua {adv.toughestRival.losses}/{adv.toughestRival.total} trận
                </div>
              </>
            ) : (
              <>
                <div className="text-base sm:text-lg font-black text-white/55">Chưa có đối thủ áp đảo</div>
                <div className="text-xs sm:text-sm font-bold text-white/35">Cần ít nhất 5 lần gặp</div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Leaderboard({
  players,
  matches,
  initialStats = [],
  seasons: seasonList = [],
  activeSeason = 'Season 1',
  loseMoney = 5000,
}: {
  players: Player[];
  matches: Match[];
  initialStats?: any[];
  seasons?: Season[];
  activeSeason?: string;
  loseMoney?: number;
}) {
  const [currentSeason, setCurrentSeason] = useState<string | null>(activeSeason);
  const [seasonOpen, setSeasonOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setSeasonOpen(false);
    };
    if (seasonOpen) document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [seasonOpen]);

  const seasons = Array.from(new Set([
    ...seasonList.map(s => s.name),
    activeSeason,
    ...matches.map(m => m.season || 'Season 1'),
  ].filter(Boolean)))
    .sort((a, b) => {
      const dateA = seasonList.find(s => s.name === a)?.start_date;
      const dateB = seasonList.find(s => s.name === b)?.start_date;
      if (dateA && dateB) return new Date(dateB).getTime() - new Date(dateA).getTime();
      return Number(b.replace(/\D/g, '')) - Number(a.replace(/\D/g, ''));
    });

  const filtered = currentSeason === null ? matches : matches.filter(m => (m.season || 'Season 1') === currentSeason);
  
  const seasonStartText = filtered.length
    ? formatShortDate(
      filtered.reduce((oldest, match) => (
        new Date(String(match.date)).getTime() < new Date(String(oldest.date)).getTime() ? match : oldest
      ), filtered[0]).date
    )
    : null;

  // Task 18: Use pre-calculated stats for active season, calculate from raw matches for history
  const isCurrentSeason = currentSeason === activeSeason;
  const board = calculateLeaderboard(players, filtered, loseMoney, isCurrentSeason ? initialStats : undefined)
    .filter(p => p.active !== false)
    .slice(0, 20);

  const toggle = (id: string) => setExpandedId(prev => prev === id ? null : id);

  return (
    <div className="w-full rounded-2xl sm:rounded-[2rem] border border-white/[0.08] bg-slate-900/90 shadow-2xl overflow-visible backdrop-blur-2xl">
      <div className="flex items-center justify-center px-4 sm:px-6 py-5 sm:py-6 border-b border-white/[0.08]">
        <div className="relative" ref={dropRef}>
          <button
            onClick={() => setSeasonOpen(p => !p)}
            className="group flex flex-col items-center gap-1.5 transition-all active:scale-95"
          >
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-primary opacity-40 group-hover:opacity-100 transition-opacity" />
              <h2 className="text-lg sm:text-xl font-black text-white uppercase tracking-[0.25em] sm:tracking-[0.3em] leading-none">
                {currentSeason ?? 'Tổng hợp'}
              </h2>
              <Sparkles className="w-4 h-4 text-primary opacity-40 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="text-[10px] sm:text-xs font-bold text-white/25 tracking-widest leading-none">
              {seasonStartText ? `Khởi tranh ${seasonStartText}` : 'Chưa có dữ liệu'}
            </div>
            <div className="h-0.5 w-8 bg-primary/20 rounded-full transition-all group-hover:w-16 group-hover:bg-primary/50" />
          </button>

          {seasonOpen && (
            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-3 z-[100] w-56 rounded-2xl border border-white/10 bg-slate-950 shadow-2xl overflow-hidden origin-top animate-in fade-in zoom-in-95 duration-200">
              <div className="p-1.5">
                <button
                  onClick={() => { setCurrentSeason(null); setSeasonOpen(false); }}
                  className={cn('w-full text-center px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all mb-1', currentSeason === null ? 'text-black bg-primary' : 'text-white/40 hover:bg-white/5')}
                >
                  Tổng hợp
                </button>
                {seasons.map(s => (
                  <button
                    key={s}
                    onClick={() => { setCurrentSeason(s); setSeasonOpen(false); }}
                    className={cn('w-full text-center px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all', currentSeason === s ? 'text-black bg-primary' : 'text-white/40 hover:bg-white/5')}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="hidden sm:block">
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '8%' }} />
            <col style={{ width: '32%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '15%' }} />
          </colgroup>
          <thead>
            <tr className="bg-white/[0.015]">
              <th className="py-4 px-4 text-center text-sm 2xl:text-base font-black uppercase tracking-widest text-white/35">#</th>
              <th className="py-4 px-4 text-left text-sm 2xl:text-base font-black uppercase tracking-widest text-white/35">Thành viên</th>
              <th className="py-4 px-4 text-center text-sm 2xl:text-base font-black uppercase tracking-widest text-white/35">Trận</th>
              <th className="py-4 px-4 text-center text-sm 2xl:text-base font-black uppercase tracking-widest text-green-400/55">W</th>
              <th className="py-4 px-4 text-center text-sm 2xl:text-base font-black uppercase tracking-widest text-red-400/55">L</th>
              <th className="py-4 px-4 text-center text-sm 2xl:text-base font-black uppercase tracking-widest text-primary/60">Tỉ lệ</th>
              <th className="py-4 px-4 text-right text-sm 2xl:text-base font-black uppercase tracking-widest text-amber-400/60 pr-8">Phạt</th>
            </tr>
          </thead>
          <tbody>
            {board.map((p, i) => {
              const exp = expandedId === p.id;
              const adv = getPlayerAdvancedStats(p.id, filtered, players);
              const rate = Math.round(p.winRate);

              return (
                <React.Fragment key={p.id}>
                  <tr
                    onClick={() => toggle(p.id)}
                    className={cn(
                      'border-t border-white/[0.03] cursor-pointer transition-all group',
                      exp ? 'bg-primary/[0.05]' : 'hover:bg-white/[0.02]',
                    )}
                  >
                    <td className="py-4 px-4 text-center"><RankBadge i={i} /></td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <span className={cn('font-black text-lg truncate transition-all', exp ? 'text-primary' : 'text-white/80 group-hover:text-white')}>
                          {p.name}
                        </span>
                        <div className={cn('w-1.5 h-1.5 rounded-full bg-primary opacity-0 transition-all scale-0', exp && 'opacity-100 scale-100')} />
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center font-black text-lg text-white/35 tabular-nums">{p.total}</td>
                    <td className="py-4 px-4 text-center font-black text-lg text-green-400/80 tabular-nums">{p.wins}</td>
                    <td className="py-4 px-4 text-center font-black text-lg text-red-400/70 tabular-nums">{p.losses}</td>
                    <td className="py-4 px-4 text-center"><WinRatePill rate={rate} /></td>
                    <td className="py-4 px-4 text-right pr-8 font-black text-xl text-amber-400 tabular-nums">
                      {p.money.toLocaleString('vi-VN')}
                    </td>
                  </tr>
                  {exp && (
                    <tr key={`${p.id}-detail`} className="bg-primary/[0.02]">
                      <td colSpan={7} className="p-0 border-t border-white/[0.05]">
                        <DetailPanel adv={adv} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="sm:hidden">
        {board.map((p, i) => {
          const exp = expandedId === p.id;
          const adv = getPlayerAdvancedStats(p.id, filtered, players);
          const rate = Math.round(p.winRate);
          const rateColor = rate >= 60 ? '#22c55e' : rate >= 40 ? '#94a3b8' : '#f87171';

          return (
            <div key={p.id} className="border-t border-white/[0.05] first:border-t-0">
              <button
                onClick={() => toggle(p.id)}
                className={cn('w-full flex items-center gap-3 px-4 py-4 text-left transition-all', exp ? 'bg-primary/[0.07]' : 'active:bg-white/[0.04]')}
              >
                <div className="w-8 shrink-0 flex justify-center"><RankBadge i={i} /></div>
                <div className="flex-1 min-w-0">
                  <div className={cn('font-black text-lg truncate mb-1', exp ? 'text-primary' : 'text-white/90')}>
                    {p.name}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                    <span className="text-white/25">{p.total}T</span>
                    <span className="text-green-400/50">{p.wins}W</span>
                    <span className="text-red-400/50">{p.losses}L</span>
                  </div>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <span className="font-black text-xl tabular-nums leading-none" style={{ color: rateColor }}>{rate}%</span>
                  <span className="text-xs font-black text-amber-400/80">{p.money.toLocaleString('vi-VN')}</span>
                </div>
              </button>
              {exp && <DetailPanel adv={adv} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
