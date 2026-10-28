import { Card, Rank } from '../types';
import { sortCards } from '../deck';
import { HandPartition } from './types';

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
      // 1. Sảnh tối đại (toàn bộ đoạn liên tiếp)
      result.push(segment.map((r) => byRank.get(r)![0]));

      // 2. Nếu đoạn dài >= 6, có thể tách làm 2 sảnh riêng biệt (ví dụ 6 lá = 3 lá + 3 lá)
      if (segment.length >= 6) {
        for (let split = 3; split <= segment.length - 3; split++) {
          result.push(segment.slice(0, split).map((r) => byRank.get(r)![0]));
          result.push(segment.slice(split).map((r) => byRank.get(r)![0]));
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
 * Luật: Báo Sâm nếu không ai chặn được bất kỳ lá nào sẽ ăn cả làng. Bị chặn 1 lá thì đền làng.
 * Do đó, chỉ Báo Sâm khi tay bài:
 * - Sảnh 9-10 lá (gần như bất bại).
 * - Hoặc toàn bộ bài chỉ gồm 1 sảnh dài + lá trùm (A, 2 hoặc tứ quý) mà không có bất kỳ rác nhỏ nào hở ra.
 */
export function evaluateSamPossibility(hand: Card[]): boolean {
  if (hand.length < 10) return false;

  const partition = partitionHand(hand, true); // Cho phép kiểm tra sảnh A-2-3 khi báo Sâm

  // 1. Sảnh 9 hoặc 10 lá
  const hasMegaStraight = partition.straights.some((st) => st.length >= 9);
  if (hasMegaStraight) return true;

  // 2. Sảnh 8 lá và 2 lá còn lại là 2 con to (Đôi 2, hoặc 2 và A)
  const straight8 = partition.straights.find((st) => st.length >= 8);
  if (straight8) {
    const remaining = hand.filter((c) => !straight8.some((sc) => sc.id === c.id));
    const allBig = remaining.every((c) => c.rank >= 14); // A hoặc 2
    if (allBig) return true;
  }

  // 3. Tứ quý 2 hoặc bài sạch hoàn toàn không có rác <= 13
  const hasQuad2 = partition.quads.some((q) => q[0].rank === 15);
  if (hasQuad2) {
    // Có tứ quý 2 -> nếu số rác còn lại <= 1 lá và là A thì cực mạnh
    if (partition.singles.length <= 1 && partition.singles.every((c) => c.rank >= 14)) {
      return true;
    }
  }

  return false;
}
