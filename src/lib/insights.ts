import {
  buildAnalysisSnapshot,
  type AnalysisEdge,
  type AnalysisMatch,
  type AnalysisPlayer,
  type AnalysisSnapshot,
  type PlayerMetrics,
} from './analysis-core';

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
  rank_climber: 'rank_race',
  rank_camper: 'rank_race',
  top1_gap: 'rank_race',
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
  iron_lung: 'activity_attendance',
  missing_player: 'activity_attendance',
  casual_visitor: 'activity_attendance',
  mercenary: 'activity_attendance',
  fine_sponsor: 'money_fun',
  experience_seeker: 'meta_weird',
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
    ? [match.lose_1, match.lose_2].filter((id): id is string => Boolean(id))
    : [match.win_1, match.win_2].filter((id): id is string => Boolean(id));
}

function matchTime(match: AnalysisMatch) {
  return new Date(String(match.date || '')).getTime() || 0;
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

function addFormAndEloCandidates(candidates: InsightCandidate[], snapshot: AnalysisSnapshot) {
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
    const gap = topElo.rating - (secondElo?.rating ?? 1000);
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
      text: `${topElo.name} đang giữ nóc ELO với ${topElo.rating} điểm, hơn người bám sau ${Math.max(0, gap)} điểm.`,
    });
  }

  if (topRank && topRank.total >= 8) {
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
      text: `${topRank.name} đang đứng đầu bảng xếp hạng với ${topRank.wins}/${topRank.total} trận thắng, tỷ lệ ${round(topRank.winRate)}%.`,
    });
  }

  if (topRank && secondRank && topRank.total >= 8) {
    const winRateGap = topRank.winRate - secondRank.winRate;
    const winsGap = topRank.wins - secondRank.wins;
    if (winRateGap >= 15 || winsGap >= 5) {
      const gapText = winsGap >= 5 ? `${winsGap} trận thắng` : `${round(winRateGap)} điểm win rate`;
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
        text: `Bỏ xa người bám đuổi ${gapText}, ${topRank.name} đang ngồi khá lạnh trên đỉnh bảng xếp hạng.`,
      });
    }
  }

  active.forEach(metric => {
    if (metric.streakType === 'W' && metric.streakCount >= 4) {
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
        text: `${metric.name} đang thắng liền ${metric.streakCount} trận, phong độ này lên sân là đối thủ phải chuẩn bị thở oxy.`,
      });
    }

    if (metric.streakType === 'L' && metric.streakCount >= 4) {
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
        text: `${metric.name} đang đỏ ${metric.streakCount} trận liên tiếp, có vẻ cần một kèo giải hạn thật sự.`,
      });
    }

    if (metric.total >= 5 && metric.formScore === 100) {
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
        text: `${metric.name} đang thắng 5 trận liên tiếp, bảng phong độ xanh kín nhìn khá cháy.`,
      });
    }

    if (metric.total >= 5 && metric.formScore === 0) {
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
        text: `${metric.name} đang thua 5 trận liên tiếp, bảng phong độ đỏ kín nhìn hơi chán.`,
      });
    }

    if (metric.upsetWins > 0) {
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
        text: `${metric.name} có ${metric.upsetWins} lần thắng cửa dưới khi tỷ lệ thắng dự tính trước trận chỉ dưới 30%, đúng kiểu kèo khó vẫn lật được.`,
      });
    }

    if (metric.upsetLosses > 0) {
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
        text: `${metric.name} có ${metric.upsetLosses} lần tỷ lệ thắng dự tính trước trận lên tới trên 70% mà vẫn rơi kèo.`,
      });
    }

    if (metric.total >= 20 && Math.abs(metric.rating - 1000) <= 20) {
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
        text: `${metric.name} đã đánh ${metric.total} trận mà ELO vẫn quanh ${metric.rating}, lên xuống mãi vẫn giữ đúng một vùng quen thuộc.`,
      });
    }

    if (metric.recentEloDelta >= 30) {
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
        text: `${metric.name} đang tăng ${round(metric.recentEloDelta)} điểm ELO trong giai đoạn gần đây, dấu hiệu lên tay khá rõ.`,
      });
    }

    if (metric.recentEloDelta <= -30) {
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
        text: `${metric.name} đang rơi ${absRound(metric.recentEloDelta)} điểm ELO gần đây, cần thắng vài kèo để kéo lại vía.`,
      });
    }

    const leaderboardRank = rankById.get(metric.id) || 0;
    const eloRank = eloRankById.get(metric.id) || 0;
    const recentWins = metric.recentResults.slice(0, 5).filter(result => result === 'W').length;
    const recentTotal = metric.recentResults.slice(0, 5).length;
    const recentLosses = recentTotal - recentWins;

    if (leaderboardRank > 0 && leaderboardRank <= 3 && metric.total >= 5 && metric.total < avgMatches * 0.7) {
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
        text: `Mới đánh ${metric.total} trận, ít hơn mặt bằng chung ${round(avgMatches)} trận nhưng ${metric.name} vẫn ung dung Top ${leaderboardRank} BXH. Đánh ít mà chất lượng hay đang giữ rank đây?`,
      });
    }

    if (eloRank > 0 && eloRank <= 2 && leaderboardRank >= 4 && metric.total >= 8) {
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
        text: `ELO đang Top ${eloRank}, nhưng BXH win rate của ${metric.name} lại ở vị trí ${leaderboardRank}. Có vẻ thông số hơi lạm phát nhẹ.`,
      });
    }

    if (eloRank >= 5 && leaderboardRank > 0 && leaderboardRank <= 2 && metric.total >= 8) {
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
        text: `ELO chỉ đang hạng ${eloRank}, nhưng ${metric.name} lại chễm chệ Top ${leaderboardRank} BXH. Đúng chất thực chiến vượt thông số.`,
      });
    }

    if (metric.total >= 8 && metric.winRate < 45 && metric.formScore >= 80 && recentTotal >= 5) {
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
        text: `Nửa mùa còn ngụp lặn, nhưng 5 trận gần đây ${metric.name} thắng ${recentWins}/5. Có vẻ đang chạy nước rút khá khét.`,
      });
    }

    if (leaderboardRank > 0 && leaderboardRank <= 3 && metric.total >= 8 && metric.formScore <= 20 && recentTotal >= 5) {
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
        text: `Đang Top ${leaderboardRank} BXH nhưng 5 trận gần đây ${metric.name} thua ${recentLosses}/5. Dấu hiệu hết xăng hơi rõ.`,
      });
    }

    const currentRank = eloRank;
    const oldRank = oldRanks.findIndex(row => row.id === metric.id) + 1;
    const places = oldRank > 0 && currentRank > 0 ? oldRank - currentRank : 0;
    if (places >= 2 && recentWins >= 3) {
      addCandidate(candidates, snapshot, {
        type: 'rank_climber',
        title: '🧗 LEO BẢNG',
        group: 'rank',
        participantIds: [metric.id],
        rarity: 'rare',
        frequency: 'rare',
        baseWeight: 60,
        evidenceStrength: evidence(metric.total),
        surpriseScore: places * 5,
        text: `${metric.name} đang leo ${places} bậc trên bảng ELO gần đây, với ${recentWins} chiến thắng trong 5 trận mới nhất, đà thăng tiến đang cực kỳ ấn tượng.`,
      });
    }
  });
}

