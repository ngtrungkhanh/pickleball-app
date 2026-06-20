'use client';
import { useState, useEffect, useSyncExternalStore, useMemo, useRef, useCallback, type MouseEvent, type MutableRefObject } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BarChart3, CalendarDays, Crown, RefreshCw, Settings, Sparkles, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { SummaryGrid } from './dashboard/SummaryGrid';
import { Leaderboard } from './dashboard/Leaderboard';
import { RecentHistory } from './dashboard/RecentHistory';
import { ScoreForm } from './ScoreForm';
import { SettingsModal } from './SettingsModal';
import { useSharedAppData } from '@/lib/use-shared-app-data';
import { removeMatchesLocal, saveMatchesLocal, seedAppCache, type StoredPlayerSeasonSetting } from '@/lib/db';
import { isGuestId } from '@/lib/guest';
import { buildAnalysisSnapshot } from '@/lib/analysis-core';
import { generateInsightSelectionResultFromSnapshot, type InsightSelectionState } from '@/lib/insights';
import { getGlobalSelectedSeason, setGlobalSelectedSeason, isGlobalSeasonSet } from '@/lib/season-state';
import { PreviousChampionTitleLine } from '@/components/PreviousChampionTitleLine';
import { buildHallOfFameEntries, formatHallDate, getLatestHallOfFameEntry } from '@/lib/hall-of-fame';
import { deleteMatchAction } from '@/app/actions';

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
const TICKER_PIXELS_PER_SECOND = 60;

function formatShortDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function formatCurrency(value: number) {
  return `${value.toLocaleString('vi-VN')}d`;
}

function avatarLetter(value: unknown) {
  return Array.from(String(value || '').trim())[0]?.toLocaleUpperCase('vi-VN') || '?';
}

function isMissingMatchError(value: unknown) {
  const text = String(value || '').toLocaleLowerCase('vi-VN');
  const ascii = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return ascii.includes('khong tim thay tran') || /kh.{0,6}ng.*t.{0,6}m.*tr/i.test(text);
}

function matchTime(match: Match) {
  const value = new Date(String(match.date || '')).getTime();
  return Number.isFinite(value) ? value : 0;
}

