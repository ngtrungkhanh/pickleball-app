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
type MatrixRow = { player: string; partner?: string; opponent?: string; total: number; wins: number; losses: number; rate: number };
type Insight = { type: string; title?: string; text: string; icon?: string };

function ids(values: Array<string | null | undefined>) {
  return values.filter(Boolean) as string[];
}

// ELO 2.0 with Margin Multiplier and Dynamic K
export function buildElo(players: Player[], matches: Match[]) {
  const rating = new Map(players.map(p => [p.id, 1000]));
  const matchCount = new Map(players.map(p => [p.id, 0]));
  const history: Array<{ date: string; ratings: Record<string, number> }> = [];

  // Sort matches by date (oldest first) to build history
  const sortedMatches = [...matches].sort((a, b) => 
    new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()
  );

  sortedMatches.forEach(m => {
    const winners = ids([m.win_1, m.win_2]);
    const losers = ids([m.lose_1, m.lose_2]);
    if (winners.length === 0 || losers.length === 0) return;

    const winAvg = winners.reduce((s, id) => s + (rating.get(id) ?? 1000), 0) / winners.length;
    const loseAvg = losers.reduce((s, id) => s + (rating.get(id) ?? 1000), 0) / losers.length;
    
    // 1. Expected Score
    const expected = 1 / (1 + Math.pow(10, (loseAvg - winAvg) / 400));
    
    // 2. Dynamic K-Factor
    // Newbies (<20 games): K=40, Pros (>50 games): K=16, Mid: K=24
    const getK = (id: string) => {
      const count = matchCount.get(id) || 0;
      if (count < 20) return 40;
      if (count > 50) return 16;
      return 24;
    };
    const avgK = (winners.reduce((s, id) => s + getK(id), 0) + losers.reduce((s, id) => s + getK(id), 0)) / (winners.length + losers.length);

    // 3. Margin Multiplier
    const scoreDiff = Math.abs((m.win_score || 0) - (m.lose_score || 0));
    const eloDiff = winAvg - loseAvg;
    // Formula from World Football Elo Ratings
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

  return { rating, history };
}

export function getPlayerAnalysis(playerId: string, players: Player[], matches: Match[]) {
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

  // 3. Lỳ (Brave/Clutch): Close matches win rate
  const closeMatches = playerMatches.filter(m => Math.abs((m.win_score || 0) - (m.lose_score || 0)) <= 2);
  const closeWins = closeMatches.filter(m => ids([m.win_1, m.win_2]).includes(playerId)).length;
  const braveScore = closeMatches.length > 0 ? (closeWins / closeMatches.length) * 100 : 50;

  // 4. Duyên (Synergy): Average win rate of partners when playing with you
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

  // 6. Exp: Log-based (Capped at 50 matches for 100 pts)
  const expScore = stats ? Math.min(100, Math.log10(stats.total + 1) * 58.7) : 0;

  const radar = {
    attack: Math.round(attackScore),
    defense: Math.round(defenseScore),
    brave: Math.round(braveScore),
    synergy: Math.round(synergyScore),
    form: Math.round(formScore),
    experience: Math.round(expScore)
  };

  return { rank, stats, adv, recent: playerMatches.slice(0, 10), lastMatch: playerMatches[0] ?? null, streak, radar };
}

export function buildPartnerRows(players: Player[], matches: Match[]) {
  const rows: MatrixRow[] = [];
  players.forEach(player => {
    players.filter(p => p.id !== player.id).forEach(partner => {
      let total = 0;
      let wins = 0;
      matches.forEach(m => {
        const winTeam = ids([m.win_1, m.win_2]);
        const loseTeam = ids([m.lose_1, m.lose_2]);
        if (winTeam.includes(player.id) && winTeam.includes(partner.id)) { total++; wins++; }
        if (loseTeam.includes(player.id) && loseTeam.includes(partner.id)) total++;
      });
      if (total > 0) rows.push({ player: player.name, partner: partner.name, total, wins, losses: total - wins, rate: Math.round((wins / total) * 100) });
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

export function getInsights(board: any[], elo: any, matches: Match[], players: Player[]): Insight[] {
  let insights: Insight[] = [];
  if (!board || board.length === 0) return insights;

  // 1. Phân tích phong độ & ELO
  board.forEach(player => {
    const pAnalysis = getPlayerAnalysis(player.id, players, matches);
    const stats = pAnalysis.stats;
    if (!stats) return;

    // Chuỗi thắng / thua
    const streakMatch = pAnalysis.streak?.match(/^(\d+)(W|L)$/);
    if (streakMatch) {
      const count = parseInt(streakMatch[1]);
      if (streakMatch[2] === 'W' && count >= 2) {
        insights.push({ type: 'hot_streak', title: '🔥 ĐANG VÀO FORM', text: `${player.name} đang thăng hoa với chuỗi thắng ${count} trận liên tiếp! (Tổng ${stats.wins}W-${stats.losses}L)` });
      } else if (streakMatch[2] === 'L' && count >= 2) {
        insights.push({ type: 'cold_streak', title: '😔 CHUỖI ĐEN', text: `${player.name} đang gặp khủng hoảng nhẹ khi thua ${count} trận liên tiếp.` });
      }
    }

    // Tỷ lệ thắng ấn tượng
    const winRate = (stats.wins / stats.total) * 100;
    if (stats.total >= 5 && winRate >= 70) {
      insights.push({ type: 'top_elo', title: '⭐ KẺ HỦY DIỆT', text: `Với ${Math.round(winRate)}% tỉ lệ thắng, ${player.name} đang là nỗi khiếp sợ của mọi đối thủ.` });
    }
    
    // Đánh lỳ (sát nút)
    if (pAnalysis.radar.brave > 80) {
      insights.push({ type: 'hot_streak', title: '🛡️ TÂM LÝ THÉP', text: `${player.name} tỏ ra cực kỳ bản lĩnh trong các pha đôi công sát nút (Điểm Lỳ: ${pAnalysis.radar.brave}).` });
    }
  });

  // 2. Phân tích đối đầu (Cặp bài trùng & Kỵ rơ)
  const partnerRows = buildPartnerRows(players, matches);
  partnerRows.filter(r => r.total >= 3).forEach(r => {
    if (r.rate >= 80) {
      insights.push({ type: 'hot_partnership', title: '🤝 CẶP ĐÔI HOÀN HẢO', text: `Cặp đôi ${r.player} & ${r.partner} cứ đánh chung là auto win (${r.rate}% win rate)!` });
    } else if (r.rate <= 20) {
      insights.push({ type: 'cold_streak', title: '💔 DẪM CHÂN NHAU', text: `${r.player} & ${r.partner} có vẻ khắc khẩu, đánh chung toàn thua (${r.rate}% win rate).` });
    }
  });

  const oppRows = buildOpponentRows(players, matches);
  oppRows.filter(r => r.total >= 3).forEach(r => {
    if (r.rate >= 80) {
      insights.push({ type: 'hot_streak', title: '⚔️ THIÊN ĐỊCH', text: `${r.player} chính là cơn ác mộng của ${r.opponent} (${r.rate}% tỉ lệ hành hạ).` });
    } else if (r.rate <= 20) {
      insights.push({ type: 'cold_streak', title: '🛡️ KỴ RƠ NẶNG', text: `${r.player} cứ gặp ${r.opponent} là mất điện toàn tập (${r.rate}% win rate).` });
    }
  });

  // 3. Phân tích tổng quan giải đấu
  const totalFines = board.reduce((sum, p) => sum + p.money, 0);
  if (totalFines > 0) {
    const topFine = [...board].sort((a, b) => b.money - a.money)[0];
    insights.push({ type: 'top_fine', title: '💸 NHÀ TÀI TRỢ VÀNG', text: `Quỹ giải đang khá no ấm nhờ sự cống hiến ${topFine.money.toLocaleString('vi-VN')}đ từ ${topFine.name}!` });
  }

  const topElo = [...elo.rating.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topElo) {
    const playerName = players.find(p => p.id === topElo[0])?.name;
    insights.push({ type: 'top_elo', title: '👑 THỐNG TRỊ BXH', text: `${playerName} đang đứng trên đỉnh vinh quang với ${topElo[1]} ELO. Ai đủ sức hạ bệ?` });
  }
  
  if (matches.length > 10) {
     insights.push({ type: 'hot_partnership', title: '🎾 NHIỆT HUYẾT', text: `Toàn giải đã trải qua ${matches.length} trận đấu vô cùng căng thẳng và đầy cống hiến!` });
  }

  // Shuffle và Random pick 6 insights
  return insights.sort(() => Math.random() - 0.5).slice(0, 6);
}
