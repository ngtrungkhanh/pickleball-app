import { describe, it, expect } from 'vitest';
import { Card, CardCombo, PlayerScoreDetail } from '../loc-game/types';
import { TableState } from '../loc-game/network-types';
import { dealCards, sortCards } from '../loc-game/deck';
import { analyzeCombo, hasHigherSingleCard } from '../loc-game/analyzer';
import { calculateRoundScores } from '../loc-game/scoring';
import { BotBrain } from '../loc-game/bot/bot-brain';

interface SimulationGameResult {
  gameIndex: number;
  winnerId: string;
  winnerName: string;
  winnerCombo: CardCombo | undefined;
  winnerCards: Card[];
  turnsCount: number;
  hasEndedWithTwo: boolean;
  chopCount: number;
  burnedPlayers: string[];
  denLangPlayers: string[];
  scores: Record<string, PlayerScoreDetail>;
  openingMoves: { botId: string; cards: Card[]; combo: CardCombo | undefined; reason: string }[];
  playLog: string[];
}

describe('Loc Bot AI - 50 Match Simulation (5 Bots Arena)', () => {
  it('mô phỏng 50 ván đấu giữa 5 Bot AI, ghi log chi tiết và đánh giá trí tuệ', () => {
    const botConfigs: { id: string; name: string; personality: 'aggressive' | 'conservative' | 'balanced' }[] = [
      { id: 'bot_1', name: 'Bot 1 (Sát Thủ ⚡ - Liều)', personality: 'aggressive' },
      { id: 'bot_2', name: 'Bot 2 (Gà Con 🐣 - Thủ)', personality: 'conservative' },
      { id: 'bot_3', name: 'Bot 3 (Thần Bài 🃏 - Cân bằng)', personality: 'balanced' },
      { id: 'bot_4', name: 'Bot 4 (Bá Đạo 🔥 - Liều)', personality: 'aggressive' },
      { id: 'bot_5', name: 'Bot 5 (Cụ Rùa 🐢 - Thủ)', personality: 'conservative' },
    ];

    const brains: Record<string, BotBrain> = {};
    for (const b of botConfigs) {
      brains[b.id] = new BotBrain(undefined, b.personality);
    }

    const gameResults: SimulationGameResult[] = [];
    let previousWinnerId: string = 'bot_1';

    for (let gameIdx = 1; gameIdx <= 50; gameIdx++) {
      // 1. Reset trackers cho tất cả các bot
      for (const b of botConfigs) {
        brains[b.id].getTracker().reset();
      }

      // 2. Chia bài 5 người chơi
      const playerIds = botConfigs.map((b) => b.id);
      const dealResult = dealCards(playerIds);
      const hands: Record<string, Card[]> = {};
      const initialHands: Record<string, Card[]> = {};
      const cardsPlayedCount: Record<string, number> = {};

      for (const pid of playerIds) {
        hands[pid] = sortCards([...dealResult.playerHands[pid]]);
        initialHands[pid] = [...hands[pid]];
        cardsPlayedCount[pid] = 0;
      }

      // 3. Pha Báo Sâm
      let samCallerId: string | null = null;
      for (const b of botConfigs) {
        if (brains[b.id].decideSamCall(hands[b.id])) {
          samCallerId = b.id;
          break; // Người báo sâm đầu tiên
        }
      }

      // 4. Khởi tạo trạng thái bàn chơi
      let currentTurnId = samCallerId || previousWinnerId;
      let roundLeaderId = currentTurnId;
      let tableCombo: CardCombo | null = null;
      let lastPlay: TableState['lastPlay'] = null;
      const passedPlayers = new Set<string>();
      const chopEvents: { chopperId: string; victimId: string; count: number }[] = [];
      let potentialDenLang: { attackerId: string; targetBaoId: string } | null = null;

      const playLog: string[] = [];
      const openingMoves: { botId: string; cards: Card[]; combo: CardCombo | undefined; reason: string }[] = [];
      let turnStep = 0;
      let winnerId: string | null = null;
      let winnerLastCards: Card[] = [];

      playLog.push(`=== VÁN ${gameIdx} BẮT ĐẦU ===`);
      if (samCallerId) {
        playLog.push(`📢 ${botConfigs.find((b) => b.id === samCallerId)?.name} BÁO SÂM! Đi đầu tiên.`);
      }

      // 5. Vòng lặp các lượt đánh
      while (!winnerId && turnStep < 200) {
        turnStep++;

        // Chuẩn bị TableState cho Bot ra quyết định
        const tablePlayers = botConfigs.map((b) => ({
          id: b.id,
          name: b.name,
          isHost: b.id === 'bot_1',
          isSpectator: false,
          isBot: true,
          cardsRemaining: hands[b.id].length,
          hasPassed: passedPlayers.has(b.id),
        }));

        const tableState: TableState = {
          roomId: `sim_room_${gameIdx}`,
          roomName: `Sim Room ${gameIdx}`,
          hostId: 'bot_1',
          status: 'playing',
          players: tablePlayers,
          spectators: [],
          currentTurnPlayerId: currentTurnId,
          roundLeaderPlayerId: roundLeaderId,
          turnDeadline: Date.now() + 30000,
          lastPlay,
          samState: samCallerId ? { samCallerId, samCallerName: '', skipPlayerIds: [], deadline: null } : null,
          playHistory: [],
          roundResult: null,
        };

        const currentBrain = brains[currentTurnId];
        const currentHand = hands[currentTurnId];
        const decision = currentBrain.decideMove(currentTurnId, currentHand, tableState);

        const currentBotName = botConfigs.find((b) => b.id === currentTurnId)?.name || currentTurnId;

        if (decision.action === 'PLAY' && decision.cards.length > 0) {
          const playedCards = decision.cards;
          const combo = decision.combo || analyzeCombo(playedCards);

          // Kiểm tra mở màn (khi bàn trống)
          if (!tableCombo) {
            openingMoves.push({
              botId: currentTurnId,
              cards: playedCards,
              combo,
              reason: decision.reason || '',
            });
          }

          // Kiểm tra Chặt Heo 2 bằng Tứ Quý
          if (
            lastPlay &&
            lastPlay.combo.type === 'SINGLE' &&
            lastPlay.combo.highestRank === 15 &&
            combo.type === 'QUAD'
          ) {
            chopEvents.push({
              chopperId: currentTurnId,
              victimId: lastPlay.playerId,
              count: 1,
            });
            playLog.push(`💥 [Chặt Heo] ${currentBotName} dùng Tứ Quý ${combo.highestRank} chặt Heo 2 của ${lastPlay.playerName}!`);
          }

          // Kiểm tra luật Báo 1 lá & Đền Làng
          const currentIdx = botConfigs.findIndex((b) => b.id === currentTurnId);
          const nextIdx = (currentIdx + 1) % botConfigs.length;
          const nextPlayer = botConfigs[nextIdx];
          if (hands[nextPlayer.id].length === 1) {
            if (playedCards.length === 1 && hasHigherSingleCard(playedCards, currentHand)) {
              potentialDenLang = { attackerId: currentTurnId, targetBaoId: nextPlayer.id };
            } else {
              potentialDenLang = null;
            }
          } else {
            potentialDenLang = null;
          }

          // Trừ bài
          const playedIds = new Set(playedCards.map((c) => c.id));
          hands[currentTurnId] = currentHand.filter((c) => !playedIds.has(c.id));
          cardsPlayedCount[currentTurnId] += playedCards.length;

          // Cập nhật bàn
          tableCombo = combo;
          lastPlay = { playerId: currentTurnId, playerName: currentBotName, combo };
          roundLeaderId = currentTurnId;

          // Thông báo cho CardTracker của toàn bộ 5 Bot
          for (const b of botConfigs) {
            brains[b.id].getTracker().recordPlay(playedCards);
          }

          const cardDesc = playedCards.map((c) => c.rank).join(',');
          playLog.push(`Turn ${turnStep}: ${currentBotName} ĐÁNH [${combo.type} rank ${combo.highestRank} (${cardDesc})] - Lý do: ${decision.reason} | Còn ${hands[currentTurnId].length} lá`);

          // Kiểm tra VỀ ĐÍCH
          if (hands[currentTurnId].length === 0) {
            winnerId = currentTurnId;
            winnerLastCards = [...playedCards];
            playLog.push(`🏆 ${currentBotName} ĐÃ HẾT BÀI VÀ VỀ NHẤT!`);
            break;
          }
        } else {
          // Bỏ lượt (PASS)
          passedPlayers.add(currentTurnId);
          playLog.push(`Turn ${turnStep}: ${currentBotName} BỎ LƯỢT (PASS) - Lý do: ${decision.reason}`);
        }

        // Tìm người tiếp theo
        const activeRemaining = botConfigs.filter((b) => hands[b.id].length > 0 && !passedPlayers.has(b.id));

        if (activeRemaining.length === 0 || (activeRemaining.length === 1 && activeRemaining[0].id === roundLeaderId)) {
          // Tất cả người khác đã PASS -> Dọn bàn, người làm chủ vòng được đánh tự do
          tableCombo = null;
          lastPlay = null;
          passedPlayers.clear();
          currentTurnId = roundLeaderId;
          playLog.push(`🧹 [Hết vòng] Bàn được dọn sạch. ${botConfigs.find((b) => b.id === roundLeaderId)?.name} làm chủ vòng mới!`);
        } else {
          // Chuyển tới người kế tiếp chưa PASS
          let nextTurnIdx = (botConfigs.findIndex((b) => b.id === currentTurnId) + 1) % botConfigs.length;
          while (passedPlayers.has(botConfigs[nextTurnIdx].id) || hands[botConfigs[nextTurnIdx].id].length === 0) {
            nextTurnIdx = (nextTurnIdx + 1) % botConfigs.length;
          }
          currentTurnId = botConfigs[nextTurnIdx].id;
        }
      }

      expect(winnerId).not.toBeNull();
      previousWinnerId = winnerId!;

      // 6. Tính điểm kết toán ván
      const winnerName = botConfigs.find((b) => b.id === winnerId)?.name || '';
      const scores = calculateRoundScores({
        players: botConfigs.map((b) => ({ id: b.id, name: b.name })),
        remainingHands: hands,
        cardsPlayedCount,
        winnerId: winnerId!,
        lastPlayedCards: winnerLastCards,
        isSamSuccess: samCallerId === winnerId,
        isSamFailed: samCallerId !== null && samCallerId !== winnerId,
        samPlayerId: samCallerId || undefined,
        denLangPlayerId: potentialDenLang ? potentialDenLang.attackerId : undefined,
        chopEvents,
      });

      const burnedPlayers: string[] = [];
      const denLangPlayers: string[] = [];
      for (const [, detail] of Object.entries(scores)) {
        if (detail.isBurned) burnedPlayers.push(detail.playerName);
        if (detail.isDenLang) denLangPlayers.push(detail.playerName);
      }

      const hasEndedWithTwo = winnerLastCards.some((c) => c.rank === 15);

      gameResults.push({
        gameIndex: gameIdx,
        winnerId: winnerId!,
        winnerName,
        winnerCombo: analyzeCombo(winnerLastCards),
        winnerCards: winnerLastCards,
        turnsCount: turnStep,
        hasEndedWithTwo,
        chopCount: chopEvents.length,
        burnedPlayers,
        denLangPlayers,
        scores,
        openingMoves,
        playLog,
      });
    }

    // =========================================================================
    // IN BÁO CÁO TỔNG HỢP VÀ THỐNG KÊ CHI TIẾT
    // =========================================================================
    console.log('\n======================================================================');
    console.log('              KẾT QUẢ MÔ PHỎNG 50 VÁN ĐẤU GIỮA 5 BOT AI');
    console.log('======================================================================\n');

    const winCounts: Record<string, number> = {};
    let totalTurns = 0;
    let totalChops = 0;
    let totalEndedWithTwo = 0;
    let totalBurned = 0;
    let totalDenLang = 0;
    let totalSamCalls = 0;
    let totalSamWins = 0;

    for (const b of botConfigs) {
      winCounts[b.name] = 0;
    }

    for (const res of gameResults) {
      winCounts[res.winnerName] = (winCounts[res.winnerName] || 0) + 1;
      totalTurns += res.turnsCount;
      totalChops += res.chopCount;
      if (res.hasEndedWithTwo) totalEndedWithTwo++;
      totalBurned += res.burnedPlayers.length;
      totalDenLang += res.denLangPlayers.length;

      const samInfo = res.playLog.find((l) => l.includes('BÁO SÂM!'));
      if (samInfo) {
        totalSamCalls++;
        if (samInfo.includes(res.winnerName)) totalSamWins++;
      }

      console.log(`Ván ${res.gameIndex.toString().padStart(2, ' ')}: Thắng: ${res.winnerName.padEnd(20, ' ')} | Nước kết: [${res.winnerCombo?.type} rank ${res.winnerCombo?.highestRank}] | Số lượt: ${res.turnsCount.toString().padStart(2, ' ')} | Chặt: ${res.chopCount} | Cóng: ${res.burnedPlayers.length > 0 ? res.burnedPlayers.join(',') : 'Không'}${samInfo ? ' | [CÓ BÁO SÂM]' : ''}`);
    }

    console.log('\n----------------------------------------------------------------------');
    console.log('THỐNG KÊ TỔNG THỂ 50 VÁN:');
    console.log(`- Tổng số ván mô phỏng: 50`);
    console.log(`- Số lượt đánh trung bình mỗi ván: ${(totalTurns / 50).toFixed(1)} lượt`);
    console.log(`- Tỷ lệ thắng giữa các Bot:`, winCounts);
    console.log(`- Số lần Báo Sâm: ${totalSamCalls} lần (Thành công: ${totalSamWins}/${totalSamCalls})`);
    console.log(`- Số pha Chặt Heo bằng Tứ quý: ${totalChops} lần`);
    console.log(`- Số ván về bằng Heo 2 (bị phạt 5 lá nhưng vẫn thắng): ${totalEndedWithTwo} ván`);
    console.log(`- Số lượt bị Cóng (cháy 14 lá): ${totalBurned} lượt`);
    console.log(`- Số lượt bị Đền Làng: ${totalDenLang} lượt`);
    console.log('----------------------------------------------------------------------\n');

    // Kiểm tra tính hợp lệ cơ bản
    expect(gameResults.length).toBe(50);
    expect(totalDenLang).toBe(0); // Bot tuyệt đối không được phạm luật đền làng
  });
});
