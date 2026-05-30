import {
  buildAnalysisSnapshot,
  type AnalysisEdge,
  type AnalysisMatch,
  type AnalysisPlayer,
  type AnalysisSnapshot,
  type PlayerMetrics,
} from './analysis-core';
import { isGuestId } from './guest';

export type Insight = {
  type: string;
  title: string;
  text: string;
  playersInvolved: string[];
  rarity?: InsightRarity;
  weight?: number;
};

type InsightGroup = 'form' | 'rank' | 'elo' | 'partner' | 'opponent' | 'score' | 'fun';
type InsightRarity = 'common' | 'uncommon' | 'rare' | 'epic';
type InsightFrequency = 'always' | 'frequent' | 'occasional' | 'rare';
type Result = 'W' | 'L';

type InsightCandidate = Insight & {
  group: InsightGroup;
  participantIds: string[];
  rarity: InsightRarity;
  frequency: InsightFrequency;
  appearanceRate: number;
  baseWeight: number;
  evidenceStrength: number;
  surpriseScore: number;
};

type InsightSelectionOptions = {
  seed?: number;
  selectionState?: InsightSelectionState;
};

type CandidateConfig = {
  type: string;
  title: string;
  group: InsightGroup;
  participantIds: string[];
  rarity: InsightRarity;
  frequency: InsightFrequency;
  appearanceRate?: number;
  baseWeight: number;
  evidenceStrength?: number;
  surpriseScore?: number;
  text: string;
};

export type InsightSelectionRuleState = {
  eligibleMisses: number;
  cooldownLoads: number;
  recentSeenCount?: number;
  lastSeenAt?: number;
};

export type InsightSelectionState = Record<string, InsightSelectionRuleState>;

export type InsightSelectionResult = {
  insights: Insight[];
  nextSelectionState: InsightSelectionState;
};

const RARITY_SCORE: Record<InsightRarity, number> = {
  common: 0,
  uncommon: 8,
  rare: 16,
  epic: 26,
};

const FREQUENCY_PENALTY: Record<InsightFrequency, number> = {
  always: 24,
  frequent: 13,
  occasional: 5,
  rare: 0,
};

const SEMANTIC_GROUP_BY_TYPE: Record<string, string> = {
  elo_king: 'elo_power',
  giant_killer: 'elo_power',
  earthquake_victim: 'elo_power',
  gatekeeper: 'elo_power',
  most_improved: 'elo_power',
  free_fall: 'elo_power',
  elo_inflated: 'elo_power',
  elo_defied: 'elo_power',
  bully_lower_elo: 'elo_matchup',
  victim_strong_elo: 'elo_matchup',
  boss_hunter: 'elo_matchup',
  rank_leader: 'rank_race',
  rank_climber: 'rank_race', // keep for backwards compatibility if needed, but we use elo_climber
  elo_climber: 'rank_race',
  rank_camper: 'rank_race',
  top1_gap: 'rank_race',
  rank_launchpad: 'rank_race',
  hot_seat_threat: 'rank_race',
  hot_streak: 'form_streak',
  cold_streak: 'form_streak',
  perfect_form5: 'form_streak',
  zero_form5: 'form_streak',
  late_bloomer: 'form_streak',
  late_choker: 'form_streak',
  streak_breaker: 'form_streak',
  alternating_form: 'form_streak',
  perfect_duo: 'partner_pair',
  bad_duo: 'partner_pair',
  stable_partner: 'partner_pair',
  rare_pair_hot: 'partner_pair',
  glued_pair: 'partner_pair',
  disaster_duo: 'partner_impact',
  partner_boost: 'partner_impact',
  partner_drag: 'partner_impact',
  carry_partner: 'partner_impact',
  heavy_backpack: 'partner_impact',
  cover_master: 'partner_impact',
  parasite_win: 'partner_impact',
  king_rescue: 'partner_impact',
  anchor_drag: 'partner_impact',
  unlucky_draw: 'partner_impact',
  partner_long_games: 'clutch_drama',
  dominant_closer: 'score_style',
  top_attack: 'score_style',
  defense_wall: 'score_style',
  bagel_loss: 'score_style',
  score_bully: 'score_style',
  low_score_magnet: 'score_style',
  glass_cannon: 'score_style',
  stubborn_loser: 'score_style',
  close_loss: 'clutch_drama',
  long_game_addict: 'clutch_drama',
  clutch_master: 'clutch_drama',
  late_collapse: 'clutch_drama',
  drama_magnet: 'clutch_drama',
  hard_counter: 'head_to_head',
  target_dummy: 'head_to_head',
  long_game_rivalry: 'head_to_head',
  mental_block: 'head_to_head',
  sweet_matchup: 'head_to_head',
  balanced_rivalry: 'head_to_head',
  revenge_win: 'head_to_head',
  revenge_target: 'head_to_head',
  gatekeeper_boss: 'head_to_head',
  friendly_fire: 'head_to_head',
  iron_lung: 'activity_attendance',
  missing_player: 'activity_attendance',
  casual_visitor: 'activity_attendance',
  buffet_eater: 'activity_attendance',
  moody_player: 'activity_attendance',
  mercenary: 'activity_attendance',
  fine_sponsor: 'money_fun',
  experience_seeker: 'meta_weird',
  // new V4 scenarios
  rank_takeover: 'rank_race',
  top1_time: 'rank_race',
  stuck_in_mud: 'rank_race',
  quantity_over_quality: 'rank_race',
  vulture_win: 'rank_race',
  money_blackhole: 'money_fun',
  spring_jump: 'rank_race',
  last_laugh: 'clutch_drama',
  triangle_paradox: 'head_to_head',
  chameleon_partner: 'partner_impact',
  quick_finisher: 'score_style',
  attendance_king: 'activity_attendance',
  charity_top_rank: 'elo_matchup',
  golden_victim: 'meta_weird',
};

const SEMANTIC_GROUP_PRIORITY: Record<string, number> = {
  head_to_head: 1.15,
  partner_impact: 1.12,
  form_streak: 1.08,
  elo_matchup: 1.08,
  clutch_drama: 1.04,
  score_style: 0.98,
  partner_pair: 0.96,
  elo_power: 0.95,
  rank_race: 0.86,
  activity_attendance: 0.82,
  money_fun: 0.84,
  meta_weird: 0.8,
};

function namesFor(snapshot: AnalysisSnapshot, ids: string[]) {
  return ids.map(id => snapshot.metrics.get(id)?.name || snapshot.visiblePlayers.find(player => player.id === id)?.name || id);
}

function addCandidate(target: InsightCandidate[], snapshot: AnalysisSnapshot, config: CandidateConfig) {
  target.push({
    type: config.type,
    title: config.title,
    text: config.text,
    playersInvolved: namesFor(snapshot, config.participantIds),
    rarity: config.rarity,
    weight: config.baseWeight,
    group: config.group,
    participantIds: config.participantIds,
    frequency: config.frequency,
    appearanceRate: config.appearanceRate ?? 1,
    baseWeight: config.baseWeight,
    evidenceStrength: config.evidenceStrength ?? 0,
    surpriseScore: config.surpriseScore ?? 0,
  });
}

function round(value: number) {
  return Math.round(value);
}

function absRound(value: number) {
  return Math.abs(Math.round(value));
}

function oneDecimal(value: number) {
  return value.toFixed(1);
}

function rate(wins: number, total: number) {
  return total > 0 ? Math.round((wins / total) * 100) : 0;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function standardDeviation(values: number[]) {
  if (values.length <= 1) return 0;
  const avg = average(values);
  const variance = values.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

function resultForPlayer(match: AnalysisMatch, playerId: string): Result {
  return match.win_1 === playerId || match.win_2 === playerId ? 'W' : 'L';
}

function playerInMatch(match: AnalysisMatch, playerId: string) {
  return match.win_1 === playerId || match.win_2 === playerId || match.lose_1 === playerId || match.lose_2 === playerId;
}

function scoreGap(match: AnalysisMatch) {
  return Math.abs(Number(match.win_score || 0) - Number(match.lose_score || 0));
}

function isTightOrLongGame(match: AnalysisMatch) {
  return scoreGap(match) <= 3 || Number(match.win_score || 0) > 11;
}

function opponentIdsForPlayer(match: AnalysisMatch, playerId: string) {
  if (!playerInMatch(match, playerId)) return [];
  return resultForPlayer(match, playerId) === 'W'
    ? [match.lose_1, match.lose_2].filter((id): id is string => Boolean(id) && !isGuestId(id))
    : [match.win_1, match.win_2].filter((id): id is string => Boolean(id) && !isGuestId(id));
}

function ids(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value));
}

function sideIds(match: AnalysisMatch) {
  return {
    winners: ids([match.win_1, match.win_2]),
    losers: ids([match.lose_1, match.lose_2]),
  };
}

function partnerIdForPlayer(match: AnalysisMatch, playerId: string) {
  if (match.win_1 === playerId) return match.win_2 || null;
  if (match.win_2 === playerId) return match.win_1 || null;
  if (match.lose_1 === playerId) return match.lose_2 || null;
  if (match.lose_2 === playerId) return match.lose_1 || null;
  return null;
}

function partnerForPlayer(match: AnalysisMatch, playerId: string): string {
  return partnerIdForPlayer(match, playerId) || '';
}

function matchTime(match: AnalysisMatch) {
  return new Date(String(match.date || '')).getTime() || 0;
}

function matchDayKey(match: AnalysisMatch) {
  return String(match.date || '').slice(0, 10);
}

function sortNewest(matches: AnalysisMatch[]) {
  return [...matches].sort((a, b) => matchTime(b) - matchTime(a));
}

function sortOldest(matches: AnalysisMatch[]) {
  return [...matches].sort((a, b) => matchTime(a) - matchTime(b));
}

function evidence(total: number) {
  if (total >= 15) return 18;
  if (total >= 10) return 14;
  if (total >= 6) return 9;
  if (total >= 4) return 6;
  return 2;
}

function semanticGroupFor(candidate: InsightCandidate) {
  return SEMANTIC_GROUP_BY_TYPE[candidate.type] || candidate.group;
}

function seededRandom(seed: number | undefined) {
  let state = (seed || Date.now()) >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedPick<T>(items: T[], weightFor: (item: T) => number, random: () => number) {
  const weighted = items
    .map(item => ({ item, weight: Math.max(0, weightFor(item)) }))
    .filter(entry => entry.weight > 0);
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) return null;

  let cursor = random() * total;
  for (const entry of weighted) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.item;
  }

  return weighted[weighted.length - 1]?.item || null;
}

function cooldownForPosition(index: number) {
  if (index <= 1) return 5;
  if (index <= 4) return 3;
  return 2;
}

function normalizeSelectionState(state: InsightSelectionState | undefined) {
  const next = new Map<string, InsightSelectionRuleState>();
  Object.entries(state || {}).forEach(([type, value]) => {
    next.set(type, {
      eligibleMisses: Math.max(0, Number(value.eligibleMisses) || 0),
      cooldownLoads: Math.max(0, Number(value.cooldownLoads) || 0),
      recentSeenCount: Math.max(0, Number(value.recentSeenCount) || 0),
      lastSeenAt: Math.max(0, Number(value.lastSeenAt) || 0),
    });
  });
  return next;
}

function serializeSelectionState(state: Map<string, InsightSelectionRuleState>) {
  const serialized: InsightSelectionState = {};
  state.forEach((value, type) => {
    const eligibleMisses = Math.min(20, Math.max(0, Math.round(value.eligibleMisses || 0)));
    const cooldownLoads = Math.min(8, Math.max(0, Math.round(value.cooldownLoads || 0)));
    const recentSeenCount = Math.min(20, Math.max(0, Math.round(value.recentSeenCount || 0)));
    const lastSeenAt = Math.max(0, Math.round(value.lastSeenAt || 0));
    if (eligibleMisses > 0 || cooldownLoads > 0 || recentSeenCount > 0 || lastSeenAt > 0) {
      serialized[type] = { eligibleMisses, cooldownLoads, recentSeenCount, lastSeenAt };
    }
  });
  return serialized;
}

function candidateSelectionWeight(candidate: InsightCandidate, minScore: number) {
  return Math.max(1, selectionScore(candidate) - minScore + 8);
}

function pattern(results: Result[]) {
  return results.slice(0, 8).join('-');
}

function edgeRate(edge: AnalysisEdge) {
  return Math.round(edge.rate);
}

function rankBoard(snapshot: AnalysisSnapshot) {
  return [...snapshot.playerMetrics]
    .filter(metric => metric.total > 0)
    .sort((a, b) => b.winRate - a.winRate || b.wins - a.wins || a.losses - b.losses || a.name.localeCompare(b.name));
}

function oldEloRanks(metrics: PlayerMetrics[]) {
  return [...metrics]
    .filter(metric => metric.total > 0)
    .sort((a, b) => (b.rating - b.recentEloDelta) - (a.rating - a.recentEloDelta));
}

function mostFrequentDirectional(edges: AnalysisEdge[]) {
  return [...edges].sort((a, b) => b.total - a.total || b.confidence - a.confidence)[0] || null;
}

function pairKey(edge: AnalysisEdge) {
  return [edge.playerId, edge.otherId].sort().join('|');
}

function displayPairEdge(edges: AnalysisEdge[]) {
  return [...edges].sort((a, b) => a.playerName.localeCompare(b.playerName, 'vi') || a.otherName.localeCompare(b.otherName, 'vi'))[0];
}

function uniquePartnerPairs(edges: AnalysisEdge[]) {
  const byPair = new Map<string, AnalysisEdge[]>();
  edges.forEach(edge => {
    const key = pairKey(edge);
    byPair.set(key, [...(byPair.get(key) || []), edge]);
  });

  return Array.from(byPair.values()).map(pairEdges => {
    const edge = displayPairEdge(pairEdges);
    return {
      edge,
      maxAbsImpact: Math.max(...pairEdges.map(row => Math.abs(row.impact))),
    };
  });
}

// State tracker helpers
function buildPreviousSessionBoard(snapshot: AnalysisSnapshot) {
  const rankingMatches = snapshot.rankingMatches;
  if (rankingMatches.length === 0) return [];
  const dayKeys = Array.from(new Set(rankingMatches.map(m => matchDayKey(m)))).sort();
  if (dayKeys.length < 2) return [];
  const lastDayKey = dayKeys[dayKeys.length - 1];
  const prevMatches = rankingMatches.filter(m => matchDayKey(m) < lastDayKey);
  if (prevMatches.length === 0) return [];
  const playerStats = snapshot.visiblePlayers.map(player => {
    const matches = prevMatches.filter(m => playerInMatch(m, player.id));
    const wins = matches.filter(m => resultForPlayer(m, player.id) === 'W').length;
    const total = matches.length;
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    return { id: player.id, name: player.name, total, wins, losses: total - wins, winRate };
  });
  return playerStats
    .filter(p => p.total > 0)
    .sort((a, b) => b.winRate - a.winRate || b.wins - a.wins || a.losses - b.losses || a.name.localeCompare(b.name));
}

function calculateDaysAtTop1(snapshot: AnalysisSnapshot, topPlayerId: string): number {
  const rankingMatches = snapshot.rankingMatches;
  if (rankingMatches.length === 0) return 0;
  const dayKeys = Array.from(new Set(rankingMatches.map(m => matchDayKey(m)))).sort();
  if (dayKeys.length === 0) return 0;
  for (let d = dayKeys.length - 1; d >= 0; d--) {
    const limitDay = dayKeys[d];
    const prevMatches = rankingMatches.filter(m => matchDayKey(m) <= limitDay);
    const playerStats = snapshot.visiblePlayers.map(player => {
      const matches = prevMatches.filter(m => playerInMatch(m, player.id));
      const wins = matches.filter(m => resultForPlayer(m, player.id) === 'W').length;
      const total = matches.length;
      const winRate = total > 0 ? (wins / total) * 100 : 0;
      return { id: player.id, total, wins, losses: total - wins, winRate };
    });
    const board = playerStats
      .filter(p => p.total > 0)
      .sort((a, b) => b.winRate - a.winRate || b.wins - a.wins || a.losses - b.losses);
    if (board.length === 0 || board[0].id !== topPlayerId) {
      if (d === dayKeys.length - 1) return 0;
      const startDayKey = dayKeys[d + 1];
      const startMs = new Date(`${startDayKey}T00:00:00Z`).getTime();
      const endDayKey = dayKeys[dayKeys.length - 1];
      const endMs = new Date(`${endDayKey}T00:00:00Z`).getTime();
      return Math.round((endMs - startMs) / 86400000);
    }
  }
  const startDayKey = dayKeys[0];
  const startMs = new Date(`${startDayKey}T00:00:00Z`).getTime();
  const endDayKey = dayKeys[dayKeys.length - 1];
  const endMs = new Date(`${endDayKey}T00:00:00Z`).getTime();
  return Math.round((endMs - startMs) / 86400000);
}

function calculateGoldenPickles(snapshot: AnalysisSnapshot, playerId: string): number {
  return snapshot.rankingMatches.filter(m =>
    playerInMatch(m, playerId) &&
    resultForPlayer(m, playerId) === 'L' &&
    Number(m.lose_score || 0) === 0
  ).length;
}

function findTriangleCycles(snapshot: AnalysisSnapshot) {
  const adj = new Map<string, Set<string>>();
  snapshot.opponentEdges.forEach(edge => {
    if (edge.total >= 4 && edge.rate >= 60) {
      const neighbors = adj.get(edge.playerId) || new Set<string>();
      neighbors.add(edge.otherId);
      adj.set(edge.playerId, neighbors);
    }
  });
  const cycles: Array<{ A: string; B: string; C: string; totalMatches: number }> = [];
  const players = snapshot.visiblePlayers.map(p => p.id);
  for (let i = 0; i < players.length; i++) {
    const A = players[i];
    const neighborsA = adj.get(A);
    if (!neighborsA) continue;
    for (const B of neighborsA) {
      const neighborsB = adj.get(B);
      if (!neighborsB) continue;
      for (const C of neighborsB) {
        const neighborsC = adj.get(C);
        if (!neighborsC) continue;
        if (neighborsC.has(A)) {
          const abEdge = snapshot.opponentEdges.find(e => e.playerId === A && e.otherId === B);
          const bcEdge = snapshot.opponentEdges.find(e => e.playerId === B && e.otherId === C);
          const caEdge = snapshot.opponentEdges.find(e => e.playerId === C && e.otherId === A);
          const totalMatches = (abEdge?.total || 0) + (bcEdge?.total || 0) + (caEdge?.total || 0);
          cycles.push({ A, B, C, totalMatches });
        }
      }
    }
  }
  return cycles.sort((a, b) => b.totalMatches - a.totalMatches);
}

function findRankTakeover(snapshot: AnalysisSnapshot) {
  const rankingMatches = snapshot.rankingMatches;
  if (rankingMatches.length === 0) return null;
  const latestMatch = rankingMatches[0];
  const prevMatches = rankingMatches.slice(1);
  const playerStatsBefore = snapshot.visiblePlayers.map(player => {
    const matches = prevMatches.filter(m => playerInMatch(m, player.id));
    const wins = matches.filter(m => resultForPlayer(m, player.id) === 'W').length;
    const total = matches.length;
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    return { id: player.id, name: player.name, total, wins, losses: total - wins, winRate };
  });
  const boardBefore = playerStatsBefore
    .filter(p => p.total > 0)
    .sort((a, b) => b.winRate - a.winRate || b.wins - a.wins || a.losses - b.losses || a.name.localeCompare(b.name));
  const rankBeforeMap = new Map(boardBefore.map((p, index) => [p.id, index + 1]));
  const currentBoard = rankBoard(snapshot);
  const currentRankMap = new Map(currentBoard.map((p, index) => [p.id, index + 1]));
  const { winners } = sideIds(latestMatch);
  for (const B_id of winners) {
    if (isGuestId(B_id)) continue;
    const rankBeforeB = rankBeforeMap.get(B_id);
    const rankAfterB = currentRankMap.get(B_id);
    if (!rankBeforeB || !rankAfterB) continue;
    for (const A of currentBoard) {
      if (A.id === B_id) continue;
      const rankBeforeA = rankBeforeMap.get(A.id);
      const rankAfterA = currentRankMap.get(A.id);
      if (!rankBeforeA || !rankAfterA) continue;
      if (rankBeforeB > rankBeforeA && rankAfterB < rankAfterA) {
        return { playerBId: B_id, playerAId: A.id, newRank: rankAfterB };
      }
    }
  }
  return null;
}

// Global variant helper
function getRandomVariant(variants: string[], randomFn?: () => number): string {
  if (!variants || variants.length === 0) return '';
  const index = randomFn ? Math.floor(randomFn() * variants.length) : Math.floor(Math.random() * variants.length);
  return variants[index];
}

// Embedded VARIANTS dictionary
// This file is auto-generated by scratch/generate_variants_dict.js
// Do not edit directly.

