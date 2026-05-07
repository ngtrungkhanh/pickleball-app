import { Banknote, Calendar, Hash, Zap } from 'lucide-react';
import { getSeasonSummaryStats } from '@/lib/stats';

type SummaryGridProps = {
  players: unknown[];
  matches: Array<Record<string, unknown>>;
  loseMoney?: number;
};

export function SummaryGrid({ matches, loseMoney = 5000 }: SummaryGridProps) {
  const s = getSeasonSummaryStats(matches, loseMoney);

  const cards = [
    { Icon: Calendar, color: '#60a5fa', label: 'Thời gian', big: `${s.seasonDays}`, unit: 'ngày' },
    { Icon: Hash, color: '#22c55e', label: 'Tổng trận', big: `${s.totalMatches}`, unit: 'trận' },
    {
      Icon: Banknote,
      color: '#f59e0b',
      label: 'Tiền phạt',
      big: s.totalMoney >= 1000 ? `${(s.totalMoney / 1000).toLocaleString('vi-VN')}k` : `${s.totalMoney}`,
      unit: '',
    },
    { Icon: Zap, color: '#a78bfa', label: 'Tuần này', big: `${s.matchesThisWeek}`, unit: 'trận' },
  ];

  return (
    <div className="grid grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-3 w-full">
      {cards.map(({ Icon, color, label, big, unit }, i) => (
        <div
          key={i}
          className="relative group overflow-hidden rounded-lg bg-[#142034]/95 border border-slate-500/25 px-3 py-2 sm:px-4 sm:py-3 shadow-[0_10px_28px_rgba(0,0,0,0.22)] transition-all hover:bg-[#18263d] hover:border-slate-400/35 hover:shadow-xl"
        >
          <div
            className="absolute inset-0 opacity-[0.12] pointer-events-none transition-opacity group-hover:opacity-[0.18]"
            style={{ background: `radial-gradient(circle at 50% 0%, ${color}, transparent 80%)` }}
          />

          <div className="relative z-10 min-h-11 sm:min-h-14 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center bg-white/[0.06] border border-white/[0.10]">
                <Icon className="w-3.5 h-3.5" style={{ color }} />
              </div>
              <span className="text-xs sm:text-sm font-black text-slate-300/85 uppercase tracking-wide sm:tracking-widest whitespace-nowrap">
                {label}
              </span>
            </div>

            <div className="flex items-baseline justify-center gap-1.5 shrink-0">
              <span className="text-2xl sm:text-3xl 2xl:text-4xl font-black text-white leading-none">
                {big}
              </span>
              {unit && (
                <span className="text-sm sm:text-base 2xl:text-lg font-extrabold text-slate-300/75 lowercase">
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
