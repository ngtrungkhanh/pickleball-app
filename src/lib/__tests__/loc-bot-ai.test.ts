import { describe, it, expect, beforeEach } from 'vitest';
import { Card, Rank, Suit } from '../loc-game/types';
import { partitionHand, evaluateSamPossibility } from '../loc-game/bot/hand-evaluator';
import { CardTracker } from '../loc-game/bot/card-tracker';
import { BotBrain } from '../loc-game/bot/bot-brain';
import { generateCandidateMoves } from '../loc-game/bot/candidate-generator';
import { getBotHintForSelection } from '../loc-game/bot/selection-hint';
import { TableState } from '../loc-game/network-types';
import { analyzeCombo } from '../loc-game/analyzer';

function createCard(rank: Rank, suit: Suit = 'spades'): Card {
  return { id: `${rank}_${suit}`, rank, suit };
}

describe('Loc Bot AI - Hand Evaluator', () => {
  it('phân rã chính xác sảnh dài, đôi và rác lẻ mà không làm nát bài', () => {
    const hand: Card[] = [
      createCard(3, 'hearts'),
      createCard(4, 'clubs'),
      createCard(5, 'diamonds'),
      createCard(6, 'spades'),
      createCard(7, 'hearts'), // Sảnh 3-4-5-6-7
      createCard(9, 'clubs'),
      createCard(9, 'diamonds'), // Đôi 9
      createCard(11, 'hearts'), // Rác J (rank 11)
      createCard(15, 'spades'), // Rác 2 (rank 15)
    ];

    const partition = partitionHand(hand);

    expect(partition.straights.length).toBe(1);
    expect(partition.straights[0].length).toBe(5);
    expect(partition.pairs.length).toBe(1);
    expect(partition.pairs[0][0].rank).toBe(9);
    expect(partition.singles.map((c) => c.rank)).toEqual([11, 15]);
  });

  it('bảo toàn Tứ Quý khi có 4 lá cùng rank', () => {
    const hand: Card[] = [
      createCard(8, 'hearts'),
      createCard(8, 'clubs'),
      createCard(8, 'diamonds'),
      createCard(8, 'spades'), // Tứ quý 8
      createCard(10, 'hearts'),
      createCard(12, 'spades'),
    ];

    const partition = partitionHand(hand);
    expect(partition.quads.length).toBe(1);
    expect(partition.quads[0].length).toBe(4);
    expect(partition.quads[0][0].rank).toBe(8);
  });

  it('đánh giá đúng khi nào nên và không nên Báo Sâm', () => {
    // Sảnh 10 lá từ 3 đến Q
    const straight10Hand: Card[] = [
      createCard(3), createCard(4), createCard(5), createCard(6), createCard(7),
      createCard(8), createCard(9), createCard(10), createCard(11), createCard(12),
    ];
    expect(evaluateSamPossibility(straight10Hand)).toBe(true);

    // Bài lộn xộn, nhiều rác nhỏ -> Không nên báo Sâm
    const badHand: Card[] = [
      createCard(3), createCard(5), createCard(7), createCard(9),
      createCard(11), createCard(12), createCard(13), createCard(14),
      createCard(4), createCard(6),
    ];
    expect(evaluateSamPossibility(badHand)).toBe(false);
  });
});

describe('Loc Bot AI - Card Tracker', () => {
  let tracker: CardTracker;

  beforeEach(() => {
    tracker = new CardTracker();
  });

  it('theo dõi chính xác số lượng Heo (2) còn lại ngoài tay bot', () => {
    const botHand: Card[] = [createCard(15, 'hearts')]; // Bot cầm 1 con 2

    // Bàn đã ra 2 con 2
    tracker.recordPlay([createCard(15, 'spades'), createCard(15, 'clubs')]);

    // Còn lại: 4 - 2 (đã ra) - 1 (trên tay bot) = 1 con 2
    expect(tracker.getRemainingTwosCount(botHand)).toBe(1);
  });

  it('phát hiện chuẩn xác người chơi kế tiếp có báo 1 lá hay không', () => {
    const players = [
      { id: 'bot_1', name: 'Bot', isHost: false, isSpectator: false, cardsRemaining: 5, hasPassed: false },
      { id: 'player_next', name: 'Bob', isHost: false, isSpectator: false, cardsRemaining: 1, hasPassed: false },
      { id: 'player_prev', name: 'Alice', isHost: true, isSpectator: false, cardsRemaining: 4, hasPassed: false },
    ];

    expect(tracker.isNextPlayerSingle('bot_1', players)).toBe(true);
    expect(tracker.isNextPlayerSingle('player_next', players)).toBe(false);
  });
});