function useTickerMarquee<TContainer extends HTMLElement = HTMLDivElement, TMarquee extends HTMLElement = HTMLDivElement>({
  enabled,
  itemCount,
  contentKey,
  repeatedCount,
  pausedRef,
}: {
  enabled: boolean;
  itemCount: number;
  contentKey: string;
  repeatedCount: number;
  pausedRef: MutableRefObject<boolean>;
}) {
  const containerRef = useRef<TContainer>(null);
  const marqueeRef = useRef<TMarquee>(null);
  const translateXRef = useRef(0);
  const animationFrameIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || itemCount === 0 || !marqueeRef.current || !containerRef.current) {
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

    let oneCycleWidth = 0;
    const measureWidth = () => {
      if (marquee.children && marquee.children.length > itemCount) {
        const firstChild = marquee.children[0];
        const targetChild = marquee.children[itemCount];
        const dist = targetChild.getBoundingClientRect().left - firstChild.getBoundingClientRect().left;
        if (dist > 0) oneCycleWidth = dist;
      }
    };

    measureWidth();
    const measureTimeout = window.setTimeout(measureWidth, 1000);

    if (oneCycleWidth > 0 && Math.abs(translateXRef.current) >= oneCycleWidth) {
      translateXRef.current %= oneCycleWidth;
    }
    marquee.style.transform = `translate3d(${translateXRef.current}px, 0, 0)`;

    const handleResize = () => measureWidth();
    window.addEventListener('resize', handleResize);

    let lastTime: number | null = null;
    const step = (timestamp: number) => {
      if (pausedRef.current) {
        lastTime = timestamp;
        animationFrameIdRef.current = requestAnimationFrame(step);
        return;
      }

      if (lastTime === null) lastTime = timestamp;
      const deltaTime = timestamp - lastTime;
      lastTime = timestamp;

      const moveAmount = (TICKER_PIXELS_PER_SECOND * Math.min(deltaTime, 50)) / 1000;
      translateXRef.current -= moveAmount;

      if (oneCycleWidth > 0) {
        if (Math.abs(translateXRef.current) >= oneCycleWidth) {
          translateXRef.current %= oneCycleWidth;
        }
      } else {
        const cycleRatio = itemCount > 0 ? repeatedCount / itemCount : 1;
        const fallbackWidth = marquee.offsetWidth / Math.max(1, cycleRatio);
        if (fallbackWidth > 0 && Math.abs(translateXRef.current) >= fallbackWidth) {
          translateXRef.current %= fallbackWidth;
        }
      }

      marquee.style.transform = `translate3d(${translateXRef.current}px, 0, 0)`;
      animationFrameIdRef.current = requestAnimationFrame(step);
    };

    animationFrameIdRef.current = requestAnimationFrame(step);

    return () => {
      window.clearTimeout(measureTimeout);
      window.removeEventListener('resize', handleResize);
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    };
  }, [enabled, itemCount, contentKey, repeatedCount, pausedRef]);

  return { containerRef, marqueeRef };
}

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
  const router = useRouter();
  const sharedData = useSharedAppData({
    initialPlayers,
    initialMatches,
    initialConfig,
    initialSeasons,
    initialPlayerSeasonSettings,
    routeKey: 'dashboard',
    syncOnMount: 'always',
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
  const failLocalMatch = (tempId: string, error?: string) => {
    setMatches(prev => prev.map(m => (
      m.id === tempId
        ? { ...m, pending: true, sync_status: 'error', sync_error: error || 'Lưu server thất bại' }
        : m
    )));
  };
  const deleteLocalMatch = useCallback(async (matchId: string) => {
    const match = matches.find(m => String(m.id || '') === matchId);
    if (!match) return;
    setMatches(prev => prev.filter(m => String(m.id || '') !== matchId));
    await removeMatchesLocal([matchId]);
    const result = await deleteMatchAction(matchId);
    if (result && 'error' in result) {
      if (isMissingMatchError(result.error)) {
        await removeMatchesLocal([matchId]);
        return;
      }
      setMatches(prev => [match, ...prev.filter(m => String(m.id || '') !== matchId)]);
      await saveMatchesLocal([match]);
      alert(String(result.error || 'Xóa trận thất bại. Đã khôi phục lại dữ liệu local.'));
      return;
    }
    await removeMatchesLocal([matchId], result?.dataVersion, result?.partVersions);
  }, [matches]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const canEdit = useSyncExternalStore(subscribeEditMode, getEditModeSnapshot, () => false);
  const canWrite = canEdit && !previewWritesBlocked;
  const activeSeason = config.active_season || 'Season 1';
  const [selectedSeason, setSelectedSeason] = useState<string | null>(getGlobalSelectedSeason(activeSeason));

  useEffect(() => {
    if (!isGlobalSeasonSet()) {
      queueMicrotask(() => setSelectedSeason(activeSeason));
    }
  }, [activeSeason]);

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
    return players
      .map(p => {
        const settings = getPlayerSetting(p.id, seasonForSettings);
        return {
          ...p,
          active: settings.active,
          pay_fine: settings.pay_fine,
          hidden: settings.hidden,
        };
      })
      .filter(p => !p.hidden);
  }, [players, getPlayerSetting, selectedSeason, activeSeason]);

  const visiblePlayers = useMemo(() => {
    const seasonForSettings = selectedSeason || activeSeason;
    return players
      .map(p => {
        const settings = getPlayerSetting(p.id, seasonForSettings);
        return {
          ...p,
          active: settings.active,
          pay_fine: settings.pay_fine,
          hidden: settings.hidden,
        };
      })
      .filter(p => p.active && !p.hidden && !isGuestId(p.id));
  }, [players, getPlayerSetting, selectedSeason, activeSeason]);

  const analysisSnapshot = useMemo(() => buildAnalysisSnapshot(
    visiblePlayers as Parameters<typeof buildAnalysisSnapshot>[0],
    viewedMatches as Parameters<typeof buildAnalysisSnapshot>[1],
    loseMoney,
    {
      players,
      seasons,
      playerSeasonSettings: sharedData.playerSeasonSettings,
      fallbackLoseMoney: loseMoney,
    },
  ), [visiblePlayers, viewedMatches, loseMoney, players, seasons, sharedData.playerSeasonSettings]);
  const previousChampion = useMemo(() => getLatestHallOfFameEntry(
    buildHallOfFameEntries(players, matches, seasons, activeSeason, loseMoney, sharedData.playerSeasonSettings)
  ), [players, matches, seasons, activeSeason, loseMoney, sharedData.playerSeasonSettings]);

  const insightsReady = insightSeed !== null && insightSelectionState !== null;
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

  // Ticker animation state is shared, while desktop/mobile use separate refs.
  const tickerContainerRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const isPausedRef = useRef(false);
  const translateXRef = useRef(0);
  const animationFrameIdRef = useRef<number | null>(null);
  const [tickerPaused, setTickerPaused] = useState(false);
  const tickerEnabled = tickerOpen && insightsReady && insights.length > 0;
  const {
    containerRef: desktopTickerContainerRef,
    marqueeRef: desktopTickerMarqueeRef,
  } = useTickerMarquee<HTMLSpanElement, HTMLSpanElement>({
    enabled: tickerEnabled,
    itemCount: insights.length,
    contentKey: tickerContentKey,
    repeatedCount: repeatedInsights.length,
    pausedRef: isPausedRef,
  });

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

    // Measure oneCycleWidth as the distance between child 0 and child insights.length to handle item margins/paddings perfectly
    let oneCycleWidth = 0;

    const measureWidth = () => {
      if (marquee.children && marquee.children.length > insights.length) {
        const firstChild = marquee.children[0];
        const targetChild = marquee.children[insights.length];
        const dist = targetChild.getBoundingClientRect().left - firstChild.getBoundingClientRect().left;
        if (dist > 0) {
          oneCycleWidth = dist;
        }
      }
    };

    measureWidth();

    // Re-measure after 1 second to ensure fonts/layout are fully loaded and correct
    const measureTimeout = setTimeout(measureWidth, 1000);

    if (oneCycleWidth > 0 && Math.abs(translateXRef.current) >= oneCycleWidth) {
      translateXRef.current = translateXRef.current % oneCycleWidth;
    }
    // Use translate3d for better hardware acceleration
    marquee.style.transform = `translate3d(${translateXRef.current}px, 0, 0)`;

    // Resize handler to update oneCycleWidth if window resizes
    const handleResize = () => {
      measureWidth();
    };
    window.addEventListener('resize', handleResize);

    let lastTime: number | null = null;
    // Tốc độ cố định: 60 pixels mỗi giây (đảm bảo độ mượt và tốc độ chạy vừa phải trên cả PC & Mobile)
    const PIXELS_PER_SECOND = 60;

    const step = (timestamp: number) => {
      if (isPausedRef.current) {
        lastTime = timestamp;
        animationFrameIdRef.current = requestAnimationFrame(step);
        return;
      }

      if (lastTime === null) {
        lastTime = timestamp;
      }
      
      const deltaTime = timestamp - lastTime;
      lastTime = timestamp;

      // Giới hạn deltaTime tối đa 50ms (20fps) để tránh giật cục quá lớn nếu tab bị ẩn
      const safeDeltaTime = Math.min(deltaTime, 50);
      
      const moveAmount = (PIXELS_PER_SECOND * safeDeltaTime) / 1000;
      translateXRef.current -= moveAmount;
      
      if (oneCycleWidth > 0) {
        if (Math.abs(translateXRef.current) >= oneCycleWidth) {
          // Dùng modulo thay vì cộng để giữ chính xác phần thập phân, chống trôi dạt (drift)
          translateXRef.current = translateXRef.current % oneCycleWidth;
        }
      } else {
        // Fallback nếu chưa đo được
        const fallbackWidth = marquee.offsetWidth / (repeatedInsights.length / insights.length);
        if (fallbackWidth > 0 && Math.abs(translateXRef.current) >= fallbackWidth) {
          translateXRef.current = translateXRef.current % fallbackWidth;
        }
      }

      marquee.style.transform = `translate3d(${translateXRef.current}px, 0, 0)`;
      animationFrameIdRef.current = requestAnimationFrame(step);
    };

    animationFrameIdRef.current = requestAnimationFrame(step);

    return () => {
      clearTimeout(measureTimeout);
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

  const openAnalysisFromLocalCache = async (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();

    try {
      await seedAppCache({
        players,
        matches,
        seasons,
        config,
        playerSeasonSettings: sharedData.playerSeasonSettings,
      });
    } catch (error) {
      console.error('Failed to prepare analysis cache:', error);
    }

    router.push('/analysis');
  };

  const seasonOptions = useMemo(() => Array.from(new Set([
    activeSeason,
    ...seasons.map(s => s.name),
    ...matches.map(m => String(m.season || 'Season 1')),
  ].filter(Boolean))), [activeSeason, seasons, matches]);
  const seasonLabel = selectedSeason ?? 'Tổng hợp';
  const selectedSeasonInfo = selectedSeason ? seasons.find(s => s.name === selectedSeason) : null;
  const seasonStatus = selectedSeason === null
    ? `${seasonOptions.length} mùa`
    : (selectedSeasonInfo?.active === true || selectedSeason === activeSeason ? 'Đang chạy' : 'Đã chốt');
  const seasonTimeText = useMemo(() => {
    const times = viewedMatches.map(matchTime).filter(Boolean).sort((a, b) => a - b);
    const firstMatchDate = times[0] ? formatShortDate(new Date(times[0]).toISOString()) : '';
    const lastMatchDate = times.length > 0 ? formatShortDate(new Date(times[times.length - 1]).toISOString()) : '';
    const seasonStartDate = formatShortDate(selectedSeasonInfo?.start_date || null);

    if (selectedSeason === null) {
      if (firstMatchDate && lastMatchDate && firstMatchDate !== lastMatchDate) return `${firstMatchDate} - ${lastMatchDate}`;
      return firstMatchDate || 'Chưa có dữ liệu';
    }

    const start = seasonStartDate || firstMatchDate;
    if (start && lastMatchDate && start !== lastMatchDate) return `${start} - ${lastMatchDate}`;
    return start || lastMatchDate || 'Chưa có dữ liệu';
  }, [selectedSeason, selectedSeasonInfo?.start_date, viewedMatches]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="w-full">
      <div className="hidden lg:block">
        <header className="sticky top-0 z-40 -mx-4 border-b border-white/10 bg-[#07101d]/88 backdrop-blur-2xl shadow-[0_14px_42px_rgba(0,0,0,0.24)]">
          <style>{`
            .desktop-news-marquee {
              display: inline-flex;
              min-width: max-content;
              gap: 1.75rem;
              will-change: transform;
            }
          `}</style>
          <div className="mx-auto grid max-w-[1680px] grid-cols-[minmax(210px,auto)_minmax(0,1fr)_auto] items-center gap-4 px-4 py-2.5">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <h1 className="truncate !text-xl xl:!text-2xl !leading-none font-black tracking-tight text-white drop-shadow-[0_0_18px_rgba(34,197,94,0.20)]">
                  Pickleball <span className="text-primary">Ranking</span>
                </h1>
                <span className="hidden rounded border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-primary xl:inline-block">
                  live
                </span>
              </div>
              <div className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.24em] text-white/35">
                {seasonLabel} · {viewedMatches.length} trận
              </div>
            </div>

            <div className="min-w-0 overflow-hidden rounded-lg border border-primary/20 bg-slate-950/45 shadow-[inset_0_0_0_1px_rgba(34,197,94,0.06)]">
              {tickerOpen && insightsReady && insights.length > 0 ? (
                <button
                  type="button"
                  onClick={handleTickerClick}
                  className="group flex h-9 w-full min-w-0 items-center overflow-hidden text-left"
                  title={tickerPaused ? 'Click để tiếp tục chạy' : 'Click để tạm dừng'}
                >
                  <span className="flex h-full shrink-0 items-center gap-1.5 border-r border-primary/20 bg-primary px-3 text-[9px] font-black uppercase tracking-[0.18em] text-slate-950">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-950 shadow-[0_0_8px_rgba(2,6,23,0.7)]" />
                  </span>
                  <span ref={desktopTickerContainerRef} className="min-w-0 flex-1 overflow-hidden px-3">
                    <span
                      ref={desktopTickerMarqueeRef}
                      className="desktop-news-marquee text-[11px] font-bold text-slate-200/85"
                    >
                      {repeatedInsights.map((insight, idx) => (
                        <span key={idx} className="inline-flex items-center gap-2 whitespace-nowrap">
                          <span className="rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-primary">
                            {insight.title || 'Điểm nhấn'}
                          </span>
                          <span>{insight.text}</span>
                        </span>
                      ))}
                    </span>
                  </span>
                </button>
              ) : (
                <div className="flex h-9 items-center px-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/25">
                  Đang tải tin nhanh...
                </div>
              )}
            </div>

            <div className="flex min-w-0 items-center justify-end gap-2">
              {sharedData.syncMessage ? (
                <div className="hidden h-9 max-w-[220px] items-center gap-2 rounded-lg border border-slate-500/20 bg-white/[0.035] px-3 text-[10px] font-black uppercase tracking-widest text-slate-300/55 2xl:flex">
                  <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${sharedData.syncState === 'syncing' ? 'animate-spin' : ''}`} />
                  <span className="min-w-0 truncate">{sharedData.syncMessage}</span>
                </div>
              ) : null}
              <Link href="/analysis" onClick={openAnalysisFromLocalCache} className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-black text-white/70 transition-all hover:border-primary/35 hover:bg-primary/10 hover:text-primary active:scale-95">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden xl:inline">Phân tích</span>
              </Link>
              <motion.button whileTap={{ scale: 0.95 }} onClick={() => setSettingsOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-black text-white/70 transition-all hover:border-primary/35 hover:bg-primary/10 hover:text-primary">
                <Settings className="h-4 w-4" />
                <span className="hidden xl:inline">Cài đặt</span>
              </motion.button>
            </div>
          </div>
        </header>

        {sharedData.syncMessage ? (
          <div className="pointer-events-none fixed right-4 top-[70px] z-50 hidden max-w-[300px] items-center gap-2 rounded-xl border border-slate-500/20 bg-[#07101d]/92 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300/60 shadow-[0_14px_42px_rgba(0,0,0,0.24)] backdrop-blur-xl lg:flex 2xl:hidden">
            <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${sharedData.syncState === 'syncing' ? 'animate-spin' : ''}`} />
            <span className="min-w-0 truncate">{sharedData.syncMessage}</span>
          </div>
        ) : null}

        <div className="mx-auto grid max-w-[1680px] grid-cols-[300px_minmax(0,1fr)] gap-4 py-4 3xl:grid-cols-[300px_minmax(780px,1fr)_340px]">
          <aside className="min-w-0 space-y-3 self-start lg:sticky lg:top-[74px] lg:max-h-[calc(100vh-88px)] lg:overflow-y-auto lg:overflow-x-hidden">
            <section className="rounded-2xl border border-white/10 bg-[#111d31]/86 p-3 shadow-[0_14px_40px_rgba(0,0,0,0.24)] backdrop-blur-xl">
              <div className="mb-2 flex items-center gap-2 px-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/45">
                <CalendarDays className="h-3.5 w-3.5 text-primary/70" />
                Mùa giải
              </div>
              <select
                value={selectedSeason ?? 'all'}
                onChange={e => handleSeasonChange(e.target.value === 'all' ? null : e.target.value)}
                className="h-10 w-full rounded-xl border border-primary/20 !bg-slate-950/70 px-3 text-sm font-black text-white/85 outline-none transition focus:border-primary/60"
              >
                <option value="all">Tổng hợp</option>
                {seasonOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <div className="mt-3 rounded-xl border border-primary/15 bg-primary/[0.055] px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[9px] font-black uppercase tracking-[0.16em] text-white/35">Trạng thái</div>
                  <div className="shrink-0 rounded-lg border border-primary/20 bg-primary/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-primary">{seasonStatus}</div>
                </div>
                <div className="mt-2 text-xs font-bold leading-snug text-white/45">{seasonTimeText}</div>
                <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/10 pt-2 text-[10px] font-black uppercase tracking-[0.14em] text-white/35">
                  <span>Mức phạt</span>
                  <span className="text-white/70">{formatCurrency(loseMoney)}</span>
                </div>
              </div>
            </section>

            {previousChampion && (
              <Link
                href="/analysis?zone=hall"
                className="group block overflow-hidden rounded-2xl border border-amber-300/24 bg-slate-950/35 p-3 shadow-[0_14px_38px_rgba(0,0,0,0.20)] champion-glow-card"
              >
                <div className="grid grid-cols-[82px_minmax(0,1fr)] gap-3">
                  <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-amber-200/35 bg-slate-950/85 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
                    {previousChampion.imageUrl ? (
                      <div
                        role="img"
                        aria-label={`Ảnh vinh danh ${previousChampion.playerName}`}
                        className="absolute inset-0 bg-cover bg-center transition duration-300 group-hover:brightness-110"
                        style={{ backgroundImage: `url("${previousChampion.imageUrl}")` }}
                      />
                    ) : (
                      <>
                        <div className="absolute inset-2 rounded-lg border border-amber-100/15" />
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(251,191,36,0.24),transparent_42%),linear-gradient(145deg,rgba(251,191,36,0.16),rgba(15,23,42,0.18)_45%,rgba(15,23,42,0.62))]" />
                        <div className="relative flex h-full items-center justify-center text-3xl font-black text-amber-100">
                          {avatarLetter(previousChampion.playerName)}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="min-w-0 self-center">
                    <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-amber-200/70">
                      <Crown className="h-3.5 w-3.5" />
                      Champion
                    </div>
                    <div className="mt-1 rounded-full border border-amber-200/20 bg-amber-200/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-amber-100/75">
                      {previousChampion.season}
                    </div>
                    <div className="mt-2 line-clamp-2 break-words py-0.5 text-lg font-black leading-snug text-white" title={previousChampion.playerName}>
                      {previousChampion.playerName}
                    </div>
                    {previousChampion.lastMatchDate ? (
                      <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-100/38">
                        Chốt {formatHallDate(previousChampion.lastMatchDate)}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-amber-100/10 bg-black/10 px-2 py-1.5 text-center">
                    <div className="text-[9px] font-black uppercase tracking-wider text-amber-100/40">Tỉ lệ</div>
                    <div className="mt-0.5 text-sm font-black text-amber-50">{Math.round(previousChampion.winRate)}%</div>
                  </div>
                  <div className="rounded-lg border border-amber-100/10 bg-black/10 px-2 py-1.5 text-center">
                    <div className="text-[9px] font-black uppercase tracking-wider text-amber-100/40">W-L</div>
                    <div className="mt-0.5 text-sm font-black text-amber-50">{previousChampion.wins}-{previousChampion.losses}</div>
                  </div>
                  <div className="rounded-lg border border-amber-100/10 bg-black/10 px-2 py-1.5 text-center">
                    <div className="text-[9px] font-black uppercase tracking-wider text-amber-100/40">Trận</div>
                    <div className="mt-0.5 text-sm font-black text-amber-50">{previousChampion.total}</div>
                  </div>
                </div>
              </Link>
            )}

          </aside>

          <section className="min-w-0 space-y-4">
            {!sharedData.hasLocalCache && sharedData.syncState !== 'idle' && (
              <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-primary">
                Đang tải dữ liệu...
              </div>
            )}
            {previewWritesBlocked && (
              <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-left text-xs font-bold text-amber-200">
                Dev preview đang dùng chung database với production nên các thao tác ghi/sửa/xóa đã bị khóa để bảo vệ data thật.
              </div>
            )}
            <div className="3xl:hidden">
              <SummaryGrid
                players={players}
                matches={viewedMatches}
                loseMoney={loseMoney}
                seasons={seasons}
                playerSeasonSettings={sharedData.playerSeasonSettings}
              />
            </div>
            <Leaderboard
              players={leaderboardPlayers}
              matches={activeMatches}
              seasons={seasons}
              activeSeason={activeSeason}
              selectedSeason={selectedSeason}
              onSeasonChange={handleSeasonChange}
              loseMoney={loseMoney}
              playerSeasonSettings={sharedData.playerSeasonSettings}
              showSeasonHeader={false}
            />
            {canWrite && (
              <section className="relative z-[100] overflow-visible rounded-2xl border border-white/10 bg-[#111d31]/86 shadow-[0_14px_40px_rgba(0,0,0,0.24)] backdrop-blur-xl">
                <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                  <Sparkles className="h-3.5 w-3.5 text-primary/80" />
                  <h2 className="min-w-0 truncate text-[10px] font-black uppercase tracking-[0.2em] text-white/55">Nhập trận nhanh</h2>
                </div>
                <ScoreForm
                  players={players}
                  onAddMatch={addLocalMatch}
                  onConfirmMatch={confirmLocalMatch}
                  onRejectMatch={rejectLocalMatch}
                  onFailMatch={failLocalMatch}
                  activeSeason={activeSeason}
                />
              </section>
            )}
            <div className="relative z-0 3xl:hidden">
              <RecentHistory matches={viewedMatches} players={players} canEdit={canWrite} matchExpected={analysisSnapshot.elo.matchExpected} onDeleteMatch={deleteLocalMatch} />
            </div>
          </section>

          <aside className="hidden min-w-0 space-y-3 self-start 3xl:block 3xl:sticky 3xl:top-[74px] 3xl:max-h-[calc(100vh-88px)] 3xl:overflow-y-auto 3xl:overflow-x-hidden">
            <SummaryGrid
              compact
              players={players}
              matches={viewedMatches}
              loseMoney={loseMoney}
              seasons={seasons}
              playerSeasonSettings={sharedData.playerSeasonSettings}
            />
            <RecentHistory matches={viewedMatches} players={players} canEdit={canWrite} matchExpected={analysisSnapshot.elo.matchExpected} onDeleteMatch={deleteLocalMatch} />
          </aside>
        </div>
      </div>

      <div className="space-y-5 transition-all duration-500 w-full lg:hidden">
      {previousChampion && (
        <PreviousChampionTitleLine champion={previousChampion} />
      )}

      <div className={`${DESKTOP_PANEL_WIDTH} flex items-center gap-2`}>
        {sharedData.syncMessage ? (
          <div className="hidden sm:flex items-center gap-2 rounded-xl border border-slate-500/20 bg-[#142034]/80 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300/60">
            <RefreshCw className={`w-3.5 h-3.5 ${sharedData.syncState === 'syncing' ? 'animate-spin' : ''}`} />
            {sharedData.syncMessage}
          </div>
        ) : null}
        <div className="ml-auto flex items-center justify-end gap-2">
          <Link href="/analysis" onClick={openAnalysisFromLocalCache} className="inline-flex items-center gap-2 rounded-xl border border-slate-500/25 bg-[#142034]/90 px-3 py-2 text-xs font-black text-slate-300/85 hover:border-primary/40 hover:text-primary transition-colors active:scale-95">
            <BarChart3 className="w-4 h-4" />
            Trung tâm phân tích
          </Link>
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => setSettingsOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-500/25 bg-[#142034]/90 px-3 py-2 text-xs font-black text-slate-300/85 hover:border-primary/40 hover:text-primary transition-colors">
            <Settings className="w-4 h-4" />
            Cài đặt
          </motion.button>
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

      {!sharedData.hasLocalCache && sharedData.syncState !== 'idle' && (
        <div className={`${DESKTOP_PANEL_WIDTH} rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-primary`}>
          Đang tải dữ liệu...
        </div>
      )}

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
        <SummaryGrid
          players={players}
          matches={viewedMatches}
          loseMoney={loseMoney}
          seasons={seasons}
          playerSeasonSettings={sharedData.playerSeasonSettings}
        />
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
          playerSeasonSettings={sharedData.playerSeasonSettings}
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
          <div className="relative z-[100] rounded-2xl border border-slate-500/25 bg-[#142034]/95 overflow-visible">
            <ScoreForm
              players={players}
              onAddMatch={addLocalMatch}
              onConfirmMatch={confirmLocalMatch}
              onRejectMatch={rejectLocalMatch}
              onFailMatch={failLocalMatch}
              activeSeason={activeSeason}
            />
          </div>
        </div>
      )}

      {/* 4. Recent History */}
      <div className={`relative z-0 ${DESKTOP_PANEL_WIDTH}`}>
        <RecentHistory matches={viewedMatches} players={players} canEdit={canWrite} matchExpected={analysisSnapshot.elo.matchExpected} onDeleteMatch={deleteLocalMatch} />
      </div>

    </div>
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        canEdit={canEdit}
        onUnlock={unlock}
        onLock={lock}
        players={players}
        matches={matches}
        seasons={seasons}
        config={config}
        playerSeasonSettings={sharedData.playerSeasonSettings}
        onDataChanged={sharedData.refresh}
      />
    </motion.div>
  );
}
