import { calculateLeaderboard, getPlayerAdvancedStats } from './stats';

type Player = { id: string; name: string; active?: boolean };
type Match = {
  id?: string;
  date?: string;
  win_1?: string;
  win_2?: string | null;
  lose_1?: string;
  lose_2?: string | null;
  win_score?: number;
  lose_score?: number;
  season?: string;
};
type LeaderboardRow = Player & { total: number; wins: number; losses: number; winRate: number; money: number };
export type MatrixRow = { player: string; partner?: string; opponent?: string; total: number; wins: number; losses: number; rate: number; impact?: number; baselinePs?: number; partnerPs?: number };
export type Insight = { type: string; title?: string; text: string; icon?: string };

function ids(values: Array<string | null | undefined>) {
  return values.filter(Boolean) as string[];
}

export function buildElo(players: Player[], matches: Match[]) {
  const rating = new Map(players.map(p => [p.id, 1000]));
  const matchCount = new Map(players.map(p => [p.id, 0]));
  const history: Array<{ date: string; ratings: Record<string, number> }> = [];
  const matchExpected = new Map<string, { winProb: number, loseProb: number }>();

  const sortedMatches = [...matches].sort((a, b) => 
    new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()
  );

  sortedMatches.forEach(m => {
    const winners = ids([m.win_1, m.win_2]);
    const losers = ids([m.lose_1, m.lose_2]);
    if (winners.length === 0 || losers.length === 0) return;

    const winAvg = winners.reduce((s, id) => s + (rating.get(id) ?? 1000), 0) / winners.length;
    const loseAvg = losers.reduce((s, id) => s + (rating.get(id) ?? 1000), 0) / losers.length;
    
    // Expected Score
    const expected = 1 / (1 + Math.pow(10, (loseAvg - winAvg) / 400));
    
    // Save expected probs for PS calculation
    if (m.id) {
      matchExpected.set(m.id, { winProb: expected, loseProb: 1 - expected });
    }
    
    // Dynamic K-Factor
    const getK = (id: string) => {
      const count = matchCount.get(id) || 0;
      if (count < 20) return 40;
      if (count > 50) return 16;
      return 24;
    };
    const avgK = (winners.reduce((s, id) => s + getK(id), 0) + losers.reduce((s, id) => s + getK(id), 0)) / (winners.length + losers.length);

    // Margin Multiplier
    const scoreDiff = Math.abs((m.win_score || 0) - (m.lose_score || 0));
    const eloDiff = winAvg - loseAvg;
    const multiplier = Math.log(scoreDiff + 1) * (2.2 / (eloDiff * 0.001 + 2.2));
    
    const delta = avgK * (1 - expected) * multiplier;

    winners.forEach(id => {
      rating.set(id, Math.round((rating.get(id) ?? 1000) + delta));
      matchCount.set(id, (matchCount.get(id) || 0) + 1);
    });
    losers.forEach(id => {
      rating.set(id, Math.round((rating.get(id) ?? 1000) - delta));
      matchCount.set(id, (matchCount.get(id) || 0) + 1);
    });
    
    history.push({ date: m.date || '', ratings: Object.fromEntries(rating) });
  });

  return { rating, history, matchExpected };
}

// Calculate Performance Score (PS) for a set of matches for a specific player
function calculatePS(playerId: string, matches: Match[], matchExpected: Map<string, { winProb: number, loseProb: number }>) {
  if (matches.length === 0) return 0;
  let totalActual = 0;
  let totalExpected = 0;
  matches.forEach(m => {
    const isWin = ids([m.win_1, m.win_2]).includes(playerId);
    const expecteds = matchExpected.get(m.id || '');
    if (!expecteds) return;
    
    totalActual += isWin ? 1 : 0;
    totalExpected += isWin ? expecteds.winProb : expecteds.loseProb;
  });
  return (totalActual - totalExpected) / matches.length;
}

