'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, Search, RefreshCw, Database, 
  LayoutGrid, User, Swords, History,
  TrendingUp, TrendingDown, Flame, Trophy, Target,
  ChevronRight, Star, Zap, Award
} from 'lucide-react';
import { buildElo, buildOpponentRows, buildPartnerRows, getName, getPlayerAnalysis, getInsights } from '@/lib/analytics';
import { calculateLeaderboard } from '@/lib/stats';
import { cn } from '@/lib/utils';
import { getLocalMatches, saveMatchesLocal } from '@/lib/db';
import { getMatchesAfterAction } from '@/app/actions';
import { isGuestId, isRankingMatch } from '@/lib/guest';

// Navigation tabs - 4 zones instead of 6
const navItems = [
  { id: 'hub', label: 'Tổng quan', icon: LayoutGrid },
  { id: 'profile', label: 'Cá nhân', icon: User },
  { id: 'matrix', label: 'Đối đầu', icon: Swords },
  { id: 'history', label: 'Lịch sử', icon: History },
];

// Matrix sub-tabs
const matrixTabs = [
  { id: 'partner', label: 'Cặp bài trùng' },
  { id: 'opponent', label: 'Kỵ rơ' },
];

type Player = { id: string; name: string; active?: boolean };
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
};
type Season = { id?: string; name: string; active?: boolean; start_date?: string };
type Insight = { type: string; text: string; icon?: string };

