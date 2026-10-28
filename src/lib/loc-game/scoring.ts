import { Card, PlayerScoreDetail } from './types';

export interface ChopEvent {
  chopperId: string;
  victimId: string;
  count: number; // 1 tứ quý chặt 1 lá 2 = 10 lá
}

export interface CalculateRoundScoresParams {
  players: { id: string; name: string }[];
  remainingHands: Record<string, Card[]>;
  cardsPlayedCount: Record<string, number>; // Số lá mỗi người đã đánh trong ván
  winnerId: string;
  lastPlayedCards?: Card[]; // Lá bài cuối cùng của winner để check thối 2
  isInstantWin?: boolean; // Tới trắng (Tứ quý 2, 5 đôi, full đỏ/đen)
  instantWinPlayerId?: string;
  instantWinReason?: string;
  isSamSuccess?: boolean;
  isSamFailed?: boolean;
  samPlayerId?: string;
  denLangPlayerId?: string; // Người bị Đền Làng (gánh toàn bộ tiền phạt của cả làng)
  chopEvents?: ChopEvent[];
}

/**
 * Tính điểm kết toán ván đấu quy ra lá bài (Zero-sum: tổng netCards = 0)
 */
export function calculateRoundScores(params: CalculateRoundScoresParams): Record<string, PlayerScoreDetail> {
  const {
    players,
    remainingHands,
    cardsPlayedCount,
    winnerId,
    lastPlayedCards = [],
    isInstantWin = false,
    instantWinPlayerId,
    instantWinReason,
    isSamSuccess = false,
    isSamFailed = false,
    samPlayerId,
    denLangPlayerId,
    chopEvents = [],
  } = params;

  const result: Record<string, PlayerScoreDetail> = {};
  const otherPlayers = players.filter((p) => p.id !== winnerId);

  // Khởi tạo bảng chi tiết
  for (const p of players) {
    result[p.id] = {
      playerId: p.id,
      playerName: p.name,
      isWinner: p.id === winnerId,
      cardsRemaining: remainingHands[p.id]?.length || 0,
      isBurned: false,
      twosRemaining: 0,
      quadsRemaining: 0,
      hasThoi2ByEndingWith2: false,
      chopPoints: 0,
      penaltyCards: 0,
      netCards: 0,
    };
  }

  // 1. Tính điểm Chặt 2 dồn lại (10 lá / lần chặt)
  for (const event of chopEvents) {
    const points = event.count * 10;
    if (result[event.chopperId]) {
      result[event.chopperId].chopPoints += points;
    }
    if (result[event.victimId]) {
      result[event.victimId].chopPoints -= points;
    }
  }

  // 2. TRƯỜNG HỢP: TỚI TRẮNG (Auto thắng ăn 30 lá / người)
  if (isInstantWin && instantWinPlayerId) {
    const instantWinner = result[instantWinPlayerId];
    instantWinner.isInstantWin = true;
    instantWinner.instantWinReason = instantWinReason;
    instantWinner.isWinner = true;

    let totalWonFromInstantWin = 0;
    for (const p of players) {
      if (p.id !== instantWinPlayerId) {
        // Mỗi người thua nộp 30 lá
        result[p.id].penaltyCards += 30;
        result[p.id].netCards = -30 + result[p.id].chopPoints;
        totalWonFromInstantWin += 30;
      }
    }
    instantWinner.netCards = totalWonFromInstantWin + instantWinner.chopPoints;
    return result;
  }

  // 3. TRƯỜNG HỢP: SÂM THÀNH CÔNG
  if (isSamSuccess && samPlayerId) {
    const samWinner = result[samPlayerId];
    samWinner.isSamSuccess = true;
    samWinner.isWinner = true;

    let totalWonFromSam = 0;
    for (const p of players) {
      if (p.id !== samPlayerId) {
        // Mỗi người thua nộp 20 lá
        result[p.id].penaltyCards += 20;
        result[p.id].netCards = -20 + result[p.id].chopPoints;
        totalWonFromSam += 20;
      }
    }
    samWinner.netCards = totalWonFromSam + samWinner.chopPoints;
    return result;
  }

  // 4. TRƯỜNG HỢP: ĐỀN SÂM (Bị người khác chặn)
  if (isSamFailed && samPlayerId) {
    const samLoser = result[samPlayerId];
    samLoser.isSamFailed = true;

    const victims = players.filter((p) => p.id !== samPlayerId);
    let totalPenalty = 0;
    for (const p of victims) {
      // Mỗi người còn lại được nhận 20 lá từ người đền sâm
      result[p.id].netCards = 20 + result[p.id].chopPoints;
      totalPenalty += 20;
    }
    samLoser.penaltyCards += totalPenalty;
    samLoser.netCards = -totalPenalty + samLoser.chopPoints;
    return result;
  }

  // 5. TRƯỜNG HỢP: VÁN ĐẤU BÌNH THƯỜNG
  let totalCardsLostByOthers = 0;

  for (const p of otherPlayers) {
    const detail = result[p.id];
    const hand = remainingHands[p.id] || [];
    const playedCount = cardsPlayedCount[p.id] || 0;

    // A. Kiểm tra Cóng / Úng bài (chưa đánh được lá nào)
    const isBurned = playedCount === 0 && hand.length === 10;
    detail.isBurned = isBurned;

    // B. Đếm số lá 2 và tứ quý trên tay
    const twos = hand.filter((c) => c.rank === 15).length;
    detail.twosRemaining = twos;

    const rankCounts: Record<number, number> = {};
    for (const c of hand) {
      rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1;
    }
    let quads = 0;
    for (const count of Object.values(rankCounts)) {
      if (count === 4) quads++;
    }
    detail.quadsRemaining = quads;

    let totalPenalty = 0;
    if (isBurned) {
      // Khi đã úng thì chỉ tính 14 lá cố định, KHÔNG tính thêm thối 2 hay thối tứ quý
      totalPenalty = 14;
    } else {
      // Thua thông thường:
      // Các lá bài thường (không phải 2): tính 1 lá / lá
      const normalCards = hand.length - twos;
      // Mỗi lá 2 thối tính là 5 lá (VD: 8 lá có 1 lá 2 thì mất 7 + 5 = 12 lá)
      const twosPenalty = twos * 5;
      // Thối Tứ quý: Phạt thêm 5 lá / mỗi bộ tứ quý còn trên tay
      const quadsPenalty = quads * 5;
      totalPenalty = normalCards + twosPenalty + quadsPenalty;
    }

    detail.penaltyCards = totalPenalty;
    detail.netCards = -totalPenalty + detail.chopPoints;

    totalCardsLostByOthers += totalPenalty;
  }

  // Nếu có người Đền Làng: Người đền gánh toàn bộ tổng lá phạt của cả làng
  if (denLangPlayerId && result[denLangPlayerId] && denLangPlayerId !== winnerId) {
    for (const p of otherPlayers) {
      const detail = result[p.id];
      if (p.id === denLangPlayerId) {
        detail.isDenLang = true;
        detail.penaltyCards = totalCardsLostByOthers;
        detail.netCards = -totalCardsLostByOthers + detail.chopPoints;
      } else {
        // Những người thua khác được miễn trừ phạt
        detail.penaltyCards = 0;
        detail.netCards = detail.chopPoints;
      }
    }
  }

  // 6. Tính cho Người về nhất
  const winnerDetail = result[winnerId];
  // Kiểm tra nếu người về nhất đánh lá 2 cuối cùng -> bị phạt thối 2
  const endsWithTwo = lastPlayedCards.some((c) => c.rank === 15);
  let winnerSelfPenalty = 0;
  if (endsWithTwo) {
    winnerDetail.hasThoi2ByEndingWith2 = true;
    winnerSelfPenalty = 5; // Phạt thối 2
    winnerDetail.penaltyCards = winnerSelfPenalty;
  }

  // Tổng lá người về nhất nhận được = tổng lá người khác thua - phạt về bằng 2 (nếu có) + điểm chặt
  winnerDetail.netCards = totalCardsLostByOthers - winnerSelfPenalty + winnerDetail.chopPoints;

  return result;
}
