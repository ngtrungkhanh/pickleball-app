import { Card } from '../types';
import { TableState } from '../network-types';
import { analyzeCombo } from '../analyzer';
import { CardTracker } from './card-tracker';
import { evaluateSamPossibility } from './hand-evaluator';
import { generateCandidateMoves } from './candidate-generator';
import { evaluateCandidateMove } from './utility-evaluator';
import { BotDecision, BotPersonality } from './types';
import { sortCards } from '../deck';

/**
 * Trí tuệ nhân tạo (Bot AI) cho Game Đánh Lốc
 * Vận hành theo Kiến trúc Hàm Tiện Ích Động (Utility & Hand Planning Engine):
 * - Đánh giá Nhịp bài (Steps to Out) và Chi phí cơ hội bài to (Control Opportunity Cost)
 * - Tự động bảo toàn các bộ chốt chặn (Sảnh to, Đôi to, Heo 2) khi còn nhiều rác nhỏ
 * - Chỉ sử dụng Heo 2 khi an toàn hoặc mang tính quyết định
 * - Bảo vệ tuyệt đối luật đền bài (người kế tiếp 1 lá) và luật thối Heo 2 cuối ván
 * - Hỗ trợ các phong cách tính cách (Personality): 'aggressive' | 'conservative' | 'balanced'
 */
export class BotBrain {
  private tracker: CardTracker;
  private personality: BotPersonality;

  constructor(tracker?: CardTracker, personality: BotPersonality = 'balanced') {
    this.tracker = tracker || new CardTracker();
    this.personality = personality;
  }

  public getTracker(): CardTracker {
    return this.tracker;
  }

  public getPersonality(): BotPersonality {
    return this.personality;
  }

  public setPersonality(personality: BotPersonality): void {
    this.personality = personality;
  }

  /**
   * Quyết định có Báo Sâm hay không ở đầu ván (có tính đến tính cách Bot)
   */
  public decideSamCall(botHand: Card[]): boolean {
    return evaluateSamPossibility(botHand, this.personality);
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

    const tableCombo = tableState.lastPlay ? tableState.lastPlay.combo : null;

    // 1. Sinh toàn bộ các nước đi ứng viên hợp lệ độc lập với phân rã tĩnh
    const candidates = generateCandidateMoves(botHand, tableCombo);

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

    // 2. Chấm điểm tiện ích cho từng nước đi ứng viên theo tính cách của Bot
    const evaluatedMoves = candidates.map((cand) =>
      evaluateCandidateMove(cand, botHand, tableState, this.tracker, botId, this.personality)
    );

    // 3. Ưu tiên tuyệt đối nước đi VỀ ĐÍCH (Terminal Win)
    // Nước đi đánh hết toàn bộ số lá trên tay luôn đảm bảo kết thúc ván đấu
    const terminalMoves = evaluatedMoves.filter(
      (m) => m.candidate.action === 'PLAY' && m.candidate.cards.length === botHand.length
    );

    if (terminalMoves.length > 0) {
      // Ưu tiên về sạch (+10000) hơn về có Heo 2 (+9700)
      terminalMoves.sort((a, b) => b.score - a.score);
      const chosenTerminal = terminalMoves[0];
      return {
        action: chosenTerminal.candidate.action,
        cards: chosenTerminal.candidate.cards,
        combo: chosenTerminal.candidate.combo || analyzeCombo(chosenTerminal.candidate.cards),
        reason: chosenTerminal.reason,
      };
    }

    // 4. Nếu không có nước về đích: Sắp xếp theo điểm số tiện ích giảm dần
    evaluatedMoves.sort((a, b) => b.score - a.score);

    // 5. Chọn nước đi có điểm tiện ích cao nhất
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