function buildStreakBreakers(snapshot: AnalysisSnapshot) {
  const rows: Array<{ playerId: string; targetId: string; streak: number }> = [];
  const current = new Map<string, { type: Result | ''; count: number }>();

  sortOldest(snapshot.rankingMatches).forEach(match => {
    const winners = [match.win_1, match.win_2].filter((id): id is string => Boolean(id));
    const losers = [match.lose_1, match.lose_2].filter((id): id is string => Boolean(id));

    losers.forEach(loserId => {
      const before = current.get(loserId);
      if (before?.type === 'W' && before.count >= 4) {
        winners.forEach(winnerId => rows.push({ playerId: winnerId, targetId: loserId, streak: before.count }));
      }
    });

    winners.forEach(id => current.set(id, { type: 'W', count: current.get(id)?.type === 'W' ? (current.get(id)?.count || 0) + 1 : 1 }));
    losers.forEach(id => current.set(id, { type: 'L', count: current.get(id)?.type === 'L' ? (current.get(id)?.count || 0) + 1 : 1 }));
  });

  return rows.sort((a, b) => b.streak - a.streak);
}

function buildRevengeRows(snapshot: AnalysisSnapshot) {
  const rows: Array<{ playerId: string; opponentId: string; priorLosses: number; recentWins: number; recentTotal: number }> = [];

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

      const recent = sortNewest(meetings).slice(0, 4);
      const recentWins = recent.filter(match => resultForPlayer(match, player.id) === 'W').length;
      if (bestPriorLosses >= 3 && recentWins >= 1) {
        rows.push({ playerId: player.id, opponentId: opponent.id, priorLosses: bestPriorLosses, recentWins, recentTotal: recent.length });
      }
    });
  });

  return rows.sort((a, b) => b.priorLosses - a.priorLosses || b.recentWins - a.recentWins);
}

