import { Card, CardCombo } from '../types';
import { TableState } from '../network-types';
import { analyzeCombo, canBeat } from '../analyzer';
import { sortCards } from '../deck';
import { CardTracker } from './card-tracker';
import { partitionHand, evaluateSamPossibility } from './hand-evaluator';
import { BotDecision, HandPartition } from './types';

/**
 * Trí tuệ nhân tạo (Bot AI) cho Game Đánh Lốc
 * Mô phỏng tư duy của người chơi chuyên nghiệp:
 * - Đếm bài (2 và Tứ quý)
 * - Giữ bộ, không xé sảnh bừa bãi
 * - Chặn người báo 1 lá tránh đền bài
 * - Quyết đoán bắt cái bằng Heo khi có cơ hội xả bài
 */
export class BotBrain {
  private tracker: CardTracker;

  constructor(tracker?: CardTracker) {
    this.tracker = tracker || new CardTracker();
  }

  public getTracker(): CardTracker {
    return this.tracker;
  }

  /**
   * Quyết định có Báo Sâm hay không ở đầu ván
   */
  public decideSamCall(botHand: Card[]): boolean {
    return evaluateSamPossibility(botHand);
  }

  /**
   * Ra quyết định đánh bài hoặc bỏ lượt khi đến phiên
   */
  public decideMove(
    botId: string,
    botHand: Card[],
    tableState: TableState
  ): BotDecision {
    if (!botHand || botHand.length === 0) {
      return { action: 'PASS', cards: [], reason: 'Hết bài' };
    }

    const partition = partitionHand(botHand);
    const isNextPlayerSingle = this.tracker.isNextPlayerSingle(botId, tableState.players);
    const minOpponentCards = this.tracker.getMinOpponentCards(botId, tableState.players);

    // =========================================================================
    // TÌNH HUỐNG 1: BÀN TRỐNG (Bot làm chủ vòng / Round Leader)
    // =========================================================================
    if (!tableState.lastPlay) {
      return this.decideLeadingMove(botHand, partition, isNextPlayerSingle, minOpponentCards);
    }

    // =========================================================================
    // TÌNH HUỐNG 2: BÀN CÓ BÀI (Cần chặn bài đối thủ)
    // =========================================================================
    return this.decideBeatingMove(
      botHand,
      partition,
      tableState.lastPlay.combo,
      isNextPlayerSingle,
      minOpponentCards
    );
  }

