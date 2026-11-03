import { describe, expect, it } from 'vitest';
import {
  calculateOptimizedSettlement,
  calculatePairwiseDebts,
  calculatePlayerStats,
  isLocChopAdjustment,
  type LocPlayer,
  type LocRound,
} from '@/lib/loc-core';

const players: LocPlayer[] = ['An', 'Bình', 'Chi', 'Duy', 'Em'].map((name, i) => ({ id: `p${i}`, name }));
function round(points: number[], winnerId = 'p0'): LocRound {
  return {
    id: 'r1', sessionId: 's1', roundNumber: 1, winnerId,
    debts: points.map((cards, i) => ({ loserId: `p${i + 1}`, cards })),
    createdAt: '2026-11-03T00:00:00Z',
  };
}

describe('nhận diện bản ghi chặt 2', () => {
  it.each([3, 4, 5])('nhận diện bàn %i người từ điểm, không cần nhãn', count => {
    const points = Array.from({ length: count - 1 }, (_, i) => i === count - 2 ? 20 : 0);
    expect(isLocChopAdjustment(round(points), players.slice(0, count))).toBe(true);
  });

  it.each([
    [20, 1, 0, 0], // Ván thật có nhiều người mất điểm.
    [20, 20, 20, 20], // Ăn sâm.
    [80, 0, 0, 0], // Đền sâm.
    [14, 0, 0, 0], // Cóng.
    [10, 0, 0, 0], // Không tự mở rộng nhận diện ngoài mức 20 người dùng yêu cầu.
    [0, 0, 0, 0],
    [20, -1, 0, 0],
    [20, Number.NaN, 0, 0],
    [20], // Thiếu bản ghi 0: không đủ bằng chứng đây là chặt 2.
  ])('không loại bản ghi %j khỏi thắng/thua', (...points) => {
    expect(isLocChopAdjustment(round(points), players)).toBe(false);
  });

  it('không nhầm ván hai người, người lạ, trùng hoặc thiếu người', () => {
    expect(isLocChopAdjustment(round([20]), players.slice(0, 2))).toBe(false);
    expect(isLocChopAdjustment(round([20, 0, 0, 0], 'unknown'), players)).toBe(false);
    const duplicate = round([20, 0, 0, 0]);
    duplicate.debts[1].loserId = 'p1';
    expect(isLocChopAdjustment(duplicate, players)).toBe(false);
    duplicate.debts[1].loserId = 'unknown';
    expect(isLocChopAdjustment(duplicate, players)).toBe(false);
  });
});

describe('thống kê vẫn giữ điểm và nợ chặt 2', () => {
  it('chỉ có chặt 2: không ai thắng/thua, người chặt +20 và người bị chặt -20', () => {
    const adjustment = round([20, 0, 0, 0]);
    const stats = calculatePlayerStats(players, [adjustment]);
    expect(stats.every(s => s.wins === 0 && s.losses === 0 && s.totalRounds === 0 && s.winRate === 0)).toBe(true);
    expect(stats.find(s => s.id === 'p0')?.netCards).toBe(20);
    expect(stats.find(s => s.id === 'p1')?.netCards).toBe(-20);
    expect(stats.filter(s => !['p0', 'p1'].includes(s.id)).every(s => s.netCards === 0)).toBe(true);
    expect(calculatePairwiseDebts(players, [adjustment]).matrix.p1.p0).toBe(20);
    expect(calculateOptimizedSettlement(players, [adjustment])).toEqual([
      { fromId: 'p1', fromName: 'Bình', toId: 'p0', toName: 'An', cards: 20 },
    ]);
  });

  it('lịch sử cũ xen ván thật và chặt 2: tỷ lệ chỉ dùng ván thật của cả bàn', () => {
    const normal1 = round([2, 3, 4, 5]);
    const normal2: LocRound = { ...normal1, id: 'r2', winnerId: 'p1', debts: [
      { loserId: 'p0', cards: 3 }, { loserId: 'p2', cards: 2 },
      { loserId: 'p3', cards: 1 }, { loserId: 'p4', cards: 4 },
    ] };
    const adjustment = round([20, 0, 0, 0]);
    adjustment.debts[0] = { ...adjustment.debts[0], autoTag: 'chặt heo' };
    const before = calculatePlayerStats(players, [normal1, normal2]);
    const after = calculatePlayerStats(players, [normal1, adjustment, normal2, round([0, 20, 0, 0])]);
    for (const stat of after) {
      const original = before.find(s => s.id === stat.id)!;
      expect([stat.totalRounds, stat.wins, stat.losses, stat.winRate]).toEqual([
        original.totalRounds, original.wins, original.losses, original.winRate,
      ]);
    }
    expect(after.find(s => s.id === 'p0')).toMatchObject({ totalRounds: 2, wins: 1, losses: 1, winRate: 50, netCards: 51 });
    expect(after.find(s => s.id === 'p0')?.owedBy).toContainEqual({ fromId: 'p1', fromName: 'Bình', cards: 19 });
    expect(after.reduce((sum, s) => sum + s.netCards, 0)).toBe(0);
  });
});
