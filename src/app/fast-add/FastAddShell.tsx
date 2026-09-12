'use client';
import { ScoreForm } from '@/components/ScoreForm';
import { selectScorePlayers } from '@/lib/player-season-settings';
import { useSharedAppData } from '@/lib/use-shared-app-data';
import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Share, MoreVertical, PlusSquare } from 'lucide-react';

function subscribeBrowserSnapshot() {
  return () => {};
}

function getIsIOSSnapshot() {
  const ua = window.navigator.userAgent;
  const webkit = /WebKit/i.test(ua);
  const isIOSSafari = /iPad|iPhone/i.test(ua);
  return isIOSSafari && webkit && !/CriOS/i.test(ua);
}

function PwaInstallGuide() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const isIOS = useSyncExternalStore(subscribeBrowserSnapshot, getIsIOSSnapshot, () => false);

  useEffect(() => {
    // Capture install prompt on Android
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    }
  };

  return (
    <div className="mt-8 p-4 rounded-xl border border-primary/20 bg-primary/5 text-sm text-slate-300">
      <h3 className="font-bold text-primary mb-2 flex items-center gap-2">
        <PlusSquare className="w-4 h-4" /> 
        Lối tắt siêu tốc (App)
      </h3>
      
      {deferredPrompt ? (
        <button 
          onClick={handleInstallClick}
          className="w-full py-2 bg-primary text-black font-bold rounded-lg active:scale-95 transition-all"
        >
          Cài đặt App ra màn hình chính
        </button>
      ) : isIOS ? (
        <div className="space-y-2">
          <p>Trên iPhone/iPad (Safari):</p>
          <ol className="list-decimal pl-5 space-y-1 text-slate-400">
            <li>Bấm nút <b>Chia sẻ</b> <Share className="w-3 h-3 inline" /> ở dưới cùng.</li>
            <li>Chọn <b>Thêm vào MH chính (Add to Home Screen)</b>.</li>
          </ol>
        </div>
      ) : (
        <div className="space-y-2">
          <p>Trên Android (Chrome):</p>
          <ol className="list-decimal pl-5 space-y-1 text-slate-400">
            <li>Bấm nút <b>Menu</b> <MoreVertical className="w-3 h-3 inline" /> ở góc trên.</li>
            <li>Chọn <b>Thêm vào màn hình chính</b>.</li>
          </ol>
        </div>
      )}
    </div>
  );
}

export function FastAddShell({ previewWritesBlocked }: { previewWritesBlocked: boolean }) {
  const sharedData = useSharedAppData({
    initialPlayers: [],
    initialMatches: [],
    initialConfig: {},
    initialSeasons: [],
    initialPlayerSeasonSettings: [],
    routeKey: 'fast-add',
    syncParts: ['players', 'config', 'playerSeasonSettings'],
  });

  const activeSeason = sharedData.config.active_season || 'Season 1';
  const scorePlayers = selectScorePlayers(
    sharedData.players,
    activeSeason,
    sharedData.playerSeasonSettings,
  );

  if (!sharedData.cacheLoaded) {
    return <div className="text-center p-8">Đang tải dữ liệu...</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      {previewWritesBlocked ? (
        <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm font-bold text-amber-200">
          Preview đang khóa thao tác ghi để bảo vệ dữ liệu production.
        </div>
      ) : (
        <ScoreForm
          players={scorePlayers}
          activeSeason={activeSeason}
        />
      )}
      
      <PwaInstallGuide />

      <div className="text-center mt-4">
        <Link href="/" className="text-sm text-slate-400 hover:text-white underline">
          Quay lại Bảng xếp hạng
        </Link>
      </div>
    </div>
  );
}
