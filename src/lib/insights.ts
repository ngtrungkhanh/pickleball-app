import {
  buildAnalysisSnapshot,
  type AnalysisEdge,
  type AnalysisMatch,
  type AnalysisPlayer,
  type AnalysisSnapshot,
  type PlayerMetrics,
} from './analysis-core';
import { isGuestId } from './guest';
import { applyLeaderboardEligibility } from './leaderboard-eligibility';

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
  /** Disable current absence claims when browsing a historical season. */
  includeAbsence?: boolean;
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

// Keep this aligned with candidate generation. Audit tooling imports it so
// Markdown does not become a second rule registry.
export const INSIGHT_RULE_TYPES = [
  'alternating_form',
  'anchor_drag',
  'attendance_king',
  'bad_duo',
  'bagel_loss',
  'balanced_rivalry',
  'balanced_tempo',
  'boss_hunter',
  'buffet_eater',
  'bully_lower_elo',
  'carry_partner',
  'casual_visitor',
  'chameleon_partner',
  'charity_top_rank',
  'close_loss',
  'clutch_master',
  'cold_streak',
  'cover_master',
  'defense_wall',
  'disaster_duo',
  'dominant_closer',
  'drama_magnet',
  'earthquake_victim',
  'elo_climber',
  'elo_defied',
  'elo_inflated',
  'elo_king',
  'experience_seeker',
  'fine_sponsor',
  'free_fall',
  'friendly_fire',
  'gatekeeper',
  'gatekeeper_boss',
  'giant_killer',
  'glass_cannon',
  'glued_pair',
  'golden_victim',
  'hard_counter',
  'heavy_backpack',
  'hot_seat_threat',
  'hot_streak',
  'iron_lung',
  'king_rescue',
  'last_laugh',
  'late_bloomer',
  'late_choker',
  'late_collapse',
  'long_game_addict',
  'long_game_rivalry',
  'low_score_magnet',
  'mental_block',
  'mercenary',
  'missing_player',
  'money_blackhole',
  'most_improved',
  'net_assassin',
  'parasite_win',
  'partner_boost',
  'partner_drag',
  'partner_long_games',
  'perfect_duo',
  'perfect_form5',
  'quantity_over_quality',
  'quick_finisher',
  'rank_camper',
  'rank_launchpad',
  'rank_leader',
  'rank_takeover',
  'rare_pair_hot',
  'revenge_target',
  'revenge_win',
  'score_bully',
  'spring_jump',
  'stable_partner',
  'steady_wall',
  'streak_breaker',
  'stubborn_loser',
  'stuck_in_mud',
  'sweet_matchup',
  'target_dummy',
  'top_attack',
  'top1_gap',
  'top1_time',
  'triangle_paradox',
  'undefeated_session',
  'unlucky_draw',
  'victim_strong_elo',
  'vulture_win',
  'zero_form5',
] as const;

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
  undefeated_session: 'form_streak',
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
  const time = matchTime(match);
  if (!time) return String(match.date || '').slice(0, 10);
  // Group sessions by the club's timezone, independently of the viewer's device.
  return new Date(time + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function formatDayKey(dayKey: string) {
  const parts = dayKey.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dayKey;
}

function latestSessionDate(snapshot: AnalysisSnapshot) {
  const match = snapshot.rankingMatches[0];
  return match ? formatDayKey(matchDayKey(match)) : '';
}

function playedLatestSession(snapshot: AnalysisSnapshot, playerId: string) {
  const latest = snapshot.rankingMatches[0];
  return Boolean(latest && snapshot.rankingMatches.some(match =>
    matchDayKey(match) === matchDayKey(latest) && playerInMatch(match, playerId)
  ));
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
  return results.slice(0, 8).map(result => result === 'W' ? 'T' : 'B').join('–');
}

function edgeRate(edge: AnalysisEdge) {
  return Math.round(edge.rate);
}

function eligibleRankBoard<T extends { name: string; total: number; wins: number; losses: number; winRate: number }>(rows: T[]) {
  const sorted = [...rows].sort((a, b) => b.winRate - a.winRate || b.wins - a.wins || a.losses - b.losses || a.name.localeCompare(b.name));
  // Include zero-match players when calculating the participation threshold,
  // just like Dashboard; only eligible players receive a numerical rank.
  return applyLeaderboardEligibility(sorted).filter(row => row.isEligible);
}

function rankBoard(snapshot: AnalysisSnapshot) {
  return eligibleRankBoard(snapshot.playerMetrics);
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
  return eligibleRankBoard(playerStats);
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
      return { id: player.id, name: player.name, total, wins, losses: total - wins, winRate };
    });
    const board = eligibleRankBoard(playerStats);
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
  const boardBefore = eligibleRankBoard(playerStatsBefore);
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

