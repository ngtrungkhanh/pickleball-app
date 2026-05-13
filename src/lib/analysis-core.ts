import { isGuestId, isRankingMatch } from './guest';

export type AnalysisPlayer = {
  id: string;
  name: string;
  active?: boolean;
};

export type AnalysisMatch = {
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

export type MatchExpected = Map<string, {
  winProb: number;
  loseProb: number;
  winRating: number;
  loseRating: number;
}>;

export type EloResult = {
  rating: Map<string, number>;
  history: Array<{ date: string; ratings: Record<string, number> }>;
  matchExpected: MatchExpected;
};

export type PlayerMetrics = AnalysisPlayer & {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  money: number;
  rating: number;
  pointsFor: number;
  pointsConceded: number;
  avgPointsFor: number;
  avgConceded: number;
  attackScore: number;
  defenseScore: number;
  braveScore: number;
  synergyScore: number;
  formScore: number;
  activityScore: number;
  overallPs: number;
  streakCount: number;
  streakType: 'W' | 'L' | '';
  streak: string;
  recentResults: Array<'W' | 'L'>;
  recentMatches: AnalysisMatch[];
  lastMatch: AnalysisMatch | null;
  lastMatchDate: string;
  daysAbsent: number | null;
  dailyMaxMatches: number;
  closeWins: number;
  closeLosses: number;
  dominantWins: number;
  dominantLosses: number;
  deuceMatches: number;
  bagelLosses: number;
  lowScoreLosses: number;
  avgWinDiff: number;
  avgLossDiff: number;
  upsetWins: number;
  upsetLosses: number;
  recentEloDelta: number;
  winsVsHigherElo: number;
  lossesVsHigherElo: number;
  totalVsHigherElo: number;
  winsVsLowerElo: number;
  totalVsLowerElo: number;
  alternations: number;
};

export type AnalysisEdgeKind = 'partner' | 'opponent';

export type AnalysisEdge = {
  kind: AnalysisEdgeKind;
  playerId: string;
  playerName: string;
  otherId: string;
  otherName: string;
  partnerId?: string;
  partnerName?: string;
  opponentId?: string;
  opponentName?: string;
  total: number;
  wins: number;
  losses: number;
  rate: number;
  avgDiff: number;
  baselinePs: number;
  actualPs: number;
  impact: number;
  confidence: number;
  label: string;
  explanation: string;
  recentResults: Array<'W' | 'L'>;
  closeGames: number;
  deuceGames: number;
};

export type PlayerProfile = {
  rank: number;
  stats: PlayerMetrics | null;
  recent: AnalysisMatch[];
  lastMatch: AnalysisMatch | null;
  streak: string;
  radar: {
    attack: number;
    defense: number;
    brave: number;
    synergy: number;
    form: number;
    experience: number;
  };
  overallPS: number;
  bestPartner: AnalysisEdge | null;
  toughestOpponent: AnalysisEdge | null;
  easiestOpponent: AnalysisEdge | null;
};

export type AnalysisSnapshot = {
  players: AnalysisPlayer[];
  visiblePlayers: AnalysisPlayer[];
  matches: AnalysisMatch[];
  visibleMatches: AnalysisMatch[];
  rankingMatches: AnalysisMatch[];
  elo: EloResult;
  metrics: Map<string, PlayerMetrics>;
  playerMetrics: PlayerMetrics[];
  board: PlayerMetrics[];
  partnerEdges: AnalysisEdge[];
  opponentEdges: AnalysisEdge[];
  profiles: Map<string, PlayerProfile>;
};

function ids(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value));
}

function sideIds(match: AnalysisMatch) {
  return {
    winners: ids([match.win_1, match.win_2]),
    losers: ids([match.lose_1, match.lose_2]),
  };
}

function isFullDoublesMatch(match: AnalysisMatch) {
  const { winners, losers } = sideIds(match);
  return winners.length === 2 && losers.length === 2;
}

