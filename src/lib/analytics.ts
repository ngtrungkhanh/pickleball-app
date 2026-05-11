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

const K = 24;

function ids(values: Array<string | null | undefined>) {
  return values.filter(Boolean) as string[];
}

export function buildElo(players: Player[], matches: Match[]) {
  const rating = new Map(players.map(p => [p.id, 1000]));
  const history: Array<{ date: string; ratings: Record<string, number> }> = [];

  [...matches].reverse().forEach(m => {
    const winners = ids([m.win_1, m.win_2]);
    const losers = ids([m.lose_1, m.lose_2]);
    const winAvg = winners.reduce((s, id) => s + (rating.get(id) ?? 1000), 0) / winners.length;
    const loseAvg = losers.reduce((s, id) => s + (rating.get(id) ?? 1000), 0) / losers.length;
    const expected = 1 / (1 + Math.pow(10, (loseAvg - winAvg) / 400));
    const delta = K * (1 - expected);

    winners.forEach(id => rating.set(id, Math.round((rating.get(id) ?? 1000) + delta)));
    losers.forEach(id => rating.set(id, Math.round((rating.get(id) ?? 1000) - delta)));
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
  const recent = playerMatches.slice(0, 10);
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

  return { rank, stats, adv, recent, lastMatch: playerMatches[0] ?? null, streak };
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

// Auto-generated insights from data
export function getInsights(board: any[], elo: any, matches: Match[], players: Player[]): Insight[] {
  const insights: Insight[] = [];
  
  if (!board || board.length === 0) return insights;

  // Find hot streaks
  board.forEach(player => {
    const playerAnalysis = getPlayerAnalysis(player.id, players, matches);
    const streakMatch = playerAnalysis.streak?.match(/^(\d+)(W|L)$/);
    if (streakMatch && parseInt(streakMatch[1]) >= 4) {
      const count = parseInt(streakMatch[1]);
      const type = streakMatch[2];
      if (type === 'W') {
        insights.push({
          type: 'hot_streak',
          text: `${player.name} đang thắng ${count} trận liên tiếp! 🔥`,
        });
      } else {
        insights.push({
          type: 'cold_streak',
          text: `${player.name} đang thua ${count} trận liên tiếp. Cần lấy lại tinh thần! 😔`,
        });
      }
    }
  });

  // Find dominant partnerships
  const partnerRows = buildPartnerRows(players, matches);
  const hotPartners = partnerRows.filter(r => r.rate >= 75 && r.total >= 5);
  if (hotPartners.length > 0) {
    const best = hotPartners[0];
    insights.push({
      type: 'hot_partnership',
      text: `Cặp đôi ${best.player} + ${best.partner} đang cháy với ${best.rate}% thắng (${best.total} trận)!`,
    });
  }

  // Find top fine payers
  const topFines = [...board].sort((a, b) => b.money - a.money).slice(0, 1);
  if (topFines.length > 0 && topFines[0].money > 0) {
    insights.push({
      type: 'top_fine',
      text: `${topFines[0].name} đã đóng ${topFines[0].money.toLocaleString('vi-VN')}đ tiền phạt - Thánh tài trợ! 💸`,
    });
  }

  // Find ELO leaders
  const topElo = [...elo.rating.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topElo) {
    const playerName = players.find(p => p.id === topElo[0])?.name;
    insights.push({
      type: 'top_elo',
      text: `${playerName} dẫn đầu ELO với ${topElo[1]} điểm. 👑`,
    });
  }

  // Find recent upsets (if enough data)
  const recentMatches = matches.slice(0, 20);
  const upsets = recentMatches.filter(m => {
    const scoreDiff = (m.win_score || 0) - (m.lose_score || 0);
    return scoreDiff <= 3 && scoreDiff > 0; // Close wins
  });
  if (upsets.length >= 3) {
    insights.push({
      type: 'competitive',
      text: `${upsets.length} trận gần đây kết thúc sát nút! Căng thẳng! 💪`,
    });
  }

  return insights.slice(0, 5); // Return max 5 insights
}
