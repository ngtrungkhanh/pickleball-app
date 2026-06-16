import { Banknote, Calendar, Hash, Zap } from 'lucide-react';
import { getSeasonSummaryStats } from '@/lib/stats';
import type { FinePlayer, FinePlayerSeasonSetting, FineSeason } from '@/lib/fines';

type SummaryGridProps = {
  players: FinePlayer[];
  matches: Array<Record<string, unknown>>;
  loseMoney?: number;
  seasons?: FineSeason[];
  playerSeasonSettings?: FinePlayerSeasonSetting[];
  compact?: boolean;
};

function formatCompactMoney(value: number) {
  if (Math.abs(value) >= 1000) return `${Math.round(value / 1000)}k`;
  return value.toLocaleString('vi-VN');
}

export function SummaryGrid({
  players,
  matches,
  loseMoney = 5000,
  seasons = [],
  playerSeasonSettings = [],
  compact = false,
}: SummaryGridProps) {
  const s = getSeasonSummaryStats(matches, loseMoney, {
    players,
    seasons,
    playerSeasonSettings,
    fallbackLoseMoney: loseMoney,
  });

  const cards = [
    { Icon: Calendar, color: '#60a5fa', label: 'Thời gian', big: `${s.seasonDays}`, unit: 'ngày' },
    { Icon: Hash, color: '#22c55e', label: 'Tổng trận', big: `${s.totalMatches}`, unit: 'trận' },
    {
      Icon: Banknote,
      color: '#f59e0b',
      label: 'Tiền phạt',
      big: formatCompactMoney(s.totalMoney),
      unit: '',
    },
    { Icon: Zap, color: '#a78bfa', label: 'Buổi trước', big: `${s.latestSessionMatches}`, unit: 'trận' },
  ];

  return (
    <div className={`grid grid-cols-2 ${compact ? '' : 'lg:grid-cols-4'} gap-2 sm:gap-3 w-full pt-1.5 pb-1`}>
      {cards.map(({ Icon, color, label, big, unit }, i) => (
        <div
          key={i}
          className={`relative group rounded-xl bg-[#192844]/95 border border-slate-400/25 px-3 py-3 ${compact ? '' : 'sm:px-4 sm:py-3'} shadow-[0_10px_28px_rgba(0,0,0,0.20)] hover-glow-card`}
        >
          <div
            className="absolute inset-0 opacity-[0.12] pointer-events-none transition-opacity group-hover:opacity-[0.18] rounded-xl overflow-hidden"
            style={{ background: `radial-gradient(circle at 50% 0%, ${color}, transparent 80%)` }}
          />

          <div className={`relative z-10 flex flex-col items-start justify-between gap-3 ${compact ? 'min-h-[72px]' : 'min-h-[82px] 3xl:min-h-[68px] 3xl:flex-row 3xl:items-center'}`}>
            <div className={`flex items-center gap-2 min-w-0 w-full ${compact ? '' : '3xl:w-auto'}`}>
              <div className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center bg-white/[0.08] border border-white/[0.12] transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6">
                <Icon className="w-3.5 h-3.5" style={{ color }} />
              </div>
              <span className={`min-w-0 truncate text-[10px] ${compact ? 'tracking-wide' : 'min-[380px]:text-xs sm:text-sm tracking-wide 3xl:tracking-widest'} font-black text-slate-300 uppercase`}>
                {label}
              </span>
            </div>

            <div className={`flex items-baseline justify-start gap-1.5 shrink-0 min-w-0 w-full ${compact ? '' : '3xl:justify-end 3xl:w-auto'}`}>
              <span className={`min-w-0 break-words ${compact ? 'text-2xl' : 'text-xl min-[380px]:text-2xl sm:text-3xl lg:text-3xl 2xl:text-4xl'} font-black text-white leading-none`}>
                {big}
              </span>
              {unit && (
                <span className={`${compact ? 'text-sm' : 'text-sm sm:text-base 2xl:text-lg'} font-extrabold text-slate-300 lowercase`}>
                  {unit}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
