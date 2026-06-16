'use client';

import { useEffect, useMemo, useRef, useState, useCallback, Fragment, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, RefreshCw, Database,
  LayoutGrid, User, Swords, History,
  TrendingUp, TrendingDown, Flame, Trophy, Target,
  Star, Zap, Award, Crown, Medal, CalendarDays,
  Users, HelpCircle, Shield, Heart,
  type LucideIcon
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { buildAnalysisSnapshot, edgeRecord, getAnalysisName, type AnalysisEdge, type EloResult, type PlayerMetrics, type PlayerProfile } from '@/lib/analysis-core';
import { useSwipeable } from 'react-swipeable';
import { generateInsightSelectionResultFromSnapshot, type InsightSelectionState } from '@/lib/insights';
import { cn, getAvatarLetter } from '@/lib/utils';
import { useSharedAppData } from '@/lib/use-shared-app-data';
import { isGuestId } from '@/lib/guest';
import { calculateFineTotal, type FinePlayerSeasonSetting } from '@/lib/fines';
import { buildHallOfFameEntries, formatHallDate, type HallOfFameEntry } from '@/lib/hall-of-fame';
import { getHallImageLocal, removeHallImageLocal, saveHallImageLocal, type StoredPlayerSeasonSetting } from '@/lib/db';
import { getGlobalSelectedSeason, setGlobalSelectedSeason, isGlobalSeasonSet } from '@/lib/season-state';

// Vietnam week helper functions
function getVietnamWeekMondayStr(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  const day = local.getUTCDay() || 7; // Monday is 1, Sunday is 7
  const monday = new Date(local.getTime() - (day - 1) * 24 * 60 * 60 * 1000);
  const y = monday.getUTCFullYear();
  const m = String(monday.getUTCMonth() + 1).padStart(2, '0');
  const date = String(monday.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${date}`;
}

// Navigation tabs - 5 zones
const navItems = [
  { id: 'hub', label: 'Tổng quan', icon: LayoutGrid },
  { id: 'hall', label: 'Vinh danh', icon: Crown },
  { id: 'pair', label: 'Cặp đôi', icon: Users },
  { id: 'profile', label: 'Cá nhân', icon: User },
  { id: 'matrix', label: 'Mạng lưới', icon: Swords },
];

// Matrix sub-tabs
const matrixTabs = [
  { id: 'partner', label: 'Hợp tác' },
  { id: 'opponent', label: 'Đối đầu' },
];

type Player = { id: string; name: string; active?: boolean; hidden?: boolean; pay_fine?: boolean };
type Match = {
  id?: string;
  date?: string;
  win_1?: string;
  win_2?: string | null;
  lose_1?: string;
  lose_2?: string | null;
  win_score?: number;
  lose_score?: number;
  season?: string;
  deleted_at?: unknown;
};
type Season = {
  id?: string;
  name: string;
  active?: boolean;
  start_date?: string;
  champion_image_url?: string | null;
  champion_image_path?: string | null;
  champion_image_updated_at?: string | null;
  lose_money?: number;
};
type Insight = { type: string; title?: string; text: string; icon?: string; playersInvolved?: string[]; rarity?: string };
type RadarData = { attack: number; defense: number; brave: number; synergy: number; form: number; experience: number };
type EloHistory = Array<{ date: string; ratings: Record<string, number> }>;

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

function expectationDeltaText(value?: number | null) {
  const delta = Math.round(value || 0);
  const absDelta = Math.abs(delta);
  if (absDelta <= 5) return 'Gần đúng kỳ vọng từ ELO';
  return delta > 0
    ? `Cao hơn kỳ vọng từ ELO ${absDelta} điểm`
    : `Thấp hơn kỳ vọng từ ELO ${absDelta} điểm`;
}

export function AnalysisCenter({
  players: initialPlayers,
  matches: initialMatches,
  seasons = [],
  playerSeasonSettings: initialPlayerSeasonSettings = [],
  activeSeason = 'Season 1',
  loseMoney = 5000,
  config: initialConfig = {},
  localOnly = false,
}: {
  players: Player[];
  matches: Match[];
  seasons?: Season[];
  playerSeasonSettings?: StoredPlayerSeasonSetting[];
  activeSeason?: string;
  loseMoney?: number;
  config?: Record<string, string>;
  localOnly?: boolean;
}) {
  const resolvedConfig = useMemo(() => ({
    ...initialConfig,
    active_season: initialConfig.active_season || activeSeason,
    lose_money: String(initialConfig.lose_money || loseMoney),
  }), [initialConfig, activeSeason, loseMoney]);

  const sharedData = useSharedAppData({
    initialPlayers,
    initialMatches,
    initialConfig: resolvedConfig,
    initialSeasons: seasons,
    initialPlayerSeasonSettings,
    routeKey: 'analysis',
    localOnly,
    fetchIfEmpty: false,
    syncOnMount: 'empty-only',
  });
  const players = sharedData.players.length > 0 ? sharedData.players as Player[] : initialPlayers;
  const allMatches = (sharedData.matches.length > 0 ? sharedData.matches : initialMatches) as Match[];
  const currentSeasons = sharedData.seasons.length > 0 ? sharedData.seasons as Season[] : seasons;
  const config = Object.keys(sharedData.config).length > 0 ? sharedData.config : initialConfig;
  const currentActiveSeason = config.active_season || activeSeason;
  const [activeNav, setActiveNav] = useState(navItems[0].id);
  const [matrixTab, setMatrixTab] = useState('partner');
  const [insightSeed, setInsightSeed] = useState<number | null>(null);
  const [insightSelectionState, setInsightSelectionState] = useState<InsightSelectionState | null>(null);
  const committedInsightSeedRef = useRef<number | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string | null>(getGlobalSelectedSeason(currentActiveSeason));

  useEffect(() => {
    if (!isGlobalSeasonSet()) {
      const id = window.setTimeout(() => setSelectedSeason(currentActiveSeason), 0);
      return () => window.clearTimeout(id);
    }
  }, [currentActiveSeason]);

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

  // Tiền phạt lose_money tính theo season
  const currentSeasonInfo = useMemo(() => {
    const seasonName = selectedSeason || currentActiveSeason;
    return currentSeasons.find(s => s.name === seasonName);
  }, [currentSeasons, selectedSeason, currentActiveSeason]);

  const currentLoseMoney = useMemo(() => {
    if (currentSeasonInfo && typeof currentSeasonInfo.lose_money === 'number') {
      return currentSeasonInfo.lose_money;
    }
    return Number(config.lose_money || loseMoney);
  }, [currentSeasonInfo, config.lose_money, loseMoney]);

  const visiblePlayers = useMemo(() => {
    const seasonForSettings = selectedSeason || currentActiveSeason;
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
  }, [players, getPlayerSetting, selectedSeason, currentActiveSeason]);

  const [playerId, setPlayerId] = useState(visiblePlayers[0]?.id || '');

  const filteredAllMatches = useMemo(() => {
    return allMatches.filter(m => {
      const matchSeason = m.season || 'Season 1';
      const isPlayerActive = (playerId: string) => getPlayerSetting(playerId, matchSeason).active;

      const isWin1Inactive = m.win_1 && !isPlayerActive(String(m.win_1));
      const isWin2Inactive = m.win_2 && !isPlayerActive(String(m.win_2));
      const isLose1Inactive = m.lose_1 && !isPlayerActive(String(m.lose_1));
      const isLose2Inactive = m.lose_2 && !isPlayerActive(String(m.lose_2));
      return !m.deleted_at && !isWin1Inactive && !isWin2Inactive && !isLose1Inactive && !isLose2Inactive;
    });
  }, [allMatches, getPlayerSetting]);

  const activeMatches = selectedSeason === null ? filteredAllMatches : filteredAllMatches.filter(m => (m.season || 'Season 1') === selectedSeason);
  const seasonOptions = Array.from(new Set([currentActiveSeason, ...currentSeasons.map(s => s.name), ...allMatches.map(m => m.season || 'Season 1')].filter(Boolean)));

  const analysisSnapshot = useMemo(() => buildAnalysisSnapshot(
    visiblePlayers,
    activeMatches,
    currentLoseMoney,
    {
      players,
      seasons: currentSeasons,
      playerSeasonSettings: sharedData.playerSeasonSettings,
      fallbackLoseMoney: currentLoseMoney,
    },
  ), [visiblePlayers, activeMatches, currentLoseMoney, players, currentSeasons, sharedData.playerSeasonSettings]);
  const hallOfFameEntries = useMemo(
    () => buildHallOfFameEntries(players, allMatches, currentSeasons, currentActiveSeason, currentLoseMoney, sharedData.playerSeasonSettings),
    [players, allMatches, currentSeasons, currentActiveSeason, currentLoseMoney, sharedData.playerSeasonSettings]
  );
  const rankingMatches = analysisSnapshot.rankingMatches;
  const elo = analysisSnapshot.elo;
  const board = analysisSnapshot.board;
  const partnerRows = analysisSnapshot.partnerEdges;
  const opponentRows = analysisSnapshot.opponentEdges;
  const effectivePlayerId = useMemo(() => {
    if (playerId && analysisSnapshot.profiles.has(playerId)) return playerId;
    return board[0]?.id || visiblePlayers[0]?.id || '';
  }, [analysisSnapshot.profiles, board, playerId, visiblePlayers]);
  const analysis = effectivePlayerId ? analysisSnapshot.profiles.get(effectivePlayerId) : undefined;

  useEffect(() => {
    if (!effectivePlayerId || playerId === effectivePlayerId) return;
    const id = window.setTimeout(() => setPlayerId(effectivePlayerId), 0);
    return () => window.clearTimeout(id);
  }, [effectivePlayerId, playerId]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const zone = new URLSearchParams(window.location.search).get('zone');
      if (zone && navItems.some(item => item.id === zone)) {
        setActiveNav(zone);
      }
    }, 0);

    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    const seedId = window.setTimeout(() => {
      setInsightSelectionState(readInsightSelectionState());
      setInsightSeed(Date.now() + Math.floor(Math.random() * 100000));
    }, 0);

    return () => window.clearTimeout(seedId);
  }, []);

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

  useEffect(() => {
    if (!insightsReady || insightSeed === null || committedInsightSeedRef.current === insightSeed) return;
    writeInsightSelectionState(insightSelectionResult.nextSelectionState);
    committedInsightSeedRef.current = insightSeed;
  }, [insightSeed, insightSelectionResult.nextSelectionState, insightsReady]);

  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => {
      const idx = navItems.findIndex(i => i.id === activeNav);
      if (idx !== -1 && idx < navItems.length - 1) setActiveNav(navItems[idx + 1].id);
    },
    onSwipedRight: () => {
      const idx = navItems.findIndex(i => i.id === activeNav);
      if (idx > 0) setActiveNav(navItems[idx - 1].id);
    },
    preventScrollOnSwipe: false,
    trackMouse: false
  });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} {...swipeHandlers} className="min-h-screen bg-slate-900">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-slate-900/92 backdrop-blur-xl border-b border-white/[0.08]">
        <div className="max-w-[1500px] mx-auto px-4 py-2">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center justify-between gap-3 lg:min-w-0 lg:justify-start">
              <Link href="/" className="inline-flex shrink-0 items-center gap-2 text-xs font-black text-white/45 transition-all hover:text-primary sm:text-sm active:scale-95">
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </Link>
              <div className="flex min-w-0 flex-1 flex-col items-end lg:flex-row lg:items-center lg:gap-2">
                <h1 className="min-w-0 truncate !text-lg !leading-tight font-black text-white sm:!text-xl lg:!text-2xl">Trung tâm phân tích</h1>
                <div className="mt-0.5 flex items-center gap-2 lg:mt-0">
                  <div className={cn(
                    "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
                    sharedData.syncState === 'syncing' ? "bg-primary/10 text-primary animate-pulse" : "bg-white/5 text-white/30"
                  )}>
                    {sharedData.syncState === 'syncing' ? (
                      <><RefreshCw className="w-3 h-3 animate-spin" /> Syncing...</>
                    ) : (
                      <><Database className="w-3 h-3" /> {activeMatches.length} cached</>
                    )}
                  </div>
                </div>
              </div>
            </div>
          
            {/* Header Controls */}
            <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center md:justify-end lg:shrink-0">
              <select
                value={selectedSeason ?? 'all'}
                onChange={e => handleSeasonChange(e.target.value === 'all' ? null : e.target.value)}
                className="h-8 w-full rounded-lg bg-slate-900 border border-white/[0.08] px-3 text-sm font-semibold text-white/70 md:w-48"
              >
                <option value="all">Tổng hợp</option>
                {seasonOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>

              <select
                value={activeNav}
                onChange={e => setActiveNav(e.target.value)}
                className="h-8 w-full rounded-lg bg-slate-900 border border-white/[0.08] px-3 text-sm font-black uppercase tracking-widest text-white/70 md:hidden"
              >
                {navItems.map(item => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>

              <div className="hidden items-center rounded-xl border border-white/[0.08] bg-slate-950/60 p-1 md:flex">
                {navItems.map(item => {
                  const Icon = item.icon;
                  const isActive = activeNav === item.id;
                  return (
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      key={item.id}
                      type="button"
                      onClick={() => setActiveNav(item.id)}
                      className={cn(
                        "inline-flex h-8 items-center gap-2 rounded-lg px-3 text-[11px] font-black uppercase tracking-widest transition-all",
                        isActive
                          ? "bg-white text-slate-950 shadow-[0_0_20px_rgba(190,242,100,0.15)]"
                          : "text-white/35 hover:bg-white/[0.04] hover:text-white/70"
                      )}
                    >
                      <Icon className={cn("h-3.5 w-3.5", isActive && "text-primary")} />
                      {item.label}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1500px] mx-auto px-4 py-4 pb-8">
        {!sharedData.hasLocalCache && (
          <div className="rounded-2xl border border-white/[0.08] bg-slate-950/60 px-5 py-6 text-center">
            <p className="text-sm font-black uppercase tracking-widest text-white/70">
              {sharedData.syncState === 'error' ? 'Không tải được dữ liệu' : 'Chưa có dữ liệu local'}
            </p>
            <p className="mt-2 text-sm font-semibold text-white/40">
              {sharedData.syncState === 'error'
                ? 'Mo Tong quan de tai lai du lieu moi nhat.'
                : 'Mo Tong quan truoc de tai du lieu vao may nay.'}
            </p>
            <Link href="/" className="mt-4 inline-flex rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-black uppercase tracking-widest text-primary hover:bg-primary/20 transition-all active:scale-95">
              Về Dashboard
            </Link>
          </div>
        )}
        
        <AnimatePresence mode="wait">
          <motion.div
            key={activeNav}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            {/* ZONE 1: Hub (Tổng quan) */}
            {sharedData.hasLocalCache && activeNav === 'hub' && (
          <HubZone 
            board={board}
            rankingMatches={rankingMatches}
            fineMatches={activeMatches}
            visiblePlayers={visiblePlayers}
            elo={elo}
            insights={insights}
            insightsReady={insightsReady}
            loseMoney={currentLoseMoney}
            players={players}
            seasons={currentSeasons}
            playerSeasonSettings={sharedData.playerSeasonSettings}
          />
        )}

        {/* ZONE 2: Hall of Fame (Vinh danh) */}
        {sharedData.hasLocalCache && activeNav === 'hall' && (
          <HallOfFame entries={hallOfFameEntries} activeSeason={currentActiveSeason} />
        )}

        {/* ZONE 5: Pairs (Cặp đôi) */}
        {sharedData.hasLocalCache && activeNav === 'pair' && (
          <PairZone
            matches={rankingMatches}
            players={visiblePlayers}
            metrics={analysisSnapshot.metrics}
            partnerEdges={analysisSnapshot.partnerEdges}
          />
        )}

        {/* ZONE 3: Profile (Cá nhân) */}
        {sharedData.hasLocalCache && activeNav === 'profile' && (
          <ProfileZone
            playerId={effectivePlayerId}
            setPlayerId={setPlayerId}
            visiblePlayers={visiblePlayers}
            analysis={analysis}
            elo={elo}
            players={players}
          />
        )}

        {/* ZONE 4: Matrix (Đối đầu) */}
        {sharedData.hasLocalCache && activeNav === 'matrix' && (
          <MatrixZone
            matrixTab={matrixTab}
            setMatrixTab={setMatrixTab}
            partnerRows={partnerRows}
            opponentRows={opponentRows}
            visiblePlayers={visiblePlayers}
            playerId={effectivePlayerId}
            setPlayerId={setPlayerId}
          />
        )}
          </motion.div>
        </AnimatePresence>
      </div>

    </motion.div>
  );
}

// ============================================
// ZONE 1: HUB (Tổng quan - Bento Grid)
// ============================================
function HubZone({
  board,
  rankingMatches,
  fineMatches,
  visiblePlayers,
  elo,
  insights,
  insightsReady,
  loseMoney,
  players,
  seasons,
  playerSeasonSettings,
}: {
  board: PlayerMetrics[];
  rankingMatches: Match[];
  fineMatches: Match[];
  visiblePlayers: Player[];
  elo: EloResult;
  insights: Insight[];
  insightsReady: boolean;
  loseMoney: number;
  players: Player[];
  seasons: Season[];
  playerSeasonSettings: FinePlayerSeasonSetting[];
}) {
  const totalFines = calculateFineTotal(fineMatches, {
    players,
    seasons,
    playerSeasonSettings,
    fallbackLoseMoney: loseMoney,
  });
  const [isEloExplainerOpen, setIsEloExplainerOpen] = useState(false);

  // Compute Weekly ELO changes
  const nowTime = new Date().getTime();
  const weekMondayStr = getVietnamWeekMondayStr(new Date(nowTime).toISOString());
  const startOfWeekMs = weekMondayStr ? new Date(weekMondayStr + 'T00:00:00+07:00').getTime() : 0;

  const getRatingAtStartOfWeek = (playerId: string): number => {
    let ratingVal = 1500;
    if (!elo.history || elo.history.length === 0) return ratingVal;
    for (let i = elo.history.length - 1; i >= 0; i--) {
      const h = elo.history[i];
      const hTime = new Date(h.date).getTime();
      if (hTime < startOfWeekMs && typeof h.ratings[playerId] === 'number') {
        ratingVal = h.ratings[playerId];
        break;
      }
    }
    return ratingVal;
  };

  const weeklyStats = board
    .map(player => {
      const startElo = getRatingAtStartOfWeek(player.id);
      const currentElo = player.rating;
      const delta = Math.round((currentElo - startElo) * 10) / 10;
      return { player, delta, currentElo, startElo };
    })
    .sort((a, b) => b.delta - a.delta || b.currentElo - a.currentElo);

  const mvpCandidate = weeklyStats[0];
  const mvp = mvpCandidate && mvpCandidate.delta > 0 ? mvpCandidate : null;

  const taVangCandidate = [...weeklyStats].sort((a, b) => a.delta - b.delta)[0];
  const taVang = taVangCandidate && taVangCandidate.delta < 0 ? taVangCandidate : null;

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Tổng trận" value={rankingMatches.length} icon={Target} color="primary" />
        <StatCard label="Thành viên" value={visiblePlayers.length} icon={User} color="blue" />
        <StatCard label="Mùa giải" value={Math.max(1, new Set(rankingMatches.map(m => m.season)).size)} icon={Award} color="purple" />
        <StatCard label="Quỹ phạt" value={`${(totalFines / 1000).toFixed(0)}k`} icon={Trophy} color="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        {/* Left Column (ELO & Performance) */}
        <div className="flex flex-col gap-4">
          <BentoCard title="Bảng xếp hạng ELO" icon={TrendingUp} className="flex flex-col">
            <div className="space-y-0.5">
              {board.slice(0, 8).map((player, index) => (
                <div key={player.id} className="flex items-center gap-2 py-1.5 border-b border-white/5 last:border-0">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-black shrink-0 shadow-inner",
                    index === 0 ? "bg-amber-500/20 text-amber-400" :
                    index === 1 ? "bg-slate-400/20 text-slate-300" :
                    index === 2 ? "bg-orange-600/20 text-orange-400" :
                    "bg-slate-800 text-white/50"
                  )}>
                    {index + 1}
                  </div>
                  <div className="flex-1 flex items-center justify-between min-w-0 pr-4">
                    <div className="font-black text-white text-base sm:text-lg truncate">{player.name}</div>
                    <div className="text-base sm:text-lg font-black text-primary shrink-0 ml-2">{player.rating}</div>
                  </div>
                  <div className="w-20 h-6 shrink-0 hidden sm:block">
                    <EloSparkline history={elo.history} playerId={player.id} />
                  </div>
                </div>
              ))}
            </div>
          </BentoCard>

          {/* Weekly ELO Performance */}
          <BentoCard title="Phong độ ELO Tuần này" icon={Flame} className="flex flex-col flex-1">
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-3 flex flex-col items-center justify-center text-center">
                <Crown className="w-6 h-6 text-amber-400 mb-1" />
                <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Vua Cày Elo</span>
                <span className="text-sm font-black text-white truncate max-w-full mt-0.5">{mvp ? mvp.player.name : '--'}</span>
                <span className="text-xs font-black text-emerald-400 mt-1">{mvp ? `+${mvp.delta}` : '0'} ELO</span>
              </div>
              <div className="bg-red-500/5 border border-red-500/10 rounded-2xl p-3 flex flex-col items-center justify-center text-center">
                <TrendingDown className="w-6 h-6 text-red-400 mb-1" />
                <span className="text-[9px] font-black text-red-400 uppercase tracking-widest">Gánh Tạ Tuần</span>
                <span className="text-sm font-black text-white truncate max-w-full mt-0.5">{taVang ? taVang.player.name : '--'}</span>
                <span className="text-xs font-black text-red-400 mt-1">{taVang ? `${taVang.delta}` : '0'} ELO</span>
              </div>
            </div>

            <div className="space-y-0.5 flex-1 pr-1">
              {weeklyStats.slice(0, 8).map(({ player, delta }) => (
                <div key={player.id} className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0 pr-2">
                  <div className="font-bold text-sm text-white/90">{player.name}</div>
                  <div className={cn(
                    "text-xs font-black tabular-nums",
                    delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-white/30"
                  )}>
                    {delta > 0 ? `+${delta}` : delta === 0 ? '0' : `${delta}`}
                  </div>
                </div>
              ))}
            </div>
          </BentoCard>
        </div>

        {/* Right Column: Expert Insights (50%) */}
        <BentoCard title="Nhận xét chuyên gia" icon={Zap} className="border-primary/30 bg-primary/5 flex flex-col h-full">
          <div className="space-y-3 flex-1 overflow-y-auto pr-1 custom-scrollbar">
            {!insightsReady ? (
              <div className="flex items-center justify-center h-full text-white/30 text-sm italic font-bold">
                Đang chốt nhận xét...
              </div>
            ) : insights.length === 0 ? (
              <div className="flex items-center justify-center h-full text-white/30 text-sm italic font-bold">
                Chưa đủ dữ liệu nổi bật
              </div>
            ) : insights.map((insight, index) => {
              const rawTitle = insight.title || 'ĐIỂM NHẤN';
              const firstSpaceIdx = rawTitle.indexOf(' ');
              const icon = (firstSpaceIdx > 0 && firstSpaceIdx <= 3) ? rawTitle.substring(0, firstSpaceIdx) : '👑';
              const textTitle = (firstSpaceIdx > 0 && firstSpaceIdx <= 3) ? rawTitle.substring(firstSpaceIdx + 1) : rawTitle;

              const rarity = insight.rarity || 'common';
              let rarityBadge = 'TIN THƯỜNG';
              let rarityBg = 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
              let borderStyle = 'border-white/5 hover:border-emerald-500/20 bg-slate-900/50';
              let iconStyle = 'border-white/5 text-emerald-400 group-hover:border-emerald-500/30';
              let gradientVia = 'hover:via-emerald-500/30';
              let glowStyle = '';

              if (rarity === 'uncommon') {
                rarityBadge = 'TIN MỚI';
                rarityBg = 'bg-blue-500/10 border-blue-500/20 text-blue-400';
                borderStyle = 'border-white/5 hover:border-blue-500/20 bg-slate-900/50';
                iconStyle = 'border-white/5 text-blue-400 group-hover:border-blue-500/30';
                gradientVia = 'hover:via-blue-500/30';
              } else if (rarity === 'rare') {
                rarityBadge = 'ĐẶC BIỆT ⭐';
                rarityBg = 'bg-amber-500/10 border-amber-500/20 text-amber-400';
                borderStyle = 'border-amber-500/10 hover:border-amber-500/30 bg-slate-900/60';
                iconStyle = 'border-amber-500/20 text-amber-400 group-hover:border-amber-500/40';
                gradientVia = 'hover:via-amber-500/45';
              } else if (rarity === 'epic') {
                rarityBadge = 'KINH ĐIỂN ⚡';
                rarityBg = 'bg-fuchsia-500/15 border-fuchsia-500/30 text-fuchsia-300 animate-pulse';
                borderStyle = 'border-fuchsia-500/15 hover:border-fuchsia-500/40 bg-slate-900/70 shadow-[0_0_20px_rgba(240,76,242,0.03)] hover:shadow-[0_0_25px_rgba(240,76,242,0.06)]';
                iconStyle = 'border-fuchsia-500/25 text-fuchsia-400 group-hover:border-fuchsia-500/50';
                gradientVia = 'hover:via-fuchsia-500/60';
                glowStyle = 'after:absolute after:inset-0 after:rounded-xl after:bg-fuchsia-500/[0.01] hover:after:bg-fuchsia-500/[0.02] after:transition-all';
              }

              return (
                <div 
                  key={`${insight.type}-${insight.playersInvolved?.join('|') || index}`} 
                  className={cn(
                    "relative p-[1px] rounded-xl bg-gradient-to-r from-transparent via-white/[0.04] to-transparent transition-all duration-500 overflow-hidden group",
                    gradientVia
                  )}
                >
                  <div className={cn(
                    "relative flex gap-3 p-3.5 rounded-[11px] border transition-all duration-300 backdrop-blur-sm select-none",
                    borderStyle,
                    glowStyle
                  )}>
                    {/* Icon container */}
                    <div className={cn(
                      "mt-0.5 w-11 h-11 rounded-full bg-slate-800/80 flex items-center justify-center shrink-0 text-xl shadow-inner border group-hover:scale-105 transition-transform duration-300",
                      iconStyle
                    )}>
                      {icon}
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                        <div className="text-[10px] font-black text-white/50 uppercase tracking-widest truncate">
                          {textTitle}
                        </div>
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border shrink-0",
                          rarityBg
                        )}>
                          {rarityBadge}
                        </span>
                      </div>
                      <p className="text-sm sm:text-base font-bold text-white/90 leading-relaxed">
                        {insight.text}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </BentoCard>
      </div>

      {/* ELO Accordion explanation */}
      <div className="rounded-2xl border border-white/5 bg-slate-900/60 overflow-hidden transition-all">
        <button
          onClick={() => setIsEloExplainerOpen(!isEloExplainerOpen)}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors text-left"
        >
          <div className="flex items-center gap-2 min-w-0">
            <HelpCircle className="w-4 h-4 text-primary shrink-0" />
            <span className="text-xs font-black text-white/70 uppercase tracking-widest">👉 Hướng dẫn tính ELO & Luật Drama tuần</span>
          </div>
          <span className={cn("text-xs text-white/30 font-bold transition-transform duration-300 shrink-0", isEloExplainerOpen && "rotate-180")}>
            ▼
          </span>
        </button>

        {isEloExplainerOpen && (
          <div className="px-5 pb-5 border-t border-white/[0.03] pt-4 text-xs text-white/60 space-y-4 leading-relaxed animate-in slide-in-from-top-2 duration-200">
            <div>
              <h4 className="font-black text-white/90 text-sm mb-1 uppercase tracking-tight text-primary">📊 ELO HOẠT ĐỘNG NHƯ THẾ NÀO?</h4>
              <p>Hệ thống điểm ELO tự động đo lường trình độ của bạn dựa trên kết quả các trận đấu, tự cân bằng theo thực lực thực tế (bắt đầu từ <strong>1500 ELO</strong>).</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <h5 className="font-bold text-white/80">1. Nguyên lý cộng/trừ ELO:</h5>
                <ul className="list-disc list-inside space-y-1">
                  <li><strong className="text-emerald-400">Thắng kèo khó</strong> (đối thủ ELO cao hơn): Cộng rất nhiều ELO.</li>
                  <li><strong>Thắng kèo dễ</strong> (đối thủ ELO thấp hơn): Cộng rất ít ELO.</li>
                  <li><strong className="text-red-400">Thua kèo dễ</strong> (thua đối thủ yếu): Bị trừ cực kỳ nặng ELO.</li>
                  <li><strong>Thua kèo khó</strong> (thua đối thủ mạnh): Bị trừ nhẹ ELO.</li>
                  <li><strong>Hiệu số bàn thắng</strong>: Thắng cách biệt lớn (ví dụ 11-1) nhận nhiều ELO hơn thắng sít sao (12-10).</li>
                </ul>
              </div>
              <div className="space-y-1.5">
                <h5 className="font-bold text-white/80">2. Hệ số K phân cấp động:</h5>
                <ul className="list-disc list-inside space-y-1">
                  <li><strong>Hệ số K</strong> là độ nhạy của ELO: K càng cao thì một trận thắng/thua làm điểm đổi càng mạnh.</li>
                  <li><strong>Người mới chơi ít trận</strong> có K cao hơn, nên ELO bắt nhịp nhanh với phong độ thật.</li>
                  <li><strong>Người đã đánh nhiều</strong> có K thấp hơn, nên ELO ổn định hơn và cần nhiều kết quả tốt/xấu liên tiếp để dịch chuyển mạnh.</li>
                </ul>
              </div>
            </div>
            <div className="border-t border-white/5 pt-3">
              <h4 className="font-black text-white/90 text-sm mb-2 uppercase tracking-tight text-primary">⚡ LUẬT DRAMA HÀNG TUẦN</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white/[0.02] border border-white/5 p-3 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                    <Flame className="w-3.5 h-3.5" /> Lên đồng
                  </div>
                  <p className="text-[10px] text-white/50 leading-relaxed">Chuỗi <strong>&ge; 3 trận thắng liên tiếp</strong>. Từ trận thứ 4 trở đi, hệ số K của bạn được <strong>nhân đôi (K x 2)</strong>. Reset khi thua.</p>
                </div>
                <div className="bg-white/[0.02] border border-white/5 p-3 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-red-400">
                    <TrendingDown className="w-3.5 h-3.5" /> Vợ mắng
                  </div>
                  <p className="text-[10px] text-white/50 leading-relaxed">Chuỗi <strong>&ge; 3 trận thua liên tiếp</strong>. Từ trận thứ 4 trở đi, ELO bị trừ khi thua tiếp theo được <strong>nhân đôi (x2)</strong>. Reset khi thắng.</p>
                </div>
                <div className="bg-white/[0.02] border border-white/5 p-3 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-amber-400">
                    <Zap className="w-3.5 h-3.5" /> Phạt trốn đấu
                  </div>
                  <p className="text-[10px] text-white/50 leading-relaxed">Cuối tuần hệ thống nhìn lại nhịp ra sân. Người đang trên mốc 1500 ELO mà đánh dưới 8 trận trong tuần sẽ bị trừ nhẹ, để bảng điểm ưu tiên phong độ được duy trì đều đặn.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getChemistryStyle(avgPointsFor: number, avgConceded: number, total: number, matches: Match[]) {
  if (total < 4) {
    return {
      style: 'Under Construction',
      label: 'Đang thử nghiệm',
      icon: '🔧',
      colorClass: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
      desc: 'Cặp đôi mới thi đấu ít trận, cần thêm mẫu để phân tích phong cách rõ ràng.'
    };
  }

  let closeGames = 0;
  let deuceGames = 0;
  matches.forEach(m => {
    const scoreDiff = Math.abs(Number(m.win_score || 0) - Number(m.lose_score || 0));
    if (scoreDiff <= 2) closeGames++;
    if (Math.max(Number(m.win_score || 0), Number(m.lose_score || 0)) > 11) deuceGames++;
  });

  const closeRate = closeGames / total;

  if (avgPointsFor >= 9.8) {
    return {
      style: 'Demolition Duo',
      label: 'Cặp đôi Hủy diệt',
      icon: '⚡',
      colorClass: 'text-amber-400 bg-amber-500/10 border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.15)]',
      desc: 'Lối chơi siêu tấn công rực lửa. Trung bình ghi điểm cực cao mỗi trận, dồn ép đối thủ liên tục.'
    };
  }
  
  if (avgConceded <= 6.8) {
    return {
      style: 'Iron Wall',
      label: 'Lá chắn Thép',
      icon: '🛡️',
      colorClass: 'text-blue-400 bg-blue-500/10 border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]',
      desc: 'Lối chơi phòng thủ vững như bàn thạch. Giữ đối thủ ở mức ghi điểm cực thấp, phòng thủ kiên cường.'
    };
  }

  if (closeRate >= 0.4) {
    return {
      style: 'Drama Kings',
      label: 'Kịch tính Nghẹt thở',
      icon: '🔥',
      colorClass: 'text-red-400 bg-red-500/10 border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.15)]',
      desc: 'Chuyên gia của các trận đấu nghẹt thở. Hầu hết các trận đấu đều bám đuổi sát nút và giằng co kịch tính.'
    };
  }

  if (deuceGames > 0) {
    return {
      style: 'Deuce Masters',
      label: 'Vua Giằng co',
      icon: '⚔️',
      colorClass: 'text-purple-400 bg-purple-500/10 border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.15)]',
      desc: 'Rất có duyên với loạt chạm điểm phụ (deuce). Thường thi đấu bền bỉ và vượt qua áp lực ở thời điểm quyết định.'
    };
  }

  return {
    style: 'Harmonious Combo',
    label: 'Cân bằng Hài hòa',
    icon: '⚖️',
    colorClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]',
    desc: 'Lối chơi công thủ toàn diện, phân phối sức và phối hợp đồng đều ở mọi góc sân.'
  };
}

function getEloSynergy(
  player1Id: string, 
  player2Id: string, 
  metrics: Map<string, PlayerMetrics>, 
  partnerEdges: AnalysisEdge[]
) {
  const p1Metric = metrics.get(player1Id);
  const p2Metric = metrics.get(player2Id);
  
  const elo1 = p1Metric?.rating ?? 1200;
  const elo2 = p2Metric?.rating ?? 1200;
  
  const gap = Math.abs(elo1 - elo2);
  const avgElo = (elo1 + elo2) / 2;
  
  const isCarry = gap >= 150;
  const relationshipLabel = isCarry ? 'Gánh tạ vượt khó' : 'Song kiếm hợp bích';
  const relationshipDesc = isCarry 
    ? 'Chênh lệch ELO lớn. Một người sắm vai chủ lực gánh vác, người kia hỗ trợ đắc lực.' 
    : 'Trình độ ELO tương đồng. Phối hợp nhịp nhàng, chia sẻ nhiệm vụ đồng đều trên sân.';

  // Tìm impact hai chiều từ partnerEdges
  const edge1_2 = partnerEdges.find(e => e.playerId === player1Id && e.otherId === player2Id);
  const edge2_1 = partnerEdges.find(e => e.playerId === player2Id && e.otherId === player1Id);

  const impact1 = edge1_2?.impact ?? 0;
  const impact2 = edge2_1?.impact ?? 0;

  return {
    elo1,
    elo2,
    gap,
    avgElo,
    isCarry,
    relationshipLabel,
    relationshipDesc,
    impact1,
    impact2,
    p1Name: p1Metric?.name ?? player1Id,
    p2Name: p2Metric?.name ?? player2Id,
  };
}

function PairZone({ 
  matches, 
  players, 
  metrics, 
  partnerEdges 
}: { 
  matches: Match[]; 
  players: Player[]; 
  metrics: Map<string, PlayerMetrics>;
  partnerEdges: AnalysisEdge[];
}) {
  const [isPairsExplainerOpen, setIsPairsExplainerOpen] = useState(false);
  const [expandedPairKey, setExpandedPairKey] = useState<string | null>(null);
  
  const pairMap = new Map<string, {
    player1Id: string;
    player1Name: string;
    player2Id: string;
    player2Name: string;
    wins: number;
    losses: number;
    pointsFor: number;
    pointsConceded: number;
    matches: Match[];
  }>();

  const getPlayerName = (id: string) => players.find(p => p.id === id)?.name || id;

  matches.forEach(m => {
    const w1 = m.win_1;
    const w2 = m.win_2;
    const l1 = m.lose_1;
    const l2 = m.lose_2;
    if (!w1 || !w2 || !l1 || !l2) return;
    if (isGuestId(w1) || isGuestId(w2) || isGuestId(l1) || isGuestId(l2)) return;

    const winPair = [w1, w2].sort();
    const winKey = winPair.join('_');
    const winStat = pairMap.get(winKey) || {
      player1Id: winPair[0],
      player1Name: getPlayerName(winPair[0]),
      player2Id: winPair[1],
      player2Name: getPlayerName(winPair[1]),
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsConceded: 0,
      matches: [],
    };
    winStat.wins++;
    winStat.pointsFor += Number(m.win_score || 0);
    winStat.pointsConceded += Number(m.lose_score || 0);
    winStat.matches.push(m);
    pairMap.set(winKey, winStat);

    const losePair = [l1, l2].sort();
    const loseKey = losePair.join('_');
    const loseStat = pairMap.get(loseKey) || {
      player1Id: losePair[0],
      player1Name: getPlayerName(losePair[0]),
      player2Id: losePair[1],
      player2Name: getPlayerName(losePair[1]),
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsConceded: 0,
      matches: [],
    };
    loseStat.losses++;
    loseStat.pointsFor += Number(m.lose_score || 0);
    loseStat.pointsConceded += Number(m.win_score || 0);
    loseStat.matches.push(m);
    pairMap.set(loseKey, loseStat);
  });

  const pairs = Array.from(pairMap.values())
    .map(p => {
      const total = p.wins + p.losses;
      const winRate = total > 0 ? (p.wins / total) * 100 : 0;
      const points = (p.wins - p.losses) * 15 + winRate;
      const avgPointsFor = total > 0 ? p.pointsFor / total : 0;
      const avgConceded = total > 0 ? p.pointsConceded / total : 0;
      return {
        player1Id: p.player1Id,
        player1Name: p.player1Name,
        player2Id: p.player2Id,
        player2Name: p.player2Name,
        total,
        wins: p.wins,
        losses: p.losses,
        winRate,
        points: Math.round(points * 10) / 10,
        pointsFor: p.pointsFor,
        pointsConceded: p.pointsConceded,
        avgPointsFor,
        avgConceded,
        matches: p.matches,
      };
    })
    .filter(p => p.total >= 3);

  const capBaiTrung = [...pairs].sort((a, b) => b.points - a.points || b.total - a.total)[0] || null;
  const capTriKy = [...pairs].sort((a, b) => b.total - a.total || b.points - a.points)[0] || null;
  const laChanThep = [...pairs].sort((a, b) => a.avgConceded - b.avgConceded || b.total - a.total)[0] || null;

  const rankedPairs = [...pairs].sort((a, b) => b.points - a.points || b.total - a.total).slice(0, 10);

  if (pairs.length === 0) {
    return (
      <div className="glass p-20 rounded-[2.5rem] text-center border border-white/5">
        <p className="text-white/20 font-black uppercase tracking-[0.4em] text-sm">Chưa có đủ cặp đôi thi đấu từ 3 trận trở lên</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1 */}
        <div className="relative p-[1px] rounded-xl bg-gradient-to-r from-amber-500/20 via-yellow-500/40 to-amber-500/20 overflow-hidden shadow-xl">
          <div className="relative bg-slate-950/95 backdrop-blur-md rounded-[11px] p-2.5 flex flex-col justify-center h-full">
            <div className="flex items-center gap-1.5 mb-1.5 border-b border-white/5 pb-1.5">
              <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-[11px] font-black text-amber-400 uppercase tracking-wider">Cặp Bài Trùng</span>
              {capBaiTrung && (
                <span className="text-sm font-black text-primary ml-auto italic tabular-nums">{capBaiTrung.points}đ</span>
              )}
            </div>
            {capBaiTrung ? (
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-black text-white truncate max-w-[65%]" title={`${capBaiTrung.player1Name} & ${capBaiTrung.player2Name}`}>
                  {capBaiTrung.player1Name} & {capBaiTrung.player2Name}
                </h3>
                <span className="text-[10px] text-white/40 font-bold shrink-0 tabular-nums">
                  {capBaiTrung.wins}W-{capBaiTrung.losses}L ({capBaiTrung.winRate.toFixed(0)}%)
                </span>
              </div>
            ) : (
              <p className="text-white/30 text-xs italic">Chưa xác định</p>
            )}
          </div>
        </div>

        {/* Card 2 */}
        <div className="relative p-[1px] rounded-xl bg-gradient-to-r from-purple-500/20 via-pink-500/40 to-purple-500/20 overflow-hidden shadow-xl">
          <div className="relative bg-slate-950/95 backdrop-blur-md rounded-[11px] p-2.5 flex flex-col justify-center h-full">
            <div className="flex items-center gap-1.5 mb-1.5 border-b border-white/5 pb-1.5">
              <Heart className="w-3.5 h-3.5 text-pink-400 shrink-0" />
              <span className="text-[11px] font-black text-pink-400 uppercase tracking-wider">Cặp Tri Kỷ</span>
              {capTriKy && (
                <span className="text-sm font-black text-primary ml-auto italic tabular-nums">{capTriKy.total} trận</span>
              )}
            </div>
            {capTriKy ? (
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-black text-white truncate max-w-[65%]" title={`${capTriKy.player1Name} & ${capTriKy.player2Name}`}>
                  {capTriKy.player1Name} & {capTriKy.player2Name}
                </h3>
                <span className="text-[10px] text-white/40 font-bold shrink-0 tabular-nums">
                  {capTriKy.wins}W-{capTriKy.losses}L ({capTriKy.winRate.toFixed(0)}%)
                </span>
              </div>
            ) : (
              <p className="text-white/30 text-xs italic">Chưa xác định</p>
            )}
          </div>
        </div>

        {/* Card 3 */}
        <div className="relative p-[1px] rounded-xl bg-gradient-to-r from-blue-500/20 via-cyan-500/40 to-blue-500/20 overflow-hidden shadow-xl">
          <div className="relative bg-slate-950/95 backdrop-blur-md rounded-[11px] p-2.5 flex flex-col justify-center h-full">
            <div className="flex items-center gap-1.5 mb-1.5 border-b border-white/5 pb-1.5">
              <Shield className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="text-[11px] font-black text-blue-400 uppercase tracking-wider">Lá Chắn Thép</span>
              {laChanThep && (
                <span className="text-sm font-black text-primary ml-auto italic tabular-nums">{laChanThep.avgConceded.toFixed(1)}đ/trận</span>
              )}
            </div>
            {laChanThep ? (
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-black text-white truncate max-w-[65%]" title={`${laChanThep.player1Name} & ${laChanThep.player2Name}`}>
                  {laChanThep.player1Name} & {laChanThep.player2Name}
                </h3>
                <span className="text-[10px] text-white/40 font-bold shrink-0 tabular-nums">
                  Lọt: {laChanThep.pointsConceded}đ/{laChanThep.total}tr
                </span>
              </div>
            ) : (
              <p className="text-white/30 text-xs italic">Chưa xác định</p>
            )}
          </div>
        </div>
      </div>

      {/* Pairs Accordion explanation */}
      <div className="rounded-2xl border border-white/5 bg-slate-900/60 overflow-hidden transition-all">
        <button
          onClick={() => setIsPairsExplainerOpen(!isPairsExplainerOpen)}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-primary" />
            <span className="text-xs font-black text-white/70 uppercase tracking-widest">👉 Hướng dẫn cơ chế tính điểm & Xếp hạng Cặp đôi</span>
          </div>
          <span className={cn("text-xs text-white/30 font-bold transition-transform duration-300", isPairsExplainerOpen && "rotate-180")}>
            ▼
          </span>
        </button>

        {isPairsExplainerOpen && (
          <div className="px-5 pb-5 border-t border-white/[0.03] pt-4 text-xs text-white/60 space-y-4 leading-relaxed animate-in slide-in-from-top-2 duration-200">
            <div>
              <h4 className="font-black text-white/90 text-sm mb-1 uppercase tracking-tight text-primary">📈 CÔNG THỨC TÍNH ĐIỂM TÍCH LŨY CẶP ĐÔI</h4>
              <p>Điểm xếp hạng cặp đôi được tính tự động dựa trên hiệu số trận thắng-thua và tỷ lệ thắng thực tế khi hai người cùng đứng chung sân:</p>
              <div className="bg-slate-950/40 p-3 rounded-xl border border-white/[0.03] font-mono text-center text-sm font-black text-primary my-2 italic">
                Điểm tích lũy = (Thắng - Thua) x 15 + Tỷ lệ thắng (%)
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <h5 className="font-bold text-white/80">1. Quy tắc tính điểm:</h5>
                <ul className="list-disc list-inside space-y-1">
                  <li><strong>Hiệu số thắng-thua</strong> đóng vai trò chủ đạo (mỗi trận thắng chênh lệch mang lại <strong>15 điểm</strong>), khuyến khích các cặp đôi thi đấu nhiều trận.</li>
                  <li><strong>Tỷ lệ thắng</strong> đóng vai trò làm điểm phụ để phân thứ hạng khi các cặp đôi có cùng hiệu số trận đấu.</li>
                </ul>
              </div>
              <div className="space-y-1.5">
                <h5 className="font-bold text-white/80">2. Điều kiện xếp hạng & Vinh danh:</h5>
                <ul className="list-disc list-inside space-y-1">
                  <li>Cặp đôi phải thi đấu <strong>tối thiểu 3 trận chung</strong> cùng nhau trong mùa giải hiện tại để được đưa vào danh sách xếp hạng.</li>
                  <li>Cặp dẫn đầu BXH điểm tích lũy sẽ nhận cúp vinh danh <strong>🏆 Cặp Bài Trùng</strong> trên bục vinh quang.</li>
                </ul>
              </div>
            </div>
            <div className="border-t border-white/5 pt-3">
              <span className="font-bold text-white/80">Ví dụ cụ thể:</span> Cặp đôi X và Y đánh chung 6 trận, thắng 4 trận, thua 2 trận (tỷ lệ thắng 66.7%).
              <br />
              Điểm tích lũy = <code className="text-primary font-bold">(4 - 2) x 15 + 66.7 = 30 + 66.7 = 96.7 điểm</code>.
            </div>
          </div>
        )}
      </div>

      <BentoCard title="Bảng xếp hạng Cặp Đôi (Tối thiểu 3 trận chung)" icon={Users}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[650px] lg:min-w-full">
            <thead>
              <tr className="border-b border-white/5 text-[10px] font-black text-white/35 uppercase tracking-widest font-bold select-none">
                <th className="py-3 px-4 w-16 text-center">
                  <div className="group relative inline-flex items-center justify-center gap-1 cursor-help w-full">
                    <span>Hạng</span>
                    <HelpCircle className="w-3 h-3 text-white/30 hover:text-white/60" />
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block w-40 bg-slate-950 border border-white/10 p-2 rounded-lg shadow-2xl z-50 text-[9px] font-bold text-white/70 normal-case text-center">
                      Thứ hạng cặp đôi trong mùa giải này.
                    </div>
                  </div>
                </th>
                <th className="py-3 px-4">Cặp đôi</th>
                <th className="py-3 px-4 text-center">
                  <div className="group relative inline-flex items-center justify-center gap-1 cursor-help w-full">
                    <span>Số trận</span>
                    <HelpCircle className="w-3 h-3 text-white/30 hover:text-white/60" />
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block w-40 bg-slate-950 border border-white/10 p-2 rounded-lg shadow-2xl z-50 text-[9px] font-bold text-white/70 normal-case text-center">
                      Tổng số trận thi đấu chung (tối thiểu 3 trận).
                    </div>
                  </div>
                </th>
                <th className="py-3 px-4 text-center">
                  <div className="group relative inline-flex items-center justify-center gap-1 cursor-help w-full">
                    <span>Hiệu số</span>
                    <HelpCircle className="w-3 h-3 text-white/30 hover:text-white/60" />
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block w-40 bg-slate-950 border border-white/10 p-2 rounded-lg shadow-2xl z-50 text-[9px] font-bold text-white/70 normal-case text-center">
                      Số trận thắng trừ số trận thua của cặp đôi.
                    </div>
                  </div>
                </th>
                <th className="py-3 px-4 text-center">
                  <div className="group relative inline-flex items-center justify-center gap-1 cursor-help w-full">
                    <span>Tỷ lệ thắng</span>
                    <HelpCircle className="w-3 h-3 text-white/30 hover:text-white/60" />
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block w-48 bg-slate-950 border border-white/10 p-2 rounded-lg shadow-2xl z-50 text-[9px] font-bold text-white/70 normal-case text-center font-normal">
                      Tỉ lệ phần trăm chiến thắng khi đi chung sân.
                    </div>
                  </div>
                </th>
                <th className="py-3 px-4 text-center">
                  <div className="group relative inline-flex items-center justify-center gap-1 cursor-help w-full">
                    <span>Trung bình Công/Thủ</span>
                    <HelpCircle className="w-3 h-3 text-white/30 hover:text-white/60" />
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block w-56 bg-slate-950 border border-white/10 p-2 rounded-lg shadow-2xl z-50 text-[9px] font-bold text-white/70 normal-case text-center font-normal">
                      <strong>Công:</strong> Điểm ghi được trung bình.<br/><strong>Thủ:</strong> Điểm lọt lưới trung bình.
                    </div>
                  </div>
                </th>
                <th className="py-3 px-4 text-right">
                  <div className="group relative inline-flex items-center justify-end gap-1 cursor-help w-full">
                    <span>Điểm tích lũy</span>
                    <HelpCircle className="w-3 h-3 text-white/30 hover:text-white/60" />
                    <div className="absolute top-full right-0 mt-2 hidden group-hover:block w-56 bg-slate-950 border border-white/10 p-2 rounded-lg shadow-2xl z-50 text-[9px] font-bold text-white/70 normal-case text-center font-normal">
                      Tính điểm xếp hạng cặp đôi:<br/><code>(Thắng - Thua) x 15 + Tỷ lệ thắng (%)</code>.
                    </div>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {rankedPairs.map((pair, index) => {
                const diff = pair.wins - pair.losses;
                const pairKey = `${pair.player1Id}_${pair.player2Id}`;
                const isExpanded = expandedPairKey === pairKey;
                return (
                  <Fragment key={pairKey}>
                    <tr 
                      onClick={() => setExpandedPairKey(isExpanded ? null : pairKey)}
                      className={cn(
                        "border-b border-white/5 last:border-0 hover:bg-white/[0.02] cursor-pointer transition-all duration-200 select-none",
                        isExpanded && "bg-white/[0.015]"
                      )}
                    >
                      <td className="py-4 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span className={cn(
                            "text-[8px] transition-transform duration-200 text-white/20 shrink-0",
                            isExpanded && "rotate-90 text-primary"
                          )}>
                            ▶
                          </span>
                          <span className={cn(
                            "w-6 h-6 rounded-full inline-flex items-center justify-center text-xs font-black shrink-0",
                            index === 0 ? "bg-amber-500/20 text-amber-400" :
                            index === 1 ? "bg-slate-400/20 text-slate-300" :
                            index === 2 ? "bg-orange-600/20 text-orange-400" :
                            "text-white/40"
                          )}>
                            {index + 1}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4 font-bold">
                        <div className="text-sm font-black text-white leading-snug">{pair.player1Name}</div>
                        <div className="text-sm font-black text-white leading-snug">{pair.player2Name}</div>
                      </td>
                      <td className="py-4 px-4 text-center font-bold text-white/80 tabular-nums">{pair.total}</td>
                      <td className="py-4 px-4 text-center tabular-nums">
                        <span className={cn(
                          "text-xs font-black px-2 py-1 rounded-lg",
                          diff > 0 ? "bg-emerald-500/10 text-emerald-400" : diff < 0 ? "bg-red-500/10 text-red-400" : "bg-white/5 text-white/45"
                        )}>
                          {diff > 0 ? `+${diff}` : diff}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-center font-black text-white/80 tabular-nums">{pair.winRate.toFixed(1)}%</td>
                      <td className="py-4 px-4 text-center text-[10px] font-bold text-white/40 leading-snug">
                        Công: {pair.avgPointsFor.toFixed(1)}đ <br />
                        Thủ: {pair.avgConceded.toFixed(1)}đ
                      </td>
                      <td className="py-4 px-4 text-right">
                        <span className="text-sm font-black text-primary italic tabular-nums">{pair.points}đ</span>
                        <div className="text-[8px] text-white/20 font-bold uppercase tracking-tighter mt-0.5">
                          ({diff} x 15) + {pair.winRate.toFixed(0)}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b border-white/5 bg-slate-950/25">
                        <td colSpan={7} className="p-0">
                          {(() => {
                            const chem = getChemistryStyle(pair.avgPointsFor, pair.avgConceded, pair.total, pair.matches);
                            const synergy = getEloSynergy(pair.player1Id, pair.player2Id, metrics, partnerEdges);
                            const recent5 = pair.matches.slice(0, 5);

                            return (
                              <div className="p-3 sm:p-4 bg-slate-900/40 rounded-xl border border-white/[0.03] m-1 animate-in fade-in slide-in-from-top-4 duration-300">
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
                                  
                                  <div className="space-y-3">
                                    <div className="flex items-center gap-2 pb-1.5 border-b border-white/[0.05]">
                                      <Users className="w-4 h-4 text-primary" />
                                      <h4 className="text-xs font-black text-white uppercase tracking-wider">Hợp tác ELO</h4>
                                    </div>

                                    <div className="space-y-1 text-xs">
                                      <div className="flex justify-between items-center py-1.5 border-b border-white/[0.02]">
                                        <span className="text-white/60 font-bold truncate max-w-[120px] sm:max-w-none">{pair.player1Name}</span>
                                        <div className="flex items-center gap-2 font-mono relative group">
                                          <span className="text-white">{Math.round(synergy.elo1)} ELO</span>
                                          <span className={cn(
                                            "font-black px-1.5 py-0.5 rounded text-[10px] tracking-tight cursor-help border select-none",
                                            synergy.impact1 > 0 ? "bg-green-500/10 text-green-400 border-green-500/20" : 
                                            synergy.impact1 < 0 ? "bg-red-500/10 text-red-400 border-red-500/20" : 
                                            "bg-white/5 text-white/40 border-white/10"
                                          )}>
                                            {synergy.impact1 > 0 ? `+${synergy.impact1}%` : synergy.impact1 < 0 ? `${synergy.impact1}%` : 'Ổn định'}
                                          </span>
                                          <div className="absolute right-0 bottom-full mb-1.5 hidden group-hover:block w-48 bg-slate-950 border border-white/10 p-2 rounded-lg shadow-2xl z-50 text-[10px] font-normal text-white/70 normal-case leading-relaxed text-center">
                                            <p className="font-bold text-primary mb-0.5 uppercase">Hiệu suất cộng thêm</p>
                                            Thể hiện năng lực của <strong>{pair.player1Name}</strong> tăng/giảm bao nhiêu % khi đánh cùng đồng đội này so với điểm phong độ trung bình.
                                          </div>
                                        </div>
                                      </div>

                                      <div className="flex justify-between items-center py-1.5 border-b border-white/[0.02]">
                                        <span className="text-white/60 font-bold truncate max-w-[120px] sm:max-w-none">{pair.player2Name}</span>
                                        <div className="flex items-center gap-2 font-mono relative group">
                                          <span className="text-white">{Math.round(synergy.elo2)} ELO</span>
                                          <span className={cn(
                                            "font-black px-1.5 py-0.5 rounded text-[10px] tracking-tight cursor-help border select-none",
                                            synergy.impact2 > 0 ? "bg-green-500/10 text-green-400 border-green-500/20" : 
                                            synergy.impact2 < 0 ? "bg-red-500/10 text-red-400 border-red-500/20" : 
                                            "bg-white/5 text-white/40 border-white/10"
                                          )}>
                                            {synergy.impact2 > 0 ? `+${synergy.impact2}%` : synergy.impact2 < 0 ? `${synergy.impact2}%` : 'Ổn định'}
                                          </span>
                                          <div className="absolute right-0 bottom-full mb-1.5 hidden group-hover:block w-48 bg-slate-950 border border-white/10 p-2 rounded-lg shadow-2xl z-50 text-[10px] font-normal text-white/70 normal-case leading-relaxed text-center">
                                            <p className="font-bold text-primary mb-0.5 uppercase">Hiệu suất cộng thêm</p>
                                            Thể hiện năng lực của <strong>{pair.player2Name}</strong> tăng/giảm bao nhiêu % khi đánh cùng đồng đội này so với điểm phong độ trung bình.
                                          </div>
                                        </div>
                                      </div>

                                      <div className="flex justify-between items-center py-1.5 border-b border-white/[0.02] relative group">
                                        <span className="text-white/40 font-bold uppercase tracking-wider">Tương quan</span>
                                        <span className="text-primary font-black uppercase tracking-wider cursor-help border-b border-dashed border-primary/40 pb-0.5 select-none">{synergy.relationshipLabel}</span>
                                        <div className="absolute left-0 bottom-full mb-1.5 hidden group-hover:block w-56 bg-slate-950 border border-white/10 p-2.5 rounded-lg shadow-2xl z-50 text-[10px] font-normal text-white/70 normal-case leading-relaxed text-left">
                                          <p className="font-bold text-primary mb-1 uppercase">{synergy.relationshipLabel}</p>
                                          {synergy.relationshipDesc}
                                          <div className="mt-1 text-[9px] text-white/40 border-t border-white/5 pt-1 font-bold">
                                            * Song kiếm: lệch ELO &lt; 150. Gánh tạ: lệch ELO &ge; 150.
                                          </div>
                                        </div>
                                      </div>

                                      <div className="flex justify-between items-center py-1.5">
                                        <span className="text-white/40 font-bold uppercase tracking-wider">ELO Trung bình</span>
                                        <span className="text-white font-black">{Math.round(synergy.avgElo)} ELO</span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    <div className="flex items-center gap-2 pb-1.5 border-b border-white/[0.05] relative group">
                                      <span className="text-sm shrink-0">{chem.icon}</span>
                                      <h4 className="text-xs font-black text-white uppercase tracking-wider truncate cursor-help border-b border-dashed border-white/20 pb-0.5 select-none">
                                        Phong cách: <span className={cn("normal-case ml-1 font-bold", chem.colorClass.split(" ")[0])}>{chem.label}</span>
                                      </h4>
                                      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 hidden group-hover:block w-64 bg-slate-950 border border-white/10 p-2.5 rounded-lg shadow-2xl z-50 text-[10px] font-normal text-white/70 normal-case leading-relaxed text-left">
                                        <p className="font-bold text-primary mb-1 uppercase">PHONG CÁCH CHIẾN THUẬT</p>
                                        Phân loại lối chơi của cặp đôi dựa trên điểm số thực tế:
                                        <ul className="list-disc list-inside mt-1 space-y-1">
                                          <li><strong>⚡ Hủy diệt:</strong> Tấn công mạnh mẽ, trung bình ghi &ge; 9.8 điểm.</li>
                                          <li><strong>🛡️ Lá chắn Thép:</strong> Phòng ngự vững chãi, chỉ lọt &le; 6.8 điểm.</li>
                                          <li><strong>🔥 Kịch tính:</strong> Trận sát nút (&le; 2 điểm) &ge; 40%.</li>
                                          <li><strong>⚔️ Vua Giằng co:</strong> Từng kéo đối thủ vào chạm deuce (&gt; 11).</li>
                                        </ul>
                                      </div>
                                    </div>

                                    <div className="pt-0.5">
                                      <p className="text-xs text-white/60 leading-relaxed bg-white/[0.02] p-3 rounded-xl border border-white/[0.03] min-h-[76px] flex items-center">
                                        {chem.desc}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    <div className="flex items-center gap-2 pb-1.5 border-b border-white/[0.05]">
                                      <History className="w-4 h-4 text-primary" />
                                      <h4 className="text-xs font-black text-white uppercase tracking-wider">5 trận chung gần nhất</h4>
                                    </div>

                                    <div className="space-y-1">
                                      {recent5.length > 0 ? (
                                        recent5.map((match, idx) => {
                                          const isWin = [match.win_1, match.win_2].includes(pair.player1Id) || [match.win_1, match.win_2].includes(pair.player2Id);
                                          const scoreStr = isWin 
                                            ? `${match.win_score}-${match.lose_score}` 
                                            : `${match.lose_score}-${match.win_score}`;
                                          
                                          const w1 = match.win_1 || '';
                                          const w2 = match.win_2 || '';
                                          const l1 = match.lose_1 || '';
                                          const l2 = match.lose_2 || '';
                                          
                                          let opponents: string[] = [];
                                          if (isWin) {
                                            opponents = [getPlayerName(l1)];
                                            if (l2 && !isGuestId(l2)) opponents.push(getPlayerName(l2));
                                          } else {
                                            opponents = [getPlayerName(w1)];
                                            if (w2 && !isGuestId(w2)) opponents.push(getPlayerName(w2));
                                          }
                                          const opponentsStr = opponents.join(' & ');

                                          return (
                                            <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-white/[0.02] last:border-0">
                                              <div className="flex items-center gap-2 min-w-0">
                                                <span className={cn(
                                                  "w-4.5 h-4.5 inline-flex items-center justify-center rounded text-[9px] font-black shrink-0",
                                                  isWin ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                                                )}>
                                                  {isWin ? 'W' : 'L'}
                                                </span>
                                                <span className="text-white font-bold tabular-nums shrink-0">{scoreStr}</span>
                                                <span className="text-white/45 truncate">vs {opponentsStr}</span>
                                              </div>
                                              {match.date && (
                                                <span className="text-[9px] text-white/20 shrink-0 ml-2 font-mono">
                                                  {new Date(match.date).toLocaleDateString('vi-VN', { month: '2-digit', day: '2-digit' })}
                                                </span>
                                              )}
                                            </div>
                                          );
                                        })
                                      ) : (
                                        <div className="text-center text-white/30 text-xs py-4 italic">Chưa có trận nào được ghi nhận.</div>
                                      )}
                                    </div>
                                  </div>

                                </div>
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </BentoCard>
    </div>
  );
}

function HallOfFame({ entries, activeSeason }: { entries: HallOfFameEntry[]; activeSeason: string }) {
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  const columnCount = useHallColumnCount();
  const selectedEntry = entries.find(entry => entry.season === selectedSeason) || null;
  const rows = useMemo(() => chunkHallEntries(entries, columnCount), [entries, columnCount]);

  return (
    <section className="relative overflow-hidden rounded-[1.75rem] border border-amber-300/25 bg-slate-800/90 shadow-[0_30px_100px_rgba(0,0,0,0.34)] animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/60 to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(251,191,36,0.10),transparent_34%),radial-gradient(circle_at_90%_24%,rgba(34,197,94,0.06),transparent_30%)]" />

      <div className="relative p-4 sm:p-7 lg:p-8">
        <div className="mb-5 flex flex-col gap-2 border-b border-white/[0.06] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[10px] sm:text-xs font-black uppercase tracking-[0.22em] sm:tracking-[0.34em] text-amber-200/70">
              Hall of Fame
            </div>
            <h2 className="mt-1 text-3xl sm:text-4xl lg:text-5xl font-black uppercase tracking-[0.06em] sm:tracking-[0.12em] text-white">
              Bảng Vinh Danh
            </h2>
          </div>
          <div className="w-fit rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1 text-xs font-black text-white/45">
            {entries.length > 0 ? `${entries.length} mùa đã ghi danh` : 'Chờ mùa đầu tiên khép lại'}
          </div>
        </div>

        {activeSeason && (
          <div className="mb-4 rounded-2xl border border-primary/20 bg-primary/10 p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-primary/80">{activeSeason}</div>
              </div>
              <div className="text-sm font-black text-white">Đang diễn ra</div>
            </div>
            <div className="mt-1 text-xs font-bold text-white/40">Chưa ghi danh champion cho Season hiện tại.</div>
          </div>
        )}

        {entries.length === 0 ? (
          <div className="rounded-3xl border border-amber-300/20 bg-slate-950/35 p-6 text-center sm:p-10">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-200/25 bg-amber-200/10 text-amber-100">
              <Medal className="h-8 w-8" />
            </div>
            <div className="text-2xl font-black uppercase tracking-[0.08em] text-white">Chưa có nhà vô địch</div>
            <p className="mx-auto mt-3 max-w-xl text-sm font-bold leading-relaxed text-white/45">
              Season đầu tiên sẽ được lưu vào Bảng Vinh Danh sau khi khép lại.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((row, rowIndex) => {
              const rowHasSelected = row.some(entry => entry.season === selectedSeason);
              const rowGridClass = row.length >= 3
                ? "grid grid-cols-1 gap-3 lg:grid-cols-3"
                : row.length === 2
                  ? "grid grid-cols-1 gap-3 lg:grid-cols-2"
                  : "grid grid-cols-1 gap-3";
              return (
                <div key={`hall-row-${rowIndex}`} className="space-y-3">
                  <div className={cn(rowGridClass, row.length === 1 && "max-w-[420px]")}>
                    {row.map((entry, index) => (
                      <ChampionGalleryCard
                        key={entry.season}
                        entry={entry}
                        selected={entry.season === selectedSeason}
                        isLatest={rowIndex === 0 && index === 0}
                        onSelect={() => setSelectedSeason(current => current === entry.season ? null : entry.season)}
                      />
                    ))}
                  </div>
                  <HallDetailPanel entry={rowHasSelected ? selectedEntry : null} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function useHallColumnCount() {
  const [columnCount, setColumnCount] = useState(1);

  useEffect(() => {
    const update = () => {
      if (window.matchMedia('(min-width: 2200px)').matches) {
        setColumnCount(3);
      } else if (window.matchMedia('(min-width: 1024px)').matches) {
        setColumnCount(2);
      } else {
        setColumnCount(1);
      }
    };

    update();
    const wide = window.matchMedia('(min-width: 2200px)');
    const medium = window.matchMedia('(min-width: 1024px)');
    wide.addEventListener('change', update);
    medium.addEventListener('change', update);
    return () => {
      wide.removeEventListener('change', update);
      medium.removeEventListener('change', update);
    };
  }, []);

  return columnCount;
}

function chunkHallEntries(entries: HallOfFameEntry[], size: number) {
  const rows: HallOfFameEntry[][] = [];
  for (let index = 0; index < entries.length; index += size) {
    rows.push(entries.slice(index, index + size));
  }
  return rows;
}

function useCachedHallImage(entry: HallOfFameEntry | null) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    async function resolveImage() {
      await Promise.resolve();
      if (!cancelled) setImageUrl(null);

      if (!entry?.imageUrl || !entry.imagePath) {
        if (entry?.season) {
          try {
            await removeHallImageLocal(entry.season);
          } catch {
            // Local image cache is best effort.
          }
        }
        return;
      }

      const imageUpdatedAt = entry.imageUpdatedAt || '';
      try {
        const cached = await getHallImageLocal(entry.season);
        if (
          cached &&
          cached.imagePath === entry.imagePath &&
          cached.imageUpdatedAt === imageUpdatedAt
        ) {
          objectUrl = URL.createObjectURL(cached.blob);
          if (!cancelled) setImageUrl(objectUrl);
          return;
        }

        const response = await fetch(entry.imageUrl, { cache: 'force-cache' });
        if (!response.ok) throw new Error('Image fetch failed');
        const blob = await response.blob();
        await saveHallImageLocal({
          season: entry.season,
          imagePath: entry.imagePath,
          imageUpdatedAt,
          blob,
          cachedAt: Date.now(),
        });
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setImageUrl(objectUrl);
      } catch (error) {
        console.warn('Hall image cache failed:', error);
        if (!cancelled) setImageUrl(entry.imageUrl);
      }
    }

    void resolveImage();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [entry?.imagePath, entry?.imageUpdatedAt, entry?.imageUrl, entry?.season]);

  return imageUrl;
}

function ChampionGalleryCard({
  entry,
  selected,
  isLatest,
  onSelect,
}: {
  entry: HallOfFameEntry;
  selected: boolean;
  isLatest: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group min-h-[172px] min-w-0 rounded-2xl border bg-slate-950/32 p-4 text-left transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-amber-300/45 hover:bg-white/[0.06] hover:shadow-[0_16px_48px_rgba(251,191,36,0.10)] active:scale-[0.99] sm:min-h-[196px]",
        selected
          ? "border-amber-300/60 bg-amber-300/[0.075] shadow-[0_0_0_1px_rgba(251,191,36,0.10),0_20px_58px_rgba(251,191,36,0.12)]"
          : isLatest
            ? "border-amber-300/32"
            : "border-white/[0.07]",
      )}
    >
      <div className="grid h-full grid-cols-[98px_minmax(0,1fr)] gap-4 sm:grid-cols-[132px_minmax(0,1fr)]">
        <HallPortrait entry={entry} compact />
        <div className="flex min-w-0 flex-col justify-center">
          <div className="flex flex-wrap items-center gap-1.5">
            {isLatest && (
              <span className="rounded-full border border-amber-200/30 bg-amber-200/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.18em] text-amber-100">
                Mới nhất
              </span>
            )}
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-200/75">{entry.season}</span>
          </div>
          <div className="mt-2 line-clamp-2 text-xl font-black uppercase leading-tight text-white">
            {entry.playerName}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-white/45">
            <span>{Math.round(entry.winRate)}%</span>
            <span>{entry.wins}W-{entry.losses}L</span>
          </div>
        </div>
      </div>
    </button>
  );
}

function HallDetailPanel({ entry }: { entry: HallOfFameEntry | null }) {
  return (
    <div className={cn("grid transition-[grid-template-rows] duration-300 ease-out", entry ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
      <div className="overflow-hidden">
        <div className={cn("transition-all duration-300 ease-out", entry ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0")}>
          {entry && (
            <div key={entry.season} className="animate-in fade-in slide-in-from-top-2 duration-300 rounded-3xl border border-amber-300/35 bg-slate-950/45 p-4 shadow-[0_22px_70px_rgba(0,0,0,0.24)] sm:p-5 lg:grid lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-5 lg:p-6">
              <HallPortrait entry={entry} />
              <div className="mt-4 min-w-0 lg:mt-0">
                <div className="mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-amber-200">
                  <Crown className="h-3.5 w-3.5" />
                  {entry.season} · Nhà vô địch
                </div>
                <div className="text-2xl font-black uppercase leading-tight tracking-[0.03em] text-white break-words sm:text-4xl">
                  {entry.playerName}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-white/45">
                  <span>#1 BXH mùa giải</span>
                  {entry.lastMatchDate && (
                    <>
                      <span className="text-amber-200/40">·</span>
                      <span>Chốt {formatHallDate(entry.lastMatchDate)}</span>
                    </>
                  )}
                </div>
                <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <HallMetric label="Tỉ lệ" value={`${Math.round(entry.winRate)}%`} />
                  <HallMetric label="W-L" value={`${entry.wins}W-${entry.losses}L`} />
                  <HallMetric label="Số trận" value={entry.total} />
                  <HallMetric label="ELO" value={entry.rating} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HallPortrait({ entry, compact = false }: { entry: HallOfFameEntry | null; compact?: boolean }) {
  const cachedImageUrl = useCachedHallImage(entry);

  return (
    <div className={cn("w-full", compact ? "max-w-[98px] sm:max-w-[132px]" : "mx-auto max-w-[170px] sm:max-w-[180px]")}>
      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-amber-200/40 bg-slate-950/85 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06),0_20px_44px_rgba(0,0,0,0.26)]">
        {cachedImageUrl ? (
          <div
            role="img"
            aria-label={`Ảnh vinh danh ${entry?.playerName || ''}`}
            className="absolute inset-0 bg-cover bg-center opacity-100 transition duration-300 group-hover:brightness-110 group-hover:contrast-110"
            style={{ backgroundImage: `url("${cachedImageUrl}")` }}
          />
        ) : (
          <>
            <div className="absolute inset-2 rounded-xl border border-amber-100/15" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(251,191,36,0.24),transparent_40%),linear-gradient(145deg,rgba(251,191,36,0.16),rgba(15,23,42,0.05)_42%,rgba(255,255,255,0.08)_43%,rgba(15,23,42,0.02)_55%,rgba(15,23,42,0.50))]" />
            <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-950/80 to-transparent" />
            <div className="relative flex h-full flex-col items-center justify-center p-3 text-center">
              <div className={cn(
                "flex items-center justify-center rounded-full border border-amber-100/40 bg-amber-200/10 font-black text-amber-100 shadow-[0_0_40px_rgba(251,191,36,0.18)]",
                compact ? "h-11 w-11 text-xl" : "h-20 w-20 text-4xl",
              )}>
                {entry ? getAvatarLetter(entry.playerName) : <Trophy className="h-9 w-9" />}
              </div>
              {!compact && (
                <div className="mt-3 text-[10px] font-black uppercase tracking-[0.22em] text-amber-100/65">
                  {entry ? entry.season : 'Chờ ghi danh'}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function HallMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.04] px-3 py-2.5 text-center sm:py-3">
      <div className="text-base font-black text-white sm:text-xl">{value}</div>
      <div className="mt-1 text-[9px] font-black uppercase tracking-[0.16em] text-white/35">{label}</div>
    </div>
  );
}

function RadarChart({ data }: { data: RadarData }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const labels: Array<{ name: string; key: keyof RadarData; desc: string }> = [
    { name: 'Công', key: 'attack', desc: 'Đo lường hỏa lực ghi điểm trung bình của đội khi bạn thi đấu. Điểm cao phản ánh khả năng ép sân, tạo các chiến thắng cách biệt lớn hoặc ghi nhiều điểm khi thua.' },
    { name: 'Thủ', key: 'defense', desc: 'Đo lường độ chắc chắn bảo vệ lưới, hạn chế đối thủ ghi điểm. Điểm cao thể hiện sự bền bỉ bọc lót, giữ đối thủ ghi ít điểm nhất khi thắng và giữ thế trận sát nút khi thua.' },
    { name: 'Bản lĩnh', key: 'brave', desc: 'Vượt kỳ vọng: Thắng kèo khó hoặc gánh đồng đội ELO thấp.' },
    { name: 'Phong độ', key: 'form', desc: 'Chuỗi thành tích: Tỉ lệ thắng có trọng số trong tối đa 10 trận gần nhất, trận mới hơn ảnh hưởng nhiều hơn.' },
    { name: 'Phối hợp', key: 'synergy', desc: 'Ăn ý: Tỉ lệ thắng trung bình của đồng đội khi chơi cùng.' },
    { name: 'Nhiệt huyết', key: 'experience', desc: 'Độ chăm chỉ: Tần suất ra sân thi đấu so với người đi nhiều nhất giải.' }
  ];

  const getPoint = (val: number, index: number) => {
    const angle = (index * 60 - 90) * (Math.PI / 180);
    const r = (val / 100) * 42;
    return { x: 50 + r * Math.cos(angle), y: 50 + r * Math.sin(angle) };
  };

  const values = labels.map(l => data[l.key]);
  const path = values.map((v, i) => {
    const p = getPoint(v, i);
    return `${p.x},${p.y}`;
  }).join(' ');

  return (
    <div className="relative w-full max-w-[320px] aspect-square mx-auto pt-6 pb-2 group">
      <svg viewBox="0 0 100 100" className="w-full overflow-visible">
        {/* Background webs */}
        {[20, 40, 60, 80, 100].map(r => (
          <polygon 
            key={r}
            points={labels.map((_, i) => {
              const a = (i * 60 - 90) * (Math.PI / 180);
              return `${50 + (r/100*40) * Math.cos(a)},${50 + (r/100*40) * Math.sin(a)}`;
            }).join(' ')} 
            fill="none" 
            stroke="white" 
            strokeOpacity="0.05" 
            strokeWidth="0.5" 
          />
        ))}
        {/* Axis lines */}
        {labels.map((_, i) => {
          const a = (i * 60 - 90) * (Math.PI / 180);
          return (
            <line key={i} x1="50" y1="50" x2={50 + 40 * Math.cos(a)} y2={50 + 40 * Math.sin(a)} stroke="white" strokeOpacity="0.1" strokeWidth="0.5" />
          );
        })}
        {/* Data polygon */}
        <polygon points={path} fill="rgba(190, 242, 100, 0.4)" stroke="#bef264" strokeWidth="1.5" className="transition-all duration-500" />
        
        {/* Labels & Interactive Points */}
        {labels.map((l, i) => {
          const a = (i * 60 - 90) * (Math.PI / 180);
          const x = 50 + 52 * Math.cos(a);
          const y = 50 + 52 * Math.sin(a);
          const valPoint = getPoint(values[i], i);
          
          return (
            <g key={i} className="cursor-help" onMouseEnter={() => setHoveredIndex(i)} onMouseLeave={() => setHoveredIndex(null)}>
              <text 
                x={x} 
                y={y} 
                fill={hoveredIndex === i ? "#bef264" : "rgba(255,255,255,0.5)"}
                fontSize="6" 
                fontWeight="black"
                textAnchor="middle" 
                dominantBaseline="middle"
                className="transition-colors uppercase tracking-tighter"
              >
                {l.name}
              </text>
              <circle cx={valPoint.x} cy={valPoint.y} r="2" fill="#bef264" className={cn("transition-all", hoveredIndex === i ? "r-3" : "r-1.5")} />
              <circle cx={x} cy={y} r="15" fill="transparent" />
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hoveredIndex !== null && (
        <div 
          className="pointer-events-none absolute w-max max-w-[200px] bg-slate-800 border border-primary/30 p-2.5 rounded-xl shadow-2xl z-50 text-center animate-in fade-in zoom-in-95 duration-200"
          style={{
            left: `${50 + 52 * Math.cos((hoveredIndex * 60 - 90) * (Math.PI / 180))}%`,
            top: `${50 + 52 * Math.sin((hoveredIndex * 60 - 90) * (Math.PI / 180))}%`,
            transform: 'translate(-50%, -120%)'
          }}
        >
          <div className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">
            {labels[hoveredIndex].name} ({values[hoveredIndex]}đ)
          </div>
          <div className="text-xs font-bold text-white/80 leading-snug">
            {labels[hoveredIndex].desc}
          </div>
        </div>
      )}
    </div>
  );
}

function EloSparkline({ history, playerId }: { history: EloHistory; playerId: string }) {
  const playerHistory = history
    .filter(h => h.ratings[playerId] !== undefined)
    .map(h => h.ratings[playerId])
    .slice(-10); // Lấy 10 trận gần nhất

  if (playerHistory.length < 2) return <div className="w-16 h-4 bg-white/5 rounded" />;

  const min = Math.min(...playerHistory);
  const max = Math.max(...playerHistory);
  const range = max - min || 1;
  
  const points = playerHistory.map((val, i) => {
    const x = (i / (playerHistory.length - 1)) * 60;
    const y = 15 - ((val - min) / range) * 12;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg viewBox="0 0 60 15" className="w-16 h-4 overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke="#bef264"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ============================================
// ZONE 2: PROFILE (Cá nhân)
// ============================================
function ProfileZone({
  playerId,
  setPlayerId,
  visiblePlayers,
  analysis,
  elo,
  players,
}: {
  playerId: string;
  setPlayerId: (id: string) => void;
  visiblePlayers: Player[];
  analysis?: PlayerProfile;
  elo: EloResult;
  players: Player[];
}) {
  const currentElo = elo.rating.get(playerId) ?? 1500;
  const rank = analysis?.rank || '--';
  const stats = analysis?.stats;
  const bestPartner = analysis?.bestPartner;
  const toughestOpponent = analysis?.toughestOpponent;

  const winRate = stats && stats.total > 0 ? Math.round(stats.wins / stats.total * 100) : 0;

  // Calculate Playstyle classification
  const attack = analysis?.radar?.attack || 0;
  const defense = analysis?.radar?.defense || 0;
  const totalMatches = stats?.total || 0;

  let playstyle = 'Nhịp Điệu Cân Bằng';
  let playstyleDesc = 'Lối chơi cân bằng, điều phối nhịp độ tốt và thích nghi linh hoạt theo đồng đội.';
  let playstyleColor = 'text-blue-400 bg-blue-500/5 border-blue-500/10';

  if (totalMatches >= 5) {
    if (attack >= 65 && defense < 65) {
      playstyle = 'Sát Thủ Bắn Lưới 🏹';
      playstyleDesc = 'Thiên hướng tấn công mạnh mẽ, chủ động ép sân, đẩy nhanh tốc độ bóng và dứt điểm nhanh.';
      playstyleColor = 'text-orange-400 bg-orange-500/5 border-orange-500/10';
    } else if (defense >= 65 && attack < 65) {
      playstyle = 'Chốt Chặn Bền Bỉ 🧱';
      playstyleDesc = 'Hậu phương vững chắc, lối chơi an toàn, kiên nhẫn bọc lót, kiểm soát bóng và hạn chế tự hỏng.';
      playstyleColor = 'text-emerald-400 bg-emerald-500/5 border-emerald-500/10';
    } else {
      playstyle = 'Nhịp Điệu Cân Bằng 🔵';
      playstyleDesc = 'Lối chơi cân bằng, điều phối nhịp độ tốt, kiểm soát khu trung tuyến và thích nghi linh hoạt theo đồng đội.';
      playstyleColor = 'text-blue-400 bg-blue-500/5 border-blue-500/10';
    }
  } else {
    playstyle = 'Tân Binh Đang Thử Nghiệm 🌱';
    playstyleDesc = 'Chưa thi đấu đủ 5 trận để phân loại lối chơi chính xác.';
    playstyleColor = 'text-slate-400 bg-slate-500/5 border-slate-500/10';
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Column: Stats & Radar (4/12) */}
        <div className="lg:col-span-4 flex flex-col">
          <div className="bg-slate-900/50 rounded-2xl p-6 border border-white/[0.05] h-full flex flex-col">
            <select
              value={playerId}
              onChange={e => setPlayerId(e.target.value)}
              className="w-full rounded-xl bg-slate-800 border border-white/[0.08] px-4 py-3 font-bold text-white mb-6 focus:ring-2 ring-primary/20 outline-none"
            >
              {visiblePlayers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            <div className="flex gap-4 mb-6">
              <div className="flex-1 bg-slate-800/50 rounded-2xl p-4 border border-primary/20 text-center shadow-lg">
                <div className="text-[10px] font-black text-primary/60 uppercase tracking-widest mb-1">ELO Rating</div>
                <div className="text-3xl font-black text-white italic">{currentElo}</div>
                <div className="text-[10px] text-white/40 uppercase font-bold mt-1">Hạng #{rank}</div>
              </div>
              <div className="flex-1 bg-slate-800/50 rounded-2xl p-4 border border-green-500/20 text-center shadow-lg">
                <div className="text-[10px] font-black text-green-400/60 uppercase tracking-widest mb-1">Win Rate</div>
                <div className="text-3xl font-black text-white italic">{winRate}%</div>
                <div className="text-[10px] text-white/40 uppercase font-bold mt-1">{stats?.wins}W - {stats?.losses}L</div>
              </div>
            </div>

            {/* Playstyle Box */}
            <div className={cn("rounded-2xl border p-4 text-center mb-6 flex flex-col items-center justify-center shadow-lg", playstyleColor)}>
              <span className="text-[9px] font-black uppercase tracking-[0.2em] opacity-60">Phong Cách Thi Đấu</span>
              <span className="text-sm font-black uppercase tracking-wider mt-1">{playstyle}</span>
              <p className="text-[10px] opacity-80 mt-1.5 leading-relaxed font-bold">{playstyleDesc}</p>
            </div>

            <div className="px-4 flex-1 flex items-center">
              <RadarChart data={analysis?.radar || { attack: 0, defense: 0, brave: 0, synergy: 50, form: 50, experience: 0 }} />
            </div>
          </div>
        </div>

        {/* Right Column: Insights & Recent (8/12) */}
        <div className="lg:col-span-8 space-y-4 flex flex-col">
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Chuỗi" value={analysis?.streak || '--'} icon={Flame} color="orange" />
            <StatCard label="Tổng trận" value={stats?.total || 0} icon={Target} color="blue" />
            <StatCard label="Nhiệt huyết" value={`${analysis?.radar?.experience || 0}đ`} icon={Award} color="purple" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <BentoCard title="Hợp vía nhất" icon={Star} className="border-green-500/10 min-h-[100px] flex flex-col justify-center">
              {bestPartner ? (
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center text-xl font-black text-green-400">
                    {getAvatarLetter(bestPartner.otherName)}
                  </div>
                  <div>
                    <div className="text-lg font-black text-white">{bestPartner.otherName}</div>
                    <div className="text-xs text-green-400 font-bold uppercase tracking-wider">{edgeRecord(bestPartner)}</div>
                    <div className="text-[11px] text-white/40 font-bold mt-1">{expectationDeltaText(bestPartner.impact)}</div>
                  </div>
                </div>
              ) : <p className="text-white/40 text-xs italic">Chưa đủ dữ liệu</p>}
            </BentoCard>

            <BentoCard title="Kỵ rơ nhất" icon={Swords} className="border-red-500/10 min-h-[100px] flex flex-col justify-center">
              {toughestOpponent ? (
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center text-xl font-black text-red-400">
                    {getAvatarLetter(toughestOpponent.otherName)}
                  </div>
                  <div>
                    <div className="text-lg font-black text-white">{toughestOpponent.otherName}</div>
                    <div className="text-xs text-red-400 font-bold uppercase tracking-wider">{edgeRecord(toughestOpponent)}</div>
                    <div className="text-[11px] text-white/40 font-bold mt-1">{expectationDeltaText(toughestOpponent.impact)}</div>
                  </div>
                </div>
              ) : <p className="text-white/40 text-xs italic">Chưa có kỵ rơ</p>}
            </BentoCard>
          </div>

          <BentoCard title="Form gần đây" icon={History} className="bg-slate-900/40">
            {(analysis?.recent || []).slice(0, 3).length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(analysis?.recent || []).slice(0, 3).map((match: Match, i: number) => {
                  const isWinner = [match.win_1, match.win_2].includes(playerId);
                  const partnerId = isWinner 
                    ? [match.win_1, match.win_2].find(id => id !== playerId)
                    : [match.lose_1, match.lose_2].find(id => id !== playerId);
                  const opponents = isWinner 
                    ? [match.lose_1, match.lose_2]
                    : [match.win_1, match.win_2];

                  return (
                    <div key={i} className="flex-1 min-w-[200px] bg-slate-800/50 rounded-2xl p-5 border border-white/[0.05] hover:border-white/10 transition-all group flex flex-col gap-4">
                      <div className="flex items-center justify-between">
                        <span className={cn(
                          "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest",
                          isWinner ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                        )}>
                          {isWinner ? "Win" : "Loss"}
                        </span>
                        <span className="text-2xl font-black text-white italic">{match.win_score}-{match.lose_score}</span>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs">🤝</div>
                          <span className="text-sm text-white font-bold truncate">Bạn & {getAnalysisName(players, partnerId)}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center text-xs">⚔️</div>
                          <span className="text-sm text-white/50 font-medium truncate">vs {opponents.filter(Boolean).map(id => getAnalysisName(players, id)).join(' & ')}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-12 flex items-center justify-center">
                <p className="text-white/40 text-sm italic">Chưa có trận đấu nào</p>
              </div>
            )}
          </BentoCard>
        </div>
      </div>
    </div>
  );
}


// ============================================
// ZONE 3: MATRIX (Đối đầu)
// ============================================
function MatrixZone({
  matrixTab,
  setMatrixTab,
  partnerRows,
  opponentRows,
  visiblePlayers,
  playerId,
  setPlayerId,
}: {
  matrixTab: string;
  setMatrixTab: (tab: string) => void;
  partnerRows: AnalysisEdge[];
  opponentRows: AnalysisEdge[];
  visiblePlayers: Player[];
  playerId: string;
  setPlayerId: (id: string) => void;
}) {
  const rows = matrixTab === 'partner' ? partnerRows : opponentRows;

  // Filter rows for selected player
  const playerRows = rows.filter(r => r.playerId === playerId);

  // Sort by confidence and ELO-expectation gap so small perfect samples do not dominate.
  const sortedRows = [...playerRows].sort((a, b) => {
    if (matrixTab === 'partner') {
      return b.confidence - a.confidence || b.total - a.total;
    }
    return Math.abs(b.impact) - Math.abs(a.impact) || b.total - a.total || b.confidence - a.confidence;
  });

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex flex-col lg:flex-row items-center gap-4 mb-6">
        <div className="w-full lg:w-72 bg-slate-900/50 rounded-2xl p-1 border border-white/[0.05]">
          <select
            value={playerId}
            onChange={e => setPlayerId(e.target.value)}
            className="w-full bg-transparent border-none px-4 py-3 font-black text-white outline-none"
          >
            {visiblePlayers.map(p => <option key={p.id} value={p.id} className="bg-slate-900">{p.name}</option>)}
          </select>
        </div>
        <div className="flex gap-2 p-1 bg-slate-900 rounded-2xl border border-white/[0.05] flex-1 w-full lg:w-auto">
          {matrixTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setMatrixTab(tab.id)}
              className={cn(
                "flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                matrixTab === tab.id 
                  ? "bg-primary text-black shadow-[0_0_20px_rgba(190,242,100,0.3)]" 
                  : "text-white/30 hover:text-white/60"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sortedRows.length > 0 ? (
          sortedRows.map((row, index) => {
            const otherName = row.otherName;
            const impact = row.impact || 0;
            const isNeutral = row.total < 4 || Math.abs(impact) <= 5;
            const isPositive = !isNeutral && impact > 0;
            const isNegative = !isNeutral && impact < 0;
            const badgeText = row.total < 4
              ? 'Ít dữ liệu'
              : `${row.label} ${impact > 0 ? '+' : ''}${impact}`;
            const deltaText = expectationDeltaText(impact);
            
            return (
              <div 
                key={index}
                className={cn(
                  "rounded-2xl border p-5 transition-all hover:scale-[1.02] bg-slate-800/50 relative group",
                  isPositive ? "border-green-500/20" : isNegative ? "border-red-500/20" : "border-white/[0.05]"
                )}
              >
                <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                  {isPositive && <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/5 blur-3xl rounded-full" />}
                  {isNegative && <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 blur-3xl rounded-full" />}
                </div>
                <div className="flex items-center justify-between mb-4 relative z-10">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-black transition-transform group-hover:rotate-12",
                      isPositive ? "bg-green-500/20 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.2)]" :
                      isNegative ? "bg-red-500/20 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.2)]" :
                      "bg-slate-700 text-white/40"
                    )}>
                      {getAvatarLetter(otherName || '')}
                    </div>
                    <div className="min-w-0">
                      <div className="font-black text-white text-lg">{otherName}</div>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className={cn(
                          "text-[10px] font-black px-2 py-0.5 rounded-full border",
                          isPositive ? "bg-green-500/20 text-green-400 border-green-500/30" :
                          isNegative ? "bg-red-500/20 text-red-400 border-red-500/30" :
                          "bg-slate-700/50 text-slate-300 border-slate-600"
                        )}>
                          {badgeText}
                        </span>
                        <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">{edgeRecord(row)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right relative z-10">
                    <div className={cn("text-3xl font-black", isPositive ? "text-green-400" : isNegative ? "text-red-400" : "text-white")}>
                      {Math.round(row.rate)}%
                    </div>
                    <div className="text-[10px] font-bold text-white/30 uppercase">{matrixTab === 'partner' ? 'Hợp tác' : 'Đối đầu'}</div>
                  </div>
                </div>
                <div className="relative z-10 text-xs font-semibold text-white/55 leading-relaxed mb-3 min-h-[34px]">
                  {row.explanation}
                </div>
                <div className="relative z-10 text-[10px] text-white/35 font-bold tracking-tight bg-black/20 p-2 rounded-lg flex flex-wrap gap-2 justify-between mb-3">
                  <span>{deltaText}</span>
                  <span>{row.total} trận mẫu</span>
                </div>
                
                <div className="h-2.5 bg-slate-900 rounded-full overflow-hidden mb-3 border border-white/5">
                  <div 
                    className={cn(
                      "h-full rounded-full transition-all duration-1000",
                      isPositive ? "bg-gradient-to-r from-green-500 to-green-400" :
                      isNegative ? "bg-gradient-to-r from-red-500 to-red-400" :
                      "bg-slate-600"
                    )}
                    style={{ width: `${Math.max(4, Math.min(100, row.rate))}%` }}
                  />
                </div>
                
                <div className="flex justify-between text-[10px] font-black uppercase tracking-wider">
                  <span className="text-green-500/70">{row.wins} Thắng</span>
                  <span className="text-red-500/70">{row.losses} Thua</span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="md:col-span-2 rounded-3xl border border-white/[0.05] bg-slate-900/30 p-12 text-center">
            <p className="text-white/20 font-bold uppercase tracking-widest">Chưa đủ dữ liệu phân tích</p>
          </div>
        )}
      </div>
    </div>
  );
}


// ============================================
// SHARED COMPONENTS
// ============================================
function StatCard({ label, value, icon: Icon, color }: { label: string; value: ReactNode; icon: LucideIcon; color: string }) {
  const colorClasses: Record<string, string> = {
    primary: "bg-primary/10 border-primary/30 text-primary",
    blue: "bg-blue-500/10 border-blue-500/30 text-blue-400",
    purple: "bg-purple-500/10 border-purple-500/30 text-purple-400",
    amber: "bg-amber-500/10 border-amber-500/30 text-amber-400",
    green: "bg-green-500/10 border-green-500/30 text-green-400",
    orange: "bg-orange-500/10 border-orange-500/30 text-orange-400",
    red: "bg-red-500/10 border-red-500/30 text-red-400",
  };

  return (
    <div className={cn(
      "rounded-xl border p-4 text-center",
      colorClasses[color] || colorClasses.primary
    )}>
      <Icon className="w-5 h-5 mx-auto mb-2 opacity-60" />
      <div className="text-2xl font-black">{value}</div>
      <div className="text-xs font-semibold uppercase tracking-wider opacity-60">{label}</div>
    </div>
  );
}

function BentoCard({ title, icon: Icon, children, className }: { title: string; icon: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <div className={cn(
      "rounded-2xl border border-white/[0.08] bg-slate-800 p-5",
      className
    )}>
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-primary" />
        <h3 className="font-bold text-white/70 text-sm uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </div>
  );
}
