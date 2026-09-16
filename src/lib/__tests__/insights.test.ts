import { describe, expect, it } from 'vitest';
import { buildAnalysisSnapshot, type AnalysisMatch, type AnalysisSnapshot } from '../analysis-core';
import { applyLeaderboardEligibility } from '../leaderboard-eligibility';
import { calculateLeaderboard } from '../stats';
import { generateInsightCandidatesForDebug, generateInsightSelectionResultFromSnapshot, INSIGHT_TEXT_VARIANTS } from '../insights';

const players = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => ({ id, name: id.toUpperCase() }));
const now = new Date('2026-09-16T10:00:00+07:00');

function match(index: number, overrides: Partial<AnalysisMatch> = {}): AnalysisMatch {
  return {
    id: `m${index}`, date: new Date(Date.parse('2026-09-01T09:00:00+07:00') + index * 60000).toISOString(),
    win_1: 'a', win_2: 'b', lose_1: 'c', lose_2: 'd', win_score: 11, lose_score: 5,
    ...overrides,
  };
}

function snapshot(matches: AnalysisMatch[], roster = players) {
  return buildAnalysisSnapshot(roster, matches, 5000, {}, now);
}

function candidates(data: AnalysisSnapshot, type: string) {
  return generateInsightCandidatesForDebug(data).filter(row => row.type === type);
}

