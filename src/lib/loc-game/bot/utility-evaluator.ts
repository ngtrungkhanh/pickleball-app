import { Card, CardCombo } from '../types';
import { TableState } from '../network-types';
import { analyzeCombo } from '../analyzer';
import { sortCards } from '../deck';
import { CardTracker } from './card-tracker';
import { CandidateMove, HandPartition } from './types';
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
 * Hàm Đánh Giá Tiện Ích (Utility Function) chấm điểm một nước đi ứng viên
 */
export function evaluateCandidateMove(
  candidate: CandidateMove,
  botHand: Card[],
  tableState: TableState,
  tracker: CardTracker,
  botId: string
): EvaluatedMove {
  const isRoundLeader = !tableState.lastPlay;
  const isNextPlayerSingle = tracker.isNextPlayerSingle(botId, tableState.players);
  const minOpponentCards = tracker.getMinOpponentCards(botId, tableState.players);

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
  // 1. LUẬT VỀ ĐÍCH & PHÒNG CHỐNG THỐI HEO 2
  // ---------------------------------------------------------------------------
  if (handAfter.length === 0) {
    // Nếu hết bài: Kiểm tra lá đánh cuối có phải là Heo 2 không
    const isEndingWithTwo = combo.type === 'SINGLE' && combo.highestRank === 15;
    const isEndingWithPairTwo = combo.type === 'PAIR' && combo.highestRank === 15;

    if (isEndingWithTwo || isEndingWithPairTwo) {
      // Luật Lốc: Về bằng con 2 cuối cùng bị PHẠT THỐI 2!
      return {
        candidate,
        score: -15000,
        reason: 'TUYỆT ĐỐI TRÁNH: Về bằng Heo 2 cuối cùng sẽ bị phạt thối 2!',
      };
    }

    // Về nhất hợp lệ bằng bộ hoặc rác thường
    return {
      candidate,
      score: 10000,
      reason: 'Đánh hết bài để về nhất ván đấu!',
    };
  }

  // 1.2. Tránh để lại Heo đơn độc cuối ván (nguy cơ thối 2 bắt buộc ở lượt kế)
  const remainingTwos = handAfter.filter((c) => c.rank === 15).length;
  const remainingNonTwos = handAfter.filter((c) => c.rank !== 15).length;

  if (remainingTwos > 0 && remainingNonTwos === 0) {
    // Sau nước đi này, trên tay CHỈ CÒN TOÀN HEO 2 -> Nước sau chắc chắn về bằng Heo và bị thối 2!
    score -= 12000;
    reasons.push('Tránh để lại Heo đơn độc dẫn tới thối 2 cuối ván');
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

    if (combo.type === 'SINGLE') {
      // Nếu bot đang có BỘ (đôi, sảnh...) mà lại đi đánh rác lẻ -> Phạt nặng vì đối thủ 1 lá có thể đè về!
      if (hasAnyCombo) {
        score -= 600;
        reasons.push('Người sau còn 1 lá -> Phải ưu tiên đánh bộ, không đánh rác');
      }

      // BẮT BUỘC phải là lá to nhất trong toàn bộ bài của Bot
      const sortedHand = sortCards(botHand);
      const biggestCardInHand = sortedHand[sortedHand.length - 1];

      if (combo.highestRank < biggestCardInHand.rank) {
        // Vi phạm nghiêm trọng luật chặn người báo 1 lá -> ĐỀN LÀNG!
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
      // Đánh BỘ (Sảnh, Đôi, Sáp, Tứ quý) -> Người 1 lá KHÔNG THỂ đỡ được!
      score += 600;
      // Ưu tiên bộ nhỏ hơn trước để giữ lại bộ to
      score += (15 - combo.highestRank) * 10;
      reasons.push('Người sau còn 1 lá -> Đánh bộ để họ không thể đỡ');
    }
  }

  // ---------------------------------------------------------------------------
  // 3. XẢ BÀI VÀ GIẢM NHỊP BÀI (Pacing & Steps to Out)
  // ---------------------------------------------------------------------------
  // Điểm khuyến khích xả nhiều lá cùng lúc
  score += playedCards.length * 15;

  const stepsBefore = calculateStepsToOut(partitionHand(botHand));
  const stepsAfter = calculateStepsToOut(partitionAfter);
  const deltaSteps = stepsBefore - stepsAfter;
  score += deltaSteps * 30;

  // ---------------------------------------------------------------------------
  // 4. CHI PHÍ CƠ HỘI BÀI TO (Khắc phục "Đánh thẳng Dây to / Đôi to đi luôn")
  // ---------------------------------------------------------------------------
  const fodderCount = countFodderSingles(partitionAfter);
  const controlCost = getMoveControlCost(combo);

  if (controlCost > 0 && fodderCount >= 2) {
    // Đem bài to (Sảnh to K/A, Đôi to K/A, Heo) ra phang trong khi trong tay còn >= 2 rác nhỏ
    // Phạt nặng tỷ lệ thuận với số rác nhỏ bị bỏ rơi!
    const penalty = controlCost * fodderCount * 2.5;
    score -= penalty;
    reasons.push(`Giữ lại bài to (${combo.highestRank}) bảo vệ ${fodderCount} lá rác nhỏ yếu`);
  }

  // ---------------------------------------------------------------------------
  // 5. CHIẾN THUẬT LÀM CHỦ VÒNG (Round Leader / Bàn trống)
  // ---------------------------------------------------------------------------
  if (isRoundLeader) {
    // 5.1. Nếu bài có sảnh nhỏ (highestRank <= 9) -> Rất nên xả trước để giải phóng quân
    if (combo.type === 'STRAIGHT' && combo.highestRank <= 9) {
      score += 60;
      reasons.push('Xả sảnh nhỏ trước để thăm dò và giải phóng quân yếu');
    }

    // 5.2. Nếu có đôi nhỏ (rank <= 9) -> Rất tốt để xả thăm dò
    if (combo.type === 'PAIR' && combo.highestRank <= 9) {
      score += 40;
      reasons.push('Xả đôi nhỏ để thăm dò');
    }

    // 5.3. Nếu là rác nhỏ (rank <= 8) và trong tay có bài to bảo kê -> Đánh rác nhỏ thăm dò
    if (combo.type === 'SINGLE' && combo.highestRank <= 8) {
      score += 35;
      reasons.push('Đánh rác nhỏ nhất để thăm dò và dụ bài to của làng');
    }

    // 5.4. Thế bài "Về liên hoàn" (Closing Sequence):
    // Không còn rác yếu nào (fodderCount == 0) và số nhịp còn lại <= 2 -> Thưởng dứt điểm
    if (fodderCount === 0 && stepsAfter <= 1) {
      score += 300;
      reasons.push('Kích hoạt chuỗi đánh dứt điểm ván đấu');
    }
  }

  // ---------------------------------------------------------------------------
  // 6. CHIẾN THUẬT ĐÈ BÀI (Beating Move - Bàn đang có bài)
  // ---------------------------------------------------------------------------
  if (!isRoundLeader && tableState.lastPlay) {
    const tableCombo = tableState.lastPlay.combo;

    // 6.1. Đè Heo 2 (Single rank 15)
    if (combo.type === 'SINGLE' && combo.highestRank === 15) {
      const twosInHand = botHand.filter((c) => c.rank === 15).length;

      // Cầm >= 2 con Heo và đối thủ còn <= 6 lá: Chủ động xả bớt 1 Heo tránh thối chùm
      if (twosInHand >= 2 && minOpponentCards <= 6) {
        score += 250;
        reasons.push('Cầm nhiều Heo (>= 2 con): Xả bớt 1 con tránh nguy cơ thối chùm cuối ván');
      }

      // A. Bàn đánh bài to (A rank 14 hoặc K rank 13) -> Cướp cái xứng đáng
      if (tableCombo.highestRank >= 13) {
        score += 80;
        reasons.push(`Dùng Heo 2 cướp cái khi đối thủ ra lá to (${tableCombo.highestRank})`);
      }

      // B. Bàn chỉ đánh rác nhỏ (<= 9) -> Phạt nặng vì phí Heo (trừ khi đối thủ sắp về hoặc cầm nhiều heo)
      if (tableCombo.highestRank <= 9 && minOpponentCards > 4 && twosInHand < 2) {
        score -= 150;
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

    // 6.2. Đỡ bài bằng lá/bộ nhỏ nhất vừa đủ đè để tiết kiệm lá to
    if (combo.type === tableCombo.type) {
      const overKill = combo.highestRank - tableCombo.highestRank;
      // Càng vừa vặn đè (overKill nhỏ) thì càng tiết kiệm quân to
      score += Math.max(0, 20 - overKill * 2);
    }

    // 6.3. Trích Đôi từ Sáp để đè đôi
    if (tableCombo.type === 'PAIR' && candidate.description.includes('trích từ sáp')) {
      score += 45;
      reasons.push('Trích đôi từ sáp để đè bài đối thủ');
    }

    // 6.4. Xé đôi nhỏ đè rác thoát cóng
    if (tableCombo.type === 'SINGLE' && candidate.description.includes('Xé 1 lá')) {
      if (botHand.length === 10 && minOpponentCards <= 5) {
        score += 250;
        reasons.push('Chủ động xé đôi nhỏ đè rác thoát cóng');
      } else {
        score -= 40; // Bình thường không nên xé đôi bừa bãi
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 7. CẤP CỨU THOÁT CÓNG (Burn Avoidance)
  // ---------------------------------------------------------------------------
  if (botHand.length === 10 && minOpponentCards <= 4) {
    score += 350;
    reasons.push('Cấp cứu thoát Cóng: Đè bài ngay để tránh bị phạt cháy 14 lá');
  }

  return {
    candidate,
    score,
    reason: reasons.length > 0 ? reasons.join(' | ') : candidate.description,
  };
}
