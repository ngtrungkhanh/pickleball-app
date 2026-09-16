import { describe, expect, it } from 'vitest';
import { applyLeaderboardEligibility } from '../leaderboard-eligibility';
import { calculateLeaderboard } from '../stats';

describe('leaderboard participation', () => {
  it('moves Chung below qualified players in Season 5 without changing their order', () => {
    const input = [5, 48, 30, 50, 53, 39].map((total, id) => ({ id, total }));
    const board = applyLeaderboardEligibility(input);
    expect(board.map(p => p.id)).toEqual([1, 2, 3, 4, 5, 0]);
    expect(board[5]).toMatchObject({ requiredMatches: 11, isEligible: false });
    expect(input[0].id).toBe(0);
  });

  it('qualifies 15 matches even below 25%, including Tung with 17 matches', () => {
    for (const total of [15, 17]) {
      expect(applyLeaderboardEligibility([{ total }, { total: 100 }])[0])
        .toMatchObject({ total, requiredMatches: 15, isEligible: true });
    }
    expect(applyLeaderboardEligibility([{ total: 14 }, { total: 100 }])[1].isEligible).toBe(false);
  });

  it('accepts exactly 25% and rounds fractional thresholds up', () => {
    expect(applyLeaderboardEligibility([{ total: 10 }, { total: 40 }])[0].isEligible).toBe(true);
    expect(applyLeaderboardEligibility([{ total: 10 }, { total: 41 }])[1])
      .toMatchObject({ total: 10, requiredMatches: 11, isEligible: false });
  });

  it('handles empty, zero-match and single-player boards', () => {
    expect(applyLeaderboardEligibility([])).toEqual([]);
    expect(applyLeaderboardEligibility([{ total: 0 }, { total: 0 }]).every(p => !p.isEligible)).toBe(true);
    expect(applyLeaderboardEligibility([{ total: 1 }])[0].isEligible).toBe(true);
  });

  it('preserves win-rate ordering within the unqualified group', () => {
    const board = applyLeaderboardEligibility([{ total: 2 }, { total: 1 }, { total: 60 }]);
    expect(board.map(p => p.total)).toEqual([60, 2, 1]);
  });

  it('counts only ranking matches while retaining fine totals', () => {
    const players = ['a', 'b', 'c', 'd'].map(id => ({ id, name: id }));
    const match = { win_1: 'a', win_2: 'b', lose_1: 'c', lose_2: 'd' };
    const board = applyLeaderboardEligibility(calculateLeaderboard(players, [
      match, { ...match, win_2: '__GUEST__' }, { ...match, deleted_at: '2026-09-12' },
    ]));
    expect(board.every(p => p.total === 1 && p.isEligible)).toBe(true);
    expect(board.find(p => p.id === 'c')?.money).toBe(10000);
  });
});
