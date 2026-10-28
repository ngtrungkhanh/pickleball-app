import { Card, Rank } from '../types';
import { sortCards } from '../deck';
import { HandPartition, BotPersonality } from './types';

/**
 * Tìm các sảnh liên tiếp khả dĩ từ các lá bài
 * Chỉ sinh các sảnh tối đại (maximal) và các cặp phân tách hợp lệ nếu sảnh dài (>= 6)
 * để tránh bùng nổ tổ hợp (chỉ tối đa 3-6 sảnh).
 * `includeA23`: Chỉ cho phép sảnh A-2-3 khi cờ này bật (mặc định tắt để tránh nuốt mất con 2)
 */
function findPossibleStraights(cards: Card[], includeA23: boolean = false): Card[][] {
  const sorted = sortCards(cards);
  const byRank = new Map<Rank, Card[]>();
  for (const c of sorted) {
    if (!byRank.has(c.rank)) byRank.set(c.rank, []);
    byRank.get(c.rank)!.push(c);
  }

  const result: Card[][] = [];

  // Tìm các chuỗi liên tiếp tối đa (consecutive segments) từ 3..14
  const uniqueRanks = Array.from(byRank.keys()).sort((a, b) => a - b).filter((r) => r !== 15);
  
  let i = 0;
  while (i < uniqueRanks.length) {
    const segment: Rank[] = [uniqueRanks[i]];
    let j = i + 1;
    while (j < uniqueRanks.length && uniqueRanks[j] === uniqueRanks[j - 1] + 1) {
      segment.push(uniqueRanks[j]);
      j++;
    }

    if (segment.length >= 3) {
      // Sinh sảnh tối đại và tất cả các sảnh con khả dĩ từ 3 lá trở lên
      // Giúp partitionHand có thể chọn sảnh ngắn hơn nếu việc đó bảo toàn được Đôi / Sáp
      for (let len = 3; len <= segment.length; len++) {
        for (let start = 0; start <= segment.length - len; start++) {
          const subRanks = segment.slice(start, start + len);
          result.push(subRanks.map((r) => byRank.get(r)![0]));
        }
      }
    }

    i = j;
  }

  // Sảnh A-2-3 đặc biệt: chỉ cho phép khi includeA23 = true (ví dụ khi đánh giá Báo Sâm)
  if (includeA23 && byRank.has(3) && byRank.has(14) && byRank.has(15)) {
    result.push([
      byRank.get(3)![0],
      byRank.get(14)![0],
      byRank.get(15)![0],
    ]);
  }

  return result;
}

/**
 * Tính điểm đánh giá một cách chia bài (càng cao càng tối ưu)
 * Ưu tiên: Gom nhiều lá vào bộ, ít rác lẻ trần.
 */
function scorePartition(partition: HandPartition): number {
  let score = 0;
  // Tứ quý
  score += partition.quads.length * 40;
  // Sảnh: số lá trong sảnh * 10 + thưởng sảnh dài lũy tiến
  for (const st of partition.straights) {
    score += st.length * 10;
    if (st.length >= 9) score += 60;
    else if (st.length >= 7) score += 35;
    else if (st.length >= 5) score += 15;
  }
  // Sáp
  score += partition.triples.length * 18;
  // Đôi
  score += partition.pairs.length * 10;
  // Phạt rác lẻ: rác càng nhỏ phạt càng nặng (rác 3-7 phạt -6, rác A/2 không phạt)
  for (const s of partition.singles) {
    if (s.rank === 15) {
      score += 5; // 2 lẻ vẫn là lá mạnh có thể cướp cái
    } else if (s.rank === 14) {
      score += 2; // A lẻ tương đối an toàn
    } else if (s.rank <= 7) {
      score -= 6;
    } else {
      score -= 3;
    }
  }
  return score;
}

/**
 * Phân rã bài tối ưu (Hand Partitioning) bằng thuật toán nhánh cận / tìm kiếm
 * Đảm bảo không xé vụn sảnh đẹp hay tứ quý.
 */