export function getPlayerAnalysis(playerId: string, players: Player[], matches: Match[], matchExpected: Map<string, { winProb: number, loseProb: number }>) {
  const board = calculateLeaderboard(players, matches);
  const typedBoard = board as LeaderboardRow[];
  const rank = typedBoard.findIndex((p) => p.id === playerId) + 1;
  const stats = typedBoard.find((p) => p.id === playerId);
  const adv = getPlayerAdvancedStats(playerId, matches, players);
  const playerMatches = matches.filter(m => ids([m.win_1, m.win_2, m.lose_1, m.lose_2]).includes(playerId));
  
  const streak = (() => {
    let count = 0;
    let type = '';
    for (const m of playerMatches) {
      const result = ids([m.win_1, m.win_2]).includes(playerId) ? 'W' : 'L';
      if (!type) type = result;
      if (result !== type) break;
      count++;
    }
    return count ? `${count}${type}` : '--';
  })();

  // 1. Công (Attack): Points scored vs Max possible (11 per match)
  const pointsScored = playerMatches.reduce((sum, m) => {
    const isWin = ids([m.win_1, m.win_2]).includes(playerId);
    return sum + (isWin ? (m.win_score || 0) : (m.lose_score || 0));
  }, 0);
  const attackScore = playerMatches.length > 0 ? (pointsScored / (playerMatches.length * 11)) * 100 : 0;

  // 2. Thủ (Defense): Points conceded
  const pointsConceded = playerMatches.reduce((sum, m) => {
    const isWin = ids([m.win_1, m.win_2]).includes(playerId);
    return sum + (isWin ? (m.lose_score || 0) : (m.win_score || 0));
  }, 0);
  const defenseScore = playerMatches.length > 0 ? Math.max(0, 100 - (pointsConceded / (playerMatches.length * 11)) * 100) : 0;

  // 3. Bản lĩnh (Clutch/Carry): Calculate overall Performance Score
  const overallPS = calculatePS(playerId, playerMatches, matchExpected);
  // Map PS (which is usually between -0.3 and +0.3) to a 0-100 scale.
  // PS of 0 = 50. PS of +0.2 = 90. PS of -0.2 = 10.
  const braveScore = Math.max(0, Math.min(100, 50 + (overallPS * 200)));

  // 4. Phối hợp (Synergy): Average win rate of partners when playing with you
  const partnerStats = new Map<string, { total: number, wins: number }>();
  playerMatches.forEach(m => {
    const winTeam = ids([m.win_1, m.win_2]);
    const loseTeam = ids([m.lose_1, m.lose_2]);
    const isWin = winTeam.includes(playerId);
    const partnerId = isWin ? winTeam.find(id => id !== playerId) : loseTeam.find(id => id !== playerId);
    if (partnerId) {
      const curr = partnerStats.get(partnerId) || { total: 0, wins: 0 };
      partnerStats.set(partnerId, { total: curr.total + 1, wins: curr.wins + (isWin ? 1 : 0) });
    }
  });
  let totalWR = 0;
  let pCount = 0;
  partnerStats.forEach(s => { totalWR += (s.wins / s.total) * 100; pCount++; });
  const synergyScore = pCount > 0 ? totalWR / pCount : 50;

  // 5. Form (Recent): Last 5 matches win rate
  const last5 = playerMatches.slice(0, 5);
  const last5Wins = last5.filter(m => ids([m.win_1, m.win_2]).includes(playerId)).length;
  const formScore = last5.length > 0 ? (last5Wins / last5.length) * 100 : 50;

  // 6. Nhiệt huyết (Activity in last 7 days)
  const now = new Date();
  const last7DaysDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const recentMatches = playerMatches.filter(m => new Date(m.date || '') >= last7DaysDate);
  // 10 matches in a week is 100%
  const expScore = Math.min(100, (recentMatches.length / 10) * 100);

  const radar = {
    attack: Math.round(attackScore),
    defense: Math.round(defenseScore),
    brave: Math.round(braveScore),
    synergy: Math.round(synergyScore),
    form: Math.round(formScore),
    experience: Math.round(expScore)
  };

  return { rank, stats, adv, recent: playerMatches.slice(0, 10), lastMatch: playerMatches[0] ?? null, streak, radar, overallPS };
}

