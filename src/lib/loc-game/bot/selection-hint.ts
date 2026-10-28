import { Card, CardCombo, Rank } from '../types';
import { analyzeCombo, canBeat } from '../analyzer';
import { partitionHand } from './hand-evaluator';

/**
 * Tìm tất cả các sảnh khả dĩ từ hand có độ dài xác định targetLen
 */
function findAllStraightsOfLength(hand: Card[], targetLen: number): Card[][] {
  if (targetLen < 3 || hand.length < targetLen) return [];

  const byRank = new Map<Rank, Card[]>();
  for (const c of hand) {
    if (!byRank.has(c.rank)) byRank.set(c.rank, []);
    byRank.get(c.rank)!.push(c);
  }

  const results: Card[][] = [];
  const uniqueRanks: Rank[] = Array.from(byRank.keys()).sort((a, b) => a - b).filter((r) => r !== 15);

  // Sảnh chuẩn liên tiếp
  for (let i = 0; i <= uniqueRanks.length - targetLen; i++) {
    let isConsecutive = true;
    for (let j = 0; j < targetLen - 1; j++) {
      if (uniqueRanks[i + j + 1] !== uniqueRanks[i + j] + 1) {
        isConsecutive = false;
        break;
      }
    }

    if (isConsecutive) {
      // Lấy 1 lá cho mỗi rank trong chuỗi liên tiếp
      const segmentRanks = uniqueRanks.slice(i, i + targetLen);
      results.push(segmentRanks.map((r: Rank) => byRank.get(r)![0]));
    }
  }

  // Sảnh đặc biệt A-2-3 (3 lá)
  if (targetLen === 3 && byRank.has(3) && byRank.has(14) && byRank.has(15)) {
    results.push([
      byRank.get(3)![0],
      byRank.get(14)![0],
      byRank.get(15)![0],
    ]);
  }

  return results;
}

/**
 * Thuật toán Gợi ý theo tổ hợp lá bài người chơi đã chọn (Contextual Selection Hint)
 * - Khi người chơi chọn 1 hay nhiều lá, bot dựa vào đó để gợi ý các lá bài còn thiếu để tạo thành bộ tối ưu.
 * - Nếu không thể gợi ý (chọn sai lá, cọc cạch hoặc không thể đè bàn) -> trả về [] (không sáng lá nào).
 */