export function AnalysisCenter({
  players,
  matches: initialMatches,
  seasons = [],
  activeSeason = 'Season 1',
  loseMoney = 5000,
}: {
  players: Player[];
  matches: Match[];
  seasons?: Season[];
  activeSeason?: string;
  loseMoney?: number;
}) {
  const [activeNav, setActiveNav] = useState(navItems[0].id);
  const [matrixTab, setMatrixTab] = useState('partner');
  const visiblePlayers = players.filter(p => p.active !== false && !isGuestId(p.id));
  const [playerId, setPlayerId] = useState(visiblePlayers[0]?.id || '');
  const [query, setQuery] = useState('');
  const [selectedSeason, setSelectedSeason] = useState<string | null>(activeSeason);
  
  const [localMatches, setLocalMatches] = useState<Match[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // Smart Sync Logic
  useEffect(() => {
    const sync = async () => {
      setIsSyncing(true);
      try {
        let existing = await getLocalMatches();
        if (existing.length === 0 && initialMatches.length > 0) {
          await saveMatchesLocal(initialMatches);
          existing = initialMatches;
        }
        const lastId = existing.length > 0 ? existing[0].id : null;
        const newMatches = await getMatchesAfterAction(lastId as string);
        if (newMatches && newMatches.length > 0) {
          await saveMatchesLocal(newMatches);
          existing = await getLocalMatches();
        }
        setLocalMatches(existing);
      } catch (err) {
        console.error('Sync failed:', err);
        setLocalMatches(initialMatches);
      }
      setIsSyncing(false);
    };
    sync();
  }, [initialMatches]);

  const allMatches = localMatches.length > 0 ? localMatches : initialMatches;
  const activeMatches = selectedSeason === null ? allMatches : allMatches.filter(m => (m.season || 'Season 1') === selectedSeason);
  const rankingMatches = activeMatches.filter(isRankingMatch);
  const seasonOptions = Array.from(new Set([activeSeason, ...seasons.map(s => s.name), ...allMatches.map(m => m.season || 'Season 1')].filter(Boolean)));

  const board = useMemo(() => calculateLeaderboard(players, activeMatches, loseMoney).filter(p => !isGuestId(p.id)), [players, activeMatches, loseMoney]);
  const elo = useMemo(() => buildElo(visiblePlayers, rankingMatches), [visiblePlayers, rankingMatches]);
  const partnerRows = useMemo(() => buildPartnerRows(visiblePlayers, rankingMatches), [visiblePlayers, rankingMatches]);
  const opponentRows = useMemo(() => buildOpponentRows(visiblePlayers, rankingMatches), [visiblePlayers, rankingMatches]);
  const analysis = useMemo(() => getPlayerAnalysis(playerId, visiblePlayers, rankingMatches), [playerId, visiblePlayers, rankingMatches]);
  const insights = useMemo(() => getInsights(board, elo, rankingMatches, players), [board, elo, rankingMatches, players]);

  const filteredHistory = activeMatches.filter(m => {
    if (!query.trim()) return true;
    const text = [m.season, getName(players, m.win_1), getName(players, m.win_2), getName(players, m.lose_1), getName(players, m.lose_2)]
      .join(' ')
      .toLowerCase();
    return text.includes(query.toLowerCase());
  });

  // Top ELO movers (this season)
  const topMovers = useMemo(() => {
    const sorted = [...elo.rating.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, rating]) => ({
        id,
        name: visiblePlayers.find(p => p.id === id)?.name || id,
        rating,
      }));
    return sorted;
  }, [elo, visiblePlayers]);

  // Top streaks
  const topStreaks = useMemo(() => {
    return board
      .filter(p => {
        const playerAnalysis = getPlayerAnalysis(p.id, players, rankingMatches);
        const streakMatch = playerAnalysis.streak?.match(/^(\d+)(W|L)$/);
        return streakMatch && parseInt(streakMatch[1]) >= 3;
      })
      .map(p => {
        const playerAnalysis = getPlayerAnalysis(p.id, players, rankingMatches);
        const streakMatch = playerAnalysis.streak?.match(/^(\d+)(W|L)$/);
        return {
          ...p,
          streakCount: streakMatch ? parseInt(streakMatch[1]) : 0,
          streakType: streakMatch ? streakMatch[2] : 'W',
        };
      })
      .sort((a, b) => b.streakCount - a.streakCount)
      .slice(0, 5);
  }, [board, players, rankingMatches]);

  // Top fine payers
  const topFinePayers = useMemo(() => {
    return [...board]
      .sort((a, b) => b.money - a.money)
      .slice(0, 5);
  }, [board]);

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-xl border-b border-white/[0.08]">
        <div className="max-w-[1500px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <Link href="/" className="inline-flex items-center gap-2 text-sm font-black text-white/45 hover:text-primary transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
            <div className="flex flex-col items-end">
              <h1 className="text-xl sm:text-2xl font-black text-white">Trung tâm phân tích</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <div className={cn(
                  "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
                  isSyncing ? "bg-primary/10 text-primary animate-pulse" : "bg-white/5 text-white/30"
                )}>
                  {isSyncing ? (
                    <><RefreshCw className="w-3 h-3 animate-spin" /> Syncing...</>
                  ) : (
                    <><Database className="w-3 h-3" /> {activeMatches.length} cached</>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {/* Season Selector */}
          <div className="mt-3">
            <select
              value={selectedSeason ?? 'all'}
              onChange={e => setSelectedSeason(e.target.value === 'all' ? null : e.target.value)}
              className="w-full sm:w-48 rounded-lg bg-slate-900 border border-white/[0.08] px-3 py-2 text-sm font-semibold text-white/70"
            >
              <option value="all">Tổng hợp</option>
              {seasonOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1500px] mx-auto px-4 py-4 pb-24">
        {/* ZONE 1: Hub (Tổng quan) */}
        {activeNav === 'hub' && (
          <HubZone 
            board={board}
            rankingMatches={rankingMatches}
            visiblePlayers={visiblePlayers}
            topMovers={topMovers}
            topStreaks={topStreaks}
            topFinePayers={topFinePayers}
            elo={elo}
            insights={insights}
            loseMoney={loseMoney}
          />
        )}

        {/* ZONE 2: Profile (Cá nhân) */}
        {activeNav === 'profile' && (
          <ProfileZone
            playerId={playerId}
            setPlayerId={setPlayerId}
            visiblePlayers={visiblePlayers}
            analysis={analysis}
            elo={elo}
            players={players}
            rankingMatches={rankingMatches}
          />
        )}

        {/* ZONE 3: Matrix (Đối đầu) */}
        {activeNav === 'matrix' && (
          <MatrixZone
            matrixTab={matrixTab}
            setMatrixTab={setMatrixTab}
            partnerRows={partnerRows}
            opponentRows={opponentRows}
            players={players}
            visiblePlayers={visiblePlayers}
            playerId={playerId}
            setPlayerId={setPlayerId}
          />
        )}

        {/* ZONE 4: History (Lịch sử) */}
        {activeNav === 'history' && (
          <HistoryZone
            query={query}
            setQuery={setQuery}
            filteredHistory={filteredHistory}
            players={players}
            elo={elo}
          />
        )}
      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-xl border-t border-white/[0.08] safe-area-pb">
        <div className="max-w-[1500px] mx-auto px-2">
          <div className="flex items-center justify-around md:justify-center md:gap-12">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveNav(item.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 px-4 py-3 md:py-4 transition-all duration-200 relative group",
                    isActive ? "text-primary" : "text-white/30 hover:text-white/80"
                  )}
                >
                  <Icon className={cn("w-5 h-5 md:w-6 md:h-6 transition-transform", isActive && "scale-110")} />
                  <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider">{item.label}</span>
                  {isActive && (
                    <div className="absolute bottom-0 w-12 md:w-16 h-1 bg-primary rounded-full shadow-[0_0_10px_rgba(190,242,100,0.5)]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </nav>
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
  topMovers,
  topStreaks,
  topFinePayers,
  elo,
  insights,
  loseMoney,
}: {
  board: any[];
  rankingMatches: Match[];
  visiblePlayers: Player[];
  topMovers: any[];
  topStreaks: any[];
  topFinePayers: any[];
  elo: any;
  insights: Insight[];
  loseMoney: number;
}) {
  const totalFines = rankingMatches.filter(m => m.lose_1 && !isGuestId(m.lose_1)).length * loseMoney;

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Tổng trận" value={rankingMatches.length} icon={Target} color="primary" />
        <StatCard label="Thành viên" value={visiblePlayers.length} icon={User} color="blue" />
        <StatCard label="Mùa giải" value={Math.max(1, new Set(rankingMatches.map(m => m.season)).size)} icon={Award} color="purple" />
        <StatCard label="Quỹ phạt" value={`${(totalFines / 1000).toFixed(0)}k`} icon={Trophy} color="amber" />
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ELO Leaders */}
        <BentoCard title="Bảng xếp hạng ELO" icon={TrendingUp} className="md:row-span-2">
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {board.slice(0, 10).map((player: any, index) => (
              <div key={player.id} className="flex items-center gap-3">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-black",
                  index === 0 ? "bg-amber-500/20 text-amber-400" :
                  index === 1 ? "bg-slate-400/20 text-slate-300" :
                  index === 2 ? "bg-orange-600/20 text-orange-400" :
                  "bg-slate-800 text-white/50"
                )}>
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-white truncate">{player.name}</div>
                </div>
                <div className="text-lg font-black text-white mr-2">{player.rating}</div>
                <EloSparkline history={elo.history} playerId={player.id} />
              </div>
            ))}
          </div>
        </BentoCard>

        {/* Hot Streaks */}
        <BentoCard title="Đang cháy" icon={Flame} className="bg-gradient-to-br from-orange-500/10 to-red-500/10 border-orange-500/20">
          {topStreaks.length > 0 ? (
            <div className="space-y-2">
              {topStreaks.slice(0, 3).map(player => (
                <div key={player.id} className="flex items-center justify-between">
                  <span className="font-semibold text-white">{player.name}</span>
                  <span className={cn(
                    "px-2 py-0.5 rounded-full text-sm font-black",
                    player.streakType === 'W' ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                  )}>
                    🔥 {player.streakCount} {player.streakType}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-white/40 text-sm">Chưa có chuỗi nào nổi bật</p>
          )}
        </BentoCard>

        {/* Top Fine Payers */}
        <BentoCard title="Thánh nộp phạt" icon={Trophy} className="bg-gradient-to-br from-amber-500/10 to-yellow-500/10 border-amber-500/20">
          {topFinePayers.length > 0 ? (
            <div className="space-y-2">
              {topFinePayers.slice(0, 3).map((player, index) => (
                <div key={player.id} className="flex items-center justify-between">
                  <span className="font-semibold text-white">{player.name}</span>
                  <span className="text-amber-400 font-bold">{player.money.toLocaleString('vi-VN')}đ</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-white/40 text-sm">Chưa có dữ liệu</p>
          )}
        </BentoCard>
      </div>

      {/* Insights Stream */}
      {insights.length > 0 && (
        <BentoCard title="Nhận xét" icon={Zap} className="border-primary/30 bg-primary/5">
          <div className="space-y-2">
            {insights.slice(0, 5).map((insight, index) => (
              <div key={index} className="flex items-start gap-2 text-sm">
                <span className="text-primary mt-0.5">•</span>
                <span className="text-white/70">{insight.text}</span>
              </div>
            ))}
          </div>
        </BentoCard>
      )}
    </div>
  );
}


function RadarChart({ data }: { data: { skill: number, brave: number, power: number, experience: number, stability: number } }) {
  const labels = [
    { name: 'Skill', angle: -90 },
    { name: 'Brave', angle: -18 },
    { name: 'Power', angle: 54 },
    { name: 'Exp', angle: 126 },
    { name: 'Stab', angle: 198 }
  ];

  const points = labels.map((_, i) => {
    const angle = (i * 72 - 90) * (Math.PI / 180);
    return { x: 50 + 40 * Math.cos(angle), y: 50 + 40 * Math.sin(angle) };
  });
  
  const getPoint = (val: number, index: number) => {
    const angle = (index * 72 - 90) * (Math.PI / 180);
    const r = (val / 100) * 40;
    return `${50 + r * Math.cos(angle)},${50 + r * Math.sin(angle)}`;
  };

  const values = [data.skill, data.brave, data.power, data.experience, data.stability];
  const path = values.map((v, i) => getPoint(v, i)).join(' ');

  return (
    <div className="relative w-full max-w-[280px] mx-auto pt-6 pb-2">
      <svg viewBox="0 0 100 100" className="w-full overflow-visible">
        {/* Background webs */}
        {[20, 40, 60, 80, 100].map(r => (
          <polygon 
            key={r}
            points={labels.map((_, i) => {
              const a = (i * 72 - 90) * (Math.PI / 180);
              return `${50 + (r/100*40) * Math.cos(a)},${50 + (r/100*40) * Math.sin(a)}`;
            }).join(' ')} 
            fill="none" 
            stroke="white" 
            strokeOpacity="0.05" 
            strokeWidth="0.5" 
          />
        ))}
        {/* Axis lines */}
        {points.map((p, i) => (
          <line key={i} x1="50" y1="50" x2={p.x} y2={p.y} stroke="white" strokeOpacity="0.1" strokeWidth="0.5" />
        ))}
        {/* Data polygon */}
        <polygon points={path} fill="rgba(190, 242, 100, 0.4)" stroke="#bef264" strokeWidth="1.5" />
        {/* Labels */}
        {labels.map((l, i) => {
          const a = (i * 72 - 90) * (Math.PI / 180);
          const x = 50 + 52 * Math.cos(a);
          const y = 50 + 52 * Math.sin(a);
          return (
            <text 
              key={i} 
              x={x} 
              y={y} 
              fill="rgba(255,255,255,0.5)" 
              fontSize="6" 
              fontWeight="bold"
              textAnchor="middle" 
              dominantBaseline="middle"
            >
              {l.name}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function EloSparkline({ history, playerId }: { history: any[], playerId: string }) {
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
  rankingMatches,
}: {
  playerId: string;
  setPlayerId: (id: string) => void;
  visiblePlayers: Player[];
  analysis: any;
  elo: any;
  players: Player[];
  rankingMatches: Match[];
}) {
  const currentElo = elo.rating.get(playerId) ?? 1000;
  const rank = analysis.rank || '--';
  const stats = analysis.stats;
  const adv = analysis.adv;

  const winRate = stats ? Math.round(stats.wins / stats.total * 100) : 0;

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="sticky top-[140px] z-40 bg-slate-900/95 backdrop-blur-lg py-3">
        <select
          value={playerId}
          onChange={e => setPlayerId(e.target.value)}
          className="w-full rounded-xl bg-slate-800 border border-white/[0.08] px-4 py-3 font-semibold text-white"
        >
          {visiblePlayers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl bg-slate-800 border border-primary/30 p-5 text-center">
          <div className="text-xs font-bold uppercase tracking-widest text-primary/60">ELO</div>
          <div className="mt-2 text-4xl font-black text-white">{currentElo}</div>
          <div className="mt-1 text-sm text-white/50">Rank #{rank}</div>
        </div>
        <div className="rounded-2xl bg-slate-800 border border-green-500/30 p-5 text-center">
          <div className="text-xs font-bold uppercase tracking-widest text-green-400/60">Win Rate</div>
          <div className="mt-2 text-4xl font-black text-white">{winRate}%</div>
          <div className="mt-1 text-sm text-white/50">{stats?.wins}W - {stats?.losses}L</div>
        </div>
      </div>

      <BentoCard title="Phong cách chiến đấu" icon={Target}>
        <RadarChart data={analysis.radar} />
        <div className="grid grid-cols-2 gap-2 mt-4 text-xs text-center text-white/50">
          <div>Skill | Brave</div>
          <div>Power | Exp | Stab</div>
        </div>
      </BentoCard>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Chuỗi" value={analysis.streak || '--'} icon={Flame} color="orange" />
        <StatCard label="Tổng trận" value={stats?.total || 0} icon={Target} color="blue" />
        <StatCard label="Tổng thắng" value={stats?.wins || 0} icon={Trophy} color="green" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BentoCard title="Bạn đánh cặp tốt nhất" icon={Star} className="border-green-500/30">
          {adv.bestPartner ? (
            <div className="text-center">
              <div className="text-2xl font-black text-white">{adv.bestPartner.name}</div>
              <div className="mt-1 text-green-400 font-bold">{Math.round(adv.bestPartner.rate)}% thắng</div>
            </div>
          ) : <p className="text-white/40 text-sm text-center">Chưa đủ dữ liệu</p>}
        </BentoCard>

        <BentoCard title="Kẻ thù khó nuốt" icon={Swords} className="border-red-500/30">
          {adv.toughestRival ? (
            <div className="text-center">
              <div className="text-2xl font-black text-white">{adv.toughestRival.name}</div>
              <div className="mt-1 text-red-400 font-bold">{Math.round(adv.toughestRival.lossRate)}% thua</div>
            </div>
          ) : <p className="text-white/40 text-sm text-center">Chưa có đối thủ áp đảo</p>}
        </BentoCard>
      </div>

      <BentoCard title="Form gần đây (3 trận)" icon={History}>
        {analysis.recent.slice(0, 3).length > 0 ? (
          <div className="space-y-3">
            {analysis.recent.slice(0, 3).map((match: any, i: number) => {
              const isWinner = [match.win_1, match.win_2].includes(playerId);
              return (
                <div key={i} className="flex items-center justify-between border-b border-white/[0.05] last:border-0 pb-3 last:pb-0">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn("px-2 py-0.5 rounded text-xs font-bold", isWinner ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400")}>
                        {isWinner ? "THẮNG" : "THUA"}
                      </span>
                      <span className="text-sm font-semibold text-white/80">
                        {match.win_score}-{match.lose_score}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-white/50 truncate">
                      vs {isWinner ? 
                        [getName(players, match.lose_1), getName(players, match.lose_2)].filter(Boolean).join(' & ') :
                        [getName(players, match.win_1), getName(players, match.win_2)].filter(Boolean).join(' & ')}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-white/40 text-sm text-center">Chưa có trận đấu nào</p>
        )}
      </BentoCard>
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
  players,
  visiblePlayers,
  playerId,
  setPlayerId,
}: {
  matrixTab: string;
  setMatrixTab: (tab: string) => void;
  partnerRows: any[];
  opponentRows: any[];
  players: Player[];
  visiblePlayers: Player[];
  playerId: string;
  setPlayerId: (id: string) => void;
}) {
  const rows = matrixTab === 'partner' ? partnerRows : opponentRows;

  // Filter rows for selected player
  const playerRows = rows.filter(r => {
    const playerName = visiblePlayers.find(p => p.id === playerId)?.name;
    return r.player === playerName;
  });

  // Sort by confidence
  const sortedRows = [...playerRows].sort((a, b) => {
    if (matrixTab === 'partner') {
      return b.rate - a.rate || b.total - a.total;
    }
    return a.rate - b.rate || b.total - a.total; // Opponents: lowest rate first
  });

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Player Selector */}
      <div className="sticky top-[140px] z-40 bg-slate-900/95 backdrop-blur-lg py-3">
        <select
          value={playerId}
          onChange={e => setPlayerId(e.target.value)}
          className="w-full rounded-xl bg-slate-800 border border-white/[0.08] px-4 py-3 font-semibold text-white"
        >
          {visiblePlayers.map(p => <option key={p.id} value={p.id}>Góc nhìn của: {p.name}</option>)}
        </select>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 p-1 bg-slate-900 rounded-xl">
        {matrixTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setMatrixTab(tab.id)}
            className={cn(
              "flex-1 py-2.5 rounded-lg text-sm font-bold transition-all",
              matrixTab === tab.id 
                ? "bg-primary text-black shadow-lg" 
                : "text-white/50 hover:text-white"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Matrix Cards */}
      {sortedRows.length > 0 ? (
        <div className="space-y-3">
          {sortedRows.map((row, index) => {
            const otherName = matrixTab === 'partner' ? row.partner : row.opponent;
            const isGood = matrixTab === 'partner' ? row.rate >= 60 : row.rate <= 40;
            
            return (
              <div 
                key={index}
                className={cn(
                  "rounded-2xl border p-4 transition-all hover:scale-[1.01]",
                  isGood 
                    ? "bg-gradient-to-r from-green-500/10 to-transparent border-green-500/30" 
                    : "bg-slate-800 border-white/[0.08]"
                )}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center text-lg font-black",
                      isGood ? "bg-green-500/20 text-green-400" : "bg-slate-700 text-white/70"
                    )}>
                      {otherName?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-white">{otherName}</div>
                      <div className="text-xs text-white/40">{row.total} trận</div>
                    </div>
                  </div>
                  <div className={cn(
                    "text-2xl font-black",
                    isGood ? "text-green-400" : "text-white/70"
                  )}>
                    {row.rate}%
                  </div>
                </div>
                
                {/* Progress Bar */}
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      isGood ? "bg-gradient-to-r from-green-500 to-green-400" : "bg-gradient-to-r from-slate-600 to-slate-500"
                    )}
                    style={{ width: `${row.rate}%` }}
                  />
                </div>
                
                <div className="flex justify-between mt-2 text-xs text-white/40">
                  <span>{row.wins} thắng</span>
                  <span>{row.losses} thua</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.08] bg-slate-800 p-8 text-center">
          <p className="text-white/40">Chưa có dữ liệu đối đầu</p>
        </div>
      )}
    </div>
  );
}

// ============================================
// ZONE 4: HISTORY (Lịch sử)
// ============================================
function HistoryZone({
  query,
  setQuery,
  filteredHistory,
  players,
  elo,
}: {
  query: string;
  setQuery: (q: string) => void;
  filteredHistory: Match[];
  players: Player[];
  elo: any;
}) {
  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Tìm trận đấu..."
          className="w-full rounded-xl bg-slate-900 border border-white/[0.08] py-3 pl-12 pr-4 text-white placeholder:text-white/30"
        />
      </div>

      {/* Timeline */}
      {filteredHistory.length > 0 ? (
        <div className="space-y-3">
          {filteredHistory.slice(0, 100).map((match, index) => {
            const winTeam = [getName(players, match.win_1), match.win_2 ? getName(players, match.win_2) : ''].filter(Boolean).join(' / ');
            const loseTeam = [getName(players, match.lose_1), match.lose_2 ? getName(players, match.lose_2) : ''].filter(Boolean).join(' / ');
            const isClose = Math.abs((match.win_score || 0) - (match.lose_score || 0)) <= 2;
            const isDominant = (match.win_score || 0) - (match.lose_score || 0) >= 5;
            const isCleanSheet = (match.lose_score || 0) === 0;
            
            // Calculate Upset: winner has lower ELO
            const winnerIds = [match.win_1, match.win_2].filter(Boolean) as string[];
            const loserIds = [match.lose_1, match.lose_2].filter(Boolean) as string[];
            const winnerAvgElo = winnerIds.length > 0 
              ? winnerIds.reduce((sum, id) => sum + (elo.rating.get(id) || 1000), 0) / winnerIds.length 
              : 1000;
            const loserAvgElo = loserIds.length > 0 
              ? loserIds.reduce((sum, id) => sum + (elo.rating.get(id) || 1000), 0) / loserIds.length 
              : 1000;
            const isUpset = loserAvgElo - winnerAvgElo >= 150 && isClose;
            
            // Determine primary tag
            let tagLabel = 'Bình thường';
            let tagClass = 'bg-slate-700 text-white/80';
            
            if (isCleanSheet) {
              tagLabel = '🧹 Clean Sheet';
              tagClass = 'bg-purple-500/20 text-purple-400';
            } else if (isUpset) {
              tagLabel = '⚡ Upset';
              tagClass = 'bg-red-500/20 text-red-400';
            } else if (isClose) {
              tagLabel = 'Sát nút';
              tagClass = 'bg-amber-500/20 text-amber-400';
            } else if (isDominant) {
              tagLabel = 'Áp đảo';
              tagClass = 'bg-green-500/20 text-green-400';
            }
            
            return (
              <div key={match.id || index} className="rounded-xl bg-slate-800 border border-white/[0.08] p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-white/40">{match.date?.split('T')[0]}</div>
                  <div className={cn('px-2 py-0.5 rounded-full text-xs font-bold', tagClass)}>
                    {tagLabel}
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex-1 text-right pr-3">
                    <div className="font-semibold text-green-400 truncate">{winTeam}</div>
                    <div className="text-xs text-white/40">Thắng</div>
                  </div>
                  
                  <div className="px-4 py-2 bg-slate-800 rounded-xl">
                    <div className="text-xl font-black text-white">
                      {match.win_score}-{match.lose_score}
                    </div>
                  </div>
                  
                  <div className="flex-1 text-left pl-3">
                    <div className="font-semibold text-red-400 truncate">{loseTeam}</div>
                    <div className="text-xs text-white/40">Thua</div>
                  </div>
                </div>
                
                {match.season && match.season !== 'Season 1' && (
                  <div className="mt-2 text-xs text-white/30">{match.season}</div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.08] bg-slate-800 p-8 text-center">
          <p className="text-white/40">Không tìm thấy trận đấu</p>
        </div>
      )}
    </div>
  );
}

// ============================================
// SHARED COMPONENTS
// ============================================
function StatCard({ label, value, icon: Icon, color }: { label: string; value: any; icon: any; color: string }) {
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

function BentoCard({ title, icon: Icon, children, className }: { title: string; icon: any; children: React.ReactNode; className?: string }) {
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
