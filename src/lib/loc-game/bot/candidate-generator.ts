import { Card, CardCombo } from '../types';
import { analyzeCombo, canBeat } from '../analyzer';
import { sortCards } from '../deck';
import { HandPartition, CandidateMove } from './types';

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
 * Trích xuất tất cả sảnh con có độ dài targetLen từ một sảnh dài
 */
function extractSubStraights(straight: Card[], targetLen: number): Card[][] {
  if (straight.length < targetLen || targetLen < 3) return [];
  const results: Card[][] = [];
  const sorted = sortCards(straight);

  for (let i = 0; i <= sorted.length - targetLen; i++) {
    const sub = sorted.slice(i, i + targetLen);
    const combo = analyzeCombo(sub);
    if (combo.type === 'STRAIGHT') {
      results.push(sub);
    }
  }

  return results;
}

/**
 * Sinh danh sách tất cả các nước đi khả thi (Candidate Moves)
 */
export function generateCandidateMoves(
  botHand: Card[],
  tableCombo: CardCombo | null,
  partition: HandPartition
): CandidateMove[] {
  if (!botHand || botHand.length === 0) {
    return [{ action: 'PASS', cards: [], description: 'Hết bài' }];
  }

  const candidates: CandidateMove[] = [];

  // ===========================================================================
  // TÌNH HUỐNG 1: BÀN TRỐNG (Bot làm chủ vòng - Round Leader)
  // ===========================================================================
  if (!tableCombo || tableCombo.type === 'INVALID') {
    // 1.1. Các Sảnh (Straights)
    for (const st of partition.straights) {
      candidates.push({
        action: 'PLAY',
        cards: st,
        combo: analyzeCombo(st),
        description: `Sảnh dài ${st.length} lá`,
      });

      // Nếu sảnh dài (>= 6 lá), thêm lựa chọn tách sảnh để tăng tính linh hoạt
      if (st.length >= 6) {
        const sub3 = extractSubStraights(st, 3);
        for (const sub of sub3) {
          candidates.push({
            action: 'PLAY',
            cards: sub,
            combo: analyzeCombo(sub),
            description: `Sảnh 3 lá trích từ sảnh dài`,
          });
        }
      }
    }

    // 1.2. Các Tứ quý (Quads)
    for (const q of partition.quads) {
      candidates.push({
        action: 'PLAY',
        cards: q,
        combo: analyzeCombo(q),
        description: `Tứ quý ${q[0].rank}`,
      });
    }

    // 1.3. Các Sáp (Triples)
    for (const tr of partition.triples) {
      candidates.push({
        action: 'PLAY',
        cards: tr,
        combo: analyzeCombo(tr),
        description: `Sáp ${tr[0].rank}`,
      });
    }

    // 1.4. Các Đôi (Pairs)
    for (const p of partition.pairs) {
      candidates.push({
        action: 'PLAY',
        cards: p,
        combo: analyzeCombo(p),
        description: `Đôi ${p[0].rank}`,
      });
    }

    // Nếu có Sáp, có thể trích 1 đôi từ Sáp
    for (const tr of partition.triples) {
      const pairFromTriple = tr.slice(0, 2);
      candidates.push({
        action: 'PLAY',
        cards: pairFromTriple,
        combo: analyzeCombo(pairFromTriple),
        description: `Đôi ${tr[0].rank} trích từ sáp`,
      });
    }

    // 1.5. Các lá Rác lẻ (Singles)
    for (const s of partition.singles) {
      candidates.push({
        action: 'PLAY',
        cards: [s],
        combo: analyzeCombo([s]),
        description: `Rác ${s.rank}`,
      });
    }

    // Nếu không có rác lẻ nào (bài toàn bộ/đôi), trích 1 lá từ đôi nhỏ nhất để có phương án xả lẻ
    if (partition.singles.length === 0 && partition.pairs.length > 0) {
      const smallestPair = partition.pairs[0];
      candidates.push({
        action: 'PLAY',
        cards: [smallestPair[0]],
        combo: analyzeCombo([smallestPair[0]]),
        description: `Trích 1 lá từ đôi ${smallestPair[0].rank} để xả lẻ`,
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
      for (const q of partition.quads) {
        candidates.push({
          action: 'PLAY',
          cards: q,
          combo: analyzeCombo(q),
          description: `Tứ quý ${q[0].rank} chặt Heo 2`,
        });
      }
      return deduplicateCandidates(candidates);
    }

    // Bàn là rác thường (< 15)
    // - Các lá đơn trong singles có rank lớn hơn
    for (const s of partition.singles) {
      if (s.rank > tableCombo.highestRank) {
        candidates.push({
          action: 'PLAY',
          cards: [s],
          combo: analyzeCombo([s]),
          description: `Rác ${s.rank} đè rác ${tableCombo.highestRank}`,
        });
      }
    }

    // - Heo 2 (rank 15) nếu có trong tay
    const twos = botHand.filter((c) => c.rank === 15);
    if (twos.length > 0) {
      candidates.push({
        action: 'PLAY',
        cards: [twos[0]],
        combo: analyzeCombo([twos[0]]),
        description: `Heo 2 đè rác ${tableCombo.highestRank}`,
      });
    }

    // - Nếu cần xé bài (ví dụ từ đôi nhỏ để tranh cái hoặc thoát cóng):
    for (const p of partition.pairs) {
      if (p[0].rank > tableCombo.highestRank && p[0].rank !== 15) {
        candidates.push({
          action: 'PLAY',
          cards: [p[0]],
          combo: analyzeCombo([p[0]]),
          description: `Xé 1 lá từ đôi ${p[0].rank} đè rác`,
        });
      }
    }

    return deduplicateCandidates(candidates);
  }

  // 2.2. Bàn là PAIR
  if (tableCombo.type === 'PAIR') {
    if (tableCombo.highestRank === 15) {
      // Đôi 2 không thể chặn
      return deduplicateCandidates(candidates);
    }

    // Các đôi lớn hơn từ partition.pairs
    for (const p of partition.pairs) {
      if (p[0].rank > tableCombo.highestRank) {
        candidates.push({
          action: 'PLAY',
          cards: p,
          combo: analyzeCombo(p),
          description: `Đôi ${p[0].rank} đè đôi ${tableCombo.highestRank}`,
        });
      }
    }

    // Các đôi trích từ Sáp (Triples)
    for (const tr of partition.triples) {
      if (tr[0].rank > tableCombo.highestRank) {
        const pairFromTriple = tr.slice(0, 2);
        candidates.push({
          action: 'PLAY',
          cards: pairFromTriple,
          combo: analyzeCombo(pairFromTriple),
          description: `Đôi ${tr[0].rank} (trích từ sáp) đè đôi ${tableCombo.highestRank}`,
        });
      }
    }

    // Đôi Heo 2 nếu có
    const twos = botHand.filter((c) => c.rank === 15);
    if (twos.length >= 2) {
      const pair2 = twos.slice(0, 2);
      candidates.push({
        action: 'PLAY',
        cards: pair2,
        combo: analyzeCombo(pair2),
        description: `Đôi Heo 2 đè đôi ${tableCombo.highestRank}`,
      });
    }

    return deduplicateCandidates(candidates);
  }

  // 2.3. Bàn là TRIPLE
  if (tableCombo.type === 'TRIPLE') {
    for (const tr of partition.triples) {
      if (tr[0].rank > tableCombo.highestRank) {
        candidates.push({
          action: 'PLAY',
          cards: tr,
          combo: analyzeCombo(tr),
          description: `Sáp ${tr[0].rank} đè sáp ${tableCombo.highestRank}`,
        });
      }
    }

    // Trích sáp từ Tứ quý nếu có
    for (const q of partition.quads) {
      if (q[0].rank > tableCombo.highestRank) {
        const tripleFromQuad = q.slice(0, 3);
        candidates.push({
          action: 'PLAY',
          cards: tripleFromQuad,
          combo: analyzeCombo(tripleFromQuad),
          description: `Sáp ${q[0].rank} (trích từ tứ quý) đè sáp`,
        });
      }
    }

    return deduplicateCandidates(candidates);
  }

  // 2.4. Bàn là QUAD
  if (tableCombo.type === 'QUAD') {
    for (const q of partition.quads) {
      if (q[0].rank > tableCombo.highestRank) {
        candidates.push({
          action: 'PLAY',
          cards: q,
          combo: analyzeCombo(q),
          description: `Tứ quý ${q[0].rank} đè tứ quý ${tableCombo.highestRank}`,
        });
      }
    }
    return deduplicateCandidates(candidates);
  }

  // 2.5. Bàn là STRAIGHT
  if (tableCombo.type === 'STRAIGHT') {
    const targetLen = tableCombo.length;

    // Kiểm tra các sảnh cùng độ dài từ partition.straights
    for (const st of partition.straights) {
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
      } else if (st.length > targetLen) {
        // Sảnh trong tay dài hơn bàn -> trích các sảnh con có độ dài bằng targetLen
        const subStraights = extractSubStraights(st, targetLen);
        for (const sub of subStraights) {
          const combo = analyzeCombo(sub);
          if (canBeat(combo, tableCombo)) {
            candidates.push({
              action: 'PLAY',
              cards: sub,
              combo,
              description: `Sảnh ${targetLen} lá (trích từ sảnh dài) đè sảnh bàn`,
            });
          }
        }
      }
    }

    return deduplicateCandidates(candidates);
  }

  return deduplicateCandidates(candidates);
}
