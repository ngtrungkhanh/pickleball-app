import {
  buildAnalysisElo,
  buildAnalysisSnapshot,
  getAnalysisName,
  type AnalysisMatch,
  type AnalysisPlayer,
  type AnalysisSnapshot,
  type MatchExpected,
} from './analysis-core';
import { generateInsightsFromSnapshot } from './insights';

export type Player = AnalysisPlayer;
export type Match = AnalysisMatch;
export type MatrixRow = {
  playerId: string;
  player: string;
  partnerId?: string;
  partner?: string;
  opponentId?: string;
  opponent?: string;
  total: number;
  wins: number;
  losses: number;
  rate: number;
  impact?: number;
  baselinePs?: number;
  partnerPs?: number;
  actualPs?: number;
  confidence?: number;
  label?: string;
  explanation?: string;
};
export type Insight = { type: string; title?: string; text: string; icon?: string; playersInvolved?: string[] };

let lastSnapshot: AnalysisSnapshot | null = null;

function snapshot(players: Player[], matches: Match[], loseMoney = 5000) {
  lastSnapshot = buildAnalysisSnapshot(players, matches, loseMoney);
  return lastSnapshot;
}

export function buildElo(players: Player[], matches: Match[]) {
  return buildAnalysisElo(players, matches);
}

export function getPlayerAnalysis(playerId: string, players: Player[], matches: Match[], matchExpected?: MatchExpected) {
  const snap = snapshot(players, matches);
  const profile = snap.profiles.get(playerId);
  const stats = profile?.stats || null;
  const bestPartner = profile?.bestPartner;
  const toughest = profile?.toughestOpponent;
  const easiest = profile?.easiestOpponent;

  return {
    rank: profile?.rank || 0,
    stats,
    adv: {
      recent: stats?.recentResults || [],
      formComment: stats?.recentResults.join('') || 'Chưa có dữ liệu',
      formTrend: '',
      rivalSample: {
        playerTotal: stats?.total || 0,
        maxMeetings: Math.max(0, ...snap.opponentEdges.filter(edge => edge.playerId === playerId).map(edge => edge.total)),
      },
      bestPartner: bestPartner ? {
        id: bestPartner.partnerId,
        name: bestPartner.partnerName,
        total: bestPartner.total,
        wins: bestPartner.wins,
        rate: bestPartner.rate,
        avgDiff: bestPartner.avgDiff,
        label: bestPartner.label,
        note: bestPartner.explanation,
        impact: bestPartner.impact,
      } : null,
      bestPartnerFallback: {
        main: 'Chưa có cặp ăn ý',
        metric: 'Chưa đủ mẫu',
        note: 'Chờ thêm trận chung',
      },
      toughestRival: toughest ? {
        id: toughest.opponentId,
        name: toughest.opponentName,
        total: toughest.total,
        losses: toughest.losses,
        lossRate: 100 - toughest.rate,
        avgDiff: toughest.avgDiff,
        label: toughest.label,
        note: toughest.explanation,
        impact: toughest.impact,
      } : null,
      toughestRivalFallback: {
        main: 'Chưa có kèo khó',
        metric: 'Chưa đủ mẫu',
        note: 'Đánh thêm rồi tính',
      },
      easiestRival: easiest ? {
        id: easiest.opponentId,
        name: easiest.opponentName,
        total: easiest.total,
        wins: easiest.wins,
        winRate: easiest.rate,
        avgDiff: easiest.avgDiff,
        label: easiest.label,
        note: easiest.explanation,
        impact: easiest.impact,
      } : null,
      easiestRivalFallback: {
        main: 'Chưa có kèo thơm',
        metric: 'Chưa đủ mẫu',
        note: 'Đánh thêm rồi tính',
      },
    },
    recent: profile?.recent || [],
    lastMatch: profile?.lastMatch ?? null,
    streak: profile?.streak || '--',
    radar: profile?.radar || { attack: 0, defense: 0, brave: 0, synergy: 50, form: 50, experience: 0 },
    overallPS: profile?.overallPS || 0,
    matchExpected,
  };
}

export function buildPartnerRows(players: Player[], matches: Match[], _matchExpected?: MatchExpected): MatrixRow[] {
  void _matchExpected;
  return snapshot(players, matches).partnerEdges.map(edge => ({
    playerId: edge.playerId,
    player: edge.playerName,
    partnerId: edge.partnerId,
    partner: edge.partnerName,
    total: edge.total,
    wins: edge.wins,
    losses: edge.losses,
    rate: Math.round(edge.rate),
    impact: edge.impact,
    baselinePs: edge.baselinePs,
    partnerPs: edge.actualPs,
    actualPs: edge.actualPs,
    confidence: edge.confidence,
    label: edge.label,
    explanation: edge.explanation,
  }));
}

export function buildOpponentRows(players: Player[], matches: Match[], _matchExpected?: MatchExpected): MatrixRow[] {
  void _matchExpected;
  return snapshot(players, matches).opponentEdges.map(edge => ({
    playerId: edge.playerId,
    player: edge.playerName,
    opponentId: edge.opponentId,
    opponent: edge.opponentName,
    total: edge.total,
    wins: edge.wins,
    losses: edge.losses,
    rate: Math.round(edge.rate),
    impact: edge.impact,
    baselinePs: edge.baselinePs,
    partnerPs: edge.actualPs,
    actualPs: edge.actualPs,
    confidence: edge.confidence,
    label: edge.label,
    explanation: edge.explanation,
  }));
}

export function getName(players: Player[], id?: string | null) {
  return getAnalysisName(players, id);
}

export function getInsights(_board: unknown[], _elo: unknown, matches: Match[], players: Player[], _matchExpected?: MatchExpected): Insight[] {
  void _board;
  void _elo;
  void _matchExpected;
  const snap = lastSnapshot && lastSnapshot.matches === matches ? lastSnapshot : snapshot(players, matches);
  return generateInsightsFromSnapshot(snap);
}

export { buildAnalysisSnapshot };
