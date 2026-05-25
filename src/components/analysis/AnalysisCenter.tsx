'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, RefreshCw, Database,
  LayoutGrid, User, Swords, History,
  TrendingUp, Flame, Trophy, Target,
  Star, Zap, Award, Crown, Medal, CalendarDays,
  type LucideIcon
} from 'lucide-react';
import { buildAnalysisSnapshot, edgeRecord, getAnalysisName, type AnalysisEdge, type EloResult, type PlayerMetrics, type PlayerProfile } from '@/lib/analysis-core';
import { generateInsightSelectionResultFromSnapshot, type InsightSelectionState } from '@/lib/insights';
import { cn, getAvatarLetter } from '@/lib/utils';
import { useSharedAppData } from '@/lib/use-shared-app-data';
import { isGuestId, loserFineCount } from '@/lib/guest';
import { buildHallOfFameEntries, formatHallDate, type HallOfFameEntry } from '@/lib/hall-of-fame';
import { getHallImageLocal, removeHallImageLocal, saveHallImageLocal } from '@/lib/db';

// Navigation tabs - 4 zones instead of 6
const navItems = [
  { id: 'hub', label: 'Tổng quan', icon: LayoutGrid },
  { id: 'hall', label: 'Vinh danh', icon: Crown },
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
  activeSeason = 'Season 1',
  loseMoney = 5000,
  config: initialConfig = {},
}: {
  players: Player[];
  matches: Match[];
  seasons?: Season[];
  activeSeason?: string;
  loseMoney?: number;
  config?: Record<string, string>;
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
    routeKey: 'analysis',
  });
  const players = sharedData.players.length > 0 ? sharedData.players as Player[] : initialPlayers;
  const allMatches = (sharedData.matches.length > 0 ? sharedData.matches : initialMatches) as Match[];
  const currentSeasons = sharedData.seasons.length > 0 ? sharedData.seasons as Season[] : seasons;
  const config = Object.keys(sharedData.config).length > 0 ? sharedData.config : initialConfig;
  const currentLoseMoney = Number(config.lose_money || loseMoney);
  const currentActiveSeason = config.active_season || activeSeason;
  const [activeNav, setActiveNav] = useState(navItems[0].id);
  const [matrixTab, setMatrixTab] = useState('partner');
  const [insightSeed, setInsightSeed] = useState<number | null>(null);
  const [insightSelectionState, setInsightSelectionState] = useState<InsightSelectionState | null>(null);
  const committedInsightSeedRef = useRef<number | null>(null);
  const visiblePlayers = players.filter(p => p.active !== false && p.hidden !== true && !isGuestId(p.id));
  const [playerId, setPlayerId] = useState(visiblePlayers[0]?.id || '');
  const [selectedSeason, setSelectedSeason] = useState<string | null>(currentActiveSeason);

  // Lọc bỏ các trận đấu có sự tham gia của bất kỳ người chơi không hoạt động (active === false)
  const inactivePlayerIds = useMemo(() => {
    return new Set(players.filter(p => p.active === false).map(p => p.id));
  }, [players]);

  const filteredAllMatches = useMemo(() => {
    return allMatches.filter(m => {
      const isWin1Inactive = m.win_1 && inactivePlayerIds.has(String(m.win_1));
      const isWin2Inactive = m.win_2 && inactivePlayerIds.has(String(m.win_2));
      const isLose1Inactive = m.lose_1 && inactivePlayerIds.has(String(m.lose_1));
      const isLose2Inactive = m.lose_2 && inactivePlayerIds.has(String(m.lose_2));
      return !m.deleted_at && !isWin1Inactive && !isWin2Inactive && !isLose1Inactive && !isLose2Inactive;
    });
  }, [allMatches, inactivePlayerIds]);

  const activeMatches = selectedSeason === null ? filteredAllMatches : filteredAllMatches.filter(m => (m.season || 'Season 1') === selectedSeason);
  const seasonOptions = Array.from(new Set([currentActiveSeason, ...currentSeasons.map(s => s.name), ...allMatches.map(m => m.season || 'Season 1')].filter(Boolean)));

  const analysisSnapshot = useMemo(() => buildAnalysisSnapshot(visiblePlayers, activeMatches, currentLoseMoney), [visiblePlayers, activeMatches, currentLoseMoney]);
  const hallOfFameEntries = useMemo(
    () => buildHallOfFameEntries(players, allMatches, currentSeasons, currentActiveSeason, currentLoseMoney),
    [players, allMatches, currentSeasons, currentActiveSeason, currentLoseMoney]
  );
  const rankingMatches = analysisSnapshot.rankingMatches;
  const elo = analysisSnapshot.elo;
  const board = analysisSnapshot.board;
  const partnerRows = analysisSnapshot.partnerEdges;
  const opponentRows = analysisSnapshot.opponentEdges;
  const analysis = analysisSnapshot.profiles.get(playerId) || analysisSnapshot.profiles.get(visiblePlayers[0]?.id || '');
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

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-slate-900/92 backdrop-blur-xl border-b border-white/[0.08]">
        <div className="max-w-[1500px] mx-auto px-4 py-2">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center justify-between gap-3 lg:min-w-0 lg:justify-start">
              <Link href="/" className="inline-flex shrink-0 items-center gap-2 text-xs font-black text-white/45 transition-colors hover:text-primary sm:text-sm">
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
                onChange={e => setSelectedSeason(e.target.value === 'all' ? null : e.target.value)}
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
                    <button
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
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1500px] mx-auto px-4 py-4 pb-8">
        {/* ZONE 1: Hub (Tổng quan) */}
        {activeNav === 'hub' && (
          <HubZone 
            board={board}
            rankingMatches={rankingMatches}
            visiblePlayers={visiblePlayers}
            elo={elo}
            insights={insights}
            insightsReady={insightsReady}
            loseMoney={currentLoseMoney}
          />
        )}

        {/* ZONE 2: Hall of Fame (Vinh danh) */}
        {activeNav === 'hall' && (
          <HallOfFame entries={hallOfFameEntries} activeSeason={currentActiveSeason} />
        )}

        {/* ZONE 3: Profile (Cá nhân) */}
        {activeNav === 'profile' && (
          <ProfileZone
            playerId={playerId}
            setPlayerId={setPlayerId}
            visiblePlayers={visiblePlayers}
            analysis={analysis}
            elo={elo}
            players={players}
          />
        )}

        {/* ZONE 4: Matrix (Đối đầu) */}
        {activeNav === 'matrix' && (
          <MatrixZone
            matrixTab={matrixTab}
            setMatrixTab={setMatrixTab}
            partnerRows={partnerRows}
            opponentRows={opponentRows}
            visiblePlayers={visiblePlayers}
            playerId={playerId}
            setPlayerId={setPlayerId}
          />
        )}
      </div>

    </div>
  );
}