const VARIANTS: Record<string, (ctx: any) => string[]> = {
  hot_streak: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `${metric.name} đang thắng liền ${metric.streakCount} trận, phong độ đang cực cao khiến bất kỳ ai cũng phải dè chừng khi chạm trán.`,
      `${metric.name} đang có chuỗi thắng liền ${metric.streakCount} trận, một phong độ hủy diệt buộc mọi đối thủ trên sân phải đặc biệt cảnh giác.`,
      `${metric.name} đang thắng liền ${metric.streakCount} trận, đà thăng tiến này chắc chắn sẽ khiến các đối thủ tiếp theo phải đổ mồ hôi hột.`,
      `${metric.name} đang bay cao với chuỗi thắng liền ${metric.streakCount} trận, ai chạm trán tiếp theo cũng phải chơi với 200% sự tập trung.`,
      `${metric.name} đang bỏ túi ${metric.streakCount} trận thắng liên tục, phong độ "nóng máy" này đang là mối đe dọa cho bất kỳ ai muốn cản bước.`,
    ];
  },
  cold_streak: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `${metric.name} đang thua liền ${metric.streakCount} trận, phong độ sa sút khiến bất kỳ ai đứng chung cặp cũng cảm thấy phần nào áp lực.`,
      `${metric.name} đang gánh chuỗi thua liền ${metric.streakCount} trận, nhịp thi đấu hụt hơi buộc đồng đội trên sân phải đặc biệt nỗ lực.`,
      `${metric.name} đang thua liền ${metric.streakCount} trận, chuỗi đỏ kéo dài này chắc chắn sẽ khiến các trận đấu tiếp theo vô cùng căng thẳng.`,
      `${metric.name} đang chìm sâu với chuỗi thua ${metric.streakCount} trận, muốn giải hạn lúc này đòi hỏi sự tập trung cực kỳ lớn.`,
      `${metric.name} đang nhận ${metric.streakCount} trận thua liên tục, phong độ sụt giảm này đang là bài toán khó cho bất kỳ ai muốn ráp cặp.`,
    ];
  },
  elo_king: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `${topElo.name} đang thống trị đỉnh ELO với ${topElo.rating} điểm, phong độ cực kỳ ổn định và khó bị lật đổ.`,
      `${topElo.name} đang giữ nóc ELO với ${topElo.rating} điểm, vị trí số 1 hiện tại gần như chưa thể lung lay.`,
      `${topElo.name} độc chiếm đỉnh bảng ELO với ${topElo.rating} điểm, khẳng định đẳng cấp hàng đầu trên sân.`,
      `${topElo.name} đang làm chủ đỉnh ELO với ${topElo.rating} điểm, là mục tiêu chinh phục của mọi tay vợt.`,
      `${topElo.name} ngự trị trên đỉnh ELO với ${topElo.rating} điểm, chứng minh sức mạnh của ông vua bảng điểm.`,
    ];
  },
  giant_killer: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `${metric.name} có ${metric.upsetWins} lần lật kèo ngoạn mục dù tỷ lệ thắng trước trận chỉ dưới 30%.`,
      `${metric.name} đã có ${metric.upsetWins} trận thắng đầy bất ngờ khi cơ hội thắng ban đầu dưới 30%.`,
      `${metric.name} từng lật ngược tình thế ${metric.upsetWins} lần dù không được đánh giá cao trước trận.`,
      `${metric.name} giành được ${metric.upsetWins} chiến thắng bất ngờ dù cơ hội thắng trước trận dưới 30%.`,
      `${metric.name} chứng minh khả năng vượt khó với ${metric.upsetWins} lần thắng dù bị đánh giá yếu thế hơn.`,
    ];
  },
  earthquake_victim: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `${metric.name} có ${metric.upsetLosses} lần sẩy chân đầy tiếc nuối dù cơ hội thắng trước trận lên tới trên 70%.`,
      `${metric.name} đã có ${metric.upsetLosses} trận rơi điểm đáng tiếc khi tỷ lệ thắng ban đầu được đánh giá trên 70%.`,
      `${metric.name} từng sẩy chân ${metric.upsetLosses} lần trong những trận đấu tưởng chừng nắm chắc chiến thắng.`,
      `${metric.name} để rơi chiến thắng ${metric.upsetLosses} lần dù trước trận được đánh giá cao hơn hẳn đối thủ.`,
      `${metric.name} có ${metric.upsetLosses} trận thua đầy bất ngờ dù cơ hội thắng ban đầu lên tới trên 70%.`,
    ];
  },
  perfect_form5: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `${metric.name} đang sở hữu phong độ tuyệt đối với 5 trận thắng liên tiếp gần đây.`,
      `${metric.name} đang bay cao với 5 chiến thắng liên tục, phong độ 5 trận gần nhất đang đạt mức hoàn hảo.`,
      `${metric.name} đang chơi cực bay, bỏ túi trọn vẹn 5 chiến thắng trong 5 lần ra sân gần nhất.`,
      `${metric.name} đang duy trì phong độ đỉnh cao với chuỗi 5 trận toàn thắng gần đây.`,
      `${metric.name} đang có phong độ cực sung, thắng sạch cả 5 trận đấu gần nhất.`,
    ];
  },
  zero_form5: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `${metric.name} đang gặp dớp phong độ khi để thua cả 5 trận đấu gần đây nhất.`,
      `${metric.name} đang trải qua giai đoạn khó khăn với 5 thất bại liên tục trong các trận gần đây.`,
      `${metric.name} đang chịu chuỗi phong độ đi xuống, thua trắng cả 5 lần ra sân gần nhất.`,
      `${metric.name} đang rơi vào chuỗi sụt giảm phong độ với 5 trận thua liên tiếp gần đây.`,
      `${metric.name} đang rất cần một chiến thắng để giải tỏa sau khi nhận 5 thất bại liên tục gần nhất.`,
    ];
  },
  gatekeeper: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `${metric.name} đã chơi ${metric.total} trận nhưng điểm ELO vẫn loanh quanh mốc xuất phát ${metric.rating}.`,
      `${metric.name} đã cày ải ${metric.total} trận, thắng thua bù trừ làm ELO vẫn dậm chân tại chỗ quanh ${metric.rating}.`,
      `${metric.name} đã tích lũy ${metric.total} trận đấu mà ELO vẫn chưa thể bứt phá, chỉ xoay quanh ${metric.rating} điểm.`,
      `${metric.name} ra sân ${metric.total} trận nhưng điểm số ELO vẫn giữ nguyên vị thế trung lập ở mức ${metric.rating}.`,
      `${metric.name} trải qua ${metric.total} trận đấu mà số điểm ELO vẫn dậm chân quanh mốc ${metric.rating}.`,
    ];
  },
  most_improved: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `${metric.name} bứt phá mạnh mẽ khi tăng liền ${round(metric.recentEloDelta)} điểm ELO trong tuần này.`,
      `${metric.name} đang có phong độ thăng hoa, tích lũy thêm ${round(metric.recentEloDelta)} ELO từ đầu tuần.`,
      `${metric.name} cho thấy sự tiến bộ rõ rệt với ${round(metric.recentEloDelta)} điểm ELO cộng thêm trong tuần này.`,
      `${metric.name} đang trên đà thăng tiến lớn khi tăng ${round(metric.recentEloDelta)} điểm ELO qua các trận tuần này.`,
      `${metric.name} củng cố thứ hạng với ${round(metric.recentEloDelta)} điểm ELO gia tăng từ đầu tuần.`,
    ];
  },
  free_fall: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `${metric.name} đang có dấu hiệu chững lại khi sụt giảm ${absRound(metric.recentEloDelta)} điểm ELO trong tuần này.`,
      `${metric.name} gặp khó khăn trong các trận tuần này, để rơi mất ${absRound(metric.recentEloDelta)} điểm ELO.`,
      `${metric.name} đang tạm thời sa sút phong độ, đánh mất ${absRound(metric.recentEloDelta)} điểm ELO từ đầu tuần.`,
      `${metric.name} bị trừ ${absRound(metric.recentEloDelta)} điểm ELO sau những kết quả không như ý trong tuần này.`,
      `${metric.name} đang rơi vào chuỗi khó khăn khi đánh mất ${absRound(metric.recentEloDelta)} ELO từ đầu tuần.`,
    ];
  },
  streak_breaker: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    if (ctx.state === 1) {
      return [
        `${player.name} vừa cắt đứt chuỗi ${breaker.streak} trận thắng liên tiếp của ${target.name} ở trận đấu gần nhất.`,
        `${player.name} chặn đứng chuỗi ${breaker.streak} trận toàn thắng của ${target.name} sau cuộc đối đầu vừa qua.`,
        `${player.name} chấm dứt mạch bất bại ${breaker.streak} trận của ${target.name} sau chiến thắng thuyết phục.`,
        `${player.name} hạ gục ${target.name}, khép lại chuỗi ${breaker.streak} trận thắng liên tục của đối thủ.`,
      ];
    } else {
      return [
        `Kể từ sau khi bị ${player.name} cắt chuỗi thắng, ${target.name} vẫn chưa tìm lại chính mình với chuỗi ${X} trận thua liên tiếp.`,
        `Chuỗi ngày u ám của ${target.name} vẫn chưa dứt khi phải nhận thêm ${X} trận thua liên tục kể từ ngày bị ${player.name} cắt chuỗi ${breaker.streak} trận thắng.`,
        `Chưa thể đứng dậy sau trận thua ${player.name}, ${target.name} tiếp tục chìm sâu với thêm ${X} thất bại sau đó.`,
        `${target.name} dường như vẫn chưa thoát khỏi dớp thua kể từ trận bị ${player.name} cắt chuỗi thắng, phải nhận thêm chuỗi ${X} trận trắng tay.`,
      ];
    }
  },
  revenge_win: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    if (ctx.state === 1) {
      return [
        `${player.name} cuối cùng đã giải được dớp trước ${opponent.name} sau chuỗi ${revenge.priorLosses} trận thua đối đầu liên tiếp.`,
        `${player.name} phục hận thành công trước ${opponent.name}, có được thắng lợi sau ${revenge.priorLosses} lần thất bại đối đầu liên tục trước đó.`,
        `${player.name} cắt chuỗi ${revenge.priorLosses} trận thua liên tiếp trước ${opponent.name} bằng một thắng lợi vô cùng quan trọng.`,
        `Sau ${revenge.priorLosses} trận chỉ biết đến thất bại khi đối đầu, ${player.name} đã tìm lại niềm vui chiến thắng trước ${opponent.name}.`,
      ];
    } else {
      return [
        `Sau khi giải dớp thành công trước ${opponent.name}, ${player.name} thừa thắng xông lên với thêm ${Y} trận thắng đối đầu liên tiếp.`,
        `Món nợ cũ đã thanh toán xong, ${player.name} tiếp tục lấn lướt ${opponent.name} với ${Y} chiến thắng liên tiếp sau đó.`,
        `Nút thắt tâm lý đã gỡ, ${player.name} áp đảo hoàn toàn ${opponent.name} với chuỗi ${Y} trận thắng đối đầu tiếp theo.`,
        `Cú lật kèo đối đầu ấn tượng: ${player.name} bỏ túi thêm ${Y} thắng lợi trước ${opponent.name} kể từ trận giải dớp.`,
      ];
    }
  },
  rank_leader: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `${topRank.name} xuất sắc chiếm ngôi đầu bảng xếp hạng với tỷ lệ thắng ấn tượng ${round(topRank.winRate)}% (${topRank.wins}/${topRank.total} trận).`,
      `${topRank.name} đang làm chủ cuộc đua vô địch khi chễm chệ vị trí Top 1 BXH (${topRank.wins}/${topRank.total} trận thắng).`,
      `${topRank.name} duy trì vị thế số 1 trên bảng xếp hạng với tỷ lệ thắng đạt ${round(topRank.winRate)}%.`,
      `${topRank.name} dẫn đầu cuộc đua xếp hạng mùa này với thành tích ${topRank.wins} trận thắng sau ${topRank.total} trận.`,
      `${topRank.name} tạm thời nắm giữ vị trí Top 1 BXH, sở hữu tỷ lệ thắng cao nhất giải đấu (${round(topRank.winRate)}%).`,
    ];
  },
  elo_climber: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `${metric.name} leo liền ${places} bậc trên bảng ELO nhờ bỏ túi ${recentWins} chiến thắng trong 5 trận gần nhất.`,
      `${metric.name} đang có đà bứt phá mạnh mẽ khi tăng ${places} bậc ELO với thành tích ${recentWins}/5 trận thắng gần đây.`,
      `${metric.name} thăng tiến ${places} bậc trên bảng ELO, ghi dấu ấn với ${recentWins} trận thắng trong loạt 5 trận vừa qua.`,
      `${metric.name} áp sát nhóm trên khi leo thêm ${places} bậc ELO, thắng ${recentWins} trong 5 trận gần đây.`,
      `${metric.name} có chuỗi bứt tốc ấn tượng, thăng hạng ${places} bậc ELO sau khi giành ${recentWins} chiến thắng gần nhất.`,
    ];
  },
  perfect_duo: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `${edge.playerName} và ${edge.otherName} thi đấu cực kỳ ăn ý, thắng ${edge.wins}/${edge.total} trận chung với tỷ lệ ${edgeRate(edge)}%.`,
      `${edge.playerName} ráp cặp cùng ${edge.otherName} đang là bộ đôi đáng gờm, đạt tỷ lệ thắng chung ${edgeRate(edge)}% (${edge.wins}/${edge.total} trận).`,
      `Sự kết hợp hiệu quả: ${edge.playerName} và ${edge.otherName} thắng tới ${edge.wins}/${edge.total} trận khi đứng chung sân.`,
      `${edge.playerName} bắt cặp với ${edge.otherName} mang lại kết quả cực tốt, thắng ${edge.wins}/${edge.total} trận (đạt ${edgeRate(edge)}%).`,
      `${edge.playerName} và ${edge.otherName} là cặp đôi rất hợp vía khi gặt hái ${edge.wins}/${edge.total} chiến thắng chung.`,
    ];
  },
  bad_duo: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `${edge.playerName} đi với ${edge.otherName} chưa đạt hiệu quả mong muốn, chỉ mới thắng ${edge.wins}/${edge.total} trận chung.`,
      `${edge.playerName} và ${edge.otherName} chưa thực sự tìm được tiếng nói chung, mới thắng ${edge.wins}/${edge.total} trận (tỷ lệ ${edgeRate(edge)}%).`,
      `Chưa tìm thấy nhịp thi đấu chung: ${edge.playerName} bắt cặp cùng ${edge.otherName} mới thắng ${edge.wins}/${edge.total} trận.`,
      `${edge.playerName} ráp sân cùng ${edge.otherName} chỉ có được ${edge.wins}/${edge.total} chiến thắng, hai người cần thêm thời gian để ăn khớp.`,
      `${edge.playerName} và ${edge.otherName} chưa thật sự bắt nhịp tốt khi đấu cặp, mới thắng ${edge.wins}/${edge.total} trận.`,
    ];
  },
  partner_boost: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `${edge.playerName} khi đứng chung với ${edge.otherName} mang về ${edge.wins}/${edge.total} chiến thắng, kết quả ấn tượng hơn hẳn phong độ thường thấy.`,
      `${edge.playerName} cặp với ${edge.otherName} ẵm ${edge.wins}/${edge.total} trận thắng, thi đấu thăng hoa và hiệu quả hơn hẳn mức bình thường.`,
      `Cứ đứng cạnh ${edge.otherName} là ${edge.playerName} thi đấu thăng hoa hơn, gặt ${edge.wins}/${edge.total} trận thắng với phong độ vượt xa ngày thường.`,
      `Có vẻ rất hợp vía: ${edge.playerName} đánh cặp cùng ${edge.otherName} thắng ${edge.wins}/${edge.total} trận, màn thể hiện tốt hơn hẳn mức thường thấy.`,
      `Cặp đôi ăn ý: ${edge.playerName} và ${edge.otherName} ráp vào nhau rất mượt, ăn ${edge.wins}/${edge.total} trận và kéo phong độ lên cao hơn hẳn bình thường.`,
    ];
  },
  partner_drag: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `${edge.playerName} khi đứng chung với ${edge.otherName} mới có ${edge.wins}/${edge.total} chiến thắng, kết quả thấp hơn hẳn phong độ thường thấy.`,
      `${edge.playerName} cặp với ${edge.otherName} chỉ thắng ${edge.wins}/${edge.total} trận, nhịp thi đấu có vẻ hụt hơi hơn mức bình thường.`,
      `Cặp này hơi lệch sóng: cứ đứng cạnh ${edge.otherName} là ${edge.playerName} không còn giữ được phong độ ngày thường, mới gặt ${edge.wins}/${edge.total} trận thắng.`,
      `Có vẻ chưa thật sự hợp vía: ${edge.playerName} đánh cặp cùng ${edge.otherName} thắng ${edge.wins}/${edge.total} trận, màn thể hiện thấp hơn hẳn mức thường thấy.`,
      `Cặp đôi chưa vào guồng: ${edge.playerName} và ${edge.otherName} ráp vào nhau còn khá gượng, mới gặt ${edge.wins}/${edge.total} trận nhưng kéo phong độ xuống thấp hơn bình thường.`,
    ];
  },
  cover_master: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `${metric.name} không phải tay săn điểm chủ lực nhưng phối hợp cực kỳ ăn ý với các đối tác, đạt ${round(metric.synergyScore)} điểm phối hợp.`,
      `${metric.name} sở hữu hiệu suất ghi điểm vừa phải nhưng có chỉ số phối hợp đồng đội rất cao với ${round(metric.synergyScore)} điểm.`,
      `${metric.name} tuy không dẫn đầu về khâu dứt điểm nhưng hỗ trợ đồng đội cực tốt, đạt ${round(metric.synergyScore)} điểm phối hợp.`,
      `${metric.name} sở hữu chỉ số phối hợp đồng đội ấn tượng đạt ${round(metric.synergyScore)} điểm, làm chỗ dựa tốt cho các đối tác đứng cùng.`,
      `${metric.name} đóng góp lớn vào lối chơi chung nhờ khả năng phối hợp ăn ý đạt ${round(metric.synergyScore)} điểm, dù không ghi quá nhiều điểm số cá nhân.`,
    ];
  },
  carry_partner: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Đứng chung sân với ${edge.playerName}, phong độ của ${edge.otherName} được kéo lên hẳn, từ ${round(otherMetric.winRate)}% vọt lên ${edgeRate(edge)}%.`,
      `Sự hỗ trợ đắc lực từ ${edge.playerName} giúp ${edge.otherName} thi đấu thăng hoa, nâng tỷ lệ thắng từ ${round(otherMetric.winRate)}% lên ${edgeRate(edge)}%.`,
      `${edge.playerName} gánh vác thế trận cực tốt, giúp ${edge.otherName} tăng vọt tỷ lệ thắng từ ${round(otherMetric.winRate)}% lên ${edgeRate(edge)}%.`,
      `Cứ ghép cặp với ${edge.playerName} là ${edge.otherName} đánh như lên đồng, tỷ lệ thắng nhảy từ ${round(otherMetric.winRate)}% lên ${edgeRate(edge)}%.`,
      `Một bờ vai vững chãi: ${edge.playerName} giúp đối tác ${edge.otherName} cải thiện tỷ lệ thắng từ mức bình thường ${round(otherMetric.winRate)}% lên tới ${edgeRate(edge)}%.`,
    ];
  },
  heavy_backpack: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `${edge.otherName} đang bay với ${round(otherMetric.winRate)}% thắng, nhưng kẹp chung với ${edge.playerName} thì chỉ còn ${edgeRate(edge)}%. Báo thủ chặt xích là đây!`,
      `Phong độ của ${edge.otherName} tụt dốc không phanh từ ${round(otherMetric.winRate)}% xuống ${edgeRate(edge)}% mỗi khi phải ráp chung team với ${edge.playerName}.`,
      `Có vẻ ${edge.playerName} là bài test thể lực quá tầm, khiến ${edge.otherName} tụt tỷ lệ thắng từ ${round(otherMetric.winRate)}% xuống tận ${edgeRate(edge)}%.`,
      `Ghép cặp chưa tìm thấy nhịp: ${edge.otherName} bị kéo tỷ lệ thắng từ ${round(otherMetric.winRate)}% xuống ${edgeRate(edge)}% khi đi cùng ${edge.playerName}.`,
      `${edge.playerName} vô tình trở thành cục tạ khiến ${edge.otherName} sụt giảm phong độ rõ rệt, từ mức ${round(otherMetric.winRate)}% xuống còn ${edgeRate(edge)}%.`,
    ];
  },
  stable_partner: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `${edge.playerName} và ${edge.otherName} cùng nhau ra sân ${edge.total} trận, thắng ${edge.wins} trận, tuy không quá bùng nổ nhưng thi đấu rất tròn vai.`,
      `Thi đấu ổn định: ${edge.playerName} và ${edge.otherName} bắt cặp cùng nhau ${edge.total} trận, mang về ${edge.wins} chiến thắng khá tròn vai.`,
      `${edge.playerName} ráp sân cùng ${edge.otherName} đạt kết quả ổn định với ${edge.wins}/${edge.total} trận thắng, phối hợp vừa vặn và tròn vai.`,
      `Bộ đôi tròn vai: ${edge.playerName} và ${edge.otherName} thi đấu ${edge.total} trận chung, gặt hái ${edge.wins} thắng lợi đúng với phong độ vốn có.`,
      `${edge.playerName} bắt cặp với ${edge.otherName} qua ${edge.total} trận đạt tỷ lệ thắng ${edgeRate(edge)}%, lối chơi ổn định và tròn vai.`,
    ];
  },
  glued_pair: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    if (ctx.state === 1) {
      return [
        `Độc chiếm ngôi đầu về độ bền bỉ: ${glued.playerName} và ${glued.otherName} sát cánh cùng nhau nhiều nhất sân với ${glued.total} trận chung đội.`,
        `${glued.playerName} và ${glued.otherName} đang dẫn đầu tuyệt đối toàn sân về tần suất chung đội với ${glued.total} trận sát cánh.`,
        `${glued.playerName} và ${glued.otherName} độc tôn vị thế cặp đôi dính nhau nhất sân mùa này với ${glued.total} lần ráp cặp.`,
        `Cặp đôi đồng hành số 1: ${glued.playerName} và ${glued.otherName} sở hữu số trận chung đội nhiều nhất giải đấu với ${glued.total} lần ra sân.`,
      ];
    } else {
      return [
        `${glued.playerName} và ${glued.otherName} đang là một trong những cặp đôi song hành nhiều nhất giải đấu với ${glued.total} trận chung đội.`,
        `Dính nhau như sam: ${glued.playerName} và ${glued.otherName} nằm trong nhóm cặp đôi cày ải nhiều nhất sân với ${glued.total} trận.`,
        `Bạn thân sân bãi: ${glued.playerName} và ${glued.otherName} góp mặt trong số những bộ đôi sát cánh cùng nhau nhiều nhất (${glued.total} trận).`,
        `${glued.playerName} và ${glued.otherName} là một trong những bộ đôi bắt cặp thường xuyên nhất mùa này với ${glued.total} lần chung chiến tuyến.`,
      ];
    }
  },
  rare_pair_hot: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `${edge.playerName} và ${edge.otherName} mới bắt cặp ${edge.total} trận nhưng đã thắng tới ${edge.wins} trận, một sự kết hợp đầy triển vọng.`,
      `${edge.playerName} ráp sân cùng ${edge.otherName} tuy chưa nhiều (${edge.total} trận) nhưng đạt tỷ lệ thắng cực cao ${edgeRate(edge)}%.`,
      `Nhân tố mới tiềm năng: ${edge.playerName} và ${edge.otherName} mới chơi chung ${edge.total} trận nhưng gặt hái tới ${edge.wins} chiến thắng.`,
      `${edge.playerName} và ${edge.otherName} mới chỉ sát cánh ${edge.total} trận nhưng hiệu suất thắng đạt ${edgeRate(edge)}%, cho thấy sự ăn ý ngay từ đầu.`,
      `Số trận ít nhưng chất lượng: ${edge.playerName} kết hợp cùng ${edge.otherName} mới ${edge.total} trận đã mang về ${edge.wins} thắng lợi.`,
    ];
  },
  disaster_duo: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `${edge.playerName} và ${edge.otherName} chưa có duyên thắng cặp, các trận thua có cách biệt trung bình lên tới ${oneDecimal(avgLossDiff)} điểm.`,
      `Ráp sân chưa hiệu quả: bộ đôi ${edge.playerName} - ${edge.otherName} thua cách biệt trung bình ${oneDecimal(avgLossDiff)} điểm trong các trận bại.`,
      `${edge.playerName} đứng chung với ${edge.otherName} gặp nhiều khó khăn, các trận thua chênh lệch trung bình ${oneDecimal(avgLossDiff)} điểm.`,
      `Chưa tìm được nhịp thi đấu chung, ${edge.playerName} và ${edge.otherName} nhận các thất bại với khoảng cách điểm trung bình là ${oneDecimal(avgLossDiff)}.`,
      `${edge.playerName} ráp cặp cùng ${edge.otherName} chưa ăn ý, nhận các trận thua với cách biệt trung bình ${oneDecimal(avgLossDiff)} điểm.`,
    ];
  },
  partner_long_games: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Cặp đôi ${edge.playerName} - ${edge.otherName} có khá nhiều trận giằng co, ghi nhận ${edge.deuceGames} trận phải phân định qua mốc 11 điểm.`,
      `Những trận đấu của ${edge.playerName} và ${edge.otherName} thường có tính giằng co cao, sở hữu ${edge.deuceGames} lần kéo dài quá 11 điểm.`,
      `Có tới ${edge.deuceGames} trận đấu của cặp đôi ${edge.playerName} - ${edge.otherName} phải kéo dài quá điểm số 11 để phân thắng bại.`,
      `Không thiếu những pha giằng co kịch tính, ${edge.playerName} và ${edge.otherName} tích lũy ${edge.deuceGames} trận đấu phải đánh quá 11 điểm.`,
      `Đôi bên chơi khá kiên cường khi ráp cặp chung, trải qua ${edge.deuceGames} trận đấu kéo dài quá mốc 11 điểm.`,
    ];
  },
  top_attack: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `${metric.name} cùng các đồng đội tấn công rất hiệu quả, ghi trung bình ${oneDecimal(metric.avgPointsFor)} điểm mỗi trận.`,
      `Khả năng ghi điểm ấn tượng: ${metric.name} và đối tác gặt hái trung bình ${oneDecimal(metric.avgPointsFor)} điểm mỗi lần ra sân.`,
      `Đội của ${metric.name} sở hữu sức tấn công mạnh mẽ, ghi được trung bình ${oneDecimal(metric.avgPointsFor)} điểm/trận.`,
      `Đứng chung với ${metric.name} rất an tâm ghi điểm, trung bình mỗi trận đội nhà ghi được ${oneDecimal(metric.avgPointsFor)} điểm.`,
      `Hiệu suất tấn công hàng đầu: đội của ${metric.name} ghi trung bình tới ${oneDecimal(metric.avgPointsFor)} điểm mỗi trận.`,
    ];
  },
  defense_wall: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Hàng thủ vững chắc: ${metric.name} cùng đồng đội chỉ để đối phương ghi trung bình ${oneDecimal(metric.avgConceded)} điểm mỗi trận.`,
      `Trung bình mỗi trận đấu, đội của ${metric.name} chỉ để lọt lưới ${oneDecimal(metric.avgConceded)} điểm.`,
      `Chốt chặn tin cậy: ${metric.name} khống chế số điểm ghi được của đối thủ ở mức trung bình ${oneDecimal(metric.avgConceded)} điểm/trận.`,
      `Đối thủ rất khó ghi điểm khi chạm trán ${metric.name}, trung bình mỗi trận chỉ ghi được ${oneDecimal(metric.avgConceded)} điểm.`,
      `Khả năng bảo vệ phần sân ấn tượng: đội của ${metric.name} chỉ để lọt lưới trung bình ${oneDecimal(metric.avgConceded)} điểm mỗi trận.`,
    ];
  },
  dominant_closer: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `${metric.name} sở hữu ${metric.dominantWins} chiến thắng giòn giã với cách biệt lớn từ 7 điểm trở lên.`,
      `Khép lại trận đấu nhanh chóng: ${metric.name} có tới ${metric.dominantWins} trận thắng áp đảo với khoảng cách tối thiểu 7 điểm.`,
      `Thắng lợi thuyết phục: ${metric.name} tích lũy ${metric.dominantWins} lần hạ gục đối thủ với tỷ số cách biệt lớn.`,
      `${metric.name} chứng tỏ sức ép thế trận tốt với ${metric.dominantWins} chiến thắng cách biệt từ 7 điểm trở lên.`,
      `Khi giành chiến thắng, ${metric.name} có ${metric.dominantWins} lần kết thúc trận đấu vô cùng gọn gàng với cách biệt lớn.`,
    ];
  },
  close_loss: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `${metric.name} đã trải qua ${metric.closeLosses} trận thua sát nút với cách biệt tối thiểu 2 điểm đầy tiếc nuối.`,
      `Thiếu một chút may mắn: ${metric.name} để thua sát nút ${closeLosses} trận với khoảng cách chỉ đúng 2 điểm.`,
      `Rất nhiều kèo đấu nghẹt thở: ${metric.name} nhận ${closeLosses} thất bại sít sao với tỷ số sát nút.`,
      `Đáng tiếc cho ${metric.name} khi phải nhận ${closeLosses} trận thua với cách biệt tối thiểu 2 điểm.`,
      `Duy trì thế trận bám đuổi tốt nhưng ${metric.name} để rơi chiến thắng ở ${closeLosses} trận đấu sát nút.`,
    ];
  },
  long_game_addict: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Vua đấu giằng co: ${metric.name} là người góp mặt trong nhiều trận đấu kéo dài qua mốc 11 điểm nhất sân với ${metric.deuceMatches} trận.`,
      `Bền bỉ nhất giải: ${metric.name} dẫn đầu toàn sân về số trận đấu phải giằng co sau mốc 11 điểm (${metric.deuceMatches} trận).`,
      `Đạt kỷ lục về số trận đấu kéo dài, ${metric.name} đã trải qua ${metric.deuceMatches} lần phân định thắng thua quá điểm số 11.`,
      `Không ngại đấu súng kéo dài: ${metric.name} có tới ${metric.deuceMatches} trận đấu căng thẳng kéo qua 11 điểm, nhiều nhất giải đấu.`,
      `Thử thách sức bền gọi tên ${metric.name} với kỷ lục tham gia ${metric.deuceMatches} trận đấu giằng co quá mốc 11 điểm.`,
    ];
  },
  bagel_loss: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `${metric.name} có ${metric.bagelLosses} trận thua khá sâu khi đội nhà chỉ ghi được tối đa 2 điểm.`,
      `Trận đấu khó khăn: ${metric.name} trải qua ${metric.bagelLosses} lần để đối thủ dẫn trước với điểm số ghi được từ 2 trở xuống.`,
      `Gặp khó khăn trong khâu dứt điểm: đội của ${metric.name} có ${metric.bagelLosses} trận thua chỉ ghi được tối đa 2 điểm.`,
      `Thất bại chóng vánh: ${metric.name} cùng đồng đội có ${metric.bagelLosses} trận thua cách biệt lớn, ghi không quá 2 điểm.`,
      `${metric.name} nhận ${metric.bagelLosses} trận thua mà đội nhà chỉ ghi được từ 2 điểm trở xuống.`,
    ];
  },
  clutch_master: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Bản lĩnh trận mạc: ${metric.name} giành chiến thắng tới ${metric.closeWins} trận sát nút, đạt tỷ lệ thắng ${round(tightWinRate)}% trong các kèo đấu giằng co.`,
      `Tay vợt của những trận đấu lớn: ${metric.name} thắng tới ${metric.closeWins} trận cách biệt 2 điểm, đạt tỷ lệ thắng kèo căng thẳng ${round(tightWinRate)}%.`,
      `Khả năng dứt điểm trận đấu nghẹt thở ấn tượng: ${metric.name} thắng ${metric.closeWins} trận sát nút với tỷ lệ thắng giằng co ${round(tightWinRate)}%.`,
      `Cực kỳ lỳ lợm ở thời khắc quyết định, ${metric.name} bỏ túi ${metric.closeWins} trận thắng cách biệt 2 điểm (tỷ lệ thắng giằng co ${round(tightWinRate)}%).`,
      `Hiệu suất thắng trận sát nút đáng nể: ${metric.name} vượt qua sức ép để thắng ${metric.closeWins} trận căng thẳng (tỷ lệ thắng giằng co ${round(tightWinRate)}%).`,
    ];
  },
  late_collapse: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Gặp khó khăn ở thời khắc quyết định: ${metric.name} để thua sát nút tới ${metric.closeLosses} trận, nhiều lần lỡ nhịp ở cuối trận.`,
      `Đáng tiếc ở loạt đấu cuối: ${metric.name} nhận ${metric.closeLosses} trận thua cách biệt vỏn vẹn 2 điểm, nhiều kèo chỉ thiếu một chút may mắn.`,
      `Nhịp đấu quyết định chưa tốt: ${metric.name} nhận tới ${metric.closeLosses} thất bại sít sao, để rơi điểm ở những loạt bóng cuối.`,
      `Rơi điểm đầy tiếc nuối: ${metric.name} gánh nhận ${metric.closeLosses} trận thua sát nút, hụt hơi ở thời điểm quan trọng.`,
      `Duy trì bám đuổi tốt nhưng thiếu nhịp dứt điểm: ${metric.name} có tới ${metric.closeLosses} thất bại cách biệt 2 điểm đầy tiếc nuối.`,
    ];
  },
  score_bully: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Thắng là thắng sâu: Mỗi khi giành thắng lợi, đội của ${metric.name} dẫn trước đối thủ trung bình tới ${oneDecimal(metric.avgWinDiff)} điểm, cao nhất toàn giải.`,
      `Hiệu suất áp đảo đỉnh bảng: ${metric.name} là tay vợt có khoảng cách điểm thắng trung bình lớn nhất sân khi đạt ${oneDecimal(metric.avgWinDiff)} điểm mỗi trận thắng.`,
      `Khi đã thắng là thắng đậm nhất sân: đội của ${metric.name} vượt qua đối thủ với cách biệt trung bình kỷ lục ${oneDecimal(metric.avgWinDiff)} điểm mỗi trận.`,
      `Sức ép thế trận lớn nhất: ${metric.name} dẫn đầu giải đấu về chỉ số thắng cách biệt trung bình, đạt ${oneDecimal(metric.avgWinDiff)} điểm mỗi trận thắng.`,
      `Đội của ${metric.name} sở hữu những trận thắng gọn gàng nhất giải với cách biệt điểm trung bình lên tới ${oneDecimal(metric.avgWinDiff)} điểm.`,
    ];
  },
  low_score_magnet: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Chưa tìm được nhịp ghi điểm: ${metric.name} có ${metric.lowScoreLosses} trận thua mà đội nhà chỉ ghi được tối đa 4 điểm.`,
      `Nhiều trận đấu gặp khó khăn: đội của ${metric.name} có ${metric.lowScoreLosses} thất bại mà không thể ghi quá mốc 4 điểm.`,
      `Hàng công bị khóa chặt: ${metric.name} cùng đối tác nhận ${metric.lowScoreLosses} trận thua cách biệt lớn, ghi không quá 4 điểm.`,
      `Thất bại với điểm số thấp: ${metric.name} cùng đồng đội trải qua ${metric.lowScoreLosses} trận thua chỉ ghi được tối đa 4 điểm.`,
      `Khó khăn trong khâu lên điểm: đội của ${metric.name} nhận ${metric.lowScoreLosses} trận thua mà chỉ ghi được dưới 4 điểm.`,
    ];
  },
  hard_counter: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Đối đầu áp đảo: ${edge.playerName} đang là "khắc tinh" của ${edge.otherName} khi giành chiến thắng tới ${edge.wins}/${edge.total} trận chạm trán.`,
      `Thành tích đối đầu vượt trội: ${edge.playerName} tỏ ra lấn lướt trước ${edge.otherName} với ${edge.wins} chiến thắng sau ${edge.total} lần đụng độ.`,
      `Gặp dớp đối đầu: ${edge.otherName} tỏ ra cực kỳ kỵ rơ trước ${edge.playerName}, để đối phương thắng tới ${edge.wins}/${edge.total} trận.`,
      `Ưu thế đối đầu vượt trội: ${edge.playerName} giành tới ${edge.wins} thắng lợi sau ${edge.total} lần đối mặt với ${edge.otherName}.`,
      `Lối chơi khắc chế hiệu quả: ${edge.playerName} tỏ ra rất có duyên khi đối đầu ${edge.otherName}, bỏ túi tới ${edge.wins}/${edge.total} trận thắng.`,
    ];
  },
  target_dummy: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Đối đầu khó khăn: ${edge.playerName} lép vế trước ${edge.otherName} khi để thua tới ${edge.losses}/${edge.total} trận chạm trán.`,
      `Thử thách đối đầu: ${edge.playerName} chưa tìm ra lời giải trước ${edge.otherName} khi nhận tới ${edge.losses} trận thua sau ${edge.total} lần đụng độ.`,
      `Thành tích đối đầu chưa tốt: ${edge.playerName} để đối phương lấn lướt với ${edge.losses}/${edge.total} trận thua khi chạm trán ${edge.otherName}.`,
      `Đối thủ khó vượt qua: ${edge.playerName} để thua ${edge.losses} trận sau ${edge.total} lần đụng độ với ${edge.otherName}.`,
      `Gặp nhiều khó khăn khi chạm trán: ${edge.playerName} chỉ giành được ${edge.wins} chiến thắng sau ${edge.total} lần đối đầu với ${edge.otherName}.`,
    ];
  },
  balanced_rivalry: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Kỳ phùng địch thủ: ${mostRepeated.playerName} và ${mostRepeated.otherName} bất phân thắng bại với tỷ số đối đầu ${mostRepeated.wins}-${mostRepeated.losses} sau ${mostRepeated.total} trận.`,
      `Kèo đấu cân tài cân sức: ${mostRepeated.playerName} và ${mostRepeated.otherName} chạm trán ${mostRepeated.total} lần, mỗi bên sở hữu ${mostRepeated.wins} và ${mostRepeated.losses} chiến thắng.`,
      `Ngang tài ngang sức: ${mostRepeated.playerName} đối đầu ${mostRepeated.otherName} ${mostRepeated.total} trận với kết quả thắng-thua cực kỳ sít sao ${mostRepeated.wins}-${mostRepeated.losses}.`,
      `Cặp kỳ phùng địch thủ: ${mostRepeated.playerName} và ${mostRepeated.otherName} giằng co từng điểm số qua ${mostRepeated.total} trận đối mặt (tỷ số đối đầu ${mostRepeated.wins}-${mostRepeated.losses}).`,
      `Bất phân thắng bại: cuộc chạm trán giữa ${mostRepeated.playerName} và ${mostRepeated.otherName} qua ${mostRepeated.total} trận vẫn chưa phân định ai vượt trội (${mostRepeated.wins}-${mostRepeated.losses}).`,
    ];
  },
  long_game_rivalry: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Không ít lần giằng co nghẹt thở: các trận đối đầu trực tiếp giữa ${edge.playerName} và ${edge.otherName} ghi nhận ${edge.deuceGames} lần phải phân định qua mốc 11 điểm.`,
      `Thành tích đụng độ trực tiếp ghi nhận ${edge.deuceGames} trận đấu giữa ${edge.playerName} và ${edge.otherName} phải kéo dài quá điểm số 11 mới phân thắng bại.`,
      `Đôi bên chạm trán nhau nhiều lần ở hai đầu chiến tuyến, trong đó có ${edge.deuceGames} trận kết thúc sít sao quá mốc 11 điểm.`,
      `Các kèo đối đầu giữa ${edge.playerName} và ${edge.otherName} ghi nhận ${edge.deuceGames} trận phải đấu tiếp sau điểm số 11 để phân định thắng thua.`,
      `Kịch tính đối đầu trực tiếp: cuộc đụng độ giữa ${edge.playerName} và ${edge.otherName} có ${edge.deuceGames} trận kéo dài quá mốc 11 điểm mới tìm ra đội thắng.`,
    ];
  },
  boss_hunter: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Thợ săn trùm: ${metric.name} đã giành tới ${kingWins} chiến thắng khi đối đầu với đội có sự góp mặt của Top 1 ELO ${kingName}.`,
      `Đối thủ khó chịu của nhà vua: ${metric.name} xuất sắc bỏ túi ${kingWins} trận thắng trước đội của Top 1 ELO ${kingName}.`,
      `Khả năng hạ gục đối thủ mạnh: ${metric.name} có tới ${kingWins} lần đánh bại đội của người đứng đầu bảng xếp hạng ELO ${kingName}.`,
      `Không e ngại vị trí số 1: ${metric.name} gặt hái ${kingWins} chiến thắng trong các trận chạm trán đội của Top 1 ELO ${kingName}.`,
      `Hiệu suất đối đầu ấn tượng: ${metric.name} gieo sầu cho đội của Top 1 ELO ${kingName} with ${kingWins} lần giành phần thắng.`,
    ];
  },
  mental_block: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `${edge.playerName} gặp ${edge.otherName} đang khá khớp kèo: chỉ thắng ${edge.wins}/${edge.total} trận và kết quả thực tế thấp hơn hẳn mức trước trận.`,
      `Cứ đụng ${edge.otherName}, ${edge.playerName} thường không còn là chính mình, thắng ${edge.wins}/${edge.total} trận và tụt rõ so với phong độ thường thấy.`,
      `${edge.otherName} đang là bài test khó chịu của ${edge.playerName}; mẫu đối đầu ${edge.wins}/${edge.total} cho thấy kết quả thấp hơn hẳn cửa trước trận.`,
      `Gặp thử thách tâm lý trước ${edge.otherName}: ${edge.playerName} chỉ thắng ${edge.wins}/${edge.total} trận, hiệu suất thấp hơn nhiều so với bình thường.`,
      `Nhịp thi đấu chưa thanh thoát khi đối đầu ${edge.otherName}: ${edge.playerName} để thua tới ${edge.losses}/${edge.total} trận chạm trán.`,
    ];
  },
  sweet_matchup: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `${edge.playerName} gặp ${edge.otherName} lại đánh cực kỳ sáng nước, thắng ${edge.wins}/${edge.total} trận và kết quả thực tế cao hơn hẳn mức trước trận.`,
      `Đối đầu ${edge.otherName} đang là kèo khá thơm của ${edge.playerName}: thắng ${edge.wins}/${edge.total} trận, hiệu quả vượt rõ cửa trước trận.`,
      `Cứ chạm ${edge.otherName}, ${edge.playerName} thường bật mode thăng hoa, mẫu đối đầu ${edge.wins}/${edge.total} đang tốt hơn hẳn mức thường thấy.`,
      `Thi đấu cực kỳ bùng nổ khi gặp ${edge.otherName}: ${edge.playerName} giành tới ${edge.wins}/${edge.total} thắng lợi, vượt xa phong độ thường ngày.`,
      `Khắc chế hiệu quả lối chơi của ${edge.otherName}: ${edge.playerName} giành phần thắng trong ${edge.wins}/${edge.total} lần chạm trán.`,
    ];
  },
  bully_lower_elo: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Tận dụng tốt lợi thế trước đối thủ được đánh giá thấp hơn: ${metric.name} thắng tới ${metric.winsVsLowerElo}/${metric.totalVsLowerElo} trận.`,
      `Thi đấu cực kỳ đúng sức: ${metric.name} giành thắng lợi ${metric.winsVsLowerElo}/${metric.totalVsLowerElo} trận khi chạm trán các tay vợt ở nhóm dưới.`,
      `Chắt chiu điểm số tốt khi ở thế cửa trên: ${metric.name} thắng ${metric.winsVsLowerElo}/${metric.totalVsLowerElo} trận trước các đối thủ có thứ hạng thấp hơn.`,
      `Đảm bảo hiệu suất khi được đánh giá cao hơn: ${metric.name} giành ${metric.winsVsLowerElo}/${metric.totalVsLowerElo} chiến thắng trước các đối thủ dưới cơ.`,
      `Phong độ vững vàng khi gặp đối thủ có xếp hạng thấp hơn: ${metric.name} giành phần thắng trong ${metric.winsVsLowerElo}/${metric.totalVsLowerElo} lần đối đầu.`,
    ];
  },
  victim_strong_elo: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `${metric.name} gặp nhiều khó khăn trước các đối thủ mạnh hơn, để thua ${metric.lossesVsHigherElo}/${metric.totalVsHigherElo} trận đối đầu.`,
      `Thử thách lớn trước các đối thủ nhóm trên: ${metric.name} nhận tới ${metric.lossesVsHigherElo}/${metric.totalVsHigherElo} thất bại khi gặp người có thứ hạng cao hơn.`,
      `Chưa tìm được lời giải khi gặp đối thủ được đánh giá cao hơn: ${metric.name} để thua ${metric.lossesVsHigherElo}/${metric.totalVsHigherElo} trận.`,
      `Hiệu suất chưa tốt khi ở thế cửa dưới: ${metric.name} để thua ${metric.lossesVsHigherElo}/${metric.totalVsHigherElo} trận trước các đối thủ trên cơ.`,
      `Gặp nhiều trở ngại trước các đối thủ mạnh: ${metric.name} nhận thất bại ở ${metric.lossesVsHigherElo}/${metric.totalVsHigherElo} lần đối mặt với các tay vợt xếp hạng cao hơn.`,
    ];
  },
  revenge_target: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Xu hướng đối đầu đang xoay chiều: Gần đây ${player.name} đã thắng ${revenge.recentWins}/${revenge.recentTotal} trận khi đụng độ khắc tinh ${opponent.name}.`,
      `Lật lại thế cờ: Sau chuỗi ngày lép vế liên tục, ${player.name} đang lấy lại thế chủ động với ${revenge.recentWins}/${revenge.recentTotal} trận thắng gần nhất trước ${opponent.name}.`,
      `Cân bằng cán cân đối đầu: ${player.name} giành thắng lợi ${revenge.recentWins}/${revenge.recentTotal} trận gần đây trước đối thủ từng gieo sầu cho mình là ${opponent.name}.`,
      `Tìm lại thế trận trước đối thủ kỵ rơ: ${player.name} xuất sắc giành ${revenge.recentWins}/${revenge.recentTotal} chiến thắng trước ${opponent.name} trong các cuộc đối đầu gần nhất.`,
      `Bứt phá phong độ đối đầu: ${player.name} dần vượt lên trước đối thủ khó chịu ${opponent.name} với thành tích thắng ${revenge.recentWins}/${revenge.recentTotal} trận gần đây.`,
    ];
  },
  iron_lung: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Chiến thần cày ải: ${metric.name} đang dẫn đầu toàn sân về tần suất thi đấu với tổng cộng ${metric.total} lần ra sân.`,
      `Gương mặt bền bỉ nhất giải: ${metric.name} vô địch về số trận cày ải khi đã thi đấu tới ${metric.total} trận mùa này.`,
      `Chiếm trọn danh hiệu chuyên cần: ${metric.name} dẫn đầu danh sách cống hiến với thành tích chơi ${metric.total} trận.`,
      `Sức bền đáng nể: ${metric.name} là người ra sân nhiều nhất câu lạc bộ với tổng số ${metric.total} trận đấu đã qua.`,
      `Chiến binh không phổi: ${metric.name} ngự trị ở vị trí số 1 về độ chịu cày khi cán mốc ${metric.total} lần xuất trận.`,
    ];
  },
  missing_player: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Quy ẩn giang hồ: ${metric.name} đã ${metric.daysAbsent} ngày rồi chưa thấy vác vợt ra sân.`,
      `Anh em đang ngóng chờ: ${metric.name} đã vắng bóng ${metric.daysAbsent} ngày liên tiếp trên sân đấu.`,
      `Tạm thời gác kiếm: ${metric.name} đã chưa đấu trận nào trong ${metric.daysAbsent} ngày qua, không biết dạo này thế nào.`,
      `Mất tích bí ẩn: Đã qua ${metric.daysAbsent} ngày mà chưa thấy bóng dáng ${metric.name} xuất hiện.`,
      `Chưa thấy tái xuất: ${metric.name} đã tạm nghỉ thi đấu liên tục ${metric.daysAbsent} ngày, hy vọng sớm được giao lưu.`,
    ];
  },
  mercenary: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Khách mời chất lượng: ${metric.name} mới chơi ${metric.total} trận nhưng đã bỏ túi ${metric.wins} chiến thắng (đạt tỷ lệ ${round(metric.winRate)}%).`,
      `Làn gió mới cực bén: Dù mới thi đấu vỏn vẹn ${metric.total} trận, ${metric.name} đã thắng tới ${metric.wins} trận, chứng tỏ thực lực đáng gờm.`,
      `Chào sân đầy ấn tượng: ${metric.name} đạt tỷ lệ thắng ${round(metric.winRate)}% (thắng ${metric.wins}/${metric.total} trận) dù số trận còn khiêm tốn.`,
      `Nhân tố mới đầy uy tín: Mới chơi ${metric.total} trận nhưng ${metric.name} đã có tới ${metric.wins} lần giành chiến thắng.`,
      `Hiệu suất chào sân ấn tượng: ${metric.name} bỏ túi ${metric.wins}/${metric.total} trận thắng, một khởi đầu cực kỳ hứa hẹn.`,
    ];
  },
  alternating_form: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Phong độ hình sin: Kết quả gần đây của ${metric.name} liên tục đảo chiều ${pattern(metric.recentResults)}, thắng thua xen kẽ khó lường.`,
      `Nhịp thi đấu phập phù: ${metric.name} có tới ${metric.alternations} lần thay đổi trạng thái thắng - thua liên tục qua chuỗi kết quả ${pattern(metric.recentResults)}.`,
      `Trận nổ trận xịt: Chuỗi trận gần đây của ${metric.name} ghi nhận phong độ trồi sụt liên tục ${pattern(metric.recentResults)}.`,
      `Đúng chất máy test vợt: ${metric.name} liên tục xoay tua thắng và thua ${pattern(metric.recentResults)} trong các trận đấu gần đây.`,
      `Kết quả thiếu ổn định: ${metric.name} có chuỗi trận trồi sụt liên tục với kết quả ${pattern(metric.recentResults)}.`,
    ];
  },
  fine_sponsor: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Nhà tài trợ vàng của CLB: Với ${topFine.losses} trận thua, ${topFine.name} đã đóng góp tới ${topFine.money.toLocaleString('vi-VN')}đ vào quỹ sân.`,
      `Bằng khen chuyên cần đóng quỹ: ${topFine.name} tạm dẫn đầu danh sách nộp phạt với số tiền ${topFine.money.toLocaleString('vi-VN')}đ sau ${topFine.losses} trận bại.`,
      `Trụ cột tài chính của hội: ${topFine.name} đã đóng tới ${topFine.money.toLocaleString('vi-VN')}đ, dẫn đầu danh sách đóng phạt quỹ sân mùa này.`,
      `Nhà tài trợ kim cương: ${topFine.name} cống hiến tới ${topFine.money.toLocaleString('vi-VN')}đ cho quỹ câu lạc bộ qua ${topFine.losses} trận chưa thành công.`,
      `Gương mặt vàng trong làng đóng quỹ: ${topFine.name} nhận ${topFine.losses} trận thua và đóng góp ${topFine.money.toLocaleString('vi-VN')}đ tiền phạt.`,
    ];
  },
  experience_seeker: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Đại sứ thân thiện: ${metric.name} góp mặt nhiệt tình trong ${metric.total} trận nhưng mới chỉ lấy đi ${metric.wins} chiến thắng, tình cảm anh em trên sân mới là chính!`,
      `Nhà tài trợ điểm số uy tín: ${metric.name} đã ra sân ${metric.total} trận, cống hiến rất nhiều niềm vui (and cả trận thắng) cho các đối thủ.`,
      `Khách hàng VIP của ELO: Cày ải tới ${metric.total} trận mà mới thắng ${metric.wins} trận, ${metric.name} đang làm giàu điểm số cho cả sân đấu.`,
      `Người gieo mầm hạnh phúc: ${metric.name} thi đấu ${metric.total} trận với tinh thần cống hiến cao cả, nhường phần lớn chiến thắng cho bạn chơi.`,
      `Vui là chính, thắng thua là phụ: ${metric.name} ra sân ${metric.total} trận chủ yếu để tạo tiếng cười và nâng đỡ điểm số cho đồng đội.`,
    ];
  },
  casual_visitor: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Khách mời danh dự: ${metric.name} dạo này mới đánh ${metric.total} trận, thưa thớt hơn hẳn mặt bằng chung.`,
      `Nhân tố bí ẩn: ${metric.name} xuất hiện khá hạn chế với vỏn vẹn ${metric.total} trận đấu từ đầu mùa.`,
      `Đứng ngoài vòng xoáy cày ải: ${metric.name} mới góp mặt trong ${metric.total} trận đấu, đúng chất thi đấu thong thả.`,
      `Cơn gió thoảng qua: ${metric.name} ra sân khá thưa thớt khi mới chỉ tích lũy ${metric.total} trận đấu.`,
      `Phong cách khách mời đặc biệt: ${metric.name} dạo này ra sân rất chọn lọc với chỉ ${metric.total} trận.`,
    ];
  },
  rank_camper: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Nấp lùm bảo toàn thứ hạng: ${metric.name} mới thi đấu ${metric.total} trận (ít hơn trung bình sân ${round(avgMatches)} trận) nhưng vẫn vững vàng ở Top ${leaderboardRank} BXH.`,
      `Chiến thuật giữ ghế: Đấu ${metric.total} trận khiêm tốn nhưng ${metric.name} vẫn bảo toàn thành công vị trí Top ${leaderboardRank} trên bảng xếp hạng.`,
      `Đánh ít giữ hạng: ${metric.name} mới đánh ${metric.total} trận (mặt bằng chung ${round(avgMatches)} trận) nhưng vẫn chễm chệ vị trí Top ${leaderboardRank}.`,
      `Giữ rank an toàn: Tránh bão bằng cách ra sân ${metric.total} trận, ${metric.name} vẫn giữ vững vị thế Top ${leaderboardRank} trên bảng tổng sắp.`,
      `Thành tích giữ ghế: ${metric.name} cày ải vỏn vẹn ${metric.total} trận (mặt bằng chung là ${round(avgMatches)} trận) để bảo vệ vững chắc vị trí thứ ${leaderboardRank} của mình.`,
    ];
  },
  elo_inflated: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Điểm số kỹ thuật cao nhưng thành tích thực tế chưa tương xứng: ELO của ${metric.name} nằm trong Top ${eloRank} nhưng thứ hạng win rate lại ở vị trí ${leaderboardRank}.`,
      `Có sự chênh lệch nhẹ giữa lý thuyết và thực hành: ${metric.name} sở hữu ELO Top ${eloRank} toàn sân nhưng thứ hạng thực tế trên bảng tổng sắp chỉ là ${leaderboardRank}.`,
      `Lạm phát thông số nhẹ: Điểm ELO ngự trị ở vị trí số ${eloRank} nhưng tỷ lệ thắng thực tế lại đẩy ${metric.name} xuống vị thế thứ ${leaderboardRank}.`,
      `ELO thì cao ngất ngưởng trong Top ${eloRank}, nhưng BXH thực tế của ${metric.name} lại đang dừng chân ở hạng ${leaderboardRank}.`,
      `Thông số ELO đang có dấu hiệu đi trước kết quả: ELO của ${metric.name} xếp hạng ${eloRank} nhưng thứ hạng thực tế trên BXH win rate lại là hạng ${leaderboardRank}.`,
    ];
  },
  elo_defied: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Vượt khó thực chiến: Điểm ELO xếp hạng ${eloRank} nhưng ${metric.name} vẫn xuất sắc chiếm giữ vị thế Top ${leaderboardRank} BXH.`,
      `Đập tan mọi thông số lý thuyết: ${metric.name} chễm chệ ở Top ${leaderboardRank} BXH bất kể điểm ELO xuất phát điểm chỉ là ${eloRank}.`,
      `Anh hùng hệ thực chiến: Không cần điểm số ELO hào nhoáng (hạng ${eloRank}), ${metric.name} vẫn chứng minh thực lực với vị trí Top ${leaderboardRank} BXH.`,
      `Điểm số chỉ là con số: ${metric.name} vững vàng ở vị trí Top ${leaderboardRank} dù thứ hạng ELO chỉ đứng thứ ${eloRank} toàn sân.`,
      `Thực tế thuyết phục hơn lý thuyết: ${metric.name} giành vị trí Top ${leaderboardRank} BXH bất chấp điểm số ELO đang tạm đứng hạng ${eloRank}.`,
    ];
  },
  top1_gap: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Độc bá ngôi đầu: Bỏ xa người bám đuổi ${gapText}, ${topRank.name} đang thống trị vững chắc trên đỉnh bảng xếp hạng.`,
      `Khoảng cách mênh mông: ${topRank.name} độc chiếm vị trí Top 1 BXH và tạo ra cách biệt ${gapText} so với nhóm bám đuổi.`,
      `Đỉnh cao cô đơn: Không đối thủ nào bắt kịp ${topRank.name} lúc này khi khoảng cách với vị trí thứ 2 đã lên tới ${gapText}.`,
      `Thế độc tôn tuyệt đối: ${topRank.name} ngự trị vững chắc ở ngôi vương BXH, bỏ xa người xếp sau tới ${gapText}.`,
      `Cuộc đua song mã đã vỡ: ${topRank.name} dẫn đầu cuộc đua với cách biệt ${gapText}, khẳng định sức mạnh tuyệt đối trên đỉnh bảng.`,
    ];
  },
  late_bloomer: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Khởi nghĩa muộn màng: Dù tỷ lệ thắng cả mùa dưới trung bình, ${metric.name} đang bứt phá khét lẹt với ${recentWins}/5 trận thắng gần nhất.`,
      `Giai đoạn nước rút thăng hoa: ${metric.name} đang hồi sinh mạnh mẽ khi giành tới ${recentWins} chiến thắng trong 5 trận đấu vừa qua.`,
      `Độ trễ phong độ: Nửa đầu mùa giải chơi chưa tốt, nhưng dạo gần đây ${metric.name} đang bắt nhịp cực ngọt với thành tích ${recentWins}/5 trận thắng.`,
      `Thức tỉnh đúng lúc: ${metric.name} đang làm nóng chặng cuối với chuỗi phong độ ấn tượng ${recentWins} lần gieo sầu cho đối thủ trong 5 trận gần nhất.`,
      `Ngọn cờ khởi nghĩa phất muộn: Thắng liên tiếp ${recentWins} trên 5 trận gần đây, ${metric.name} đang chứng tỏ đà thăng tiến đầy hứa hẹn chặng cuối.`,
    ];
  },
  late_choker: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Ghế nóng lung lay: Đang chễm chệ Top ${leaderboardRank} BXH nhưng ${metric.name} lại bất ngờ để thua tới ${recentLosses} trận trong 5 lần ra sân gần nhất.`,
      `Dấu hiệu hụt hơi chặng cuối: Vị trí Top ${leaderboardRank} của ${metric.name} đang báo động đỏ sau chuỗi 5 trận gãy kèo tới ${recentLosses} lần.`,
      `Top đầu có vẻ hết xăng: ${metric.name} đang trải qua chuỗi ngày u ám khi để rơi ${recentLosses}/5 chiến thắng gần nhất dù đang đứng hạng ${leaderboardRank}.`,
      `Cảnh báo tụt hạng: Sơ sẩy chặng cuối khiến ${metric.name} (Top ${leaderboardRank} BXH) phải nhận tới ${recentLosses} trận thua trong 5 trận đấu gần đây.`,
      `Phong độ chạm đáy lúc nhạy cảm: Thành tích thua ${recentLosses}/5 trận vừa qua đang là hồi chuông cảnh báo cho vị trí Top ${leaderboardRank} của ${metric.name}.`,
    ];
  },
  drama_magnet: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Máy tạo kịch tính: Ghi nhận tới ${tightMatches}/${metric.total} trận đấu của ${metric.name} phải phân định bằng tỷ số sát nút hoặc kéo nhau qua mốc 11 điểm.`,
      `Nhịp tim khán giả thử thách: Hễ ${metric.name} xuất trận là khán giả phải chuẩn bị sẵn tinh thần khi ${tightMatches}/${metric.total} trận đấu diễn ra siêu nghẹt thở.`,
      `Nhà máy drama sân bãi: ${metric.name} sở hữu ${tightMatches}/${metric.total} trận đấu giằng co đến những loạt bóng cuối cùng mới tìm ra người thắng.`,
      `Đam mê kịch bản giật gân: ${metric.name} góp mặt trong ${tightMatches} trận đấu giằng co sít sao trên tổng số ${metric.total} lần ra sân mùa này.`,
      `Chuyên trị các kèo đấu nghẹt thở: Trận đấu của ${metric.name} hiếm khi diễn ra tẻ nhạt khi ${tightMatches}/${metric.total} trận kết thúc với cách biệt cực kỳ mong manh.`,
    ];
  },
  glass_cannon: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Phong cách tấn công rực lửa nhưng thủ hơi mỏng: Đang ở Top ${leaderboardRank} nhưng hễ sẩy chân là ${metric.name} nhận các trận thua cách biệt trung bình tới ${oneDecimal(metric.avgLossDiff)} điểm.`,
      `Thắng oanh liệt nhưng bại cũng đậm đà: ${metric.name} (Top ${leaderboardRank} BXH) gánh nhận cách biệt thua trung bình ${oneDecimal(metric.avgLossDiff)} điểm mỗi khi rơi kèo.`,
      `Hổ giấy công mạnh giáp yếu: Vị thế Top ${leaderboardRank} đầy uy tín nhưng ${metric.name} thường để đối thủ vượt lên với cách biệt trung bình ${oneDecimal(metric.avgLossDiff)} điểm trong các trận bại.`,
      `Điểm yếu phòng ngự lộ rõ khi gãy trận: ${metric.name} ngự trị Top ${leaderboardRank} nhưng mỗi trận thua thường có khoảng cách điểm khá sâu là ${oneDecimal(metric.avgLossDiff)} điểm.`,
      `Tấn công cống hiến nhưng giáp thủ mỏng: ${metric.name} tạm giữ vị trí Top ${leaderboardRank} BXH nhưng trung bình mỗi trận thua bị đối thủ gác trước tới ${oneDecimal(metric.avgLossDiff)} điểm.`,
    ];
  },
  stubborn_loser: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Thua trong thế ngẩng cao đầu: Nằm ở nhóm cuối BXH nhưng ${metric.name} cực kỳ lỳ lợm khi các trận thua chỉ chênh lệch trung bình ${oneDecimal(metric.avgLossDiff)} điểm.`,
      `Kẻ ngáng đường khó nhằn: Đối thủ rất vất vả mới thắng được ${metric.name} khi khoảng cách thua trung bình chỉ vỏn vẹn ${oneDecimal(metric.avgLossDiff)} điểm.`,
      `Không dễ bị khuất phục: Dù thứ hạng chưa cao, ${metric.name} luôn bám sát nút đối thủ ở các trận bại với cách biệt trung bình ${oneDecimal(metric.avgLossDiff)} điểm.`,
      `Thiếu một chút duyên đóng hòm: ${metric.name} nhận các trận thua với cách biệt tối thiểu trung bình ${oneDecimal(metric.avgLossDiff)} điểm, lối chơi rất ngang ngửa nhóm trên.`,
      `Chi bại dưới tay sát nút: Khoảng cách thua trung bình ${oneDecimal(metric.avgLossDiff)} điểm cho thấy ${metric.name} thi đấu vô cùng ngoan cường bất chấp thứ hạng.`,
    ];
  },
  rank_launchpad: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Tri ân đối tác bên kia chiến tuyến: Chiếm giữ vị trí số ${leaderboardRank} BXH, ${metric.name} chắc hẳn rất biết ơn ${launchpadEdge.otherName} vì đã nhường tới ${launchpadEdge.wins} chiến thắng.`,
      `Bàn đạp thăng hạng uy tín: ${launchpadEdge.wins} trận thắng trước ${launchpadEdge.otherName} đang là bệ phóng quan trọng đưa ${metric.name} chễm chệ vị trí Top ${leaderboardRank}.`,
      `Kho điểm thân quen: Vị thế Top ${leaderboardRank} của ${metric.name} có sự đóng góp nhiệt tình từ ${launchpadEdge.otherName} với thành tích đối đầu ${launchpadEdge.wins} trận thắng.`,
      `Nhà tài trợ thứ hạng vàng: Đang đứng Top ${leaderboardRank} BXH, ${metric.name} ghi nhận tới ${launchpadEdge.wins} trận thắng làm bàn đạp từ các cuộc đụng độ ${launchpadEdge.otherName}.`,
      `Điểm tựa thăng tiến: Cú bứt tốc lên Top ${leaderboardRank} của ${metric.name} có dấu ấn đậm nét của ${launchpadEdge.otherName} với ${launchpadEdge.wins} lần dâng điểm đầy hào phóng.`,
    ];
  },
  hot_seat_threat: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Áp lực bám đuổi nghẹt thở: ${metric.name} đang phả hơi nóng ngay sau ${playerAbove.name} với khoảng cách chỉ ${oneDecimal(diff)} điểm win rate.`,
      `Hơi nóng sau gáy: Chỉ cần sẩy chân nhẹ, ${playerAbove.name} sẽ bị ${metric.name} soán ngôi khi cách biệt win rate hiện tại chỉ vỏn vẹn ${oneDecimal(diff)}%.`,
      `Trận chiến cận kề: Vị trí của ${playerAbove.name} đang bị đe dọa nghiêm trọng bởi ${metric.name} khi khoảng cách giữa hai người thu hẹp còn ${oneDecimal(diff)} điểm win rate.`,
      `Ghế nóng báo động chéo sân: Khoảng cách giữa ${metric.name} và người đứng trên ${playerAbove.name} chỉ còn ${oneDecimal(diff)}%, sơ sẩy một trận là đổi ngôi lập tức.`,
      `Rượt đuổi sát nút: ${metric.name} đang bám đuổi quyết liệt và chỉ còn cách ${playerAbove.name} đúng ${oneDecimal(diff)} điểm win rate trên bảng tổng sắp.`,
    ];
  },
  buffet_eater: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Phong cách cày bù cực khét: Ít ra sân nhưng hễ đến buổi là ${metric.name} bào sức tới bến với trung bình ${oneDecimal(attendance.matchesPerSession)} trận mỗi lần xuất hiện.`,
      `Bào sân hệ buffet: ${metric.name} ra sân thưa thớt nhưng mỗi buổi đều cày trung bình ${oneDecimal(attendance.matchesPerSession)} trận liên tục để bù ngày nghỉ.`,
      `Đã ra sân là phải bào hết công suất: ${metric.name} giữ phong cách đánh dồn dập, gánh trung bình ${oneDecimal(attendance.matchesPerSession)} trận/buổi để thỏa đam mê.`,
      `Vác vợt đi ăn buffet đúng nghĩa: Số buổi khiêm tốn nhưng ${metric.name} ra sân là chơi trung bình tới ${oneDecimal(attendance.matchesPerSession)} trận để bù lỗ.`,
      `Chất lượng hơn số lượng: Ít khi lên sân nhưng mỗi lần xuất hiện ${metric.name} đều bào tới ${oneDecimal(attendance.matchesPerSession)} trận đấu mới chịu đi về.`,
    ];
  },
  moody_player: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Tần suất ra sân tùy hứng: Mặc dù đã chơi ${attendance.uniqueDays} ngày, ${metric.name} có nhịp thi đấu lúc dập dồn lúc thưa thớt, có đợt nghỉ tới ${attendance.maxGap} ngày.`,
      `Lịch thi đấu hệ tâm linh: Anh em rất khó đoán khi nào ${metric.name} xuất hiện khi khoảng nghỉ giữa các buổi chơi trồi sụt thất thường, kéo dài tới ${attendance.maxGap} ngày.`,
      `Nhịp ra sân khó bắt bài: Đã tham gia ${attendance.uniqueDays} buổi chơi nhưng khoảng nghỉ của ${metric.name} lúc dày đặc lúc giãn cách, có đợt vắng bóng ${attendance.maxGap} ngày.`,
      `Phong cách ẩn hiện thất thường: ${metric.name} cày ải ${attendance.uniqueDays} ngày nhưng lịch trình cực kỳ khó đoán, có đoạn cách biệt tới ${attendance.maxGap} ngày mới tái xuất.`,
      `Nhịp độ ra sân trồi sụt: Thi đấu ${attendance.uniqueDays} ngày nhưng ${metric.name} giữ nhịp chơi lúc dồn dập lúc ngắt quãng, đỉnh điểm cách nhau tới ${attendance.maxGap} ngày.`,
    ];
  },
  king_rescue: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Cắt chuỗi đen nhờ tay to: Mạch thua ${row.priorStreak} trận của ${player.name} cuối cùng đã dừng lại khi ráp cặp thành công cùng Phao cứu sinh Top ELO ${partner.name}.`,
      `Phao cứu sinh xuất hiện đúng lúc: ${player.name} cắt chuỗi thua ${row.priorStreak} trận nhờ được kẹp chung với tay vợt Top ELO ${partner.name} gánh kèo cực mạnh.`,
      `Ca hồi sinh từ cõi chết: Chuỗi ${row.priorStreak} thất bại liên tiếp của ${player.name} được giải hạn ngay khi đứng chung chiến tuyến với ${partner.name}.`,
      `Ráp cặp giải hạn thành công: ${player.name} chấm dứt mạch ${row.priorStreak} trận toàn thua nhờ sự bổ trợ đắc lực từ đồng đội thuộc Top đầu ELO ${partner.name}.`,
      `Hạ nhiệt chuỗi đen: ${player.name} thoát khỏi cơn khủng hoảng ${row.priorStreak} trận gãy kèo liên tục khi bắt cặp cùng điểm tựa uy tín ${partner.name}.`,
    ];
  },
  anchor_drag: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Cắt chuỗi thắng đầy tiếc nuối: Mạch bất bại ${row.priorStreak} trận liên tục của ${player.name} vừa chính thức tan biến khi bắt cặp cùng ${partner.name}.`,
      `Mỏ neo kéo lùi mạch thắng: ${player.name} đành khép lại chuỗi thắng ${row.priorStreak} trận sau khi ráp cặp bất thành cùng ${partner.name}.`,
      `Gãy chuỗi thắng vì kèo nặng tạ: Sự kết hợp với ${partner.name} khiến đà thăng hoa ${row.priorStreak} trận thắng của ${player.name} phải dừng bước.`,
      `Đứt xích lúc đang thăng hoa: Chuỗi ${row.priorStreak} trận toàn thắng của ${player.name} bị chặt đứt bởi một trận thua sát sườn khi ghép cặp cùng ${partner.name}.`,
      `Mất chuỗi bất bại: ${player.name} gãy mạch ${row.priorStreak} trận thắng liên tiếp sau cuộc bắt cặp chưa như ý với ${partner.name}.`,
    ];
  },
  parasite_win: (ctx) => {
    const {
      edge, winShareFromPartner, winRateWithoutPartner, otherRank,
      winsWithoutPartner, totalWithoutPartner,
      round = (v: number) => Math.round(v)
    } = ctx;
    return [
      `Sức mạnh của việc bám càng: Ghi nhận tới ${round(winShareFromPartner * 100)}% số trận thắng của ${edge.playerName} là nhờ bắt cặp cùng Top ${otherRank} ${edge.otherName} (thắng ${edge.wins}/${edge.total} trận), tách lẻ ra là tỷ lệ thắng tụt xuống ${winRateWithoutPartner}% (thắng ${winsWithoutPartner}/${totalWithoutPartner} trận).`,
      `Bạn cùng tiến hệ phụ thuộc: ${edge.playerName} có ${round(winShareFromPartner * 100)}% số lần cười chiến thắng là khi đứng cạnh ${edge.otherName} (thắng ${edge.wins}/${edge.total} trận), vắng bóng tay to này là tỷ lệ thắng chỉ còn ${winRateWithoutPartner}% (${winsWithoutPartner}/${totalWithoutPartner} trận).`,
      `Hội chứng khuyết tay to: Tách khỏi Top ${otherRank} ${edge.otherName} là tỷ lệ thắng của ${edge.playerName} rớt về ${winRateWithoutPartner}% (${winsWithoutPartner}/${totalWithoutPartner} trận), dù ${round(winShareFromPartner * 100)}% số trận thắng cả mùa là đứng chung sân (${edge.wins}/${edge.total} trận).`,
      `Sự phụ thuộc thông số rõ rệt: ${edge.playerName} bỏ túi ${round(winShareFromPartner * 100)}% số trận thắng khi ráp sân với ${edge.otherName} (thắng ${edge.wins}/${edge.total} trận), không có điểm tựa này thì hiệu suất chỉ đạt ${winRateWithoutPartner}% (${winsWithoutPartner}/${totalWithoutPartner} trận).`,
      `Kèo thơm đi kèm bảo chứng: ${edge.playerName} thắng tới ${round(winShareFromPartner * 100)}% số trận (${edge.wins}/${edge.total} trận) khi kết hợp với Top ${otherRank} ${edge.otherName}, thiếu vắng đối tác này thì tỷ lệ thắng chỉ ở mức ${winRateWithoutPartner}% (${winsWithoutPartner}/${totalWithoutPartner} trận).`,
    ];
  },
  gatekeeper_boss: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Đang giữ hạng ${leaderboardRank} nhưng ${metric.name} lại là hung thần ngáng đường của Top ${targetRank} ${edge.otherName} với thành tích đối đầu cực tốt: thắng ${edge.wins}/${edge.total} trận.`,
      `Kẻ gác cổng khó chịu: Dù đứng hạng ${leaderboardRank}, ${metric.name} vẫn liên tục làm khó Top ${targetRank} ${edge.otherName} khi bỏ túi tới ${edge.wins}/${edge.total} trận thắng đối đầu.`,
      `Cửa ải gian nan của nhóm dẫn đầu: Top ${targetRank} ${edge.otherName} đụng độ ${metric.name} (hạng ${leaderboardRank}) là dễ gãy cánh khi đối thủ đã thắng tới ${edge.wins}/${edge.total} trận.`,
      `${metric.name} (hạng ${leaderboardRank}) đang là khắc tinh đích thực của Top ${targetRank} ${edge.otherName}, gạt giò thành công ${edge.wins}/${edge.total} lần chạm trán.`,
      `Thành tích đối đầu ấn tượng: Dù xếp hạng ${leaderboardRank}, ${metric.name} mới là người làm chủ thế trận trước Top ${targetRank} ${edge.otherName} với ${edge.wins}/${edge.total} chiến thắng.`,
    ];
  },
  unlucky_draw: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Bốc thăm hơi xui: ${metric.name} có ${bottomPartnerMatches.length}/${partnerMatches.length} trận đứng cùng đồng đội thuộc nhóm cuối bảng mùa này, lịch ghép cặp đúng là hơi thử thách.`,
      `Nhân phẩm ghép cặp hơi rén: hơn nửa số trận của ${metric.name} rơi vào kèo đứng cùng đồng đội đang chật vật ở nhóm cuối bảng.`,
      `Đường bốc cặp không mấy bằng phẳng: ${metric.name} thường xuyên phải ráp đội với những đồng đội đang ở nhóm dưới mùa này.`,
      `Lịch ghép đôi hơi khó thở: ${metric.name} có ${bottomPartnerMatches.length}/${partnerMatches.length} trận bắt cặp với đồng đội đang trong giai đoạn khó khăn.`,
      `Vận may chia đội chưa mỉm cười: ${metric.name} nhiều lần rơi vào kèo phối hợp với đồng đội nhóm dưới, cà khịa nhẹ lịch bốc cặp thôi chứ không trách ai.`,
    ];
  },
  friendly_fire: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Đồng đội ăn ý, đối thủ khắc tinh: ${edge.playerName} sát cánh cùng ${edge.otherName} thắng ${partnerEdge.wins}/${partnerEdge.total} trận, nhưng cứ đứng hai đầu chiến tuyến là gieo sầu thắng ${edge.wins}/${edge.total} trận đối đầu.`,
      `Thân ai nấy lo: Cặp đôi ${edge.playerName} - ${edge.otherName} ráp cặp thì thắng tới ${partnerEdge.wins}/${partnerEdge.total} trận chung, nhưng chia đội là ${edge.playerName} lập tức "gạt giò" đối tác ${edge.wins}/${edge.total} lần.`,
      `Tình anh em có nhiều sát thương: Thắng chung tới ${partnerEdge.wins}/${partnerEdge.total} trận, nhưng hễ sang hai bên lưới là ${edge.playerName} át vía ${edge.otherName} với ${edge.wins}/${edge.total} trận thắng đối đầu.`,
      `Đồng cam cộng khổ nhưng thích đối đầu: ${edge.playerName} đứng chung với ${edge.otherName} gặt ${partnerEdge.wins}/${partnerEdge.total} thắng lợi, cơ mà khi chia phe là ${edge.playerName} lấy đi ${edge.wins}/${edge.total} trận thắng từ tay bạn.`,
      `Cặp đôi duyên nợ: Bắt cặp cực mượt với ${partnerEdge.wins}/${partnerEdge.total} trận thắng, nhưng chia đội đối đầu là ${edge.playerName} hạ gục ${edge.otherName} ${edge.wins}/${edge.total} lần không nể tình xưa.`,
    ];
  },
  rank_takeover: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Cú bứt tốc ngoạn mục! Trận thắng vừa qua giúp ${playerB.name} chính thức qua mặt ${playerA.name} để giành lấy vị trí thứ ${newRank} trên BXH.`,
      `Đảo ngôi kịch tính: ${playerB.name} vừa lách qua khe hẹp để vươn lên hạng ${newRank}, đẩy ${playerA.name} lùi lại phía sau.`,
      `Thắng lợi then chốt! ${playerB.name} đã tận dụng cơ hội để soán ngôi ${playerA.name}, chễm chệ ở vị trí số ${newRank}.`,
      `Màn lật đổ ấn tượng: ${playerB.name} vượt qua ${playerA.name} trên bảng xếp hạng để chiếm lấy hạng ${newRank} sau trận đấu vừa rồi.`,
      `Cạnh tranh khốc liệt! ${playerB.name} chính thức hất cẳng ${playerA.name} để vươn lên chiếm giữ Top ${newRank}.`,
    ];
  },
  top1_time: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Đã ${daysAtTop1} ngày trôi qua mà ${metric.name} vẫn ngồi lỳ trên đỉnh BXH. Anh em sân bãi dạo này hiền quá chăng?`,
      `Thống trị tuyệt đối: ${metric.name} đã ngự trị ở vị trí số 1 suốt ${daysAtTop1} ngày liên tiếp mà chưa có dấu hiệu bị lật đổ.`,
      `Vị trí Top 1 có vẻ hơi lạnh lùng: ${metric.name} đã độc chiếm đỉnh bảng được ${daysAtTop1} ngày rồi, cần lắm một người gạt giò!`,
      `Nhà vua chưa nhường ngôi: ${metric.name} đánh chiếm vị trí số 1 BXH vững vàng trong suốt ${daysAtTop1} ngày qua.`,
      `Triều đại của ${metric.name} vẫn đang tiếp diễn với chuỗi ${daysAtTop1} ngày liên tiếp giữ Top 1, thách thức mọi nỗ lực bám đuổi.`,
    ];
  },
  stuck_in_mud: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Cày bừa miệt mài ${recentMatches} trận gần nhất nhưng vị trí thứ ${Rank} của ${metric.name} vẫn đóng đinh y nguyên. Cảm giác trầy trật giống hệt như đang chạy bộ trên máy!`,
      `Nhiệt tình cày ải ${recentMatches} trận nhưng thứ hạng của ${metric.name} vẫn kẹt cứng ở Top ${Rank}, đúng là tiến thoái lưỡng nan.`,
      `Đánh mệt nghỉ ${recentMatches} trận qua nhưng ${metric.name} vẫn chưa thoát khỏi hạng ${Rank}, vòng luẩn quẩn thắng thua đang níu chân khá chặt.`,
      `Ra sân đều đặn ${recentMatches} trận nhưng vị trí số ${Rank} vẫn bất di bất dịch, ${metric.name} đang cần một chuỗi bứt phá thực sự.`,
      `Tốn khá nhiều mồ hôi qua ${recentMatches} trận nhưng thứ hạng của ${metric.name} vẫn dậm chân tại chỗ ở hạng ${Rank}.`,
    ];
  },
  quantity_over_quality: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Tuy cùng sở hữu ${wins} trận thắng như ${Rank_above.name}, nhưng ${metric.name} đành ngậm ngùi xếp dưới do phải nhận nhiều trận thua hơn.`,
      `Bằng số trận thắng với ${Rank_above.name} nhưng do có số trận thất bại nhiều hơn, ${metric.name} chấp nhận đứng dưới trên BXH.`,
      `Cùng cán mốc ${wins} chiến thắng nhưng ${metric.name} xếp dưới ${Rank_above.name} do nhận số trận thua nhiều hơn. Kèo đấu chắt chiu điểm số sẽ giúp bạn bứt phá.`,
      `Cùng đạt ${wins} trận thắng như ${Rank_above.name} nhưng vì để thua nhiều trận hơn nên ${metric.name} đành ngậm ngùi xếp ở vị trí phía dưới.`,
      `Có cùng số trận thắng với ${Rank_above.name} nhưng do nhận nhiều trận thua hơn, ${metric.name} đành chấp nhận đứng sau đối thủ.`,
    ];
  },
  vulture_win: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Dù ngự trị ở Top đầu, phân tích ra mới thấy có tới ${percent}% số trận thắng của ${metric.name} là từ việc chạm trán tay vợt bét bảng ${bottom1.name}.`,
      `Đứng trong nhóm dẫn đầu nhưng ${metric.name} lại có tới ${percent}% số trận thắng cả mùa là trước đối thủ cuối bảng ${bottom1.name}.`,
      `Hiệu suất khai thác điểm số: ${percent}% số trận thắng của tay vợt Top đầu ${metric.name} là trước đối thủ đang đứng cuối bảng xếp hạng ${bottom1.name}.`,
      `Vị trí Top đầu của ${metric.name} ghi nhận tới ${percent}% số trận thắng là từ các cuộc đối đầu tay vợt bét bảng ${bottom1.name}, cần thêm liều thuốc thử mạnh hơn để chứng tỏ bản lĩnh.`,
      `Có tới ${percent}% số chiến thắng của ${metric.name} là từ các cuộc đụng độ đối thủ cuối bảng ${bottom1.name}. Vị thế dẫn đầu sẽ thuyết phục hơn nếu thắng các kèo đấu đỉnh cao.`,
    ];
  },
  money_blackhole: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Vừa hụt hơi trên BXH vừa đau ví: ${metric.name} đang ở nhóm cuối và tạm dẫn đầu danh sách nộp phạt với ${topFine.money.toLocaleString('vi-VN')}đ.`,
      `Kèo này hơi kép: thứ hạng của ${metric.name} chưa sáng lên, còn quỹ phạt thì đã nhận thêm ${topFine.money.toLocaleString('vi-VN')}đ từ tay vợt này.`,
      `Cú đúp hơi chát: ${metric.name} vừa đứng ở nhóm dưới BXH, vừa góp nhiều nhất vào quỹ phạt với ${topFine.money.toLocaleString('vi-VN')}đ.`,
      `BXH chưa chiều lòng, ví tiền cũng chưa tha: ${metric.name} đã nộp ${topFine.money.toLocaleString('vi-VN')}đ tiền phạt, cao nhất trong nhóm hiện tại.`,
      `Một mặt trận cần gỡ gạc: ${metric.name} đang chật vật ở nhóm dưới BXH và cũng là người nộp phạt nhiều nhất với ${topFine.money.toLocaleString('vi-VN')}đ.`,
    ];
  },
  spring_jump: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Cú nảy lò xo ngoạn mục: Buổi trước còn ở nhóm cuối bảng, hôm nay ${metric.name} đã bứt tốc leo thẳng lên Top ${Rank} BXH.`,
      `Màn thăng tiến không tưởng: Từ nhóm cuối bảng ở buổi đấu trước, ${metric.name} đã phóng một mạch lên vị trí thứ ${Rank} trên bảng xếp hạng.`,
      `Phong độ đảo chiều chóng mặt: ${metric.name} nhảy vọt từ nhóm cuối lên chễm chệ Top ${Rank} BXH chỉ sau một buổi thi đấu thăng hoa.`,
      `Bứt phá ngoạn mục chéo sân: ${metric.name} chứng tỏ sức bật mạnh mẽ khi leo từ nhóm cuối lên chiếm lĩnh vị trí thứ ${Rank} BXH.`,
      `Cú lội ngược dòng thứ hạng ấn tượng: ${metric.name} thoát khỏi nhóm bét bảng ở phiên trước để vươn lên ghi tên mình vào Top ${Rank} dẫn đầu.`,
    ];
  },
  last_laugh: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Thua đâu không biết, cứ thắng trận cuối ra về là tươi: Ngày ${sessionDate}, ${metric.name} gãy liên tiếp ${sessionTotal - 1} trận đầu nhưng kết thúc buổi chơi ngọt ngào với chiến thắng ở game đấu chốt hạ.`,
      `Người cười sau cùng mới là người chiến thắng: Cả buổi chơi ngày ${sessionDate} thua tới ${sessionTotal - 1} trận, nhưng ${metric.name} vẫn ra về trong thế ngẩng cao đầu nhờ thắng trận cuối.`,
      `Giải hạn đúng thời điểm quyết định: Trong buổi chơi ngày ${sessionDate}, sau ${sessionTotal - 1} thất bại liên tiếp, ${metric.name} đã có chiến thắng chốt hạ đầy cảm xúc để khép lại ngày đấu.`,
      `Cú chốt hạ ngọt ngào: ${metric.name} trải qua ngày thi đấu ${sessionDate} đầy thử thách với ${sessionTotal - 1} trận thua, nhưng kịp thời tỏa sáng ở game cuối cùng.`,
      `Thua cả buổi không bằng thắng trận cuối: ${metric.name} gỡ gạc lại cả buổi chơi ngày ${sessionDate} bằng một thắng lợi vô cùng quan trọng ở trận đấu cuối cùng.`,
    ];
  },
  triangle_paradox: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Vòng lặp oẳn tù tì kịch tính: ${A.name} át vía ${B.name}, ${B.name} bắt bài ${C.name}, nhưng ${C.name} lại luôn gieo sầu cho ${A.name} khi đối đầu.`,
      `Tam giác khắc chế đầy nghịch lý: ${A.name} làm khó ${B.name}, ${B.name} lấn lướt ${C.name}, nhưng ${C.name} lại là cơn ác mộng của ${A.name} ở hai đầu chiến tuyến.`,
      `Định luật bắc cầu hoàn toàn thất bại: ${A.name} khắc chế ${B.name}, ${B.name} đè bẹp ${C.name}, nhưng ${C.name} lại luôn tìm được cách đánh bại ${A.name}.`,
      `Oan oan tương báo vòng tròn: Kèo đối đầu kịch tính khi ${A.name} thắng ${B.name}, ${B.name} hạ ${C.name}, nhưng ${C.name} lại vượt qua ${A.name}.`,
      `Tam giác nhân duyên nợ nần: ${A.name} là khắc tinh của ${B.name}, ${B.name} át vía ${C.name}, nhưng ${C.name} lại "đòi nợ" sòng phẳng mỗi khi gặp ${A.name}.`,
    ];
  },
  chameleon_partner: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Ráp cặp với ai cũng hiệu quả: Tuần qua ${metric.name} đứng chung với ${count} đồng đội khác nhau và duy trì tỷ lệ thắng tối thiểu 55% với tất cả.`,
      `Trạm sạc đa năng của sân đấu: ${metric.name} chứng tỏ khả năng thích ứng tuyệt vời khi chơi cùng ${count} đối tác khác nhau và đều đạt win rate từ 55% trở lên trong tuần qua.`,
      `Chiến thần ngoại giao sân bãi: Ghép cặp cùng ${count} anh em khác nhau trong tuần, ${metric.name} vẫn giữ vững phong độ ổn định với tỷ lệ thắng trên 55% với mỗi người.`,
      `Đồng đội quốc dân: Tuần qua ${metric.name} bắt cặp với ${count} người chơi khác nhau, duy trì hiệu suất thắng cực ngọt trên 55% với từng đối tác.`,
      `Dễ ráp dễ thắng: ${metric.name} gặt hái tỷ lệ thắng từ 55% trở lên khi đứng chung với ${count} anh em khác nhau trong suốt tuần qua.`,
    ];
  },
  quick_finisher: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Phong cách thi đấu chớp nhoáng: Đánh tới ${count} trận trong tuần nhưng ${metric.name} hoàn toàn không có trận nào phải đấu thêm điểm phụ, hoặc là đóng hòm nhanh, hoặc là chấp nhận thua sớm!`,
      `Tác chiến nhanh gọn: Cày ải ${count} trận tuần này nhưng không có bất kỳ game đấu nào phải kéo dài quá mốc 11 điểm. ${metric.name} rõ ràng không thích những kèo đấu cò cưa tốn sức.`,
      `Đánh nhanh rút gọn: Tuần qua ${metric.name} ra sân ${count} trận và kết thúc tất cả cực kỳ chóng vánh khi không có trận nào phải phân định bằng loạt điểm phụ.`,
      `Không thích dây dưa kéo dài: Trải qua ${count} trận đấu trong tuần mà hoàn toàn vắng bóng các loạt đấu thêm giằng co, ${metric.name} luôn định đoạt trận đấu rất nhanh.`,
      `Lối chơi dứt khoát: ${metric.name} thi đấu ${count} trận tuần này với kịch bản kết thúc nhanh gọn, tuyệt đối không cò cưa điểm số quá mốc 11 quen thuộc.`,
    ];
  },
  attendance_king: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Sân bãi có thể đổi nhưng nhân sự thì không: Góp mặt tới ${round(percent)}% số buổi chơi, bằng khen chuyên cần danh giá mùa này chắc chắn thuộc về ${metric.name}.`,
      `Gương mặt thương hiệu của CLB: Với tần suất xuất hiện đạt ${round(percent)}% tổng số buổi, ${metric.name} xứng đáng dẫn đầu danh sách chuyên cần toàn giải.`,
      `Độ phủ sóng tuyệt đối: ${metric.name} vững vàng ở ngôi đầu chuyên cần khi góp mặt trong ${round(percent)}% số buổi ra sân từ đầu mùa.`,
      `Đam mê không lối thoát: ${metric.name} ghi nhận kỷ lục tham gia ${round(percent)}% số buổi thi đấu, chưa vắng mặt một nhịp chơi quan trọng nào.`,
      `Chiến thần chuyên cần: Không ai có thể so bì độ chăm chỉ với ${metric.name} khi bạn có mặt ở ${round(percent)}% số buổi giao lưu của câu lạc bộ.`,
    ];
  },
  charity_top_rank: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: any[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: any) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Chễm chệ ngôi đầu bảng nhưng dạo này ${metric.name} lại rất chăm ban phát điểm số cho nhóm cuối bảng khi sẩy chân ${recentLossesVsBottomGroup} trận gần nhất.`,
      `Nhà tài trợ điểm số của nhóm cuối: Nhà vua của giải đấu ${metric.name} bất ngờ để thua liền ${recentLossesVsBottomGroup} trận trước các đối thủ nhóm dưới gần đây.`,
      `Tình thương chéo sân của nhà vua: Đang thống trị ở vị trí số 1 BXH nhưng ${metric.name} lại nhường liền ${recentLossesVsBottomGroup} trận thắng cho nhóm bét bảng.`,
      `Cú sẩy chân khó tin của nhà vô địch: ${metric.name} (Top 1 BXH) gieo hy vọng cho nhóm bét bảng khi để rơi ${recentLossesVsBottomGroup} chiến thắng gần đây vào tay họ.`,
      `Đại sứ thiện chí trên đỉnh vinh quang: Đang vững vàng ở ngôi đầu nhưng ${metric.name} lại khá hào phóng khi nhường ${recentLossesVsBottomGroup} trận thắng cho các đối thủ ở đáy bảng.`,
    ];
  },
  golden_victim: (ctx) => {
    const {
      metric, topElo, gap, player, target, breaker, X, opponent, revenge, Y,
      topRank, places, recentWins, edge, otherMetric, glued, avgLossDiff,
      tightWinRate, kingWins, kingName, launchpadEdge, diff, playerAbove,
      attendance, row, partner, winShareFromPartner, winRateWithoutPartner,
      otherRank, leaderboardRank, targetRank, bottomPartnerMatches, partnerMatches,
      partnerEdge, playerB, playerA, newRank, daysAtTop1, recentMatches, Rank,
      wins, Rank_above, percent, bottom1, topFine, sessionDate, sessionTotal,
      A, B, C, count, goldenPickled,
      avgMatches, eloRank, gapText, recentLosses, tightMatches, recentLossesVsBottomGroup, mostRepeated, closeLosses,
      pattern = (results: (string | number)[]) => results.slice(0, 8).join('-'),
      edgeRate = (ed: { rate?: number } | null | undefined) => Math.round(ed?.rate || 0),
      round = (v: number) => Math.round(v),
      oneDecimal = (v: number) => v.toFixed(1),
      absRound = (v: number) => Math.abs(Math.round(v))
    } = ctx;
    return [
      `Lịch sử ghi nhận một vết xước nhẹ: ${metric.name} từng bị thua ${goldenPickled} lần 11-0. Anh em ra sân đừng nhắc lại chuyện cũ kẻo chạm nọc!`,
      `Dữ liệu không biết nói dối: ${metric.name} từng nhận ${goldenPickled} thất bại 11-0 trong lịch sử giải đấu.`,
      `Bài học thương đau trên sân đấu: ${metric.name} từng bị thua ${goldenPickled} lần với tỷ số 11-0 trong quá khứ.`,
      `Vết thương lòng chưa phai: Ghi nhận ${metric.name} đã từng ${goldenPickled} lần nhận kết quả thua 11-0, hy vọng dạo này phong độ đã vững vàng hơn.`,
      `Kỷ niệm không muốn nhớ lại: Sân đấu từng chứng kiến ${metric.name} bị thua ${goldenPickled} lần 11-0. Câu chuyện buồn này tốt nhất nên cất sâu vào lịch sử.`,
    ];
  },
};


function buildStreakBreakers(snapshot: AnalysisSnapshot) {
  const rows: Array<{ playerId: string; targetId: string; streak: number; matchId: string; matchTime: number }> = [];
  const current = new Map<string, { type: Result | ''; count: number }>();

  sortOldest(snapshot.rankingMatches).forEach(match => {
    const winners = [match.win_1, match.win_2].filter((id): id is string => Boolean(id));
    const losers = [match.lose_1, match.lose_2].filter((id): id is string => Boolean(id));

    losers.forEach(loserId => {
      const before = current.get(loserId);
      if (before?.type === 'W' && before.count >= 4) {
        winners.forEach(winnerId => rows.push({
          playerId: winnerId,
          targetId: loserId,
          streak: before.count,
          matchId: match.id || '',
          matchTime: matchTime(match)
        }));
      }
    });

    winners.forEach(id => current.set(id, { type: 'W', count: current.get(id)?.type === 'W' ? (current.get(id)?.count || 0) + 1 : 1 }));
    losers.forEach(id => current.set(id, { type: 'L', count: current.get(id)?.type === 'L' ? (current.get(id)?.count || 0) + 1 : 1 }));
  });

  return rows.sort((a, b) => b.streak - a.streak);
}

function getRevengeState(meetings: AnalysisMatch[], playerId: string) {
  for (let i = meetings.length - 1; i >= 0; i--) {
    if (resultForPlayer(meetings[i], playerId) !== 'W') continue;
    let consecutiveLosses = 0;
    for (let j = i - 1; j >= 0; j--) {
      if (resultForPlayer(meetings[j], playerId) === 'L') {
        consecutiveLosses++;
      } else {
        break;
      }
    }
    if (consecutiveLosses >= 3) {
      const subsequent = meetings.slice(i + 1);
      const opponentWins = subsequent.some(m => resultForPlayer(m, playerId) === 'L');
      if (!opponentWins) {
        return {
          revengeMatchIndex: i,
          priorLosses: consecutiveLosses,
          subsequentWinsCount: subsequent.length,
          active: true,
        };
      }
    }
  }
  return null;
}

function buildPartnerStreakEvents(snapshot: AnalysisSnapshot) {
  const rows: Array<{ type: 'king_rescue' | 'anchor_drag'; playerId: string; partnerId: string; priorStreak: number; time: number }> = [];
  const current = new Map<string, { type: Result | ''; count: number }>();
  const topEloIds = new Set(snapshot.board.filter(metric => metric.total > 0).slice(0, 2).map(metric => metric.id));

  sortOldest(snapshot.rankingMatches).forEach(match => {
    const participants = [match.win_1, match.win_2, match.lose_1, match.lose_2].filter((id): id is string => Boolean(id));

    participants.forEach(playerId => {
      const before = current.get(playerId);
      const partnerId = partnerIdForPlayer(match, playerId);
      if (!before || !partnerId) return;

      const partnerMetric = snapshot.metrics.get(partnerId);
      const result = resultForPlayer(match, playerId);
      if (result === 'W' && before.type === 'L' && before.count >= 4 && topEloIds.has(partnerId)) {
        rows.push({ type: 'king_rescue', playerId, partnerId, priorStreak: before.count, time: matchTime(match) });
      }
      if (result === 'L' && before.type === 'W' && before.count >= 4 && partnerMetric && partnerMetric.winRate <= 38) {
        rows.push({ type: 'anchor_drag', playerId, partnerId, priorStreak: before.count, time: matchTime(match) });
      }
    });

    participants.forEach(playerId => {
      const result = resultForPlayer(match, playerId);
      const before = current.get(playerId);
      current.set(playerId, {
        type: result,
        count: before?.type === result ? before.count + 1 : 1,
      });
    });
  });

  return rows.sort((a, b) => b.time - a.time || b.priorStreak - a.priorStreak);
}

function addFormAndEloCandidates(candidates: InsightCandidate[], snapshot: AnalysisSnapshot, random?: () => number) {
  const active = snapshot.playerMetrics.filter(metric => metric.total > 0);
  const eloBoard = snapshot.board.filter(metric => metric.total > 0);
  const topElo = eloBoard[0];
  const secondElo = eloBoard[1];
  const ranks = rankBoard(snapshot);
  const topRank = ranks[0];
  const secondRank = ranks[1];
  const oldRanks = oldEloRanks(active);
  const avgMatches = active.reduce((sum, metric) => sum + metric.total, 0) / Math.max(1, active.length);
  const rankById = new Map(ranks.map((metric, index) => [metric.id, index + 1]));
  const eloRankById = new Map(eloBoard.map((metric, index) => [metric.id, index + 1]));

  if (topElo && topElo.total >= 8) {
    const gap = topElo.rating - (secondElo?.rating ?? 1500);
    const text = getRandomVariant(VARIANTS.elo_king({ topElo, gap }), random);
    addCandidate(candidates, snapshot, {
      type: 'elo_king',
      title: '👑 ÔNG TRÙM ELO',
      group: 'elo',
      participantIds: [topElo.id],
      rarity: gap >= 40 ? 'rare' : 'common',
      frequency: 'always',
      appearanceRate: 0.35,
      baseWeight: gap >= 40 ? 58 : 38,
      evidenceStrength: evidence(topElo.total),
      surpriseScore: Math.max(0, gap / 4),
      text,
    });
  }

  if (topRank && topRank.total >= 8) {
    const text = getRandomVariant(VARIANTS.rank_leader({ topRank }), random);
    addCandidate(candidates, snapshot, {
      type: 'rank_leader',
      title: '🏆 ĐẦU BẢNG XẾP HẠNG',
      group: 'rank',
      participantIds: [topRank.id],
      rarity: 'common',
      frequency: 'always',
      appearanceRate: 0.25,
      baseWeight: 34,
      evidenceStrength: evidence(topRank.total),
      text,
    });
  }

  if (topRank && secondRank && topRank.total >= 8) {
    const winRateGap = topRank.winRate - secondRank.winRate;
    const winsGap = topRank.wins - secondRank.wins;
    if (winRateGap >= 15 || winsGap >= 5) {
      const gapText = winsGap >= 5 ? `${winsGap} trận thắng` : `${round(winRateGap)} điểm win rate`;
      const text = getRandomVariant(VARIANTS.top1_gap({ topRank, gapText }), random);
      addCandidate(candidates, snapshot, {
        type: 'top1_gap',
        title: '🏔️ ĐỈNH CAO CÔ ĐƠN',
        group: 'rank',
        participantIds: [topRank.id],
        rarity: winsGap >= 8 || winRateGap >= 25 ? 'rare' : 'uncommon',
        frequency: 'occasional',
        baseWeight: 48,
        evidenceStrength: evidence(topRank.total),
        surpriseScore: Math.max(winsGap * 2, winRateGap / 2),
        text,
      });
    }
  }

  ranks.forEach((metric, index) => {
    const playerAbove = ranks[index - 1];
    if (!playerAbove || metric.total < 8 || playerAbove.total < 8) return;
    const diff = playerAbove.winRate - metric.winRate;
    if (diff > 0 && diff < 1.5) {
      const text = getRandomVariant(VARIANTS.hot_seat_threat({ metric, playerAbove, diff }), random);
      addCandidate(candidates, snapshot, {
        type: 'hot_seat_threat',
        title: '🔥 GHẾ NÓNG BÁO ĐỘNG',
        group: 'rank',
        participantIds: [metric.id, playerAbove.id],
        rarity: diff < 0.8 ? 'rare' : 'uncommon',
        frequency: 'frequent',
        appearanceRate: 0.45,
        baseWeight: 42,
        evidenceStrength: evidence(Math.min(metric.total, playerAbove.total)),
        surpriseScore: Math.max(0, 8 - (diff * 4)),
        text,
      });
    }
  });

  active.forEach(metric => {
    const leaderboardRank = rankById.get(metric.id) || 0;
    const eloRank = eloRankById.get(metric.id) || 0;
    const recentWins = metric.recentResults.slice(0, 5).filter(result => result === 'W').length;
    const recentTotal = metric.recentResults.slice(0, 5).length;
    const recentLosses = recentTotal - recentWins;

    if (metric.streakType === 'W' && metric.streakCount >= 4) {
      const text = getRandomVariant(VARIANTS.hot_streak({ metric }), random);
      addCandidate(candidates, snapshot, {
        type: 'hot_streak',
        title: '🔥 ĐANG CHÁY MÁY',
        group: 'form',
        participantIds: [metric.id],
        rarity: metric.streakCount >= 6 ? 'epic' : 'rare',
        frequency: 'occasional',
        baseWeight: 72,
        evidenceStrength: evidence(metric.streakCount),
        surpriseScore: metric.streakCount * 3,
        text,
      });
    }

    if (metric.streakType === 'L' && metric.streakCount >= 4) {
      const text = getRandomVariant(VARIANTS.cold_streak({ metric }), random);
      addCandidate(candidates, snapshot, {
        type: 'cold_streak',
        title: '🧯 SẬP HẦM LIÊN TỤC',
        group: 'form',
        participantIds: [metric.id],
        rarity: metric.streakCount >= 6 ? 'epic' : 'rare',
        frequency: 'occasional',
        baseWeight: 70,
        evidenceStrength: evidence(metric.streakCount),
        surpriseScore: metric.streakCount * 3,
        text,
      });
    }

    if (metric.total >= 5 && metric.formScore === 100) {
      const text = getRandomVariant(VARIANTS.perfect_form5({ metric }), random);
      addCandidate(candidates, snapshot, {
        type: 'perfect_form5',
        title: '🚀 5 TRẬN TOÀN XANH',
        group: 'form',
        participantIds: [metric.id],
        rarity: 'epic',
        frequency: 'occasional',
        baseWeight: 76,
        evidenceStrength: 9,
        surpriseScore: 14,
        text,
      });
    }

    if (metric.total >= 5 && metric.formScore === 0) {
      const text = getRandomVariant(VARIANTS.zero_form5({ metric }), random);
      addCandidate(candidates, snapshot, {
        type: 'zero_form5',
        title: '🫠 5 TRẬN TOÀN ĐỎ',
        group: 'form',
        participantIds: [metric.id],
        rarity: 'epic',
        frequency: 'occasional',
        baseWeight: 75,
        evidenceStrength: 9,
        surpriseScore: 14,
        text,
      });
    }

    if (metric.upsetWins > 0) {
      const text = getRandomVariant(VARIANTS.giant_killer({ metric }), random);
      addCandidate(candidates, snapshot, {
        type: 'giant_killer',
        title: '🎯 VUA GẠT GIÒ',
        group: 'elo',
        participantIds: [metric.id],
        rarity: metric.upsetWins >= 2 ? 'epic' : 'rare',
        frequency: 'rare',
        baseWeight: 68,
        evidenceStrength: evidence(metric.upsetWins),
        surpriseScore: metric.upsetWins * 6,
        text,
      });
    }

    if (metric.upsetLosses > 0) {
      const text = getRandomVariant(VARIANTS.earthquake_victim({ metric }), random);
      addCandidate(candidates, snapshot, {
        type: 'earthquake_victim',
        title: '💥 NẠN NHÂN ĐỊA CHẤN',
        group: 'elo',
        participantIds: [metric.id],
        rarity: metric.upsetLosses >= 2 ? 'rare' : 'uncommon',
        frequency: 'rare',
        baseWeight: 56,
        evidenceStrength: evidence(metric.upsetLosses),
        surpriseScore: metric.upsetLosses * 5,
        text,
      });
    }

    if (metric.total >= 20 && Math.abs(metric.rating - 1500) <= 20) {
      const text = getRandomVariant(VARIANTS.gatekeeper({ metric }), random);
      addCandidate(candidates, snapshot, {
        type: 'gatekeeper',
        title: '🧱 NGƯỜI GIỮ CỔNG',
        group: 'elo',
        participantIds: [metric.id],
        rarity: 'uncommon',
        frequency: 'frequent',
        appearanceRate: 0.55,
        baseWeight: 42,
        evidenceStrength: evidence(metric.total),
        text,
      });
    }

    if (metric.recentEloDelta >= 30) {
      const text = getRandomVariant(VARIANTS.most_improved({ metric }), random);
      addCandidate(candidates, snapshot, {
        type: 'most_improved',
        title: '📈 LÊN TAY RÕ RỆT',
        group: 'elo',
        participantIds: [metric.id],
        rarity: 'rare',
        frequency: 'rare',
        baseWeight: 64,
        evidenceStrength: evidence(metric.total),
        surpriseScore: metric.recentEloDelta / 2,
        text,
      });
    }

    if (metric.recentEloDelta <= -30) {
      const text = getRandomVariant(VARIANTS.free_fall({ metric }), random);
      addCandidate(candidates, snapshot, {
        type: 'free_fall',
        title: '📉 RƠI PHONG ĐỘ',
        group: 'elo',
        participantIds: [metric.id],
        rarity: 'rare',
        frequency: 'rare',
        baseWeight: 62,
        evidenceStrength: evidence(metric.total),
        surpriseScore: absRound(metric.recentEloDelta) / 2,
        text,
      });
    }

    if (leaderboardRank > 0 && leaderboardRank <= 3 && metric.total >= 5 && metric.total < avgMatches * 0.7) {
      const text = getRandomVariant(VARIANTS.rank_camper({ metric, leaderboardRank, avgMatches }), random);
      addCandidate(candidates, snapshot, {
        type: 'rank_camper',
        title: '⛺ GIỮ RANK KIỂU NẤP LÙM',
        group: 'rank',
        participantIds: [metric.id],
        rarity: 'uncommon',
        frequency: 'occasional',
        baseWeight: 46,
        evidenceStrength: evidence(metric.total),
        surpriseScore: Math.max(0, avgMatches - metric.total),
        text,
      });
    }

    if (eloRank > 0 && eloRank <= 2 && leaderboardRank >= 4 && metric.total >= 8) {
      const text = getRandomVariant(VARIANTS.elo_inflated({ metric, eloRank, leaderboardRank }), random);
      addCandidate(candidates, snapshot, {
        type: 'elo_inflated',
        title: '🎈 ELO HƠI CĂNG',
        group: 'elo',
        participantIds: [metric.id],
        rarity: 'uncommon',
        frequency: 'occasional',
        baseWeight: 42,
        evidenceStrength: evidence(metric.total),
        surpriseScore: (leaderboardRank - eloRank) * 4,
        text,
      });
    }

    if (eloRank >= 5 && leaderboardRank > 0 && leaderboardRank <= 2 && metric.total >= 8) {
      const text = getRandomVariant(VARIANTS.elo_defied({ metric, eloRank, leaderboardRank }), random);
      addCandidate(candidates, snapshot, {
        type: 'elo_defied',
        title: '🧱 THỰC CHIẾN VƯỢT ELO',
        group: 'elo',
        participantIds: [metric.id],
        rarity: 'uncommon',
        frequency: 'occasional',
        baseWeight: 44,
        evidenceStrength: evidence(metric.total),
        surpriseScore: (eloRank - leaderboardRank) * 4,
        text,
      });
    }

    if (metric.total >= 8 && metric.winRate < 45 && metric.formScore >= 80 && recentTotal >= 5) {
      const text = getRandomVariant(VARIANTS.late_bloomer({ metric, recentWins }), random);
      addCandidate(candidates, snapshot, {
        type: 'late_bloomer',
        title: '🌱 NƯỚC RÚT KHÉT',
        group: 'form',
        participantIds: [metric.id],
        rarity: 'uncommon',
        frequency: 'occasional',
        baseWeight: 50,
        evidenceStrength: evidence(metric.total),
        surpriseScore: recentWins * 4,
        text,
      });
    }

    if (leaderboardRank > 0 && leaderboardRank <= 3 && metric.total >= 8 && metric.formScore <= 20 && recentTotal >= 5) {
      const text = getRandomVariant(VARIANTS.late_choker({ metric, leaderboardRank, recentLosses }), random);
      addCandidate(candidates, snapshot, {
        type: 'late_choker',
        title: '🪫 TOP ĐẦU HẾT XĂNG',
        group: 'form',
        participantIds: [metric.id],
        rarity: 'uncommon',
        frequency: 'occasional',
        baseWeight: 50,
        evidenceStrength: evidence(metric.total),
        surpriseScore: recentLosses * 4,
        text,
      });
    }

    const currentRank = eloRank;
    const oldRank = oldRanks.findIndex(row => row.id === metric.id) + 1;
    const places = oldRank > 0 && currentRank > 0 ? oldRank - currentRank : 0;
    if (places >= 2 && recentWins >= 3) {
      const text = getRandomVariant(VARIANTS.elo_climber({ metric, places, recentWins }), random);
      addCandidate(candidates, snapshot, {
        type: 'elo_climber',
        title: '🧗 LEO BẢNG ELO',
        group: 'rank',
        participantIds: [metric.id],
        rarity: 'rare',
        frequency: 'rare',
        baseWeight: 60,
        evidenceStrength: evidence(metric.total),
        surpriseScore: places * 5,
        text,
      });
    }

    // Playstyle candidates (Need at least 5 matches to establish playstyle)
    if (metric.total >= 5) {
      const attack = Math.round(metric.attackScore);
      const defense = Math.round(metric.defenseScore);

      if (attack >= 65 && defense < 65) {
        const texts = [
          `Với điểm Công vượt trội (${attack}đ) và Thủ trung bình (${defense}đ), ${metric.name} đang định hình rõ lối chơi "Sát Thủ Bắn Lưới" – chủ động ép sân và tấn công dồn dập.`,
          `Lối chơi tấn công áp đảo: ${metric.name} (Công ${attack}đ - Thủ ${defense}đ) liên tục đẩy cao tốc độ bóng, xứng đáng là Sát Thủ Bắn Lưới của giải.`,
          `Thích chủ động áp đặt thế trận, ${metric.name} (Công ${attack}đ) luôn là mũi tấn công sắc bén dứt điểm nhanh gọn mỗi khi đứng lưới.`,
          `Hỏa lực dồi dào nhưng phòng ngự ở mức trung bình, ${metric.name} (Thủ ${defense}đ) chơi đúng phong cách một Sát Thủ Bắn Lưới đích thực.`,
          `Mỗi khi lên lưới, ${metric.name} (Công ${attack}đ) lập tiếp tục gây sức ép lớn buộc đối phương tự hỏng. Một lối chơi tấn công vô cùng phóng khoáng.`
        ];
        addCandidate(candidates, snapshot, {
          type: 'net_assassin',
          title: '🏹 SÁT THỦ BẮN LƯỚI',
          group: 'elo',
          participantIds: [metric.id],
          rarity: 'rare',
          frequency: 'frequent',
          baseWeight: 45,
          evidenceStrength: evidence(metric.total),
          surpriseScore: 10,
          text: getRandomVariant(texts, random),
        });
      } else if (defense >= 65 && attack < 65) {
        const texts = [
          `Điểm Thủ ấn tượng (${defense}đ) và Công trung bình (${attack}đ) biến ${metric.name} thành một "Chốt Chặn Bền Bỉ" – hậu phương cực kỳ vững chắc và ít tự hỏng.`,
          `Lối chơi vô cùng an toàn và kiên nhẫn: ${metric.name} (Thủ ${defense}đ) luôn bọc lót tốt cho đồng đội và hạn chế tối đa sai lầm.`,
          `Được ví như bức tường thành kiên cố, ${metric.name} (Thủ ${defense}đ - Công ${attack}đ) kiên cường trả bóng bền bỉ buộc đối thủ phải nản lòng.`,
          `Không quá bùng nổ ở khâu dứt điểm nhưng cực kỳ chắc chắn ở phòng tuyến, ${metric.name} chính là một Chốt Chặn Bền Bỉ đáng tin cậy.`,
          `Sự điềm tĩnh và bọc lót thông minh giúp ${metric.name} (Thủ ${defense}đ) trở thành điểm tựa vững chãi cho bất kỳ đồng đội nào đá cặp cùng.`
        ];
        addCandidate(candidates, snapshot, {
          type: 'steady_wall',
          title: '🧱 CHỐT CHẶN BỀN BỈ',
          group: 'elo',
          participantIds: [metric.id],
          rarity: 'rare',
          frequency: 'frequent',
          baseWeight: 45,
          evidenceStrength: evidence(metric.total),
          surpriseScore: 10,
          text: getRandomVariant(texts, random),
        });
      } else {
        const texts = [
          `Sở hữu các thông số cân đối (Công ${attack}đ - Thủ ${defense}đ), ${metric.name} điều phối trận đấu vô cùng nhịp nhàng và thích nghi linh hoạt theo đồng đội.`,
          `Lối chơi "Nhịp Điệu Cân Bằng" giúp ${metric.name} (Công ${attack}đ - Thủ ${defense}đ) giữ thế trận ổn định và kiểm soát tốt khu trung tuyến.`,
          `Cân bằng hoàn hảo: ${metric.name} không quá thiên lệch về công hay thủ, chơi điềm tĩnh và giữ nhịp độ trận đấu cực kỳ chuẩn mực.`,
          `Một cầu thủ toàn diện trong việc điều tiết lối chơi, ${metric.name} (Công ${attack}đ - Thủ ${defense}đ) luôn mang lại sự an tâm bằng sự cân bằng.`,
          `Khả năng đọc tình huống và thích ứng cao giúp ${metric.name} giữ vững Nhịp Điệu Cân Bằng cho đội trong mọi hoàn cảnh khó khăn.`
        ];
        addCandidate(candidates, snapshot, {
          type: 'balanced_tempo',
          title: '🔵 NHỊP ĐIỆU CÂN BẰNG',
          group: 'elo',
          participantIds: [metric.id],
          rarity: 'common',
          frequency: 'frequent',
          baseWeight: 35,
          evidenceStrength: evidence(metric.total),
          surpriseScore: 5,
          text: getRandomVariant(texts, random),
        });
      }
    }
  });
}

function addStoryCandidates(candidates: InsightCandidate[], snapshot: AnalysisSnapshot, random?: () => number) {
  const breakers = buildStreakBreakers(snapshot);
  const breaker = breakers[0];
  if (breaker) {
    const player = snapshot.metrics.get(breaker.playerId);
    const target = snapshot.metrics.get(breaker.targetId);
    if (player && target) {
      const targetMatchesAfter = sortOldest(snapshot.rankingMatches.filter(m =>
        playerInMatch(m, target.id) && matchTime(m) > breaker.matchTime
      ));
      const hasWonAfter = targetMatchesAfter.some(m => resultForPlayer(m, target.id) === 'W');
      let state = 0;
      let X_val = 0;
      if (targetMatchesAfter.length === 0) {
        state = 1;
      } else if (!hasWonAfter && targetMatchesAfter.length >= 2) {
        state = 2;
        X_val = targetMatchesAfter.length;
      }
      if (state > 0) {
        const text = getRandomVariant(VARIANTS.streak_breaker({ player, target, breaker, X: X_val, state }), random);
        addCandidate(candidates, snapshot, {
          type: 'streak_breaker',
          title: '✂️ CẮT CHUỖI',
          group: 'form',
          participantIds: [player.id, target.id],
          rarity: 'rare',
          frequency: 'rare',
          baseWeight: 66,
          evidenceStrength: evidence(breaker.streak),
          surpriseScore: breaker.streak * 4,
          text,
        });
      }
    }
  }

  const partnerStreakEvents = buildPartnerStreakEvents(snapshot);
  partnerStreakEvents.filter(row => row.type === 'king_rescue').slice(0, 2).forEach(row => {
    const player = snapshot.metrics.get(row.playerId);
    const partner = snapshot.metrics.get(row.partnerId);
    if (!player || !partner) return;
    const text = getRandomVariant(VARIANTS.king_rescue({ player, partner, row }), random);
    addCandidate(candidates, snapshot, {
      type: 'king_rescue',
      title: '🛟 PHAO CỨU SINH',
      group: 'partner',
      participantIds: [player.id, partner.id],
      rarity: row.priorStreak >= 6 ? 'epic' : 'rare',
      frequency: 'rare',
      baseWeight: 58,
      evidenceStrength: evidence(row.priorStreak),
      surpriseScore: row.priorStreak * 4,
      text,
    });
  });

  partnerStreakEvents.filter(row => row.type === 'anchor_drag').slice(0, 2).forEach(row => {
    const player = snapshot.metrics.get(row.playerId);
    const partner = snapshot.metrics.get(row.partnerId);
    if (!player || !partner) return;
    const text = getRandomVariant(VARIANTS.anchor_drag({ player, partner, row }), random);
    addCandidate(candidates, snapshot, {
      type: 'anchor_drag',
      title: '⚓ ĐỨT MẠCH VÌ KÈO NẶNG',
      group: 'partner',
      participantIds: [player.id, partner.id],
      rarity: row.priorStreak >= 6 ? 'epic' : 'rare',
      frequency: 'rare',
      baseWeight: 56,
      evidenceStrength: evidence(row.priorStreak),
      surpriseScore: row.priorStreak * 4,
      text,
    });
  });

  const revengeRows: Array<{ player: AnalysisPlayer; opponent: AnalysisPlayer; priorLosses: number; state: number; Y: number; recentWins: number; recentTotal: number }> = [];
  snapshot.visiblePlayers.forEach(player => {
    snapshot.visiblePlayers.forEach(opponent => {
      if (player.id === opponent.id) return;
      const meetings = sortOldest(snapshot.rankingMatches.filter(match => opponentIdsForPlayer(match, player.id).includes(opponent.id)));
      if (meetings.length < 4) return;

      let priorLosses = 0;
      let bestPriorLosses = 0;
      meetings.forEach(match => {
        if (resultForPlayer(match, player.id) === 'L') {
          priorLosses++;
        } else {
          bestPriorLosses = Math.max(bestPriorLosses, priorLosses);
          priorLosses = 0;
        }
      });

      const revState = getRevengeState(meetings, player.id);
      if (revState && revState.active) {
        const state = revState.subsequentWinsCount === 0 ? 1 : 2;
        const recent4 = meetings.slice(-4);
        const recentWins = recent4.filter(m => resultForPlayer(m, player.id) === 'W').length;
        revengeRows.push({
          player,
          opponent,
          priorLosses: revState.priorLosses,
          state,
          Y: revState.subsequentWinsCount,
          recentWins,
          recentTotal: recent4.length
        });
      }
    });
  });

  revengeRows.sort((a, b) => b.priorLosses - a.priorLosses || b.recentWins - a.recentWins);
  const bestRevenge = revengeRows[0];
  if (bestRevenge) {
    const textRevenge = getRandomVariant(VARIANTS.revenge_win({
      player: bestRevenge.player,
      opponent: bestRevenge.opponent,
      revenge: { priorLosses: bestRevenge.priorLosses },
      Y: bestRevenge.Y,
      state: bestRevenge.state
    }), random);

    addCandidate(candidates, snapshot, {
      type: 'revenge_win',
      title: '🩸 PHỤC HẬN',
      group: 'opponent',
      participantIds: [bestRevenge.player.id, bestRevenge.opponent.id],
      rarity: 'rare',
      frequency: 'rare',
      baseWeight: 58,
      evidenceStrength: evidence(bestRevenge.priorLosses + bestRevenge.recentTotal),
      surpriseScore: bestRevenge.priorLosses * 4,
      text: textRevenge,
    });

    if (bestRevenge.recentWins >= 2) {
      const textTarget = getRandomVariant(VARIANTS.revenge_target({
        player: bestRevenge.player,
        opponent: bestRevenge.opponent,
        revenge: { recentWins: bestRevenge.recentWins, recentTotal: bestRevenge.recentTotal }
      }), random);

      addCandidate(candidates, snapshot, {
        type: 'revenge_target',
        title: '🔁 LẬT LẠI KÈO',
        group: 'opponent',
        participantIds: [bestRevenge.player.id, bestRevenge.opponent.id],
        rarity: 'rare',
        frequency: 'rare',
        baseWeight: 53,
        evidenceStrength: evidence(bestRevenge.recentTotal),
        surpriseScore: bestRevenge.recentWins * 6,
        text: textTarget,
      });
    }
  }

  const takeover = findRankTakeover(snapshot);
  if (takeover) {
    const playerB = snapshot.metrics.get(takeover.playerBId);
    const playerA = snapshot.metrics.get(takeover.playerAId);
    if (playerB && playerA) {
      const text = getRandomVariant(VARIANTS.rank_takeover({ playerB, playerA, newRank: takeover.newRank }), random);
      addCandidate(candidates, snapshot, {
        type: 'rank_takeover',
        title: '🏎️ SOÁN NGÔI',
        group: 'rank',
        participantIds: [playerB.id, playerA.id],
        rarity: 'rare',
        frequency: 'rare',
        baseWeight: 60,
        evidenceStrength: 8,
        surpriseScore: 12,
        text,
      });
    }
  }
}

function addPartnerCandidates(candidates: InsightCandidate[], snapshot: AnalysisSnapshot, random?: () => number) {
  const repeated = snapshot.partnerEdges.filter(edge => edge.total >= 4);
  const pairEdges = uniquePartnerPairs(snapshot.partnerEdges);
  const gluedPairs = uniquePartnerPairs(snapshot.partnerEdges).sort((a, b) => b.edge.total - a.edge.total || b.edge.confidence - a.edge.confidence);
  const glued = gluedPairs[0]?.edge || null;
  const secondGlued = gluedPairs[1]?.edge || null;
  const ranks = rankBoard(snapshot);
  const rankById = new Map(ranks.map((metric, index) => [metric.id, index + 1]));
  const bottomRankIds = new Set(ranks.slice(-2).map(metric => metric.id));
  const active = snapshot.playerMetrics.filter(metric => metric.total > 0);
  const avgPairTotal = snapshot.partnerEdges.length > 0 ? average(snapshot.partnerEdges.map(e => e.total)) : 0;

  pairEdges.forEach(({ edge, maxAbsImpact }) => {
    const otherMetric = snapshot.metrics.get(edge.otherId);

    if (edge.total >= 4 && edge.rate >= 75) {
      const text = getRandomVariant(VARIANTS.perfect_duo({ edge }), random);
      addCandidate(candidates, snapshot, {
        type: 'perfect_duo',
        title: '🤝 CẶP BÀI TRÙNG',
        group: 'partner',
        participantIds: [edge.playerId, edge.otherId],
        rarity: edge.total >= 8 ? 'rare' : 'uncommon',
        frequency: 'occasional',
        baseWeight: 62,
        evidenceStrength: evidence(edge.total),
        surpriseScore: (edge.rate - 70) / 2,
        text,
      });
    }

    if (edge.total >= 4 && edge.rate <= 25) {
      const text = getRandomVariant(VARIANTS.bad_duo({ edge }), random);
      addCandidate(candidates, snapshot, {
        type: 'bad_duo',
        title: '⚓ DẪM CHÂN NHAU',
        group: 'partner',
        participantIds: [edge.playerId, edge.otherId],
        rarity: edge.total >= 8 ? 'rare' : 'uncommon',
        frequency: 'occasional',
        baseWeight: 62,
        evidenceStrength: evidence(edge.total),
        surpriseScore: (30 - edge.rate) / 2,
        text,
      });
    }

    if (edge.rate >= 50 && edge.rate <= 65 && maxAbsImpact <= 5 && edge.total >= 6) {
      const text = getRandomVariant(VARIANTS.stable_partner({ edge }), random);
      addCandidate(candidates, snapshot, {
        type: 'stable_partner',
        title: '⚖️ TRÒN VAI',
        group: 'partner',
        participantIds: [edge.playerId, edge.otherId],
        rarity: 'common',
        frequency: 'frequent',
        appearanceRate: 0.55,
        baseWeight: 38,
        evidenceStrength: evidence(edge.total),
        text,
      });
    }

    if (edge.total >= 3 && edge.rate >= 80 && edge.total <= avgPairTotal * 0.65) {
      const text = getRandomVariant(VARIANTS.rare_pair_hot({ edge }), random);
      addCandidate(candidates, snapshot, {
        type: 'rare_pair_hot',
        title: '🍯 CẶP MẪU MỎNG MÀ THƠM',
        group: 'partner',
        participantIds: [edge.playerId, edge.otherId],
        rarity: 'rare',
        frequency: 'rare',
        baseWeight: 54,
        evidenceStrength: evidence(edge.total),
        surpriseScore: edge.rate - 70,
        text,
      });
    }

    // calculate avgLossDiff for disaster_duo
    const edgeMatches = snapshot.rankingMatches.filter(m => partnerForPlayer(m, edge.playerId) === edge.otherId);
    const lostMatches = edgeMatches.filter(m => resultForPlayer(m, edge.playerId) === 'L');
    const lossDiffs = lostMatches.map(m => Math.abs(Number(m.win_score || 0) - Number(m.lose_score || 0)));
    const edgeAvgLossDiff = average(lossDiffs);
    if (edge.total >= 4 && edge.rate <= 35 && edgeAvgLossDiff >= 5.5) {
      const text = getRandomVariant(VARIANTS.disaster_duo({ edge, avgLossDiff: edgeAvgLossDiff }), random);
      addCandidate(candidates, snapshot, {
        type: 'disaster_duo',
        title: '📉 ĐÔI CÙNG LÙI',
        group: 'partner',
        participantIds: [edge.playerId, edge.otherId],
        rarity: 'rare',
        frequency: 'rare',
        baseWeight: 57,
        evidenceStrength: evidence(edge.total),
        surpriseScore: edgeAvgLossDiff * 2,
        text,
      });
    }

    if (edge.deuceGames >= 3 && (edge.deuceGames / edge.total) >= 0.20) {
      const text = getRandomVariant(VARIANTS.partner_long_games({ edge }), random);
      addCandidate(candidates, snapshot, {
        type: 'partner_long_games',
        title: '🥵 CẶP THÍCH CÒ CƯA',
        group: 'partner',
        participantIds: [edge.playerId, edge.otherId],
        rarity: 'uncommon',
        frequency: 'occasional',
        baseWeight: 45,
        evidenceStrength: evidence(edge.deuceGames),
        surpriseScore: edge.deuceGames * 3,
        text,
      });
    }
  });

  repeated.forEach(edge => {
    const playerMetric = snapshot.metrics.get(edge.playerId);
    const otherMetric = snapshot.metrics.get(edge.otherId);
    if (!playerMetric || !otherMetric) return;

    if (edge.impact >= 15 && edge.rate >= 50) {
      const text = getRandomVariant(VARIANTS.partner_boost({ edge }), random);
      addCandidate(candidates, snapshot, {
        type: 'partner_boost',
        title: '🧿 BÙA HỘ MỆNH',
        group: 'partner',
        participantIds: [edge.playerId, edge.otherId],
        rarity: edge.impact >= 25 ? 'epic' : 'rare',
        frequency: 'rare',
        baseWeight: 68,
        evidenceStrength: evidence(edge.total),
        surpriseScore: edge.impact,
        text,
      });
    }

    if (edge.impact <= -15 && edge.rate <= 40) {
      const text = getRandomVariant(VARIANTS.partner_drag({ edge }), random);
      addCandidate(candidates, snapshot, {
        type: 'partner_drag',
        title: '🪨 QUẢ TẠ VÀNG',
        group: 'partner',
        participantIds: [edge.playerId, edge.otherId],
        rarity: edge.impact <= -25 ? 'epic' : 'rare',
        frequency: 'rare',
        baseWeight: 68,
        evidenceStrength: evidence(edge.total),
        surpriseScore: absRound(edge.impact),
        text,
      });
    }

    const partnerLift = edge.rate - otherMetric.winRate;
    if (edge.total >= 4 && partnerLift >= 18 && edge.rate >= 55) {
      const text = getRandomVariant(VARIANTS.carry_partner({ edge, otherMetric }), random);
      addCandidate(candidates, snapshot, {
        type: 'carry_partner',
        title: '🏋️ GÁNH CÒNG LƯNG',
        group: 'partner',
        participantIds: [edge.playerId, edge.otherId],
        rarity: 'rare',
        frequency: 'rare',
        baseWeight: 57,
        evidenceStrength: evidence(edge.total),
        surpriseScore: partnerLift,
        text,
      });
    }

    if (edge.total >= 4 && partnerLift <= -18 && edge.rate <= 45) {
      const text = getRandomVariant(VARIANTS.heavy_backpack({ edge, otherMetric }), random);
      addCandidate(candidates, snapshot, {
        type: 'heavy_backpack',
        title: '🎒 NẶNG VAI',
        group: 'partner',
        participantIds: [edge.playerId, edge.otherId],
        rarity: 'rare',
        frequency: 'rare',
        baseWeight: 56,
        evidenceStrength: evidence(edge.total),
        surpriseScore: Math.abs(partnerLift),
        text,
      });
    }
  });

  repeated.forEach(edge => {
    const playerMetric = snapshot.metrics.get(edge.playerId);
    const otherRank = rankById.get(edge.otherId) || 0;
    if (!playerMetric || playerMetric.wins <= 0 || otherRank > 2) return;

    const matchesWithoutPartner = snapshot.rankingMatches.filter(match =>
      playerInMatch(match, edge.playerId) && partnerIdForPlayer(match, edge.playerId) !== edge.otherId
    );
    const winsWithoutPartner = matchesWithoutPartner.filter(match => resultForPlayer(match, edge.playerId) === 'W').length;
    const winRateWithoutPartner = rate(winsWithoutPartner, matchesWithoutPartner.length);
    const winShareFromPartner = edge.wins / playerMetric.wins;

    if (edge.wins >= 4 && winShareFromPartner >= 0.6 && matchesWithoutPartner.length >= 3 && winRateWithoutPartner < 30) {
      const text = getRandomVariant(VARIANTS.parasite_win({
        edge,
        winShareFromPartner,
        winRateWithoutPartner,
        otherRank,
        winsWithoutPartner,
        totalWithoutPartner: matchesWithoutPartner.length
      }), random);
      addCandidate(candidates, snapshot, {
        type: 'parasite_win',
        title: '🧲 BÁM CÀNG KIẾM ĐIỂM',
        group: 'partner',
        participantIds: [edge.playerId, edge.otherId],
        rarity: winShareFromPartner >= 0.75 ? 'epic' : 'rare',
        frequency: 'rare',
        baseWeight: 54,
        evidenceStrength: evidence(edge.total),
        surpriseScore: Math.round(winShareFromPartner * 20),
        text,
      });
    }
  });

  if (glued && glued.total >= 8) {
    const gap = glued.total - (secondGlued ? secondGlued.total : 0);
    const state = gap >= 2 ? 1 : 2;
    const text = getRandomVariant(VARIANTS.glued_pair({ glued, state }), random);
    addCandidate(candidates, snapshot, {
      type: 'glued_pair',
      title: '🔗 DÍNH NHAU NHẤT SÂN',
      group: 'partner',
      participantIds: [glued.playerId, glued.otherId],
      rarity: 'common',
      frequency: 'frequent',
      appearanceRate: 0.45,
      baseWeight: 36,
      evidenceStrength: evidence(glued.total),
      text,
    });
  }

  snapshot.playerMetrics.forEach(metric => {
    const partnerMatches = snapshot.rankingMatches.filter(match => playerInMatch(match, metric.id) && partnerIdForPlayer(match, metric.id));
    const bottomPartnerMatches = partnerMatches.filter(match => {
      const partnerId = partnerForPlayer(match, metric.id);
      return Boolean(partnerId && bottomRankIds.has(partnerId));
    });
    if (!bottomRankIds.has(metric.id) && partnerMatches.length >= 10 && bottomPartnerMatches.length / partnerMatches.length >= 0.51) {
      const text = getRandomVariant(VARIANTS.unlucky_draw({ metric, bottomPartnerMatches, partnerMatches }), random);
      addCandidate(candidates, snapshot, {
        type: 'unlucky_draw',
        title: '🎲 BỐC THĂM HƠI XUI',
        group: 'partner',
        participantIds: [metric.id],
        rarity: bottomPartnerMatches.length / partnerMatches.length >= 0.65 ? 'rare' : 'uncommon',
        frequency: 'occasional',
        baseWeight: 42,
        evidenceStrength: evidence(partnerMatches.length),
        surpriseScore: (bottomPartnerMatches.length / partnerMatches.length) * 16,
        text,
      });
    }

    const playerEdges = snapshot.partnerEdges.filter(edge => edge.playerId === metric.id && edge.total >= 4);
    const synergySorted = [...active].sort((a, b) => b.synergyScore - a.synergyScore);
    const top3Synergy = new Set(synergySorted.slice(0, 3).map(m => m.id));
    const pointsSorted = [...active].sort((a, b) => b.avgPointsFor - a.avgPointsFor);
    const top3Points = new Set(pointsSorted.slice(0, 3).map(m => m.id));

    if (metric.total >= 8 && metric.synergyScore >= 58 && playerEdges.length >= 2 && top3Synergy.has(metric.id) && !top3Points.has(metric.id)) {
      const text = getRandomVariant(VARIANTS.cover_master({ metric }), random);
      addCandidate(candidates, snapshot, {
        type: 'cover_master',
        title: '🩹 TRÙM BỌC LÓT',
        group: 'partner',
        participantIds: [metric.id],
        rarity: 'rare',
        frequency: 'rare',
        baseWeight: 50,
        evidenceStrength: evidence(metric.total),
        surpriseScore: metric.synergyScore - metric.attackScore,
        text,
      });
    }

    // chameleon_partner (82)
    const latestMatchTime = snapshot.rankingMatches[0] ? matchTime(snapshot.rankingMatches[0]) : Date.now();
    const oneWeekAgo = latestMatchTime - 7 * 86400000;
    const weekMatches = snapshot.rankingMatches.filter(m => playerInMatch(m, metric.id) && matchTime(m) >= oneWeekAgo);
    const partnerStats = new Map<string, { wins: number; total: number }>();
    weekMatches.forEach(m => {
      const partnerId = partnerIdForPlayer(m, metric.id);
      if (!partnerId) return;
      const stat = partnerStats.get(partnerId) || { wins: 0, total: 0 };
      stat.total++;
      if (resultForPlayer(m, metric.id) === 'W') stat.wins++;
      partnerStats.set(partnerId, stat);
    });
    const qualifiedPartners = Array.from(partnerStats.entries()).filter(([_, stat]) => stat.wins / stat.total >= 0.55);
    if (qualifiedPartners.length >= 3) {
      const text = getRandomVariant(VARIANTS.chameleon_partner({ metric, count: qualifiedPartners.length }), random);
      addCandidate(candidates, snapshot, {
        type: 'chameleon_partner',
        title: '🦎 BẠN ĐỒNG HÀNH ĐA NĂNG',
        group: 'partner',
        participantIds: [metric.id],
        rarity: 'rare',
        frequency: 'rare',
        baseWeight: 55,
        evidenceStrength: evidence(weekMatches.length),
        surpriseScore: qualifiedPartners.length * 4,
        text,
      });
    }
  });
}

function addScoreCandidates(candidates: InsightCandidate[], snapshot: AnalysisSnapshot, random?: () => number) {
  const active = snapshot.playerMetrics.filter(metric => metric.total > 0);
  const ranks = rankBoard(snapshot);
  const rankById = new Map(ranks.map((metric, index) => [metric.id, index + 1]));
  const topAttack = [...active].filter(metric => metric.total >= 8).sort((a, b) => b.avgPointsFor - a.avgPointsFor)[0];
  const avgConceded = active.reduce((sum, metric) => sum + metric.avgConceded, 0) / Math.max(1, active.length);
  const defenseLeaders = new Set([...active]
    .filter(metric => metric.total >= 8)
    .sort((a, b) => a.avgConceded - b.avgConceded)
    .slice(0, 2)
    .map(metric => metric.id));

  active.forEach(metric => {
    const leaderboardRank = rankById.get(metric.id) || 0;
    const tightMatches = snapshot.rankingMatches.filter(match => playerInMatch(match, metric.id) && isTightOrLongGame(match)).length;
    const tightRate = metric.total > 0 ? tightMatches / metric.total : 0;

    if (topAttack?.id === metric.id && metric.avgPointsFor >= 9) {
      const text = getRandomVariant(VARIANTS.top_attack({ metric }), random);
      addCandidate(candidates, snapshot, {
        type: 'top_attack',
        title: '💣 CỖ MÁY DẬP BÓNG',
        group: 'score',
        participantIds: [metric.id],
        rarity: 'uncommon',
        frequency: 'frequent',
        appearanceRate: 0.55,
        baseWeight: 43,
        evidenceStrength: evidence(metric.total),
        surpriseScore: metric.avgPointsFor,
        text,
      });
    }

    const defenseLift = avgConceded - metric.avgConceded;
    if (metric.total >= 8 && defenseLeaders.has(metric.id) && defenseLift >= 0.8 && metric.avgConceded <= 7.5) {
      const text = getRandomVariant(VARIANTS.defense_wall({ metric }), random);
      addCandidate(candidates, snapshot, {
        type: 'defense_wall',
        title: '🛡️ BỨC TƯỜNG BÊ TÔNG',
        group: 'score',
        participantIds: [metric.id],
        rarity: defenseLift >= 1.5 ? 'rare' : 'uncommon',
        frequency: 'occasional',
        baseWeight: 50,
        evidenceStrength: evidence(metric.total),
        surpriseScore: Math.min(18, defenseLift * 8),
        text,
      });
    }

    if (metric.total >= 8 && tightMatches >= 4 && tightRate >= 0.35) {
      const text = getRandomVariant(VARIANTS.drama_magnet({ metric, tightMatches }), random);
      addCandidate(candidates, snapshot, {
        type: 'drama_magnet',
        title: '🎭 NAM CHÂM DRAMA',
        group: 'score',
        participantIds: [metric.id],
        rarity: tightRate >= 0.5 ? 'rare' : 'uncommon',
        frequency: 'occasional',
        baseWeight: 48,
        evidenceStrength: evidence(tightMatches),
        surpriseScore: tightRate * 18,
        text,
      });
    }

    if (leaderboardRank > 0 && leaderboardRank <= 3 && metric.losses >= 3 && metric.avgLossDiff >= 4) {
      const text = getRandomVariant(VARIANTS.glass_cannon({ metric, leaderboardRank }), random);
      addCandidate(candidates, snapshot, {
        type: 'glass_cannon',
        title: '💥 CÔNG TO GIÁP MỎNG',
        group: 'score',
        participantIds: [metric.id],
        rarity: metric.avgLossDiff >= 5.5 ? 'rare' : 'uncommon',
        frequency: 'occasional',
        baseWeight: 46,
        evidenceStrength: evidence(metric.losses),
        surpriseScore: metric.avgLossDiff * 3,
        text,
      });
    }

    if (leaderboardRank >= 5 && metric.losses >= 3 && metric.avgLossDiff <= 3.5) {
      const text = getRandomVariant(VARIANTS.stubborn_loser({ metric }), random);
      addCandidate(candidates, snapshot, {
        type: 'stubborn_loser',
        title: '🪨 THUA NHƯNG KHÓ NUỐT',
        group: 'score',
        participantIds: [metric.id],
        rarity: metric.avgLossDiff <= 2.5 ? 'rare' : 'uncommon',
        frequency: 'occasional',
        baseWeight: 44,
        evidenceStrength: evidence(metric.losses),
        surpriseScore: Math.max(0, 4 - metric.avgLossDiff) * 5,
        text,
      });
    }

    if (metric.dominantWins >= 4 && metric.winRate >= 45) {
      const text = getRandomVariant(VARIANTS.dominant_closer({ metric }), random);
      addCandidate(candidates, snapshot, {
        type: 'dominant_closer',
        title: '⚰️ ĐÓNG HÒM CHÓNG VÁNH',
        group: 'score',
        participantIds: [metric.id],
        rarity: metric.dominantWins >= 6 ? 'rare' : 'uncommon',
        frequency: 'occasional',
        baseWeight: 55,
        evidenceStrength: evidence(metric.dominantWins),
        surpriseScore: metric.dominantWins * 3,
        text,
      });
    }

    if (metric.closeLosses >= 3) {
      const text = getRandomVariant(VARIANTS.close_loss({ metric, closeLosses: metric.closeLosses }), random);
      addCandidate(candidates, snapshot, {
        type: 'close_loss',
        title: '🥲 THÁNH NHỌ SÂN BÃI',
        group: 'score',
        participantIds: [metric.id],
        rarity: metric.closeLosses >= 5 ? 'rare' : 'uncommon',
        frequency: 'occasional',
        baseWeight: 52,
        evidenceStrength: evidence(metric.closeLosses),
        surpriseScore: metric.closeLosses * 2,
        text,
      });
    }

    const highestDeuceMatchesPlayer = [...active].filter(m => m.total >= 8).sort((a, b) => b.deuceMatches - a.deuceMatches)[0];
    if (metric.total >= 8 && highestDeuceMatchesPlayer?.id === metric.id && metric.deuceMatches >= 5) {
      const text = getRandomVariant(VARIANTS.long_game_addict({ metric }), random);
      addCandidate(candidates, snapshot, {
        type: 'long_game_addict',
        title: '🥵 ĐAM MÊ CÒ CƯA',
        group: 'score',
        participantIds: [metric.id],
        rarity: metric.deuceMatches >= 5 ? 'rare' : 'uncommon',
        frequency: 'occasional',
        baseWeight: 50,
        evidenceStrength: evidence(metric.deuceMatches),
        surpriseScore: metric.deuceMatches * 2,
        text,
      });
    }

    if (metric.bagelLosses > 0) {
      const text = getRandomVariant(VARIANTS.bagel_loss({ metric }), random);
      addCandidate(candidates, snapshot, {
        type: 'bagel_loss',
        title: '🔌 SẬP NGUỒN',
        group: 'score',
        participantIds: [metric.id],
        rarity: metric.bagelLosses >= 2 ? 'rare' : 'uncommon',
        frequency: 'occasional',
        baseWeight: 48,
        evidenceStrength: evidence(metric.bagelLosses),
        surpriseScore: metric.bagelLosses * 5,
        text,
      });
    }

    const tightWinRate = metric.closeWins / Math.max(1, metric.closeWins + metric.closeLosses);
    if (metric.closeWins >= 4 && tightWinRate >= 0.65) {
      const text = getRandomVariant(VARIANTS.clutch_master({ metric, tightWinRate: tightWinRate * 100 }), random);
      addCandidate(candidates, snapshot, {
        type: 'clutch_master',
        title: '💪 CÀNG CUỐI CÀNG LÌ',
        group: 'score',
        participantIds: [metric.id],
        rarity: metric.closeWins >= 5 ? 'rare' : 'uncommon',
        frequency: 'occasional',
        baseWeight: 48,
        evidenceStrength: evidence(metric.closeWins),
        surpriseScore: metric.closeWins * 2,
        text,
      });
    }

    if (metric.closeLosses >= 4 && metric.closeLosses >= metric.closeWins + 2) {
      const text = getRandomVariant(VARIANTS.late_collapse({ metric }), random);
      addCandidate(candidates, snapshot, {
        type: 'late_collapse',
        title: '⌛ THIẾU MỘT NHỊP',
        group: 'score',
        participantIds: [metric.id],
        rarity: 'uncommon',
        frequency: 'occasional',
        baseWeight: 47,
        evidenceStrength: evidence(metric.closeLosses),
        surpriseScore: metric.closeLosses - metric.closeWins,
        text,
      });
    }

    const highestAvgWinDiffPlayer = [...active].filter(m => m.total >= 8 && m.wins >= 5).sort((a, b) => b.avgWinDiff - a.avgWinDiff)[0];
    if (metric.total >= 8 && metric.wins >= 5 && highestAvgWinDiffPlayer?.id === metric.id && metric.avgWinDiff >= 4.5) {
      const text = getRandomVariant(VARIANTS.score_bully({ metric }), random);
      addCandidate(candidates, snapshot, {
        type: 'score_bully',
        title: '🪓 THẮNG LÀ THẮNG SÂU',
        group: 'score',
        participantIds: [metric.id],
        rarity: 'uncommon',
        frequency: 'occasional',
        baseWeight: 45,
        evidenceStrength: evidence(metric.wins),
        surpriseScore: metric.avgWinDiff * 2,
        text,
      });
    }

    if (metric.lowScoreLosses >= 3) {
      const text = getRandomVariant(VARIANTS.low_score_magnet({ metric }), random);
      addCandidate(candidates, snapshot, {
        type: 'low_score_magnet',
        title: '⚡ CỘT THU LÔI',
        group: 'score',
        participantIds: [metric.id],
        rarity: 'uncommon',
        frequency: 'occasional',
        baseWeight: 45,
        evidenceStrength: evidence(metric.lowScoreLosses),
        surpriseScore: metric.lowScoreLosses * 2,
        text,
      });
    }

    // buffet_eater (65)
    const dayCounts = new Map<string, number>();
    snapshot.rankingMatches.forEach(match => {
      const key = matchDayKey(match);
      if (!key) return;
      [match.win_1, match.win_2, match.lose_1, match.lose_2].forEach(pId => {
        if (pId === metric.id) {
          dayCounts.set(key, (dayCounts.get(key) || 0) + 1);
        }
      });
    });
    const uniqueDays = dayCounts.size;
    const sessionCounts = Array.from(dayCounts.values());
    const matchesPerSession = uniqueDays > 0 ? metric.total / uniqueDays : 0;
    const allUniqueDays = active.map(m => {
      const counts = new Map<string, number>();
      snapshot.rankingMatches.forEach(match => {
        const key = matchDayKey(match);
        if (key && [match.win_1, match.win_2, match.lose_1, match.lose_2].includes(m.id)) {
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      });
      return counts.size;
    });
    const avgDays = average(allUniqueDays);
    const allMatchesPerSession = active.map(m => {
      const counts = new Map<string, number>();
      snapshot.rankingMatches.forEach(match => {
        const key = matchDayKey(match);
        if (key && [match.win_1, match.win_2, match.lose_1, match.lose_2].includes(m.id)) {
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      });
      return counts.size > 0 ? m.total / counts.size : 0;
    });
    const avgMatchesPerSession = average(allMatchesPerSession);

    if (uniqueDays >= 2 && uniqueDays < avgDays && matchesPerSession >= avgMatchesPerSession + 1 && metric.total >= 6) {
      const attendanceObj = { matchesPerSession };
      const text = getRandomVariant(VARIANTS.buffet_eater({ metric, attendance: attendanceObj }), random);
      addCandidate(candidates, snapshot, {
        type: 'buffet_eater',
        title: '🍽️ ĐI ĂN BUFFET',
        group: 'score',
        participantIds: [metric.id],
        rarity: matchesPerSession >= avgMatchesPerSession + 2 ? 'rare' : 'uncommon',
        frequency: 'occasional',
        baseWeight: 40,
        evidenceStrength: evidence(metric.total),
        surpriseScore: Math.max(0, matchesPerSession - avgMatchesPerSession) * 5,
        text,
      });
    }

    // last_laugh (80)
    const playerMatches = sortOldest(snapshot.rankingMatches.filter(m => playerInMatch(m, metric.id)));
    if (playerMatches.length >= 3) {
      const latestDayKey = matchDayKey(playerMatches[playerMatches.length - 1]);
      const sessionMatches = playerMatches.filter(m => matchDayKey(m) === latestDayKey);
      const sessionTotal = sessionMatches.length;
      if (sessionTotal >= 3) {
        const lastResult = resultForPlayer(sessionMatches[sessionTotal - 1], metric.id);
        const priorMatches = sessionMatches.slice(0, sessionTotal - 1);
        const allPriorL = priorMatches.every(m => resultForPlayer(m, metric.id) === 'L');
        if (lastResult === 'W' && allPriorL) {
          const parts = latestDayKey.split('-');
          const sessionDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : latestDayKey;
          const text = getRandomVariant(VARIANTS.last_laugh({ metric, sessionDate, sessionTotal }), random);
          addCandidate(candidates, snapshot, {
            type: 'last_laugh',
            title: '😸 CƯỜI SAU CÙNG',
            group: 'score',
            participantIds: [metric.id],
            rarity: 'rare',
            frequency: 'rare',
            baseWeight: 55,
            evidenceStrength: evidence(sessionTotal),
            surpriseScore: sessionTotal * 3,
            text,
          });
        }
      }
    }

    // quick_finisher (83)
    const latestMatchTime = snapshot.rankingMatches[0] ? matchTime(snapshot.rankingMatches[0]) : Date.now();
    const oneWeekAgo = latestMatchTime - 7 * 86400000;
    const weekMatchesForQF = snapshot.rankingMatches.filter(m => playerInMatch(m, metric.id) && matchTime(m) >= oneWeekAgo);
    const totalInWeek = weekMatchesForQF.length;
    const deuceInWeek = weekMatchesForQF.filter(m => Number(m.win_score || 0) > 11).length;
    if (totalInWeek >= 10 && deuceInWeek === 0) {
      const text = getRandomVariant(VARIANTS.quick_finisher({ metric, count: totalInWeek }), random);
      addCandidate(candidates, snapshot, {
        type: 'quick_finisher',
        title: '⚡ ĐÁNH NHANH RÚT GỌN',
        group: 'score',
        participantIds: [metric.id],
        rarity: 'uncommon',
        frequency: 'occasional',
        baseWeight: 45,
        evidenceStrength: evidence(totalInWeek),
        surpriseScore: totalInWeek * 2,
        text,
      });
    }
  });
}

function addOpponentCandidates(candidates: InsightCandidate[], snapshot: AnalysisSnapshot, random?: () => number) {
  const repeated = snapshot.opponentEdges.filter(edge => edge.total >= 4);
  const mostRepeated = mostFrequentDirectional(repeated);
  const ranks = rankBoard(snapshot);
  const rankById = new Map(ranks.map((metric, index) => [metric.id, index + 1]));
  const topRankIds = new Set(ranks.slice(0, 2).map(metric => metric.id));
  const partnerEdgeByPair = new Map(snapshot.partnerEdges.map(edge => [`${edge.playerId}|${edge.otherId}`, edge]));
  const eloBoard = snapshot.board.filter(metric => metric.total > 0);
  const eloKing = eloBoard[0];

  repeated.forEach(edge => {
    const metric = snapshot.metrics.get(edge.playerId);
    if (!metric) return;

    if (edge.rate >= 80) {
      const text = getRandomVariant(VARIANTS.hard_counter({ edge }), random);
      addCandidate(candidates, snapshot, {
        type: 'hard_counter',
        title: '🦅 KHẮC TINH',
        group: 'opponent',
        participantIds: [edge.playerId, edge.otherId],
        rarity: edge.total >= 6 ? 'epic' : 'rare',
        frequency: 'rare',
        appearanceRate: 0.85,
        baseWeight: 50,
        evidenceStrength: evidence(edge.total),
        surpriseScore: Math.min(18, edge.total * 2),
        text,
      });
    }

    if (edge.rate <= 20) {
      const text = getRandomVariant(VARIANTS.target_dummy({ edge }), random);
      addCandidate(candidates, snapshot, {
        type: 'target_dummy',
        title: '🧸 BỊCH BÔNG GIẢI TRÍ',
        group: 'opponent',
        participantIds: [edge.playerId, edge.otherId],
        rarity: edge.total >= 6 ? 'epic' : 'rare',
        frequency: 'rare',
        appearanceRate: 0.85,
        baseWeight: 50,
        evidenceStrength: evidence(edge.total),
        surpriseScore: Math.min(18, edge.total * 2),
        text,
      });
    }

    if (edge.deuceGames >= 3 && (edge.deuceGames / edge.total) >= 0.20) {
      const text = getRandomVariant(VARIANTS.long_game_rivalry({ edge }), random);
      addCandidate(candidates, snapshot, {
        type: 'long_game_rivalry',
        title: '🪢 CỨ GẶP LÀ DÂY DƯA',
        group: 'opponent',
        participantIds: [edge.playerId, edge.otherId],
        rarity: 'uncommon',
        frequency: 'occasional',
        baseWeight: 48,
        evidenceStrength: evidence(edge.deuceGames),
        surpriseScore: edge.deuceGames * 3,
        text,
      });
    }

    const partnerEdge = partnerEdgeByPair.get(`${edge.playerId}|${edge.otherId}`);
    if (partnerEdge && partnerEdge.total >= 4 && partnerEdge.rate >= 60 && edge.rate >= 80) {
      const text = getRandomVariant(VARIANTS.friendly_fire({ edge, partnerEdge }), random);
      addCandidate(candidates, snapshot, {
        type: 'friendly_fire',
        title: '🎯 ĐỒNG ĐỘI HAY NẠN NHÂN',
        group: 'opponent',
        participantIds: [edge.playerId, edge.otherId],
        rarity: edge.rate >= 90 ? 'rare' : 'uncommon',
        frequency: 'rare',
        baseWeight: 52,
        evidenceStrength: evidence(edge.total + partnerEdge.total),
        surpriseScore: (edge.rate - 70) / 2,
        text,
      });
    }

    if (edge.impact <= -15 && edge.rate <= 45) {
      const text = getRandomVariant(VARIANTS.mental_block({ edge }), random);
      addCandidate(candidates, snapshot, {
        type: 'mental_block',
        title: '🧊 KHỚP KÈO',
        group: 'opponent',
        participantIds: [edge.playerId, edge.otherId],
        rarity: edge.impact <= -25 ? 'epic' : 'rare',
        frequency: 'rare',
        baseWeight: 62,
        evidenceStrength: evidence(edge.total),
        surpriseScore: absRound(edge.impact),
        text,
      });
    }

    if (edge.impact >= 15 && edge.rate >= 55) {
      const text = getRandomVariant(VARIANTS.sweet_matchup({ edge }), random);
      addCandidate(candidates, snapshot, {
        type: 'sweet_matchup',
        title: '🍯 KÈO THƠM',
        group: 'opponent',
        participantIds: [edge.playerId, edge.otherId],
        rarity: edge.impact >= 25 ? 'epic' : 'rare',
        frequency: 'rare',
        baseWeight: 62,
        evidenceStrength: evidence(edge.total),
        surpriseScore: edge.impact,
        text,
      });
    }
  });

  if (mostRepeated && mostRepeated.total >= 6 && mostRepeated.rate >= 40 && mostRepeated.rate <= 60) {
    const text = getRandomVariant(VARIANTS.balanced_rivalry({ mostRepeated }), random);
    addCandidate(candidates, snapshot, {
      type: 'balanced_rivalry',
      title: '⚔️ KỲ PHÙNG ĐỊCH THỦ',
      group: 'opponent',
      participantIds: [mostRepeated.playerId, mostRepeated.otherId],
      rarity: 'uncommon',
      frequency: 'frequent',
      appearanceRate: 0.55,
      baseWeight: 44,
      evidenceStrength: evidence(mostRepeated.total),
      surpriseScore: mostRepeated.total,
      text,
    });
  }

  snapshot.opponentEdges
    .filter(edge => edge.total >= 3 && topRankIds.has(edge.otherId))
    .forEach(edge => {
      const metric = snapshot.metrics.get(edge.playerId);
      const leaderboardRank = rankById.get(edge.playerId) || 0;
      const targetRank = rankById.get(edge.otherId) || 0;
      if (!metric || ![3, 4].includes(leaderboardRank) || edge.rate < 60) return;

      const text = getRandomVariant(VARIANTS.gatekeeper_boss({ edge, metric, leaderboardRank, targetRank }), random);
      addCandidate(candidates, snapshot, {
        type: 'gatekeeper_boss',
        title: '🚧 ẢI GIỮA BẢNG',
        group: 'opponent',
        participantIds: [edge.playerId, edge.otherId],
        rarity: edge.rate >= 75 ? 'rare' : 'uncommon',
        frequency: 'rare',
        baseWeight: 50,
        evidenceStrength: evidence(edge.total),
        surpriseScore: edge.rate - 55,
        text,
      });
    });

  snapshot.playerMetrics.forEach(metric => {
    if (eloKing && metric.total > 0 && metric.id !== eloKing.id) {
      const kingWins = snapshot.rankingMatches.filter(m =>
        playerInMatch(m, metric.id) &&
        resultForPlayer(m, metric.id) === 'W' &&
        opponentIdsForPlayer(m, metric.id).includes(eloKing.id)
      ).length;
      if (kingWins >= 6) {
        const text = getRandomVariant(VARIANTS.boss_hunter({ metric, kingWins, kingName: eloKing.name }), random);
        addCandidate(candidates, snapshot, {
          type: 'boss_hunter',
          title: '🏹 THỢ SĂN TRÙM',
          group: 'opponent',
          participantIds: [metric.id, eloKing.id],
          rarity: 'rare',
          frequency: 'rare',
          baseWeight: 58,
          evidenceStrength: evidence(metric.totalVsHigherElo),
          surpriseScore: kingWins * 4,
          text,
        });
      }
    }

    const lowerRate = rate(metric.winsVsLowerElo, metric.totalVsLowerElo);
    if (metric.totalVsLowerElo >= 8 && lowerRate >= 70) {
      const text = getRandomVariant(VARIANTS.bully_lower_elo({ metric }), random);
      addCandidate(candidates, snapshot, {
        type: 'bully_lower_elo',
        title: '🚜 FARM KÈO MỀM',
        group: 'opponent',
        participantIds: [metric.id],
        rarity: 'uncommon',
        frequency: 'occasional',
        baseWeight: 42,
        evidenceStrength: evidence(metric.totalVsLowerElo),
        surpriseScore: lowerRate - 60,
        text,
      });
    }

    const higherLossRate = rate(metric.lossesVsHigherElo, metric.totalVsHigherElo);
    if (metric.totalVsHigherElo >= 6 && higherLossRate >= 65) {
      const text = getRandomVariant(VARIANTS.victim_strong_elo({ metric }), random);
      addCandidate(candidates, snapshot, {
        type: 'victim_strong_elo',
        title: '🧗 LỊCH ĐẤU KHÓ',
        group: 'opponent',
        participantIds: [metric.id],
        rarity: 'uncommon',
        frequency: 'occasional',
        baseWeight: 42,
        evidenceStrength: evidence(metric.totalVsHigherElo),
        surpriseScore: higherLossRate - 55,
        text,
      });
    }

    // rank_launchpad (63)
    const leaderboardRank = rankById.get(metric.id) || 0;
    if (leaderboardRank > 0 && leaderboardRank <= 3) {
      const launchpadEdge = snapshot.opponentEdges
        .filter(edge => edge.playerId === metric.id && edge.wins >= 4)
        .sort((a, b) => b.wins - a.wins || b.total - a.total)[0];
      if (launchpadEdge) {
        const text = getRandomVariant(VARIANTS.rank_launchpad({ metric, launchpadEdge, leaderboardRank }), random);
        addCandidate(candidates, snapshot, {
          type: 'rank_launchpad',
          title: '🛫 BÀN ĐẠP THĂNG HẠNG',
          group: 'opponent',
          participantIds: [metric.id, launchpadEdge.otherId],
          rarity: launchpadEdge.wins >= 7 ? 'rare' : 'uncommon',
          frequency: 'occasional',
          baseWeight: 47,
          evidenceStrength: evidence(launchpadEdge.total),
          surpriseScore: launchpadEdge.wins * 2,
          text,
        });
      }
    }
  });
}

function addFunCandidates(candidates: InsightCandidate[], snapshot: AnalysisSnapshot, random?: () => number) {
  const active = snapshot.playerMetrics.filter(metric => metric.total > 0);
  const topActivity = [...active].sort((a, b) => b.total - a.total || b.dailyMaxMatches - a.dailyMaxMatches)[0];
  const topFine = [...active].sort((a, b) => b.money - a.money || b.losses - a.losses)[0];
  const avgMatches = active.reduce((sum, metric) => sum + metric.total, 0) / Math.max(1, active.length);
  const dayCountsByPlayer = new Map<string, Map<string, number>>();

  snapshot.rankingMatches.forEach(match => {
    const day = matchDayKey(match);
    if (!day) return;
    [match.win_1, match.win_2, match.lose_1, match.lose_2].filter((id): id is string => Boolean(id)).forEach(playerId => {
      const counts = dayCountsByPlayer.get(playerId) || new Map<string, number>();
      counts.set(day, (counts.get(day) || 0) + 1);
      dayCountsByPlayer.set(playerId, counts);
    });
  });

  const attendanceRows = active.map(metric => {
    const dayCounts = dayCountsByPlayer.get(metric.id) || new Map<string, number>();
    const days = [...dayCounts.keys()].sort();
    const sessionCounts = [...dayCounts.values()];
    const dayTimes = days.map(day => new Date(`${day}T00:00:00Z`).getTime()).filter(time => Number.isFinite(time));
    const gaps = dayTimes.slice(1).map((time, index) => Math.max(0, Math.round((time - dayTimes[index]) / 86400000)));
    return {
      metric,
      uniqueDays: days.length,
      matchesPerSession: sessionCounts.length ? metric.total / sessionCounts.length : 0,
      gapStdDev: standardDeviation(gaps),
      maxGap: gaps.length ? Math.max(...gaps) : 0,
    };
  });
  const avgDays = average(attendanceRows.map(row => row.uniqueDays));
  const avgMatchesPerSession = average(attendanceRows.map(row => row.matchesPerSession));
  const attendanceById = new Map(attendanceRows.map(row => [row.metric.id, row]));

  // previous board for spring_jump and quantity_over_quality
  const prevBoard = buildPreviousSessionBoard(snapshot);
  const prevRankById = new Map(prevBoard.map((p, index) => [p.id, index + 1]));

  const ranks = rankBoard(snapshot);
  const rankById = new Map(ranks.map((metric, index) => [metric.id, index + 1]));
  const top1Player = ranks[0];

  active.forEach(metric => {
    const attendance = attendanceById.get(metric.id);
    const leaderboardRank = rankById.get(metric.id) || 0;

    if (topActivity?.id === metric.id && metric.total >= 20) {
      const secondActivity = [...active].filter(a => a.id !== topActivity.id).sort((a, b) => b.total - a.total)[0];
      const gap = topActivity.total - (secondActivity ? secondActivity.total : 0);
      if (gap >= 2) {
        const text = getRandomVariant(VARIANTS.iron_lung({ metric }), random);
        addCandidate(candidates, snapshot, {
          type: 'iron_lung',
          title: '🚜 LÁ PHỔI BÒ',
          group: 'fun',
          participantIds: [metric.id],
          rarity: metric.dailyMaxMatches >= 6 ? 'rare' : 'common',
          frequency: 'frequent',
          appearanceRate: 0.45,
          baseWeight: 40,
          evidenceStrength: evidence(metric.total),
          surpriseScore: metric.dailyMaxMatches,
          text,
        });
      }
    }

    if (metric.daysAbsent !== null && metric.daysAbsent >= 7) {
      const text = getRandomVariant(VARIANTS.missing_player({ metric }), random);
      addCandidate(candidates, snapshot, {
        type: 'missing_player',
        title: '🕶️ QUY ẨN GIANG HỒ',
        group: 'fun',
        participantIds: [metric.id],
        rarity: metric.daysAbsent >= 21 ? 'rare' : 'uncommon',
        frequency: 'frequent',
        appearanceRate: 0.55,
        baseWeight: 38,
        evidenceStrength: Math.min(18, metric.daysAbsent / 2),
        surpriseScore: Math.min(16, metric.daysAbsent / 2),
        text,
      });
    }

    if (metric.total > 0 && metric.total <= 5 && metric.winRate >= 80) {
      const text = getRandomVariant(VARIANTS.mercenary({ metric }), random);
      addCandidate(candidates, snapshot, {
        type: 'mercenary',
        title: '🏕️ LÍNH ĐÁNH THUÊ',
        group: 'fun',
        participantIds: [metric.id],
        rarity: 'uncommon',
        frequency: 'occasional',
        baseWeight: 44,
        evidenceStrength: evidence(metric.total),
        surpriseScore: metric.winRate - 70,
        text,
      });
    }

    if (metric.total > 0 && metric.total < avgMatches * 0.4) {
      const text = getRandomVariant(VARIANTS.casual_visitor({ metric, avgMatches }), random);
      addCandidate(candidates, snapshot, {
        type: 'casual_visitor',
        title: '🎟️ KHÁCH MỜI DANH DỰ',
        group: 'fun',
        participantIds: [metric.id],
        rarity: 'common',
        frequency: 'occasional',
        baseWeight: 34,
        evidenceStrength: evidence(metric.total),
        surpriseScore: Math.max(0, avgMatches - metric.total) / 2,
        text,
      });
    }

    if (metric.alternations >= 5) {
      const text = getRandomVariant(VARIANTS.alternating_form({ metric }), random);
      addCandidate(candidates, snapshot, {
        type: 'alternating_form',
        title: '🎛️ MÁY TEST VỢT',
        group: 'fun',
        participantIds: [metric.id],
        rarity: 'uncommon',
        frequency: 'occasional',
        baseWeight: 42,
        evidenceStrength: evidence(metric.alternations),
        surpriseScore: metric.alternations * 2,
        text,
      });
    }

    if (metric.total >= 20 && metric.winRate <= 40) {
      const text = getRandomVariant(VARIANTS.experience_seeker({ metric }), random);
      addCandidate(candidates, snapshot, {
        type: 'experience_seeker',
        title: '🎟️ CHUYÊN GIA CỌ XÁT',
        group: 'fun',
        participantIds: [metric.id],
        rarity: 'common',
        frequency: 'frequent',
        appearanceRate: 0.45,
        baseWeight: 34,
        evidenceStrength: evidence(metric.total),
        surpriseScore: 45 - metric.winRate,
        text,
      });
    }

    // top1_time (74)
    if (leaderboardRank === 1 && top1Player) {
      const daysAtTop1 = calculateDaysAtTop1(snapshot, top1Player.id);
      if (daysAtTop1 >= 14) {
        const text = getRandomVariant(VARIANTS.top1_time({ metric, daysAtTop1 }), random);
        addCandidate(candidates, snapshot, {
          type: 'top1_time',
          title: '👑 VỊ VƯƠNG TRƯỜNG KỲ',
          group: 'fun',
          participantIds: [metric.id],
          rarity: 'uncommon',
          frequency: 'occasional',
          baseWeight: 48,
          evidenceStrength: 10,
          surpriseScore: daysAtTop1 / 2,
          text,
        });
      }
    }

    // stuck_in_mud (75)
    const previousRank = prevRankById.get(metric.id);
    if (previousRank && leaderboardRank === previousRank && leaderboardRank >= 3 && metric.total >= 5) {
      const text = getRandomVariant(VARIANTS.stuck_in_mud({ metric, Rank: leaderboardRank, recentMatches: metric.total }), random);
      addCandidate(candidates, snapshot, {
        type: 'stuck_in_mud',
        title: '⛺ KẸT TRONG BÙN',
        group: 'fun',
        participantIds: [metric.id],
        rarity: 'uncommon',
        frequency: 'frequent',
        appearanceRate: 0.45,
        baseWeight: 35,
        evidenceStrength: evidence(metric.total),
        text,
      });
    }

    // quantity_over_quality (76)
    const ranksIdx = ranks.findIndex(m => m.id === metric.id);
    if (ranksIdx > 0) {
      const Rank_above = ranks[ranksIdx - 1];
      if (Rank_above && metric.wins === Rank_above.wins && metric.total > Rank_above.total && metric.total >= 10) {
        const text = getRandomVariant(VARIANTS.quantity_over_quality({ metric, Rank_above, wins: metric.wins }), random);
        addCandidate(candidates, snapshot, {
          type: 'quantity_over_quality',
          title: '📉 LẤY CÔNG BÙ THỦ',
          group: 'fun',
          participantIds: [metric.id, Rank_above.id],
          rarity: 'uncommon',
          frequency: 'occasional',
          baseWeight: 44,
          evidenceStrength: evidence(metric.total),
          text,
        });
      }
    }

    // vulture_win (77)
    if (leaderboardRank > 0 && leaderboardRank <= 3 && metric.wins >= 5 && ranks.length > 0) {
      const bottom1 = ranks[ranks.length - 1];
      if (bottom1) {
        const winsVsBottom1 = snapshot.rankingMatches.filter(m =>
          playerInMatch(m, metric.id) &&
          resultForPlayer(m, metric.id) === 'W' &&
          opponentIdsForPlayer(m, metric.id).includes(bottom1.id)
        ).length;
        const percent = Math.round((winsVsBottom1 / metric.wins) * 100);
        if (percent >= 50) {
          const text = getRandomVariant(VARIANTS.vulture_win({ metric, bottom1, percent }), random);
          addCandidate(candidates, snapshot, {
            type: 'vulture_win',
            title: '🦅 KỀN KỀN ĂN ĐIỂM',
            group: 'fun',
            participantIds: [metric.id, bottom1.id],
            rarity: 'uncommon',
            frequency: 'occasional',
            baseWeight: 45,
            evidenceStrength: evidence(metric.wins),
            surpriseScore: percent / 5,
            text,
          });
        }
      }
    }

    // money_blackhole (78)
    const activePlayersCount = active.length;
    if (leaderboardRank >= Math.max(5, activePlayersCount - 1) && metric.money === topFine?.money && metric.money > 0) {
      const text = getRandomVariant(VARIANTS.money_blackhole({ metric, topFine }), random);
      addCandidate(candidates, snapshot, {
        type: 'money_blackhole',
        title: '💸 HỐ ĐEN TÀI CHÍNH',
        group: 'fun',
        participantIds: [metric.id],
        rarity: 'uncommon',
        frequency: 'frequent',
        appearanceRate: 0.35,
        baseWeight: 38,
        evidenceStrength: evidence(metric.losses),
        text,
      });
    }

    // spring_jump (79)
    if (previousRank && previousRank >= Math.max(5, Math.round(activePlayersCount * 0.70)) && leaderboardRank <= 3) {
      const text = getRandomVariant(VARIANTS.spring_jump({ metric, Rank: leaderboardRank }), random);
      addCandidate(candidates, snapshot, {
        type: 'spring_jump',
        title: '🦘 CÚ NHẢY LÒ XO',
        group: 'fun',
        participantIds: [metric.id],
        rarity: 'rare',
        frequency: 'occasional',
        baseWeight: 52,
        evidenceStrength: 8,
        surpriseScore: (previousRank - leaderboardRank) * 2,
        text,
      });
    }

    // charity_top_rank (85)
    if (leaderboardRank === 1 && activePlayersCount > 0) {
      const bottomRankThreshold = Math.max(5, Math.round(activePlayersCount * 0.70));
      const bottomGroupIds = new Set(ranks.filter((_, idx) => (idx + 1) >= bottomRankThreshold).map(p => p.id));
      const playerMatches = sortNewest(snapshot.rankingMatches.filter(m => playerInMatch(m, metric.id)));
      const recent10 = playerMatches.slice(0, 10);
      const recentLossesVsBottomGroup = recent10.filter(m => {
        if (resultForPlayer(m, metric.id) !== 'L') return false;
        const opponents = opponentIdsForPlayer(m, metric.id);
        return opponents.some(opId => bottomGroupIds.has(opId));
      }).length;
      if (recentLossesVsBottomGroup >= 2) {
        const text = getRandomVariant(VARIANTS.charity_top_rank({ metric, recentLossesVsBottomGroup }), random);
        addCandidate(candidates, snapshot, {
          type: 'charity_top_rank',
          title: '🤝 ĐẠI SỨ THIỆN CHÍ',
          group: 'fun',
          participantIds: [metric.id],
          rarity: 'uncommon',
          frequency: 'occasional',
          baseWeight: 46,
          evidenceStrength: evidence(recentLossesVsBottomGroup),
          surpriseScore: recentLossesVsBottomGroup * 4,
          text,
        });
      }
    }

    // golden_victim (86)
    const goldenPickled = calculateGoldenPickles(snapshot, metric.id);
    if (goldenPickled >= 1) {
      const text = getRandomVariant(VARIANTS.golden_victim({ metric, goldenPickled }), random);
      addCandidate(candidates, snapshot, {
        type: 'golden_victim',
        title: '🥒 TRÁI DƯA CHUỘT VÀNG',
        group: 'fun',
        participantIds: [metric.id],
        rarity: 'rare',
        frequency: 'rare',
        baseWeight: 60,
        evidenceStrength: evidence(goldenPickled),
        surpriseScore: goldenPickled * 5,
        text,
      });
    }
  });

  if (topFine && topFine.money > 0) {
    const text = getRandomVariant(VARIANTS.fine_sponsor({ topFine }), random);
    addCandidate(candidates, snapshot, {
      type: 'fine_sponsor',
      title: '💸 NHÀ TÀI TRỢ VÀNG',
      group: 'fun',
      participantIds: [topFine.id],
      rarity: 'common',
      frequency: 'frequent',
      appearanceRate: 0.45,
      baseWeight: 36,
      evidenceStrength: evidence(topFine.losses),
      surpriseScore: topFine.losses,
      text,
    });
  }

  // attendance_king (84)
  const allDates = Array.from(new Set(snapshot.rankingMatches.map(m => matchDayKey(m))));
  const clubTotalDays = allDates.length;
  if (clubTotalDays >= 10) {
    const attendees = snapshot.visiblePlayers.map(p => {
      const pDates = Array.from(new Set(snapshot.rankingMatches.filter(m => playerInMatch(m, p.id)).map(m => matchDayKey(m))));
      return { id: p.id, name: p.name, uniqueDays: pDates.length };
    }).sort((a, b) => b.uniqueDays - a.uniqueDays);
    const topAttendee = attendees[0];
    const secondAttendee = attendees[1];
    const isAbsoluteRank1 = topAttendee && (!secondAttendee || topAttendee.uniqueDays > secondAttendee.uniqueDays);
    if (isAbsoluteRank1) {
      const percent = (topAttendee.uniqueDays / clubTotalDays) * 100;
      if (percent >= 90) {
        const attendeeMetric = snapshot.metrics.get(topAttendee.id);
        if (attendeeMetric) {
          const text = getRandomVariant(VARIANTS.attendance_king({ metric: attendeeMetric, percent }), random);
          addCandidate(candidates, snapshot, {
            type: 'attendance_king',
            title: '👑 VUA CHUYÊN CẦN',
            group: 'fun',
            participantIds: [topAttendee.id],
            rarity: 'uncommon',
            frequency: 'frequent',
            appearanceRate: 0.45,
            baseWeight: 42,
            evidenceStrength: 10,
            surpriseScore: percent / 10,
            text,
          });
        }
      }
    }
  }

  // triangle_paradox (81)
  const cycles = findTriangleCycles(snapshot);
  if (cycles.length > 0) {
    const cycle = cycles[0];
    const playerA = snapshot.metrics.get(cycle.A);
    const playerB = snapshot.metrics.get(cycle.B);
    const playerC = snapshot.metrics.get(cycle.C);
    if (playerA && playerB && playerC) {
      const text = getRandomVariant(VARIANTS.triangle_paradox({ A: playerA, B: playerB, C: playerC }), random);
      addCandidate(candidates, snapshot, {
        type: 'triangle_paradox',
        title: '🔺 TAM GIÁC NGHỊCH LÝ',
        group: 'fun',
        participantIds: [playerA.id, playerB.id, playerC.id],
        rarity: 'rare',
        frequency: 'rare',
        baseWeight: 58,
        evidenceStrength: 12,
        surpriseScore: cycle.totalMatches / 2,
        text,
      });
    }
  }
}

function selectionScore(candidate: InsightCandidate) {
  const raw = candidate.baseWeight
    + RARITY_SCORE[candidate.rarity]
    + candidate.evidenceStrength
    + candidate.surpriseScore
    - FREQUENCY_PENALTY[candidate.frequency];
  return raw * candidate.appearanceRate;
}

function selectInsights(candidates: InsightCandidate[], limit = 8, options: InsightSelectionOptions = {}, randomFn?: () => number): InsightSelectionResult {
  const random = randomFn || seededRandom(options.seed);
  const byType = new Map<string, InsightCandidate[]>();
  const state = normalizeSelectionState(options.selectionState);

  candidates.forEach(candidate => {
    byType.set(candidate.type, [...(byType.get(candidate.type) || []), candidate]);
  });

  byType.forEach((_candidatesForType, type) => {
    const typeState = state.get(type) || { eligibleMisses: 0, cooldownLoads: 0 };
    state.set(type, {
      ...typeState,
      cooldownLoads: Math.max(0, typeState.cooldownLoads - 1),
    });
  });

  const selected: InsightCandidate[] = [];
  const selectedTypes = new Set<string>();
  const groupCounts = new Map<string, number>();
  const presentTypes = [...byType.keys()].sort();

  while (selected.length < limit) {
    const remainingTypes = presentTypes.filter(type => !selectedTypes.has(type));
    if (remainingTypes.length === 0) break;

    const pickedType = weightedPick(remainingTypes, type => {
      const typeState = state.get(type) || { eligibleMisses: 0, cooldownLoads: 0 };
      if (typeState.cooldownLoads > 0) return 0;

      const typeCandidates = byType.get(type) || [];
      const scores = typeCandidates.map(candidate => selectionScore(candidate));
      const bestScore = Math.max(...scores);
      const avgScore = scores.reduce((sum, score) => sum + score, 0) / Math.max(1, scores.length);
      const group = semanticGroupFor(typeCandidates[0]);
      const groupCount = groupCounts.get(group) || 0;
      if (groupCount >= 2) return 0;

      const groupPenalty = groupCount === 1 ? 0.38 : 1;
      const priority = SEMANTIC_GROUP_PRIORITY[group] || 1;
      const pityBonus = Math.min(26, typeState.eligibleMisses * 3);
      const countBonus = Math.min(8, Math.log2(typeCandidates.length + 1) * 2);
      const scoreMix = (bestScore * 0.85) + (avgScore * 0.15);
      return Math.max(18, scoreMix + countBonus + pityBonus) * groupPenalty * priority;
    }, random);

    if (!pickedType) break;

    const typeCandidates = byType.get(pickedType) || [];
    const minScore = Math.min(...typeCandidates.map(candidate => selectionScore(candidate)));
    const pickedCandidate = weightedPick(typeCandidates, candidate => candidateSelectionWeight(candidate, minScore), random);
    if (!pickedCandidate) break;

    selected.push(pickedCandidate);
    selectedTypes.add(pickedType);
    const group = semanticGroupFor(pickedCandidate);
    groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
  }

  const now = Date.now();
  presentTypes.forEach(type => {
    const typeState = state.get(type) || { eligibleMisses: 0, cooldownLoads: 0 };
    if (selectedTypes.has(type)) {
      const index = selected.findIndex(candidate => candidate.type === type);
      state.set(type, {
        eligibleMisses: 0,
        cooldownLoads: Math.max(typeState.cooldownLoads, cooldownForPosition(index)),
        recentSeenCount: Math.min(20, (typeState.recentSeenCount || 0) + 1),
        lastSeenAt: now,
      });
      return;
    }

    if (typeState.cooldownLoads === 0) {
      state.set(type, {
        ...typeState,
        eligibleMisses: Math.min(20, typeState.eligibleMisses + 1),
      });
    }
  });

  return {
    insights: selected.map(candidate => ({
      type: candidate.type,
      title: candidate.title,
      text: candidate.text,
      playersInvolved: candidate.playersInvolved,
      rarity: candidate.rarity,
      weight: candidate.weight,
    })),
    nextSelectionState: serializeSelectionState(state),
  };
}

export function generateInsightCandidatesForDebug(snapshot: AnalysisSnapshot) {
  const random = seededRandom(42);
  const candidates: InsightCandidate[] = [];
  addFormAndEloCandidates(candidates, snapshot, random);
  addStoryCandidates(candidates, snapshot, random);
  addPartnerCandidates(candidates, snapshot, random);
  addScoreCandidates(candidates, snapshot, random);
  addOpponentCandidates(candidates, snapshot, random);
  addFunCandidates(candidates, snapshot, random);
  return candidates.map(candidate => ({
    type: candidate.type,
    title: candidate.title,
    group: candidate.group,
    participants: candidate.playersInvolved,
    rarity: candidate.rarity,
    frequency: candidate.frequency,
    semanticGroup: semanticGroupFor(candidate),
    selectionScore: Math.round(selectionScore(candidate)),
    text: candidate.text,
  }));
}

export function generateInsightSelectionResultFromSnapshot(snapshot: AnalysisSnapshot, options: InsightSelectionOptions = {}): InsightSelectionResult {
  const random = seededRandom(options.seed);
  const candidates: InsightCandidate[] = [];
  addFormAndEloCandidates(candidates, snapshot, random);
  addStoryCandidates(candidates, snapshot, random);
  addPartnerCandidates(candidates, snapshot, random);
  addScoreCandidates(candidates, snapshot, random);
  addOpponentCandidates(candidates, snapshot, random);
  addFunCandidates(candidates, snapshot, random);
  return selectInsights(candidates, 8, options, random);
}

export function generateInsightsFromSnapshot(snapshot: AnalysisSnapshot, options: InsightSelectionOptions = {}): Insight[] {
  return generateInsightSelectionResultFromSnapshot(snapshot, options).insights;
}

export function generateAdvancedInsights(
  _board: unknown[],
  _elo: unknown,
  matches: AnalysisMatch[],
  players: AnalysisPlayer[],
  _matchExpected: unknown
): Insight[] {
  void _board;
  void _elo;
  void _matchExpected;
  return generateInsightsFromSnapshot(buildAnalysisSnapshot(players, matches));
}
