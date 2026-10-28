import { Card, CardCombo } from '../types';
import { TableState } from '../network-types';
import { generateCandidateMoves } from './candidate-generator';
import { evaluateCandidateMove } from './utility-evaluator';
import { CardTracker } from './card-tracker';
import { BotPersonality } from './types';

/**
 * Thuật toán Gợi ý theo tổ hợp lá bài người chơi đã chọn (Selection Hint Engine)
 * VẬN HÀNH 100% THEO THUẬT TOÁN CORE CỦA BOT AI (Single Source of Truth):
 * - Khi người chơi chọn 1 hay nhiều lá, hệ thống sinh tất cả các nước đi hợp lệ của Bot (Candidate Moves).
 * - Lọc ra các nước đi chứa toàn bộ các lá người chơi đã chọn.
 * - Sử dụng Hàm Tiện Ích Động (Utility Evaluator) để chọn nước đi có điểm số tối ưu nhất (ít phá bài nhất, tối ưu nhịp bài).
 * - Nếu nước đi tối ưu nhất có nhiều lá hơn số lá người chơi đã chọn -> Gợi ý các lá còn thiếu.
 * - Nếu người chơi đã chọn đủ toàn bộ các lá của nước đi tối ưu nhất -> Trả về [] (không sáng thêm lá để tránh xé các bộ khác).
 * - Nếu người chơi chọn sai lá, cọc cạch hoặc không thể tạo bộ đè bàn -> Trả về [] (không sáng lá nào).
 */
export function getBotHintForSelection(
  selectedCards: Card[],
  myHand: Card[],
  tableCombo: CardCombo | null,
  tableState?: TableState,
  personality: BotPersonality = 'balanced'
): Card[] {
  if (!selectedCards || selectedCards.length === 0 || !myHand || myHand.length === 0) {
    return [];
  }

  // 1. Sinh toàn bộ các nước đi ứng viên hợp lệ từ myHand với tableCombo hiện tại
  const candidates = generateCandidateMoves(myHand, tableCombo);
  if (candidates.length === 0) return [];

  const selectedIds = new Set(selectedCards.map((c) => c.id));

  // 2. Lọc các candidate hợp lệ có chứa TOÀN BỘ các lá mà người chơi đã chọn
  const matchingCandidates = candidates.filter((cand) => {
    if (cand.action !== 'PLAY' || cand.cards.length === 0) return false;
    return selectedCards.every((sc) => cand.cards.some((c) => c.id === sc.id));
  });

  if (matchingCandidates.length === 0) {
    // Không có nước đi hợp lệ nào chứa tổ hợp lá bài này (chọn sai lá / cọc cạch)
    return [];
  }

  // 3. Đánh giá tất cả các nước đi phù hợp bằng Hàm Tiện Ích của Bot để chọn nước đi thông minh nhất
  const effectiveTableState: TableState = tableState || {
    roomId: 'hint_session',
    roomName: 'Hint Session',
    hostId: 'player',
    status: 'playing',
    players: [
      { id: 'player', name: 'You', isHost: true, isSpectator: false, isBot: false, cardsRemaining: myHand.length, hasPassed: false },
    ],
    spectators: [],
    currentTurnPlayerId: 'player',
    roundLeaderPlayerId: tableCombo ? 'other' : 'player',
    turnDeadline: Date.now() + 30000,
    lastPlay: tableCombo ? { playerId: 'other', playerName: 'Other', combo: tableCombo } : null,
    samState: null,
    playHistory: [],
    roundResult: null,
  };

  const dummyTracker = new CardTracker();
  const evaluatedMoves = matchingCandidates.map((cand) =>
    evaluateCandidateMove(cand, myHand, effectiveTableState, dummyTracker, 'player', personality)
  );

  // Sắp xếp giảm dần theo điểm Utility
  evaluatedMoves.sort((a, b) => b.score - a.score);
  const bestCandidate = evaluatedMoves[0].candidate;

  // 4. Kiểm tra xem người chơi đã chọn đủ số lá của best candidate chưa:
  // Nếu đã chọn đủ -> không sáng thêm lá nào để tránh xé bộ khác.
  // Nếu còn thiếu -> gợi ý các lá bài còn thiếu trong best candidate.
  if (bestCandidate.cards.length <= selectedCards.length) {
    return [];
  }

  return bestCandidate.cards.filter((c) => !selectedIds.has(c.id));
}