function addStoryCandidates(candidates: InsightCandidate[], snapshot: AnalysisSnapshot) {
  const breaker = buildStreakBreakers(snapshot)[0];
  if (breaker) {
    const player = snapshot.metrics.get(breaker.playerId);
    const target = snapshot.metrics.get(breaker.targetId);
    if (player && target) {
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
        text: `${player.name} vừa cắt chuỗi ${breaker.streak} trận thắng của ${target.name}, một pha gạt giò khá đau.`,
      });
    }
  }

  const revenge = buildRevengeRows(snapshot)[0];
  if (revenge) {
    const player = snapshot.metrics.get(revenge.playerId);
    const opponent = snapshot.metrics.get(revenge.opponentId);
    if (player && opponent) {
      addCandidate(candidates, snapshot, {
        type: 'revenge_win',
        title: '🩸 PHỤC HẬN',
        group: 'opponent',
        participantIds: [player.id, opponent.id],
        rarity: 'rare',
        frequency: 'rare',
        baseWeight: 58,
        evidenceStrength: evidence(revenge.priorLosses + revenge.recentTotal),
        surpriseScore: revenge.priorLosses * 4,
        text: `${player.name} cuối cùng cũng giải được ${opponent.name} sau ${revenge.priorLosses} lần thua trước đó, kèo phục hận đã lên sóng.`,
      });

      addCandidate(candidates, snapshot, {
        type: 'revenge_target',
        title: '🔁 LẬT LẠI KÈO',
        group: 'opponent',
        participantIds: [player.id, opponent.id],
        rarity: 'rare',
        frequency: 'rare',
        baseWeight: 53,
        evidenceStrength: evidence(revenge.recentTotal),
        surpriseScore: revenge.recentWins * 6,
        text: `Gần đây ${player.name} gặp ${opponent.name} thắng ${revenge.recentWins}/${revenge.recentTotal} trận sau giai đoạn bị đì, có mùi lật kèo.`,
      });
    }
  }
}