describe('Loc Bot AI - Bot Brain Decisions', () => {
  let brain: BotBrain;
  let mockTableState: TableState;

  beforeEach(() => {
    brain = new BotBrain();
    mockTableState = {
      roomId: 'room_1',
      roomName: 'Test Room',
      hostId: 'host_1',
      status: 'playing',
      players: [
        { id: 'bot_1', name: 'Bot', isHost: false, isSpectator: false, cardsRemaining: 6, hasPassed: false },
        { id: 'human_1', name: 'Human', isHost: true, isSpectator: false, cardsRemaining: 5, hasPassed: false },
      ],
      spectators: [],
      currentTurnPlayerId: 'bot_1',
      roundLeaderPlayerId: 'bot_1',
      turnDeadline: Date.now() + 30000,
      lastPlay: null,
      samState: null,
      playHistory: [],
      roundResult: null,
    };
  });

  it('khi đi đầu: ưu tiên xả sảnh dài nhất trước', () => {
    const botHand: Card[] = [
      createCard(3), createCard(4), createCard(5), createCard(6), // Sảnh 3-4-5-6
      createCard(8), createCard(8), // Đôi 8
      createCard(11), // Rác J
    ];

    const decision = brain.decideMove('bot_1', botHand, mockTableState);
    expect(decision.action).toBe('PLAY');
    expect(decision.cards.length).toBe(4);
    expect(decision.cards.map((c) => c.rank)).toEqual([3, 4, 5, 6]);
  });

  it('khi đi đầu và người kế tiếp còn 1 lá: ưu tiên đánh sảnh/bộ để đối thủ không đỡ được', () => {
    mockTableState.players[1].cardsRemaining = 1; // Human sau lưng còn 1 lá
    brain.getTracker().recordPlay([]); // Sync

    const botHand: Card[] = [
      createCard(4), createCard(4), // Đôi 4
      createCard(7), // Rác 7
    ];

    const decision = brain.decideMove('bot_1', botHand, mockTableState);
    expect(decision.action).toBe('PLAY');
    // Đánh đôi 4 thay vì đánh rác 7 (vì đánh rác 7 có thể bị người 1 lá đè về luôn)
    expect(decision.cards.length).toBe(2);
    expect(decision.cards[0].rank).toBe(4);
  });

  it('khi đi đầu và người kế tiếp còn 1 lá, nếu chỉ còn rác: bắt buộc đánh lá to nhất để chặn đầu', () => {
    mockTableState.players[1].cardsRemaining = 1; // Human còn 1 lá

    const botHand: Card[] = [
      createCard(5),
      createCard(9),
      createCard(14), // Lá A (rank 14)
    ];

    const decision = brain.decideMove('bot_1', botHand, mockTableState);
    expect(decision.action).toBe('PLAY');
    // Phải đánh A (14), không được đánh 5 hay 9 tránh bị đền bài
    expect(decision.cards[0].rank).toBe(14);
  });

  it('không xé sảnh đẹp chỉ để đỡ một lá rác lẻ', () => {
    // Bàn đang đánh con 6
    mockTableState.lastPlay = {
      playerId: 'human_1',
      playerName: 'Human',
      combo: analyzeCombo([createCard(6)]),
    };

    // Bot chỉ có sảnh 7-8-9-10-J và không có rác lẻ nào đỡ được 6
    const botHand: Card[] = [
      createCard(7), createCard(8), createCard(9), createCard(10), createCard(11),
    ];

    const decision = brain.decideMove('bot_1', botHand, mockTableState);
    // Bot khôn sẽ PASS để giữ nguyên vẹn sảnh 5 cây, không xé con 7 hay con 8 ra đỡ
    expect(decision.action).toBe('PASS');
  });

  it('dùng Tứ Quý chặt 2 khi đối thủ quẳng 2', () => {
    // Bàn đang đánh con 2 (rank 15)
    mockTableState.lastPlay = {
      playerId: 'human_1',
      playerName: 'Human',
      combo: analyzeCombo([createCard(15)]),
    };

    // Bot có Tứ quý 9
    const botHand: Card[] = [
      createCard(9, 'spades'), createCard(9, 'clubs'),
      createCard(9, 'diamonds'), createCard(9, 'hearts'),
      createCard(4),
    ];

    const decision = brain.decideMove('bot_1', botHand, mockTableState);
    expect(decision.action).toBe('PLAY');
    expect(decision.cards.length).toBe(4);
    expect(decision.cards[0].rank).toBe(9);
  });

  it('khi còn 2 lá [1 lá thường, 1 con 2]: ưu tiên đánh con 2 trước để tránh thối 2 khi về ván', () => {
    const botHand: Card[] = [
      createCard(4, 'hearts'),
      createCard(15, 'spades'), // Heo 2
    ];

    const decision = brain.decideMove('bot_1', botHand, mockTableState);
    expect(decision.action).toBe('PLAY');
    // Phải đánh con 2 trước cướp cái để con cuối về bằng lá 4, không được để con 2 về cuối
    expect(decision.cards[0].rank).toBe(15);
  });

  it('khi đối thủ sắp về (còn 2 lá) và bot còn nguyên 10 lá: bot phải xé bài đè để thoát Cóng', () => {
    mockTableState.players[1].cardsRemaining = 2; // Human sắp về

    mockTableState.lastPlay = {
      playerId: 'human_1',
      playerName: 'Human',
      combo: analyzeCombo([createCard(5)]),
    };

    // Bot còn nguyên 10 lá, ghép thành 5 đôi (đôi 6, 7, 8, 9, 10), không có rác lẻ
    const botHand: Card[] = [
      createCard(6, 'spades'), createCard(6, 'clubs'),
      createCard(7, 'spades'), createCard(7, 'clubs'),
      createCard(8, 'spades'), createCard(8, 'clubs'),
      createCard(9, 'spades'), createCard(9, 'clubs'),
      createCard(10, 'spades'), createCard(10, 'clubs'),
    ];

    const decision = brain.decideMove('bot_1', botHand, mockTableState);
    // Thay vì PASS như bình thường, bot rơi vào trạng thái cấp cứu thoát cóng và đánh 1 lá đè con 5
    expect(decision.action).toBe('PLAY');
    expect(decision.cards.length).toBe(1);
    expect(decision.cards[0].rank).toBeGreaterThan(5);
  });

  it('xả Heo (2) khẩn cấp khi đối thủ còn ít bài (<= 4 lá) để tránh thối 2 ôm Heo', () => {
    mockTableState.players[1].cardsRemaining = 4; // Đối thủ còn 4 lá (nguy cơ về sảnh)

    // Bàn đang đánh con 10
    mockTableState.lastPlay = {
      playerId: 'human_1',
      playerName: 'Human',
      combo: analyzeCombo([createCard(10)]),
    };

    // Bot chỉ có rác 6 và Heo 2 (không có rác thường nào > 10)
    const botHand: Card[] = [
      createCard(6),
      createCard(15, 'diamonds'), // Heo 2
    ];

    const decision = brain.decideMove('bot_1', botHand, mockTableState);
    // Bot khôn sẽ quẳng con 2 ra đè ngay, tránh ôm con 2 chờ chết
    expect(decision.action).toBe('PLAY');
    expect(decision.cards[0].rank).toBe(15);
    expect(decision.reason).toContain('Xả Heo khẩn cấp');
  });

  it('cầm >= 2 con Heo và đối thủ còn <= 6 lá: chủ động xả bớt 1 Heo tránh thối chùm', () => {
    mockTableState.players[1].cardsRemaining = 5;

    // Bàn đang đánh con J (11)
    mockTableState.lastPlay = {
      playerId: 'human_1',
      playerName: 'Human',
      combo: analyzeCombo([createCard(11)]),
    };

    // Bot cầm 2 con 2 và rác 7 (không có rác thường > 11)
    const botHand: Card[] = [
      createCard(7),
      createCard(15, 'spades'),
      createCard(15, 'hearts'),
    ];

    const decision = brain.decideMove('bot_1', botHand, mockTableState);
    expect(decision.action).toBe('PLAY');
    expect(decision.cards[0].rank).toBe(15);
    expect(decision.reason).toContain('Cầm nhiều Heo');
  });

  it('cầm sảnh to (10-J-Q-K-A) và rác nhỏ lẻ (3, 5, 8) khi đi đầu: đánh rác nhỏ thăm dò, KHÔNG đánh thẳng sảnh to đi luôn', () => {
    // Bot cầm sảnh to tới A và 3 lá rác rời rạc không tạo bộ (3, 5, 8)
    const botHand: Card[] = [
      createCard(3),
      createCard(5),
      createCard(8),
      createCard(10),
      createCard(11),
      createCard(12),
      createCard(13),
      createCard(14), // Sảnh 10-J-Q-K-A
    ];

    const decision = brain.decideMove('bot_1', botHand, mockTableState);
    expect(decision.action).toBe('PLAY');
    // KHÔNG được ném sảnh 10-J-Q-K-A đi ngay đầu ván! Phải đánh rác nhỏ (3, 5 hoặc 8) để thăm dò
    expect(decision.cards.length).toBe(1);
    expect([3, 5, 8]).toContain(decision.cards[0].rank);
  });

  it('cầm đôi to (Đôi K) và rác nhỏ (3, 5, 7) khi đi đầu: đánh rác nhỏ thăm dò, KHÔNG đánh thẳng đôi to đi luôn', () => {
    // Bot cầm 1 đôi to (Đôi K) và 3 rác nhỏ lẻ
    const botHand: Card[] = [
      createCard(3),
      createCard(5),
      createCard(7),
      createCard(13, 'spades'),
      createCard(13, 'hearts'), // Đôi K
    ];

    const decision = brain.decideMove('bot_1', botHand, mockTableState);
    expect(decision.action).toBe('PLAY');
    // Phải đánh rác nhỏ thăm dò, không được ném đôi K đi đầu tiên
    expect(decision.cards.length).toBe(1);
    expect([3, 5, 7]).toContain(decision.cards[0].rank);
  });

  it('bàn đánh rác nhỏ (con 8) ở đầu ván (đối thủ còn 9 lá) và bot không có rác đè được, còn nhiều rác nhỏ: bot chọn PASS để giữ Heo', () => {
    mockTableState.players[1].cardsRemaining = 9; // Đối thủ còn nguyên 9 lá
    mockTableState.lastPlay = {
      playerId: 'human_1',
      playerName: 'Human',
      combo: analyzeCombo([createCard(8)]), // Đối thủ đánh rác 8
    };

    // Bot có đôi 4, đôi 5, rác 7 (đều < 8), và Heo 2 (duy nhất > 8)
    const botHand: Card[] = [
      createCard(4, 'spades'), createCard(4, 'hearts'),
      createCard(5, 'spades'), createCard(5, 'hearts'),
      createCard(7), // Rác 7 < 8 (không đè được)
      createCard(15, 'spades'), // Heo 2
    ];

    const decision = brain.decideMove('bot_1', botHand, mockTableState);
    // Không có rác đè được và còn nhiều bài ở đầu ván: Bot chọn PASS để giữ Heo an toàn, không chém Heo
    expect(decision.action).toBe('PASS');
  });

  it('cầm [Đôi 4, Heo 2]: ưu tiên đánh Heo trước cướp cái để về bằng đôi 4 an toàn, không bị thối 2', () => {
    const botHand: Card[] = [
      createCard(4, 'spades'),
      createCard(4, 'hearts'), // Đôi 4
      createCard(15, 'diamonds'), // Heo 2
    ];

    const decision = brain.decideMove('bot_1', botHand, mockTableState);
    expect(decision.action).toBe('PLAY');
    // Phải đánh Heo 2 trước cướp cái để con cuối về bằng Đôi 4, không được để Heo 2 về cuối bị phạt thối
    expect(decision.cards.length).toBe(1);
    expect(decision.cards[0].rank).toBe(15);
  });

  it('bàn đánh Đôi Q, bot có Sáp K (3 con K): bot biết trích đôi K từ sáp để đè đôi Q', () => {
    mockTableState.lastPlay = {
      playerId: 'human_1',
      playerName: 'Human',
      combo: analyzeCombo([createCard(12, 'spades'), createCard(12, 'hearts')]), // Đôi Q
    };

    // Bot có Sáp K (3 con K) và rác 6
    const botHand: Card[] = [
      createCard(6),
      createCard(13, 'spades'),
      createCard(13, 'hearts'),
      createCard(13, 'clubs'), // Sáp K
    ];

    const decision = brain.decideMove('bot_1', botHand, mockTableState);
    expect(decision.action).toBe('PLAY');
    expect(decision.cards.length).toBe(2);
    expect(decision.cards[0].rank).toBe(13); // Trích đôi K đè đôi Q
  });

  it('có sảnh nhỏ [3, 4, 5] và sảnh to [10, J, Q, K, A]: ưu tiên xả sảnh nhỏ trước để giữ sảnh to làm chốt', () => {
    const botHand: Card[] = [
      createCard(3), createCard(4), createCard(5), // Sảnh nhỏ 3-4-5
      createCard(10), createCard(11), createCard(12), createCard(13), createCard(14), // Sảnh to 10-J-Q-K-A
    ];

    const decision = brain.decideMove('bot_1', botHand, mockTableState);
    expect(decision.action).toBe('PLAY');
    // Phải xả sảnh nhỏ 3-4-5 trước, không được đánh thẳng sảnh to 10-J-Q-K-A
    expect(decision.cards.length).toBe(3);
    expect(decision.cards.map((c) => c.rank)).toEqual([3, 4, 5]);
  });

  it('người sau còn 1 lá, bot có Đôi 4 và Đôi K: bot đánh Đôi 4 thay vì ném Đôi K to', () => {
    mockTableState.players[1].cardsRemaining = 1; // Người sau còn 1 lá

    const botHand: Card[] = [
      createCard(4, 'spades'), createCard(4, 'hearts'), // Đôi 4
      createCard(13, 'spades'), createCard(13, 'hearts'), // Đôi K
    ];

    const decision = brain.decideMove('bot_1', botHand, mockTableState);
    expect(decision.action).toBe('PLAY');
    expect(decision.cards.length).toBe(2);
    // Đánh đôi nhỏ (đôi 4) vì người 1 lá cũng không đỡ được, giữ lại đôi K to
    expect(decision.cards[0].rank).toBe(4);
  });
});

