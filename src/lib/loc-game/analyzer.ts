import { Card, CardCombo } from './types';
import { sortCards } from './deck';

/**
 * Phân tích và nhận diện kiểu bộ bài
 */
export function analyzeCombo(cards: Card[]): CardCombo {
  const invalidCombo: CardCombo = {
    type: 'INVALID',
    cards,
    highestRank: 0,
    length: cards.length,
  };

  if (!cards || cards.length === 0) {
    return invalidCombo;
  }

  const sorted = sortCards(cards);
  const len = sorted.length;

  // 1 lá: Rác
  if (len === 1) {
    return {
      type: 'SINGLE',
      cards: sorted,
      highestRank: sorted[0].rank,
      length: 1,
    };
  }

  // Kiểm tra cùng rank (Đôi, Sáp, Tứ quý)
  const allSameRank = sorted.every((c) => c.rank === sorted[0].rank);
  if (allSameRank) {
    if (len === 2) {
      return {
        type: 'PAIR',
        cards: sorted,
        highestRank: sorted[0].rank,
        length: 2,
      };
    }
    if (len === 3) {
      return {
        type: 'TRIPLE',
        cards: sorted,
        highestRank: sorted[0].rank,
        length: 3,
      };
    }
    if (len === 4) {
      return {
        type: 'QUAD',
        cards: sorted,
        highestRank: sorted[0].rank,
        length: 4,
      };
    }
    // Lớn hơn 4 cùng rank là không hợp lệ
    return invalidCombo;
  }

  // Kiểm tra Sảnh (Dây >= 3 lá)
  if (len >= 3) {
    const isStraightResult = checkStraight(sorted);
    if (isStraightResult.isValid) {
      return {
        type: 'STRAIGHT',
        cards: sorted,
        highestRank: isStraightResult.highestRank,
        length: len,
      };
    }
  }

  return invalidCombo;
}

/**
 * Kiểm tra xem danh sách lá bài có phải sảnh hợp lệ không
 * - Sảnh chuẩn: liên tiếp nhau, từ 3..A (không chứa 2)
 * - Sảnh đặc biệt: A-2-3 (3 lá liên tiếp nhỏ nhất, highestRank là 3)
 */
function checkStraight(sortedCards: Card[]): { isValid: boolean; highestRank: number } {
  const len = sortedCards.length;
  const ranks = sortedCards.map((c) => c.rank);

  // Kiểm tra trùng rank (sảnh không được có lá trùng rank)
  const uniqueRanks = new Set(ranks);
  if (uniqueRanks.size !== len) {
    return { isValid: false, highestRank: 0 };
  }

  // Trường hợp đặc biệt: Sảnh A-2-3 (3 lá: 3, A=14, 2=15)
  if (len === 3 && ranks[0] === 3 && ranks[1] === 14 && ranks[2] === 15) {
    return { isValid: true, highestRank: 3 };
  }

  // Các sảnh khác KHÔNG được chứa 2 (rank 15)
  if (ranks.includes(15)) {
    return { isValid: false, highestRank: 0 };
  }

  // Kiểm tra tính liên tiếp: r[i+1] === r[i] + 1
  for (let i = 0; i < len - 1; i++) {
    if (ranks[i + 1] !== ranks[i] + 1) {
      return { isValid: false, highestRank: 0 };
    }
  }

  return { isValid: true, highestRank: ranks[len - 1] };
}

/**
 * Kiểm tra xem bộ candidate có đè được bộ trên bàn (tableCombo) hay không
 */
