import { describe, it, expect } from 'vitest';
import {
  detectRoundTags,
  calculatePairwiseDebts,
  calculateOptimizedSettlement,
  calculatePlayerStats,
  getShortNameMap,
  LocPlayer,
  LocRound,
} from '@/lib/loc-core';

describe('loc-core', () => {
  describe('getShortNameMap', () => {
    it('lấy tên chính khi không trùng lặp', () => {
      const roster: LocPlayer[] = [
        { id: '1', name: 'Nguyễn Trung Khánh' },
        { id: '2', name: 'Lê Văn Tuấn' },
        { id: '3', name: 'Hải' },
      ];
      const map = getShortNameMap(roster);
      expect(map.get('1')).toBe('Khánh');
      expect(map.get('2')).toBe('Tuấn');
      expect(map.get('3')).toBe('Hải');
    });

    it('thêm chữ cái viết tắt khi trùng tên chính (ví dụ T.Khánh)', () => {
      const roster: LocPlayer[] = [
        { id: '1', name: 'Nguyễn Trung Khánh' },
        { id: '2', name: 'Lê Văn Khánh' },
        { id: '3', name: 'Phạm Tuấn' },
      ];
      const map = getShortNameMap(roster);
      expect(map.get('1')).toBe('T.Khánh');
      expect(map.get('2')).toBe('V.Khánh');
      expect(map.get('3')).toBe('Tuấn');
    });
  });
  const players: LocPlayer[] = [
    { id: 'tuan', name: 'Tuấn' },
    { id: 'minh', name: 'Minh' },
    { id: 'hai', name: 'Hải' },
    { id: 'nam', name: 'Nam' },
  ];

  describe('detectRoundTags', () => {
    it('nhận diện 14 lá là cóng / úng', () => {
      const tags = detectRoundTags(
        'tuan',
        [
          { loserId: 'minh', cards: 14 },
          { loserId: 'hai', cards: 5 },
          { loserId: 'nam', cards: 2 },
        ],
        4
      );
      expect(tags['minh']).toBe('cóng');
      expect(tags['hai']).toBeUndefined();
    });

    it('nhận diện tất cả thua 20 lá là ăn sâm', () => {
      const tags = detectRoundTags(
        'tuan',
        [
          { loserId: 'minh', cards: 20 },
          { loserId: 'hai', cards: 20 },
          { loserId: 'nam', cards: 20 },
        ],
        4
      );
      expect(tags['minh']).toBe('ăn sâm');
      expect(tags['hai']).toBe('ăn sâm');
      expect(tags['nam']).toBe('ăn sâm');
    });

    it('nhận diện đền sâm khi 1 người thua duy nhất 60 lá (bàn 4 người), các người khác = 0', () => {
      const tags = detectRoundTags(
        'hai',
        [
          { loserId: 'tuan', cards: 60 },
          { loserId: 'minh', cards: 0 },
          { loserId: 'nam', cards: 0 },
        ],
        4
      );
      expect(tags['tuan']).toBe('đền sâm');
    });

    it('nhận diện chặt heo bù khi 1 người thua 10 lá, các người khác = 0', () => {
      const tags = detectRoundTags(
        'tuan',
        [
          { loserId: 'minh', cards: 10 },
          { loserId: 'hai', cards: 0 },
          { loserId: 'nam', cards: 0 },
        ],
        4
      );
      expect(tags['minh']).toBe('chặt heo');
    });

    it('nhận diện thối heo khi thua > 10 lá (khác 14 lá và 20 lá)', () => {
      const tags = detectRoundTags(
        'tuan',
        [
          { loserId: 'minh', cards: 12 },
          { loserId: 'hai', cards: 4 },
          { loserId: 'nam', cards: 6 },
        ],
        4
      );
      expect(tags['minh']).toBe('thối heo');
    });
  });

  describe('calculatePairwiseDebts', () => {
    it('tính đúng nợ đối kháng 1-1 và bù trừ qua lại giữa 2 người', () => {
      const rounds: LocRound[] = [
        // Ván 1: Tuấn thắng, Minh thua 10 lá, Hải thua 5 lá, Nam thua 8 lá
        {
          id: 'r1',
          sessionId: 's1',
          roundNumber: 1,
          winnerId: 'tuan',
          debts: [
            { loserId: 'minh', cards: 10 },
            { loserId: 'hai', cards: 5 },
            { loserId: 'nam', cards: 8 },
          ],
          createdAt: new Date().toISOString(),
        },
        // Ván 2: Minh thắng, Tuấn thua 4 lá, Hải thua 6 lá, Nam thua 2 lá
        {
          id: 'r2',
          sessionId: 's1',
          roundNumber: 2,
          winnerId: 'minh',
          debts: [
            { loserId: 'tuan', cards: 4 },
            { loserId: 'hai', cards: 6 },
            { loserId: 'nam', cards: 2 },
          ],
          createdAt: new Date().toISOString(),
        },
      ];

      const { matrix, directList } = calculatePairwiseDebts(players, rounds);

      // Minh nợ Tuấn: 10 - 4 = 6 lá
      expect(matrix['minh']['tuan']).toBe(6);
      expect(matrix['tuan']['minh']).toBe(0);

      // Hải nợ Tuấn 5, Hải nợ Minh 6
      expect(matrix['hai']['tuan']).toBe(5);
      expect(matrix['hai']['minh']).toBe(6);

      // Nam nợ Tuấn 8, Nam nợ Minh 2
      expect(matrix['nam']['tuan']).toBe(8);
      expect(matrix['nam']['minh']).toBe(2);

      // directList sắp xếp theo số nợ giảm dần
      expect(directList[0]).toEqual({
        fromId: 'nam',
        fromName: 'Nam',
        toId: 'tuan',
        toName: 'Tuấn',
        cards: 8,
      });
    });
  });

  describe('calculateOptimizedSettlement', () => {
    it('bù trừ công nợ tối ưu để số lượt chuyển tiền là tối thiểu', () => {
      const rounds: LocRound[] = [
        {
          id: 'r1',
          sessionId: 's1',
          roundNumber: 1,
          winnerId: 'tuan',
          debts: [
            { loserId: 'minh', cards: 10 },
            { loserId: 'hai', cards: 5 },
            { loserId: 'nam', cards: 8 },
          ],
          createdAt: new Date().toISOString(),
        },
        {
          id: 'r2',
          sessionId: 's1',
          roundNumber: 2,
          winnerId: 'minh',
          debts: [
            { loserId: 'tuan', cards: 4 },
            { loserId: 'hai', cards: 6 },
            { loserId: 'nam', cards: 2 },
          ],
          createdAt: new Date().toISOString(),
        },
      ];

      // Net:
      // Tuấn: + (10 + 5 + 8) - 4 = +19
      // Minh: + (4 + 6 + 2) - 10 = +2
      // Hải: - 5 - 6 = -11
      // Nam: - 8 - 2 = -10
      // Sum = 19 + 2 - 11 - 10 = 0
      const settlements = calculateOptimizedSettlement(players, rounds);

      // Tổng số tiền chuyển trong settlements phải bằng tổng số nợ cần trả (21)
      const totalTransferred = settlements.reduce((sum, s) => sum + s.cards, 0);
      expect(totalTransferred).toBe(21);

      // Số lượng giao dịch tối đa là số người nợ + số người nhận - 1 <= 3
      expect(settlements.length).toBeLessThanOrEqual(3);

      // Kiểm tra người trả và người nhận
      const tuanReceived = settlements.filter(s => s.toId === 'tuan').reduce((acc, s) => acc + s.cards, 0);
      const minhReceived = settlements.filter(s => s.toId === 'minh').reduce((acc, s) => acc + s.cards, 0);
      const haiPaid = settlements.filter(s => s.fromId === 'hai').reduce((acc, s) => acc + s.cards, 0);
      const namPaid = settlements.filter(s => s.fromId === 'nam').reduce((acc, s) => acc + s.cards, 0);

      expect(tuanReceived).toBe(19);
      expect(minhReceived).toBe(2);
      expect(haiPaid).toBe(11);
      expect(namPaid).toBe(10);
    });
  });

  describe('calculatePlayerStats', () => {
    it('thống kê chính xác tỷ lệ thắng thua và các khoản nợ của từng cá nhân', () => {
      const rounds: LocRound[] = [
        {
          id: 'r1',
          sessionId: 's1',
          roundNumber: 1,
          winnerId: 'tuan',
          debts: [
            { loserId: 'minh', cards: 14, autoTag: 'cóng' },
            { loserId: 'hai', cards: 6 },
          ],
          createdAt: new Date().toISOString(),
        },
      ];

      const stats = calculatePlayerStats(players, rounds);
      const tuanStats = stats.find(s => s.id === 'tuan')!;
      const minhStats = stats.find(s => s.id === 'minh')!;

      expect(tuanStats.wins).toBe(1);
      expect(tuanStats.netCards).toBe(20);
      expect(minhStats.netCards).toBe(-14);
      expect(minhStats.tagsCount['cóng']).toBe(1);
      expect(minhStats.owes).toContainEqual({
        toId: 'tuan',
        toName: 'Tuấn',
        cards: 14,
      });
    });
  });
});
