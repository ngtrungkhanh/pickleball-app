export function calculateLeaderboard(players: any[], matches: any[], loseMoney: number = 5000, precalculatedStats?: any[]) {
  const stats = players.map(p => ({
    ...p,
    wins: 0,
    losses: 0,
    total: 0,
    winRate: 0,
    money: 0
  }));

  const statsMap = new Map(stats.map(s => [s.id, s]));

  if (precalculatedStats && precalculatedStats.length > 0) {
    // Use pre-calculated stats from database
    precalculatedStats.forEach(ps => {
      if (statsMap.has(ps.player_id)) {
        const s = statsMap.get(ps.player_id)!;
        s.wins = Number(ps.wins);
        s.losses = Number(ps.losses);
        s.total = Number(ps.total);
        s.money = Number(ps.money);
      }
    });
  } else {
    // Fallback to calculating from raw matches
    matches.forEach(m => {
      [m.win_1, m.win_2].forEach(id => {
        if (id && statsMap.has(id)) {
          const s = statsMap.get(id)!;
          s.wins++;
          s.total++;
        }
      });
      [m.lose_1, m.lose_2].forEach(id => {
        if (id && statsMap.has(id)) {
          const s = statsMap.get(id)!;
          s.losses++;
          s.total++;
          s.money += loseMoney;
        }
      });
    });
  }

  stats.forEach(s => {
    s.winRate = s.total > 0 ? (s.wins / s.total) * 100 : 0;
  });

  return stats.sort((a, b) => 
    b.winRate - a.winRate || 
    b.wins - a.wins || 
    a.losses - b.losses || 
    a.name.localeCompare(b.name)
  );
}

export function getSeasonSummaryStats(matches: any[], loseMoney: number = 5000) {
  const totalMatches = matches.length;
  const totalLoseCount = totalMatches * 2;
  const totalMoney = totalLoseCount * loseMoney;

  const matchDates = matches.map(m => new Date(m.date).getTime()).sort((a, b) => a - b);
  const startDate = matchDates.length > 0 ? new Date(matchDates[0]) : null;
  const seasonDays = startDate ? Math.max(1, Math.floor((Date.now() - startDate.getTime()) / 86400000) + 1) : 0;

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = now.getDay() || 7;
  const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1).getTime();
  const endOfWeek = startOfWeek + 7 * 86400000;

  const matchesThisWeek = matches.filter(m => {
    const t = new Date(m.date).getTime();
    return t >= startOfWeek && t < endOfWeek;
  }).length;

  const latestMatch = matches.length > 0 ? new Date(matches[0].date) : null;
  let lastText = "Chưa có";
  if (latestMatch) {
    const mDate = new Date(latestMatch.getFullYear(), latestMatch.getMonth(), latestMatch.getDate()).getTime();
    const diff = Math.floor((startOfDay - mDate) / 86400000);
    
    if (diff <= 0) lastText = "Hôm nay";
    else if (diff === 1) lastText = "Hôm qua";
    else lastText = `${diff} ngày trước`;
  }

  return {
    totalMatches,
    totalMoney,
    seasonDays,
    matchesThisWeek,
    lastText,
    totalLoseCount
  };
}

