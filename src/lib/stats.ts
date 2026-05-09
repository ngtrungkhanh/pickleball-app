import { GUEST_ID, isGuestId, isRankingMatch, loserFineCount } from './guest';

type StatPlayer = {
  id: string;
  name: string;
  active?: boolean;
  [key: string]: unknown;
};

type StatMatch = {
  id?: unknown;
  win_1?: unknown;
  win_2?: unknown;
  lose_1?: unknown;
  lose_2?: unknown;
  win_score?: unknown;
  lose_score?: unknown;
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

function numberValue(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function matchTime(match: StatMatch) {
  return new Date(String(match.date || '')).getTime() || 0;
}

function resultForPlayer(match: StatMatch, playerId: string) {
  return match.win_1 === playerId || match.win_2 === playerId ? 'W' : 'L';
}

function scoreDiffForPlayer(match: StatMatch, playerId: string) {
  const winScore = numberValue(match.win_score);
  const loseScore = numberValue(match.lose_score);
  return resultForPlayer(match, playerId) === 'W' ? winScore - loseScore : loseScore - winScore;
}

function partnerForPlayer(match: StatMatch, playerId: string) {
  const partnerId = resultForPlayer(match, playerId) === 'W'
    ? (match.win_1 === playerId ? match.win_2 : match.win_1)
    : (match.lose_1 === playerId ? match.lose_2 : match.lose_1);
  return typeof partnerId === 'string' && !isGuestId(partnerId) ? partnerId : '';
}

function opponentIdsForPlayer(match: StatMatch, playerId: string) {
  const opponents = resultForPlayer(match, playerId) === 'W'
    ? [match.lose_1, match.lose_2]
    : [match.win_1, match.win_2];
  return opponents.filter((id): id is string => typeof id === 'string' && !isGuestId(id));
}

function countCurrentStreak(results: string[]) {
  const first = results[0];
  if (!first) return { result: '', count: 0 };
  let count = 0;
  for (const r of results) {
    if (r !== first) break;
    count++;
  }
  return { result: first, count };
}

function countAlternations(results: string[]) {
  let count = 0;
  for (let i = 1; i < results.length; i++) {
    if (results[i] !== results[i - 1]) count++;
  }
  return count;
}

function seededIndex(seed: string, length: number) {
  if (length <= 1) return 0;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % length;
}

function pickSeeded(options: string[], seed: string) {
  return options[seededIndex(seed, options.length)] || options[0] || '';
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

const FORM_LABELS: Record<string, string> = {
  WWWWW: "Hủy diệt",
  WWWWL: "Quá cháy",
  WWWLW: "Vào guồng",
  WWWLL: "Hồi sinh mạnh",
  WWLWW: "Đang hăng",
  WWLWL: "Giữ nhịp xanh",
  WWLLW: "Vừa bật lại",
  WWLLL: "Leo khỏi đáy",
  WLWWW: "Vấp nhẹ",
  WLWWL: "Chệch nhịp nhẹ",
  WLWLW: "Thắng thua đan xen",
  WLWLL: "Có dấu hồi",
  WLLWW: "Vừa tỉnh nhịp",
  WLLWL: "Tín hiệu xanh",
  WLLLW: "Le lói",
  WLLLL: "Cứu một nhịp",
  LWWWW: "Đứt mạch thắng",
  LWWWL: "Hạ nhiệt nhẹ",
  LWWLW: "Chưa ổn định",
  LWWLL: "Vừa hụt hơi",
  LWLWW: "Khựng nhẹ",
  LWLWL: "Lúc sáng lúc tối",
  LWLLW: "Khó đoán",
  LWLLL: "Chông chênh",
  LLWWW: "Tụt nhịp",
  LLWWL: "Trượt form",
  LLWLW: "Cứu chưa kịp",
  LLWLL: "Sa sút",
  LLLWW: "Rơi phong độ",
  LLLWL: "Lao dốc",
  LLLLW: "Đỏ kéo dài",
  LLLLL: "Khủng hoảng",
};

type InsightCategory =
  | 'turn'
  | 'streak'
  | 'score'
  | 'volatile'
  | 'trend'
  | 'partner'
  | 'opponent'
  | 'fine'
  | 'activity'
  | 'fallback';

type InsightCandidate = {
  text: string;
  category: InsightCategory;
  score: number;
};

function createInsightCandidates({
  playerId,
  playerMatches,
  rankingMatches,
  players,
}: {
  playerId: string;
  playerMatches: StatMatch[];
  rankingMatches: StatMatch[];
  players: StatPlayer[];
}) {
  const recentMatches = playerMatches.slice(0, 5);
  const previousMatches = playerMatches.slice(5, 10);
  const recent = recentMatches.map(m => resultForPlayer(m, playerId));
  const previous = previousMatches.map(m => resultForPlayer(m, playerId));
  const pattern = recent.join('');
  const recentWins = recent.filter(r => r === 'W').length;
  const previousWins = previous.filter(r => r === 'W').length;
  const last3 = recent.slice(0, 3);
  const last3Wins = last3.filter(r => r === 'W').length;
  const { result: streakResult, count: streakCount } = countCurrentStreak(recent);
  const diffs = recentMatches.map(m => scoreDiffForPlayer(m, playerId));
  const avgDiff = diffs.length ? diffs.reduce((sum, diff) => sum + diff, 0) / diffs.length : 0;
  const closeGames = diffs.filter(diff => Math.abs(diff) <= 2).length;
  const closeWins = diffs.filter(diff => diff > 0 && diff <= 2).length;
  const closeLosses = diffs.filter(diff => diff < 0 && diff >= -2).length;
  const blowoutWins = diffs.filter(diff => diff >= 5).length;
  const blowoutLosses = diffs.filter(diff => diff <= -5).length;
  const alternations = countAlternations(recent);
  const seedBase = [
    playerId,
    pattern,
    String(playerMatches[0]?.id || ''),
    String(playerMatches[0]?.date || ''),
  ].join('|');
  const candidates: InsightCandidate[] = [];

  const add = (category: InsightCategory, score: number, options: string[], salt: string) => {
    candidates.push({ category, score, text: pickSeeded(options, `${seedBase}|${category}|${salt}`) });
  };

  if (recent.length < 5) {
    add('fallback', 100, [
      'Cần thêm vài trận',
      'Dữ liệu còn mỏng',
      'Chưa lộ bài nhiều',
      'Đánh thêm rồi tính',
      'Form còn đang giấu',
      'Chưa đủ mẫu đẹp',
    ], 'short-sample');
    return { candidates, pattern, recent };
  }

  if (last3Wins === 3 && recentWins <= 3) {
    add('turn', 98, [
      'Ba trận mới kéo lại',
      'Cuối form đang sáng',
      'Mới hồi lại nhịp',
      'Đà mới đang lên',
      'Đuôi form có sáng',
      'Cú quay xe đẹp',
      'Gần đây xanh hơn',
      'Mới thắng lại mượt',
    ], 'last3-recover');
  }
  if (last3Wins === 0 && recentWins >= 2) {
    add('turn', 98, [
      'Cuối form hơi tối',
      'Gần đây hơi hụt',
      'Mới đây chững lại',
      'Nhịp mới đang rơi',
      'Đà cuối hơi lệch',
      'Mới tụt khá rõ',
      'Game mới hơi đuối',
    ], 'last3-drop');
  }
  if (pattern === 'WLLLL') {
    add('turn', 96, [
      'Vừa cắt đà đỏ',
      'Một trận cứu mood',
      'Mới kéo lại điểm',
      'Vừa thở được chút',
      'Có tín hiệu xanh',
    ], 'cut-red');
  }
  if (pattern === 'LWWWW') {
    add('turn', 96, [
      'Vừa mất chuỗi đẹp',
      'Vẫn còn nền tốt',
      'Một đỏ chưa sao',
      'Mạch xanh vừa khựng',
      'Nền form vẫn ổn',
    ], 'lost-streak');
  }

  if (streakCount >= 3) {
    if (streakResult === 'W') {
      add('streak', 94 + streakCount, [
        'Chuỗi xanh đang bén',
        'Đà thắng còn nóng',
        'Mạch thắng chưa nguội',
        'Xanh liền nhìn thích',
        'Nhịp thắng khá mượt',
        'Đang chạy rất êm',
        'Vào guồng thấy rõ',
        'Thắng đều tay quá',
        'Đà xanh khá chắc',
        'Mạch thắng có lực',
        'Game mới rất sáng',
        'Đang giữ nhiệt tốt',
        'Thắng liền có nét',
        'Phong độ đang thơm',
      ], `win-streak-${streakCount}`);
    } else {
      add('streak', 94 + streakCount, [
        'Cần cắt đà đỏ',
        'Đèn đỏ hơi dai',
        'Nhịp thua kéo dài',
        'Cần một trận gỡ',
        'Mood đang hơi thấp',
        'Đà rơi cần phanh',
        'Đỏ liền hơi căng',
        'Cần bật lại sớm',
        'Game đỏ hơi nhiều',
        'Mạch thua cần khóa',
        'Cần kéo mood lên',
        'Phong độ hơi lạnh',
        'Cần thắng để thở',
      ], `loss-streak-${streakCount}`);
    }
  }

  if (closeGames >= 3) {
    add('score', 90, [
      'Toàn game nghẹt thở',
      'Game nào cũng căng',
      'Hay kéo tới cuối',
      'Điểm số rất sít',
      'Cửa thắng khá mỏng',
      'Set nào cũng mệt',
      'Drama hơi nhiều',
      'Không cho ai thở',
      'Kèo nào cũng sát',
      'Điểm cứ dí nhau',
      'Toàn trận đau tim',
      'Thắng thua sát mép',
    ], 'close-games');
  }
  if (closeWins >= 2) {
    add('score', 89, [
      'Thắng sát khá lì',
      'Ăn sát vẫn chắc',
      'Sát nút vẫn xanh',
      'Bản lĩnh phút cuối',
      'Kèo căng vẫn qua',
      'Cửa hẹp vẫn chui',
      'Lì đòn đoạn cuối',
      'Điểm cuối khá cứng',
      'Kéo sát vẫn thắng',
      'Chốt game khá tỉnh',
      'Thắng kiểu chịu lực',
      'Sát nút mà bén',
    ], 'close-wins');
  }
  if (closeLosses >= 2) {
    add('score', 88, [
      'Thua sát chưa vỡ',
      'Đỏ nhưng còn cửa',
      'Sát nút hơi tiếc',
      'Thua mà vẫn lì',
      'Thiếu chút là xanh',
      'Chưa thua quá sâu',
      'Còn cửa bật lại',
      'Đen nhẹ ở cuối',
      'Điểm sát vẫn ổn',
      'Cách thắng một nhịp',
      'Chưa hề vỡ trận',
      'Đỏ nhưng có nét',
    ], 'close-losses');
  }
  if (blowoutWins >= 2 || avgDiff >= 5) {
    add('score', 86, [
      'Ăn điểm khá sâu',
      'Thắng khá gọn tay',
      'Game thắng rất sạch',
      'Điểm xanh khá dày',
      'Áp lực khá lớn',
      'Thắng có khoảng cách',
      'Ván xanh khá nặng',
      'Đánh thắng khá thoáng',
      'Điểm kéo rất tốt',
      'Kèo thắng hơi lực',
      'Đẩy điểm khá xa',
      'Thắng không lăn tăn',
    ], 'dominance');
  }
  if (blowoutLosses >= 2 || avgDiff <= -5) {
    add('score', 86, [
      'Điểm đang hơi xa',
      'Bị kéo cách điểm',
      'Game thua hơi sâu',
      'Cần giữ điểm hơn',
      'Khoảng cách hơi rộng',
      'Thua điểm hơi nặng',
      'Đang mất nhiều điểm',
      'Cần kéo sát lại',
      'Ván đỏ hơi sâu',
      'Điểm rơi hơi nhanh',
      'Bị bứt hơi sớm',
    ], 'negative-diff');
  }

  if (alternations >= 4) {
    add('volatile', 84, [
      'Form như công tắc',
      'Bật tắt liên tục',
      'Lên xuống hơi gắt',
      'Nhịp chưa chịu yên',
      'Vừa sáng vừa chập',
      'Khó đoán thật sự',
      'Thắng thua xoay vòng',
      'Phong độ nhấp nháy',
      'Lúc mượt lúc khựng',
      'Vừa bay vừa rơi',
      'Đang hơi khó đọc',
      'Bảng điện hơi loạn',
    ], 'high-alternation');
  } else if (alternations >= 3) {
    add('volatile', 78, [
      'Nhịp đánh chưa đều',
      'Lên xuống liên tục',
      'Thắng thua cứ đan',
      'Vẫn hơi khó đọc',
      'Form còn lắc nhẹ',
      'Nhịp chưa vào khuôn',
    ], 'mid-alternation');
  }

  if (previous.length >= 5) {
    const deltaWins = recentWins - previousWins;
    const recentPrevDiff = previousMatches
      .map(m => scoreDiffForPlayer(m, playerId))
      .reduce((sum, diff) => sum + diff, 0) / previousMatches.length;
    if (deltaWins >= 2 || avgDiff - recentPrevDiff >= 4) {
      add('trend', 82, [
        'Phong độ bật rõ',
        'Đà mới tốt hơn',
        'Đang tiến từng chút',
        'Nhịp cũ bị vượt',
        'Mới kéo lại điểm',
        'Đang nhích lên nhẹ',
        'Form mới sáng hơn',
        'Cú cải thiện rõ',
      ], 'trend-up');
    } else if (deltaWins <= -2 || avgDiff - recentPrevDiff <= -4) {
      add('trend', 82, [
        'Nhịp trước đang rơi',
        'Đà trước bị hụt',
        'Chưa thoát vùng xám',
        'Đang tụt khỏi nền',
        'Nền cũ hơi lung lay',
        'Cần giữ lại nhịp',
      ], 'trend-down');
    } else if (recentWins >= 3) {
      add('trend', 72, [
        'Giữ nền khá chắc',
        'Nhịp ổn định dần',
        'Vẫn giữ được nhiệt',
        'Nền form khá ổn',
      ], 'trend-stable-good');
    }
  }

  const recentPartners = recentMatches.map(m => partnerForPlayer(m, playerId)).filter(Boolean);
  const partnerCounts = new Map<string, { total: number; wins: number }>();
  recentMatches.forEach(match => {
    const partnerId = partnerForPlayer(match, playerId);
    if (!partnerId) return;
    const stat = partnerCounts.get(partnerId) || { total: 0, wins: 0 };
    stat.total++;
    if (resultForPlayer(match, playerId) === 'W') stat.wins++;
    partnerCounts.set(partnerId, stat);
  });
  const uniquePartners = new Set(recentPartners).size;
  const bestRecentPartner = Array.from(partnerCounts.values()).sort((a, b) => b.total - a.total || b.wins - a.wins)[0];
  if (uniquePartners >= 4) {
    add('partner', 70, [
      'Partner đổi liên tục',
      'Đổi cặp hơi loạn',
      'Cặp kèo hơi xoay',
      'Đang thử nhiều bài',
      'Chưa ổn định cặp',
      'Partner xoay khá nhiều',
    ], 'partner-many');
  } else if (bestRecentPartner && bestRecentPartner.total >= 3 && bestRecentPartner.wins / bestRecentPartner.total >= 0.67) {
    add('partner', 74, [
      'Đổi cặp vẫn ổn',
      'Vào nhịp khá nhanh',
      'Phối hợp đang mượt',
      'Ít đổi cặp hơn',
      'Nhịp đôi khá tốt',
      'Đánh đôi khá vào',
    ], 'partner-good');
  } else if (bestRecentPartner && bestRecentPartner.total >= 3 && bestRecentPartner.wins / bestRecentPartner.total <= 0.34) {
    add('partner', 70, [
      'Phối hợp chưa đều',
      'Cần tìm nhịp đôi',
      'Cặp kèo hơi lệch',
      'Nhịp đôi chưa mượt',
      'Đánh đôi còn chao',
    ], 'partner-rough');
  }

  const board = calculateLeaderboard(players, rankingMatches).filter(p => p.id !== GUEST_ID && p.total > 0);
  const topSize = Math.max(2, Math.ceil(board.length * 0.3));
  const bottomStart = Math.max(0, board.length - topSize);
  const topIds = new Set(board.slice(0, topSize).map(p => p.id));
  const bottomIds = new Set(board.slice(bottomStart).map(p => p.id));
  const hardMatches = recentMatches.filter(match => opponentIdsForPlayer(match, playerId).some(id => topIds.has(id))).length;
  const easierMatches = recentMatches.filter(match => {
    const opponents = opponentIdsForPlayer(match, playerId);
    return opponents.length > 0 && opponents.every(id => bottomIds.has(id));
  }).length;
  if (hardMatches >= 3 && recentWins >= 3) {
    add('opponent', 76, [
      'Gặp mạnh vẫn lì',
      'Thắng dù lịch nặng',
      'Qua kèo khó đẹp',
      'Kèo cứng vẫn qua',
      'Lịch nặng vẫn xanh',
    ], 'hard-won');
  } else if (hardMatches >= 3) {
    add('opponent', 72, [
      'Kèo gần đây khó',
      'Lịch đấu hơi gắt',
      'Bị ép lịch hơi nặng',
      'Kèo vừa rồi không nhẹ',
      'Lịch đấu khá cay',
    ], 'hard-schedule');
  }
  if (easierMatches >= 3 && recentWins >= 4) {
    add('opponent', 70, [
      'Kèo thơm xử gọn',
      'Cửa sáng tận dụng tốt',
      'Gặp dễ không phí',
      'Kèo vừa sức rất ổn',
    ], 'easy-won');
  } else if (easierMatches >= 3 && recentWins <= 2) {
    add('opponent', 70, [
      'Gặp dễ chưa tận dụng',
      'Kèo thơm hơi phí',
      'Cửa sáng chưa mở',
      'Kèo vừa sức còn chao',
    ], 'easy-missed');
  }

  const recentLosses = recent.length - recentWins;
  if (recentLosses >= 3) {
    add('fine', 66, [
      'Ví hơi rén rồi',
      'Phạt đang tăng nhanh',
      'Cần né thêm phạt',
      'Tiền phạt hơi nóng',
      'Ví cần hạ nhiệt',
      'Đỏ là ví đau',
      'Cần cứu cái ví',
    ], 'fine-pressure');
  }

  const latestAgeDays = playerMatches[0]?.date ? Math.floor((Date.now() - matchTime(playerMatches[0])) / DAY_MS) : null;
  const recentSpanDays = recentMatches.length >= 5
    ? Math.max(1, Math.floor((matchTime(recentMatches[0]) - matchTime(recentMatches[4])) / DAY_MS) + 1)
    : null;
  if (latestAgeDays !== null && latestAgeDays <= 1 && recentWins >= 3) {
    add('activity', 64, [
      'Form còn rất tươi',
      'Mới đánh đã bén',
      'Mood trận mới tốt',
      'Nhịp sân còn nóng',
    ], 'fresh-good');
  }
  if (recentSpanDays !== null && recentSpanDays <= 7) {
    add('activity', 62, [
      'Ra sân đều thật',
      'Mật độ hơi dày',
      'Đánh dày vẫn ổn',
      'Lịch chơi khá kín',
    ], 'dense-schedule');
  } else if (recentSpanDays !== null && recentSpanDays >= 30) {
    add('activity', 60, [
      'Lâu lâu mới cháy',
      'Nghỉ lâu hơi nguội',
      'Nhịp sân hơi thưa',
      'Form cần hâm lại',
    ], 'wide-schedule');
  }

  if (candidates.length === 0) {
    add('fallback', 50, [
      'Chưa lộ điểm dị',
      'Form còn đang giấu',
      'Dữ liệu chưa đủ cay',
      'Chưa thấy trend rõ',
      'Cần thêm tí drama',
      'Đánh thêm rồi tính',
    ], 'default');
  }

  return { candidates, pattern, recent };
}

function selectInsight(candidates: InsightCandidate[], seed: string) {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const categoryCount = new Map<InsightCategory, number>();
  const diverse: InsightCandidate[] = [];

  for (const candidate of sorted) {
    const count = categoryCount.get(candidate.category) || 0;
    if (count >= 2) continue;
    diverse.push(candidate);
    categoryCount.set(candidate.category, count + 1);
    if (diverse.length >= 8) break;
  }

  const bestScore = diverse[0]?.score || 0;
  const topBand = diverse.filter(candidate => candidate.score >= bestScore - 14).slice(0, 6);
  return pickSeeded(topBand.map(candidate => candidate.text), seed) || 'Chưa lộ điểm dị';
}

export function getPlayerAdvancedStats(playerId: string, matches: StatMatch[], players: StatPlayer[]) {
  const rankingMatches = matches.filter(isRankingMatch).sort((a, b) => matchTime(b) - matchTime(a));
  const playerMatches = rankingMatches.filter(m => 
    m.win_1 === playerId || m.win_2 === playerId || 
    m.lose_1 === playerId || m.lose_2 === playerId
  );

  const { candidates, pattern: formPattern, recent } = createInsightCandidates({
    playerId,
    playerMatches,
    rankingMatches,
    players,
  });
  const formComment = FORM_LABELS[formPattern] || (recent.length === 0 ? "Chưa có dữ liệu" : "Đang gom mẫu");
  const formTrend = selectInsight(candidates, `${playerId}|${formPattern}|${String(playerMatches[0]?.id || '')}|${String(playerMatches[0]?.date || '')}`);

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
