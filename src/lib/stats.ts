import { GUEST_ID, isGuestId, isRankingMatch, loserFineCount } from './guest';

type StatPlayer = {
  id: string;
  name: string;
  active?: boolean;
  [key: string]: unknown;
};

type StatMatch = {
  win_1?: unknown;
  win_2?: unknown;
  lose_1?: unknown;
  lose_2?: unknown;
  date?: unknown;
  deleted_at?: unknown;
  [key: string]: unknown;
};

type PrecalculatedStat = {
  player_id: string;
  wins: number | string;
  losses: number | string;
  total: number | string;
  money: number | string;
};

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function getVietnamDateParts(date: Date) {
  const shifted = new Date(date.getTime() + VIETNAM_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    date: shifted.getUTCDate(),
    day: shifted.getUTCDay() || 7,
  };
}

function getVietnamStartOfDayUtcMs(date: Date) {
  const parts = getVietnamDateParts(date);
  return Date.UTC(parts.year, parts.month, parts.date) - VIETNAM_OFFSET_MS;
}

function getVietnamWeekBoundsUtc(now = new Date()) {
  const parts = getVietnamDateParts(now);
  const startOfToday = getVietnamStartOfDayUtcMs(now);
  const start = startOfToday - (parts.day - 1) * DAY_MS;
  return { start, end: start + 7 * DAY_MS };
}

