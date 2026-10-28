import { describe, it, expect } from 'vitest';
import { Card } from '../loc-game/types';
import { createDeck, dealCards } from '../loc-game/deck';
import { analyzeCombo, canBeat, hasHigherSingleCard, checkInstantWin } from '../loc-game/analyzer';
import { getSmartHint } from '../loc-game/smart-hint';
import { calculateRoundScores } from '../loc-game/scoring';

describe('Loc Game Deck & Dealing', () => {
  it('tạo đủ 52 lá bài duy nhất', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(52);
  });

  it('chia bài cho 5 người chơi: mỗi người 10 lá, dư đúng 2 lá bí mật', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const result = dealCards(players);

    for (const pid of players) {
      expect(result.playerHands[pid]).toHaveLength(10);
    }
    expect(result.remainingCards).toHaveLength(2);

    // Kiểm tra không có lá nào bị chia trùng
    const allCards = [
      ...players.flatMap((pid) => result.playerHands[pid]),
      ...result.remainingCards,
    ];
    const uniqueIds = new Set(allCards.map((c) => c.id));
    expect(uniqueIds.size).toBe(52);
  });

  it('chia bài cho 3 người chơi: mỗi người 10 lá, dư đúng 22 lá', () => {
    const players = ['p1', 'p2', 'p3'];
    const result = dealCards(players);
    expect(result.remainingCards).toHaveLength(22);
  });
});

describe('Loc Game Analyzer & Rules', () => {
  const c3: Card = { id: '3_s', rank: 3, suit: 'spades' };
  const c4: Card = { id: '4_c', rank: 4, suit: 'clubs' };
  const c5: Card = { id: '5_d', rank: 5, suit: 'diamonds' };
  const c6: Card = { id: '6_h', rank: 6, suit: 'hearts' };
  const cA: Card = { id: '14_s', rank: 14, suit: 'spades' };
  const c2: Card = { id: '15_h', rank: 15, suit: 'hearts' };
  const c2d: Card = { id: '15_d', rank: 15, suit: 'diamonds' };

  it('nhận diện các bộ bài cơ bản', () => {
    expect(analyzeCombo([c3]).type).toBe('SINGLE');
    expect(analyzeCombo([c3, { id: '3_h', rank: 3, suit: 'hearts' }]).type).toBe('PAIR');
    expect(
      analyzeCombo([
        c3,
        { id: '3_h', rank: 3, suit: 'hearts' },
        { id: '3_d', rank: 3, suit: 'diamonds' },
      ]).type
    ).toBe('TRIPLE');
    expect(
      analyzeCombo([
        c3,
        { id: '3_h', rank: 3, suit: 'hearts' },
        { id: '3_d', rank: 3, suit: 'diamonds' },
        { id: '3_c', rank: 3, suit: 'clubs' },
      ]).type
    ).toBe('QUAD');
  });

  it('nhận diện sảnh chuẩn và sảnh đặc biệt A-2-3', () => {
    // Sảnh 3-4-5-6
    const straight = analyzeCombo([c3, c4, c5, c6]);
    expect(straight.type).toBe('STRAIGHT');
    expect(straight.highestRank).toBe(6);

    // Sảnh đặc biệt A-2-3
    const a23 = analyzeCombo([c3, cA, c2]);
    expect(a23.type).toBe('STRAIGHT');
    expect(a23.highestRank).toBe(3); // Sảnh nhỏ nhất, tính highest là 3

    // K-A-2 không hợp lệ
    const cK: Card = { id: '13_s', rank: 13, suit: 'spades' };
    expect(analyzeCombo([cK, cA, c2]).type).toBe('INVALID');
  });

  it('luật Tứ quý chặt 2 và đôi 2 không ai chặn được', () => {
    const single2 = analyzeCombo([c2]);
    const quad4 = analyzeCombo([
      { id: '4_s', rank: 4, suit: 'spades' },
      { id: '4_c', rank: 4, suit: 'clubs' },
      { id: '4_d', rank: 4, suit: 'diamonds' },
      { id: '4_h', rank: 4, suit: 'hearts' },
    ]);

    // Tứ quý chặt 1 lá 2
    expect(canBeat(quad4, single2)).toBe(true);

    // 2 không đè được 2
    const single2other = analyzeCombo([c2d]);
    expect(canBeat(single2other, single2)).toBe(false);

    // Đôi 2 không thể bị chặt (kể cả 2 tứ quý)
    const pair2 = analyzeCombo([c2, c2d]);
    expect(canBeat(quad4, pair2)).toBe(false);
  });
});