function addPartnerCandidates(candidates: InsightCandidate[], snapshot: AnalysisSnapshot) {
  const repeated = snapshot.partnerEdges.filter(edge => edge.total >= 4);
  const pairEdges = uniquePartnerPairs(repeated);
  const glued = uniquePartnerPairs(snapshot.partnerEdges).sort((a, b) => b.edge.total - a.edge.total || b.edge.confidence - a.edge.confidence)[0]?.edge || null;

  pairEdges.forEach(({ edge, maxAbsImpact }) => {
    if (edge.rate >= 75) {
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
        text: `${edge.playerName} và ${edge.otherName} đang thắng ${edge.wins}/${edge.total} trận chung, đạt ${edgeRate(edge)}%, đúng chất cặp bài trùng.`,
      });
    }

    if (edge.rate <= 25) {
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
        text: `${edge.playerName} đi với ${edge.otherName} mới thắng ${edge.wins}/${edge.total} trận, tỷ lệ ${edgeRate(edge)}%, dữ liệu đang báo hơi dẫm chân nhau.`,
      });
    }

    if (edge.rate >= 50 && edge.rate <= 65 && maxAbsImpact <= 5 && edge.total >= 6) {
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
        text: `${edge.playerName} và ${edge.otherName} đánh chung ${edge.total} trận, thắng ${edge.wins} trận, không bùng nổ nhưng khá tròn vai.`,
      });
    }

    if (edge.total <= 5 && edge.rate >= 80) {
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
        text: `${edge.playerName} và ${edge.otherName} mới đánh ${edge.total} trận nhưng thắng ${edge.wins}/${edge.total}, mẫu còn mỏng mà nhìn khá thơm.`,
      });
    }

    if (edge.total >= 4 && edge.rate <= 35 && edge.avgDiff <= -3) {
      addCandidate(candidates, snapshot, {
        type: 'disaster_duo',
        title: '📉 ĐÔI CÙNG LÙI',
        group: 'partner',
        participantIds: [edge.playerId, edge.otherId],
        rarity: 'rare',
        frequency: 'rare',
        baseWeight: 57,
        evidenceStrength: evidence(edge.total),
        surpriseScore: Math.abs(edge.avgDiff) * 2,
        text: `${edge.playerName} và ${edge.otherName} thua ${edge.losses}/${edge.total} trận chung, trung bình mỗi trận âm ${oneDecimal(Math.abs(edge.avgDiff))} điểm, cần đổi bài gấp.`,
      });
    }

    if (edge.deuceGames >= 3) {
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
        text: `${edge.playerName} và ${edge.otherName} đánh chung mà đã có ${edge.deuceGames} trận kéo qua 11 điểm, cặp này thích cò cưa thật.`,
      });
    }
  });

  repeated.forEach(edge => {
    const playerMetric = snapshot.metrics.get(edge.playerId);
    if (!playerMetric) return;

    if (edge.impact >= 15 && edge.rate >= 50) {
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
        text: `${edge.playerName} cặp với ${edge.otherName} thắng ${edge.wins}/${edge.total} trận và cao hơn mức dự tính từ ELO trước trận ${edge.impact} điểm.`,
      });
    }

    if (edge.impact <= -15 && edge.rate <= 40) {
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
        text: `${edge.playerName} đứng cùng ${edge.otherName} chỉ thắng ${edge.wins}/${edge.total} trận, lại thấp hơn mức dự tính từ ELO trước trận ${absRound(edge.impact)} điểm.`,
      });
    }

    const playerLift = edge.rate - playerMetric.winRate;
    if (edge.total >= 4 && playerLift >= 18 && edge.rate >= 55) {
      addCandidate(candidates, snapshot, {
        type: 'carry_partner',
        title: '🏋️ GÁNH CÒNG LƯNG',
        group: 'partner',
        participantIds: [edge.playerId, edge.otherId],
        rarity: 'rare',
        frequency: 'rare',
        baseWeight: 57,
        evidenceStrength: evidence(edge.total),
        surpriseScore: playerLift,
        text: `${edge.playerName} đi với ${edge.otherName} thắng ${edge.wins}/${edge.total} trận, kéo tỷ lệ từ mức thường thấy ${round(playerMetric.winRate)}% lên ${edgeRate(edge)}%.`,
      });
    }

    if (edge.total >= 4 && playerLift <= -18 && edge.rate <= 45) {
      addCandidate(candidates, snapshot, {
        type: 'heavy_backpack',
        title: '🎒 NẶNG VAI',
        group: 'partner',
        participantIds: [edge.playerId, edge.otherId],
        rarity: 'rare',
        frequency: 'rare',
        baseWeight: 56,
        evidenceStrength: evidence(edge.total),
        surpriseScore: Math.abs(playerLift),
        text: `${edge.playerName} đi với ${edge.otherName} tụt từ mức thắng thường thấy ${round(playerMetric.winRate)}% xuống còn ${edgeRate(edge)}%, kèo này hơi nặng vai.`,
      });
    }
  });

  if (glued && glued.total >= 8) {
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
      text: `${glued.playerName} và ${glued.otherName} đã đánh chung ${glued.total} trận, tần suất dính nhau nhiều nhất sân.`,
    });
  }

  snapshot.playerMetrics.forEach(metric => {
    const playerEdges = snapshot.partnerEdges.filter(edge => edge.playerId === metric.id && edge.total >= 4);
    if (metric.total >= 8 && metric.attackScore <= 85 && metric.synergyScore >= 60 && playerEdges.length >= 2) {
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
        text: `${metric.name} ghi điểm không quá ồn ào nhưng sở hữu chỉ số phối hợp đồng đội cực tốt, đạt tới ${round(metric.synergyScore)} điểm.`,
      });
    }
  });
}