describe('Loc Bot AI - Contextual Selection Hint', () => {
  it('gợi ý đúng các lá còn lại của sảnh khi người chơi chọn một phần sảnh đè bàn', () => {
    // Bàn đang đánh sảnh 3 lá: 3-4-5
    const tableCombo = analyzeCombo([createCard(3), createCard(4), createCard(5)]);

    // Tay người chơi có sảnh 6-7-8 và rác 10
    const hand: Card[] = [
      createCard(6),
      createCard(7),
      createCard(8),
      createCard(10),
    ];

    // Người chơi bấm chọn lá 6
    const hints = getBotHintForSelection([hand[0]], hand, tableCombo);
    // Bot gợi ý sáng lá 7 và lá 8 để thành sảnh 6-7-8 đè được 3-4-5
    expect(hints.map((c) => c.rank)).toEqual([7, 8]);
  });

  it('không sáng lá nào nếu người chơi chọn sai lá không thể tạo bộ đè bàn', () => {
    // Bàn đang đánh Đôi 9
    const tableCombo = analyzeCombo([createCard(9, 'spades'), createCard(9, 'hearts')]);

    // Tay người chơi có Đôi 8 (nhỏ hơn 9) và 1 lá K (không có đôi K)
    const hand: Card[] = [
      createCard(8, 'spades'),
      createCard(8, 'clubs'),
      createCard(13, 'diamonds'), // K lẻ
    ];

    // Người chơi chọn lá 8 (quá nhỏ không đè được đôi 9)
    const hints1 = getBotHintForSelection([hand[0]], hand, tableCombo);
    expect(hints1).toEqual([]);

    // Người chơi chọn lá K (không có đôi K)
    const hints2 = getBotHintForSelection([hand[2]], hand, tableCombo);
    expect(hints2).toEqual([]);
  });

  it('khi bàn trống: gợi ý đúng sảnh dài khi người chơi chọn 1 lá thuộc sảnh', () => {
    // Tay người chơi có sảnh 5-6-7-8 và đôi 10
    const hand: Card[] = [
      createCard(5),
      createCard(6),
      createCard(7),
      createCard(8),
      createCard(10, 'spades'),
      createCard(10, 'hearts'),
    ];

    // Người chơi chọn lá 6
    const hints = getBotHintForSelection([hand[1]], hand, null);
    // Gợi ý sáng các lá 5, 7, 8 còn lại của sảnh
    expect(hints.map((c) => c.rank).sort((a, b) => a - b)).toEqual([5, 7, 8]);
  });

  it('khi bàn trống: không sáng thêm lá nào nếu chọn các lá cọc cạch không ghép được bộ', () => {
    const hand: Card[] = [
      createCard(3),
      createCard(9),
      createCard(12),
    ];

    // Người chơi chọn lá 3 và lá 9 cọc cạch
    const hints = getBotHintForSelection([hand[0], hand[1]], hand, null);
    expect(hints).toEqual([]);
  });
});