export function buildPartnerRows(players: Player[], matches: Match[], matchExpected: Map<string, { winProb: number, loseProb: number }>) {
  const rows: MatrixRow[] = [];
  players.forEach(player => {
    // A's Baseline PS
    const playerAllMatches = matches.filter(m => ids([m.win_1, m.win_2, m.lose_1, m.lose_2]).includes(player.id));
    const baselinePs = calculatePS(player.id, playerAllMatches, matchExpected);

    players.filter(p => p.id !== player.id).forEach(partner => {
      let total = 0;
      let wins = 0;
      const partnerMatches: Match[] = [];

      matches.forEach(m => {
        const winTeam = ids([m.win_1, m.win_2]);
        const loseTeam = ids([m.lose_1, m.lose_2]);
        if (winTeam.includes(player.id) && winTeam.includes(partner.id)) { total++; wins++; partnerMatches.push(m); }
        else if (loseTeam.includes(player.id) && loseTeam.includes(partner.id)) { total++; partnerMatches.push(m); }
      });

      if (total > 0) {
        // A+B Team PS
        const partnerPs = calculatePS(player.id, partnerMatches, matchExpected);
        // Impact of B on A
        const impact = total >= 3 ? (partnerPs - baselinePs) * 100 : undefined;

        rows.push({ 
          player: player.name, 
          partner: partner.name, 
          total, 
          wins, 
          losses: total - wins, 
          rate: Math.round((wins / total) * 100),
          impact: impact !== undefined ? Math.round(impact) : undefined,
          baselinePs: Math.round(baselinePs * 100),
          partnerPs: Math.round(partnerPs * 100)
        });
      }
    });
  });
  return rows.sort((a, b) => b.rate - a.rate || b.total - a.total);
}

export function buildOpponentRows(players: Player[], matches: Match[]) {
  const rows: MatrixRow[] = [];
  players.forEach(player => {
    players.filter(p => p.id !== player.id).forEach(opponent => {
      let total = 0;
      let wins = 0;
      matches.forEach(m => {
        const winTeam = ids([m.win_1, m.win_2]);
        const loseTeam = ids([m.lose_1, m.lose_2]);
        if (winTeam.includes(player.id) && loseTeam.includes(opponent.id)) { total++; wins++; }
        if (loseTeam.includes(player.id) && winTeam.includes(opponent.id)) total++;
      });
      if (total > 0) rows.push({ player: player.name, opponent: opponent.name, total, wins, losses: total - wins, rate: Math.round((wins / total) * 100) });
    });
  });
  return rows.sort((a, b) => b.total - a.total || b.rate - a.rate);
}

export function getName(players: Player[], id?: string | null) {
  if (!players || !Array.isArray(players)) return id || '--';
  return players.find(p => p.id === id)?.name || id || '--';
}

