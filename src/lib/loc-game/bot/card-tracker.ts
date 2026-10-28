import { Card, Rank } from '../types';
import { RoomPlayer } from '../network-types';

export class CardTracker {
  private playedCards: Card[] = [];

  constructor() {}

  /**
   * Reset bộ nhớ khi ván mới bắt đầu
   */
  public reset(): void {
    this.playedCards = [];
  }

  /**
   * Ghi nhận các lá bài vừa được đánh ra trên bàn
   */
  public recordPlay(cards: Card[]): void {
    if (!cards || cards.length === 0) return;
    for (const card of cards) {
      if (!this.playedCards.some((c) => c.id === card.id)) {
        this.playedCards.push(card);
      }
    }
  }

  /**
   * Lấy danh sách toàn bộ các lá đã đánh
   */
  public getPlayedCards(): Card[] {
    return [...this.playedCards];
  }

  /**
   * Đếm số lá Heo (rank 15) còn lại ở ngoài (chưa ra và không nằm trong tay bot)
   */
  public getRemainingTwosCount(botHand: Card[]): number {
    const twosPlayed = this.playedCards.filter((c) => c.rank === 15).length;
    const twosInHand = botHand.filter((c) => c.rank === 15).length;
    return Math.max(0, 4 - twosPlayed - twosInHand);
  }

  /**
   * Phát hiện các rank có nguy cơ đối thủ đang cầm Tứ quý:
   * Rank nào mà chưa có lá nào xuất hiện (chưa ra bàn và bot không cầm lá nào)
   */
  public getSuspectedQuads(botHand: Card[]): Rank[] {
    const seenRanks = new Set<Rank>();
    for (const c of this.playedCards) seenRanks.add(c.rank);
    for (const c of botHand) seenRanks.add(c.rank);

    const suspected: Rank[] = [];
    // Kiểm tra từ 3 đến 14 (A)
    for (let r = 3; r <= 14; r++) {
      if (!seenRanks.has(r as Rank)) {
        suspected.push(r as Rank);
      }
    }
    return suspected;
  }

  /**
   * Lấy người chơi ngồi kế tiếp theo chiều đánh sau Bot
   */
  public getNextPlayer(botId: string, players: RoomPlayer[]): RoomPlayer | null {
    const activePlayers = players.filter((p) => !p.isSpectator);
    const index = activePlayers.findIndex((p) => p.id === botId);
    if (index === -1 || activePlayers.length <= 1) return null;
    return activePlayers[(index + 1) % activePlayers.length];
  }

  /**
   * Kiểm tra người kế tiếp có đang ở thế "báo 1 lá" hay không
   */
  public isNextPlayerSingle(botId: string, players: RoomPlayer[]): boolean {
    const next = this.getNextPlayer(botId, players);
    return next ? next.cardsRemaining === 1 : false;
  }

  /**
   * Số lá bài ít nhất mà một đối thủ bất kỳ đang giữ
   */
  public getMinOpponentCards(botId: string, players: RoomPlayer[]): number {
    const opponents = players.filter((p) => p.id !== botId && !p.isSpectator);
    if (opponents.length === 0) return 10;
    return Math.min(...opponents.map((p) => p.cardsRemaining));
  }
}