function addScoreCandidates(candidates: InsightCandidate[], snapshot: AnalysisSnapshot) {
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
        text: `${metric.name} đang ghi trung bình ${oneDecimal(metric.avgPointsFor)} điểm/trận, xứng danh tay săn điểm uy tín nhất trên sân.`,
      });
    }

    const defenseLift = avgConceded - metric.avgConceded;
    if (metric.total >= 8 && defenseLeaders.has(metric.id) && defenseLift >= 0.8 && metric.avgConceded <= 7.5) {
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
        text: `${metric.name} chỉ mất trung bình ${oneDecimal(metric.avgConceded)} điểm/trận, đúng chất bức tường phòng ngự cực kỳ khó để xuyên phá.`,
      });
    }

    if (metric.total >= 8 && tightMatches >= 4 && tightRate >= 0.35) {
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
        text: `Cứ hễ ${metric.name} lên sân là dễ có drama: ${tightMatches}/${metric.total} trận kết thúc sát nút hoặc kéo qua 11 điểm.`,
      });
    }

    if (leaderboardRank > 0 && leaderboardRank <= 3 && metric.losses >= 3 && metric.avgLossDiff >= 4) {
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
        text: `Chễm chệ Top ${leaderboardRank} nhưng cứ hễ gãy kèo là ${metric.name} thua trung bình ${oneDecimal(metric.avgLossDiff)} điểm, đúng kiểu công to mà giáp hơi mỏng.`,
      });
    }

    if (leaderboardRank >= 5 && metric.losses >= 3 && metric.avgLossDiff <= 3.5) {
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
        text: `Dù đang ở nhóm cuối bảng, ${metric.name} mỗi lần thua chỉ cách biệt trung bình ${oneDecimal(metric.avgLossDiff)} điểm. Không dễ bị out trình, chỉ thiếu duyên đóng kèo.`,
      });
    }

    if (metric.dominantWins >= 4 && metric.winRate >= 45) {
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
        text: `${metric.name} có ${metric.dominantWins} trận thắng cách biệt từ 7 điểm trở lên, vào tay là đóng hòm khá nhanh.`,
      });
    }

    if (metric.closeLosses >= 3) {
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
        text: `${metric.name} đã thua sát nút ${metric.closeLosses} trận với cách biệt vỏn vẹn 2 điểm, đúng kiểu thánh nhọ sân bãi.`,
      });
    }

    if (metric.deuceMatches >= 3) {
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
        text: `${metric.name} đã góp mặt trong ${metric.deuceMatches} trận kéo qua 11 điểm, đam mê cò cưa hơi rõ.`,
      });
    }

    if (metric.bagelLosses > 0) {
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
        text: `${metric.name} có ${metric.bagelLosses} trận thua mà team chỉ ghi tối đa 2 điểm.`,
      });
    }

    if (metric.closeWins >= 3) {
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
        text: `${metric.name} thắng sát nút ${metric.closeWins} trận, càng cuối kèo càng lì.`,
      });
    }

    if (metric.closeLosses >= 4 && metric.closeLosses >= metric.closeWins + 2) {
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
        text: `${metric.name} thua sát nút ${metric.closeLosses} trận, nhiều kèo chỉ thiếu một nhịp là lật được.`,
      });
    }

    if (metric.wins >= 5 && metric.avgWinDiff >= 5) {
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
        text: `Mỗi khi thắng, ${metric.name} thường thắng trung bình ${oneDecimal(metric.avgWinDiff)} điểm, không thích dây dưa.`,
      });
    }

    if (metric.lowScoreLosses >= 3) {
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
        text: `${metric.name} góp mặt trong ${metric.lowScoreLosses} trận team thua mà chỉ ghi tối đa 4 điểm, đúng kiểu cột thu lôi hôm xấu trời.`,
      });
    }
  });
}

