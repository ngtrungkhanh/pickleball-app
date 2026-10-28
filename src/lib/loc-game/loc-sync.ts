import { createLocSessionAction, addLocRoundAction } from '@/app/actions-loc';
import { LocDebtItem } from '@/lib/loc-core';
import { PlayerScoreDetail } from './types';

/**
 * Khởi tạo Session trên sổ /loc cho một bàn chơi online/offline
 */
export async function createSessionForRoom(
  roomName: string,
  players: { id: string; name: string }[]
): Promise<string | null> {
  try {
    const locPlayers = players.map((p) => ({
      id: p.id,
      name: p.name,
    }));
    const title = `${roomName.trim()} (${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })})`;
    const res = await createLocSessionAction(title, locPlayers);
    if (res.success && res.session) {
      return res.session.id;
    }
  } catch (error) {
    console.warn('Could not auto-create /loc session:', error);
  }
  return null;
}

/**
 * Gửi kết quả ván đấu vừa kết thúc sang /loc
 */
export async function syncRoundToLocSession(
  sessionId: string,
  winnerId: string,
  scoreboard: Record<string, PlayerScoreDetail>
): Promise<boolean> {
  try {
    const debts: LocDebtItem[] = [];

    for (const [playerId, score] of Object.entries(scoreboard)) {
      if (playerId === winnerId) continue;
      // Nếu netCards < 0 -> người này nợ lá
      const lostCards = Math.abs(score.netCards || 0);
      if (lostCards > 0) {
        let note: string | undefined = undefined;
        if (score.isBurned) note = 'Cóng';
        else if (score.isSamFailed) note = 'Đền Sâm';
        else if (score.isDenLang) note = 'Đền Làng';
        else if (score.twosRemaining > 0) note = `Thối ${score.twosRemaining} Heo`;

        debts.push({
          loserId: playerId,
          cards: lostCards,
          note,
        });
      }
    }

    const res = await addLocRoundAction(sessionId, winnerId, debts);
    return res.success;
  } catch (error) {
    console.warn('Could not sync round to /loc session:', error);
    return false;
  }
}