export function getPlayerAdvancedStats(playerId: string, matches: any[], players: any[]) {
  const playerMatches = matches.filter(m => 
    m.win_1 === playerId || m.win_2 === playerId || 
    m.lose_1 === playerId || m.lose_2 === playerId
  );

  const recent = playerMatches.slice(0, 5).map(m => {
    const isWin = m.win_1 === playerId || m.win_2 === playerId;
    return isWin ? 'W' : 'L';
  });

  const formPattern = recent.join("");
  const formMap: Record<string, string> = {
    WWWWW:"Hủy diệt", WWWWL:"Quá cháy", WWWLW:"Chững nhẹ", WWWLL:"Hạ nhiệt",
    WWLWW:"Đang hăng", WWLWL:"Chưa ổn định", WWLLW:"Lúc hay lúc dở", WWLLL:"Rơi phong độ",
    WLWWW:"Vào guồng", WLWWL:"Chệch nhịp nhẹ", WLWLW:"Thất thường", WLWLL:"Đuối cuối chặng",
    WLLWW:"Lấy lại phong độ", WLLWL:"Gượng giữ nhịp", WLLLW:"Le lói hy vọng", WLLLL:"Lao dốc",
    LWWWW:"Tăng tốc mạnh", LWWWL:"Chững lại nhẹ", LWWLW:"Chưa ổn định", LWWLL:"Mất nhịp",
    LWLWW:"Bắt nhịp tốt", LWLWL:"Phập phù", LWLLW:"Còn hy vọng", LWLLL:"Xuống tay",
    LLWWW:"Hồi sinh mạnh", LLWWL:"Hồi sinh rồi chững", LLWLW:"Chưa chắc chắn", LLWLL:"Sa sút",
    LLLWW:"Có dấu hiệu hồi sinh", LLLWL:"Nhấp nhổm trở lại", LLLLW:"Vừa tỉnh giấc", LLLLL:"Khủng hoảng"
  };
  const formComment = formMap[formPattern] || (recent.length === 0 ? "Chưa có dữ liệu" : "Ổn định");

  const partners = new Map<string, { wins: number, total: number }>();
  playerMatches.forEach(m => {
    const isWin = m.win_1 === playerId || m.win_2 === playerId;
    const partnerId = isWin 
      ? (m.win_1 === playerId ? m.win_2 : m.win_1)
      : (m.lose_1 === playerId ? m.lose_2 : m.lose_1);
    
    if (partnerId) {
      const s = partners.get(partnerId) || { wins: 0, total: 0 };
      if (isWin) s.wins++;
      s.total++;
      partners.set(partnerId, s);
    }
  });

  let bestPartner = null;
  const sortedPartners = Array.from(partners.entries())
    .map(([id, s]) => ({ id, ...s, rate: (s.wins / s.total) * 100 }))
    .filter(x => x.total >= 5 && x.rate > 50)
    .sort((a, b) => b.rate - a.rate || b.wins - a.wins || b.total - a.total);

  if (sortedPartners.length > 0) {
    bestPartner = sortedPartners[0];
  }

  const rivals = new Map<string, { wins: number, losses: number, total: number }>();
  playerMatches.forEach(m => {
    const isWin = m.win_1 === playerId || m.win_2 === playerId;
    const enemyTeam = isWin ? [m.lose_1, m.lose_2] : [m.win_1, m.win_2];
    
    enemyTeam.forEach(rivalId => {
      if (rivalId) {
        const s = rivals.get(rivalId) || { wins: 0, losses: 0, total: 0 };
        if (isWin) s.wins++;
        if (!isWin) s.losses++;
        s.total++;
        rivals.set(rivalId, s);
      }
    });
  });

  let toughestRival = null;
  const sortedRivals = Array.from(rivals.entries())
    .map(([id, s]) => ({ id, ...s, winRate: (s.wins / s.total) * 100, lossRate: (s.losses / s.total) * 100 }))
    .filter(x => x.total >= 5 && x.lossRate > 50)
    .sort((a, b) => b.lossRate - a.lossRate || b.losses - a.losses || b.total - a.total);

  if (sortedRivals.length > 0) {
    toughestRival = sortedRivals[0];
  }

  const getName = (id: string) => players.find(p => p.id === id)?.name || "Ẩn danh";

  return {
    recent,
    formComment,
    bestPartner: bestPartner ? {
      name: getName(bestPartner.id),
      label: bestPartner.rate > 70 ? "Cạ cứng" : "Đối tác tin cậy",
      ...bestPartner
    } : null,
    toughestRival: toughestRival ? {
      name: getName(toughestRival.id),
      label: toughestRival.lossRate > 70 ? "Thiên địch" : "Kèo khó",
      ...toughestRival
    } : null
  };
}
