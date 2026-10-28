import { Card, CardCombo } from './types';
import { analyzeCombo, canBeat } from './analyzer';
import { sortCards } from './deck';

/**
 * Thuật toán Gợi ý bài thông minh (Smart Hint)
 * Trả về danh sách các lá bài khác trong tay người chơi cần được làm sáng (highlight)
 * để cùng với `selectedCard` tạo thành bộ bài tối ưu nhất.
 */
export function getSmartHint(
  selectedCard: Card,
  myHand: Card[],
  tableCombo: CardCombo | null
): Card[] {
  const otherCards = myHand.filter((c) => c.id !== selectedCard.id);
  if (otherCards.length === 0) {
    return [];
  }

  // TRƯỜNG HỢP 1: CẦN CHẶN BÀI TRÊN BÀN (tableCombo !== null)
  if (tableCombo && tableCombo.type !== 'INVALID') {
    return findBestBeatingHint(selectedCard, myHand, tableCombo);
  }

  // TRƯỜNG HỢP 2: LƯỢT ĐI MỚI / BÀN TRỐNG (tableCombo === null)
  return findBestLeadingHint(selectedCard, myHand);
}

/**
 * Kiểm tra xem trong tay người chơi có bất kỳ nước đi nào hợp lệ không
 */
export function hasAnyPlayableMove(myHand: Card[], tableCombo: CardCombo | null): boolean {
  if (myHand.length === 0) return false;
  // Nếu bàn trống -> luôn có thể đánh ít nhất 1 lá rác
  if (!tableCombo || tableCombo.type === 'INVALID') return true;

  const lowest = findLowestPlayableCombo(myHand, tableCombo);
  return lowest.length > 0;
}

/**
 * Tự động tìm bộ bài nhỏ nhất có thể đánh (để gợi ý mờ khi tới lượt hoặc auto-play khi hết giờ)
 */
export function findLowestPlayableCombo(myHand: Card[], tableCombo: CardCombo | null): Card[] {
  if (myHand.length === 0) return [];
  const sorted = sortCards(myHand);

  // 1. Nếu bàn trống -> đánh lá bài nhỏ nhất
  if (!tableCombo || tableCombo.type === 'INVALID') {
    return [sorted[0]];
  }

  // 2. Nếu bàn là 1 lá (SINGLE)
  if (tableCombo.type === 'SINGLE') {
    if (tableCombo.highestRank === 15) {
      // 2 bị chặt bởi Tứ quý -> tìm tứ quý nhỏ nhất trong tay
      const quads = findAllQuads(sorted);
      return quads.length > 0 ? quads[0] : [];
    }
    // Rác bình thường -> tìm lá rác nhỏ nhất lớn hơn tableCombo
    const beatingCard = sorted.find((c) => c.rank > tableCombo.highestRank);
    return beatingCard ? [beatingCard] : [];
  }

  // 3. Nếu bàn là Đôi (PAIR)
  if (tableCombo.type === 'PAIR') {
    if (tableCombo.highestRank === 15) return []; // Đôi 2 không thể bị chặt
    const pairs = findAllPairs(sorted);
    const beatingPair = pairs.find((p) => p[0].rank > tableCombo.highestRank);
    return beatingPair || [];
  }

  // 4. Nếu bàn là Sáp (TRIPLE)
  if (tableCombo.type === 'TRIPLE') {
    const triples = findAllTriples(sorted);
    const beatingTriple = triples.find((t) => t[0].rank > tableCombo.highestRank);
    return beatingTriple || [];
  }

  // 5. Nếu bàn là Tứ quý (QUAD)
  if (tableCombo.type === 'QUAD') {
    const quads = findAllQuads(sorted);
    const beatingQuad = quads.find((q) => q[0].rank > tableCombo.highestRank);
    return beatingQuad || [];
  }

  // 6. Nếu bàn là Sảnh (STRAIGHT)
  if (tableCombo.type === 'STRAIGHT') {
    const straights = findAllStraightsExactLength(sorted, tableCombo.length);
    const beatingStraight = straights.find((s) => {
      const combo = analyzeCombo(s);
      return canBeat(combo, tableCombo);
    });
    return beatingStraight || [];
  }

  return [];
}