function addOpponentCandidates(candidates: InsightCandidate[], snapshot: AnalysisSnapshot) {
  const repeated = snapshot.opponentEdges.filter(edge => edge.total >= 4);
  const mostRepeated = mostFrequentDirectional(repeated);

  repeated.forEach(edge => {
    const metric = snapshot.metrics.get(edge.playerId);
    if (!metric) return;

    if (edge.rate >= 80) {
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
        text: `${edge.playerName} đang tỏ ra cực kỳ "kỵ rơ" với ${edge.otherName} khi giành chiến thắng tới ${edge.wins}/${edge.total} trận đối đầu.`,
      });
    }

    if (edge.rate <= 20) {
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
        text: `Cứ hễ đụng độ ${edge.otherName} là ${edge.playerName} lại gặp dớp, để thua tới ${edge.losses}/${edge.total} trận.`,
      });
    }

    if (edge.deuceGames >= 3) {
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
        text: `${edge.playerName} gặp ${edge.otherName} có ${edge.deuceGames}/${edge.total} trận kéo qua 11 điểm, cứ chạm nhau là dây dưa.`,
      });
    }

    if (edge.impact <= -15 && edge.rate <= 45) {
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
        text: `${edge.playerName} mỗi khi đối đầu ${edge.otherName} thường có dấu hiệu bị "cóng" tâm lý, khiến kết quả thi đấu thực tế thấp hơn kỳ vọng từ ELO tới ${absRound(edge.impact)} điểm.`,
      });
    }

    if (edge.impact >= 15 && edge.rate >= 55) {
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
        text: `${edge.playerName} đối đầu ${edge.otherName} đang thắng ${edge.wins}/${edge.total} trận, hiệu suất cao hơn kỳ vọng từ ELO tới ${edge.impact} điểm.`,
      });
    }
  });

  if (mostRepeated && mostRepeated.total >= 6 && mostRepeated.rate >= 40 && mostRepeated.rate <= 60) {
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
      text: `${mostRepeated.playerName} và ${mostRepeated.otherName} đã gặp ${mostRepeated.total} trận với tỷ số ${mostRepeated.wins}-${mostRepeated.losses}, đúng kèo kỳ phùng địch thủ.`,
    });
  }

  snapshot.playerMetrics.forEach(metric => {
    if (metric.winsVsHigherElo >= 3) {
      addCandidate(candidates, snapshot, {
        type: 'boss_hunter',
        title: '🏹 THỢ SĂN TRÙM',
        group: 'opponent',
        participantIds: [metric.id],
        rarity: 'rare',
        frequency: 'rare',
        baseWeight: 58,
        evidenceStrength: evidence(metric.totalVsHigherElo),
        surpriseScore: metric.winsVsHigherElo * 4,
        text: `${metric.name} có ${metric.winsVsHigherElo} lần thắng team có ELO trung bình cao hơn, thợ săn trùm hơi uy tín.`,
      });
    }

    const lowerRate = rate(metric.winsVsLowerElo, metric.totalVsLowerElo);
    if (metric.totalVsLowerElo >= 8 && lowerRate >= 70) {
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
        text: `${metric.name} thắng ${metric.winsVsLowerElo}/${metric.totalVsLowerElo} trận trước nhóm ELO thấp hơn, farm kèo mềm khá đều tay.`,
      });
    }

    const higherLossRate = rate(metric.lossesVsHigherElo, metric.totalVsHigherElo);
    if (metric.totalVsHigherElo >= 6 && higherLossRate >= 65) {
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
        text: `${metric.name} gặp nhóm ELO cao hơn đang thua ${metric.lossesVsHigherElo}/${metric.totalVsHigherElo} trận, đụng độ "chiếu trên" quả thực không hề dễ nuốt.`,
      });
    }
  });
}

