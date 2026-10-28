import { Card, CardCombo, Rank } from '../types';
import { TableState } from '../network-types';
import { analyzeCombo } from '../analyzer';
import { sortCards } from '../deck';
import { CardTracker } from './card-tracker';
import { CandidateMove, HandPartition, BotPersonality } from './types';
import { partitionHand } from './hand-evaluator';

export interface EvaluatedMove {
  candidate: CandidateMove;
  score: number;
  reason: string;
}

/**
 * Đếm số lượng lá rác nhỏ / rác yếu (rank <= 10) trong một phân rã bài
 */
function countFodderSingles(partition: HandPartition): number {
  return partition.singles.filter((c) => c.rank <= 10).length;
}

/**
 * Tính tổng số bộ cần đánh để về hết bài (Steps to Out)
 */
function calculateStepsToOut(partition: HandPartition): number {
  return (
    partition.quads.length +
    partition.straights.length +
    partition.triples.length +
    partition.pairs.length +
    partition.singles.length
  );
}

/**
 * Xác định giá trị kiểm soát (Control Cost) của một nước đi
 * Các bộ to (Heo 2, Tứ quý, Sảnh to K/A, Đôi to K/A) có giá trị kiểm soát rất cao,
 * không được tùy tiện nướng sớm khi còn nhiều rác nhỏ.
 */
function getMoveControlCost(combo: CardCombo): number {
  if (combo.type === 'SINGLE' && combo.highestRank === 15) return 60; // Heo 2
  if (combo.type === 'QUAD') return 70; // Tứ quý
  if (combo.type === 'STRAIGHT' && combo.highestRank >= 13) return 45; // Sảnh to (K hoặc A)
  if (combo.type === 'PAIR') {
    if (combo.highestRank === 15) return 100; // Đôi 2
    if (combo.highestRank >= 13) return 35; // Đôi K, Đôi A
    if (combo.highestRank >= 11) return 15; // Đôi J, Đôi Q
  }
  return 0; // Các sảnh nhỏ, đôi nhỏ, rác nhỏ không có chi phí kiểm soát
}

/**
 * Nhóm các lá bài theo Rank
 */
function groupCardsByRank(cards: Card[]): Map<Rank, Card[]> {
  const byRank = new Map<Rank, Card[]>();
  for (const c of cards) {
    if (!byRank.has(c.rank)) byRank.set(c.rank, []);
    byRank.get(c.rank)!.push(c);
  }
  return byRank;
}

/**
 * Đánh giá chi phí phá bộ (Partial combo breakage) một cách khách quan dựa trên cấu trúc bài
 * Phân biệt rõ: Tiêu nguyên bộ (0 phạt) vs Xé một phần bộ (phạt theo mức độ phá)
 */
function evaluateComboBreakage(
  botHand: Card[],
  playedCards: Card[],
  tableCombo: CardCombo | null,
  isUrgent: boolean
): { penalty: number; bonus: number; reasons: string[] } {
  const handByRank = groupCardsByRank(botHand);
  const playedByRank = groupCardsByRank(playedCards);
  let penalty = 0;
  let bonus = 0;
  const reasons: string[] = [];

  // 1. Phá các bộ cùng rank (Tứ quý, Sáp, Đôi)
  for (const [rank, playedOfRank] of playedByRank) {
    const handOfRank = handByRank.get(rank) || [];
    const countBefore = handOfRank.length;
    const countPlayed = playedOfRank.length;

    if (countBefore === 4) {
      if (countPlayed < 4) {
        // Phá Tứ quý để đánh lẻ/đôi/sáp
        penalty += 250;
        reasons.push(`Phá Tứ quý ${rank}`);
      }
    } else if (countBefore === 3) {
      if (countPlayed === 2) {
        // Trích Đôi từ Sáp
        if (tableCombo && tableCombo.type === 'PAIR') {
          bonus += 45;
          reasons.push(`Trích đôi ${rank} từ sáp để đè đôi đối thủ`);
        } else {
          penalty += 30;
          reasons.push(`Trích đôi ${rank} từ sáp để lại 1 rác lẻ`);
        }
      } else if (countPlayed === 1) {
        // Xé 1 lá từ Sáp (còn lại Đôi)
        penalty += 40;
        reasons.push(`Xé 1 lá từ sáp ${rank}`);
      }
    } else if (countBefore === 2) {
      if (countPlayed === 1) {
        // Xé Đôi thành 1 rác lẻ
        penalty += 50;
        reasons.push(`Xé đôi ${rank}`);
      }
    }
  }

  // 2. Phá Sảnh (nếu nước đi không phải là STRAIGHT)
  const combo = analyzeCombo(playedCards);
  if (combo.type !== 'STRAIGHT') {
    const partBefore = partitionHand(botHand);
    const playedIds = new Set(playedCards.map((c) => c.id));
    const handAfter = botHand.filter((c) => !playedIds.has(c.id));
    const partAfter = partitionHand(handAfter);

    const straightCardsBefore = partBefore.straights.reduce((sum, s) => sum + s.length, 0);
    const straightCardsAfter = partAfter.straights.reduce((sum, s) => sum + s.length, 0);

    if (straightCardsBefore > 0 && straightCardsAfter < straightCardsBefore) {
      // Bị mất hoặc đứt gãy sảnh: Phạt cơ bản 80đ + 30đ cho mỗi lá sảnh bị hao hụt
      const lostCards = straightCardsBefore - straightCardsAfter;
      penalty += 80 + lostCards * 30;
      reasons.push(`Làm hỏng sảnh (${lostCards} lá sảnh bị vỡ)`);
    }
  }

  // Nếu trong tình thế khẩn cấp (đối thủ sắp về, người sau 1 lá, hoặc cứu cóng), giảm 70% hình phạt phá bộ
  if (isUrgent) {
    penalty = Math.round(penalty * 0.3);
  }

  return { penalty, bonus, reasons };
}