  /**
   * Chọn bộ bài đánh khi đi đầu vòng
   */
  private decideLeadingMove(
    botHand: Card[],
    partition: HandPartition,
    isNextPlayerSingle: boolean,
    minOpponentCards: number
  ): BotDecision {
    // 1. CHIẾN THUẬT: Đối thủ kế tiếp chỉ còn 1 lá (Báo 1) hoặc có người sắp về (<= 2 lá)
    if (isNextPlayerSingle || minOpponentCards <= 1) {
      // Ưu tiên 1.1: Đánh Bộ (Sảnh, Đôi, Sáp, Tứ quý) -> Đối thủ 1 lá KHÔNG THỂ đỡ được!
      if (partition.straights.length > 0) {
        const longest = [...partition.straights].sort((a, b) => b.length - a.length)[0];
        return {
          action: 'PLAY',
          cards: longest,
          combo: analyzeCombo(longest),
          reason: 'Người sau còn 1 lá -> Đánh sảnh dài để họ không thể đỡ',
        };
      }
      if (partition.triples.length > 0) {
        const triple = partition.triples[0];
        return {
          action: 'PLAY',
          cards: triple,
          combo: analyzeCombo(triple),
          reason: 'Người sau còn 1 lá -> Đánh sáp',
        };
      }
      if (partition.pairs.length > 0) {
        const pair = partition.pairs[0];
        return {
          action: 'PLAY',
          cards: pair,
          combo: analyzeCombo(pair),
          reason: 'Người sau còn 1 lá -> Đánh đôi',
        };
      }

      // Ưu tiên 1.2: Nếu chỉ còn rác lẻ -> BẮT BUỘC đánh lá to nhất để chặn đầu (tránh đền bài)
      const sorted = sortCards(botHand);
      const biggestSingle = sorted[sorted.length - 1];
      return {
        action: 'PLAY',
        cards: [biggestSingle],
        combo: analyzeCombo([biggestSingle]),
        reason: 'Người sau còn 1 lá và chỉ còn rác -> Đánh lá to nhất chặn đầu',
      };
    }

    // 2. CHIẾN THUẬT: TRÁNH THỐI 2 KHI CÒN 2 LÁ [1 lá thường, 1 con 2]
    // Luật Lốc: Về ván bằng con 2 cuối cùng sẽ bị tính thối 2 (phạt 5 lá).
    // Do đó nếu còn 2 lá [Thường, 2], PHẢI đánh con 2 trước cướp cái, rồi lá sau cùng về bằng lá thường!
    if (botHand.length === 2) {
      const hasTwo = botHand.some((c) => c.rank === 15);
      const normalCard = botHand.find((c) => c.rank !== 15);
      if (hasTwo && normalCard) {
        const twoCard = botHand.find((c) => c.rank === 15)!;
        return {
          action: 'PLAY',
          cards: [twoCard],
          combo: analyzeCombo([twoCard]),
          reason: 'Đánh Heo trước cướp cái để về bằng lá thường, tránh bị phạt thối 2 cuối ván',
        };
      }
    }

    // 3. CHIẾN THUẬT BÌNH THƯỜNG:
    // Ưu tiên 2.1: Xả sảnh dài nhất trước để giải phóng quân
    if (partition.straights.length > 0) {
      const longest = [...partition.straights].sort((a, b) => b.length - a.length)[0];
      return {
        action: 'PLAY',
        cards: longest,
        combo: analyzeCombo(longest),
        reason: 'Xả sảnh dài nhất để kiểm soát bàn chơi',
      };
    }

    // Ưu tiên 2.2: Xả đôi nhỏ hoặc sáp nhỏ để thăm dò
    if (partition.pairs.length > 0) {
      const smallestPair = [...partition.pairs].sort((a, b) => a[0].rank - b[0].rank)[0];
      // Nếu không phải đôi 2 thì đánh đôi nhỏ
      if (smallestPair[0].rank !== 15) {
        return {
          action: 'PLAY',
          cards: smallestPair,
          combo: analyzeCombo(smallestPair),
          reason: 'Đánh đôi nhỏ để giải phóng bài yếu',
        };
      }
    }

    if (partition.triples.length > 0) {
      const smallestTriple = [...partition.triples].sort((a, b) => a[0].rank - b[0].rank)[0];
      return {
        action: 'PLAY',
        cards: smallestTriple,
        combo: analyzeCombo(smallestTriple),
        reason: 'Đánh sáp nhỏ để giải phóng bài',
      };
    }

    // Ưu tiên 2.3: Đánh rác nhỏ trong số singles (ngoại trừ Heo rank 15)
    const normalSingles = partition.singles.filter((c) => c.rank !== 15);
    if (normalSingles.length > 0) {
      const smallestSingle = normalSingles[0];
      return {
        action: 'PLAY',
        cards: [smallestSingle],
        combo: analyzeCombo([smallestSingle]),
        reason: 'Đánh rác nhỏ nhất để thăm dò',
      };
    }

    // Ưu tiên 2.4: Nếu chỉ còn Heo hoặc Tứ quý hoặc Đôi 2
    const sorted = sortCards(botHand);
    return {
      action: 'PLAY',
      cards: [sorted[0]],
      combo: analyzeCombo([sorted[0]]),
      reason: 'Đánh lá nhỏ nhất còn lại',
    };
  }

