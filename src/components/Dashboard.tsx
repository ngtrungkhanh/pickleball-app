'use client';
import { useState, useEffect, useMemo, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { BarChart3, ChevronRight, Crown, RefreshCw, Settings } from 'lucide-react';
import { SummaryGrid } from './dashboard/SummaryGrid';
import { Leaderboard } from './dashboard/Leaderboard';
import { RecentHistory } from './dashboard/RecentHistory';
import { ScoreForm } from './ScoreForm';
import { SettingsModal } from './SettingsModal';
import { useSharedAppData } from '@/lib/use-shared-app-data';
import { buildHallOfFameEntries, getLatestHallOfFameEntry, type HallOfFameEntry } from '@/lib/hall-of-fame';
import { getAvatarLetter } from '@/lib/utils';

type Player = { id: string; name: string; active?: boolean; [key: string]: unknown };
type Match = { id?: string; date?: string; season?: string; [key: string]: unknown };
type Season = { id: string; name: string; active?: boolean; start_date?: string };
const EDIT_EVENT = 'pickleball-edit-mode-change';
const DESKTOP_PANEL_WIDTH = 'mx-auto w-full lg:w-[85%]';

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
  const sharedData = useSharedAppData({
    initialPlayers,
    initialMatches,
    initialConfig,
    initialSeasons,
    routeKey: 'dashboard',
  });
  const players = (sharedData.players.length > 0 ? sharedData.players : initialPlayers) as Player[];
  const config = Object.keys(sharedData.config).length > 0 ? sharedData.config : initialConfig;
  const seasons = (sharedData.seasons.length > 0 ? sharedData.seasons : initialSeasons) as Season[];

  // Use local state for matches to ensure instant updates that persist 
  // until the server-side ISR revalidation completes in the background.
  const [matches, setMatches] = useState(initialMatches);
  
  // Sync state if shared route cache changes (e.g. after manifest detects fresh data).
  // Do not let an older shared cache wipe the optimistic TMP row after a local save.
  useEffect(() => {
    const nextMatches = sharedData.matches as Match[];
    queueMicrotask(() => {
      setMatches(prev => {
        const hasOptimistic = prev.some(m => String(m.id || '').startsWith('TMP-'));
        if (hasOptimistic && nextMatches.length < prev.length) return prev;
        return nextMatches;
      });
    });
  }, [sharedData.matches]);

  const addLocalMatch = (newMatch: Match) => {
    setMatches(prev => [newMatch, ...prev]);
  };
  const confirmLocalMatch = (tempId: string, match: Match) => {
    setMatches(prev => [match, ...prev.filter(m => m.id !== tempId && m.id !== match.id)]);
  };
  const rejectLocalMatch = (tempId: string) => {
    setMatches(prev => prev.filter(m => m.id !== tempId));
  };

  const [settingsOpen, setSettingsOpen] = useState(false);
  const canEdit = useSyncExternalStore(subscribeEditMode, getEditModeSnapshot, () => false);
  const canWrite = canEdit && !previewWritesBlocked;
  const activeSeason = config.active_season || 'Season 1';
  const [selectedSeason, setSelectedSeason] = useState<string | null>(activeSeason);
  const loseMoney = Number(config.lose_money || 5000);
  const viewedMatches = selectedSeason === null ? matches : matches.filter(m => (m.season || 'Season 1') === selectedSeason);
  const previousChampion = useMemo(() => {
    const entries = buildHallOfFameEntries(players, matches, seasons, activeSeason, loseMoney);
    return getLatestHallOfFameEntry(entries);
  }, [players, matches, seasons, activeSeason, loseMoney]);

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
      <div className={`${DESKTOP_PANEL_WIDTH} flex items-center justify-end gap-2`}>
        {sharedData.syncMessage && (
          <div className="mr-auto hidden sm:flex items-center gap-2 rounded-xl border border-slate-500/20 bg-[#142034]/80 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300/60">
            <RefreshCw className={`w-3.5 h-3.5 ${sharedData.syncState === 'syncing' ? 'animate-spin' : ''}`} />
            {sharedData.syncMessage}
          </div>
        )}
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
        <div className={`${DESKTOP_PANEL_WIDTH} rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-left text-xs font-bold text-amber-200`}>
          Dev preview đang dùng chung database với production nên các thao tác ghi/sửa/xóa đã bị khóa để bảo vệ data thật.
        </div>
      )}

      {previousChampion && (
        <div className={DESKTOP_PANEL_WIDTH}>
          <PreviousChampionBanner champion={previousChampion} />
        </div>
      )}

      {/* 1. Summary */}
      <div className={DESKTOP_PANEL_WIDTH}>
        <SummaryGrid players={players} matches={viewedMatches} loseMoney={loseMoney} />
      </div>

      {/* 2. Leaderboard */}
      <div className={DESKTOP_PANEL_WIDTH}>
        <Leaderboard
          players={players}
          matches={matches}
          seasons={seasons}
          activeSeason={activeSeason}
          selectedSeason={selectedSeason}
          onSeasonChange={setSelectedSeason}
          loseMoney={loseMoney}
        />
      </div>

      {/* 3. Score Form */}
      {canWrite && (
        <div className={DESKTOP_PANEL_WIDTH}>
          <div className="flex items-center gap-2.5 px-1 mb-3">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            <h3 className="font-black text-[10px] sm:text-xs uppercase tracking-[0.4em] text-slate-300/70">Ghi kết quả</h3>
          </div>
          <div className="relative z-30 rounded-2xl border border-slate-500/25 bg-[#142034]/95 overflow-visible">
            <ScoreForm
              players={players}
              onAddMatch={addLocalMatch}
              onConfirmMatch={confirmLocalMatch}
              onRejectMatch={rejectLocalMatch}
              activeSeason={activeSeason}
            />
          </div>
        </div>
      )}

      {/* 4. Recent History */}
      <div className={DESKTOP_PANEL_WIDTH}>
        <RecentHistory matches={viewedMatches} players={players} canEdit={canWrite} />
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        canEdit={canWrite}
        onUnlock={unlock}
        onLock={lock}
        players={players}
        seasons={seasons}
        config={config}
      />

    </div>
  );
}