/**
 * Hàm Đánh Giá Tiện Ích (Utility Function) chấm điểm một nước đi ứng viên
 */
export function evaluateCandidateMove(
  candidate: CandidateMove,
  botHand: Card[],
  tableState: TableState,
  tracker: CardTracker,
  botId: string,
  personality: BotPersonality = 'balanced'
): EvaluatedMove {
  const isRoundLeader = !tableState.lastPlay;
  const isNextPlayerSingle = tracker.isNextPlayerSingle(botId, tableState.players);
  const minOpponentCards = tracker.getMinOpponentCards(botId, tableState.players);
  const isUrgent = minOpponentCards <= 3 || isNextPlayerSingle || (botHand.length === 10 && minOpponentCards <= 5);

  // ===========================================================================
  // TRƯỜNG HỢP 1: NƯỚC ĐI BỎ LƯỢT (PASS)
  // ===========================================================================
  if (candidate.action === 'PASS') {
    if (isRoundLeader) {
      // Người làm chủ vòng không được bỏ lượt
      return { candidate, score: -999999, reason: 'Chủ vòng không thể bỏ lượt' };
    }

    let passScore = 0;
    let reason = 'Bỏ lượt để bảo toàn bộ bài / giữ bài tẩy';

    // Nếu bot còn nguyên 10 lá và có đối thủ sắp về (<= 4 lá) -> Phạt nặng vì nguy cơ CÓNG 14 LÁ
    if (botHand.length === 10 && minOpponentCards <= 4) {
      passScore -= 400;
      reason = 'Nguy cơ bị Cóng: Cần tìm cách đè bài thoát cóng';
    }

    return { candidate, score: passScore, reason };
  }

  // ===========================================================================
  // TRƯỜNG HỢP 2: NƯỚC ĐI ĐÁNH BÀI (PLAY)
  // ===========================================================================
  const playedCards = candidate.cards;
  const combo = candidate.combo || analyzeCombo(playedCards);
  const playedIds = new Set(playedCards.map((c) => c.id));
  const handAfter = botHand.filter((c) => !playedIds.has(c.id));
  const partitionAfter = partitionHand(handAfter);

  let score = 0;
  const reasons: string[] = [];

  // ---------------------------------------------------------------------------
  // 1. LUẬT VỀ ĐÍCH (TERMINAL WIN)
  // ---------------------------------------------------------------------------
  if (handAfter.length === 0) {
    const containsTwo = playedCards.some((c) => c.rank === 15);
    if (!containsTwo) {
      // Về nhất sạch không dính Heo 2
      return {
        candidate,
        score: 10000,
        reason: 'Đánh hết bài để về nhất sạch ván đấu!',
      };
    }

    // Về có Heo 2: Theo luật Lốc, người về nhất vẫn ăn cả làng, chỉ bị trừ 5 lá phạt thối 2
    // Vẫn là chiến thắng vượt trội (+9700), không bao giờ được bỏ lượt!
    return {
      candidate,
      score: 9700,
      reason: 'Đánh hết bài về nhất ván đấu (chấp nhận trừ 5 lá phạt thối Heo 2)',
    };
  }

  // 1.2. Rủi ro để lại Heo khi handAfter chỉ còn toàn Heo 2
  const remainingTwos = handAfter.filter((c) => c.rank === 15).length;
  const remainingNonTwos = handAfter.filter((c) => c.rank !== 15).length;

  if (remainingTwos > 0 && remainingNonTwos === 0) {
    // Sau nước này, tay chỉ còn toàn Heo 2
    // Đánh giá khả năng kiểm soát vòng của nước đi hiện tại:
    const isDominantControl =
      combo.highestRank === 14 || // A
      (combo.type === 'PAIR' && combo.highestRank === 14) || // Đôi A
      combo.type === 'QUAD' || // Tứ quý
      (combo.type === 'STRAIGHT' && combo.highestRank === 14); // Sảnh đến A

    const stepsAfter = calculateStepsToOut(partitionAfter);

    if (isDominantControl && stepsAfter <= 1) {
      // Chuỗi dứt điểm: Bài đè cực mạnh nắm chắc lượt sau để về bằng Heo
      score += 250;
      reasons.push('Đè bài áp đảo chuẩn bị dứt điểm về ván bằng Heo 2');
    } else if (minOpponentCards <= 3) {
      // Đối thủ sắp về -> Bắt buộc phải đè, không phạt rủi ro
      score -= 50;
      reasons.push('Đối thủ sắp về: Cần đè bài dù tay sau đó chỉ còn Heo 2');
    } else if (isDominantControl) {
      // Nước bài mạnh giữ cái, chấp nhận rủi ro còn Heo 2
      score -= 100;
      reasons.push('Bài đè rất mạnh giữ cái, chấp nhận rủi ro còn Heo 2');
    } else {
      // Nước đi bình thường để lại Heo trơ trọi -> Rủi ro bị kẹt thối 2 nếu mất lượt
      const isolatedTwoPenalty = personality === 'aggressive' ? 300 : personality === 'conservative' ? 400 : 350;
      score -= isolatedTwoPenalty;
      reasons.push('Rủi ro để lại Heo đơn độc nếu mất lượt');
    }
  }

  // 1.3. Khóa giải thối 2: Nếu tay bot có [Bộ thường (hoặc rác thường), Heo 2]
  // Đánh Heo 2 trước cướp cái để lượt sau về bằng bộ thường an toàn!
  const hasTwoInHand = botHand.some((c) => c.rank === 15);
  const isPlayingTwo = combo.type === 'SINGLE' && combo.highestRank === 15;
  if (hasTwoInHand && isPlayingTwo && remainingNonTwos > 0 && remainingTwos === 0) {
    const isWinningSequence = calculateStepsToOut(partitionAfter) <= 1;
    if (isWinningSequence) {
      score += 4000;
      reasons.push('Đánh Heo trước cướp cái để về bằng bộ thường an toàn, triệt tiêu thối 2');
    }
  }

  // ---------------------------------------------------------------------------
  // 2. BẢO VỆ LUẬT ĐỀN LÀNG (Người kế tiếp còn 1 lá)
  // ---------------------------------------------------------------------------
  if (isNextPlayerSingle) {
    const partitionBefore = partitionHand(botHand);
    const hasAnyCombo =
      partitionBefore.straights.length > 0 ||
      partitionBefore.pairs.length > 0 ||
      partitionBefore.triples.length > 0 ||
      partitionBefore.quads.length > 0;

    if (isRoundLeader) {
      // Khi Bot LÀM CHỦ VÒNG (bàn trống):
      if (combo.type === 'SINGLE') {
        if (hasAnyCombo) {
          // Có bộ mà đi đánh rác đơn -> Phạt nặng vì đối thủ 1 lá có thể đè về!
          score -= 600;
          reasons.push('Người sau còn 1 lá -> Bàn trống phải ưu tiên đánh bộ, không đánh rác');
        }

        // BẮT BUỘC phải là lá to nhất trong toàn bộ bài của Bot
        const sortedHand = sortCards(botHand);
        const biggestCardInHand = sortedHand[sortedHand.length - 1];
        if (combo.highestRank < biggestCardInHand.rank) {
          return {
            candidate,
            score: -10000,
            reason: `VI PHẠM: Người sau còn 1 lá, phải đánh lá to nhất (${biggestCardInHand.rank}) để tránh đền làng!`,
          };
        }

        if (!hasAnyCombo) {
          score += 350;
          reasons.push('Đánh lá to nhất chặn đầu người kế tiếp báo 1 lá');
        }
      } else {
        // Đánh BỘ -> Người 1 lá KHÔNG THỂ đỡ được!
        score += 600;
        // Ưu tiên bộ nhỏ hơn trước để giữ lại bộ to
        score += (15 - combo.highestRank) * 10;
        reasons.push('Người sau còn 1 lá -> Đánh bộ để họ không thể đỡ');
      }
    } else {
      // Khi BÀN ĐANG CÓ BÀI (đang đè bài đối thủ):
      if (tableState.lastPlay && tableState.lastPlay.combo.type === 'SINGLE') {
        // Bàn đang là Single: Bot bắt buộc phải đánh Single đè. KHÔNG PHẠT -600!
        // Và phải dùng lá Single to nhất có thể đè để chặn đầu người 1 lá
        const playableSingles = botHand
          .filter((c) => c.rank > tableState.lastPlay!.combo.highestRank)
          .sort((a, b) => a.rank - b.rank);

        if (playableSingles.length > 0) {
          const biggestPlayable = playableSingles[playableSingles.length - 1];
          if (combo.highestRank < biggestPlayable.rank) {
            // Có lá to hơn đè được mà lại đánh lá nhỏ hơn -> Nguy cơ đền làng!
            return {
              candidate,
              score: -10000,
              reason: `VI PHẠM: Người sau còn 1 lá, phải đánh lá to nhất (${biggestPlayable.rank}) để chặn!`,
            };
          }
          score += 350;
          reasons.push('Đánh lá to nhất chặn đầu người kế tiếp báo 1 lá');
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 3. CHI PHÍ PHÁ BỘ (Partial Combo Breakage)
  // ---------------------------------------------------------------------------
  const breakage = evaluateComboBreakage(
    botHand,
    playedCards,
    tableState.lastPlay ? tableState.lastPlay.combo : null,
    isUrgent
  );
  if (breakage.penalty > 0) {
    score -= breakage.penalty;
    reasons.push(...breakage.reasons);
  }
  if (breakage.bonus > 0) {
    score += breakage.bonus;
    reasons.push(...breakage.reasons);
  }

  // ---------------------------------------------------------------------------
  // 4. XẢ BÀI VÀ GIẢM NHỊP BÀI (Pacing & Steps to Out)
  // ---------------------------------------------------------------------------
  // Điểm khuyến khích xả nhiều lá cùng lúc
  score += playedCards.length * 15;

  const stepsBefore = calculateStepsToOut(partitionHand(botHand));
  const stepsAfter = calculateStepsToOut(partitionAfter);
  const deltaSteps = stepsBefore - stepsAfter;
  score += deltaSteps * 30;

  // ---------------------------------------------------------------------------
  // 5. CHI PHÍ CƠ HỘI BÀI TO (Khắc phục "Đánh thẳng Dây to / Đôi to đi luôn")
  // ---------------------------------------------------------------------------
  const fodderCount = countFodderSingles(partitionAfter);
  const controlCost = getMoveControlCost(combo);

  if (controlCost > 0 && fodderCount >= 2) {
    // Đem bài to ra phang trong khi trong tay còn >= 2 rác nhỏ
    const controlMultiplier = personality === 'aggressive' ? 2.2 : personality === 'conservative' ? 2.8 : 2.5;
    const penalty = controlCost * fodderCount * controlMultiplier;
    score -= penalty;
    reasons.push(`Giữ lại bài to (${combo.highestRank}) bảo vệ ${fodderCount} lá rác nhỏ yếu`);
  }

  // ---------------------------------------------------------------------------
  // 6. CHIẾN THUẬT LÀM CHỦ VÒNG (Round Leader / Bàn trống)
  // ---------------------------------------------------------------------------
  if (isRoundLeader) {
    // 6.1. Nếu bài có sảnh nhỏ (highestRank <= 9) -> Xả trước để giải phóng quân
    if (combo.type === 'STRAIGHT' && combo.highestRank <= 9) {
      score += 60;
      reasons.push('Xả sảnh nhỏ trước để thăm dò và giải phóng quân yếu');
    }

    // 6.2. Nếu có đôi nhỏ (rank <= 9) -> Xả thăm dò
    if (combo.type === 'PAIR' && combo.highestRank <= 9) {
      score += 40;
      reasons.push('Xả đôi nhỏ để thăm dò');
    }

    // 6.3. Nếu là rác nhỏ (rank <= 8) và trong tay có bài to bảo kê -> Đánh rác nhỏ thăm dò
    if (combo.type === 'SINGLE' && combo.highestRank <= 8) {
      score += 35;
      reasons.push('Đánh rác nhỏ nhất để thăm dò và dụ bài to của làng');
    }

    // 6.4. Thế bài "Về liên hoàn" (Closing Sequence):
    if (fodderCount === 0 && stepsAfter <= 1) {
      score += 300;
      reasons.push('Kích hoạt chuỗi đánh dứt điểm ván đấu');
    }
  }

  // ---------------------------------------------------------------------------
  // 7. CHIẾN THUẬT ĐÈ BÀI (Beating Move - Bàn đang có bài)
  // ---------------------------------------------------------------------------
  if (!isRoundLeader && tableState.lastPlay) {
    const tableCombo = tableState.lastPlay.combo;

    // 7.1. Đè Heo 2 (Single rank 15)
    if (combo.type === 'SINGLE' && combo.highestRank === 15) {
      const twosInHand = botHand.filter((c) => c.rank === 15).length;

      // Cầm >= 2 con Heo và đối thủ còn <= 6 lá: Chủ động xả bớt 1 Heo tránh thối chùm
      if (twosInHand >= 2 && minOpponentCards <= 6) {
        score += 250;
        reasons.push('Cầm nhiều Heo (>= 2 con): Xả bớt 1 con tránh nguy cơ thối chùm cuối ván');
      }

      // A. Bàn đánh bài to (A rank 14 hoặc K rank 13) -> Cướp cái xứng đáng
      if (tableCombo.highestRank >= 13) {
        const stealBonus = personality === 'aggressive' ? 95 : personality === 'conservative' ? 65 : 80;
        score += stealBonus;
        reasons.push(`Dùng Heo 2 cướp cái khi đối thủ ra lá to (${tableCombo.highestRank})`);
      }

      // B. Bàn chỉ đánh rác nhỏ (<= 9) -> Phạt vì phí Heo (trừ khi đối thủ sắp về hoặc cầm nhiều heo)
      if (tableCombo.highestRank <= 9 && minOpponentCards > 4 && twosInHand < 2) {
        const wastePenalty = personality === 'aggressive' ? 130 : personality === 'conservative' ? 175 : 150;
        score -= wastePenalty;
        reasons.push('Tránh lãng phí Heo 2 vào lá rác nhỏ của đối thủ');
      }

      // C. Nguy cơ Tứ quý: Nếu ở đầu ván và ngoài làng còn nhiều rank nghi Tứ quý
      const suspectedQuads = tracker.getSuspectedQuads(botHand);
      if (suspectedQuads.length >= 5 && minOpponentCards >= 7) {
        score -= 80;
        reasons.push('Nguy cơ đối thủ cầm Tứ quý ở đầu ván quá cao');
      }

      // D. Nguy cơ thối Heo khi đối thủ còn ít bài (<= 4 lá)
      if (minOpponentCards <= 4) {
        score += 150;
        reasons.push('Xả Heo khẩn cấp: Đối thủ còn ít bài (<= 4 lá) để tránh nguy cơ thối 2');
      }

      // E. Cướp cái xong là về được luôn
      if (stepsAfter <= 1 && fodderCount === 0) {
        score += 300;
        reasons.push('Dùng Heo cướp cái để dứt điểm ván đấu');
      }
    }

    // 7.2. Đỡ bài bằng lá/bộ nhỏ nhất vừa đủ đè để tiết kiệm lá to
    if (combo.type === tableCombo.type) {
      const overKill = combo.highestRank - tableCombo.highestRank;
      score += Math.max(0, 20 - overKill * 2);
    }

    // 7.3. Trích Đôi từ Sáp khi đè đôi đã được xử lý trong evaluateComboBreakage
  }

  // ---------------------------------------------------------------------------
  // 8. CẤP CỨU THOÁT CÓNG (Burn Avoidance)
  // ---------------------------------------------------------------------------
  if (botHand.length === 10 && minOpponentCards <= 4) {
    score += 350;
    reasons.push('Cấp cứu thoát Cóng: Đè bài ngay để tránh bị phạt cháy 14 lá');
  }

  // Đảm bảo non-terminal score không bao giờ vượt qua ngưỡng 5000
  score = Math.min(score, 5000);

  return {
    candidate,
    score,
    reason: reasons.length > 0 ? reasons.join(' | ') : candidate.description,
  };
}
