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
type Insight = { type: string; text: string; icon?: string };

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
    // matches are newest first
    for (const m of playerMatches) {
      const result = ids([m.win_1, m.win_2]).includes(playerId) ? 'W' : 'L';
      if (!type) type = result;
      if (result !== type) break;
      count++;
    }
    return count ? `${count}${type}` : '--';
  })();

  // Radar Data (0-100 scale)
  const closeMatches = playerMatches.filter(m => Math.abs((m.win_score || 0) - (m.lose_score || 0)) <= 2);
  const closeWins = closeMatches.filter(m => ids([m.win_1, m.win_2]).includes(playerId)).length;
  const clutchRate = closeMatches.length > 0 ? (closeWins / closeMatches.length) * 100 : 50;

  const dominantMatches = playerMatches.filter(m => {
    const isWinner = ids([m.win_1, m.win_2]).includes(playerId);
    const diff = Math.abs((m.win_score || 0) - (m.lose_score || 0));
    return isWinner && diff >= 5;
  });
  const dominantRate = playerMatches.length > 0 ? (dominantMatches.length / playerMatches.length) * 100 : 0;

  const radar = {
    skill: stats ? Math.min(100, stats.winRate) : 0,
    brave: clutchRate,
    power: dominantRate,
    experience: stats ? Math.min(100, (stats.total / 50) * 100) : 0,
    stability: (() => {
      if (playerMatches.length < 5) return 50;
      const last5 = playerMatches.slice(0, 5).map(m => ids([m.win_1, m.win_2]).includes(playerId) ? 1 : 0);
      const wins = last5.filter(x => x === 1).length;
      return (wins / 5) * 100;
    })()
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
  return players.find(p => p.id === id)?.name || id || '--';
}

export function getInsights(board: any[], elo: any, matches: Match[], players: Player[]): Insight[] {
  const insights: Insight[] = [];
  if (!board || board.length === 0) return insights;

  board.forEach(player => {
    const playerAnalysis = getPlayerAnalysis(player.id, players, matches);
    const streakMatch = playerAnalysis.streak?.match(/^(\d+)(W|L)$/);
    if (streakMatch && parseInt(streakMatch[1]) >= 4) {
      const count = parseInt(streakMatch[1]);
      const type = streakMatch[2];
      if (type === 'W') {
        insights.push({ type: 'hot_streak', text: `${player.name} đang thắng ${count} trận liên tiếp! 🔥` });
      } else {
        insights.push({ type: 'cold_streak', text: `${player.name} đang thua ${count} trận liên tiếp. Cố lên! 😔` });
      }
    }
  });

  const partnerRows = buildPartnerRows(players, matches);
  const hotPartners = partnerRows.filter(r => r.rate >= 75 && r.total >= 5);
  if (hotPartners.length > 0) {
    const best = hotPartners[0];
    insights.push({ type: 'hot_partnership', text: `Cặp đôi ${best.player} + ${best.partner} cực ăn ý (${best.rate}% thắng)!` });
  }

  const topFines = [...board].sort((a, b) => b.money - a.money).slice(0, 1);
  if (topFines.length > 0 && topFines[0].money > 0) {
    insights.push({ type: 'top_fine', text: `${topFines[0].name} đóng góp ${topFines[0].money.toLocaleString('vi-VN')}đ - Chủ tịch quỹ! 💸` });
  }

  const topElo = [...elo.rating.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topElo) {
    const playerName = players.find(p => p.id === topElo[0])?.name;
    insights.push({ type: 'top_elo', text: `${playerName} đang thống trị với ${topElo[1]} ELO. 👑` });
  }

  return insights.slice(0, 5);
}
