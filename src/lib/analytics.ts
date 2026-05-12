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

  // 6. Nhiệt huyết (Activity relative to the most active player)
  let maxMatches = 1;
  players.forEach(p => {
    const pMatches = matches.filter(m => ids([m.win_1, m.win_2, m.lose_1, m.lose_2]).includes(p.id)).length;
    if (pMatches > maxMatches) maxMatches = pMatches;
  });
  const expScore = Math.min(100, (playerMatches.length / maxMatches) * 100);

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

export function buildOpponentRows(players: Player[], matches: Match[], matchExpected: Map<string, { winProb: number, loseProb: number }>) {
  const rows: MatrixRow[] = [];
  players.forEach(player => {
    const playerAllMatches = matches.filter(m => ids([m.win_1, m.win_2, m.lose_1, m.lose_2]).includes(player.id));
    const baselinePs = calculatePS(player.id, playerAllMatches, matchExpected);

    players.filter(p => p.id !== player.id).forEach(opponent => {
      let total = 0;
      let wins = 0;
      const opponentMatches: Match[] = [];

      matches.forEach(m => {
        const winTeam = ids([m.win_1, m.win_2]);
        const loseTeam = ids([m.lose_1, m.lose_2]);
        if (winTeam.includes(player.id) && loseTeam.includes(opponent.id)) { total++; wins++; opponentMatches.push(m); }
        if (loseTeam.includes(player.id) && winTeam.includes(opponent.id)) { total++; opponentMatches.push(m); }
      });

      if (total > 0) {
        const opponentPs = calculatePS(player.id, opponentMatches, matchExpected);
        const impact = total >= 3 ? (opponentPs - baselinePs) * 100 : undefined;

        rows.push({ 
          player: player.name, 
          opponent: opponent.name, 
          total, 
          wins, 
          losses: total - wins, 
          rate: Math.round((wins / total) * 100),
          impact: impact !== undefined ? Math.round(impact) : undefined,
          baselinePs: Math.round(baselinePs * 100),
          partnerPs: Math.round(opponentPs * 100)
        });
      }
    });
  });
  return rows.sort((a, b) => b.total - a.total || b.rate - a.rate);
}

export function getName(players: Player[], id?: string | null) {
  if (!players || !Array.isArray(players)) return id || '--';
  return players.find(p => p.id === id)?.name || id || '--';
}

import { generateAdvancedInsights } from './insights';

export function getInsights(board: any[], elo: any, matches: Match[], players: Player[], matchExpected: Map<string, { winProb: number, loseProb: number }>): Insight[] {
  return generateAdvancedInsights(board, elo, matches, players, matchExpected);
}