export function calculateLeaderboard(players: StatPlayer[], matches: StatMatch[], loseMoney: number = 5000, precalculatedStats?: PrecalculatedStat[]) {
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
    const rankingMatches = matches.filter(isRankingMatch);
    const fineMatches = matches.filter(m => !m.deleted_at);

    rankingMatches.forEach(m => {
      [m.win_1, m.win_2].forEach(id => {
        const playerId = typeof id === 'string' ? id : '';
        if (playerId && statsMap.has(playerId) && !isGuestId(playerId)) {
          const s = statsMap.get(playerId)!;
          s.wins++;
          s.total++;
        }
      });
      [m.lose_1, m.lose_2].forEach(id => {
        const playerId = typeof id === 'string' ? id : '';
        if (playerId && statsMap.has(playerId) && !isGuestId(playerId)) {
          const s = statsMap.get(playerId)!;
          s.losses++;
          s.total++;
        }
      });
    });

    fineMatches.forEach(m => {
      [m.lose_1, m.lose_2].forEach(id => {
        const playerId = typeof id === 'string' ? id : '';
        if (playerId && statsMap.has(playerId) && !isGuestId(playerId)) {
          const s = statsMap.get(playerId)!;
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

export function getSeasonSummaryStats(matches: StatMatch[], loseMoney: number = 5000) {
  const visibleMatches = matches.filter(m => !m.deleted_at);
  const rankingMatches = visibleMatches.filter(isRankingMatch);
  const totalMatches = rankingMatches.length;
  const totalLoseCount = visibleMatches.reduce((sum, m) => sum + loserFineCount(m), 0);
  const totalMoney = totalLoseCount * loseMoney;

  const matchDates = rankingMatches.map(m => new Date(String(m.date || '')).getTime()).sort((a, b) => a - b);
  const startDate = matchDates.length > 0 ? new Date(matchDates[0]) : null;
  const seasonDays = startDate ? Math.max(1, Math.floor((Date.now() - startDate.getTime()) / DAY_MS) + 1) : 0;

  const now = new Date();
  const startOfDay = getVietnamStartOfDayUtcMs(now);
  const { start: startOfWeek, end: endOfWeek } = getVietnamWeekBoundsUtc(now);

  const matchesThisWeek = rankingMatches.filter(m => {
    const t = new Date(String(m.date || '')).getTime();
    return t >= startOfWeek && t < endOfWeek;
  }).length;

  const latestMatch = rankingMatches.length > 0 ? new Date(String(rankingMatches[0].date || '')) : null;
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

export function getPlayerAdvancedStats(playerId: string, matches: StatMatch[], players: StatPlayer[]) {
  const rankingMatches = matches.filter(isRankingMatch);
  const playerMatches = rankingMatches.filter(m => 
    m.win_1 === playerId || m.win_2 === playerId || 
    m.lose_1 === playerId || m.lose_2 === playerId
  );

  const resultFor = (m: StatMatch) => (m.win_1 === playerId || m.win_2 === playerId ? 'W' : 'L');
  const recent = playerMatches.slice(0, 5).map(m => {
    return resultFor(m);
  });
  const previousRecent = playerMatches.slice(5, 10).map(m => resultFor(m));
  const recentWins = recent.filter(r => r === 'W').length;
  const previousWins = previousRecent.filter(r => r === 'W').length;

  let formTrend = "Chờ thêm trận";
  if (recent.length >= 5 && previousRecent.length >= 5) {
    if (recentWins > previousWins) formTrend = "Đang lên tay";
    else if (recentWins < previousWins) formTrend = "Tụt nhịp nhẹ";
    else formTrend = "Giữ nhịp ổn";
  }

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
    
    const normalizedPartnerId = typeof partnerId === 'string' ? partnerId : '';
    if (normalizedPartnerId && normalizedPartnerId !== GUEST_ID) {
      const s = partners.get(normalizedPartnerId) || { wins: 0, total: 0 };
      if (isWin) s.wins++;
      s.total++;
      partners.set(normalizedPartnerId, s);
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
      const normalizedRivalId = typeof rivalId === 'string' ? rivalId : '';
      if (normalizedRivalId && normalizedRivalId !== GUEST_ID) {
        const s = rivals.get(normalizedRivalId) || { wins: 0, losses: 0, total: 0 };
        if (isWin) s.wins++;
        if (!isWin) s.losses++;
        s.total++;
        rivals.set(normalizedRivalId, s);
      }
    });
  });

  let toughestRival = null;
  const rivalStats = Array.from(rivals.entries())
    .map(([id, s]) => ({ id, ...s, winRate: (s.wins / s.total) * 100, lossRate: (s.losses / s.total) * 100 }));
  const maxRivalMeetings = rivalStats.reduce((max, rival) => Math.max(max, rival.total), 0);
  const sortedRivals = rivalStats
    .filter(x => x.total >= 5 && x.lossRate > 50)
    .sort((a, b) => b.lossRate - a.lossRate || b.losses - a.losses || b.total - a.total);

  if (sortedRivals.length > 0) {
    toughestRival = sortedRivals[0];
  }

  let easiestRival = null;
  const sortedEasyRivals = rivalStats
    .filter(x => x.total >= 5 && x.winRate > 50)
    .sort((a, b) => b.winRate - a.winRate || b.wins - a.wins || b.total - a.total);

  if (sortedEasyRivals.length > 0) {
    easiestRival = sortedEasyRivals[0];
  }

  const getName = (id: string) => players.find(p => p.id === id)?.name || "Ẩn danh";
  const rivalFallback = (kind: 'tough' | 'easy') => {
    if (playerMatches.length < 5) {
      return kind === 'tough'
        ? { main: "Chưa lộ thiên địch", metric: "Chưa đủ mẫu", note: "Đánh thêm vài trận đã" }
        : { main: "Chưa thấy kèo thơm", metric: "Chưa đủ mẫu", note: "Đánh thêm vài trận đã" };
    }
    if (maxRivalMeetings < 3) {
      return { main: "Chưa ai đủ duyên", metric: "Gặp còn rải rác", note: "Chờ thêm kèo quen" };
    }
    if (maxRivalMeetings < 5) {
      return kind === 'tough'
        ? { main: "Drama đang tích tụ", metric: "Thêm vài trận là rõ", note: "Sắp có kết luận" }
        : { main: "Mùi kèo đang tới", metric: "Thêm vài trận là rõ", note: "Sắp có kết luận" };
    }
    return kind === 'tough'
      ? { main: "Không ngán ai", metric: "Chưa ai bắt nạt được", note: "Tạm thời rất lì" }
      : { main: "Không kèo free", metric: "Ai cũng phải đánh thật", note: "Chưa có con mồi" };
  };

  return {
    recent,
    formComment,
    formTrend,
    rivalSample: {
      playerTotal: playerMatches.length,
      maxMeetings: maxRivalMeetings,
    },
    bestPartner: bestPartner ? {
      name: getName(bestPartner.id),
      label: bestPartner.rate > 70 ? "Cạ cứng" : "Đối tác tin cậy",
      note: bestPartner.rate > 70 ? "Đánh chung rất bén" : "Cặp này khá ổn",
      ...bestPartner
    } : null,
    bestPartnerFallback: {
      main: "Chưa có cặp ăn ý",
      metric: "Đổi partner liên tục",
      note: "Chờ thêm trận chung",
    },
    toughestRival: toughestRival ? {
      name: getName(toughestRival.id),
      label: toughestRival.lossRate > 70 ? "Thiên địch" : "Kèo khó",
      note: toughestRival.lossRate > 70 ? "Gặp là hơi rén" : "Kèo này hơi mệt",
      ...toughestRival
    } : null,
    toughestRivalFallback: rivalFallback('tough'),
    easiestRival: easiestRival ? {
      name: getName(easiestRival.id),
      label: easiestRival.winRate > 70 ? "Khắc chế cứng" : "Kèo dễ",
      note: easiestRival.winRate > 70 ? "Kèo thơm quen mặt" : "Cửa sáng hơn chút",
      ...easiestRival
    } : null,
    easiestRivalFallback: rivalFallback('easy'),
  };
}