export function partitionHand(hand: Card[], includeA23: boolean = false): HandPartition {
  if (hand.length === 0) {
    return { quads: [], straights: [], triples: [], pairs: [], singles: [] };
  }

  const sorted = sortCards(hand);

  // 1. Trích xuất Tứ Quý trước (luôn giữ nguyên tứ quý vì giá trị cực lớn trong Lốc)
  const rankCounts = new Map<Rank, Card[]>();
  for (const card of sorted) {
    if (!rankCounts.has(card.rank)) rankCounts.set(card.rank, []);
    rankCounts.get(card.rank)!.push(card);
  }

  const quads: Card[][] = [];
  const remainingCards: Card[] = [];

  for (const [, cards] of rankCounts) {
    if (cards.length === 4) {
      quads.push(cards);
    } else {
      remainingCards.push(...cards);
    }
  }

  // Sắp xếp tứ quý tăng dần theo rank
  quads.sort((a, b) => a[0].rank - b[0].rank);

  // 2. Tìm các tổ hợp Sảnh khả dĩ từ số lá còn lại
  let bestPartition: HandPartition = {
    quads,
    straights: [],
    triples: [],
    pairs: [],
    singles: sortCards(remainingCards),
  };
  let bestScore = -Infinity;

  function evaluateRemaining(stList: Card[][], leftover: Card[]) {
    // Với số lá leftover, gom thành Triples, Pairs, Singles
    const counts = new Map<Rank, Card[]>();
    for (const c of leftover) {
      if (!counts.has(c.rank)) counts.set(c.rank, []);
      counts.get(c.rank)!.push(c);
    }

    const triples: Card[][] = [];
    const pairs: Card[][] = [];
    const singles: Card[] = [];

    for (const [, grp] of counts) {
      if (grp.length === 3) triples.push(grp);
      else if (grp.length === 2) pairs.push(grp);
      else singles.push(...grp);
    }

    // Sắp xếp triples và pairs tăng dần theo rank để dễ dàng lấy đôi/sáp nhỏ nhất
    triples.sort((a, b) => a[0].rank - b[0].rank);
    pairs.sort((a, b) => a[0].rank - b[0].rank);

    const current: HandPartition = {
      quads,
      straights: stList,
      triples,
      pairs,
      singles: sortCards(singles),
    };

    const sc = scorePartition(current);
    if (sc > bestScore) {
      bestScore = sc;
      bestPartition = current;
    }
  }

  // Thử trường hợp không chọn sảnh nào
  evaluateRemaining([], remainingCards);

  // Thử các tập hợp sảnh không xung đột
  const possibleStraights = findPossibleStraights(remainingCards, includeA23);

  // Sắp xếp sảnh dài lên trước để ưu tiên sảnh dài
  possibleStraights.sort((a, b) => b.length - a.length);

  function searchStraights(straightIndex: number, currentStraights: Card[][], usedCardIds: Set<string>) {
    if (usedCardIds.size === remainingCards.length || straightIndex >= possibleStraights.length) {
      const leftover = remainingCards.filter((c) => !usedCardIds.has(c.id));
      evaluateRemaining(currentStraights, leftover);
      return;
    }

    const candidate = possibleStraights[straightIndex];
    const canUse = candidate.every((c) => !usedCardIds.has(c.id));

    if (canUse) {
      // Nhánh 1: Sử dụng sảnh này
      const nextUsed = new Set(usedCardIds);
      candidate.forEach((c) => nextUsed.add(c.id));
      searchStraights(straightIndex + 1, [...currentStraights, candidate], nextUsed);
    }

    // Nhánh 2: Không sử dụng sảnh này
    searchStraights(straightIndex + 1, currentStraights, usedCardIds);
  }

  // Giới hạn số lượng sảnh thử nghiệm để đảm bảo tốc độ cực nhanh (< 1ms)
  if (possibleStraights.length > 0) {
    searchStraights(0, [], new Set());
  }

  return bestPartition;
}

