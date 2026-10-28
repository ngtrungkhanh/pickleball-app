import { Card } from '../types';
import { TableState } from '../network-types';
import { analyzeCombo } from '../analyzer';
import { CardTracker } from './card-tracker';
import { partitionHand, evaluateSamPossibility } from './hand-evaluator';
import { generateCandidateMoves } from './candidate-generator';
import { evaluateCandidateMove } from './utility-evaluator';
import { BotDecision } from './types';
import { sortCards } from '../deck';

/**
 * Trí tuệ nhân tạo (Bot AI) cho Game Đánh Lốc
 * Vận hành theo Kiến trúc Hàm Tiện Ích Động (Utility & Hand Planning Engine):
 * - Đánh giá Nhịp bài (Steps to Out) và Chi phí cơ hội bài to (Control Opportunity Cost)
 * - Tự động bảo toàn các bộ chốt chặn (Sảnh to, Đôi to, Heo 2) khi còn nhiều rác nhỏ
 * - Chỉ sử dụng Heo 2 khi an toàn hoặc mang tính quyết định
 * - Bảo vệ tuyệt đối luật đền bài (người kế tiếp 1 lá) và luật thối Heo 2 cuối ván
 */
export class BotBrain {
  private tracker: CardTracker;

  constructor(tracker?: CardTracker) {
    this.tracker = tracker || new CardTracker();
  }

  public getTracker(): CardTracker {
    return this.tracker;
  }

  /**
   * Quyết định có Báo Sâm hay không ở đầu ván
   */
  public decideSamCall(botHand: Card[]): boolean {
    return evaluateSamPossibility(botHand);
  }

  /**
   * Ra quyết định đánh bài hoặc bỏ lượt khi đến phiên
   * Dựa trên Hàm Tiện Ích Nhịp Bài (Utility Scoring)
   */
  public decideMove(
    botId: string,
    botHand: Card[],
    tableState: TableState
  ): BotDecision {
    if (!botHand || botHand.length === 0) {
      return { action: 'PASS', cards: [], reason: 'Hết bài' };
    }

    const partition = partitionHand(botHand);
    const tableCombo = tableState.lastPlay ? tableState.lastPlay.combo : null;

    // 1. Sinh toàn bộ các nước đi ứng viên hợp lệ
    const candidates = generateCandidateMoves(botHand, tableCombo, partition);

    if (candidates.length === 0) {
      if (!tableCombo) {
        // Bàn trống mà không sinh được nước đi (edge case) -> đánh lá nhỏ nhất
        const sorted = sortCards(botHand);
        return {
          action: 'PLAY',
          cards: [sorted[0]],
          combo: analyzeCombo([sorted[0]]),
          reason: 'Đánh lá nhỏ nhất',
        };
      }
      return { action: 'PASS', cards: [], reason: 'Không có nước đi hợp lệ' };
    }

    // 2. Chấm điểm tiện ích cho từng nước đi ứng viên
    const evaluatedMoves = candidates.map((cand) =>
      evaluateCandidateMove(cand, botHand, tableState, this.tracker, botId)
    );

    // 3. Sắp xếp theo điểm số giảm dần
    evaluatedMoves.sort((a, b) => b.score - a.score);

    // 4. Chọn nước đi có điểm tiện ích cao nhất
    const bestMove = evaluatedMoves[0];

    const combo =
      bestMove.candidate.combo ||
      (bestMove.candidate.cards.length > 0 ? analyzeCombo(bestMove.candidate.cards) : undefined);

    return {
      action: bestMove.candidate.action,
      cards: bestMove.candidate.cards,
      combo,
      reason: bestMove.reason,
    };
  }
}
