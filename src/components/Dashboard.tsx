'use client';
import { useState, useEffect, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { BarChart3, Settings } from 'lucide-react';
import { SummaryGrid } from './dashboard/SummaryGrid';
import { Leaderboard } from './dashboard/Leaderboard';
import { RecentHistory } from './dashboard/RecentHistory';
import { ScoreForm } from './ScoreForm';
import { SettingsModal } from './SettingsModal';

type Player = { id: string; name: string; active?: boolean; [key: string]: unknown };
type Match = { id?: string; date?: string; season?: string; [key: string]: unknown };
type Season = { id: string; name: string; active?: boolean; start_date?: string };
const EDIT_EVENT = 'pickleball-edit-mode-change';

function subscribeEditMode(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(EDIT_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(EDIT_EVENT, callback);
  };
}

function getEditModeSnapshot() {
  return localStorage.getItem('pickleball_edit_unlocked') === 'true';
}

export default function Dashboard({
  initialPlayers,
  initialMatches,
  initialConfig = {},
  initialSeasons = [],
  previewWritesBlocked = false,
}: {
  initialPlayers: Player[],
  initialMatches: Match[],
  initialConfig?: Record<string, string>,
  initialSeasons?: Season[],
  previewWritesBlocked?: boolean,
}) {
  // Use local state for matches to ensure instant updates that persist 
  // until the server-side ISR revalidation completes in the background.
  const [matches, setMatches] = useState(initialMatches);
  
  // Sync state if initialMatches changes (e.g. after a background revalidation)
  useEffect(() => {
    queueMicrotask(() => setMatches(initialMatches));
  }, [initialMatches]);

  const addLocalMatch = (newMatch: Match) => {
    setMatches(prev => [newMatch, ...prev]);
  };

  const [settingsOpen, setSettingsOpen] = useState(false);
  const canEdit = useSyncExternalStore(subscribeEditMode, getEditModeSnapshot, () => false);
  const canWrite = canEdit && !previewWritesBlocked;
  const activeSeason = initialConfig.active_season || 'Season 1';
  const [selectedSeason, setSelectedSeason] = useState<string | null>(activeSeason);
  const loseMoney = Number(initialConfig.lose_money || 5000);
  const viewedMatches = selectedSeason === null ? matches : matches.filter(m => (m.season || 'Season 1') === selectedSeason);

  const unlock = (password: string) => {
    const expected = process.env.NEXT_PUBLIC_EDIT_PASS || 'pickleball';
    const ok = password === expected;
    if (ok) {
      localStorage.setItem('pickleball_edit_unlocked', 'true');
      window.dispatchEvent(new Event(EDIT_EVENT));
    }
    return ok;
  };

  const lock = () => {
    localStorage.removeItem('pickleball_edit_unlocked');
    window.dispatchEvent(new Event(EDIT_EVENT));
  };

  return (
    <div className="space-y-5 transition-all duration-500 w-full">
      <div className="flex items-center justify-end gap-2">
        <Link href="/analysis" className="inline-flex items-center gap-2 rounded-xl border border-slate-500/25 bg-[#142034]/90 px-3 py-2 text-xs font-black text-slate-300/85 hover:border-primary/40 hover:text-primary transition-colors">
          <BarChart3 className="w-4 h-4" />
          Trung tâm phân tích
        </Link>
        <button onClick={() => setSettingsOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-500/25 bg-[#142034]/90 px-3 py-2 text-xs font-black text-slate-300/85 hover:border-primary/40 hover:text-primary transition-colors">
          <Settings className="w-4 h-4" />
          Cài đặt
        </button>
      </div>

      {previewWritesBlocked && (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-left text-xs font-bold text-amber-200">
          Dev preview dang dung chung database voi production nen cac thao tac ghi/sua/xoa da bi khoa de bao ve data that.
        </div>
      )}

      {/* 1. Summary */}
      <SummaryGrid players={initialPlayers} matches={viewedMatches} loseMoney={loseMoney} />

      {/* 2. Leaderboard */}
      <Leaderboard
        players={initialPlayers}
        matches={matches}
        seasons={initialSeasons}
        activeSeason={activeSeason}
        selectedSeason={selectedSeason}
        onSeasonChange={setSelectedSeason}
        loseMoney={loseMoney}
      />

      {/* 3. Score Form */}
      {canWrite && (
        <div>
          <div className="flex items-center gap-2.5 px-1 mb-3">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            <h3 className="font-black text-[10px] sm:text-xs uppercase tracking-[0.4em] text-slate-300/70">Ghi kết quả</h3>
          </div>
          <div className="relative z-30 rounded-2xl border border-slate-500/25 bg-[#142034]/95 overflow-visible">
            <ScoreForm players={initialPlayers} onAddMatch={addLocalMatch} activeSeason={activeSeason} />
          </div>
        </div>
      )}

      {/* 4. Recent History */}
      <RecentHistory matches={viewedMatches} players={initialPlayers} canEdit={canWrite} />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        canEdit={canWrite}
        onUnlock={unlock}
        onLock={lock}
        players={initialPlayers}
        seasons={initialSeasons}
        config={initialConfig}
      />

    </div>
  );
}