function numberValue(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function matchTime(match: AnalysisMatch) {
  return new Date(String(match.date || '')).getTime() || 0;
}

function sortNewestFirst(matches: AnalysisMatch[]) {
  return [...matches].sort((a, b) => matchTime(b) - matchTime(a));
}

function sortChronological(matches: AnalysisMatch[]) {
  return [...matches].sort((a, b) => matchTime(a) - matchTime(b));
}

function dayKey(match: AnalysisMatch) {
  if (!match.date) return '';
  const date = new Date(match.date);
  if (Number.isNaN(date.getTime())) return String(match.date).split('T')[0] || '';
  return date.toISOString().split('T')[0];
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sampleConfidence(total: number) {
  if (total >= 12) return 1;
  if (total >= 8) return 0.94;
  if (total >= 6) return 0.86;
  if (total >= 4) return 0.74;
  if (total >= 3) return 0.55;
  return 0.35;
}

function playerInMatch(match: AnalysisMatch, playerId: string) {
  return match.win_1 === playerId || match.win_2 === playerId || match.lose_1 === playerId || match.lose_2 === playerId;
}

function resultForPlayer(match: AnalysisMatch, playerId: string): 'W' | 'L' {
  return match.win_1 === playerId || match.win_2 === playerId ? 'W' : 'L';
}

function scoreDiffForPlayer(match: AnalysisMatch, playerId: string) {
  const winScore = numberValue(match.win_score);
  const loseScore = numberValue(match.lose_score);
  return resultForPlayer(match, playerId) === 'W' ? winScore - loseScore : loseScore - winScore;
}

function pointsForPlayer(match: AnalysisMatch, playerId: string) {
  return resultForPlayer(match, playerId) === 'W' ? numberValue(match.win_score) : numberValue(match.lose_score);
}

function pointsConcededByPlayer(match: AnalysisMatch, playerId: string) {
  return resultForPlayer(match, playerId) === 'W' ? numberValue(match.lose_score) : numberValue(match.win_score);
}

function partnerForPlayer(match: AnalysisMatch, playerId: string) {
  if (!playerInMatch(match, playerId)) return '';
  const partnerId = resultForPlayer(match, playerId) === 'W'
    ? (match.win_1 === playerId ? match.win_2 : match.win_1)
    : (match.lose_1 === playerId ? match.lose_2 : match.lose_1);
  return typeof partnerId === 'string' && !isGuestId(partnerId) ? partnerId : '';
}

function opponentIdsForPlayer(match: AnalysisMatch, playerId: string) {
  if (!playerInMatch(match, playerId)) return [];
  const opponents = resultForPlayer(match, playerId) === 'W'
    ? [match.lose_1, match.lose_2]
    : [match.win_1, match.win_2];
  return opponents.filter((id): id is string => typeof id === 'string' && !isGuestId(id));
}

function expectedForPlayer(match: AnalysisMatch, playerId: string, matchExpected: MatchExpected) {
  if (!match.id || !playerInMatch(match, playerId)) return null;
  const expected = matchExpected.get(match.id);
  if (!expected) return null;
  return resultForPlayer(match, playerId) === 'W' ? expected.winProb : expected.loseProb;
}

function teamRatingForPlayer(match: AnalysisMatch, playerId: string, matchExpected: MatchExpected) {
  if (!match.id || !playerInMatch(match, playerId)) return null;
  const expected = matchExpected.get(match.id);
  if (!expected) return null;
  return resultForPlayer(match, playerId) === 'W'
    ? { own: expected.winRating, opponent: expected.loseRating }
    : { own: expected.loseRating, opponent: expected.winRating };
}

function countCurrentStreak(results: Array<'W' | 'L'>) {
  const first = results[0];
  if (!first) return { type: '' as const, count: 0 };
  let count = 0;
  for (const result of results) {
    if (result !== first) break;
    count++;
  }
  return { type: first, count };
}

function countAlternations(results: Array<'W' | 'L'>) {
  let count = 0;
  for (let i = 1; i < results.length; i++) {
    if (results[i] !== results[i - 1]) count++;
  }
  return count;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function getAnalysisName(players: AnalysisPlayer[], id?: string | null) {
  if (!players || !Array.isArray(players)) return id || '--';
  return players.find(player => player.id === id)?.name || id || '--';
}

export function buildAnalysisElo(players: AnalysisPlayer[], matches: AnalysisMatch[]): EloResult {
  const rating = new Map(players.map(player => [player.id, 1000]));
  const matchCount = new Map(players.map(player => [player.id, 0]));
  const history: EloResult['history'] = [];
  const matchExpected: MatchExpected = new Map();

  sortChronological(matches).forEach(match => {
    const { winners, losers } = sideIds(match);
    if (winners.length !== 2 || losers.length !== 2) return;

    const winAvg = winners.reduce((sum, id) => sum + (rating.get(id) ?? 1000), 0) / winners.length;
    const loseAvg = losers.reduce((sum, id) => sum + (rating.get(id) ?? 1000), 0) / losers.length;
    const expected = 1 / (1 + Math.pow(10, (loseAvg - winAvg) / 400));

    if (match.id) {
      matchExpected.set(match.id, { winProb: expected, loseProb: 1 - expected, winRating: winAvg, loseRating: loseAvg });
    }

    const getK = (id: string) => {
      const count = matchCount.get(id) || 0;
      if (count < 20) return 40;
      if (count > 50) return 16;
      return 24;
    };
    const avgK = (
      winners.reduce((sum, id) => sum + getK(id), 0)
      + losers.reduce((sum, id) => sum + getK(id), 0)
    ) / (winners.length + losers.length);

    const scoreDiff = Math.abs(numberValue(match.win_score) - numberValue(match.lose_score));
    const eloDiff = winAvg - loseAvg;
    const multiplier = Math.log(scoreDiff + 1) * (2.2 / (eloDiff * 0.001 + 2.2));
    const delta = avgK * (1 - expected) * multiplier;

    winners.forEach(id => {
      rating.set(id, Math.round((rating.get(id) ?? 1000) + delta));
      matchCount.set(id, (matchCount.get(id) || 0) + 1);
    });
    losers.forEach(id => {
      rating.set(id, Math.round((rating.get(id) ?? 1000) - delta));
      matchCount.set(id, (matchCount.get(id) || 0) + 1);
    });

    history.push({ date: match.date || '', ratings: Object.fromEntries(rating) });
  });

  return { rating, history, matchExpected };
}

export function calculatePerformanceScore(playerId: string, matches: AnalysisMatch[], matchExpected: MatchExpected) {
  let totalActual = 0;
  let totalExpected = 0;
  let counted = 0;

  matches.forEach(match => {
    if (!match.id || !playerInMatch(match, playerId)) return;
    const expected = matchExpected.get(match.id);
    if (!expected) return;

    const isWin = resultForPlayer(match, playerId) === 'W';
    totalActual += isWin ? 1 : 0;
    totalExpected += isWin ? expected.winProb : expected.loseProb;
    counted++;
  });

  return counted > 0 ? (totalActual - totalExpected) / counted : 0;
}

function edgeLabel(kind: AnalysisEdgeKind, impact: number) {
  if (Math.abs(impact) <= 5) return kind === 'partner' ? 'Tròn vai' : 'Cân kèo';
  if (kind === 'partner') return impact > 0 ? 'Hợp cạ' : 'Kỵ cạ';
  return impact > 0 ? 'Kèo thơm' : 'Kèo khó';
}

function edgeExplanation(kind: AnalysisEdgeKind, otherName: string, impact: number) {
  const absImpact = Math.abs(impact);
  if (kind === 'partner') {
    if (Math.abs(impact) <= 5) {
      return `Đánh chung với ${otherName}, kết quả gần đúng mức kỳ vọng từ ELO.`;
    }
    return impact > 0
      ? `Đánh chung với ${otherName}, kết quả cao hơn kỳ vọng từ ELO ${absImpact} điểm.`
      : `Đánh chung với ${otherName}, kết quả thấp hơn kỳ vọng từ ELO ${absImpact} điểm.`;
  }

  if (Math.abs(impact) <= 5) {
    return `Gặp ${otherName}, kết quả gần đúng mức kỳ vọng từ ELO.`;
  }
  return impact > 0
    ? `Gặp ${otherName}, kết quả cao hơn kỳ vọng từ ELO ${absImpact} điểm.`
    : `Gặp ${otherName}, kết quả thấp hơn kỳ vọng từ ELO ${absImpact} điểm.`;
}

function edgeConfidence(total: number, rate: number, avgDiff: number, impact: number, recentResults: Array<'W' | 'L'>) {
  const recentWins = recentResults.slice(0, 3).filter(result => result === 'W').length;
  const recentBonus = recentWins === 3 ? 7 : recentWins === 2 ? 3 : 0;
  return rate * sampleConfidence(total)
    + total * 1.3
    + Math.abs(avgDiff) * 1.5
    + Math.abs(impact) * 0.8
    + recentBonus;
}

function ratingAtOrBefore(history: EloResult['history'], playerId: string, time: number) {
  let value: number | null = null;
  history.forEach(point => {
    const pointTime = new Date(point.date || '').getTime() || 0;
    if (pointTime <= time && typeof point.ratings[playerId] === 'number') {
      value = point.ratings[playerId];
    }
  });
  return value;
}

function buildPlayerMetrics(
  players: AnalysisPlayer[],
  visibleMatches: AnalysisMatch[],
  rankingMatches: AnalysisMatch[],
  elo: EloResult,
  loseMoney: number,
  now = new Date()
) {
  const maxMatches = Math.max(
    1,
    ...players.map(player => rankingMatches.filter(match => playerInMatch(match, player.id)).length)
  );

  return players.map(player => {
    const playerMatches = rankingMatches.filter(match => playerInMatch(match, player.id));
    const recentMatches = playerMatches.slice(0, 10);
    const recentResults = playerMatches.slice(0, 8).map(match => resultForPlayer(match, player.id));
    const wins = playerMatches.filter(match => resultForPlayer(match, player.id) === 'W').length;
    const losses = playerMatches.length - wins;
    const total = playerMatches.length;
    const pointsFor = playerMatches.reduce((sum, match) => sum + pointsForPlayer(match, player.id), 0);
    const pointsConceded = playerMatches.reduce((sum, match) => sum + pointsConcededByPlayer(match, player.id), 0);
    const diffs = playerMatches.map(match => scoreDiffForPlayer(match, player.id));
    const closeWins = diffs.filter(diff => diff > 0 && diff <= 2).length;
    const closeLosses = diffs.filter(diff => diff < 0 && diff >= -2).length;
    const dominantWins = diffs.filter(diff => diff >= 7).length;
    const dominantLosses = diffs.filter(diff => diff <= -7).length;
    const deuceMatches = playerMatches.filter(match => numberValue(match.win_score) > 11).length;
    const bagelLosses = playerMatches.filter(match => resultForPlayer(match, player.id) === 'L' && numberValue(match.lose_score) <= 2).length;
    const lowScoreLosses = playerMatches.filter(match => resultForPlayer(match, player.id) === 'L' && numberValue(match.lose_score) <= 4).length;
    const winDiffs = diffs.filter(diff => diff > 0);
    const lossDiffs = diffs.filter(diff => diff < 0);
    const avgWinDiff = average(winDiffs);
    const avgLossDiff = Math.abs(average(lossDiffs));
    const dailyCounts = new Map<string, number>();

    playerMatches.forEach(match => {
      const key = dayKey(match);
      if (!key) return;
      dailyCounts.set(key, (dailyCounts.get(key) || 0) + 1);
    });

    const upsetWins = playerMatches.filter(match => {
      if (!match.id || resultForPlayer(match, player.id) !== 'W') return false;
      const expected = expectedForPlayer(match, player.id, elo.matchExpected);
      return expected !== null && expected < 0.3;
    }).length;
    const upsetLosses = playerMatches.filter(match => {
      if (!match.id || resultForPlayer(match, player.id) !== 'L') return false;
      const expected = expectedForPlayer(match, player.id, elo.matchExpected);
      return expected !== null && expected > 0.7;
    }).length;
    const teamRatingRows = playerMatches
      .map(match => ({ match, ratings: teamRatingForPlayer(match, player.id, elo.matchExpected) }))
      .filter((row): row is { match: AnalysisMatch; ratings: { own: number; opponent: number } } => Boolean(row.ratings));
    const vsHigher = teamRatingRows.filter(row => row.ratings.own < row.ratings.opponent);
    const vsLower = teamRatingRows.filter(row => row.ratings.own > row.ratings.opponent);
    const winsVsHigherElo = vsHigher.filter(row => resultForPlayer(row.match, player.id) === 'W').length;
    const lossesVsHigherElo = vsHigher.length - winsVsHigherElo;
    const winsVsLowerElo = vsLower.filter(row => resultForPlayer(row.match, player.id) === 'W').length;

    const streak = countCurrentStreak(playerMatches.slice(0, 20).map(match => resultForPlayer(match, player.id)));
    const last5 = playerMatches.slice(0, 5);
    const formScore = last5.length > 0
      ? (last5.filter(match => resultForPlayer(match, player.id) === 'W').length / last5.length) * 100
      : 50;
    const overallPs = calculatePerformanceScore(player.id, playerMatches, elo.matchExpected);
    const partnerWinRates = new Map<string, { wins: number; total: number }>();
    playerMatches.forEach(match => {
      const partnerId = partnerForPlayer(match, player.id);
      if (!partnerId) return;
      const current = partnerWinRates.get(partnerId) || { wins: 0, total: 0 };
      current.total++;
      if (resultForPlayer(match, player.id) === 'W') current.wins++;
      partnerWinRates.set(partnerId, current);
    });
    const synergyScore = partnerWinRates.size > 0
      ? average(Array.from(partnerWinRates.values()).map(stat => (stat.wins / stat.total) * 100))
      : 50;
    const lastMatch = playerMatches[0] || null;
    const lastMatchDate = lastMatch?.date || '';
    const lastMatchMs = lastMatch ? matchTime(lastMatch) : 0;
    const oldRecentMatch = playerMatches[Math.min(9, playerMatches.length - 1)] || null;
    const oldRecentRating = oldRecentMatch && playerMatches.length >= 5
      ? ratingAtOrBefore(elo.history, player.id, matchTime(oldRecentMatch))
      : null;
    const recentEloDelta = oldRecentRating === null ? 0 : (elo.rating.get(player.id) ?? 1000) - oldRecentRating;
    const daysAbsent = lastMatchMs > 0 ? Math.floor((now.getTime() - lastMatchMs) / 86400000) : null;
    const money = visibleMatches.reduce((sum, match) => {
      return sum + ([match.lose_1, match.lose_2].includes(player.id) && !isGuestId(player.id) ? loseMoney : 0);
    }, 0);

    return {
      ...player,
      total,
      wins,
      losses,
      winRate: total > 0 ? (wins / total) * 100 : 0,
      money,
      rating: elo.rating.get(player.id) ?? 1000,
      pointsFor,
      pointsConceded,
      avgPointsFor: total > 0 ? pointsFor / total : 0,
      avgConceded: total > 0 ? pointsConceded / total : 0,
      attackScore: total > 0 ? clamp((pointsFor / (total * 11)) * 100, 0, 100) : 0,
      defenseScore: total > 0 ? clamp(100 - (pointsConceded / (total * 11)) * 100, 0, 100) : 0,
      braveScore: clamp(50 + overallPs * 200, 0, 100),
      synergyScore,
      formScore,
      activityScore: Math.min(100, (total / maxMatches) * 100),
      overallPs,
      streakCount: streak.count,
      streakType: streak.type,
      streak: streak.count ? `${streak.count}${streak.type}` : '--',
      recentResults,
      recentMatches,
      lastMatch,
      lastMatchDate,
      daysAbsent,
      dailyMaxMatches: Math.max(0, ...Array.from(dailyCounts.values())),
      closeWins,
      closeLosses,
      dominantWins,
      dominantLosses,
      deuceMatches,
      bagelLosses,
      lowScoreLosses,
      avgWinDiff,
      avgLossDiff,
      upsetWins,
      upsetLosses,
      recentEloDelta,
      winsVsHigherElo,
      lossesVsHigherElo,
      totalVsHigherElo: vsHigher.length,
      winsVsLowerElo,
      totalVsLowerElo: vsLower.length,
      alternations: countAlternations(recentResults),
    } satisfies PlayerMetrics;
  });
}

function buildPartnerEdges(players: AnalysisPlayer[], rankingMatches: AnalysisMatch[], metrics: Map<string, PlayerMetrics>, elo: EloResult) {
  const edges: AnalysisEdge[] = [];

  players.forEach(player => {
    const playerMetric = metrics.get(player.id);
    if (!playerMetric) return;

    players.filter(partner => partner.id !== player.id).forEach(partner => {
      const sharedMatches = rankingMatches.filter(match => {
        const partnerId = partnerForPlayer(match, player.id);
        return partnerId === partner.id;
      });
      if (sharedMatches.length === 0) return;

      const wins = sharedMatches.filter(match => resultForPlayer(match, player.id) === 'W').length;
      const total = sharedMatches.length;
      const losses = total - wins;
      const rate = (wins / total) * 100;
      const diffs = sharedMatches.map(match => scoreDiffForPlayer(match, player.id));
      const avgDiff = average(diffs);
      const actualPsRaw = calculatePerformanceScore(player.id, sharedMatches, elo.matchExpected);
      const impact = total >= 4 ? Math.round((actualPsRaw - playerMetric.overallPs) * 100) : 0;
      const recentResults = sharedMatches.slice(0, 5).map(match => resultForPlayer(match, player.id));
      const label = total >= 4 ? edgeLabel('partner', impact) : 'Ít dữ liệu';
      const explanation = total >= 4
        ? edgeExplanation('partner', partner.name, impact)
        : `Mới đánh chung ${total} trận, chưa đủ mẫu để kết luận.`;

      edges.push({
        kind: 'partner',
        playerId: player.id,
        playerName: player.name,
        otherId: partner.id,
        otherName: partner.name,
        partnerId: partner.id,
        partnerName: partner.name,
        total,
        wins,
        losses,
        rate,
        avgDiff,
        baselinePs: Math.round(playerMetric.overallPs * 100),
        actualPs: Math.round(actualPsRaw * 100),
        impact,
        confidence: edgeConfidence(total, rate, avgDiff, impact, recentResults),
        label,
        explanation,
        recentResults,
        closeGames: diffs.filter(diff => Math.abs(diff) <= 2).length,
        deuceGames: sharedMatches.filter(match => numberValue(match.win_score) > 11).length,
      });
    });
  });

  return edges.sort((a, b) => b.confidence - a.confidence || b.total - a.total);
}

function buildOpponentEdges(players: AnalysisPlayer[], rankingMatches: AnalysisMatch[], metrics: Map<string, PlayerMetrics>, elo: EloResult) {
  const edges: AnalysisEdge[] = [];

  players.forEach(player => {
    const playerMetric = metrics.get(player.id);
    if (!playerMetric) return;

    players.filter(opponent => opponent.id !== player.id).forEach(opponent => {
      const opponentMatches = rankingMatches.filter(match => opponentIdsForPlayer(match, player.id).includes(opponent.id));
      if (opponentMatches.length === 0) return;

      const wins = opponentMatches.filter(match => resultForPlayer(match, player.id) === 'W').length;
      const total = opponentMatches.length;
      const losses = total - wins;
      const rate = (wins / total) * 100;
      const diffs = opponentMatches.map(match => scoreDiffForPlayer(match, player.id));
      const avgDiff = average(diffs);
      const actualPsRaw = calculatePerformanceScore(player.id, opponentMatches, elo.matchExpected);
      const impact = total >= 4 ? Math.round((actualPsRaw - playerMetric.overallPs) * 100) : 0;
      const recentResults = opponentMatches.slice(0, 5).map(match => resultForPlayer(match, player.id));
      const label = total >= 4 ? edgeLabel('opponent', impact) : 'Ít dữ liệu';
      const explanation = total >= 4
        ? edgeExplanation('opponent', opponent.name, impact)
        : `Mới đối đầu ${total} trận, chưa đủ mẫu để kết luận.`;

      edges.push({
        kind: 'opponent',
        playerId: player.id,
        playerName: player.name,
        otherId: opponent.id,
        otherName: opponent.name,
        opponentId: opponent.id,
        opponentName: opponent.name,
        total,
        wins,
        losses,
        rate,
        avgDiff,
        baselinePs: Math.round(playerMetric.overallPs * 100),
        actualPs: Math.round(actualPsRaw * 100),
        impact,
        confidence: edgeConfidence(total, rate, avgDiff, impact, recentResults),
        label,
        explanation,
        recentResults,
        closeGames: diffs.filter(diff => Math.abs(diff) <= 2).length,
        deuceGames: opponentMatches.filter(match => numberValue(match.win_score) > 11).length,
      });
    });
  });

  return edges.sort((a, b) => b.confidence - a.confidence || b.total - a.total);
}

function profileForPlayer(
  playerId: string,
  board: PlayerMetrics[],
  metrics: Map<string, PlayerMetrics>,
  partnerEdges: AnalysisEdge[],
  opponentEdges: AnalysisEdge[]
): PlayerProfile {
  const metric = metrics.get(playerId) || null;
  const rank = board.findIndex(player => player.id === playerId) + 1;
  const playerPartnerEdges = partnerEdges.filter(edge => edge.playerId === playerId && edge.total >= 4);
  const playerOpponentEdges = opponentEdges.filter(edge => edge.playerId === playerId && edge.total >= 4);

  const bestPartner = playerPartnerEdges
    .filter(edge => edge.impact > 5 || edge.rate > 55)
    .sort((a, b) => (b.impact - a.impact) || b.confidence - a.confidence || b.total - a.total)[0] || null;
  const toughestOpponent = playerOpponentEdges
    .filter(edge => edge.impact < -5 || edge.rate < 45)
    .sort((a, b) => (a.impact - b.impact) || b.confidence - a.confidence || b.total - a.total)[0] || null;
  const easiestOpponent = playerOpponentEdges
    .filter(edge => edge.impact > 5 || edge.rate > 55)
    .sort((a, b) => (b.impact - a.impact) || b.confidence - a.confidence || b.total - a.total)[0] || null;

  return {
    rank,
    stats: metric,
    recent: metric?.recentMatches || [],
    lastMatch: metric?.lastMatch || null,
    streak: metric?.streak || '--',
    radar: {
      attack: Math.round(metric?.attackScore || 0),
      defense: Math.round(metric?.defenseScore || 0),
      brave: Math.round(metric?.braveScore || 0),
      synergy: Math.round(metric?.synergyScore || 50),
      form: Math.round(metric?.formScore || 50),
      experience: Math.round(metric?.activityScore || 0),
    },
    overallPS: metric?.overallPs || 0,
    bestPartner,
    toughestOpponent,
    easiestOpponent,
  };
}

export function buildAnalysisSnapshot(
  players: AnalysisPlayer[],
  matches: AnalysisMatch[],
  loseMoney = 5000,
  now = new Date()
): AnalysisSnapshot {
  const visiblePlayers = players.filter(player => player.active !== false && !isGuestId(player.id));
  const visibleMatches = matches.filter(match => !match.deleted_at);
  const rankingMatches = sortNewestFirst(visibleMatches.filter(match => isRankingMatch(match) && isFullDoublesMatch(match)));
  const elo = buildAnalysisElo(visiblePlayers, rankingMatches);
  const playerMetrics = buildPlayerMetrics(visiblePlayers, visibleMatches, rankingMatches, elo, loseMoney, now);
  const metrics = new Map(playerMetrics.map(metric => [metric.id, metric]));
  const board = [...playerMetrics].sort((a, b) => b.rating - a.rating || b.winRate - a.winRate || b.wins - a.wins || a.name.localeCompare(b.name));
  const partnerEdges = buildPartnerEdges(visiblePlayers, rankingMatches, metrics, elo);
  const opponentEdges = buildOpponentEdges(visiblePlayers, rankingMatches, metrics, elo);
  const profiles = new Map(visiblePlayers.map(player => [
    player.id,
    profileForPlayer(player.id, board, metrics, partnerEdges, opponentEdges),
  ]));

  return {
    players,
    visiblePlayers,
    matches,
    visibleMatches,
    rankingMatches,
    elo,
    metrics,
    playerMetrics,
    board,
    partnerEdges,
    opponentEdges,
    profiles,
  };
}

export function verifyAnalysisSnapshot(snapshot: AnalysisSnapshot) {
  const errors: string[] = [];

  snapshot.playerMetrics.forEach(metric => {
    const partnerTotalMax = Math.max(0, ...snapshot.partnerEdges.filter(edge => edge.playerId === metric.id).map(edge => edge.total));
    const opponentTotalMax = Math.max(0, ...snapshot.opponentEdges.filter(edge => edge.playerId === metric.id).map(edge => edge.total));
    if (partnerTotalMax > metric.total) {
      errors.push(`${metric.name}: partner edge ${partnerTotalMax} exceeds real total ${metric.total}`);
    }
    if (opponentTotalMax > metric.total) {
      errors.push(`${metric.name}: opponent edge ${opponentTotalMax} exceeds real total ${metric.total}`);
    }
  });

  snapshot.partnerEdges.forEach(edge => {
    const directMatches = snapshot.rankingMatches.filter(match => partnerForPlayer(match, edge.playerId) === edge.otherId);
    if (directMatches.length !== edge.total) {
      errors.push(`${edge.playerName} + ${edge.otherName}: edge total ${edge.total} differs from direct count ${directMatches.length}`);
    }
  });

  snapshot.opponentEdges.forEach(edge => {
    const directMatches = snapshot.rankingMatches.filter(match => opponentIdsForPlayer(match, edge.playerId).includes(edge.otherId));
    if (directMatches.length !== edge.total) {
      errors.push(`${edge.playerName} vs ${edge.otherName}: edge total ${edge.total} differs from direct count ${directMatches.length}`);
    }
  });

  return errors;
}

export function edgeRecord(edge: AnalysisEdge) {
  return `${edge.wins}W-${edge.losses}L · ${Math.round(edge.rate)}% · ${edge.total} trận`;
}