  /**
   * Chọn bộ bài đỡ khi trên bàn đang có bài
   */
  private decideBeatingMove(
    botHand: Card[],
    partition: HandPartition,
    tableCombo: CardCombo,
    isNextPlayerSingle: boolean,
    minOpponentCards: number
  ): BotDecision {
    // -------------------------------------------------------------------------
    // BÀN ĐÁNH 1 LÁ (SINGLE)
    // -------------------------------------------------------------------------
    if (tableCombo.type === 'SINGLE') {
      // Nếu trên bàn là con 2 (rank 15)
      if (tableCombo.highestRank === 15) {
        // Chỉ Tứ quý mới chặt được
        if (partition.quads.length > 0) {
          const quad = partition.quads[0];
          return {
            action: 'PLAY',
            cards: quad,
            combo: analyzeCombo(quad),
            reason: 'Tứ quý chặt 2 để ăn điểm phạt và cướp cái',
          };
        }
        return { action: 'PASS', cards: [], reason: 'Không có tứ quý để chặt 2' };
      }

      // Trên bàn là rác thường (< 15)
      // Tìm lá rác lẻ trong singles có thể đè
      const beatingSingles = partition.singles.filter((c) => c.rank > tableCombo.highestRank);

      // Nếu có rác lẻ thường (không phải 2)
      const normalBeatingSingles = beatingSingles.filter((c) => c.rank !== 15);
      if (normalBeatingSingles.length > 0) {
        // Nếu người sau báo 1 lá, đánh con to nhất trong số beating
        if (isNextPlayerSingle) {
          const biggest = normalBeatingSingles[normalBeatingSingles.length - 1];
          return {
            action: 'PLAY',
            cards: [biggest],
            combo: analyzeCombo([biggest]),
            reason: 'Đánh rác to nhất đè bài vì người sau còn 1 lá',
          };
        }
        // Bình thường: lấy lá nhỏ nhất vừa đủ đè để tiết kiệm lá to
        const lowestBeat = normalBeatingSingles[0];
        return {
          action: 'PLAY',
          cards: [lowestBeat],
          combo: analyzeCombo([lowestBeat]),
          reason: 'Đỡ rác bằng lá rác nhỏ nhất hợp lệ',
        };
      }

      // Nếu không có rác thường, nhưng có Heo (2) lẻ:
      const twoCard = beatingSingles.find((c) => c.rank === 15);
      if (twoCard) {
        const twosInHand = botHand.filter((c) => c.rank === 15).length;
        const hasWinningCombos = partition.straights.length > 0 || partition.pairs.length >= 2;

        // 1. Nguy cơ thối 2: Đối thủ sắp về (<= 4 lá) -> Phải xả 2 ngay để tránh thối ôm Heo
        const isUrgentTwoRelease = minOpponentCards <= 4;

        // 2. Cầm từ 2 con 2 trở lên và đối thủ còn <= 6 lá -> Xả bớt 1 con để tránh thối chùm
        const shouldUnloadMultiTwos = twosInHand >= 2 && minOpponentCards <= 6;

        // 3. Bàn đánh bài to (A rank 14 hoặc K rank 13) vào giữa trận -> Đè Heo cướp cái
        const isBigSingleTable = tableCombo.highestRank >= 13 && minOpponentCards <= 6;

        // 4. Có Sảnh dài hoặc nhiều Đôi mạnh cần cướp cái để xả bài
        const shouldStealTurn = hasWinningCombos;

        if (isUrgentTwoRelease || shouldUnloadMultiTwos || isBigSingleTable || shouldStealTurn) {
          let reason = 'Dùng Heo cướp cái để xả bộ mạnh';
          if (isUrgentTwoRelease) {
            reason = 'Xả Heo khẩn cấp: Đối thủ còn ít bài (<= 4 lá) để tránh nguy cơ thối 2';
          } else if (shouldUnloadMultiTwos) {
            reason = 'Cầm nhiều Heo (>= 2 con): Xả bớt 1 con tránh nguy cơ thối chùm cuối ván';
          } else if (isBigSingleTable) {
            reason = 'Đè Heo bắt lá bài to (A/K) để giành quyền kiểm soát bàn';
          }

          return {
            action: 'PLAY',
            cards: [twoCard],
            combo: analyzeCombo([twoCard]),
            reason,
          };
        }
      }

      // Chiến thuật thoát Cóng (Burn Avoidance):
      // Nếu bot chưa ra được lá nào (còn nguyên 10 lá) và đối thủ sắp về (<= 3 lá):
      // Phải xé bài hoặc đánh lá to đè ngay để tránh bị phạt cóng 14 lá!
      const isAboutToBeBurned = botHand.length === 10 && minOpponentCards <= 3;
      if (isAboutToBeBurned) {
        // Tìm bất kỳ lá nào trong botHand lớn hơn tableCombo
        const sorted = sortCards(botHand);
        const escapeCard = sorted.find((c) => c.rank > tableCombo.highestRank && c.rank !== 15);
        if (escapeCard) {
          return {
            action: 'PLAY',
            cards: [escapeCard],
            combo: analyzeCombo([escapeCard]),
            reason: 'Cấp cứu thoát Cóng: Đè bài ngay để tránh bị phạt 14 lá cháy bài',
          };
        }
      }

      // Giữ bộ, không xé đôi/sáp/sảnh đẹp chỉ để đỡ một lá rác lẻ
      return { action: 'PASS', cards: [], reason: 'Bảo toàn bộ bài, không xé đôi/sảnh để đỡ rác' };
    }

    // -------------------------------------------------------------------------
    // BÀN ĐÁNH ĐÔI (PAIR)
    // -------------------------------------------------------------------------
    if (tableCombo.type === 'PAIR') {
      if (tableCombo.highestRank === 15) {
        return { action: 'PASS', cards: [], reason: 'Đôi 2 không thể chặn' };
      }

      const beatingPairs = partition.pairs.filter((p) => p[0].rank > tableCombo.highestRank);
      if (beatingPairs.length > 0) {
        // Chọn đôi nhỏ nhất vừa đủ đè
        beatingPairs.sort((a, b) => a[0].rank - b[0].rank);
        const pair = beatingPairs[0];
        return {
          action: 'PLAY',
          cards: pair,
          combo: analyzeCombo(pair),
          reason: 'Đỡ đôi bằng đôi nhỏ nhất hợp lệ',
        };
      }

      return { action: 'PASS', cards: [], reason: 'Không có đôi đủ lớn' };
    }

    // -------------------------------------------------------------------------
    // BÀN ĐÁNH SÁP (TRIPLE)
    // -------------------------------------------------------------------------
    if (tableCombo.type === 'TRIPLE') {
      const beatingTriples = partition.triples.filter((t) => t[0].rank > tableCombo.highestRank);
      if (beatingTriples.length > 0) {
        beatingTriples.sort((a, b) => a[0].rank - b[0].rank);
        const triple = beatingTriples[0];
        return {
          action: 'PLAY',
          cards: triple,
          combo: analyzeCombo(triple),
          reason: 'Đỡ sáp bằng sáp nhỏ nhất hợp lệ',
        };
      }
      return { action: 'PASS', cards: [], reason: 'Không có sáp đủ lớn' };
    }

    // -------------------------------------------------------------------------
    // BÀN ĐÁNH TỨ QUÝ (QUAD)
    // -------------------------------------------------------------------------
    if (tableCombo.type === 'QUAD') {
      const beatingQuads = partition.quads.filter((q) => q[0].rank > tableCombo.highestRank);
      if (beatingQuads.length > 0) {
        beatingQuads.sort((a, b) => a[0].rank - b[0].rank);
        const quad = beatingQuads[0];
        return {
          action: 'PLAY',
          cards: quad,
          combo: analyzeCombo(quad),
          reason: 'Tứ quý đè tứ quý nhỏ hơn để ăn tiền chồng',
        };
      }
      return { action: 'PASS', cards: [], reason: 'Không có tứ quý đè lại' };
    }

    // -------------------------------------------------------------------------
    // BÀN ĐÁNH SẢNH (STRAIGHT)
    // -------------------------------------------------------------------------
    if (tableCombo.type === 'STRAIGHT') {
      // Tìm sảnh có cùng độ dài và highestRank lớn hơn
      const sameLengthStraights = partition.straights.filter((st) => st.length === tableCombo.length);
      const beatingStraights = sameLengthStraights.filter((st) => {
        const combo = analyzeCombo(st);
        return canBeat(combo, tableCombo);
      });

      if (beatingStraights.length > 0) {
        // Sắp xếp sảnh có highestRank nhỏ nhất
        beatingStraights.sort((a, b) => {
          const ca = analyzeCombo(a);
          const cb = analyzeCombo(b);
          return ca.highestRank - cb.highestRank;
        });

        const st = beatingStraights[0];
        return {
          action: 'PLAY',
          cards: st,
          combo: analyzeCombo(st),
          reason: 'Đỡ sảnh bằng sảnh nhỏ nhất hợp lệ',
        };
      }

      return { action: 'PASS', cards: [], reason: 'Không có sảnh phù hợp để chặn' };
    }

    return { action: 'PASS', cards: [], reason: 'Bỏ lượt' };
  }
}