// Keep every variant factual; contexts are checked at each call site.
export const INSIGHT_TEXT_VARIANTS = {
  hot_streak: ({ metric }: { metric: PlayerMetrics }) => [
    `${metric.name} thắng ít nhất ${metric.streakCount} trận liên tiếp gần nhất, một chuỗi kết quả rất đẹp.`,
    `${metric.name} đang có mạch ít nhất ${metric.streakCount} trận thắng liên tiếp trong dữ liệu đang xem.`,
  ],
  cold_streak: ({ metric }: { metric: PlayerMetrics }) => [
    `${metric.name} thua ít nhất ${metric.streakCount} trận liên tiếp gần nhất, đang chờ một trận đổi nhịp.`,
    `Chuỗi kết quả gần nhất của ${metric.name} gồm ít nhất ${metric.streakCount} trận thua liên tiếp.`,
  ],
  elo_king: ({ topElo }: { topElo: PlayerMetrics }) => [
    `${topElo.name} dẫn đầu bảng ELO với ${round(topElo.rating)} điểm.`,
    `Ngôi đầu ELO đang thuộc về ${topElo.name}, ở mức ${round(topElo.rating)} điểm.`,
  ],
  giant_killer: ({ metric }: { metric: PlayerMetrics; }) => [
    `${metric.name} thắng ${metric.upsetWins} trận mà xác suất thắng của đội theo ELO trước trận dưới 30%.`,
    `Có ${metric.upsetWins} lần đội của ${metric.name} thắng dù ELO trước trận ước tính cơ hội dưới 30%.`,
  ],
  earthquake_victim: ({ metric }: { metric: PlayerMetrics }) => [
    `${metric.name} thua ${metric.upsetLosses} trận dù xác suất thắng của đội theo ELO trước trận trên 70%.`,
    `Đội của ${metric.name} có ${metric.upsetLosses} thất bại ở những trận được ELO đánh giá cơ hội thắng trên 70%.`,
  ],
  perfect_form5: ({ metric }: { metric: PlayerMetrics }) => [
    `${metric.name} thắng cả 5 trận gần nhất, trọn vẹn một bàn tay chiến thắng.`,
    `5 lần ra sân gần nhất của ${metric.name} đều khép lại bằng chiến thắng.`,
  ],
  zero_form5: ({ metric }: { metric: PlayerMetrics }) => [
    `${metric.name} thua cả 5 trận gần nhất, đang cần một kết quả tốt để đổi nhịp.`,
    `5 trận gần nhất của ${metric.name} đều là thất bại.`,
  ],
  gatekeeper: ({ metric }: { metric: PlayerMetrics }) => [
    `Sau ${metric.total} trận, ELO của ${metric.name} là ${round(metric.rating)}, gần mốc khởi đầu 1.500 điểm.`,
    `${metric.name} đã đánh ${metric.total} trận và hiện có ${round(metric.rating)} ELO, cách mốc 1.500 không quá 20 điểm.`,
  ],
  most_improved: ({ metric }: { metric: PlayerMetrics }) => [
    `${metric.name} tăng ${round(metric.recentEloDelta)} điểm ELO so với đầu tuần hiện tại.`,
    `So với đầu tuần hiện tại, ELO của ${metric.name} tăng thêm ${round(metric.recentEloDelta)} điểm.`,
  ],
  free_fall: ({ metric }: { metric: PlayerMetrics }) => [
    `${metric.name} giảm ${absRound(metric.recentEloDelta)} điểm ELO so với đầu tuần hiện tại.`,
    `So với đầu tuần hiện tại, ELO của ${metric.name} giảm ${absRound(metric.recentEloDelta)} điểm.`,
  ],
  streak_breaker: ({ player, target, X, breaker }: { player: AnalysisPlayer; target: AnalysisPlayer; X: number; breaker: { streak: number } }) => [
    `${player.name} từng thắng đội của ${target.name}, chấm dứt chuỗi ${breaker.streak} trận thắng của đối thủ.${X > 0 ? ` Sau đó, ${target.name} thua thêm ${X} trận liên tiếp.` : ""}`,
    `Chuỗi ${breaker.streak} trận thắng của ${target.name} dừng lại ở trận gặp đội của ${player.name}.${X > 0 ? ` Các trận tiếp theo ghi nhận thêm ${X} thất bại liên tiếp.` : ""}`,
  ],
  revenge_win: ({ player, opponent, Y, revenge }: { player: AnalysisPlayer; opponent: AnalysisPlayer; Y: number; revenge: { priorLosses: number } }) => [
    `${player.name} đã thắng đội của ${opponent.name} sau ${revenge.priorLosses} trận thua đối đầu liên tiếp.${Y > 0 ? ` Sau đó thắng thêm ${Y} trận đối đầu liên tiếp.` : ""}`,
    `Sau chuỗi ${revenge.priorLosses} lần thua khi gặp ${opponent.name}, ${player.name} đã có trận thắng giải hạn.${Y > 0 ? ` Mạch thắng đối đầu tiếp tục thêm ${Y} trận.` : ""}`,
  ],
  rank_leader: ({ topRank }: { topRank: PlayerMetrics; }) => [
    `${topRank.name} dẫn đầu BXH với ${topRank.wins}/${topRank.total} trận thắng, đạt ${round(topRank.winRate)}%.`,
    `Vị trí số 1 BXH thuộc về ${topRank.name}: thắng ${topRank.wins}/${topRank.total} trận (${round(topRank.winRate)}%).`,
  ],
  elo_climber: ({ metric, places, recentWins }: { metric: PlayerMetrics; places: number; recentWins: number }) => [
    `${metric.name} tăng ${places} bậc ELO so với đầu tuần hiện tại; kết quả 5 trận gần nhất là ${recentWins} thắng.`,
    `So với đầu tuần hiện tại, ${metric.name} lên ${places} bậc ELO. Trong 5 trận gần nhất, tay vợt này thắng ${recentWins} trận.`,
  ],
  perfect_duo: ({ edge }: { edge: AnalysisEdge; }) => [
    `${edge.playerName} và ${edge.otherName} thắng ${edge.wins}/${edge.total} trận chung đội, đạt ${edgeRate(edge)}%.`,
    `Cặp ${edge.playerName} – ${edge.otherName} có kết quả nổi bật: ${edge.wins}/${edge.total} trận thắng (${edgeRate(edge)}%).`,
  ],
  bad_duo: ({ edge }: { edge: AnalysisEdge; }) => [
    `${edge.playerName} và ${edge.otherName} mới thắng ${edge.wins}/${edge.total} trận khi đánh cùng nhau.`,
    `Kết quả chung đội của ${edge.playerName} và ${edge.otherName} là ${edge.wins}/${edge.total} trận thắng (${edgeRate(edge)}%).`,
  ],
  partner_boost: ({ edge }: { edge: AnalysisEdge; }) => [
    `${edge.playerName} thắng ${edge.wins}/${edge.total} trận khi đánh cùng ${edge.otherName}; kết quả sau khi xét kỳ vọng ELO tốt hơn mức chung của ${edge.playerName}.`,
    `Đánh cùng ${edge.otherName}, ${edge.playerName} có ${edge.wins}/${edge.total} trận thắng và kết quả so với kỳ vọng ELO tốt hơn mức chung.`,
  ],
  partner_drag: ({ edge }: { edge: AnalysisEdge; }) => [
    `${edge.playerName} thắng ${edge.wins}/${edge.total} trận cùng ${edge.otherName}; kết quả sau khi xét kỳ vọng ELO thấp hơn mức chung của ${edge.playerName}.`,
    `Khi ghép với ${edge.otherName}, ${edge.playerName} thắng ${edge.wins}/${edge.total} trận, với kết quả so với kỳ vọng ELO thấp hơn mức chung.`,
  ],
  cover_master: ({ metric }: { metric: PlayerMetrics }) => [
    `${metric.name} có chỉ số phối hợp ${round(metric.synergyScore)}/100, thuộc nhóm 2 người cao nhất; điểm đội ghi trung bình chưa thuộc nhóm 2 người dẫn đầu.`,
    `Điểm phối hợp của ${metric.name} đạt ${round(metric.synergyScore)}/100, thuộc nhóm đầu theo kết quả đánh cùng các đồng đội.`,
  ],
  carry_partner: ({ otherMetric, edge }: { otherMetric: PlayerMetrics; edge: AnalysisEdge; }) => [
    `${edge.otherName} thắng ${edgeRate(edge)}% khi đánh cùng ${edge.playerName} (${edge.wins}/${edge.total} trận), so với tỷ lệ chung ${round(otherMetric.winRate)}%.`,
    `Cặp ${edge.playerName} – ${edge.otherName} thắng ${edge.wins}/${edge.total} trận (${edgeRate(edge)}%); tỷ lệ thắng chung của ${edge.otherName} là ${round(otherMetric.winRate)}%.`,
  ],
  heavy_backpack: ({ otherMetric, edge }: { otherMetric: PlayerMetrics; edge: AnalysisEdge; }) => [
    `${edge.otherName} thắng ${edgeRate(edge)}% khi đánh cùng ${edge.playerName} (${edge.wins}/${edge.total} trận), thấp hơn tỷ lệ chung ${round(otherMetric.winRate)}%.`,
    `Kết quả cặp ${edge.playerName} – ${edge.otherName} là ${edge.wins}/${edge.total} trận thắng (${edgeRate(edge)}%), trong khi tỷ lệ chung của ${edge.otherName} là ${round(otherMetric.winRate)}%.`,
  ],
  stable_partner: ({ edge }: { edge: AnalysisEdge; }) => [
    `${edge.playerName} và ${edge.otherName} thắng ${edge.wins}/${edge.total} trận (${edgeRate(edge)}%); kết quả so với kỳ vọng ELO gần mức chung của cả hai.`,
    `Cặp ${edge.playerName} – ${edge.otherName} thắng ${edge.wins} trong ${edge.total} trận chung đội, với kết quả theo kỳ vọng ELO gần mức chung.`,
  ],
  glued_pair: ({ glued }: { glued: AnalysisEdge }) => [
    `${glued.playerName} và ${glued.otherName} thuộc nhóm cặp đánh chung nhiều nhất, với ${glued.total} trận.`,
    `Dính nhau như sam: ${glued.playerName} và ${glued.otherName} có ${glued.total} trận chung đội, thuộc nhóm nhiều nhất.`,
  ],
  rare_pair_hot: ({ edge }: { edge: AnalysisEdge; }) => [
    `${edge.playerName} và ${edge.otherName} thắng ${edge.wins}/${edge.total} trận chung đội; số trận còn ít so với các cặp khác.`,
    `Cặp ${edge.playerName} – ${edge.otherName} có ${edge.wins}/${edge.total} trận thắng (${edgeRate(edge)}%). Đây vẫn là mẫu ít trận.`,
  ],
  disaster_duo: ({ edge, avgLossDiff }: { edge: AnalysisEdge; avgLossDiff: number; }) => [
    `${edge.playerName} và ${edge.otherName} thắng ${edge.wins}/${edge.total} trận chung đội; các trận thua có cách biệt trung bình ${oneDecimal(avgLossDiff)} điểm.`,
    `Cặp ${edge.playerName} – ${edge.otherName} có ${edge.losses} trận thua, cách biệt trung bình ${oneDecimal(avgLossDiff)} điểm.`,
  ],
  partner_long_games: ({ edge }: { edge: AnalysisEdge }) => [
    `Cặp ${edge.playerName} – ${edge.otherName} có ${edge.deuceGames}/${edge.total} trận kết thúc với điểm đội thắng vượt mốc 11.`,
    `${edge.playerName} và ${edge.otherName} đã đánh cùng nhau ${edge.deuceGames} trận có điểm đội thắng trên 11.`,
  ],
  top_attack: ({ metric }: { metric: PlayerMetrics }) => [
    `Đội của ${metric.name} ghi trung bình ${oneDecimal(metric.avgPointsFor)} điểm/trận, cao nhất trong nhóm đã đánh ít nhất 8 trận.`,
    `${metric.name} dẫn nhóm có ít nhất 8 trận về điểm đội ghi trung bình: ${oneDecimal(metric.avgPointsFor)} điểm/trận.`,
  ],
  defense_wall: ({ metric }: { metric: PlayerMetrics }) => [
    `Đội của ${metric.name} để đối thủ ghi trung bình ${oneDecimal(metric.avgConceded)} điểm/trận, thuộc nhóm thấp nhất trong số người có ít nhất 8 trận.`,
    `Qua ${metric.total} trận, đội của ${metric.name} để đối phương ghi trung bình ${oneDecimal(metric.avgConceded)} điểm/trận.`,
  ],
  dominant_closer: ({ metric }: { metric: PlayerMetrics }) => [
    `${metric.name} có ${metric.dominantWins} trận thắng cách biệt từ 7 điểm trở lên.`,
    `Thắng là có khoảng cách: ${metric.name} đã thắng ${metric.dominantWins} trận với cách biệt ít nhất 7 điểm.`,
  ],
  close_loss: ({ metric }: { metric: PlayerMetrics }) => [
    `${metric.name} có ${metric.closeLosses} trận thua sát nút, cách biệt không quá 2 điểm.`,
    `${metric.closeLosses} thất bại của ${metric.name} kết thúc với cách biệt chỉ 1–2 điểm.`,
  ],
  long_game_addict: ({ metric }: { metric: PlayerMetrics }) => [
    `${metric.name} có ${metric.deuceMatches} trận với điểm đội thắng trên 11, nhiều nhất trong nhóm đã đánh ít nhất 8 trận.`,
    `Trong nhóm có ít nhất 8 trận, ${metric.name} dẫn đầu số trận vượt mốc 11 điểm ở đội thắng: ${metric.deuceMatches} trận.`,
  ],
  bagel_loss: ({ metric }: { metric: PlayerMetrics }) => [
    `Đội của ${metric.name} có ${metric.bagelLosses} trận thua chỉ ghi được không quá 2 điểm.`,
    `${metric.name} trải qua ${metric.bagelLosses} trận thua mà đội nhà ghi từ 0 đến 2 điểm.`,
  ],
  clutch_master: ({ metric, tightWinRate }: { metric: PlayerMetrics; tightWinRate: number }) => [
    `${metric.name} thắng ${metric.closeWins} trận sát nút, đạt ${round(tightWinRate)}% trong các trận cách biệt không quá 2 điểm.`,
    `Ở các trận cách biệt 1–2 điểm, ${metric.name} có ${metric.closeWins} chiến thắng, tỷ lệ thắng ${round(tightWinRate)}%.`,
  ],
  late_collapse: ({ metric }: { metric: PlayerMetrics }) => [
    `Trong các trận cách biệt không quá 2 điểm, ${metric.name} thắng ${metric.closeWins} và thua ${metric.closeLosses} trận.`,
    `${metric.name} có ${metric.closeLosses} thất bại và ${metric.closeWins} chiến thắng ở những trận sát nút, cách biệt 1–2 điểm.`,
  ],
  score_bully: ({ metric }: { metric: PlayerMetrics; }) => [
    `Các trận thắng của ${metric.name} có cách biệt trung bình ${oneDecimal(metric.avgWinDiff)} điểm, cao nhất nhóm có ít nhất 8 trận và 5 chiến thắng.`,
    `${metric.name} dẫn nhóm có ít nhất 8 trận và 5 chiến thắng về cách biệt thắng trung bình: ${oneDecimal(metric.avgWinDiff)} điểm.`,
  ],
  low_score_magnet: ({ metric }: { metric: PlayerMetrics }) => [
    `Đội của ${metric.name} có ${metric.lowScoreLosses} trận thua chỉ ghi được không quá 4 điểm.`,
    `${metric.name} có ${metric.lowScoreLosses} thất bại mà đội nhà ghi từ 0 đến 4 điểm.`,
  ],
  hard_counter: ({ edge }: { edge: AnalysisEdge; }) => [
    `${edge.playerName} thắng ${edge.wins}/${edge.total} trận khi hai người ở khác đội với ${edge.otherName}.`,
    `Đối đầu có duyên: ${edge.playerName} thắng đội của ${edge.otherName} ${edge.wins}/${edge.total} lần gặp.`,
  ],
  target_dummy: ({ edge }: { edge: AnalysisEdge; }) => [
    `${edge.playerName} thua ${edge.losses}/${edge.total} trận khi gặp đội của ${edge.otherName}.`,
    `Kèo đối đầu chưa thuận: ${edge.playerName} mới thắng ${edge.wins}/${edge.total} trận trước đội của ${edge.otherName}.`,
  ],
  balanced_rivalry: ({ mostRepeated }: { mostRepeated: AnalysisEdge; }) => [
    `${mostRepeated.playerName} và ${mostRepeated.otherName} có thành tích đối đầu khá cân bằng: ${mostRepeated.wins}–${mostRepeated.losses} sau ${mostRepeated.total} trận.`,
    `Kèo đấu qua lại: ${mostRepeated.playerName} thắng ${mostRepeated.wins}, thua ${mostRepeated.losses} trận khi gặp đội của ${mostRepeated.otherName}.`,
  ],
  long_game_rivalry: ({ edge }: { edge: AnalysisEdge }) => [
    `Các trận khác đội giữa ${edge.playerName} và ${edge.otherName} có ${edge.deuceGames} lần kết thúc với điểm đội thắng trên 11.`,
    `${edge.playerName} và ${edge.otherName} đã đối đầu ${edge.deuceGames} trận có điểm đội thắng vượt mốc 11.`,
  ],
  boss_hunter: ({ metric, kingWins, kingName }: { metric: PlayerMetrics; kingWins: number; kingName: string }) => [
    `${metric.name} có ${kingWins} trận thắng trước đội của ${kingName}, người hiện dẫn đầu ELO trong phạm vi đang xem.`,
    `${metric.name} từng thắng đội của ${kingName} ${kingWins} lần; ${kingName} hiện giữ ngôi đầu ELO.`,
  ],
  mental_block: ({ edge }: { edge: AnalysisEdge; }) => [
    `${edge.playerName} thắng ${edge.wins}/${edge.total} trận trước đội của ${edge.otherName}; kết quả sau khi xét kỳ vọng ELO thấp hơn mức chung của ${edge.playerName}.`,
    `Gặp đội của ${edge.otherName}, ${edge.playerName} có ${edge.wins}/${edge.total} trận thắng, với kết quả theo kỳ vọng ELO thấp hơn mức chung.`,
  ],
  sweet_matchup: ({ edge }: { edge: AnalysisEdge; }) => [
    `${edge.playerName} thắng ${edge.wins}/${edge.total} trận trước đội của ${edge.otherName}; kết quả sau khi xét kỳ vọng ELO tốt hơn mức chung của ${edge.playerName}.`,
    `Gặp đội của ${edge.otherName}, ${edge.playerName} có ${edge.wins}/${edge.total} trận thắng và kết quả theo kỳ vọng ELO tốt hơn mức chung.`,
  ],
  bully_lower_elo: ({ metric }: { metric: PlayerMetrics }) => [
    `${metric.name} thắng ${metric.winsVsLowerElo}/${metric.totalVsLowerElo} trận gặp đội có ELO trước trận thấp hơn đội mình.`,
    `Khi đội mình có ELO trước trận cao hơn đối phương, ${metric.name} thắng ${metric.winsVsLowerElo}/${metric.totalVsLowerElo} trận.`,
  ],
  victim_strong_elo: ({ metric }: { metric: PlayerMetrics }) => [
    `${metric.name} thua ${metric.lossesVsHigherElo}/${metric.totalVsHigherElo} trận gặp đội có ELO trước trận cao hơn đội mình.`,
    `Khi đội mình có ELO trước trận thấp hơn đối phương, ${metric.name} thua ${metric.lossesVsHigherElo}/${metric.totalVsHigherElo} trận.`,
  ],
  revenge_target: ({ player, opponent, revenge }: { player: AnalysisPlayer; opponent: AnalysisPlayer; revenge: { recentWins: number; recentTotal: number } }) => [
    `${player.name} thắng ${revenge.recentWins}/${revenge.recentTotal} trận đối đầu gần nhất với ${opponent.name}, sau khi từng có chuỗi thua trước đối thủ này.`,
    `Kèo cũ đổi nhịp: ${player.name} có ${revenge.recentWins} chiến thắng trong ${revenge.recentTotal} lần gần nhất gặp đội của ${opponent.name}.`,
  ],
  iron_lung: ({ metric }: { metric: PlayerMetrics }) => [
    `${metric.name} ra sân nhiều nhất trong phạm vi đang xem, với ${metric.total} trận.`,
    `Danh hiệu chăm ra sân gọi tên ${metric.name}: ${metric.total} trận, nhiều nhất nhóm.`,
  ],
  missing_player: ({ metric }: { metric: PlayerMetrics }) => [
    `Đã ${metric.daysAbsent} ngày kể từ trận gần nhất được ghi nhận của ${metric.name} trong phạm vi đang xem.`,
    `${metric.name} chưa có trận mới được ghi nhận trong ${metric.daysAbsent} ngày qua ở phạm vi đang xem.`,
  ],
  mercenary: ({ metric }: { metric: PlayerMetrics; }) => [
    `${metric.name} thắng ${metric.wins}/${metric.total} trận (${round(metric.winRate)}%); số trận còn ít nên cần thêm dữ liệu.`,
    `Ít trận nhưng kết quả đẹp: ${metric.name} thắng ${metric.wins}/${metric.total} trận. Cần thêm trận để đánh giá ổn định hơn.`,
  ],
  alternating_form: ({ metric }: { metric: PlayerMetrics }) => [
    `Kết quả gần đây của ${metric.name} thường đổi chiều: ${pattern(metric.recentResults)} (T: thắng, B: bại; mới nhất trước).`,
    `${metric.name} có chuỗi kết quả ${pattern(metric.recentResults)}, xếp từ mới đến cũ (T: thắng, B: bại), với nhiều lần đổi giữa thắng và thua.`,
  ],
  fine_sponsor: ({ topFine }: { topFine: PlayerMetrics }) => [
    `Tiền phạt được tính cho ${topFine.name} là ${topFine.money.toLocaleString("vi-VN")}đ, cao nhất trong phạm vi đang xem.`,
    `${topFine.name} dẫn nhóm về tiền phạt được tính: ${topFine.money.toLocaleString("vi-VN")}đ.`,
  ],
  experience_seeker: ({ metric }: { metric: PlayerMetrics; }) => [
    `${metric.name} đã ra sân ${metric.total} trận, thắng ${metric.wins} trận (${round(metric.winRate)}%).`,
    `Chăm cọ xát: ${metric.name} tích lũy ${metric.total} trận, với ${metric.wins} chiến thắng.`,
  ],
  casual_visitor: ({ metric }: { metric: PlayerMetrics }) => [
    `${metric.name} có ${metric.total} trận được ghi nhận, ít hơn mặt bằng chung trong phạm vi đang xem.`,
    `Số trận của ${metric.name} còn khá ít so với nhóm: ${metric.total} trận.`,
  ],
  rank_camper: ({ metric, leaderboardRank, avgMatches }: { metric: PlayerMetrics; leaderboardRank: number; avgMatches: number }) => [
    `${metric.name} đứng hạng ${leaderboardRank} với ${metric.total} trận; trung bình nhóm đã ra sân ${round(avgMatches)} trận.`,
    `Ít trận vẫn có thứ hạng tốt: ${metric.name} xếp thứ ${leaderboardRank}, đã đánh ${metric.total} trận so với trung bình ${round(avgMatches)} trận.`,
  ],
  elo_inflated: ({ metric, leaderboardRank, eloRank }: { metric: PlayerMetrics; leaderboardRank: number; eloRank: number }) => [
    `${metric.name} xếp thứ ${eloRank} theo ELO và thứ ${leaderboardRank} trên BXH tỷ lệ thắng.`,
    `Hai góc nhìn xếp hạng của ${metric.name}: ELO thứ ${eloRank}, BXH tỷ lệ thắng thứ ${leaderboardRank}.`,
  ],
  elo_defied: ({ metric, leaderboardRank, eloRank }: { metric: PlayerMetrics; leaderboardRank: number; eloRank: number }) => [
    `${metric.name} đứng thứ ${leaderboardRank} trên BXH tỷ lệ thắng, trong khi xếp thứ ${eloRank} theo ELO.`,
    `BXH tỷ lệ thắng của ${metric.name} là hạng ${leaderboardRank}; vị trí theo ELO là hạng ${eloRank}.`,
  ],
  top1_gap: ({ topRank, gapText }: { topRank: PlayerMetrics; gapText: string }) => [
    `${topRank.name} dẫn đầu BXH, hơn người thứ hai ${gapText}.`,
    `So với người thứ hai, ${topRank.name} đang có nhiều hơn ${gapText} và giữ vị trí đầu BXH.`,
  ],
  late_bloomer: ({ metric, recentWins }: { metric: PlayerMetrics; recentWins: number }) => [
    `${metric.name} thắng ${recentWins}/5 trận gần nhất, trong khi tỷ lệ thắng chung là ${round(metric.winRate)}%.`,
    `Kết quả gần đây khởi sắc: ${metric.name} thắng ${recentWins}/5 trận, cao hơn tỷ lệ chung ${round(metric.winRate)}%.`,
  ],
  late_choker: ({ metric, leaderboardRank, recentLosses }: { metric: PlayerMetrics; leaderboardRank: number; recentLosses: number }) => [
    `${metric.name} đang hạng ${leaderboardRank} BXH nhưng thua ${recentLosses}/5 trận gần nhất.`,
    `Nhịp gần đây chưa thuận: ${metric.name} thua ${recentLosses} trong 5 trận mới nhất, hiện đứng hạng ${leaderboardRank}.`,
  ],
  drama_magnet: ({ metric, tightMatches }: { metric: PlayerMetrics; tightMatches: number }) => [
    `${metric.name} có ${tightMatches}/${metric.total} trận cách biệt không quá 3 điểm hoặc có điểm đội thắng trên 11.`,
    `Trong ${metric.total} trận của ${metric.name}, có ${tightMatches} trận sát điểm (cách biệt tối đa 3) hoặc vượt mốc 11 ở đội thắng.`,
  ],
  glass_cannon: ({ metric, leaderboardRank }: { metric: PlayerMetrics; leaderboardRank: number }) => [
    `${metric.name} đang hạng ${leaderboardRank}; các trận thua có cách biệt trung bình ${oneDecimal(metric.avgLossDiff)} điểm.`,
    `Giữ hạng ${leaderboardRank} BXH, ${metric.name} có cách biệt thua trung bình ${oneDecimal(metric.avgLossDiff)} điểm.`,
  ],
  stubborn_loser: ({ metric }: { metric: PlayerMetrics; }) => [
    `${metric.name} thuộc nhóm cuối trong số người đủ điều kiện xếp hạng; các trận thua có cách biệt trung bình ${oneDecimal(metric.avgLossDiff)} điểm.`,
    `Cách biệt thua trung bình của ${metric.name} là ${oneDecimal(metric.avgLossDiff)} điểm, dù đang ở nhóm cuối BXH đủ điều kiện.`,
  ],
  rank_launchpad: ({ metric, launchpadEdge, leaderboardRank }: { metric: PlayerMetrics; launchpadEdge: AnalysisEdge; leaderboardRank: number; }) => [
    `${metric.name} đang hạng ${leaderboardRank} và có ${launchpadEdge.wins}/${launchpadEdge.total} trận thắng trước đội của ${launchpadEdge.otherName}.`,
    `Trong thành tích của ${metric.name} (hạng ${leaderboardRank}), có ${launchpadEdge.wins} chiến thắng qua ${launchpadEdge.total} trận gặp đội của ${launchpadEdge.otherName}.`,
  ],
  hot_seat_threat: ({ metric, playerAbove, diff }: { metric: PlayerMetrics; playerAbove: PlayerMetrics; diff: number }) => [
    `${metric.name} xếp ngay sau ${playerAbove.name}, với tỷ lệ thắng kém ${oneDecimal(diff)} điểm phần trăm.`,
    `Khoảng cách tỷ lệ thắng giữa ${metric.name} và người xếp ngay trên là ${playerAbove.name} chỉ ${oneDecimal(diff)} điểm phần trăm.`,
  ],
  buffet_eater: ({ metric, attendance }: { metric: PlayerMetrics; attendance: { matchesPerSession: number } }) => [
    `${metric.name} có ít ngày ra sân hơn trung bình nhóm, nhưng đánh trung bình ${oneDecimal(attendance.matchesPerSession)} trận mỗi ngày có thi đấu.`,
    `Mỗi ngày có trận được ghi nhận, ${metric.name} đánh trung bình ${oneDecimal(attendance.matchesPerSession)} trận; số ngày ra sân thấp hơn trung bình nhóm.`,
  ],
  king_rescue: ({ player, partner, row }: { player: AnalysisPlayer; partner: AnalysisPlayer; row: { priorStreak: number } }) => [
    `${player.name} từng chấm dứt chuỗi ${row.priorStreak} trận thua bằng một chiến thắng khi đánh cùng ${partner.name}.`,
    `Một trận chung đội với ${partner.name} đã khép lại mạch ${row.priorStreak} thất bại liên tiếp của ${player.name}.`,
  ],
  anchor_drag: ({ player, partner, row }: { player: AnalysisPlayer; partner: AnalysisPlayer; row: { priorStreak: number } }) => [
    `Chuỗi ${row.priorStreak} trận thắng của ${player.name} từng dừng lại ở một trận thua khi đánh cùng ${partner.name}.`,
    `${player.name} và ${partner.name} từng thua trận đánh dấu kết thúc chuỗi ${row.priorStreak} chiến thắng của ${player.name}.`,
  ],
  parasite_win: ({ edge, winShareFromPartner, winRateWithoutPartner, winsWithoutPartner, totalWithoutPartner }: { edge: AnalysisEdge; winShareFromPartner: number; winRateWithoutPartner: number; winsWithoutPartner: number; totalWithoutPartner: number; }) => [
    `${round(winShareFromPartner * 100)}% số trận thắng của ${edge.playerName} đến từ các trận đánh cùng ${edge.otherName} (${edge.wins}/${edge.total} trận thắng). Khi đánh cùng người khác: ${winsWithoutPartner}/${totalWithoutPartner} trận thắng (${winRateWithoutPartner}%).`,
    `${edge.playerName} thắng ${edge.wins}/${edge.total} trận cùng ${edge.otherName}, so với ${winsWithoutPartner}/${totalWithoutPartner} trận khi ghép với người khác.`,
  ],
  gatekeeper_boss: ({ metric, edge, leaderboardRank, targetRank }: { metric: PlayerMetrics; edge: AnalysisEdge; leaderboardRank: number; targetRank: number; }) => [
    `${metric.name} đứng hạng ${leaderboardRank} nhưng thắng ${edge.wins}/${edge.total} trận trước đội của ${edge.otherName}, người hiện ở hạng ${targetRank}.`,
    `Kèo đối đầu đáng chú ý: ${metric.name} (hạng ${leaderboardRank}) thắng đội của ${edge.otherName} (hạng ${targetRank}) ${edge.wins}/${edge.total} lần.`,
  ],
  unlucky_draw: ({ metric, bottom1, partnerMatches, bottomPartnerMatches }: { metric: PlayerMetrics; bottom1: PlayerMetrics; partnerMatches: AnalysisMatch[]; bottomPartnerMatches: AnalysisMatch[] }) => [
    `${metric.name} có ${bottomPartnerMatches.length}/${partnerMatches.length} trận đánh cùng ${bottom1.name}, người hiện xếp cuối nhóm đủ điều kiện trên BXH.`,
    `${bottomPartnerMatches.length} trong ${partnerMatches.length} trận của ${metric.name} là chung đội với ${bottom1.name}, người đang cuối BXH đủ điều kiện.`,
  ],
  friendly_fire: ({ edge, partnerEdge }: { edge: AnalysisEdge; partnerEdge: AnalysisEdge; }) => [
    `${edge.playerName} và ${edge.otherName} thắng ${partnerEdge.wins}/${partnerEdge.total} trận chung đội; khi khác đội, ${edge.playerName} thắng ${edge.wins}/${edge.total} trận.`,
    `Chung đội có ${partnerEdge.wins}/${partnerEdge.total} chiến thắng; đối đầu nhau, ${edge.playerName} thắng ${edge.otherName} ${edge.wins}/${edge.total} lần.`,
  ],
  rank_takeover: ({ playerB, playerA, newRank, sessionDate }: { playerB: AnalysisPlayer; playerA: AnalysisPlayer; newRank: number; sessionDate: string }) => [
    `Sau trận mới nhất trong dữ liệu ngày ${sessionDate}, ${playerB.name} vượt ${playerA.name} và lên hạng ${newRank} BXH.`,
    `Trận mới nhất được ghi nhận ngày ${sessionDate} đưa ${playerB.name} lên hạng ${newRank}, vượt qua ${playerA.name}.`,
  ],
  top1_time: ({ metric, daysAtTop1, sessionDate }: { metric: PlayerMetrics; daysAtTop1: number; sessionDate: string }) => [
    `Tính đến ${sessionDate}, ${metric.name} giữ ngôi đầu ở các mốc chốt ngày trong khoảng ${daysAtTop1} ngày.`,
    `${metric.name} đứng đầu ở các mốc chốt ngày suốt khoảng ${daysAtTop1} ngày, tính đến ngày có trận mới nhất ${sessionDate}.`,
  ],
  stuck_in_mud: ({ metric, Rank, sessionDate }: { metric: PlayerMetrics; Rank: number; sessionDate: string }) => [
    `Sau buổi đấu ngày ${sessionDate}, ${metric.name} vẫn giữ hạng ${Rank}, bằng vị trí trước buổi đấu.`,
    `${metric.name} có thi đấu ngày ${sessionDate} nhưng hạng sau buổi vẫn là ${Rank}, không đổi so với trước buổi.`,
  ],
  quantity_over_quality: ({ metric, Rank_above, wins }: { metric: PlayerMetrics; Rank_above: PlayerMetrics; wins: number }) => [
    `${metric.name} và ${Rank_above.name} cùng có ${wins} trận thắng, nhưng ${metric.name} thua nhiều hơn nên có tỷ lệ thắng thấp hơn và xếp sau.`,
    `Cùng ${wins} chiến thắng như ${Rank_above.name}, ${metric.name} xếp dưới vì đánh nhiều trận hơn và có tỷ lệ thắng thấp hơn.`,
  ],
  vulture_win: ({ metric, bottom1, leaderboardRank, percent }: { metric: PlayerMetrics; bottom1: PlayerMetrics; leaderboardRank: number; percent: number }) => [
    `${percent}% số trận thắng của ${metric.name} (hạng ${leaderboardRank}) là trước đội của ${bottom1.name}, người hiện cuối nhóm đủ điều kiện xếp hạng.`,
    `${metric.name} đang hạng ${leaderboardRank}; ${percent}% chiến thắng là khi gặp đội của ${bottom1.name}, người đang cuối BXH đủ điều kiện.`,
  ],
  money_blackhole: ({ metric }: { metric: PlayerMetrics }) => [
    `${metric.name} thuộc nhóm cuối BXH đủ điều kiện và có tiền phạt được tính cao nhất: ${metric.money.toLocaleString("vi-VN")}đ.`,
    `Tiền phạt được tính của ${metric.name} là ${metric.money.toLocaleString("vi-VN")}đ, cao nhất nhóm; vị trí hiện tại thuộc nhóm cuối BXH đủ điều kiện.`,
  ],
  spring_jump: ({ metric, Rank, sessionDate }: { metric: PlayerMetrics; Rank: number; sessionDate: string }) => [
    `Sau buổi đấu ngày ${sessionDate}, ${metric.name} từ nhóm cuối BXH đủ điều kiện vươn lên hạng ${Rank}.`,
    `${metric.name} lên hạng ${Rank} sau buổi đấu ngày ${sessionDate}, cải thiện từ nhóm cuối trước buổi.`,
  ],
  last_laugh: ({ metric, sessionTotal, sessionDate }: { metric: PlayerMetrics; sessionTotal: number; sessionDate: string }) => [
    `Ngày ${sessionDate}, ${metric.name} thua ${sessionTotal - 1} trận đầu rồi thắng trận cuối được ghi nhận trong ngày.`,
    `Một trận đổi nhịp: ngày ${sessionDate}, ${metric.name} thắng trận cuối sau ${sessionTotal - 1} thất bại liên tiếp đầu ngày.`,
  ],
  undefeated_session: ({ metric, perfectSessionCount, latestPerfectSessionTotal, bestPerfectSessionTotal, latestPerfectSessionDate, bestPerfectSessionDate }: { metric: PlayerMetrics; perfectSessionCount: number; latestPerfectSessionTotal: number; bestPerfectSessionTotal: number; latestPerfectSessionDate: string; bestPerfectSessionDate: string }) => [
    `${metric.name} có ${perfectSessionCount} ngày toàn thắng với ít nhất 3 trận/ngày; gần nhất là ${latestPerfectSessionDate}, thắng ${latestPerfectSessionTotal}/${latestPerfectSessionTotal} trận.`,
    `Ngày toàn thắng nhiều trận nhất của ${metric.name} là ${bestPerfectSessionDate}, với ${bestPerfectSessionTotal} chiến thắng. Tổng cộng có ${perfectSessionCount} ngày toàn thắng từ 3 trận trở lên.`,
  ],
  triangle_paradox: ({ A, B, C }: { A: PlayerMetrics; B: PlayerMetrics; C: PlayerMetrics }) => [
    `Đối đầu thành vòng: ${A.name} có lợi thế trước ${B.name}, ${B.name} trước ${C.name}, còn ${C.name} trước ${A.name}; mỗi chiều đều thắng ít nhất 60% qua tối thiểu 4 trận.`,
    `Một vòng kèo thú vị: ${A.name} → ${B.name} → ${C.name} → ${A.name}. Mỗi người thắng ít nhất 60% số trận gặp người kế tiếp, với ít nhất 4 lần đối đầu.`,
  ],
  chameleon_partner: ({ metric, count, sessionDate }: { metric: PlayerMetrics; count: number; sessionDate: string }) => [
    `Trong 7 ngày tính đến ${sessionDate}, ${metric.name} đạt tỷ lệ thắng từ 55% khi đánh cùng ${count} đồng đội khác nhau; mỗi cặp có ít nhất 3 trận.`,
    `${metric.name} có ${count} đồng đội mà khi ghép cặp đạt từ 55% trận thắng (ít nhất 3 trận/cặp), trong 7 ngày tính đến ${sessionDate}.`,
  ],
  quick_finisher: ({ metric, count, sessionDate }: { metric: PlayerMetrics; count: number; sessionDate: string }) => [
    `Trong 7 ngày tính đến ${sessionDate}, cả ${count} trận của ${metric.name} đều có điểm đội thắng không quá 11.`,
    `${metric.name} đánh ${count} trận trong 7 ngày tính đến ${sessionDate}; không trận nào có điểm đội thắng vượt 11.`,
  ],
  attendance_king: ({ metric, percent }: { metric: PlayerMetrics; percent: number }) => [
    `${metric.name} góp mặt trong ${round(percent)}% số ngày có trận được ghi nhận, cao nhất nhóm đang xem.`,
    `Dẫn đầu chuyên cần: ${metric.name} có trận trong ${round(percent)}% số ngày thi đấu được ghi nhận.`,
  ],
  charity_top_rank: ({ metric, bottom1, recentLossesVsBottom1 }: { metric: PlayerMetrics; bottom1: PlayerMetrics; recentLossesVsBottom1: number }) => [
    `${metric.name} hiện dẫn đầu BXH nhưng thua ${recentLossesVsBottom1} trận trước đội của ${bottom1.name} trong tối đa 10 trận gần nhất; ${bottom1.name} hiện cuối nhóm đủ điều kiện.`,
    `Trong tối đa 10 trận gần nhất, ${metric.name} thua đội của ${bottom1.name} ${recentLossesVsBottom1} lần. Hiện hai người đứng đầu và cuối BXH đủ điều kiện.`,
  ],
  golden_victim: ({ metric, goldenPickled }: { metric: PlayerMetrics; goldenPickled: number }) => [
    `${metric.name} có ${goldenPickled} trận thua mà đội nhà không ghi được điểm nào.`,
    `Dữ liệu đang xem ghi nhận ${goldenPickled} lần đội của ${metric.name} thua với 0 điểm.`,
  ],
};

