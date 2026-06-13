'use client';
import { ScoreForm } from '@/components/ScoreForm';
import { useSharedAppData } from '@/lib/use-shared-app-data';
import Link from 'next/link';

export function FastAddShell({ previewWritesBlocked }: { previewWritesBlocked: boolean }) {
  const sharedData = useSharedAppData({
    initialPlayers: [],
    initialMatches: [],
    initialConfig: {},
    initialSeasons: [],
    initialPlayerSeasonSettings: [],
    routeKey: 'fast-add',
  });

  const activeSeason = sharedData.config.active_season || 'Season 1';

  if (!sharedData.cacheLoaded) {
    return <div className="text-center p-8">Đang tải dữ liệu...</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <ScoreForm 
        players={sharedData.players}
        activeSeason={activeSeason}
        compact={true}
      />
      <div className="text-center mt-4">
        <Link href="/" className="text-sm text-slate-400 hover:text-white underline">
          Quay lại Bảng xếp hạng
        </Link>
      </div>
    </div>
  );
}