/**
 * Tìm tất cả các đôi trong tay, sắp xếp từ nhỏ đến lớn
 */
function findAllPairs(sortedHand: Card[]): Card[][] {
  const pairs: Card[][] = [];
  const rankMap = new Map<number, Card[]>();
  sortedHand.forEach((c) => {
    const list = rankMap.get(c.rank) || [];
    list.push(c);
    rankMap.set(c.rank, list);
  });

  for (const cards of rankMap.values()) {
    if (cards.length >= 2) {
      pairs.push(cards.slice(0, 2));
    }
  }
  return pairs.sort((a, b) => a[0].rank - b[0].rank);
}

/**
 * Tìm tất cả các sáp trong tay
 */
function findAllTriples(sortedHand: Card[]): Card[][] {
  const triples: Card[][] = [];
  const rankMap = new Map<number, Card[]>();
  sortedHand.forEach((c) => {
    const list = rankMap.get(c.rank) || [];
    list.push(c);
    rankMap.set(c.rank, list);
  });

  for (const cards of rankMap.values()) {
    if (cards.length >= 3) {
      triples.push(cards.slice(0, 3));
    }
  }
  return triples.sort((a, b) => a[0].rank - b[0].rank);
}

/**
 * Tìm tất cả tứ quý trong tay
 */
function findAllQuads(sortedHand: Card[]): Card[][] {
  const quads: Card[][] = [];
  const rankMap = new Map<number, Card[]>();
  sortedHand.forEach((c) => {
    const list = rankMap.get(c.rank) || [];
    list.push(c);
    rankMap.set(c.rank, list);
  });

  for (const cards of rankMap.values()) {
    if (cards.length === 4) {
      quads.push(cards);
    }
  }
  return quads.sort((a, b) => a[0].rank - b[0].rank);
}

/**
 * Tìm tất cả các sảnh có đúng targetLen lá trong tay
 */
function findAllStraightsExactLength(sortedHand: Card[], targetLen: number): Card[][] {
  const validCards = sortedHand.filter((c) => c.rank !== 15);
  const rankMap = new Map<number, Card>();
  validCards.forEach((c) => {
    if (!rankMap.has(c.rank)) rankMap.set(c.rank, c);
  });

  const straights: Card[][] = [];
  // Duyệt từ rank 3..14
  for (let start = 3; start <= 15 - targetLen; start++) {
    const end = start + targetLen - 1;
    let hasAll = true;
    const chain: Card[] = [];
    for (let r = start; r <= end; r++) {
      const card = rankMap.get(r);
      if (!card) {
        hasAll = false;
        break;
      }
      chain.push(card);
    }
    if (hasAll) {
      straights.push(chain);
    }
  }

  return straights;
}

/**
 * Tìm gợi ý tốt nhất khi cần chặn bài trên bàn
 */
function findBestBeatingHint(
  selectedCard: Card,
  myHand: Card[],
  tableCombo: CardCombo
): Card[] {
  // 1. Nếu bàn là 1 lá 2 (rank 15) -> Tứ quý chặt được 2
  if (tableCombo.type === 'SINGLE' && tableCombo.highestRank === 15) {
    const sameRankCards = myHand.filter((c) => c.rank === selectedCard.rank && c.id !== selectedCard.id);
    if (sameRankCards.length === 3) {
      return sameRankCards;
    }
    return [];
  }

  // 2. Nếu bàn là Rác (< 15)
  if (tableCombo.type === 'SINGLE') {
    return [];
  }

  // 3. Nếu bàn là Đôi
  if (tableCombo.type === 'PAIR') {
    if (selectedCard.rank > tableCombo.highestRank) {
      const mate = myHand.find((c) => c.rank === selectedCard.rank && c.id !== selectedCard.id);
      if (mate) {
        return [mate];
      }
    }
    return [];
  }

  // 4. Nếu bàn là Sáp (Triple)
  if (tableCombo.type === 'TRIPLE') {
    if (selectedCard.rank > tableCombo.highestRank) {
      const mates = myHand.filter((c) => c.rank === selectedCard.rank && c.id !== selectedCard.id);
      if (mates.length >= 2) {
        return mates.slice(0, 2);
      }
    }
    return [];
  }

  // 5. Nếu bàn là Tứ quý
  if (tableCombo.type === 'QUAD') {
    if (selectedCard.rank > tableCombo.highestRank) {
      const mates = myHand.filter((c) => c.rank === selectedCard.rank && c.id !== selectedCard.id);
      if (mates.length === 3) {
        return mates;
      }
    }
    return [];
  }

  // 6. Nếu bàn là Sảnh (Straight)
  if (tableCombo.type === 'STRAIGHT') {
    const targetLen = tableCombo.length;
    const straights = findAllStraightsOfLength(selectedCard, myHand, targetLen);
    
    const beatingStraights = straights.filter((s) => {
      const combo = analyzeCombo(s);
      return canBeat(combo, tableCombo);
    });

    if (beatingStraights.length > 0) {
      beatingStraights.sort((a, b) => {
        const comboA = analyzeCombo(a);
        const comboB = analyzeCombo(b);
        return comboA.highestRank - comboB.highestRank;
      });
      return beatingStraights[0].filter((c) => c.id !== selectedCard.id);
    }

    return [];
  }

  return [];
}