function addFunCandidates(candidates: InsightCandidate[], snapshot: AnalysisSnapshot) {
  const active = snapshot.playerMetrics.filter(metric => metric.total > 0);
  const topActivity = [...active].sort((a, b) => b.total - a.total || b.dailyMaxMatches - a.dailyMaxMatches)[0];
  const topFine = [...active].sort((a, b) => b.money - a.money || b.losses - a.losses)[0];
  const avgMatches = active.reduce((sum, metric) => sum + metric.total, 0) / Math.max(1, active.length);

  active.forEach(metric => {
    if (topActivity?.id === metric.id && metric.total >= 20) {
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
        text: `${metric.name} đang tạm dẫn đầu toàn sân về số lượng cày ải với ${metric.total} trận, phong độ cực kỳ bền bỉ.`,
      });
    }

    if (metric.daysAbsent !== null && metric.daysAbsent >= 7) {
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
        text: `${metric.name} đã vắng ${metric.daysAbsent} ngày chưa ra sân, anh em bắt đầu nghi ngờ quy ẩn giang hồ.`,
      });
    }

    if (metric.total > 0 && metric.total <= 5 && metric.winRate >= 80) {
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
        text: `${metric.name} mới đánh ${metric.total} trận nhưng thắng ${metric.wins} trận, đạt ${round(metric.winRate)}%, lính đánh thuê mẫu mỏng mà bén.`,
      });
    }

    if (metric.total > 0 && metric.total < avgMatches * 0.4) {
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
        text: `${metric.name} dạo này mới ra sân ${metric.total} trận, thấp hơn hẳn trung bình nhóm ${round(avgMatches)} trận, đúng phong cách khách mời danh dự.`,
      });
    }

    if (metric.alternations >= 5) {
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
        text: `Phong độ gần đây của ${metric.name} nhảy ${pattern(metric.recentResults)} liên tục, đúng kiểu máy test vợt.`,
      });
    }

    if (metric.total >= 20 && metric.winRate <= 40) {
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
        text: `${metric.name} đánh ${metric.total} trận nhưng mới thắng ${metric.wins} trận, tinh thần cọ xát thì khỏi bàn.`,
      });
    }
  });

  if (topFine && topFine.money > 0) {
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
      text: `${topFine.name} đang gánh ${topFine.losses} trận thua và đóng ${topFine.money.toLocaleString('vi-VN')}đ tiền quỹ, nhà tài trợ vàng gọi tên.`,
    });
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

function selectInsights(candidates: InsightCandidate[], limit = 8, options: InsightSelectionOptions = {}): InsightSelectionResult {
  const random = seededRandom(options.seed);
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
  const candidates: InsightCandidate[] = [];
  addFormAndEloCandidates(candidates, snapshot);
  addStoryCandidates(candidates, snapshot);
  addPartnerCandidates(candidates, snapshot);
  addScoreCandidates(candidates, snapshot);
  addOpponentCandidates(candidates, snapshot);
  addFunCandidates(candidates, snapshot);
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
  const candidates: InsightCandidate[] = [];
  addFormAndEloCandidates(candidates, snapshot);
  addStoryCandidates(candidates, snapshot);
  addPartnerCandidates(candidates, snapshot);
  addScoreCandidates(candidates, snapshot);
  addOpponentCandidates(candidates, snapshot);
  addFunCandidates(candidates, snapshot);
  return selectInsights(candidates, 8, options);
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
