'use client';
import { useState, useEffect, useSyncExternalStore, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import { BarChart3, RefreshCw, Settings, X } from 'lucide-react';
import { SummaryGrid } from './dashboard/SummaryGrid';
import { Leaderboard } from './dashboard/Leaderboard';
import { RecentHistory } from './dashboard/RecentHistory';
import { ScoreForm } from './ScoreForm';
import { SettingsModal } from './SettingsModal';
import { useSharedAppData } from '@/lib/use-shared-app-data';
import { type StoredPlayerSeasonSetting } from '@/lib/db';
import { isGuestId } from '@/lib/guest';
import { buildAnalysisSnapshot } from '@/lib/analysis-core';
import { generateInsightSelectionResultFromSnapshot, type InsightSelectionState } from '@/lib/insights';
import { getGlobalSelectedSeason, setGlobalSelectedSeason } from '@/lib/season-state';

const INSIGHT_SELECTION_STATE_KEY = 'pickleball.analysis.insightSelection.v1';

function readInsightSelectionState(): InsightSelectionState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(INSIGHT_SELECTION_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as InsightSelectionState;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeInsightSelectionState(state: InsightSelectionState) {
  try {
    window.localStorage.setItem(INSIGHT_SELECTION_STATE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures; the feed can still render without persistence.
  }
}


type Player = { id: string; name: string; active?: boolean; [key: string]: unknown };
type Match = { id?: string; date?: string; season?: string; [key: string]: unknown };
type Season = {
  id: string;
  name: string;
  active?: boolean;
  start_date?: string;
  champion_image_url?: string | null;
  champion_image_path?: string | null;
  champion_image_updated_at?: string | null;
  lose_money?: number;
};
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
  initialPlayerSeasonSettings = [],
  previewWritesBlocked = false,
}: {
  initialPlayers: Player[],
  initialMatches: Match[],
  initialConfig?: Record<string, string>,
  initialSeasons?: Season[],
  initialPlayerSeasonSettings?: StoredPlayerSeasonSetting[],
  previewWritesBlocked?: boolean,
}) {
  const sharedData = useSharedAppData({
    initialPlayers,
    initialMatches,
    initialConfig,
    initialSeasons,
    initialPlayerSeasonSettings,
    routeKey: 'dashboard',
  });
  const players = (sharedData.players.length > 0 ? sharedData.players : initialPlayers) as Player[];
  const config = Object.keys(sharedData.config).length > 0 ? sharedData.config : initialConfig;
  const seasons = (sharedData.seasons.length > 0 ? sharedData.seasons : initialSeasons) as Season[];

  // Use local state for matches to ensure instant updates that persist 
  // until the server-side ISR revalidation completes in the background.
  const [matches, setMatches] = useState(initialMatches);

  // Ticker open/close state stored in sessionStorage
  const [tickerOpen, setTickerOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.sessionStorage.getItem('pickleball_ticker_closed') !== 'true';
    }
    return true;
  });

  const [insightSeed, setInsightSeed] = useState<number | null>(null);
  const [insightSelectionState, setInsightSelectionState] = useState<InsightSelectionState | null>(null);
  const committedInsightSeedRef = useRef<number | null>(null);

  useEffect(() => {
    const seedId = window.setTimeout(() => {
      setInsightSelectionState(readInsightSelectionState());
      setInsightSeed(Date.now() + Math.floor(Math.random() * 100000));
    }, 0);
    return () => window.clearTimeout(seedId);
  }, []);



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
  const [selectedSeason, setSelectedSeason] = useState<string | null>(getGlobalSelectedSeason(activeSeason));

  const handleSeasonChange = (season: string | null) => {
    setSelectedSeason(season);
    setGlobalSelectedSeason(season);
  };

  const getPlayerSetting = useCallback((playerId: string, seasonName: string) => {
    const setting = sharedData.playerSeasonSettings.find(s => s.player_id === playerId && s.season === seasonName);
    if (setting) {
      return {
        active: setting.active !== false,
        pay_fine: setting.pay_fine !== false,
        hidden: setting.hidden === true
      };
    }
    // Fallback: lấy từ bảng players gốc
    const player = players.find(p => p.id === playerId);
    return {
      active: player?.active !== false,
      pay_fine: player?.pay_fine !== false,
      hidden: player?.hidden === true
    };
  }, [sharedData.playerSeasonSettings, players]);

  // Tiền phạt lose_money tính theo mùa giải
  const currentSeasonInfo = useMemo(() => {
    const seasonName = selectedSeason || activeSeason;
    return seasons.find(s => s.name === seasonName);
  }, [seasons, selectedSeason, activeSeason]);

  const loseMoney = useMemo(() => {
    if (currentSeasonInfo && typeof currentSeasonInfo.lose_money === 'number') {
      return currentSeasonInfo.lose_money;
    }
    return Number(config.lose_money || 5000);
  }, [currentSeasonInfo, config.lose_money]);

  const activeMatches = useMemo(() => {
    return matches.filter(m => {
      const matchSeason = m.season || 'Season 1';
      const isPlayerActive = (playerId: string) => getPlayerSetting(playerId, matchSeason).active;

      const isWin1Inactive = m.win_1 && !isPlayerActive(String(m.win_1));
      const isWin2Inactive = m.win_2 && !isPlayerActive(String(m.win_2));
      const isLose1Inactive = m.lose_1 && !isPlayerActive(String(m.lose_1));
      const isLose2Inactive = m.lose_2 && !isPlayerActive(String(m.lose_2));
      return !m.deleted_at && !isWin1Inactive && !isWin2Inactive && !isLose1Inactive && !isLose2Inactive;
    });
  }, [matches, getPlayerSetting]);

  const viewedMatches = selectedSeason === null ? activeMatches : activeMatches.filter(m => (m.season || 'Season 1') === selectedSeason);

  const leaderboardPlayers = useMemo(() => {
    const seasonForSettings = selectedSeason || activeSeason;
    return players.filter(p => !getPlayerSetting(p.id, seasonForSettings).hidden);
  }, [players, getPlayerSetting, selectedSeason, activeSeason]);

  const visiblePlayers = useMemo(() => {
    const seasonForSettings = selectedSeason || activeSeason;
    return players.filter(p => {
      const settings = getPlayerSetting(p.id, seasonForSettings);
      return settings.active && !settings.hidden && !isGuestId(p.id);
    });
  }, [players, getPlayerSetting, selectedSeason, activeSeason]);

  const analysisSnapshot = useMemo(() => buildAnalysisSnapshot(visiblePlayers as Parameters<typeof buildAnalysisSnapshot>[0], viewedMatches as Parameters<typeof buildAnalysisSnapshot>[1], loseMoney), [visiblePlayers, viewedMatches, loseMoney]);

  const insightsReady = sharedData.syncState !== 'syncing' && insightSeed !== null && insightSelectionState !== null;
  const insightSelectionResult = useMemo(() => (
    insightsReady
      ? generateInsightSelectionResultFromSnapshot(analysisSnapshot, {
        seed: insightSeed ?? 0,
        selectionState: insightSelectionState || {},
      })
      : { insights: [], nextSelectionState: insightSelectionState || {} }
  ), [analysisSnapshot, insightSeed, insightSelectionState, insightsReady]);

  const insights = insightSelectionResult.insights;

  const repeatedInsights = useMemo(() => {
    if (insights.length === 0) return [];
    // Repeat insights so we have enough items to exceed the viewport width.
    // Safe minimum of at least 30 items or 4 full cycles, whichever is larger.
    const minItems = Math.max(30, insights.length * 4);
    const result = [];
    while (result.length < minItems) {
      result.push(...insights);
    }
    return result;
  }, [insights]);

  const tickerContentKey = useMemo(() => (
    insights.map(insight => [
      insight.type,
      insight.title || '',
      insight.rarity || '',
      insight.text,
    ].join('::')).join('||')
  ), [insights]);

  useEffect(() => {
    if (!insightsReady || insightSeed === null || committedInsightSeedRef.current === insightSeed) return;
    writeInsightSelectionState(insightSelectionResult.nextSelectionState);
    committedInsightSeedRef.current = insightSeed;
  }, [insightSeed, insightSelectionResult.nextSelectionState, insightsReady]);

  // Ticker animation refs and states
  const tickerContainerRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const isPausedRef = useRef(false);
  const translateXRef = useRef(0);
  const animationFrameIdRef = useRef<number | null>(null);
  const [tickerPaused, setTickerPaused] = useState(false);

  useEffect(() => {
    if (!tickerOpen || !insightsReady || insights.length === 0 || !marqueeRef.current || !tickerContainerRef.current) {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
      return;
    }

    const marquee = marqueeRef.current;
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }

    // Measure oneCycleWidth once at start to avoid layout thrashing
    let oneCycleWidth = 0;
    if (marquee.children && marquee.children.length > insights.length) {
      const parentLeft = marquee.getBoundingClientRect().left;
      const childLeft = marquee.children[insights.length].getBoundingClientRect().left;
      oneCycleWidth = childLeft - parentLeft;
    }

    // Fallback if not ready
    if (oneCycleWidth <= 0) {
      oneCycleWidth = marquee.offsetWidth / (repeatedInsights.length / insights.length);
    }

    // Tốc độ chạy nhanh hơn thêm 10% (tổng cộng 21% nhanh hơn base)
    const baseSpeed = oneCycleWidth > 0 ? (oneCycleWidth / (65 * 60)) : 1.0;
    const speed = baseSpeed * 1.21;

    if (oneCycleWidth > 0 && Math.abs(translateXRef.current) >= oneCycleWidth) {
      translateXRef.current = translateXRef.current % oneCycleWidth;
    }
    marquee.style.transform = `translateX(${translateXRef.current}px)`;

    // Resize handler to update oneCycleWidth if window resizes
    const handleResize = () => {
      if (marquee.children && marquee.children.length > insights.length) {
        const parentLeft = marquee.getBoundingClientRect().left;
        const childLeft = marquee.children[insights.length].getBoundingClientRect().left;
        const newWidth = childLeft - parentLeft;
        if (newWidth > 0) {
          oneCycleWidth = newWidth;
        }
      }
    };
    window.addEventListener('resize', handleResize);

    const step = () => {
      if (isPausedRef.current) {
        animationFrameIdRef.current = requestAnimationFrame(step);
        return;
      }

      translateXRef.current -= speed;
      
      if (oneCycleWidth > 0) {
        if (Math.abs(translateXRef.current) >= oneCycleWidth) {
          translateXRef.current += oneCycleWidth;
        }
      } else {
        const marqueeWidth = marquee.offsetWidth;
        if (Math.abs(translateXRef.current) >= marqueeWidth / 2) {
          translateXRef.current = 0;
        }
      }

      marquee.style.transform = `translateX(${translateXRef.current}px)`;
      animationFrameIdRef.current = requestAnimationFrame(step);
    };

    animationFrameIdRef.current = requestAnimationFrame(step);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    };
  }, [tickerOpen, insightsReady, insights.length, tickerContentKey, repeatedInsights]);

  const handleTickerClick = () => {
    isPausedRef.current = !isPausedRef.current;
    setTickerPaused(isPausedRef.current);
  };

  const handleCloseTicker = () => {
    setTickerOpen(false);
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('pickleball_ticker_closed', 'true');
    }
  };

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
      <div className={`${DESKTOP_PANEL_WIDTH} flex items-center gap-2`}>
        {sharedData.syncMessage ? (
          <div className="hidden sm:flex items-center gap-2 rounded-xl border border-slate-500/20 bg-[#142034]/80 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300/60">
            <RefreshCw className={`w-3.5 h-3.5 ${sharedData.syncState === 'syncing' ? 'animate-spin' : ''}`} />
            {sharedData.syncMessage}
          </div>
        ) : null}
        <div className="ml-auto flex items-center justify-end gap-2">
          <Link href="/analysis" className="inline-flex items-center gap-2 rounded-xl border border-slate-500/25 bg-[#142034]/90 px-3 py-2 text-xs font-black text-slate-300/85 hover:border-primary/40 hover:text-primary transition-colors">
            <BarChart3 className="w-4 h-4" />
            Trung tâm phân tích
          </Link>
          <button onClick={() => setSettingsOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-500/25 bg-[#142034]/90 px-3 py-2 text-xs font-black text-slate-300/85 hover:border-primary/40 hover:text-primary transition-colors">
            <Settings className="w-4 h-4" />
            Cài đặt
          </button>
          {!tickerOpen && (
            <button onClick={() => {
              setTickerOpen(true);
              if (typeof window !== 'undefined') {
                window.sessionStorage.removeItem('pickleball_ticker_closed');
              }
            }} className="inline-flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-black text-primary hover:bg-primary/20 transition-colors relative overflow-hidden group">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              Hiện tin nhanh
            </button>
          )}
        </div>
      </div>

      {previewWritesBlocked && (
        <div className={`${DESKTOP_PANEL_WIDTH} rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-left text-xs font-bold text-amber-200`}>
          Dev preview đang dùng chung database với production nên các thao tác ghi/sửa/xóa đã bị khóa để bảo vệ data thật.
        </div>
      )}

      {/* Tin nhanh chạy ngang kiểu Sports Ticker */}
      {tickerOpen && insightsReady && insights.length > 0 && (
        <div className={DESKTOP_PANEL_WIDTH}>
          <div className="relative overflow-hidden rounded-xl border border-white/[0.05] bg-slate-950/40 backdrop-blur-md h-9 flex items-center shadow-inner">
            <style>{`
              .sports-ticker-marquee {
                display: flex;
                width: max-content;
                will-change: transform;
                cursor: pointer;
              }
            `}</style>
            
            {/* Badge Tin Nhanh */}
            <div className="z-10 bg-primary px-3 py-1 flex items-center h-full gap-1 shrink-0 select-none shadow-[4px_0_15px_rgba(34,197,94,0.15)]">
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-slate-950 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-slate-950"></span>
              </span>
              <span className="text-[9px] font-black tracking-widest text-slate-950 uppercase hidden sm:inline">TIN NHANH</span>
            </div>
            
            {/* Dòng chữ chạy */}
            <div 
              ref={tickerContainerRef}
              onClick={handleTickerClick}
              className="flex-1 overflow-hidden relative h-full flex items-center"
              title={tickerPaused ? "Click để tiếp tục chạy" : "Click để tạm dừng"}
            >
              <div ref={marqueeRef} className="sports-ticker-marquee py-1 select-none">
                {repeatedInsights.map((insight, idx) => {
                  const rarity = insight.rarity || 'common';
                  const rarityBadge = insight.title || 'ĐIỂM NHẤN';
                  let badgeClass = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
                  let icon = '⭐';
                  let iconClass = 'text-emerald-500/50';

                  if (rarity === 'uncommon') {
                    badgeClass = 'text-blue-400 bg-blue-500/10 border-blue-500/20';
                    icon = '⭐';
                    iconClass = 'text-blue-500/50';
                  } else if (rarity === 'rare') {
                    badgeClass = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
                    icon = '⭐';
                    iconClass = 'text-amber-500/50';
                  } else if (rarity === 'epic') {
                    badgeClass = 'text-fuchsia-300 bg-fuchsia-500/15 border-fuchsia-500/30';
                    icon = '⚡';
                    iconClass = 'text-fuchsia-500/50';
                  }

                  return (
                    <span key={idx} className="ticker-item inline-flex items-center text-[11px] font-bold text-slate-300 mx-6 gap-2 shrink-0">
                      <span className={`text-[9px] font-black uppercase shrink-0 px-1.5 py-0.5 rounded border ${badgeClass}`}>
                        {rarityBadge}
                      </span>
                      <span className="text-white/90">{insight.text}</span>
                      <span className={`text-xs select-none ml-2 ${iconClass}`}>{icon}</span>
                    </span>
                  );
                })}
              </div>
            </div>
            
            {/* Nút đóng */}
            <button 
              type="button" 
              onClick={handleCloseTicker}
              className="z-10 shrink-0 h-full w-9 flex items-center justify-center bg-slate-950/20 text-slate-400 hover:text-white border-l border-white/[0.05] hover:bg-slate-950/40 transition-colors cursor-pointer"
              aria-label="Đóng tin nhanh"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 1. Summary */}
      <div className={DESKTOP_PANEL_WIDTH}>
        <SummaryGrid players={players} matches={viewedMatches} loseMoney={loseMoney} />
      </div>

      {/* 2. Leaderboard */}
      <div className={DESKTOP_PANEL_WIDTH}>
        <Leaderboard
          players={leaderboardPlayers}
          matches={activeMatches}
          seasons={seasons}
          activeSeason={activeSeason}
          selectedSeason={selectedSeason}
          onSeasonChange={handleSeasonChange}
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
        <RecentHistory matches={viewedMatches} players={players} canEdit={canWrite} matchExpected={analysisSnapshot.elo.matchExpected} />
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        canEdit={canWrite}
        onUnlock={unlock}
        onLock={lock}
        players={players}
        matches={matches}
        seasons={seasons}
        config={config}
        playerSeasonSettings={sharedData.playerSeasonSettings}
      />

    </div>
  );
}
