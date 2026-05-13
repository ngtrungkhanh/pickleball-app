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

function addFormAndEloCandidates(candidates: InsightCandidate[], snapshot: AnalysisSnapshot) {
  const active = snapshot.playerMetrics.filter(metric => metric.total > 0);
  const eloBoard = snapshot.board.filter(metric => metric.total > 0);
  const topElo = eloBoard[0];
  const secondElo = eloBoard[1];
  const ranks = rankBoard(snapshot);
  const topRank = ranks[0];
  const oldRanks = oldEloRanks(active);

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
        text: `${metric.name} đang thắng liền ${metric.streakCount} trận, form này lên sân là đối thủ phải chuẩn bị thở oxy.`,
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
        text: `${metric.name} đang thắng 5/5 trận gần nhất, bảng form xanh kín nhìn khá cháy.`,
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
        text: `${metric.name} đang thua 0/5 trận gần nhất, đoạn này đúng là hơi sập hầm.`,
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
        text: `${metric.name} có ${metric.upsetWins} lần thắng cửa dưới khi tỷ lệ thắng dự tính chỉ dưới 30%, đúng kiểu chuyên gạt giò.`,
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
        text: `${metric.name} có ${metric.upsetLosses} lần cửa trên trên 70% mà vẫn rơi kèo, sân phủi đúng là khó đoán.`,
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
        text: `${metric.name} đã đánh ${metric.total} trận mà ELO vẫn quanh ${metric.rating}, đúng kiểu người giữ cổng 1000.`,
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

    const currentRank = eloBoard.findIndex(row => row.id === metric.id) + 1;
    const oldRank = oldRanks.findIndex(row => row.id === metric.id) + 1;
    const places = oldRank > 0 && currentRank > 0 ? oldRank - currentRank : 0;
    const recentWins = metric.recentResults.slice(0, 5).filter(result => result === 'W').length;
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
        text: `${metric.name} đang leo ${places} bậc trên bảng ELO gần đây, 5 trận mới nhất thắng ${recentWins}/5 nên nhìn khá có lực.`,
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
  const glued = mostFrequentDirectional(snapshot.partnerEdges);

  repeated.forEach(edge => {
    const playerMetric = snapshot.metrics.get(edge.playerId);
    if (!playerMetric) return;

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
        text: `${edge.playerName} cặp với ${edge.otherName} thắng ${edge.wins}/${edge.total} trận và đánh cao hơn kỳ vọng từ ELO ${edge.impact} điểm.`,
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
        text: `${edge.playerName} đứng cùng ${edge.otherName} chỉ thắng ${edge.wins}/${edge.total} trận, lại thấp hơn kỳ vọng từ ELO ${absRound(edge.impact)} điểm.`,
      });
    }

    if (edge.rate >= 50 && edge.rate <= 65 && Math.abs(edge.impact) <= 5 && edge.total >= 6) {
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
        text: `${edge.playerName} đi với ${edge.otherName} thắng ${edge.wins}/${edge.total} trận, cao hơn hẳn mức thường thấy của ${edge.playerName}.`,
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
        text: `${metric.name} ghi điểm không quá ồn ào nhưng đi với nhiều đồng đội vẫn giúp cặp thắng ${round(metric.synergyScore)}% số trận.`,
      });
    }
  });
}