describe('Loc Game Tới Trắng (Instant Win)', () => {
  it('nhận diện 4 con 2 (Tứ quý 2) tới trắng', () => {
    const hand: Card[] = [
      { id: '15_s', rank: 15, suit: 'spades' },
      { id: '15_c', rank: 15, suit: 'clubs' },
      { id: '15_d', rank: 15, suit: 'diamonds' },
      { id: '15_h', rank: 15, suit: 'hearts' },
      { id: '3_s', rank: 3, suit: 'spades' },
      { id: '4_s', rank: 4, suit: 'spades' },
      { id: '5_s', rank: 5, suit: 'spades' },
      { id: '6_s', rank: 6, suit: 'spades' },
      { id: '7_s', rank: 7, suit: 'spades' },
      { id: '8_s', rank: 8, suit: 'spades' },
    ];
    const check = checkInstantWin(hand);
    expect(check.isInstantWin).toBe(true);
    expect(check.type).toBe('FOUR_TWOS');
    expect(check.priority).toBe(3);
  });

  it('nhận diện 5 đôi tới trắng', () => {
    const hand: Card[] = [
      { id: '3_s', rank: 3, suit: 'spades' },
      { id: '3_c', rank: 3, suit: 'clubs' },
      { id: '5_d', rank: 5, suit: 'diamonds' },
      { id: '5_h', rank: 5, suit: 'hearts' },
      { id: '7_s', rank: 7, suit: 'spades' },
      { id: '7_d', rank: 7, suit: 'diamonds' },
      { id: '9_c', rank: 9, suit: 'clubs' },
      { id: '9_h', rank: 9, suit: 'hearts' },
      { id: '11_s', rank: 11, suit: 'spades' },
      { id: '11_h', rank: 11, suit: 'hearts' },
    ];
    const check = checkInstantWin(hand);
    expect(check.isInstantWin).toBe(true);
    expect(check.type).toBe('FIVE_PAIRS');
    expect(check.priority).toBe(2);
  });

  it('nhận diện full đỏ hoặc full đen tới trắng', () => {
    const handRed: Card[] = [
      { id: '3_h', rank: 3, suit: 'hearts' },
      { id: '4_h', rank: 4, suit: 'hearts' },
      { id: '5_d', rank: 5, suit: 'diamonds' },
      { id: '6_d', rank: 6, suit: 'diamonds' },
      { id: '7_h', rank: 7, suit: 'hearts' },
      { id: '8_h', rank: 8, suit: 'hearts' },
      { id: '9_d', rank: 9, suit: 'diamonds' },
      { id: '10_d', rank: 10, suit: 'diamonds' },
      { id: '11_h', rank: 11, suit: 'hearts' },
      { id: '12_d', rank: 12, suit: 'diamonds' },
    ];
    expect(checkInstantWin(handRed).isInstantWin).toBe(true);
    expect(checkInstantWin(handRed).type).toBe('SAME_COLOR');

    const handBlack: Card[] = [
      { id: '3_s', rank: 3, suit: 'spades' },
      { id: '4_c', rank: 4, suit: 'clubs' },
      { id: '5_s', rank: 5, suit: 'spades' },
      { id: '6_c', rank: 6, suit: 'clubs' },
      { id: '7_s', rank: 7, suit: 'spades' },
      { id: '8_c', rank: 8, suit: 'clubs' },
      { id: '9_s', rank: 9, suit: 'spades' },
      { id: '10_c', rank: 10, suit: 'clubs' },
      { id: '11_s', rank: 11, suit: 'spades' },
      { id: '12_c', rank: 12, suit: 'clubs' },
    ];
    expect(checkInstantWin(handBlack).isInstantWin).toBe(true);
    expect(checkInstantWin(handBlack).type).toBe('SAME_COLOR');
  });

  it('bài bình thường hỗn hợp không tới trắng', () => {
    const normalHand: Card[] = [
      { id: '3_s', rank: 3, suit: 'spades' },
      { id: '4_h', rank: 4, suit: 'hearts' },
      { id: '5_d', rank: 5, suit: 'diamonds' },
      { id: '6_c', rank: 6, suit: 'clubs' },
      { id: '7_s', rank: 7, suit: 'spades' },
      { id: '8_h', rank: 8, suit: 'hearts' },
      { id: '9_d', rank: 9, suit: 'diamonds' },
      { id: '10_c', rank: 10, suit: 'clubs' },
      { id: '11_s', rank: 11, suit: 'spades' },
      { id: '12_h', rank: 12, suit: 'hearts' },
    ];
    expect(checkInstantWin(normalHand).isInstantWin).toBe(false);
  });
});