export function getInsights(board: any[], elo: any, matches: Match[], players: Player[], matchExpected: Map<string, { winProb: number, loseProb: number }>): Insight[] {
  const insights: Insight[] = [];
  if (!board || board.length === 0) return insights;

  // 15 Triggers x ~5 variations
  const addInsight = (type: string, title: string, texts: string[]) => {
    const randomText = texts[Math.floor(Math.random() * texts.length)];
    insights.push({ type, title, text: randomText });
  };

  board.forEach(player => {
    const pAnalysis = getPlayerAnalysis(player.id, players, matches, matchExpected);
    const stats = pAnalysis.stats;
    if (!stats) return;

    // 1. Hot Streak
    const streakMatch = pAnalysis.streak?.match(/^(\d+)(W|L)$/);
    if (streakMatch && streakMatch[2] === 'W' && parseInt(streakMatch[1]) >= 3) {
      const c = streakMatch[1];
      addInsight('hot_streak', '🔥 ĐANG VÀO FORM', [
        `${player.name} đang cực cháy với chuỗi ${c} trận bất bại. Chạm vào là bỏng tay!`,
        `Thắng ${c} trận liên tiếp, ${player.name} dường như đã tìm ra công thức chiến thắng.`,
        `Phong độ của ${player.name} đang ở đỉnh cao, ${c} đối thủ gần nhất đều phải ôm hận.`,
        `${player.name} đang thăng hoa với chuỗi thắng ${c} trận. Hãy xem ai có thể cản bước!`,
        `Máy ghi điểm mang tên ${player.name} đã thông nòng với ${c} chiến thắng liên tiếp.`
      ]);
    }

    // 2. Cold Streak
    if (streakMatch && streakMatch[2] === 'L' && parseInt(streakMatch[1]) >= 3) {
      const c = streakMatch[1];
      addInsight('cold_streak', '😔 CHUỖI ĐEN', [
        `${player.name} đang gặp khủng hoảng nhẹ khi để thua ${c} trận liên tiếp.`,
        `Cần một liệu pháp tâm lý cho ${player.name} sau chuỗi ${c} trận toàn hòa và thua.`,
        `${player.name} đang lạc lối với ${c} trận thua. Đã đến lúc đổi phong thủy?`,
        `Có vẻ ${player.name} đang bị vận đen đeo bám suốt ${c} trận qua.`,
        `Chuỗi ${c} trận không biết mùi chiến thắng. ${player.name} cần một trận đấu gỡ gạc lại danh dự!`
      ]);
    }

    // 3. Kẻ Hủy Diệt (Top WR >= 70%, >= 8 matches)
    const winRate = (stats.wins / stats.total) * 100;
    if (stats.total >= 8 && winRate >= 70) {
      addInsight('top_performance', '⭐ KẺ HỦY DIỆT', [
        `Với ${Math.round(winRate)}% tỉ lệ thắng, ${player.name} đang là nỗi khiếp sợ của giải đấu.`,
        `Ra sân là auto win! Tỉ lệ thắng ${Math.round(winRate)}% chứng minh ${player.name} đang out trình.`,
        `Hiệu suất ${Math.round(winRate)}% của ${player.name} là một con số mà ai cũng khao khát.`,
        `${player.name} đang thống trị sân bóng với ${Math.round(winRate)}% chiến thắng. Đẳng cấp quá khác biệt.`,
        `Không thể cản phá! ${player.name} càn quét mọi đối thủ với tỉ lệ thắng ${Math.round(winRate)}%.`
      ]);
    }

    // 4. Đang chật vật (WR <= 30%, >= 5 matches)
    if (stats.total >= 5 && winRate <= 30) {
      addInsight('bad_performance', '📉 ĐANG CHẬT VẬT', [
        `Tỉ lệ thắng ${Math.round(winRate)}% cho thấy ${player.name} cần xem lại chiến thuật của mình.`,
        `Có vẻ ${player.name} vẫn đang trong giai đoạn làm quen sân bãi (WR: ${Math.round(winRate)}%).`,
        `Chỉ đạt ${Math.round(winRate)}% tỉ lệ thắng, ${player.name} cần tập trung cao độ hơn ở các trận tới.`,
        `${player.name} đang là mỏ điểm của giải đấu với mức winrate khiêm tốn ${Math.round(winRate)}%.`,
        `Báo động đỏ cho ${player.name} khi tỉ lệ thắng chỉ quanh quẩn ở mức ${Math.round(winRate)}%.`
      ]);
    }

    // 5. Cày cuốc (>= 15 matches)
    if (stats.total >= 15) {
      addInsight('hard_worker', '💪 ONG CHĂM CHỈ', [
        `Đã ra sân ${stats.total} trận! Nhiệt huyết của ${player.name} thực sự đáng nể.`,
        `${player.name} không bỏ lỡ một buổi nào với thành tích cày ải ${stats.total} trận.`,
        `Thể lực vô cực! ${player.name} đã bào mòn sân bóng suốt ${stats.total} trận.`,
        `${player.name} chính là linh hồn của phong trào với ${stats.total} lần xỏ giày ra sân.`,
        `Bền bỉ như một cỗ máy, ${player.name} đã thi đấu tổng cộng ${stats.total} trận.`
      ]);
    }

    // 6. Clutch King (High Bản lĩnh)
    if (pAnalysis.radar.brave >= 80 && stats.total >= 5) {
      addInsight('clutch_king', '👑 ÔNG VUA BẢN LĨNH', [
        `${player.name} luôn biết cách tỏa sáng ở những thời khắc khó khăn nhất với điểm Bản lĩnh đạt ${pAnalysis.radar.brave}/100.`,
        `Chuyên gia diệt gã khổng lồ! ${player.name} cực kỳ nguy hiểm khi nằm ở cửa dưới (Bản lĩnh: ${pAnalysis.radar.brave}đ).`,
        `Bản lĩnh thi đấu của ${player.name} là không thể đùa được (${pAnalysis.radar.brave}đ), luôn vượt qua mọi kỳ vọng.`,
        `${player.name} có một cái đầu lạnh, chuyên gia lật kèo và gánh tạ với chỉ số Bản lĩnh chót vót ${pAnalysis.radar.brave}/100.`,
        `Tinh thần thép giúp ${player.name} đạt điểm Bản lĩnh ${pAnalysis.radar.brave}đ. Càng áp lực đánh càng hay.`
      ]);
    }
  });

  const partnerRows = buildPartnerRows(players, matches, matchExpected);
  
  // 7. Cặp đôi hoàn hảo (WR >= 75%, impact positive, total >= 3)
  partnerRows.filter(r => r.total >= 3 && r.rate >= 75).slice(0, 3).forEach(r => {
    addInsight('partnership_good', '🤝 CẶP BÀI TRÙNG', [
      `Cặp đôi ${r.player} & ${r.partner} cứ ráp vào nhau là có ${r.rate}% win rate (thắng ${r.wins}/${r.total} trận). Phép thuật là đây!`,
      `Sự bọc lót giữa ${r.player} và ${r.partner} đạt độ hoàn hảo, tỉ lệ thắng lên tới ${r.rate}% sau ${r.total} trận.`,
      `Không một kẽ hở! ${r.player} & ${r.partner} đang là cặp đôi ăn ý nhất giải (thắng ${r.wins} trong ${r.total} trận).`,
      `${r.player} và ${r.partner} sinh ra là để đánh chung. Con số ${r.rate}% chiến thắng không hề biết nói dối.`,
      `Đối đầu với ${r.player} và ${r.partner} lúc này là một bài toán khó với winrate cặp đôi lên tới ${r.rate}% (${r.wins}W-${r.total - r.wins}L).`
    ]);
  });

  // 8. Báo thủ (Impact <= -20)
  partnerRows.filter(r => r.total >= 3 && (r.impact ?? 0) <= -20).slice(0, 3).forEach(r => {
    addInsight('anchor', '⚓ BÁO THỦ', [
      `${r.player} dường như đang bị "phong ấn" sức mạnh khi đánh cặp chung với ${r.partner} (Hiệu suất giảm ${Math.abs(r.impact!)}%).`,
      `Có vẻ ${r.partner} là một quả tạ khá nặng khiến phong độ của ${r.player} sụt giảm mạnh tới ${Math.abs(r.impact!)}% so với trung bình.`,
      `${r.player} và ${r.partner} đang giẫm chân nhau trên sân, hiệu suất cặp đôi âm nặng (-${Math.abs(r.impact!)}%).`,
      `Đánh lẻ thì hay mà cứ ghép cặp là gãy. ${r.player} & ${r.partner} kéo lùi hiệu suất của nhau tới ${Math.abs(r.impact!)}%.`,
      `Áp lực tàng hình đang đè nặng lên vai ${r.player} mỗi khi phải đánh chung với ${r.partner} (Impact: -${Math.abs(r.impact!)}%).`
    ]);
  });

  // 9. Gánh Tạ (Impact >= 20)
  partnerRows.filter(r => r.total >= 3 && (r.impact ?? 0) >= 20).slice(0, 3).forEach(r => {
    addInsight('carry_god', '🏋️ THẦN GÁNH TẠ', [
      `${r.partner} thực sự là Thần Tài, kéo phong độ của ${r.player} tăng thêm ${r.impact}% so với bình thường.`,
      `Bình thường đánh dở nhưng cứ cặp với ${r.partner} là ${r.player} auto win (Hiệu suất tăng ${r.impact}%). Quá ảo diệu!`,
      `${r.partner} đã gánh vác và bao sân quá tốt, giúp hiệu suất của ${r.player} vượt rào thêm ${r.impact}%.`,
      `Hiệu suất của ${r.player} tăng vọt thêm ${r.impact}% khi có ${r.partner} chống lưng. Một sự buff sức mạnh đáng sợ!`,
      `${r.partner} đích thị là Bùa Hộ Mệnh mà ${r.player} luôn khao khát được đánh chung (Impact: +${r.impact}%).`
    ]);
  });

  const oppRows = buildOpponentRows(players, matches);
  
  // 10. Kẻ thù truyền kiếp (WR >= 80%, >= 3 matches)
  oppRows.filter(r => r.total >= 3 && r.rate >= 80).slice(0, 3).forEach(r => {
    addInsight('rivalry_good', '⚔️ THIÊN ĐỊCH', [
      `${r.player} chính là cơn ác mộng lớn nhất của ${r.opponent} với tỉ lệ thắng áp đảo ${r.rate}% (thắng ${r.wins}/${r.total} trận).`,
      `Cứ gặp ${r.opponent} là ${r.player} lại đánh như lên đồng, giành chiến thắng tới ${r.wins} trong tổng số ${r.total} lần đụng độ.`,
      `${r.player} đã bắt bài hoàn toàn lối chơi của ${r.opponent}. Cửa thắng cho ${r.opponent} là quá hẹp (${r.rate}% thua).`,
      `Một sự hủy diệt tàn nhẫn! ${r.player} không cho ${r.opponent} cơ hội phản kháng nào (thắng ${r.wins}-${r.total - r.wins}).`,
      `${r.opponent} chắc chắn sẽ phải run sợ mỗi khi thấy ${r.player} đứng ở bên kia lưới (${r.rate}% W).`
    ]);
  });

  // 11. Nhà tài trợ
  const totalFines = board.reduce((sum, p) => sum + p.money, 0);
  if (totalFines > 0) {
    const topFine = [...board].sort((a, b) => b.money - a.money)[0];
    if (topFine.money > 50000) {
      addInsight('top_fines', '💸 NHÀ TÀI TRỢ VÀNG', [
        `Giải đấu gửi lời tri ân sâu sắc tới ${topFine.name} vì đã đóng góp ${topFine.money.toLocaleString('vi-VN')}đ tiền phạt!`,
        `Thiếu gia ${topFine.name} đang là người giữ quỹ béo mập nhất với số tiền thua lên tới ${topFine.money.toLocaleString('vi-VN')}đ.`,
        `${topFine.name} đánh bóng thì ít mà đóng họ thì nhiều. Đích thị là thẻ đen của giải!`,
        `Ban tổ chức vô cùng hoan nghênh tinh thần "Thua không quỵt" của nhà tài trợ ${topFine.name}.`,
        `Đừng buồn vì thua, ${topFine.name} hãy vui vì mình đã làm giàu cho quỹ liên hoan của cả hội!`
      ]);
    }
  }

  // 12. Top ELO
  const topElo = [...elo.rating.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topElo) {
    const playerName = players.find(p => p.id === topElo[0])?.name;
    addInsight('elo_king', '👑 THỐNG TRỊ ELO', [
      `${playerName} đang ngồi chễm chệ trên đỉnh vương quyền với ${topElo[1]} ELO. Ai sẽ lật đổ?`,
      `Mức ELO ${topElo[1]} của ${playerName} là minh chứng cho một đẳng cấp out trình hoàn toàn.`,
      `${playerName} đang cô đơn trên đỉnh cao danh vọng. Cần lắm một thế lực mới trỗi dậy!`,
      `Với ${topElo[1]} ELO, ${playerName} chính là "Trùm cuối" mà ai cũng muốn đánh bại.`,
      `BXH đang bị thống trị bởi bàn tay sắt của ${playerName}. Liệu ngai vàng có đổi chủ?`
    ]);
  }

  // Randomize and limit
  const grouped = insights.reduce((acc, item) => {
    (acc[item.type] = acc[item.type] || []).push(item);
    return acc;
  }, {} as Record<string, Insight[]>);

  const finalInsights: Insight[] = [];
  Object.values(grouped).forEach(list => {
    finalInsights.push(...list.sort(() => Math.random() - 0.5).slice(0, 1)); // Pick 1 variation per trigger
  });

  // Shuffle and pick 6 insights
  const shuffled = finalInsights.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 6);
}
