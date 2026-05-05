'use client';
import { useOptimistic, useState, useSyncExternalStore } from 'react';
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
}: {
  initialPlayers: Player[],
  initialMatches: Match[],
  initialConfig?: Record<string, string>,
  initialSeasons?: Season[],
}) {
  // Use local state for matches to ensure instant updates that persist 
  // until the server-side ISR revalidation completes in the background.
  const [matches, setMatches] = useState(initialMatches);
  
  // Sync state if initialMatches changes (e.g. after a background revalidation)
  useEffect(() => {
    setMatches(initialMatches);
  }, [initialMatches]);

  const addLocalMatch = (newMatch: Match) => {
    setMatches(prev => [newMatch, ...prev]);
  };

  const [settingsOpen, setSettingsOpen] = useState(false);
  const canEdit = useSyncExternalStore(subscribeEditMode, getEditModeSnapshot, () => false);
  const activeSeason = initialConfig.active_season || 'Season 1';
  const loseMoney = Number(initialConfig.lose_money || 5000);

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
        <Link href="/analysis" className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-slate-900/80 px-3 py-2 text-xs font-black text-white/45 hover:text-primary transition-colors">
          <BarChart3 className="w-4 h-4" />
          Trung tâm phân tích
        </Link>
        <button onClick={() => setSettingsOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-slate-900/80 px-3 py-2 text-xs font-black text-white/45 hover:text-primary transition-colors">
          <Settings className="w-4 h-4" />
          Cài đặt
        </button>
      </div>

      {/* 1. Summary */}
      <SummaryGrid players={initialPlayers} matches={matches} loseMoney={loseMoney} />

      {/* 2. Leaderboard */}
      <Leaderboard
        key={activeSeason}
        players={initialPlayers}
        matches={matches}
        seasons={initialSeasons}
        activeSeason={activeSeason}
        loseMoney={loseMoney}
      />

      {/* 3. Score Form */}
      {canEdit && (
        <div>
          <div className="flex items-center gap-2.5 px-1 mb-3">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            <h3 className="font-black text-[10px] sm:text-xs uppercase tracking-[0.4em] text-white/25">Ghi kết quả</h3>
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-slate-900/80 overflow-hidden">
            <ScoreForm players={initialPlayers} onAddMatch={addLocalMatch} activeSeason={activeSeason} />
          </div>
        </div>
      )}

      {/* 4. Recent History */}
      <RecentHistory matches={matches} players={initialPlayers} canEdit={canEdit} />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        canEdit={canEdit}
        onUnlock={unlock}
        onLock={lock}
        players={initialPlayers}
        seasons={initialSeasons}
        config={initialConfig}
      />

    </div>
  );
}