/**
 * Tìm gợi ý tốt nhất khi đi đầu vòng (bàn trống)
 */
function findBestLeadingHint(selectedCard: Card, myHand: Card[]): Card[] {
  const allStraights = findAllStraightsContaining(selectedCard, myHand);
  const longestStraight = allStraights.length > 0 ? allStraights[0] : null;

  const sameRank = myHand.filter((c) => c.rank === selectedCard.rank && c.id !== selectedCard.id);

  if (longestStraight && longestStraight.length >= 4) {
    return longestStraight.filter((c) => c.id !== selectedCard.id);
  }

  if (sameRank.length === 3) {
    return sameRank;
  }

  if (sameRank.length === 2) {
    return sameRank;
  }

  if (longestStraight && longestStraight.length === 3) {
    return longestStraight.filter((c) => c.id !== selectedCard.id);
  }

  if (sameRank.length === 1) {
    return sameRank;
  }

  return [];
}

/**
 * Tìm tất cả các sảnh chứa selectedCard
 */
function findAllStraightsContaining(selectedCard: Card, myHand: Card[]): Card[][] {
  const straights: Card[][] = [];
  const rankMap = new Map<number, Card>();
  rankMap.set(selectedCard.rank, selectedCard);

  for (const c of myHand) {
    if (c.rank !== 15 && !rankMap.has(c.rank)) {
      rankMap.set(c.rank, c);
    }
  }

  if (selectedCard.rank === 15) {
    const cardA = myHand.find((c) => c.rank === 14);
    const card3 = myHand.find((c) => c.rank === 3);
    if (cardA && card3) {
      straights.push([card3, cardA, selectedCard]);
    }
    return straights;
  }

  if (selectedCard.rank === 3 || selectedCard.rank === 14) {
    const card2 = myHand.find((c) => c.rank === 15);
    const cardA = myHand.find((c) => c.rank === 14);
    const card3 = myHand.find((c) => c.rank === 3);
    if (card2 && cardA && card3) {
      straights.push([card3, cardA, card2]);
    }
  }

  const cardRank = selectedCard.rank;
  for (let start = 3; start <= cardRank; start++) {
    for (let end = cardRank; end <= 14; end++) {
      const len = end - start + 1;
      if (len >= 3) {
        let hasAll = true;
        const currentChain: Card[] = [];
        for (let r = start; r <= end; r++) {
          const cardAtR = rankMap.get(r);
          if (!cardAtR) {
            hasAll = false;
            break;
          }
          currentChain.push(cardAtR);
        }
        if (hasAll) {
          straights.push(currentChain);
        }
      }
    }
  }

  straights.sort((a, b) => {
    if (b.length !== a.length) {
      return b.length - a.length;
    }
    const comboA = analyzeCombo(a);
    const comboB = analyzeCombo(b);
    return comboA.highestRank - comboB.highestRank;
  });

  return straights;
}

function findAllStraightsOfLength(
  selectedCard: Card,
  myHand: Card[],
  targetLen: number
): Card[][] {
  const all = findAllStraightsContaining(selectedCard, myHand);
  return all.filter((s) => s.length === targetLen);
}