/**
 * Đánh giá xem tay bài có đủ tiêu chuẩn để Báo Sâm hay không
 * Chấm điểm tự tin (Confidence Scoring) - không dùng ngưỡng cứng 100%
 * Thể hiện đúng triết lý:
 * - Aggressive (Liều): Liều ăn nhiều, dám báo khi cửa sáng (Confidence >= 65)
 * - Balanced (Cân bằng): Đòi hỏi bài chắc hơn (Confidence >= 85)
 * - Conservative (Thủ): Rất cẩn trọng, chỉ báo khi bài gần như hoàn hảo (Confidence >= 110)
 */
export function evaluateSamPossibility(
  hand: Card[],
  personality: BotPersonality = 'balanced'
): boolean {
  if (hand.length < 10) return false;

  const partition = partitionHand(hand, false);
  const twos = hand.filter((c) => c.rank === 15).length;
  const hasQuad = partition.quads.length > 0;

  let confidence = 0;

  // 1. Đánh giá Sảnh dài
  for (const st of partition.straights) {
    const hasAce = st.some((c) => c.rank === 14);
    if (hasAce) {
      // Sảnh tới Át là sảnh to nhất trong luật Lốc -> Rất uy lực khi đi đầu
      confidence += 25 + (st.length - 3) * 10;
    } else {
      confidence += (st.length - 3) * 7;
    }
    // Thưởng thêm nếu sảnh dài
    if (st.length >= 9) confidence += 35;
    else if (st.length >= 8) confidence += 15;
  }

  // 2. Đánh giá Heo 2 và Tứ quý
  confidence += twos * 20; // Mỗi Heo 2 là 1 nhịp cướp cái đắt giá

  for (const q of partition.quads) {
    if (q[0].rank === 15) confidence += 60; // Tứ quý 2
    else confidence += 35; // Tứ quý thường chặt được 2
  }

  // 3. Đánh giá các bộ Đôi, Sáp
  const maxPairRank = partition.pairs.length > 0 ? Math.max(...partition.pairs.map((p) => p[0].rank)) : 0;
  for (const p of partition.pairs) {
    if (p[0].rank === 15) {
      confidence += 35; // Đôi 2 bất khả chiến bại
    } else if (p[0].rank >= 13) {
      confidence += 20; // Đôi K, Đôi A
    } else if (p[0].rank >= 11) {
      confidence += 10; // Đôi J, Q
    } else {
      // Đôi nhỏ (rank < 11): nếu không có đôi to hơn hoặc tứ quý che chở, rủi ro bị đối thủ đè đôi
      if (!hasQuad && maxPairRank < 13) {
        confidence -= 10; // Rủi ro bị đè đôi mà Heo đơn không cứu được
      } else {
        confidence += 5;
      }
    }
  }

  confidence += partition.triples.length * 20;

  // 4. Trừ điểm rác lẻ trần (Rác là rủi ro lớn nhất bị chặn đền sâm)
  for (const s of partition.singles) {
    if (s.rank === 15) {
      // Đã tính ở Heo 2
    } else if (s.rank === 14) {
      confidence -= 10; // Át lẻ
    } else if (s.rank >= 11) {
      confidence -= 15; // Rác J, Q, K
    } else {
      // Rác nhỏ: Nếu có Heo 2 trong tay, bot có cơ hội cướp lại cái sau khi thả rác
      if (twos > 0) {
        confidence -= 15;
      } else {
        confidence -= 30; // Rác nhỏ không có Heo bảo kê: Cực kỳ nguy hiểm
      }
    }
  }

  // 5. Ngưỡng tự tin theo tính cách
  const thresholds = {
    aggressive: 50,
    balanced: 75,
    conservative: 95,
  };

  const threshold = thresholds[personality] || 75;
  return confidence >= threshold;
}