// ============================================
// ZONE 1: HUB (Tổng quan - Bento Grid)
// ============================================
function HubZone({
  board,
  rankingMatches,
  visiblePlayers,
  elo,
  insights,
  insightsReady,
  loseMoney,
}: {
  board: PlayerMetrics[];
  rankingMatches: Match[];
  visiblePlayers: Player[];
  elo: EloResult;
  insights: Insight[];
  insightsReady: boolean;
  loseMoney: number;
}) {
  const totalFines = rankingMatches.reduce((sum, match) => sum + loserFineCount(match), 0) * loseMoney;

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
        {/* ELO Race (50%) */}
        <BentoCard title="Bảng xếp hạng ELO" icon={TrendingUp} className="flex flex-col h-full">
          <div className="space-y-0.5 flex-1">
            {board.slice(0, 8).map((player, index) => (
              <div key={player.id} className="flex items-center gap-2 py-2 border-b border-white/5 last:border-0">
                <div className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center text-base font-black shrink-0 shadow-inner",
                  index === 0 ? "bg-amber-500/20 text-amber-400" :
                  index === 1 ? "bg-slate-400/20 text-slate-300" :
                  index === 2 ? "bg-orange-600/20 text-orange-400" :
                  "bg-slate-800 text-white/50"
                )}>
                  {index + 1}
                </div>
                <div className="flex-1 flex items-center justify-between min-w-0 pr-4">
                  <div className="font-black text-white text-xl truncate">{player.name}</div>
                  <div className="text-xl font-black text-primary shrink-0 ml-2">{player.rating}</div>
                </div>
                <div className="w-20 h-6 shrink-0 hidden sm:block">
                  <EloSparkline history={elo.history} playerId={player.id} />
                </div>
              </div>
            ))}
          </div>
        </BentoCard>

        {/* News Feed Insights (50%) */}
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
    </div>
  );
}

function HallOfFame({ entries, activeSeason }: { entries: HallOfFameEntry[]; activeSeason: string }) {
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  const columnCount = useHallColumnCount();
  const selectedEntry = entries.find(entry => entry.season === selectedSeason) || null;
  const rows = useMemo(() => chunkHallEntries(entries, columnCount), [entries, columnCount]);
  const rowGridClass = columnCount >= 3
    ? "grid grid-cols-1 gap-3 lg:grid-cols-3"
    : columnCount === 2
      ? "grid grid-cols-1 gap-3 lg:grid-cols-2"
      : "grid grid-cols-1 gap-3";

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
              return (
                <div key={`hall-row-${rowIndex}`} className="space-y-3">
                  <div className={cn(rowGridClass, entries.length === 1 && "max-w-[720px]")}>
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
    { name: 'Công', key: 'attack', desc: 'Sức mạnh tấn công: Dựa trên tỉ lệ ghi điểm thực tế.' },
    { name: 'Thủ', key: 'defense', desc: 'Khả năng phòng ngự: Khả năng hạn chế đối thủ ghi điểm.' },
    { name: 'Bản lĩnh', key: 'brave', desc: 'Vượt kỳ vọng: Thắng kèo khó hoặc gánh đồng đội ELO thấp.' },
    { name: 'Phong độ', key: 'form', desc: 'Chuỗi thành tích: Tỉ lệ thắng trong 5 trận gần nhất.' },
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
  const currentElo = elo.rating.get(playerId) ?? 1000;
  const rank = analysis?.rank || '--';
  const stats = analysis?.stats;
  const bestPartner = analysis?.bestPartner;
  const toughestOpponent = analysis?.toughestOpponent;

  const winRate = stats && stats.total > 0 ? Math.round(stats.wins / stats.total * 100) : 0;

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

            <div className="flex gap-4 mb-8">
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