export function getBotHintForSelection(
  selectedCards: Card[],
  myHand: Card[],
  tableCombo: CardCombo | null
): Card[] {
  if (!selectedCards || selectedCards.length === 0 || !myHand || myHand.length === 0) {
    return [];
  }

  const selectedIds = new Set(selectedCards.map((c) => c.id));
  const availableCards = myHand.filter((c) => !selectedIds.has(c.id));

  // =========================================================================
  // TRƯỜNG HỢP 1: TRÊN BÀN CÓ BÀI CẦN ĐÈ (tableCombo !== null)
  // =========================================================================
  if (tableCombo && tableCombo.type !== 'INVALID') {
    // 1.1. Bàn là 1 lá (SINGLE)
    if (tableCombo.type === 'SINGLE') {
      // Nếu bàn là con 2 (rank 15) -> Có thể chặt bằng Tứ quý
      if (tableCombo.highestRank === 15) {
        // Kiểm tra xem các lá đã chọn có cùng rank và có thể thành Tứ quý không
        const firstRank = selectedCards[0].rank;
        const allSameRank = selectedCards.every((c) => c.rank === firstRank);
        if (allSameRank && firstRank !== 15) {
          const sameRankInHand = myHand.filter((c) => c.rank === firstRank);
          if (sameRankInHand.length === 4) {
            // Đủ tứ quý -> Gợi ý các lá còn thiếu
            const missing = sameRankInHand.filter((c) => !selectedIds.has(c.id));
            return missing;
          }
        }
        return [];
      }

      // Nếu bàn là rác thường (< 15)
      // Chỉ 1 lá đè 1 lá: nếu đã chọn 1 lá lớn hơn thì đã đủ đè, nếu chọn sai lá thì không gợi ý
      return [];
    }

    // 1.2. Bàn là Đôi (PAIR)
    if (tableCombo.type === 'PAIR') {
      if (tableCombo.highestRank === 15) return []; // Đôi 2 không thể chặn

      // Nếu đã chọn 1 lá
      if (selectedCards.length === 1) {
        const rank = selectedCards[0].rank;
        if (rank > tableCombo.highestRank) {
          // Tìm lá cùng rank trong số còn lại
          const mate = availableCards.find((c) => c.rank === rank);
          if (mate) return [mate];
        }
        return [];
      }

      // Nếu đã chọn >= 2 lá: không cần gợi ý thêm
      return [];
    }

    // 1.3. Bàn là Sáp (TRIPLE)
    if (tableCombo.type === 'TRIPLE') {
      const firstRank = selectedCards[0].rank;
      const allSame = selectedCards.every((c) => c.rank === firstRank);
      if (allSame && firstRank > tableCombo.highestRank && selectedCards.length < 3) {
        const mates = availableCards.filter((c) => c.rank === firstRank);
        const needed = 3 - selectedCards.length;
        if (mates.length >= needed) {
          return mates.slice(0, needed);
        }
      }
      return [];
    }

    // 1.4. Bàn là Tứ quý (QUAD)
    if (tableCombo.type === 'QUAD') {
      const firstRank = selectedCards[0].rank;
      const allSame = selectedCards.every((c) => c.rank === firstRank);
      if (allSame && firstRank > tableCombo.highestRank && selectedCards.length < 4) {
        const mates = availableCards.filter((c) => c.rank === firstRank);
        const needed = 4 - selectedCards.length;
        if (mates.length >= needed) {
          return mates.slice(0, needed);
        }
      }
      return [];
    }

    // 1.5. Bàn là Sảnh (STRAIGHT)
    if (tableCombo.type === 'STRAIGHT') {
      const targetLen = tableCombo.length;
      if (selectedCards.length >= targetLen) return [];

      // Kiểm tra selectedCards không có lá trùng rank
      const ranksInSelected = new Set(selectedCards.map((c) => c.rank));
      if (ranksInSelected.size !== selectedCards.length) return [];

      // Tìm tất cả sảnh có độ dài targetLen trong myHand
      const allStraights = findAllStraightsOfLength(myHand, targetLen);

      // Lọc các sảnh chứa toàn bộ selectedCards và đè được tableCombo
      const candidateStraights = allStraights.filter((st) => {
        const containsAll = selectedCards.every((sc) => st.some((c) => c.id === sc.id));
        if (!containsAll) return false;
        const combo = analyzeCombo(st);
        return canBeat(combo, tableCombo);
      });

      if (candidateStraights.length === 0) return [];

      // Chọn sảnh nhỏ nhất lớn hơn để tiết kiệm bài to
      candidateStraights.sort((a, b) => {
        const ca = analyzeCombo(a);
        const cb = analyzeCombo(b);
        return ca.highestRank - cb.highestRank;
      });

      const bestStraight = candidateStraights[0];
      return bestStraight.filter((c) => !selectedIds.has(c.id));
    }

    return [];
  }

  // =========================================================================
  // TRƯỜNG HỢP 2: BÀN TRỐNG (tableCombo === null - Đi đầu vòng)
  // =========================================================================
  const partition = partitionHand(myHand);

  // 2.1. Nếu người chơi chọn 1 hoặc nhiều lá cùng rank
  const firstRank = selectedCards[0].rank;
  const allSameRank = selectedCards.every((c) => c.rank === firstRank);

  if (allSameRank) {
    // Kiểm tra trong Partition:
    // Nếu thuộc Tứ quý
    const quad = partition.quads.find((q) => q[0].rank === firstRank);
    if (quad && selectedCards.length < 4) {
      return quad.filter((c) => !selectedIds.has(c.id));
    }

    // Nếu thuộc Sáp
    const triple = partition.triples.find((t) => t[0].rank === firstRank);
    if (triple && selectedCards.length < 3) {
      return triple.filter((c) => !selectedIds.has(c.id));
    }

    // Nếu thuộc Đôi
    const pair = partition.pairs.find((p) => p[0].rank === firstRank);
    if (pair && selectedCards.length < 2) {
      return pair.filter((c) => !selectedIds.has(c.id));
    }

    // Nếu chỉ có 1 lá rác lẻ hoặc người chơi đã chọn đủ bộ cùng rank
    // Thử tìm xem lá này có thể ghép vào một Sảnh dài trong Partition không
    if (selectedCards.length === 1) {
      const straightWithCard = partition.straights.find((st) =>
        st.some((c) => c.id === selectedCards[0].id)
      );
      if (straightWithCard) {
        return straightWithCard.filter((c) => !selectedIds.has(c.id));
      }
    }

    return [];
  }

  // 2.2. Nếu người chơi chọn các lá khác rank (dự định ghép sảnh)
  // Kiểm tra xem selectedCards có cùng thuộc về một sảnh trong Partition không
  const straightInPartition = partition.straights.find((st) =>
    selectedCards.every((sc) => st.some((c) => c.id === sc.id))
  );

  if (straightInPartition) {
    return straightInPartition.filter((c) => !selectedIds.has(c.id));
  }

  // 2.3. Nếu không thuộc sảnh chuẩn trong partition, tìm xem có thể tạo thành bất kỳ sảnh hợp lệ nào không
  // (Tìm sảnh dài nhất khả dĩ chứa toàn bộ selectedCards)
  const byRank = new Map<Rank, Card[]>();
  for (const c of myHand) {
    if (!byRank.has(c.rank)) byRank.set(c.rank, []);
    byRank.get(c.rank)!.push(c);
  }

  const selectedRankList = selectedCards.map((c) => c.rank).sort((a, b) => a - b);
  const minRank = selectedRankList[0];
  const maxRank = selectedRankList[selectedRankList.length - 1];

  // Kiểm tra xem đoạn từ minRank đến maxRank có liên tục trong myHand không
  let canFormStraight = true;
  for (let r = minRank; r <= maxRank; r++) {
    if (!byRank.has(r as Rank)) {
      canFormStraight = false;
      break;
    }
  }

  if (canFormStraight && minRank !== 15 && maxRank !== 15) {
    // Mở rộng sảnh dài nhất có thể
    let startR: number = minRank;
    while (startR > 3 && byRank.has((startR - 1) as Rank)) {
      startR = startR - 1;
    }

    let endR: number = maxRank;
    while (endR < 14 && byRank.has((endR + 1) as Rank)) {
      endR = endR + 1;
    }

    if (endR - startR + 1 >= 3) {
      const fullStraight: Card[] = [];
      for (let r = startR; r <= endR; r++) {
        fullStraight.push(byRank.get(r as Rank)![0]);
      }
      return fullStraight.filter((c) => !selectedIds.has(c.id));
    }
  }

  // Chọn sai lá / cọc cạch không ghép được bộ gì
  return [];
}
