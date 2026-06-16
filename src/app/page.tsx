import Dashboard from '@/components/Dashboard';
import { shouldBlockPreviewWrites } from '@/lib/environment';
import { Logo } from '@/components/Logo';

export const dynamic = 'force-static';

export default async function HomePage() {
  return (
    <div className="space-y-6 sm:space-y-10 animate-in fade-in duration-1000 max-w-[1400px] lg:max-w-none mx-auto">
      <div className="relative flex flex-col gap-5 sm:gap-6 items-center text-center">
        <div className="flex flex-col items-center gap-2 lg:hidden">
          <Logo className="w-16 h-16 sm:w-20 sm:h-20 text-primary drop-shadow-[0_0_25px_rgba(34,197,94,0.4)] animate-pulse-subtle" />
          <h1 className="font-black tracking-tighter text-white drop-shadow-[0_0_30px_rgba(34,197,94,0.3)] leading-none text-5xl sm:text-7xl">
            Pickleball <span className="text-primary italic">Ranking</span>
          </h1>
        </div>
        <Dashboard
          initialPlayers={[]}
          initialMatches={[]}
          initialConfig={{}}
          initialSeasons={[]}
          initialPlayerSeasonSettings={[]}
          previewWritesBlocked={shouldBlockPreviewWrites()}
        />
      </div>
    </div>
  );
}