function PreviousChampionBanner({ champion }: { champion: HallOfFameEntry }) {
  return (
    <Link
      href="/analysis?zone=hall"
      className="group relative flex min-h-[120px] overflow-hidden rounded-2xl border border-amber-300/20 bg-[#17243c]/95 px-4 py-3 shadow-[0_16px_48px_rgba(0,0,0,0.22)] transition-all hover:border-amber-200/40 hover:bg-[#1b2b48] sm:min-h-[112px] sm:items-center sm:px-5"
      aria-label={`Xem bảng vinh danh ${champion.season}`}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/55 to-transparent" />

      <div className="flex w-full items-center gap-4">
        <div className="relative h-[92px] w-[69px] shrink-0 overflow-hidden rounded-xl border border-amber-200/35 bg-slate-950/80 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] sm:h-[96px] sm:w-[72px]">
          <div className="absolute inset-1.5 rounded-lg border border-amber-100/15" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,rgba(251,191,36,0.18),transparent_40%),linear-gradient(145deg,rgba(251,191,36,0.12),rgba(15,23,42,0.05)_42%,rgba(255,255,255,0.06)_43%,rgba(15,23,42,0.50))]" />
          <div className="relative flex h-full items-center justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-amber-100/35 bg-amber-200/10 text-2xl font-black text-amber-100">
              {getAvatarLetter(champion.playerName)}
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-amber-200">
              <Crown className="h-3 w-3" />
              Nhà vô địch mùa trước
            </span>
            <span className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">{champion.season}</span>
          </div>
          <div className="truncate text-2xl font-black uppercase tracking-[0.05em] text-white sm:text-3xl">
            {champion.playerName}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-black uppercase tracking-[0.13em] text-white/45">
            <span>Tỉ lệ {Math.round(champion.winRate)}%</span>
            <span>{champion.wins}W-{champion.losses}L</span>
            <span className="hidden sm:inline">{champion.total} trận</span>
          </div>
        </div>

        <div className="hidden shrink-0 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/50 transition-colors group-hover:text-amber-100 md:flex">
          Vinh danh
          <ChevronRight className="h-4 w-4" />
        </div>
      </div>
    </Link>
  );
}