const VARIANTS = INSIGHT_TEXT_VARIANTS;

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
    const text = getRandomVariant(VARIANTS.elo_king({ topElo }), random);
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
      const gapText = winsGap >= 5 ? `${winsGap} trận thắng` : `${oneDecimal(winRateGap)} điểm phần trăm tỷ lệ thắng`;
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

    if (metric.streakType === 'W' && metric.streakCount >= 6) {
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
        title: '🚀 5 TRẬN TOÀN THẮNG',
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
        title: '🫠 5 TRẬN TOÀN THUA',
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

    if (leaderboardRank > 0 && leaderboardRank <= 2 && metric.total >= 5 && metric.total < avgMatches * 0.7) {
      const text = getRandomVariant(VARIANTS.rank_camper({ metric, leaderboardRank, avgMatches }), random);
      addCandidate(candidates, snapshot, {
        type: 'rank_camper',
        title: '⛺ ÍT TRẬN, HẠNG CAO',
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
        title: '🎈 HAI GÓC XẾP HẠNG',
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
        title: '🧱 BXH VÀ ELO',
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
        title: '🌱 NHỊP MỚI KHỞI SẮC',
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

    if (leaderboardRank > 0 && leaderboardRank <= 2 && metric.total >= 8 && metric.formScore <= 20 && recentTotal >= 5) {
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
    if (places >= 2 && recentWins >= 3 && recentTotal === 5) {
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

    // Radar summaries need at least 5 matches; scores do not identify a playing style.
    if (metric.total >= 5) {
      const attack = Math.round(metric.attackScore);
      const defense = Math.round(metric.defenseScore);

      if (attack >= 65 && defense < 65) {
        const texts = [
          `${metric.name} có điểm Công ${attack}/100 và Thủ ${defense}/100 trên radar, tính từ tỷ số các trận đôi.`,
          `Radar của ${metric.name} nghiêng về Công: ${attack}/100, so với Thủ ${defense}/100. Đây là chỉ số từ kết quả đội.`,
        ];
        addCandidate(candidates, snapshot, {
          type: 'net_assassin',
          title: '🏹 RADAR NGHIÊNG CÔNG',
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
          `${metric.name} có điểm Thủ ${defense}/100 và Công ${attack}/100 trên radar, tính từ tỷ số các trận đôi.`,
          `Radar của ${metric.name} nghiêng về Thủ: ${defense}/100, so với Công ${attack}/100. Đây là chỉ số từ kết quả đội.`,
        ];
        addCandidate(candidates, snapshot, {
          type: 'steady_wall',
          title: '🧱 RADAR NGHIÊNG THỦ',
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
          `Radar của ${metric.name} ghi nhận Công ${attack}/100 và Thủ ${defense}/100, tính từ tỷ số các trận đôi.`,
          `${metric.name} có chỉ số Công ${attack}/100, Thủ ${defense}/100 theo kết quả đội trong phạm vi đang xem.`,
        ];
        addCandidate(candidates, snapshot, {
          type: 'balanced_tempo',
          title: '🔵 GÓC NHÌN RADAR',
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
        const text = getRandomVariant(VARIANTS.streak_breaker({ player, target, breaker, X: X_val }), random);
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
      title: '⚓ ĐỨT MẠCH THẮNG',
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
    const textRevenge = getRandomVariant(VARIANTS.revenge_win({ player: bestRevenge.player, opponent: bestRevenge.opponent, revenge: { priorLosses: bestRevenge.priorLosses }, Y: bestRevenge.Y }), random);

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
      const textTarget = getRandomVariant(VARIANTS.revenge_target({ player: bestRevenge.player, opponent: bestRevenge.opponent, revenge: { recentWins: bestRevenge.recentWins, recentTotal: bestRevenge.recentTotal } }), random);

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
      const text = getRandomVariant(VARIANTS.rank_takeover({ playerB, playerA, newRank: takeover.newRank, sessionDate: latestSessionDate(snapshot) }), random);
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
  const ranks = rankBoard(snapshot);
  const rankById = new Map(ranks.map((metric, index) => [metric.id, index + 1]));
  const bottom1 = ranks[ranks.length - 1];
  const active = snapshot.playerMetrics.filter(metric => metric.total > 0);
  const avgPairTotal = snapshot.partnerEdges.length > 0 ? average(snapshot.partnerEdges.map(e => e.total)) : 0;

  pairEdges.forEach(({ edge, maxAbsImpact }) => {

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
        title: '🪨 CẶP CHƯA VÀO GUỒNG',
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
        title: '🏋️ CẶP CÓ ĐÀ THẮNG',
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
        title: '🎒 CẶP KHÓ KIẾM THẮNG',
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
    if (!playerMetric || playerMetric.wins <= 0 || otherRank < 1 || otherRank > 2) return;

    const matchesWithoutPartner = snapshot.rankingMatches.filter(match =>
      playerInMatch(match, edge.playerId) && partnerIdForPlayer(match, edge.playerId) !== edge.otherId
    );
    const winsWithoutPartner = matchesWithoutPartner.filter(match => resultForPlayer(match, edge.playerId) === 'W').length;
    const winRateWithoutPartner = rate(winsWithoutPartner, matchesWithoutPartner.length);
    const winShareFromPartner = edge.wins / playerMetric.wins;

    if (edge.wins >= 4 && winShareFromPartner >= 0.6 && matchesWithoutPartner.length >= 3 && winRateWithoutPartner < 30) {
      const text = getRandomVariant(VARIANTS.parasite_win({ edge, winShareFromPartner, winRateWithoutPartner, winsWithoutPartner, totalWithoutPartner: matchesWithoutPartner.length }), random);
      addCandidate(candidates, snapshot, {
        type: 'parasite_win',
        title: '🧲 ĐỐI TÁC THÂN QUEN',
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
    const text = getRandomVariant(VARIANTS.glued_pair({ glued }), random);
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
      return Boolean(partnerId && bottom1 && partnerId === bottom1.id);
    });
    const bottomPartnerShare = partnerMatches.length > 0 ? bottomPartnerMatches.length / partnerMatches.length : 0;
    if (ranks.length >= 2 && bottom1 && metric.id !== bottom1.id && partnerMatches.length >= 10 && bottomPartnerMatches.length >= 4 && bottomPartnerShare >= 0.4) {
      const text = getRandomVariant(VARIANTS.unlucky_draw({ metric, bottom1, bottomPartnerMatches, partnerMatches }), random);
      addCandidate(candidates, snapshot, {
        type: 'unlucky_draw',
        title: '🎲 DUYÊN GHÉP CẶP',
        group: 'partner',
        participantIds: [metric.id, bottom1.id],
        rarity: bottomPartnerShare >= 0.5 || bottomPartnerMatches.length >= 6 ? 'rare' : 'uncommon',
        frequency: 'occasional',
        baseWeight: 42,
        evidenceStrength: evidence(partnerMatches.length),
        surpriseScore: bottomPartnerShare * 18 + bottomPartnerMatches.length,
        text,
      });
    }

    const playerEdges = snapshot.partnerEdges.filter(edge => edge.playerId === metric.id && edge.total >= 4);
    const synergySorted = [...active].sort((a, b) => b.synergyScore - a.synergyScore);
    const top2Synergy = new Set(synergySorted.slice(0, 2).map(m => m.id));
    const pointsSorted = [...active].sort((a, b) => b.avgPointsFor - a.avgPointsFor);
    const top2Points = new Set(pointsSorted.slice(0, 2).map(m => m.id));

    if (metric.total >= 8 && metric.synergyScore >= 58 && playerEdges.length >= 2 && top2Synergy.has(metric.id) && !top2Points.has(metric.id)) {
      const text = getRandomVariant(VARIANTS.cover_master({ metric }), random);
      addCandidate(candidates, snapshot, {
        type: 'cover_master',
        title: '🩹 ĐIỂM PHỐI HỢP NỔI BẬT',
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
    const qualifiedPartners = Array.from(partnerStats.values()).filter(stat => stat.total >= 3 && stat.wins / stat.total >= 0.55);
    if (qualifiedPartners.length >= 3) {
      const text = getRandomVariant(VARIANTS.chameleon_partner({ metric, count: qualifiedPartners.length, sessionDate: latestSessionDate(snapshot) }), random);
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
  const bottomRankIds = new Set(ranks.length >= 4 ? ranks.slice(-2).map(metric => metric.id) : []);
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
        title: '💣 ĐỘI GHI ĐIỂM ĐỀU',
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

    if (leaderboardRank > 0 && leaderboardRank <= 2 && metric.losses >= 3 && metric.avgLossDiff >= 4) {
      const text = getRandomVariant(VARIANTS.glass_cannon({ metric, leaderboardRank }), random);
      addCandidate(candidates, snapshot, {
        type: 'glass_cannon',
        title: '💥 TOP ĐẦU, THUA CÁCH BIỆT',
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

    if (bottomRankIds.has(metric.id) && metric.losses >= 3 && metric.avgLossDiff <= 3.5) {
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
        title: '⚰️ THẮNG CÁCH BIỆT',
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
      const text = getRandomVariant(VARIANTS.close_loss({ metric }), random);
      addCandidate(candidates, snapshot, {
        type: 'close_loss',
        title: '🥲 TIẾC NUỐI SÁT NÚT',
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
        title: '💪 CÓ DUYÊN TRẬN SÁT NÚT',
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
          const sessionDate = formatDayKey(latestDayKey);
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

      const sessionsByDay = new Map<string, AnalysisMatch[]>();
      playerMatches.forEach(match => {
        const key = matchDayKey(match);
        if (!key) return;
        sessionsByDay.set(key, [...(sessionsByDay.get(key) || []), match]);
      });
      const perfectSessions = Array.from(sessionsByDay.entries())
        .map(([dayKey, matches]) => ({
          dayKey,
          total: matches.length,
          losses: matches.filter(match => resultForPlayer(match, metric.id) === 'L').length,
        }))
        .filter(row => row.total >= 3 && row.losses === 0)
        .sort((a, b) => a.dayKey.localeCompare(b.dayKey));

      if (perfectSessions.length > 0) {
        const latestPerfectSession = perfectSessions[perfectSessions.length - 1];
        const bestPerfectSession = [...perfectSessions]
          .sort((a, b) => b.total - a.total || b.dayKey.localeCompare(a.dayKey))[0];
        const perfectSessionCount = perfectSessions.length;
        const latestSessionDayKey = snapshot.rankingMatches[0] ? matchDayKey(snapshot.rankingMatches[0]) : '';
        const isLatestPerfectSession = latestPerfectSession.dayKey === latestSessionDayKey;
        const latestPerfectSessionDate = formatDayKey(latestPerfectSession.dayKey);
        const bestPerfectSessionDate = formatDayKey(bestPerfectSession.dayKey);
        const text = getRandomVariant(VARIANTS.undefeated_session({ metric, perfectSessionCount, latestPerfectSessionDate, latestPerfectSessionTotal: latestPerfectSession.total, bestPerfectSessionDate, bestPerfectSessionTotal: bestPerfectSession.total }), random);
        addCandidate(candidates, snapshot, {
          type: 'undefeated_session',
          title: '🏅 NGÀY KHÔNG THUA',
          group: 'score',
          participantIds: [metric.id],
          rarity: perfectSessionCount >= 3 || bestPerfectSession.total >= 7
            ? 'epic'
            : perfectSessionCount >= 2 || bestPerfectSession.total >= 5
              ? 'rare'
              : 'uncommon',
          frequency: 'occasional',
          baseWeight: 62,
          evidenceStrength: evidence(bestPerfectSession.total),
          surpriseScore: perfectSessionCount * 5 + bestPerfectSession.total * 2 + (isLatestPerfectSession ? 8 : 0),
          text,
        });
      }
    }

    // quick_finisher (83)
    const latestMatchTime = snapshot.rankingMatches[0] ? matchTime(snapshot.rankingMatches[0]) : Date.now();
    const oneWeekAgo = latestMatchTime - 7 * 86400000;
    const weekMatchesForQF = snapshot.rankingMatches.filter(m => playerInMatch(m, metric.id) && matchTime(m) >= oneWeekAgo);
    const totalInWeek = weekMatchesForQF.length;
    const deuceInWeek = weekMatchesForQF.filter(m => Number(m.win_score || 0) > 11).length;
    if (totalInWeek >= 10 && deuceInWeek === 0) {
      const text = getRandomVariant(VARIANTS.quick_finisher({ metric, count: totalInWeek, sessionDate: latestSessionDate(snapshot) }), random);
      addCandidate(candidates, snapshot, {
        type: 'quick_finisher',
        title: '⚡ GỌN TRONG 11 ĐIỂM',
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
        title: '🧸 KÈO CHƯA THUẬN',
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
        title: '🎯 BẠN ĐẤU HAI VAI',
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
        title: '🧊 KÈO KHÓ KIẾM THẮNG',
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
    if (leaderboardRank > 0 && leaderboardRank <= 2) {
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

function addFunCandidates(candidates: InsightCandidate[], snapshot: AnalysisSnapshot, random?: () => number, includeAbsence = true) {
  const active = snapshot.playerMetrics.filter(metric => metric.total > 0);
  const topActivity = [...active].sort((a, b) => b.total - a.total || b.dailyMaxMatches - a.dailyMaxMatches)[0];
  const topFine = [...snapshot.playerMetrics].sort((a, b) => b.money - a.money || b.losses - a.losses)[0];
  const avgMatches = active.reduce((sum, metric) => sum + metric.total, 0) / Math.max(1, active.length);
  // Previous board for spring_jump and quantity_over_quality
  const prevBoard = buildPreviousSessionBoard(snapshot);
  const prevRankById = new Map(prevBoard.map((p, index) => [p.id, index + 1]));

  const ranks = rankBoard(snapshot);
  const rankById = new Map(ranks.map((metric, index) => [metric.id, index + 1]));
  const top1Player = ranks[0];

  active.forEach(metric => {
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

    if (includeAbsence && metric.daysAbsent !== null && metric.daysAbsent >= 7) {
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
      const text = getRandomVariant(VARIANTS.casual_visitor({ metric }), random);
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
        const text = getRandomVariant(VARIANTS.top1_time({ metric, daysAtTop1, sessionDate: latestSessionDate(snapshot) }), random);
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
    if (previousRank && leaderboardRank === previousRank && leaderboardRank >= 3 && metric.total >= 5 && playedLatestSession(snapshot, metric.id)) {
      const text = getRandomVariant(VARIANTS.stuck_in_mud({ metric, Rank: leaderboardRank, sessionDate: latestSessionDate(snapshot) }), random);
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
          title: '📉 CÙNG THẮNG, KHÁC HẠNG',
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
    if (leaderboardRank > 0 && leaderboardRank <= 2 && metric.wins >= 5 && ranks.length >= 4) {
      const bottom1 = ranks[ranks.length - 1];
      if (bottom1) {
        const winsVsBottom1 = snapshot.rankingMatches.filter(m =>
          playerInMatch(m, metric.id) &&
          resultForPlayer(m, metric.id) === 'W' &&
          opponentIdsForPlayer(m, metric.id).includes(bottom1.id)
        ).length;
        const percent = Math.round((winsVsBottom1 / metric.wins) * 100);
        if (percent >= 50) {
          const text = getRandomVariant(VARIANTS.vulture_win({ metric, bottom1, percent, leaderboardRank }), random);
          addCandidate(candidates, snapshot, {
            type: 'vulture_win',
            title: '🦅 ĐIỂM HẸN CHIẾN THẮNG',
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
    const activePlayersCount = ranks.length;
    if (activePlayersCount >= 4 && leaderboardRank >= activePlayersCount - 1 && metric.money === topFine?.money && metric.money > 0) {
      const text = getRandomVariant(VARIANTS.money_blackhole({ metric }), random);
      addCandidate(candidates, snapshot, {
        type: 'money_blackhole',
        title: '💸 BXH VÀ QUỸ PHẠT',
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
    if (prevBoard.length >= 4 && previousRank && previousRank >= prevBoard.length - 1 && leaderboardRank > 0 && leaderboardRank <= 2 && leaderboardRank < previousRank && playedLatestSession(snapshot, metric.id)) {
      const text = getRandomVariant(VARIANTS.spring_jump({ metric, Rank: leaderboardRank, sessionDate: latestSessionDate(snapshot) }), random);
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
    if (leaderboardRank === 1 && activePlayersCount >= 2) {
      const bottom1 = ranks[ranks.length - 1];
      const playerMatches = sortNewest(snapshot.rankingMatches.filter(m => playerInMatch(m, metric.id)));
      const recent10 = playerMatches.slice(0, 10);
      const recentLossesVsBottom1 = bottom1 ? recent10.filter(m => {
        if (resultForPlayer(m, metric.id) !== 'L') return false;
        const opponents = opponentIdsForPlayer(m, metric.id);
        return opponents.includes(bottom1.id);
      }).length : 0;
      if (bottom1 && recentLossesVsBottom1 >= 2) {
        const text = getRandomVariant(VARIANTS.charity_top_rank({ metric, bottom1, recentLossesVsBottom1 }), random);
        addCandidate(candidates, snapshot, {
          type: 'charity_top_rank',
          title: '🤝 ĐẠI SỨ THIỆN CHÍ',
          group: 'fun',
          participantIds: [metric.id, bottom1.id],
          rarity: 'uncommon',
          frequency: 'occasional',
          baseWeight: 46,
          evidenceStrength: evidence(recentLossesVsBottom1),
          surpriseScore: recentLossesVsBottom1 * 4,
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
        title: '🥒 KỶ NIỆM THUA TRẮNG',
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

export function generateInsightCandidatesForDebug(snapshot: AnalysisSnapshot, options: InsightSelectionOptions = {}) {
  const random = seededRandom(options.seed ?? 42);
  const candidates: InsightCandidate[] = [];
  addFormAndEloCandidates(candidates, snapshot, random);
  addStoryCandidates(candidates, snapshot, random);
  addPartnerCandidates(candidates, snapshot, random);
  addScoreCandidates(candidates, snapshot, random);
  addOpponentCandidates(candidates, snapshot, random);
  addFunCandidates(candidates, snapshot, random, options.includeAbsence ?? true);
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
  addFunCandidates(candidates, snapshot, random, options.includeAbsence ?? true);
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
