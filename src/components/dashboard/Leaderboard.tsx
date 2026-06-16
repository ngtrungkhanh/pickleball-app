'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Handshake, ShieldCheck, Skull, Sparkles, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { calculateLeaderboard, getPlayerAdvancedStats } from '@/lib/stats';
import { motion } from 'framer-motion';

const containerVariants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
    },
  },
};

const rowVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring' as const,
      damping: 25,
      stiffness: 220,
    },
  },
};

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
  lose_money?: number;
};

type PlayerSeasonSetting = {
  player_id: string;
  season: string;
  pay_fine: boolean;
};

type AdvancedStats = {
  recent?: string[];
  formComment?: string;
  formTrend?: string;
  bestPartner?: {
    name: string;
    label: string;
    rate: number;
    wins: number;
    total: number;
    note?: string;
  } | null;
  bestPartnerFallback?: DetailFallback;
  toughestRival?: {
    name: string;
    label: string;
    lossRate: number;
    losses: number;
    total: number;
    note?: string;
  } | null;
  toughestRivalFallback?: DetailFallback;
  easiestRival?: {
    name: string;
    label: string;
    winRate: number;
    wins: number;
    total: number;
    note?: string;
  } | null;
  easiestRivalFallback?: DetailFallback;
};

type DetailFallback = {
  main: string;
  metric: string;
  note: string;
};

const DETAIL_CLOSE_MS = 240;

function formatShortDate(value: unknown) {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatMoney(value: number) {
  return value.toLocaleString('vi-VN');
}

function RankBadge({ i }: { i: number }) {
  if (i === 0) {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-amber-400/35 bg-amber-400/10 text-amber-300">
        <Trophy className="h-4 w-4" />
      </span>
    );
  }
  return <span className="text-[14px] font-black text-slate-300/75 tabular-nums">#{i + 1}</span>;
}

function WinRatePill({ rate }: { rate: number }) {
  const color = rate >= 60 ? '#22c55e' : rate >= 40 ? '#94a3b8' : '#f87171';

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="font-black text-[15px] tabular-nums leading-none" style={{ color }}>{rate}%</span>
      <div className="w-12 h-[2px] bg-white/[0.16] rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${rate}%`, background: color, opacity: 0.75 }} />
      </div>
    </div>
  );
}

function DetailTitle({
  children,
  icon,
  className,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-center gap-1.5 font-black uppercase tracking-widest text-[11px] sm:text-xs', className)}>
      {icon}
      <span>{children}</span>
    </div>
  );
}

