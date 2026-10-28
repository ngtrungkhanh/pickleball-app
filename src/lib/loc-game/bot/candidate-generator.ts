import { Card, CardCombo, Rank } from '../types';
import { analyzeCombo, canBeat } from '../analyzer';
import { sortCards } from '../deck';
import { CandidateMove } from './types';

/**
 * Sinh chuỗi định danh duy nhất cho một tập hợp lá bài để lọc trùng
 */
function getComboKey(cards: Card[]): string {
  return cards
    .map((c) => c.id)
    .sort()
    .join('|');
}

/**
 * Lọc bỏ các nước đi trùng lặp
 */
function deduplicateCandidates(candidates: CandidateMove[]): CandidateMove[] {
  const seen = new Set<string>();
  const result: CandidateMove[] = [];

  for (const cand of candidates) {
    if (cand.action === 'PASS') {
      if (!seen.has('PASS')) {
        seen.add('PASS');
        result.push(cand);
      }
      continue;
    }

    const key = `${cand.action}:${getComboKey(cand.cards)}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(cand);
    }
  }

  return result;
}

/**
 * Nhóm các lá bài theo Rank
 */
function groupCardsByRank(cards: Card[]): Map<Rank, Card[]> {
  const byRank = new Map<Rank, Card[]>();
  const sorted = sortCards(cards);
  for (const c of sorted) {
    if (!byRank.has(c.rank)) byRank.set(c.rank, []);
    byRank.get(c.rank)!.push(c);
  }
  return byRank;
}

/**
 * Tìm tất cả các sảnh khả dĩ từ botHand
 * Sinh mọi đoạn liên tiếp từ 3 lá trở lên (bao gồm cả các sảnh con và sảnh đặc biệt A-2-3 khi mở vòng)
 */
function findAllStraights(cards: Card[], includeA23: boolean = true): Card[][] {
  const byRank = groupCardsByRank(cards);
  const results: Card[][] = [];

  // 1. Sảnh liên tiếp thông thường từ 3..14 (không chứa 2)
  const uniqueRanks = Array.from(byRank.keys())
    .sort((a, b) => a - b)
    .filter((r) => r !== 15);

  let i = 0;
  while (i < uniqueRanks.length) {
    const segment: Rank[] = [uniqueRanks[i]];
    let j = i + 1;
    while (j < uniqueRanks.length && uniqueRanks[j] === uniqueRanks[j - 1] + 1) {
      segment.push(uniqueRanks[j]);
      j++;
    }

    // Với mỗi chuỗi liên tiếp dài >= 3, sinh TẤT CẢ các sảnh con có độ dài từ 3 đến segment.length
    if (segment.length >= 3) {
      for (let len = 3; len <= segment.length; len++) {
        for (let start = 0; start <= segment.length - len; start++) {
          const subRanks = segment.slice(start, start + len);
          const straightCards = subRanks.map((r) => byRank.get(r)![0]);
          results.push(straightCards);
        }
      }
    }

    i = j;
  }

  // 2. Sảnh đặc biệt A-2-3 (highestRank = 3 theo analyzer.ts)
  // Chỉ sinh khi includeA23 = true (chủ yếu khi bàn trống)
  if (includeA23 && byRank.has(3) && byRank.has(14) && byRank.has(15)) {
    results.push([
      byRank.get(3)![0],
      byRank.get(14)![0],
      byRank.get(15)![0],
    ]);
  }

  return results;
}

/**
 * Sinh danh sách tất cả các nước đi khả thi (Candidate Moves)
 * Quét trực tiếp trên toàn bộ botHand theo đúng luật chơi, không phụ thuộc vào một phân rã tĩnh
 */
export function generateCandidateMoves(
  botHand: Card[],
  tableCombo: CardCombo | null
): CandidateMove[] {
  if (!botHand || botHand.length === 0) {
    return [{ action: 'PASS', cards: [], description: 'Hết bài' }];
  }

  const candidates: CandidateMove[] = [];
  const byRank = groupCardsByRank(botHand);

  // ===========================================================================
  // TÌNH HUỐNG 1: BÀN TRỐNG (Bot làm chủ vòng - Round Leader)
  // ===========================================================================
  if (!tableCombo || tableCombo.type === 'INVALID') {
    // 1.1. Sinh lá đơn từ MỌI rank có trong tay (kể cả rank thuộc sảnh, đôi, sáp, tứ quý)
    for (const [rank, cards] of byRank) {
      candidates.push({
        action: 'PLAY',
        cards: [cards[0]],
        combo: analyzeCombo([cards[0]]),
        description: `Rác ${rank}`,
      });
    }

    // 1.2. Sinh mọi Đôi khả dĩ (mọi rank có >= 2 lá)
    for (const [rank, cards] of byRank) {
      if (cards.length >= 2) {
        const pair = cards.slice(0, 2);
        candidates.push({
          action: 'PLAY',
          cards: pair,
          combo: analyzeCombo(pair),
          description: `Đôi ${rank}`,
        });
      }
    }

    // 1.3. Sinh mọi Sáp khả dĩ (mọi rank có >= 3 lá)
    for (const [rank, cards] of byRank) {
      if (cards.length >= 3) {
        const triple = cards.slice(0, 3);
        candidates.push({
          action: 'PLAY',
          cards: triple,
          combo: analyzeCombo(triple),
          description: `Sáp ${rank}`,
        });
      }
    }

    // 1.4. Sinh mọi Tứ quý khả dĩ (mọi rank có = 4 lá)
    for (const [rank, cards] of byRank) {
      if (cards.length === 4) {
        candidates.push({
          action: 'PLAY',
          cards,
          combo: analyzeCombo(cards),
          description: `Tứ quý ${rank}`,
        });
      }
    }

    // 1.5. Sinh mọi đoạn Sảnh hợp lệ (từ 3 lá trở lên, bao gồm A-2-3)
    const straights = findAllStraights(botHand, true);
    for (const st of straights) {
      candidates.push({
        action: 'PLAY',
        cards: st,
        combo: analyzeCombo(st),
        description: `Sảnh ${st.length} lá`,
      });
    }

    return deduplicateCandidates(candidates);
  }

  // ===========================================================================
  // TÌNH HUỐNG 2: BÀN CÓ BÀI (Cần đè bài đối thủ hoặc Bỏ lượt)
  // ===========================================================================

  // Nước đi Bỏ lượt (PASS) luôn là lựa chọn hợp lệ khi bàn có bài
  candidates.push({
    action: 'PASS',
    cards: [],
    description: 'Bỏ lượt',
  });

  // 2.1. Bàn là SINGLE
  if (tableCombo.type === 'SINGLE') {
    // Nếu bàn là Heo 2 (rank 15) -> Chỉ có Tứ quý mới chặt được
    if (tableCombo.highestRank === 15) {
      for (const [rank, cards] of byRank) {
        if (cards.length === 4) {
          candidates.push({
            action: 'PLAY',
            cards,
            combo: analyzeCombo(cards),
            description: `Tứ quý ${rank} chặt Heo 2`,
          });
        }
      }
      return deduplicateCandidates(candidates);
    }

    // Bàn là rác thường (< 15)
    // Sinh lá đơn từ MỌI rank trong bài có rank > tableCombo.highestRank (kể cả Heo 2)
    for (const [rank, cards] of byRank) {
      if (rank > tableCombo.highestRank) {
        candidates.push({
          action: 'PLAY',
          cards: [cards[0]],
          combo: analyzeCombo([cards[0]]),
          description: rank === 15 ? 'Heo 2 đè rác' : `Lá đơn ${rank} đè rác ${tableCombo.highestRank}`,
        });
      }
    }

    return deduplicateCandidates(candidates);
  }

  // 2.2. Bàn là PAIR
  if (tableCombo.type === 'PAIR') {
    if (tableCombo.highestRank === 15) {
      // Luật: Đôi 2 không thể bị chặn
      return deduplicateCandidates(candidates);
    }

    // Sinh mọi đôi từ các rank có >= 2 lá và rank > tableCombo.highestRank
    for (const [rank, cards] of byRank) {
      if (cards.length >= 2 && rank > tableCombo.highestRank) {
        const pair = cards.slice(0, 2);
        candidates.push({
          action: 'PLAY',
          cards: pair,
          combo: analyzeCombo(pair),
          description: rank === 15 ? 'Đôi Heo 2 đè đôi bàn' : `Đôi ${rank} đè đôi ${tableCombo.highestRank}`,
        });
      }
    }

    return deduplicateCandidates(candidates);
  }

  // 2.3. Bàn là TRIPLE
  if (tableCombo.type === 'TRIPLE') {
    for (const [rank, cards] of byRank) {
      if (cards.length >= 3 && rank > tableCombo.highestRank) {
        const triple = cards.slice(0, 3);
        candidates.push({
          action: 'PLAY',
          cards: triple,
          combo: analyzeCombo(triple),
          description: `Sáp ${rank} đè sáp ${tableCombo.highestRank}`,
        });
      }
    }
    return deduplicateCandidates(candidates);
  }

  // 2.4. Bàn là QUAD
  if (tableCombo.type === 'QUAD') {
    for (const [rank, cards] of byRank) {
      if (cards.length === 4 && rank > tableCombo.highestRank) {
        candidates.push({
          action: 'PLAY',
          cards,
          combo: analyzeCombo(cards),
          description: `Tứ quý ${rank} đè tứ quý ${tableCombo.highestRank}`,
        });
      }
    }
    return deduplicateCandidates(candidates);
  }

  // 2.5. Bàn là STRAIGHT
  if (tableCombo.type === 'STRAIGHT') {
    const targetLen = tableCombo.length;
    // Tìm các sảnh có cùng độ dài targetLen
    // Sảnh A-2-3 không thể đè bất kỳ sảnh 3 lá nào vì highestRank = 3 là nhỏ nhất -> includeA23 = false khi đè
    const straights = findAllStraights(botHand, false);
    for (const st of straights) {
      if (st.length === targetLen) {
        const combo = analyzeCombo(st);
        if (canBeat(combo, tableCombo)) {
          candidates.push({
            action: 'PLAY',
            cards: st,
            combo,
            description: `Sảnh ${targetLen} lá đè sảnh bàn`,
          });
        }
      }
    }
    return deduplicateCandidates(candidates);
  }

  return deduplicateCandidates(candidates);
}