function addScoreCandidates(candidates: InsightCandidate[], snapshot: AnalysisSnapshot) {
  const active = snapshot.playerMetrics.filter(metric => metric.total > 0);
  const topAttack = [...active].filter(metric => metric.total >= 8).sort((a, b) => b.avgPointsFor - a.avgPointsFor)[0];

  active.forEach(metric => {
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
        text: `${metric.name} đang ghi trung bình ${oneDecimal(metric.avgPointsFor)} điểm/trận, cao nhất sân ở khoản dập bóng.`,
      });
    }

    if (metric.total >= 8 && metric.avgConceded <= 5) {
      addCandidate(candidates, snapshot, {
        type: 'defense_wall',
        title: '🛡️ BỨC TƯỜNG BÊ TÔNG',
        group: 'score',
        participantIds: [metric.id],
        rarity: metric.avgConceded <= 4 ? 'rare' : 'uncommon',
        frequency: 'occasional',
        baseWeight: 58,
        evidenceStrength: evidence(metric.total),
        surpriseScore: (5 - metric.avgConceded) * 6,
        text: `${metric.name} chỉ mất trung bình ${oneDecimal(metric.avgConceded)} điểm/trận, phòng thủ kiểu này đối thủ rất khó đóng điểm.`,
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
        text: `${metric.name} đã thua sát nút ${metric.closeLosses} trận chỉ 1-2 điểm, đúng kiểu thánh nhọ sân bãi.`,
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
        text: `${metric.name} có ${metric.bagelLosses} trận thua mà team chỉ ghi tối đa 2 điểm, đoạn này hơi sập nguồn.`,
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
        text: `${metric.name} góp mặt trong ${metric.lowScoreLosses} trận team thua điểm rất thấp, đúng kiểu cột thu lôi hôm xấu trời.`,
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

    if (edge.rate === 100) {
      addCandidate(candidates, snapshot, {
        type: 'hard_counter',
        title: '🦅 KHẮC TINH',
        group: 'opponent',
        participantIds: [edge.playerId, edge.otherId],
        rarity: edge.total >= 6 ? 'epic' : 'rare',
        frequency: 'rare',
        baseWeight: 72,
        evidenceStrength: evidence(edge.total),
        surpriseScore: edge.total * 4,
        text: `${edge.playerName} gặp ${edge.otherName} đang thắng ${edge.wins}/${edge.total} trận, tỷ lệ ${edgeRate(edge)}%, kèo này nhìn khá khắc tinh.`,
      });
    }

    if (edge.rate === 0) {
      addCandidate(candidates, snapshot, {
        type: 'target_dummy',
        title: '🧸 BỊCH BÔNG GIẢI TRÍ',
        group: 'opponent',
        participantIds: [edge.playerId, edge.otherId],
        rarity: edge.total >= 6 ? 'epic' : 'rare',
        frequency: 'rare',
        baseWeight: 72,
        evidenceStrength: evidence(edge.total),
        surpriseScore: edge.total * 4,
        text: `${edge.playerName} gặp ${edge.otherName} đang thua ${edge.losses}/${edge.total} trận, cứ đối đầu là hơi bị át vía.`,
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
        text: `${edge.playerName} gặp ${edge.otherName} thì đánh thấp hơn kỳ vọng từ ELO ${absRound(edge.impact)} điểm, dấu hiệu khớp kèo khá rõ.`,
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
        text: `${edge.playerName} gặp ${edge.otherName} đang thắng ${edge.wins}/${edge.total} trận và cao hơn kỳ vọng từ ELO ${edge.impact} điểm, kèo này khá thơm.`,
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
        text: `${metric.name} có ${metric.winsVsHigherElo} lần thắng đối thủ ELO cao hơn, thợ săn trùm hơi uy tín.`,
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
        text: `${metric.name} thắng ${metric.winsVsLowerElo} trận trước nhóm ELO thấp hơn, farm kèo mềm khá đều tay.`,
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
        text: `${metric.name} gặp nhóm ELO cao hơn đang thua ${metric.lossesVsHigherElo}/${metric.totalVsHigherElo} trận, lịch đấu này không dễ thở.`,
      });
    }
  });
}

function addFunCandidates(candidates: InsightCandidate[], snapshot: AnalysisSnapshot) {
  const active = snapshot.playerMetrics.filter(metric => metric.total > 0);
  const topActivity = [...active].sort((a, b) => b.total - a.total || b.dailyMaxMatches - a.dailyMaxMatches)[0];
  const topFine = [...active].sort((a, b) => b.money - a.money || b.losses - a.losses)[0];

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
        text: `${metric.name} đã đánh ${metric.total} trận, nhiều nhất sân, đúng chất máy cày không biết mệt.`,
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
        text: `Form gần đây của ${metric.name} nhảy ${pattern(metric.recentResults)} liên tục, đúng kiểu máy test vợt.`,
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

function selectInsights(candidates: InsightCandidate[], limit = 8) {
  const finalInsights: InsightCandidate[] = [];
  const playerMentions = new Map<string, number>();
  const playerGroups = new Map<string, Set<InsightGroup>>();
  const usedTypes = new Set<string>();

  const scored = [...candidates].sort((a, b) => {
    return selectionScore(b) - selectionScore(a) || b.evidenceStrength - a.evidenceStrength || b.surpriseScore - a.surpriseScore;
  });

  for (const candidate of scored) {
    if (finalInsights.length >= limit) break;
    if (usedTypes.has(candidate.type)) continue;

    let canUse = true;
    for (const participantId of candidate.participantIds) {
      if ((playerMentions.get(participantId) || 0) >= 2) {
        canUse = false;
        break;
      }
      if (playerGroups.get(participantId)?.has(candidate.group)) {
        canUse = false;
        break;
      }
    }

    if (!canUse) continue;

    finalInsights.push(candidate);
    usedTypes.add(candidate.type);
    candidate.participantIds.forEach(participantId => {
      playerMentions.set(participantId, (playerMentions.get(participantId) || 0) + 1);
      if (!playerGroups.has(participantId)) playerGroups.set(participantId, new Set());
      playerGroups.get(participantId)!.add(candidate.group);
    });
  }

  return finalInsights.map(candidate => ({
    type: candidate.type,
    title: candidate.title,
    text: candidate.text,
    playersInvolved: candidate.playersInvolved,
    rarity: candidate.rarity,
    weight: candidate.weight,
  }));
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
    selectionScore: Math.round(selectionScore(candidate)),
    text: candidate.text,
  }));
}

export function generateInsightsFromSnapshot(snapshot: AnalysisSnapshot): Insight[] {
  const candidates: InsightCandidate[] = [];
  addFormAndEloCandidates(candidates, snapshot);
  addStoryCandidates(candidates, snapshot);
  addPartnerCandidates(candidates, snapshot);
  addScoreCandidates(candidates, snapshot);
  addOpponentCandidates(candidates, snapshot);
  addFunCandidates(candidates, snapshot);
  return selectInsights(candidates, 8);
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
