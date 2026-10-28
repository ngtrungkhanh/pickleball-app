import { Card, Rank, Suit } from './types';

const SUITS: Suit[] = ['spades', 'clubs', 'diamonds', 'hearts'];
const RANKS: Rank[] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

/**
 * Tạo bộ bài chuẩn 52 lá
 */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push({
        id: `${rank}_${suit}`,
        rank,
        suit,
      });
    }
  }
  return deck;
}

/**
 * Xáo bài ngẫu nhiên (Fisher-Yates)
 */
export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }
  return shuffled;
}

/**
 * Sắp xếp bài theo thứ tự tăng dần từ 3 -> 2
 * Nếu cùng rank thì xếp theo chất (spades < clubs < diamonds < hearts)
 */
export function sortCards(cards: Card[]): Card[] {
  const suitOrder: Record<Suit, number> = {
    spades: 1,
    clubs: 2,
    diamonds: 3,
    hearts: 4,
  };

  return [...cards].sort((a, b) => {
    if (a.rank !== b.rank) {
      return a.rank - b.rank;
    }
    return suitOrder[a.suit] - suitOrder[b.suit];
  });
}

export interface DealResult {
  playerHands: Record<string, Card[]>; // Mỗi người 10 lá đã sắp xếp
  remainingCards: Card[];              // 3 người: 22 lá, 4 người: 12 lá, 5 người: 2 lá
}

/**
 * Chia bài cho từ 3 đến 5 người chơi
 */
export function dealCards(playerIds: string[]): DealResult {
  if (playerIds.length < 3 || playerIds.length > 5) {
    throw new Error('Số người chơi phải từ 3 đến 5 người.');
  }

  const deck = shuffleDeck(createDeck());
  const playerHands: Record<string, Card[]> = {};

  // Khởi tạo bài cho từng người
  playerIds.forEach((id) => {
    playerHands[id] = [];
  });

  // Chia lần lượt mỗi người 10 lá
  let cardIndex = 0;
  for (let round = 0; round < 10; round++) {
    for (const id of playerIds) {
      playerHands[id].push(deck[cardIndex++]);
    }
  }

  // Sắp xếp bài từng người theo thứ tự từ bé đến lớn
  for (const id of playerIds) {
    playerHands[id] = sortCards(playerHands[id]);
  }

  // Phần bài dư úp bí mật
  const remainingCards = deck.slice(cardIndex);

  return {
    playerHands,
    remainingCards,
  };
}