function DetailPanel({ adv, closing = false }: { adv: AdvancedStats; closing?: boolean }) {
  const recent = adv.recent?.length ? adv.recent : [];
  const partnerFallback = adv.bestPartnerFallback || {
    main: 'Chưa có cặp ăn ý',
    metric: 'Đổi partner liên tục',
    note: 'Chờ thêm trận chung',
  };
  const toughFallback = adv.toughestRivalFallback || {
    main: 'Không ngán ai',
    metric: 'Chưa ai bắt nạt được',
    note: 'Tạm thời rất lì',
  };
  const easyFallback = adv.easiestRivalFallback || {
    main: 'Không kèo free',
    metric: 'Ai cũng phải đánh thật',
    note: 'Chưa có con mồi',
  };

  return (
    <div className={cn('leaderboard-detail-panel overflow-hidden bg-[#0f1b2e]/92', closing && 'leaderboard-detail-panel-out')}>
      <div className="px-3 py-3 sm:px-4 sm:py-4 border-t border-slate-500/20">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 items-stretch">
          <div className="min-w-0 rounded-2xl border border-slate-400/20 bg-white/[0.055] px-3 py-3 flex flex-col items-center justify-center text-center gap-2">
            <DetailTitle className="text-slate-300/90">Phong độ</DetailTitle>
            <div className="min-w-0 w-full text-sm sm:text-base font-black text-white leading-snug break-words">
              {adv.formComment || 'Đang duy trì ổn định.'}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {recent.length > 0 ? (
                recent.map((r: string, x: number) => (
                  <span
                    key={x}
                    className={cn(
                      'w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-black transition-opacity',
                      r === 'W' ? 'bg-green-500 text-black' : 'bg-red-500 text-white',
                      x === 0 && 'ring-2 ring-white/60 ring-offset-1 ring-offset-[#0f1b2e]',
                      x === 3 && 'opacity-80',
                      x >= 4 && 'opacity-70',
                    )}
                  >
                    {r}
                  </span>
                ))
              ) : (
                <span className="text-xs sm:text-sm font-bold text-white/45">Chưa đủ dữ liệu</span>
              )}
            </div>
            <div className="min-w-0 w-full text-xs font-extrabold text-slate-300/80 leading-snug break-words">
              {adv.formTrend || 'Chờ thêm trận'}
            </div>
          </div>

          <div className={cn(
            'min-w-0 rounded-2xl border px-3 py-3 flex flex-col items-center justify-center text-center gap-2',
            adv.bestPartner?.label === 'Cạ cứng'
              ? 'border-emerald-300/25 bg-emerald-400/[0.07]'
              : 'border-slate-400/20 bg-white/[0.055]',
          )}>
            <DetailTitle
              className={adv.bestPartner?.label === 'Cạ cứng' ? 'text-emerald-200/90' : 'text-slate-300/80'}
              icon={<Handshake className="h-3.5 w-3.5" />}
            >
              {adv.bestPartner?.label || 'Đối tác tin cậy'}
            </DetailTitle>
            {adv.bestPartner ? (
              <>
                <div className="min-w-0 w-full text-sm sm:text-base font-black text-white leading-snug break-words">
                  {adv.bestPartner.name}
                </div>
                <div className={cn(
                  'min-w-0 w-full text-xs font-extrabold leading-snug break-words',
                  adv.bestPartner.label === 'Cạ cứng' ? 'text-emerald-200' : 'text-primary/90',
                )}>
                  {Math.round(adv.bestPartner.rate)}% thắng • {adv.bestPartner.wins}/{adv.bestPartner.total}
                </div>
                <div className="min-w-0 w-full text-xs font-extrabold text-slate-300/80 leading-snug break-words">
                  {adv.bestPartner.note || 'Cặp này khá ổn'}
                </div>
              </>
            ) : (
              <>
                <div className="min-w-0 w-full text-sm sm:text-base font-black text-white/60 leading-snug break-words">{partnerFallback.main}</div>
                <div className="min-w-0 w-full text-xs font-bold text-slate-300/75 leading-snug break-words">{partnerFallback.metric}</div>
                <div className="min-w-0 w-full text-xs font-extrabold text-slate-300/70 leading-snug break-words">{partnerFallback.note}</div>
              </>
            )}
          </div>

          <div className="min-w-0 rounded-2xl border border-red-400/25 bg-red-400/[0.06] px-3 py-3 flex flex-col items-center justify-center text-center gap-2">
            <DetailTitle className="text-red-300" icon={<Skull className="h-3.5 w-3.5" />}>
              {adv.toughestRival?.label || 'Kèo khó'}
            </DetailTitle>
            {adv.toughestRival ? (
              <>
                <div className="min-w-0 w-full text-sm sm:text-base font-black text-white leading-snug break-words">
                  Gặp {adv.toughestRival.name}
                </div>
                <div className="min-w-0 w-full text-xs font-extrabold text-red-200/90 leading-snug break-words">
                  {Math.round(adv.toughestRival.lossRate)}% thua • {adv.toughestRival.losses}/{adv.toughestRival.total}
                </div>
                <div className="min-w-0 w-full text-xs font-extrabold text-slate-300/80 leading-snug break-words">
                  {adv.toughestRival.note || 'Kèo này hơi mệt'}
                </div>
              </>
            ) : (
              <>
                <div className="min-w-0 w-full text-sm sm:text-base font-black text-white/60 leading-snug break-words">{toughFallback.main}</div>
                <div className="min-w-0 w-full text-xs font-bold text-slate-300/75 leading-snug break-words">{toughFallback.metric}</div>
                <div className="min-w-0 w-full text-xs font-extrabold text-slate-300/70 leading-snug break-words">{toughFallback.note}</div>
              </>
            )}
          </div>

          <div className="min-w-0 rounded-2xl border border-sky-400/25 bg-sky-400/[0.06] px-3 py-3 flex flex-col items-center justify-center text-center gap-2">
            <DetailTitle className="text-sky-300" icon={<ShieldCheck className="h-3.5 w-3.5" />}>
              {adv.easiestRival?.label || 'Kèo dễ'}
            </DetailTitle>
            {adv.easiestRival ? (
              <>
                <div className="min-w-0 w-full text-sm sm:text-base font-black text-white leading-snug break-words">
                  Gặp {adv.easiestRival.name}
                </div>
                <div className="min-w-0 w-full text-xs font-extrabold text-sky-100/90 leading-snug break-words">
                  {Math.round(adv.easiestRival.winRate)}% thắng • {adv.easiestRival.wins}/{adv.easiestRival.total}
                </div>
                <div className="min-w-0 w-full text-xs font-extrabold text-slate-300/80 leading-snug break-words">
                  {adv.easiestRival.note || 'Cửa sáng hơn chút'}
                </div>
              </>
            ) : (
              <>
                <div className="min-w-0 w-full text-sm sm:text-base font-black text-white/60 leading-snug break-words">{easyFallback.main}</div>
                <div className="min-w-0 w-full text-xs font-bold text-slate-300/75 leading-snug break-words">{easyFallback.metric}</div>
                <div className="min-w-0 w-full text-xs font-extrabold text-slate-300/70 leading-snug break-words">{easyFallback.note}</div>
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
  seasons: seasonList = [],
  activeSeason = 'Season 1',
  selectedSeason,
  onSeasonChange,
  loseMoney = 5000,
  playerSeasonSettings = [],
  showSeasonHeader = true,
}: {
  players: Player[];
  matches: Match[];
  seasons?: Season[];
  activeSeason?: string;
  selectedSeason?: string | null;
  onSeasonChange?: (season: string | null) => void;
  loseMoney?: number;
  playerSeasonSettings?: PlayerSeasonSetting[];
  showSeasonHeader?: boolean;
}) {
  const currentSeason = selectedSeason === undefined ? activeSeason : selectedSeason;
  const [seasonOpen, setSeasonOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [closingIds, setClosingIds] = useState<Set<string>>(() => new Set());
  const closeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setSeasonOpen(false);
    };
    if (seasonOpen) document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [seasonOpen]);

  useEffect(() => {
    const closeTimers = closeTimersRef.current;
    return () => {
      closeTimers.forEach(timer => clearTimeout(timer));
      closeTimers.clear();
    };
  }, []);

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

  const setCurrentSeason = (season: string | null) => onSeasonChange?.(season);
  const filtered = currentSeason === null ? matches : matches.filter(m => (m.season || 'Season 1') === currentSeason);

  const seasonFineByName = useMemo(() => new Map(
    seasonList.map(s => [s.name, typeof s.lose_money === 'number' ? s.lose_money : loseMoney])
  ), [seasonList, loseMoney]);

  const playerFineBySeason = useMemo(() => new Map(
    playerSeasonSettings.map(s => [`${s.player_id}:${s.season}`, s.pay_fine !== false])
  ), [playerSeasonSettings]);

  const playerFineById = useMemo(() => new Map(
    players.map(p => [p.id, p.pay_fine !== false])
  ), [players]);
  
  const seasonStartText = filtered.length
    ? formatShortDate(
      filtered.reduce((oldest, match) => (
        new Date(String(match.date)).getTime() < new Date(String(oldest.date)).getTime() ? match : oldest
      ), filtered[0]).date
    )
    : null;

  // Task 18: Use pre-calculated stats for active season, calculate from raw matches for history
  const board = calculateLeaderboard(players, filtered, loseMoney, {
    getLoseMoney: (match) => seasonFineByName.get(String(match.season || 'Season 1')) ?? loseMoney,
    shouldPayFine: (playerId, match) => {
      const season = String(match.season || 'Season 1');
      return playerFineBySeason.get(`${playerId}:${season}`) ?? playerFineById.get(playerId) ?? true;
    },
  })
    .filter(p => p.active !== false && p.id !== '__GUEST__')
    .slice(0, 20);

  const stopClosing = (id: string) => {
    const timer = closeTimersRef.current.get(id);
    if (timer) clearTimeout(timer);
    closeTimersRef.current.delete(id);

    setClosingIds(current => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  };

  const startClosing = (id: string) => {
    stopClosing(id);

    setClosingIds(current => {
      const next = new Set(current);
      next.add(id);
      return next;
    });

    const timer = setTimeout(() => {
      setClosingIds(current => {
        if (!current.has(id)) return current;
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      closeTimersRef.current.delete(id);
    }, DETAIL_CLOSE_MS);
    closeTimersRef.current.set(id, timer);
  };

  const toggle = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      startClosing(id);
      return;
    }

    if (expandedId) startClosing(expandedId);
    stopClosing(id);
    setExpandedId(id);
  };

  return (
    <div className={cn(
      "w-full rounded-2xl sm:rounded-[2rem] border border-slate-400/25 bg-[#192844]/95 shadow-[0_24px_70px_rgba(0,0,0,0.30)] backdrop-blur-2xl",
      showSeasonHeader ? "overflow-visible" : "overflow-hidden",
    )}>
      {showSeasonHeader && (
      <div className="flex items-center justify-center px-4 sm:px-6 py-5 sm:py-6 border-b border-slate-400/25">
        <div className="relative flex flex-col items-center" ref={dropRef}>
          <button
            onClick={() => setSeasonOpen(p => !p)}
            className="group flex flex-col items-center gap-1.5 rounded-2xl px-4 py-2 transition-all hover:bg-white/[0.04] active:scale-95"
          >
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-primary opacity-50 group-hover:opacity-100 transition-opacity" />
              <h2 className="text-xl sm:text-2xl 2xl:text-3xl font-black text-white uppercase tracking-[0.22em] sm:tracking-[0.28em] leading-none">
                {currentSeason ?? 'Tổng hợp'}
              </h2>
              <Sparkles className="w-4 h-4 text-primary opacity-50 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="text-[10px] sm:text-xs font-bold text-slate-300/80 tracking-widest leading-none">
              {seasonStartText ? `Khởi tranh ${seasonStartText}` : 'Chưa có dữ liệu'}
            </div>
            <div className="h-0.5 w-8 bg-primary/45 rounded-full transition-all group-hover:w-16 group-hover:bg-primary/80" />
          </button>

          {seasonOpen && (
            <div className="absolute top-full mt-3 z-[100] w-64 rounded-2xl border border-slate-400/30 bg-[#18263d] shadow-[0_26px_80px_rgba(0,0,0,0.42)] overflow-hidden origin-top animate-in fade-in zoom-in-95 duration-200">
              <div className="border-b border-slate-400/20 px-4 py-3 text-center text-[10px] font-black uppercase tracking-[0.24em] text-slate-300/80">
                Chọn season
              </div>
              <div className="p-2">
                <button
                  onClick={() => { setCurrentSeason(null); setSeasonOpen(false); }}
                  className={cn('w-full text-center px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all mb-1', currentSeason === null ? 'text-black bg-primary shadow-lg shadow-primary/20' : 'text-slate-300/85 hover:text-white hover:bg-white/[0.10]')}
                >
                  Tổng hợp
                </button>
                {seasons.map(s => (
                  <button
                    key={s}
                    onClick={() => { setCurrentSeason(s); setSeasonOpen(false); }}
                    className={cn('w-full text-center px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all', currentSeason === s ? 'text-black bg-primary shadow-lg shadow-primary/20' : 'text-slate-300/85 hover:text-white hover:bg-white/[0.10]')}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      <div className="hidden sm:block">
        <table className="w-full border-separate border-spacing-0" style={{ tableLayout: 'fixed' }}>
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
            <tr className="bg-slate-950/90 backdrop-blur">
              <th className="py-3 px-4 text-center text-xs 2xl:text-sm font-black uppercase tracking-widest text-slate-300">#</th>
              <th className="py-3 px-4 text-left text-xs 2xl:text-sm font-black uppercase tracking-widest text-slate-300">Thành viên</th>
              <th className="py-3 px-4 text-center text-xs 2xl:text-sm font-black uppercase tracking-widest text-slate-300">Trận</th>
              <th className="py-3 px-4 text-center text-xs 2xl:text-sm font-black uppercase tracking-widest text-green-300">W</th>
              <th className="py-3 px-4 text-center text-xs 2xl:text-sm font-black uppercase tracking-widest text-red-300">L</th>
              <th className="py-3 px-4 text-center text-xs 2xl:text-sm font-black uppercase tracking-widest text-primary">Tỉ lệ</th>
              <th className="py-3 px-4 text-right text-xs 2xl:text-sm font-black uppercase tracking-widest text-amber-300 pr-8">Phạt</th>
            </tr>
          </thead>
          <motion.tbody
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            key={currentSeason ?? 'all'}
          >
            {board.map((p, i) => {
              const exp = expandedId === p.id;
              const closing = closingIds.has(p.id);
              const showDetail = exp || closing;
              const adv = getPlayerAdvancedStats(p.id, filtered, players);
              const rate = Math.round(p.winRate);

              return (
                <React.Fragment key={p.id}>
                  <motion.tr
                    variants={rowVariants}
                    onClick={() => toggle(p.id)}
                    className={cn(
                      'border-t border-slate-500/18 cursor-pointer transition-all group',
                      exp || closing 
                        ? 'bg-emerald-400/[0.075]' 
                        : i === 0 
                          ? 'rank-1-row shimmer-row' 
                          : 'bg-[#17243a]/55 hover:bg-slate-700/65',
                    )}
                  >
                    <td className="py-3 px-4 text-center"><RankBadge i={i} /></td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <span className={cn('font-black text-base 2xl:text-lg truncate transition-all', i === 0 ? 'text-amber-400' : exp ? 'text-primary' : 'text-white group-hover:text-white')}>
                          {p.name}
                        </span>
                        <div className={cn('w-1.5 h-1.5 rounded-full bg-primary opacity-0 transition-all scale-0', (exp || closing) && 'opacity-100 scale-100')} />
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center font-black text-base 2xl:text-lg text-slate-100 tabular-nums">{p.total}</td>
                    <td className="py-3 px-4 text-center font-black text-base 2xl:text-lg text-green-300 tabular-nums">{p.wins}</td>
                    <td className="py-3 px-4 text-center font-black text-base 2xl:text-lg text-red-300/95 tabular-nums">{p.losses}</td>
                    <td className="py-3 px-4 text-center"><WinRatePill rate={rate} /></td>
                    <td className="py-3 px-4 text-right pr-8 font-black text-lg text-amber-400 tabular-nums">
                      {formatMoney(p.money)}
                    </td>
                  </motion.tr>
                  {showDetail && (
                    <tr key={`${p.id}-detail`} className="bg-[#101c2f]">
                      <td colSpan={7} className="p-0 border-t border-slate-500/20">
                        <DetailPanel adv={adv} closing={closing} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </motion.tbody>
        </table>
      </div>

      <motion.div 
        className="sm:hidden"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        key={(currentSeason ?? 'all') + '-mobile'}
      >
        {board.map((p, i) => {
          const exp = expandedId === p.id;
          const closing = closingIds.has(p.id);
          const showDetail = exp || closing;
          const adv = getPlayerAdvancedStats(p.id, filtered, players);
          const rate = Math.round(p.winRate);
          const rateColor = rate >= 60 ? '#22c55e' : rate >= 40 ? '#94a3b8' : '#f87171';

          return (
            <motion.div 
              variants={rowVariants}
              key={p.id} 
              className="border-t border-slate-500/20 first:border-t-0"
            >
              <button
                onClick={() => toggle(p.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-4 text-left transition-all',
                  exp || closing 
                    ? 'bg-primary/[0.09]' 
                    : i === 0 
                      ? 'bg-gradient-to-r from-amber-400/[0.06] to-transparent shimmer-row' 
                      : 'active:bg-white/[0.05]'
                )}
              >
                <div className="w-8 shrink-0 flex justify-center"><RankBadge i={i} /></div>
                <div className="flex-1 min-w-0">
                  <div className={cn('font-black text-lg truncate mb-1', exp ? 'text-primary' : 'text-white/90')}>
                    {p.name}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                    <span className="text-slate-300/65">{p.total}T</span>
                    <span className="text-green-300/75">{p.wins}W</span>
                    <span className="text-red-300/75">{p.losses}L</span>
                  </div>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <span className="font-black text-xl tabular-nums leading-none" style={{ color: rateColor }}>{rate}%</span>
                  <span className="text-xs font-black text-amber-400/90">{formatMoney(p.money)}</span>
                </div>
              </button>
              {showDetail && <DetailPanel adv={adv} closing={closing} />}
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