export function canBeat(candidateCombo: CardCombo, tableCombo: CardCombo): boolean {
  if (candidateCombo.type === 'INVALID' || tableCombo.type === 'INVALID') {
    return false;
  }

  // Trường hợp trên bàn là 1 lá (SINGLE)
  if (tableCombo.type === 'SINGLE') {
    // Nếu trên bàn là con 2 (rank 15)
    if (tableCombo.highestRank === 15) {
      // Chỉ có Tứ quý mới chặt được con 2
      return candidateCombo.type === 'QUAD';
    }
    // Nếu là rác bình thường: chỉ SINGLE lớn hơn mới chặn được
    return candidateCombo.type === 'SINGLE' && candidateCombo.highestRank > tableCombo.highestRank;
  }

  // Trường hợp trên bàn là Đôi (PAIR)
  if (tableCombo.type === 'PAIR') {
    // Nếu trên bàn là đôi 2: không ai chặn được (luật: ko cho 2 tứ chặt đôi 2)
    if (tableCombo.highestRank === 15) {
      return false;
    }
    return candidateCombo.type === 'PAIR' && candidateCombo.highestRank > tableCombo.highestRank;
  }

  // Trường hợp trên bàn là Sáp (TRIPLE)
  if (tableCombo.type === 'TRIPLE') {
    return candidateCombo.type === 'TRIPLE' && candidateCombo.highestRank > tableCombo.highestRank;
  }

  // Trường hợp trên bàn là Tứ quý (QUAD)
  if (tableCombo.type === 'QUAD') {
    // Tứ quý đè tứ quý nhỏ hơn
    return candidateCombo.type === 'QUAD' && candidateCombo.highestRank > tableCombo.highestRank;
  }

  // Trường hợp trên bàn là Sảnh (STRAIGHT)
  if (tableCombo.type === 'STRAIGHT') {
    // Phải cùng số lượng lá và sảnh có rank cao nhất lớn hơn
    return (
      candidateCombo.type === 'STRAIGHT' &&
      candidateCombo.length === tableCombo.length &&
      candidateCombo.highestRank > tableCombo.highestRank
    );
  }

  return false;
}

/**
 * Kiểm tra xem khi đánh 1 lá bài rác, người chơi có vi phạm quy tắc:
 * "Phải đánh lá rác to nhất khi người kế tiếp đã báo 1 lá" hay không.
 * Trả về true nếu trong tay trước khi đánh còn có lá bài rank cao hơn lá vừa đánh.
 */
export function hasHigherSingleCard(playedCards: Card[], handBeforePlay: Card[]): boolean {
  if (playedCards.length !== 1) return false;
  const playedRank = playedCards[0].rank;
  return handBeforePlay.some((c) => c.rank > playedRank);
}

export type InstantWinType = 'FOUR_TWOS' | 'FIVE_PAIRS' | 'SAME_COLOR';

export interface InstantWinCheck {
  isInstantWin: boolean;
  priority: number; // 3: Tứ quý 2, 2: 5 đôi, 1: Full đỏ/đen
  type?: InstantWinType;
  reason?: string;
}

/**
 * Kiểm tra các trường hợp Tới Trắng (Auto thắng ăn 30 lá):
 * 1. Tứ quý 2 (4 con Heo) - Độ ưu tiên 3
 * 2. 5 đôi - Độ ưu tiên 2
 * 3. Đồng màu (Full Đỏ hoặc Full Đen) - Độ ưu tiên 1
 */
export function checkInstantWin(hand: Card[]): InstantWinCheck {
  if (!hand || hand.length !== 10) {
    return { isInstantWin: false, priority: 0 };
  }

  // 1. Tứ quý 2 (4 con Heo)
  const twos = hand.filter((c) => c.rank === 15);
  if (twos.length === 4) {
    return {
      isInstantWin: true,
      priority: 3,
      type: 'FOUR_TWOS',
      reason: 'Tứ quý 2 (4 con Heo)',
    };
  }

  // 2. 5 đôi
  const rankCounts: Record<number, number> = {};
  for (const c of hand) {
    rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1;
  }
  let pairCount = 0;
  for (const count of Object.values(rankCounts)) {
    pairCount += Math.floor(count / 2);
  }
  if (pairCount === 5) {
    return {
      isInstantWin: true,
      priority: 2,
      type: 'FIVE_PAIRS',
      reason: '5 đôi',
    };
  }

  // 3. Full đỏ / full đen
  const allRed = hand.every((c) => c.suit === 'hearts' || c.suit === 'diamonds');
  if (allRed) {
    return {
      isInstantWin: true,
      priority: 1,
      type: 'SAME_COLOR',
      reason: 'Đồng màu (Full Đỏ)',
    };
  }
  const allBlack = hand.every((c) => c.suit === 'spades' || c.suit === 'clubs');
  if (allBlack) {
    return {
      isInstantWin: true,
      priority: 1,
      type: 'SAME_COLOR',
      reason: 'Đồng màu (Full Đen)',
    };
  }

  return { isInstantWin: false, priority: 0 };
}