describe('Loc Game Smart Hint Engine', () => {
  // Bộ bài test: 5-5-5-6-7-8-9
  const c5_1: Card = { id: '5_s', rank: 5, suit: 'spades' };
  const c5_2: Card = { id: '5_c', rank: 5, suit: 'clubs' };
  const c5_3: Card = { id: '5_d', rank: 5, suit: 'diamonds' };
  const c6: Card = { id: '6_h', rank: 6, suit: 'hearts' };
  const c7: Card = { id: '7_s', rank: 7, suit: 'spades' };
  const c8: Card = { id: '8_c', rank: 8, suit: 'clubs' };
  const c9: Card = { id: '9_d', rank: 9, suit: 'diamonds' };

  const hand = [c5_1, c5_2, c5_3, c6, c7, c8, c9];

  it('gợi ý khi trên sân có sảnh 3-4-5: chọn 5 -> sáng 6, 7 (thành 5-6-7 chặn 3-4-5)', () => {
    const tableCombo = analyzeCombo([
      { id: '3_s', rank: 3, suit: 'spades' },
      { id: '4_c', rank: 4, suit: 'clubs' },
      { id: '5_h', rank: 5, suit: 'hearts' },
    ]);

    const hints = getSmartHint(c5_1, hand, tableCombo);
    const hintRanks = hints.map((c) => c.rank).sort();
    expect(hintRanks).toEqual([6, 7]);
  });

  it('gợi ý khi trên sân có sảnh 3-4-5: chọn 9 -> sáng 7, 8 (thành 7-8-9 chặn 3-4-5)', () => {
    const tableCombo = analyzeCombo([
      { id: '3_s', rank: 3, suit: 'spades' },
      { id: '4_c', rank: 4, suit: 'clubs' },
      { id: '5_h', rank: 5, suit: 'hearts' },
    ]);

    const hints = getSmartHint(c9, hand, tableCombo);
    const hintRanks = hints.map((c) => c.rank).sort();
    expect(hintRanks).toEqual([7, 8]);
  });

  it('gợi ý khi trên sân có đôi 3-3: chọn 5 -> sáng lá 5 còn lại để tạo đôi', () => {
    const tableCombo = analyzeCombo([
      { id: '3_s', rank: 3, suit: 'spades' },
      { id: '3_c', rank: 3, suit: 'clubs' },
    ]);

    const hints = getSmartHint(c5_1, hand, tableCombo);
    expect(hints).toHaveLength(1);
    expect(hints[0].rank).toBe(5);
  });

  it('gợi ý khi đến lượt đi đầu (bàn trống): chọn 5 -> ưu tiên bộ dài nhất 5-6-7-8-9', () => {
    const hints = getSmartHint(c5_1, hand, null);
    const hintRanks = hints.map((c) => c.rank).sort((a, b) => a - b);
    expect(hintRanks).toEqual([6, 7, 8, 9]);
  });
});