describe('expert insight evidence and wording', () => {
  it('uses the Dashboard eligibility rule instead of giving a 1/1 player a rank', () => {
    const matches = Array.from({ length: 40 }, (_, i) => match(i));
    matches.push(match(41, { win_1: 'e', win_2: 'f', lose_1: 'a', lose_2: 'b' }));
    const data = snapshot(matches);
    const dashboard = applyLeaderboardEligibility(calculateLeaderboard(players, matches));
    expect(dashboard.find(row => row.id === 'e')?.isEligible).toBe(false);
    const leader = candidates(data, 'rank_leader');
    expect(leader).toHaveLength(1);
    expect(leader[0].participants).toEqual([dashboard[0].name]);
    const rankRules = new Set(['rank_camper', 'elo_defied', 'elo_inflated', 'top1_time', 'rank_takeover', 'stuck_in_mud', 'spring_jump', 'vulture_win', 'charity_top_rank']);
    expect(generateInsightCandidatesForDebug(data).filter(row => rankRules.has(row.type)).every(row =>
      !row.participants.includes('E') && !row.participants.includes('F')
    )).toBe(true);
  });

  it('includes zero-match players when calculating eligibility', () => {
    const roster = [...players, ...Array.from({ length: 14 }, (_, i) => ({ id: `z${i}`, name: `Z${i}` }))];
    const matches = Array.from({ length: 80 }, (_, i) => match(i));
    for (let i = 80; i < 88; i++) matches.push(match(i, { win_1: 'e', win_2: 'f', lose_1: 'a', lose_2: 'b' }));
    const data = snapshot(matches, roster);
    // E qualifies with the full visible roster, unlike a played-only threshold.
    expect(applyLeaderboardEligibility(calculateLeaderboard(roster, matches)).find(row => row.id === 'e')?.isEligible).toBe(true);
    expect(candidates(data, 'rank_leader')[0]?.participants).toEqual(['E']);
  });

  it('counts 1–2 point gaps and includes losses with exactly four points', () => {
    const scores = [10, 9, 10, 4, 4, 4, 0];
    const data = snapshot(scores.map((lose_score, i) => match(i, { lose_score, win_score: i === 6 ? 15 : 11 })));
    const metric = data.metrics.get('c')!;
    expect(metric.closeLosses).toBe(3);
    expect(metric.lowScoreLosses).toBe(4);
    expect(candidates(data, 'close_loss').find(row => row.participants[0] === 'C')?.text).toMatch(/3/);
    expect(INSIGHT_TEXT_VARIANTS.close_loss({ metric }).every(text => /không quá 2|1–2/.test(text))).toBe(true);
    expect(INSIGHT_TEXT_VARIANTS.low_score_magnet({ metric }).every(text => /không quá 4|0 đến 4/.test(text))).toBe(true);
    const whitewash = candidates(data, 'golden_victim').find(row => row.participants[0] === 'C');
    expect(whitewash?.text).toMatch(/1/);
    expect(whitewash?.text).not.toContain('11-0');
  });

  it('does not infer duration or late-game events from the final score', () => {
    const data = snapshot(Array.from({ length: 10 }, (_, i) => match(i, { lose_score: 9 })));
    const quick = candidates(data, 'quick_finisher');
    expect(quick.length).toBeGreaterThan(0);
    expect(quick[0].text).toContain('7 ngày tính đến 01/09/2026');
    expect(quick[0].text).toMatch(/không quá 11|vượt 11/);
    expect(quick[0].text).not.toMatch(/chóng vánh|thua sớm|rất nhanh/);
    expect(candidates(data, 'late_collapse')[0].text).not.toMatch(/cuối trận|hụt hơi|loạt bóng/);
  });

  it('requires three matches per successful partner and only counts qualifying partners', () => {
    const matches: AnalysisMatch[] = [];
    for (const partner of ['b', 'c', 'd']) {
      for (let i = 0; i < 3; i++) matches.push(match(matches.length, { win_2: partner, lose_1: 'e', lose_2: 'f' }));
    }
    for (let i = 0; i < 3; i++) matches.push(match(matches.length, { win_1: 'b', win_2: 'c', lose_1: 'a', lose_2: 'e' }));
    const row = candidates(snapshot(matches), 'chameleon_partner').find(row => row.participants[0] === 'A');
    expect(row?.text).toMatch(/3 đồng đội/);
    expect(row?.text).not.toMatch(/với ai cũng|với tất cả/);
    const thin = snapshot(['b', 'c', 'd'].map((win_2, i) => match(i, { win_2, lose_1: 'e', lose_2: 'f' })));
    expect(candidates(thin, 'chameleon_partner')).toHaveLength(0);
  });

  it('only reports an unchanged rank for someone who played in the latest session', () => {
    const history = Array.from({ length: 20 }, (_, i) => match(i));
    const date = '2026-09-16T09:00:00+07:00';
    const data = snapshot([...history, match(21, { date, win_2: 'e', lose_1: 'b', lose_2: 'f' })]);
    expect(candidates(data, 'stuck_in_mud').flatMap(row => row.participants)).not.toContain('C');
    const played = snapshot([...history, match(21, { date })]);
    const rows = candidates(played, 'stuck_in_mud');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(row => row.text.includes('16/09/2026') && !row.text.includes('21 trận'))).toBe(true);
  });

  it('does not call a stable rank a leap when the ranked group is small', () => {
    const roster = players.map(player => ({ ...player, active: ['a', 'b'].includes(player.id) }));
    const data = snapshot([...Array.from({ length: 10 }, (_, i) => match(i)), match(11, { date: '2026-09-16T09:00:00+07:00' })], roster);
    expect(candidates(data, 'spring_jump')).toHaveLength(0);
    expect(candidates(data, 'money_blackhole')).toHaveLength(0);
  });

  it('detects a real rank takeover using the same before/after ranking rules', () => {
    const matches = Array.from({ length: 20 }, (_, i) => match(i, i % 2 ? {
      win_1: 'c', win_2: 'd', lose_1: 'a', lose_2: 'b',
    } : {}));
    matches.push(match(21, { date: '2026-09-16T09:00:00+07:00', win_1: 'c', win_2: 'd', lose_1: 'a', lose_2: 'b' }));
    const row = candidates(snapshot(matches), 'rank_takeover')[0];
    expect(row?.participants).toEqual(['C', 'A']);
    expect(row?.text).toContain('hạng 1');
    expect(row?.text).toContain('16/09/2026');
  });

  it('detects an actual move from the bottom group to the top after a session', () => {
    const matches = Array.from({ length: 3 }, (_, i) => match(i));
    for (let i = 0; i < 4; i++) matches.push(match(3 + i, {
      date: `2026-09-16T09:0${i}:00+07:00`, win_1: 'c', win_2: 'd', lose_1: 'a', lose_2: 'b',
    }));
    const rows = candidates(snapshot(matches), 'spring_jump');
    expect(rows.flatMap(row => row.participants)).toEqual(['C', 'D']);
    expect(rows.every(row => row.text.includes('16/09/2026'))).toBe(true);
  });

  it('uses name tie-breaks and eligibility for historical end-of-day leadership', () => {
    const roster = [{ id: 'b', name: 'Z' }, { id: 'a', name: 'A' }, { id: 'c', name: 'C' }, { id: 'd', name: 'D' }];
    const data = snapshot([...Array.from({ length: 8 }, (_, i) => match(i)), match(9, { date: '2026-09-16T09:00:00+07:00' })], roster);
    const row = candidates(data, 'top1_time')[0];
    expect(row?.participants).toEqual(['A']);
    expect(row?.text).toContain('15 ngày');
    expect(row?.text).toContain('mốc chốt ngày');
  });

  it('does not assert absence when viewing a historical season', () => {
    const data = snapshot(Array.from({ length: 10 }, (_, i) => match(i)));
    expect(candidates(data, 'missing_player').length).toBeGreaterThan(0);
    expect(generateInsightCandidatesForDebug(data, { includeAbsence: false }).some(row => row.type === 'missing_player')).toBe(false);
    for (let seed = 1; seed <= 10; seed++) {
      expect(generateInsightSelectionResultFromSnapshot(data, { seed, includeAbsence: false }).insights.some(row => row.type === 'missing_player')).toBe(false);
    }
  });

  it('groups late UTC matches in the Vietnamese playing day', () => {
    const data = snapshot(Array.from({ length: 3 }, (_, i) => match(i, { date: `2026-09-15T18:0${i}:00Z` })));
    expect(candidates(data, 'undefeated_session')[0].text).toContain('16/09/2026');
  });

  it('reports calculated fines including Guest losses without claiming payment', () => {
    const data = snapshot([match(0, { win_2: '__GUEST__' })]);
    const row = candidates(data, 'fine_sponsor')[0];
    expect(row?.text).toContain('5.000đ');
    expect(row?.text).toContain('được tính');
    expect(row?.text).not.toMatch(/đã đóng|đã nộp|0 trận/);
  });

  it('renders every text variant without missing values or leftover English', () => {
    const data = snapshot(Array.from({ length: 10 }, (_, i) => match(i)));
    const metric = data.metrics.get('a')!;
    const edge = data.partnerEdges[0];
    const context: Record<string, unknown> = {
      metric, topElo: metric, topRank: metric, otherMetric: metric, playerAbove: metric,
      Rank_above: metric, bottom1: metric, topFine: metric, A: metric, B: metric, C: metric,
      player: metric, target: metric, opponent: metric, partner: metric, playerB: metric, playerA: metric,
      edge, glued: edge, mostRepeated: edge, launchpadEdge: edge, partnerEdge: edge,
      places: 2, recentWins: 4, avgLossDiff: 6, tightWinRate: 75, kingWins: 6, diff: 1.2,
      winShareFromPartner: 0.7, winRateWithoutPartner: 20, winsWithoutPartner: 1, totalWithoutPartner: 5,
      leaderboardRank: 2, targetRank: 1, newRank: 2, daysAtTop1: 15, Rank: 3, wins: 5,
      percent: 90, sessionTotal: 4, count: 3, goldenPickled: 2, avgMatches: 10, eloRank: 4,
      recentLosses: 4, tightMatches: 5, recentLossesVsBottom1: 2, perfectSessionCount: 2,
      latestPerfectSessionTotal: 4, bestPerfectSessionTotal: 5, X: 2, Y: 2,
      kingName: 'B', gapText: '5 trận thắng', sessionDate: '16/09/2026',
      latestPerfectSessionDate: '16/09/2026', bestPerfectSessionDate: '15/09/2026',
      breaker: { streak: 4 }, row: { priorStreak: 4 }, attendance: { matchesPerSession: 5 },
      bottomPartnerMatches: [match(1)], partnerMatches: [match(1), match(2)],
      revenge: { priorLosses: 4, recentWins: 3, recentTotal: 4 },
    };
    for (const [name, render] of Object.entries(INSIGHT_TEXT_VARIANTS)) {
      const variants = (render as (ctx: unknown) => string[])(context);
      expect(variants.length, name).toBeGreaterThanOrEqual(2);
      for (const text of variants) {
        expect(text, name).not.toMatch(/undefined|NaN|Infinity|\bwith\b|\band\b|lọt lưới|cục tạ|điểm số cá nhân/);
        expect(text.length, name).toBeGreaterThan(20);
      }
    }
  });
});
