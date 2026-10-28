import { Card, CardCombo, Rank } from '../types';
import { RoomPlayer } from '../network-types';

export class CardTracker {
  private playedCards: Card[] = [];
  // Ghi nhận mức rank mà từng đối thủ đã từng BỎ LƯỢT (PASS) để suy đoán khoảng bài
  private passedSingleRanks: Map<string, number> = new Map();
  private passedPairRanks: Map<string, number> = new Map();

  constructor() {}

  /**
   * Reset bộ nhớ khi ván mới bắt đầu
   */
  public reset(): void {
    this.playedCards = [];
    this.passedSingleRanks.clear();
    this.passedPairRanks.clear();
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
   * Ghi nhận hành vi BỎ LƯỢT (PASS) của đối thủ để đoán bài:
   * Nếu đối thủ PASS lá Single 10 -> Đối thủ khả năng cao không có rác lẻ > 10 (trừ Heo 2)
   */
  public recordPass(playerId: string, tableCombo: CardCombo | null): void {
    if (!tableCombo) return;
    if (tableCombo.type === 'SINGLE') {
      const cur = this.passedSingleRanks.get(playerId) || 0;
      this.passedSingleRanks.set(playerId, Math.max(cur, tableCombo.highestRank));
    } else if (tableCombo.type === 'PAIR') {
      const cur = this.passedPairRanks.get(playerId) || 0;
      this.passedPairRanks.set(playerId, Math.max(cur, tableCombo.highestRank));
    }
  }

  /**
   * Suy đoán xem một lá rác hoặc đôi có an toàn trước các đối thủ hay không
   */
  public isRankSafeFromOpponents(rank: number, type: 'SINGLE' | 'PAIR', opponents: RoomPlayer[]): boolean {
    if (opponents.length === 0) return false;
    let safeCount = 0;
    const map = type === 'SINGLE' ? this.passedSingleRanks : this.passedPairRanks;
    for (const opp of opponents) {
      const passedRank = map.get(opp.id);
      if (passedRank && passedRank >= rank) {
        safeCount++;
      }
    }
    return safeCount >= Math.ceil(opponents.length / 2);
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
