import Link from 'next/link';
import { Crown } from 'lucide-react';
import { type HallOfFameEntry } from '@/lib/hall-of-fame';

export function PreviousChampionTitleLine({ champion }: { champion: HallOfFameEntry }) {
  return (
    <Link
      href="/analysis?zone=hall"
      className="group -mt-1 inline-flex max-w-full items-center justify-center gap-2 rounded-full px-2 text-center transition-colors hover:text-amber-100 sm:-mt-2"
      aria-label={`Xem bảng vinh danh ${champion.season}`}
    >
      <Crown className="h-4 w-4 shrink-0 text-amber-200/80 transition-colors group-hover:text-amber-100" />
      <span className="min-w-0 text-[10px] font-black uppercase tracking-[0.18em] text-amber-100/70 sm:text-xs sm:tracking-[0.24em]">
        <span className="hidden sm:inline">Nhà vô địch mùa trước · </span>
        <span className="text-amber-100">{champion.playerName}</span>
        <span className="text-amber-100/45"> · {champion.season}</span>
      </span>
    </Link>
  );
}
