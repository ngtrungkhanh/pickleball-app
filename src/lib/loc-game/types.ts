export type Suit = 'spades' | 'clubs' | 'diamonds' | 'hearts';

/**
 * Rank giá trị từ 3 đến 15:
 * 3..10 = 3..10
 * 11 = J
 * 12 = Q
 * 13 = K
 * 14 = A
 * 15 = 2 (Heo)
 */
export type Rank = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

export interface Card {
  id: string; // vd: "3_spades", "15_hearts"
  rank: Rank;
  suit: Suit;
}

export type ComboType = 
  | 'SINGLE'      // Rác (1 lá)
  | 'PAIR'        // Đôi (2 lá cùng rank)
  | 'TRIPLE'      // Sáp / Sám (3 lá cùng rank)
  | 'QUAD'        // Tứ quý (4 lá cùng rank)
  | 'STRAIGHT'    // Sảnh / Dây (>= 3 lá liên tiếp)
  | 'INVALID';    // Không hợp lệ

export interface CardCombo {
  type: ComboType;
  cards: Card[];
  highestRank: number; // Rank quyết định độ lớn để so sánh
  length: number;      // Số lượng lá
}

export interface PlayerScoreDetail {
  playerId: string;
  playerName: string;
  isWinner: boolean;
  isInstantWin?: boolean;  // Tới trắng (Tứ quý 2, 5 đôi, full đỏ/đen)
  instantWinReason?: string;
  isSamSuccess?: boolean;
  isSamFailed?: boolean;
  isDenLang?: boolean;     // Đền làng (do thả bài/không xả cây to nhất khi người sau báo 1 lá)
  cardsRemaining: number;
  isBurned: boolean;       // Cóng (chưa đánh được lá nào)
  twosRemaining: number;   // Số con 2 bị thối
  quadsRemaining: number;  // Số tứ quý bị thối
  hasThoi2ByEndingWith2: boolean; // Về bằng 2 tính là thối 2
  chopPoints: number;      // Điểm chặt 2 dồn lại (+/- lá)
  penaltyCards: number;    // Tổng lá bị phạt
  netCards: number;        // Tổng lá thực nhận/mất (+ ăn lá, - mất lá)
}