describe('Loc Bot AI - Utility Evaluator & Independent Generator Refinements', () => {
  let brain: BotBrain;
  let mockTableState: TableState;

  beforeEach(() => {
    brain = new BotBrain();
    mockTableState = {
      roomId: 'room_1',
      roomName: 'Test Room',
      hostId: 'host_1',
      status: 'playing',
      players: [
        { id: 'bot_1', name: 'Bot', isHost: false, isSpectator: false, cardsRemaining: 6, hasPassed: false },
        { id: 'human_1', name: 'Human', isHost: true, isSpectator: false, cardsRemaining: 5, hasPassed: false },
      ],
      spectators: [],
      currentTurnPlayerId: 'bot_1',
      roundLeaderPlayerId: 'bot_1',
      turnDeadline: Date.now() + 30000,
      lastPlay: null,
      samState: null,
      playHistory: [],
      roundResult: null,
    };
  });

  it('bot chỉ còn 1 Heo 2, bàn đánh A -> PLAY Heo 2 về đích (không PASS)', () => {
    mockTableState.lastPlay = {
      playerId: 'human_1',
      playerName: 'Human',
      combo: analyzeCombo([createCard(14)]), // Lá A
    };
    const botHand: Card[] = [createCard(15, 'spades')]; // 1 Heo 2 duy nhất
    const decision = brain.decideMove('bot_1', botHand, mockTableState);
    expect(decision.action).toBe('PLAY');
    expect(decision.cards.length).toBe(1);
    expect(decision.cards[0].rank).toBe(15);
    expect(decision.reason).toContain('về nhất ván đấu');
  });

  it('bot chỉ còn [A, 2, 3], bàn trống -> PLAY sảnh A-2-3 về đích', () => {
    const botHand: Card[] = [
      createCard(3, 'hearts'),
      createCard(14, 'spades'), // A
      createCard(15, 'diamonds'), // 2
    ];
    const decision = brain.decideMove('bot_1', botHand, mockTableState);
    expect(decision.action).toBe('PLAY');
    expect(decision.cards.length).toBe(3);
    expect(decision.combo?.type).toBe('STRAIGHT');
    expect(decision.reason).toContain('về nhất ván đấu');
  });

  it('bàn đánh sảnh 3-4-5 -> bot không sinh hoặc không chọn sảnh A-2-3 để đè', () => {
    mockTableState.lastPlay = {
      playerId: 'human_1',
      playerName: 'Human',
      combo: analyzeCombo([createCard(3), createCard(4), createCard(5)]),
    };
    // Bot có A-2-3 và không có sảnh khác
    const botHand: Card[] = [
      createCard(3, 'hearts'),
      createCard(14, 'spades'),
      createCard(15, 'diamonds'),
      createCard(7),
    ];
    const decision = brain.decideMove('bot_1', botHand, mockTableState);
    expect(decision.action).toBe('PASS');
  });

  it('bot có [3, A, A, A], người sau báo 1 lá, bàn đánh 9 -> PLAY A to nhất để chặn, không PASS', () => {
    mockTableState.players[1].cardsRemaining = 1; // Human còn 1 lá
    mockTableState.lastPlay = {
      playerId: 'human_1',
      playerName: 'Human',
      combo: analyzeCombo([createCard(9)]),
    };
    const botHand: Card[] = [
      createCard(3),
      createCard(14, 'spades'),
      createCard(14, 'hearts'),
      createCard(14, 'diamonds'), // Sáp A
    ];
    const decision = brain.decideMove('bot_1', botHand, mockTableState);
    expect(decision.action).toBe('PLAY');
    expect(decision.cards.length).toBe(1);
    expect(decision.cards[0].rank).toBe(14);
  });

  it('bot có [Đôi A, Heo 2], bàn đánh Đôi K -> PLAY Đôi A đè bài, không bị ép PASS', () => {
    mockTableState.lastPlay = {
      playerId: 'human_1',
      playerName: 'Human',
      combo: analyzeCombo([createCard(13, 'spades'), createCard(13, 'hearts')]), // Đôi K
    };
    const botHand: Card[] = [
      createCard(14, 'spades'),
      createCard(14, 'hearts'), // Đôi A
      createCard(15, 'diamonds'), // Heo 2
    ];
    const decision = brain.decideMove('bot_1', botHand, mockTableState);
    expect(decision.action).toBe('PLAY');
    expect(decision.cards.length).toBe(2);
    expect(decision.cards[0].rank).toBe(14);
  });

  it('candidate generator quét độc lập mọi bộ khả dĩ từ botHand', () => {
    const hand: Card[] = [
      createCard(4, 'spades'),
      createCard(4, 'hearts'),
      createCard(5),
      createCard(6),
      createCard(7),
    ];
    const moves = generateCandidateMoves(hand, null);
    // Đảm bảo có Single 4, Đôi 4, Sảnh 4-5-6-7, Sảnh 5-6-7, Sảnh 4-5-6
    const pair4 = moves.find((m) => m.combo?.type === 'PAIR' && m.combo.highestRank === 4);
    const straight4 = moves.find((m) => m.combo?.type === 'STRAIGHT' && m.combo.length === 4);
    const straight3 = moves.find((m) => m.combo?.type === 'STRAIGHT' && m.combo.length === 3);

    expect(pair4).toBeDefined();
    expect(straight4).toBeDefined();
    expect(straight3).toBeDefined();
  });

  it('bot có Tứ quý 8, bàn đánh rác 7 ở đầu ván -> bot chọn PASS, không xé 1 lá 8 phá tứ quý', () => {
    mockTableState.players[1].cardsRemaining = 9; // Đầu ván
    mockTableState.lastPlay = {
      playerId: 'human_1',
      playerName: 'Human',
      combo: analyzeCombo([createCard(7)]),
    };
    const botHand: Card[] = [
      createCard(8, 'spades'),
      createCard(8, 'clubs'),
      createCard(8, 'diamonds'),
      createCard(8, 'hearts'), // Tứ quý 8
      createCard(5), // Rác 5 < 7
    ];
    const decision = brain.decideMove('bot_1', botHand, mockTableState);
    // Bot không được xé 1 lá 8 ra đè 7 vì chi phí phá tứ quý rất lớn
    expect(decision.action).toBe('PASS');
  });

  it('bot có Sáp 9, bàn đánh rác 8 ở đầu ván -> bot chọn PASS, không xé 1 lá 9 phá sáp', () => {
    mockTableState.players[1].cardsRemaining = 9; // Đầu ván
    mockTableState.lastPlay = {
      playerId: 'human_1',
      playerName: 'Human',
      combo: analyzeCombo([createCard(8)]),
    };
    const botHand: Card[] = [
      createCard(9, 'spades'),
      createCard(9, 'clubs'),
      createCard(9, 'diamonds'), // Sáp 9
      createCard(4), // Rác 4 < 8
    ];
    const decision = brain.decideMove('bot_1', botHand, mockTableState);
    expect(decision.action).toBe('PASS');
  });

  it('bot có sảnh 4-5-6-7-8 và rác K, bàn đánh 6 -> bot đánh K đè 6, KHÔNG xé lá trong sảnh', () => {
    mockTableState.lastPlay = {
      playerId: 'human_1',
      playerName: 'Human',
      combo: analyzeCombo([createCard(6)]),
    };
    const botHand: Card[] = [
      createCard(4),
      createCard(5),
      createCard(6),
      createCard(7),
      createCard(8), // Sảnh 4-5-6-7-8
      createCard(13), // Rác K
    ];
    const decision = brain.decideMove('bot_1', botHand, mockTableState);
    expect(decision.action).toBe('PLAY');
    expect(decision.cards.length).toBe(1);
    // Phải đánh con K (13), không xé con 7 hay con 8 từ sảnh 4-5-6-7-8
    expect(decision.cards[0].rank).toBe(13);
  });
});