describe('Loc Game Scoring & Penalties', () => {
  const players = [
    { id: 'p1', name: 'An' },
    { id: 'p2', name: 'Bình' },
    { id: 'p3', name: 'Cường' },
  ];

  it('khi đã úng (cóng) chỉ tính 14 lá, không tính thối 2 nữa', () => {
    const remainingHands = {
      p1: [],
      p2: [
        { id: '4_s', rank: 4, suit: 'spades' } as Card,
      ],
      p3: [
        // p3 bị cóng: 10 lá và có tới 2 con 2
        { id: '15_s', rank: 15, suit: 'spades' } as Card,
        { id: '15_c', rank: 15, suit: 'clubs' } as Card,
        ...new Array(8).fill({ id: 'x', rank: 3, suit: 'spades' } as Card),
      ],
    };

    const cardsPlayedCount = { p1: 10, p2: 1, p3: 0 }; // p3 chưa đánh lá nào -> cóng

    const score = calculateRoundScores({
      players,
      remainingHands,
      cardsPlayedCount,
      winnerId: 'p1',
    });

    expect(score.p3.isBurned).toBe(true);
    // Khi đã úng chỉ tính 14 lá, không cộng thêm 2 con 2 thối
    expect(score.p3.penaltyCards).toBe(14);
    expect(score.p3.netCards).toBe(-14);

    expect(score.p2.penaltyCards).toBe(1);
    expect(score.p2.netCards).toBe(-1);

    expect(score.p1.netCards).toBe(15);
    const totalNet = Object.values(score).reduce((acc, p) => acc + p.netCards, 0);
    expect(totalNet).toBe(0);
  });

  it('mỗi lá 2 thối = 5 lá (VD thua 8 lá trong đó có 1 con 2 thì mất 7 + 5 = 12 lá)', () => {
    const remainingHands = {
      p1: [], // về nhất
      p2: [
        { id: '15_s', rank: 15, suit: 'spades' } as Card, // 1 lá 2
        { id: '3_s', rank: 3, suit: 'spades' } as Card,
        { id: '4_s', rank: 4, suit: 'spades' } as Card,
        { id: '5_s', rank: 5, suit: 'spades' } as Card,
        { id: '6_s', rank: 6, suit: 'spades' } as Card,
        { id: '7_s', rank: 7, suit: 'spades' } as Card,
        { id: '8_s', rank: 8, suit: 'spades' } as Card,
        { id: '9_s', rank: 9, suit: 'spades' } as Card,
      ], // 8 lá gồm 1 con 2 và 7 lá thường
      p3: [
        { id: '10_s', rank: 10, suit: 'spades' } as Card,
      ],
    };

    const cardsPlayedCount = { p1: 10, p2: 2, p3: 2 }; // Đều đã đánh bài, không ai bị cóng

    const score = calculateRoundScores({
      players,
      remainingHands,
      cardsPlayedCount,
      winnerId: 'p1',
    });

    // p2: 7 lá thường + 1 lá 2 (5 lá) = 12 lá phạt
    expect(score.p2.penaltyCards).toBe(12);
    expect(score.p2.netCards).toBe(-12);

    expect(score.p3.penaltyCards).toBe(1);
    expect(score.p3.netCards).toBe(-1);

    expect(score.p1.netCards).toBe(13); // 12 + 1 = 13
    const totalNet = Object.values(score).reduce((acc, p) => acc + p.netCards, 0);
    expect(totalNet).toBe(0);
  });

  it('kết toán Tới Trắng: người tới trắng ăn 30 lá / mỗi người chơi khác', () => {
    const tablePlayers = [
      { id: 'p1', name: 'Player 1' },
      { id: 'p2', name: 'Player 2' },
      { id: 'p3', name: 'Player 3' },
      { id: 'p4', name: 'Player 4' },
    ];

    const score = calculateRoundScores({
      players: tablePlayers,
      remainingHands: { p1: [], p2: [], p3: [], p4: [] },
      cardsPlayedCount: { p1: 0, p2: 0, p3: 0, p4: 0 },
      winnerId: 'p1',
      isInstantWin: true,
      instantWinPlayerId: 'p1',
      instantWinReason: 'Tứ quý 2 (4 con Heo)',
    });

    expect(score.p1.isWinner).toBe(true);
    expect(score.p1.isInstantWin).toBe(true);
    // Ăn 3 người x 30 lá = +90 lá
    expect(score.p1.netCards).toBe(90);

    // Mỗi người thua nộp 30 lá
    expect(score.p2.penaltyCards).toBe(30);
    expect(score.p2.netCards).toBe(-30);
    expect(score.p3.netCards).toBe(-30);
    expect(score.p4.netCards).toBe(-30);

    const totalNet = Object.values(score).reduce((acc, p) => acc + p.netCards, 0);
    expect(totalNet).toBe(0);
  });

  it('về nhất bằng lá 2 bị phạt thối 2 (trừ 5 lá)', () => {
    const remainingHands = {
      p1: [],
      p2: [{ id: '4_s', rank: 4, suit: 'spades' } as Card], // thua 1 lá
      p3: [{ id: '6_s', rank: 6, suit: 'spades' } as Card], // thua 1 lá
    };
    const cardsPlayedCount = { p1: 10, p2: 5, p3: 5 };

    const score = calculateRoundScores({
      players,
      remainingHands,
      cardsPlayedCount,
      winnerId: 'p1',
      lastPlayedCards: [{ id: '15_h', rank: 15, suit: 'hearts' } as Card], // Đánh 2 cuối cùng
    });

    expect(score.p1.hasThoi2ByEndingWith2).toBe(true);
    // Người khác thua 2 lá, nhưng p1 bị trừ 5 lá thối 2 -> p1 net = 2 - 5 = -3
    expect(score.p1.netCards).toBe(-3);
  });

  it('chặt 2 dồn 10 lá vào cuối ván', () => {
    const remainingHands = {
      p1: [],
      p2: [{ id: '4_s', rank: 4, suit: 'spades' } as Card], // thua 1 lá
      p3: [{ id: '6_s', rank: 6, suit: 'spades' } as Card], // thua 1 lá
    };
    const cardsPlayedCount = { p1: 10, p2: 5, p3: 5 };

    // p2 chặt 2 của p3 trong ván
    const chopEvents = [{ chopperId: 'p2', victimId: 'p3', count: 1 }];

    const score = calculateRoundScores({
      players,
      remainingHands,
      cardsPlayedCount,
      winnerId: 'p1',
      chopEvents,
    });

    // p2 bị thua 1 lá nhưng ăn 10 lá chặt 2 -> net = +9
    expect(score.p2.netCards).toBe(9);
    // p3 bị thua 1 lá và bị chặt 10 lá -> net = -11
    expect(score.p3.netCards).toBe(-11);
    // p1 ăn 2 lá bình thường
    expect(score.p1.netCards).toBe(2);

    const totalNet = Object.values(score).reduce((acc, p) => acc + p.netCards, 0);
    expect(totalNet).toBe(0);
  });

  it('phát hiện hành vi không đánh lá to nhất khi người sau đã báo (hasHigherSingleCard)', () => {
    const hand: Card[] = [
      { id: '5_s', rank: 5, suit: 'spades' },
      { id: '10_d', rank: 10, suit: 'diamonds' },
      { id: '14_h', rank: 14, suit: 'hearts' }, // Lá A
    ];

    // Đánh 5 trong khi còn 10 và 14 -> vi phạm
    expect(hasHigherSingleCard([hand[0]], hand)).toBe(true);
    // Đánh 10 trong khi còn 14 -> vi phạm
    expect(hasHigherSingleCard([hand[1]], hand)).toBe(true);
    // Đánh 14 (to nhất) -> không vi phạm
    expect(hasHigherSingleCard([hand[2]], hand)).toBe(false);
    // Đánh đôi -> không tính là rác đơn
    expect(hasHigherSingleCard([hand[0], hand[1]], hand)).toBe(false);
  });

  it('tính điểm đền làng: người đền gánh toàn bộ lá phạt của cả bàn (người đền gánh cả)', () => {
    const tablePlayers = [
      { id: 'p1', name: 'Player 1' },
      { id: 'p2', name: 'Player 2' },
      { id: 'p3', name: 'Player 3' },
      { id: 'p4', name: 'Player 4' },
    ];

    const remainingHands: Record<string, Card[]> = {
      p1: [], // Thắng (về nhất sau khi bắt bài)
      p2: new Array(10).fill({ id: 'x', rank: 5, suit: 'spades' }) as Card[], // Cóng: 14 lá
      p3: [
        { id: '3_s', rank: 3, suit: 'spades' },
        { id: '4_d', rank: 4, suit: 'diamonds' },
        { id: '5_c', rank: 5, suit: 'clubs' },
        { id: '15_h', rank: 15, suit: 'hearts' }, // 3 lá thường (3) + 1 con 2 (5) = 8 lá
      ] as Card[],
      p4: [
        { id: '8_s', rank: 8, suit: 'spades' },
        { id: '9_c', rank: 9, suit: 'clubs' },
      ] as Card[], // Người đền làng: còn 2 lá
    };

    const cardsPlayedCount = {
      p1: 10,
      p2: 0, // Cóng
      p3: 6,
      p4: 8,
    };

    // p4 bị xử Đền Làng vì thả bài cho p1 về
    const score = calculateRoundScores({
      players: tablePlayers,
      remainingHands,
      cardsPlayedCount,
      winnerId: 'p1',
      denLangPlayerId: 'p4',
    });

    // p2: cóng 14 lá nhưng được miễn trừ do p4 đền làng
    expect(score.p2.isBurned).toBe(true);
    expect(score.p2.penaltyCards).toBe(0);
    expect(score.p2.netCards).toBe(0);

    // p3: 3 lá thường + 5 lá thối 2 = 8 lá nhưng được miễn trừ
    expect(score.p3.penaltyCards).toBe(0);
    expect(score.p3.netCards).toBe(0);

    // p4: người đền làng -> gánh toàn bộ lá phạt của cả làng:
    // Cóng p2 (14) + phạt p3 (8) + bài p4 (2 lá) = 24 lá!
    expect(score.p4.isDenLang).toBe(true);
    expect(score.p4.penaltyCards).toBe(24);
    expect(score.p4.netCards).toBe(-24);

    // p1: Người về nhất ăn trọn 24 lá từ p4
    expect(score.p1.isWinner).toBe(true);
    expect(score.p1.netCards).toBe(24);

    // Zero-sum
    const totalNet = Object.values(score).reduce((acc, p) => acc + p.netCards, 0);
    expect(totalNet).toBe(0);
  });
});
