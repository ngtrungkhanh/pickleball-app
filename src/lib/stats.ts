import { GUEST_ID, isGuestId, isRankingMatch, loserFineCount } from './guest';
import { calculateFineTotal, type FineRules } from './fines';

type StatPlayer = {
  id: string;
  name: string;
  active?: boolean;
  pay_fine?: boolean;
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

type LeaderboardOptions = {
  getLoseMoney?: (match: StatMatch) => number;
  shouldPayFine?: (playerId: string, match: StatMatch) => boolean;
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

function getVietnamDateKey(date: Date) {
  const parts = getVietnamDateParts(date);
  return `${parts.year}-${String(parts.month + 1).padStart(2, '0')}-${String(parts.date).padStart(2, '0')}`;
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

export function calculateLeaderboard(
  players: StatPlayer[],
  matches: StatMatch[],
  loseMoney: number = 5000,
  options: LeaderboardOptions = {},
) {
  const stats = players.map(p => ({
    ...p,
    wins: 0,
    losses: 0,
    total: 0,
    winRate: 0,
    money: 0
  }));

  const statsMap = new Map(stats.map(s => [s.id, s]));

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
    const matchLoseMoney = options.getLoseMoney?.(m) ?? loseMoney;
    [m.lose_1, m.lose_2].forEach(id => {
      const playerId = typeof id === 'string' ? id : '';
      if (playerId && statsMap.has(playerId) && !isGuestId(playerId)) {
        const player = statsMap.get(playerId)!;
        const shouldPayFine = options.shouldPayFine?.(playerId, m) ?? player.pay_fine !== false;
        if (!shouldPayFine) return;
        const s = statsMap.get(playerId)!;
        s.money += matchLoseMoney;
      }
    });
  });

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

export function getSeasonSummaryStats(matches: StatMatch[], loseMoney: number = 5000, fineRules: FineRules = {}) {
  const visibleMatches = matches.filter(m => !m.deleted_at);
  const rankingMatches = visibleMatches.filter(isRankingMatch);
  const totalMatches = rankingMatches.length;
  const totalLoseCount = visibleMatches.reduce((sum, m) => sum + loserFineCount(m), 0);
  const totalMoney = Object.keys(fineRules).length > 0
    ? calculateFineTotal(visibleMatches, { fallbackLoseMoney: loseMoney, ...fineRules })
    : totalLoseCount * loseMoney;

  const matchDates = rankingMatches.map(m => new Date(String(m.date || '')).getTime()).sort((a, b) => a - b);
  const startDate = matchDates.length > 0 ? new Date(matchDates[0]) : null;
  const seasonDays = startDate ? Math.max(1, Math.floor((Date.now() - startDate.getTime()) / DAY_MS) + 1) : 0;

  const now = new Date();
  const startOfDay = getVietnamStartOfDayUtcMs(now);
  const latestMatchTime = Math.max(0, ...rankingMatches.map(matchTime));
  const latestSessionKey = latestMatchTime > 0 ? getVietnamDateKey(new Date(latestMatchTime)) : '';
  const latestSessionMatches = latestSessionKey
    ? rankingMatches.filter(m => getVietnamDateKey(new Date(matchTime(m))) === latestSessionKey).length
    : 0;

  const latestMatch = latestMatchTime > 0 ? new Date(latestMatchTime) : null;
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
    latestSessionMatches,
    lastText,
    totalLoseCount
  };
}

const FORM_LABELS: Record<string, string> = {
  WWWWW: "Bất bại",
  WWWWL: "Đang cháy",
  WWWLW: "Vào guồng",
  WWWLL: "Bật dậy mạnh",
  WWLWW: "Phong độ cao",
  WWLWL: "Giữ nhịp xanh",
  WWLLW: "Vừa hồi lại",
  WWLLL: "Bắt đầu hồi",
  WLWWW: "Vấp nhẹ",
  WLWWL: "Chệch nhịp nhẹ",
  WLWLW: "Thắng thua xen kẽ",
  WLWLL: "Có dấu hồi",
  WLLWW: "Tỉnh giấc",
  WLLWL: "Tín hiệu xanh",
  WLLLW: "Chớm hồi",
  WLLLL: "Cắt mạch thua",
  LWWWW: "Đứt chuỗi thắng",
  LWWWL: "Hạ nhiệt nhẹ",
  LWWLW: "Hụt đà hưng phấn",
  LWWLL: "Vừa hụt hơi",
  LWLWW: "Khựng nhẹ",
  LWLWL: "Bấp bênh",
  LWLLW: "Khó đoán",
  LWLLL: "Chông chênh",
  LLWWW: "Tụt nhịp",
  LLWWL: "Trượt form",
  LLWLW: "Hụt hơi",
  LLWLL: "Sa sút",
  LLLWW: "Rơi phong độ",
  LLLWL: "Lao dốc",
  LLLLW: "Rơi tự do",
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
      'Đang gom dữ liệu',
      'Cần thêm game kiểm',
      'Chờ đủ 5 trận gần',
      'Mẫu thử còn thiếu',
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
      'Bật dậy kịp lúc',
      'Lấy lại đà thắng',
      'Vừa kịp hồi sinh',
      'Đang vào form lại',
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
      'Ba trận gần hụt hơi',
      'Đuôi form kém sắc',
      'Cần chặn đà rơi',
      'Mới chựng lại chút',
      'Khựng lại gần đây',
    ], 'last3-drop');
  }
  if (pattern === 'WLLLL') {
    add('turn', 96, [
      'Vừa cắt đà đỏ',
      'Một trận cứu mood',
      'Mới kéo lại điểm',
      'Vừa thở được chút',
      'Có tín hiệu xanh',
      'Dứt được mạch thua',
      'Phanh kịp đà rơi',
      'Trận thắng quý giá',
      'Vừa có tin vui',
      'Gỡ gạc kịp thời',
    ], 'cut-red');
  }
  if (pattern === 'LWWWW') {
    add('turn', 96, [
      'Vừa mất chuỗi đẹp',
      'Vẫn còn nền tốt',
      'Một đỏ chưa sao',
      'Mạch xanh vừa khựng',
      'Nền form vẫn ổn',
      'Chút vấp nhỏ thôi',
      'Mới đứt dây thắng',
      'Trượt chân một nhịp',
      'Vẫn trong tầm kiểm',
      'Chỉ là tai nạn nhẹ',
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
        'Lên đồng thật sự',
        'Chưa thấy điểm dừng',
        'Đánh đâu thắng đó',
        'Nhiệt đang cực cao',
        'Quá khó để cản',
        'Dây xanh rực rỡ',
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
        'Chuỗi đen khó chịu',
        'Đang bị kẹt nhịp',
        'Dây đỏ đeo bám',
        'Thời chưa tới rồi',
        'Gặp chút vận hạn',
        'Cố qua cơn bĩ cực',
        'Cần đổi phong thủy',
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
      'Tim đập thình thịch',
      'Căng như dây đàn',
      'Nín thở từng điểm',
      'Rượt đuổi tỉ số gắt',
    ], 'close-games');
  }
  if (closeWins >= 2) {
    add('score', 89, [
      'Thắng sát khá lì',
      'Ăn sát vẫn chắc',
      'Sát nút vẫn xanh',
      'Bản lĩnh phút cuối',
      'Kèo căng vẫn qua',
      'Cửa hẹp vẫn thắng',
      'Lì đòn đoạn cuối',
      'Điểm cuối khá cứng',
      'Kéo sát vẫn thắng',
      'Chốt game khá tỉnh',
      'Thắng kiểu chịu lực',
      'Sát nút mà bén',
      'Vua lội ngược dòng',
      'Lạnh lùng dứt điểm',
      'Bóp nghẹt phút chót',
      'Lì lợm ăn tiền',
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
      'Hụt chút may mắn',
      'Chưa đủ duyên ăn',
      'Kém chút lạnh lùng',
      'Thiếu một tí may',
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
      'Out trình nhẹ rồi',
      'Dễ như ăn kẹo',
      'Thắng đẹp miễn bàn',
      'Bóp nghẹt đối thủ',
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
      'Khó đuổi kịp điểm',
      'Mất thế trận sớm',
      'Cần vá lại hàng thủ',
      'Bể trận hơi nhanh',
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
      'Thất thường khó tả',
      'Lúc lên voi xuống chó',
      'Chưa biết đường nào',
      'Nghiêng ngả khó tin',
    ], 'high-alternation');
  } else if (alternations >= 3) {
    add('volatile', 78, [
      'Nhịp đánh chưa đều',
      'Lên xuống liên tục',
      'Thắng thua cứ đan',
      'Vẫn hơi khó đọc',
      'Form còn lắc nhẹ',
      'Nhịp chưa vào khuôn',
      'Chưa thực sự ổn',
      'Cần giữ nhịp hơn',
      'Hơi bị chông chênh',
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
        'Đang dần lấy lại',
        'Mới tiến bộ lên',
        'Đang vượt ngưỡng cũ',
        'Khởi sắc trông thấy',
      ], 'trend-up');
    } else if (deltaWins <= -2 || avgDiff - recentPrevDiff <= -4) {
      add('trend', 82, [
        'Nhịp trước đang rơi',
        'Đà trước bị hụt',
        'Chưa thoát vùng xám',
        'Đang tụt khỏi nền',
        'Nền cũ hơi lung lay',
        'Cần giữ lại nhịp',
        'Bị hụt hơi dần',
        'Đang chiều hướng đi xuống',
        'Đang trượt nhẹ',
        'Kém hơn đợt trước',
      ], 'trend-down');
    } else if (recentWins >= 3) {
      add('trend', 72, [
        'Giữ nền khá chắc',
        'Nhịp ổn định dần',
        'Vẫn giữ được nhiệt',
        'Nền form khá ổn',
        'Đang trụ vững vàng',
        'Giữ vững thế trận',
        'Ổn định không đổi',
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
      'Chưa chốt được cặp',
      'Thử nghiệm nhiều đội hình',
      'Xoay tua liên tục',
      'Chưa tìm được cạ',
    ], 'partner-many');
  } else if (bestRecentPartner && bestRecentPartner.total >= 3 && bestRecentPartner.wins / bestRecentPartner.total >= 0.67) {
    add('partner', 74, [
      'Đổi cặp vẫn ổn',
      'Vào nhịp khá nhanh',
      'Phối hợp đang mượt',
      'Ít đổi cặp hơn',
      'Nhịp đôi khá tốt',
      'Đánh đôi khá vào',
      'Hợp tác khá ăn ý',
      'Bắt nhịp đôi tốt',
      'Phối hợp có nét',
      'Di chuyển khá đồng đều',
    ], 'partner-good');
  } else if (bestRecentPartner && bestRecentPartner.total >= 3 && bestRecentPartner.wins / bestRecentPartner.total <= 0.34) {
    add('partner', 70, [
      'Phối hợp chưa đều',
      'Cần tìm nhịp đôi',
      'Cặp kèo hơi lệch',
      'Nhịp đôi chưa mượt',
      'Đánh đôi còn chao',
      'Chưa hiểu ý nhau',
      'Cần giao tiếp tốt hơn',
      'Giẫm chân nhẹ',
      'Chưa khớp được nhịp',
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
      'Vượt chướng ngại vật ổn',
      'Không ngán top trên',
      'Chuyên gia diệt khổng lồ',
      'Qua ải lớn trót lọt',
    ], 'hard-won');
  } else if (hardMatches >= 3) {
    add('opponent', 72, [
      'Kèo gần đây khó',
      'Lịch đấu hơi gắt',
      'Bị ép lịch hơi nặng',
      'Kèo vừa rồi không nhẹ',
      'Lịch đấu khá cay',
      'Toàn gặp thứ dữ',
      'Lịch đấu căng đét',
      'Đụng độ hàng cứng',
      'Bảng trắng lịch đen',
    ], 'hard-schedule');
  }
  if (easierMatches >= 3 && recentWins >= 4) {
    add('opponent', 70, [
      'Kèo thơm xử gọn',
      'Cửa sáng tận dụng tốt',
      'Gặp dễ không phí',
      'Kèo vừa sức rất ổn',
      'Ăn điểm nhẹ nhàng',
      'Xử lý gọn gàng',
      'Vượt ải khá êm',
    ], 'easy-won');
  } else if (easierMatches >= 3 && recentWins <= 2) {
    add('opponent', 70, [
      'Gặp dễ chưa tận dụng',
      'Kèo thơm hơi phí',
      'Cửa sáng chưa mở',
      'Kèo vừa sức còn chao',
      'Đánh rơi điểm tiếc',
      'Sẩy chân trận nhẹ',
      'Chưa tận dụng tốt',
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
      'Mòn ví quá nhanh',
      'Cái giá khá đắt',
      'Phí chồng thêm phí',
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

function sampleConfidence(total: number) {
  if (total >= 15) return 1.05;
  if (total >= 10) return 1;
  if (total >= 8) return 0.95;
  if (total >= 6) return 0.85;
  return 0.75;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function scoreDiffBonus(avgDiff: number) {
  if (avgDiff >= 5) return 8;
  if (avgDiff >= 3) return 5;
  if (avgDiff >= 1) return 2;
  if (avgDiff <= -4) return -8;
  if (avgDiff <= -2) return -6;
  return 0;
}

type PairStat = {
  id: string;
  wins: number;
  losses: number;
  total: number;
  diffs: number[];
  recent: string[];
  latestIndex: number;
  recent10Count: number;
};

function createPairStat(id: string): PairStat {
  return {
    id,
    wins: 0,
    losses: 0,
    total: 0,
    diffs: [],
    recent: [],
    latestIndex: Number.POSITIVE_INFINITY,
    recent10Count: 0,
  };
}

function pushPairResult(stat: PairStat, result: string, diff: number, index: number) {
  stat.total++;
  if (result === 'W') stat.wins++;
  if (result === 'L') stat.losses++;
  stat.diffs.push(diff);
  if (stat.recent.length < 5) stat.recent.push(result);
  stat.latestIndex = Math.min(stat.latestIndex, index);
  if (index < 10) stat.recent10Count++;
}

function partnerLabel(stat: PairStat & { rate: number; avgDiff: number }) {
  if (stat.total >= 12 && stat.rate >= 70) return "Cặp bài trùng";
  if (stat.total >= 8 && stat.rate >= 70) return "Cạ cứng";
  if (stat.total >= 5 && stat.rate >= 80) return "Hợp cạ";
  if (stat.total >= 5 && stat.avgDiff >= 4) return "Cặp có lực";
  if (stat.total >= 8 && stat.rate >= 60) return "Đồng đội tin cậy";
  return "Đối tác ổn";
}

function partnerNote(stat: PairStat & { rate: number; avgDiff: number; score: number }, seed: string) {
  const candidates: InsightCandidate[] = [];
  const add = (category: InsightCategory, score: number, options: string[], salt: string) => {
    candidates.push({ category, score, text: pickSeeded(options, `${seed}|partner|${category}|${salt}`) });
  };
  const recentWins = stat.recent.slice(0, 3).filter(r => r === 'W').length;

  if (stat.total >= 10 && stat.rate >= 70) {
    add('partner', 96, [
      'Cặp này có số má',
      'Đánh chung rất bén',
      'Ghép vào là sáng',
      'Nhìn khá ăn ý',
      'Cặp này đáng tin',
      'Độ ăn ý khá cao',
      'Đánh đôi có nghề',
      'Không phải ăn may',
      'Sample khá chắc rồi',
      'Có nền thật sự',
      'Sinergy cực kỳ tốt',
      'Bài trùng của nhau',
      'Hiểu ý nhau từng chút',
    ], 'large-good');
  }
  if (stat.total >= 5 && stat.total < 8 && stat.rate >= 80) {
    add('partner', 90, [
      'Đánh chung khá hợp',
      'Ít trận nhưng xanh',
      'Mẫu nhỏ mà thơm',
      'Cặp này có duyên',
      'Đang có mùi hợp',
      'Cần thêm trận kiểm',
      'Tín hiệu rất xanh',
      'Vừa bắt nhịp đã nổ',
      'Tiềm năng cặp này lớn',
    ], 'small-hot');
  }
  if (recentWins >= 3) {
    add('trend', 88, [
      'Gần đây rất sáng',
      'Mới đánh là xanh',
      'Đà đôi đang nóng',
      'Nhịp mới khá mượt',
      'Mấy trận mới bén',
      'Vừa ghép đã ổn',
      'Mới đi dây thắng',
      'Nhiệt cặp này đang lên',
    ], 'recent-hot');
  }
  if (stat.avgDiff >= 3) {
    add('score', 84, [
      'Thắng thường khá thoáng',
      'Điểm đôi đang lời',
      'Kèo thắng có lực',
      'Ít bị kéo sát',
      'Đẩy điểm rất tốt',
      'Game đôi khá sáng',
      'Điểm win đậm phết',
      'Cách biệt khá an toàn',
    ], 'diff-good');
  }
  if (stat.recent.filter(r => r === 'W').length >= 2 && stat.diffs.filter(diff => diff > 0 && diff <= 2).length >= 2) {
    add('score', 82, [
      'Kèo căng vẫn qua',
      'Đánh sát khá lì',
      'Chốt game khá tỉnh',
      'Cặp này chịu nhiệt',
      'Sát nút vẫn xanh',
      'Vượt bão phút cuối',
      'Bản lĩnh cặp này cao',
    ], 'clutch');
  }
  if (stat.recent10Count >= 4) {
    add('activity', 78, [
      'Đánh chung khá đều',
      'Ít đổi mà hiệu quả',
      'Có vẻ vào bài',
      'Nhịp đôi đang ổn',
      'Cặp này dễ vào guồng',
      'Tương tác khá khớp',
      'Hợp cạ ổn định',
    ], 'stable');
  }
  if (candidates.length === 0) {
    add('fallback', 60, [
      'Ổn nhưng chưa áp đảo',
      'Tin được, chưa bùng nổ',
      'Cần thêm trận xanh',
      'Đủ ổn để giữ',
      'Chưa quá cháy, vẫn được',
    ], 'default');
  }

  return selectInsight(candidates, `${seed}|partner-note|${stat.id}`);
}

function rivalLabel(stat: PairStat & { winRate: number; lossRate: number; avgDiff: number }, kind: 'tough' | 'easy') {
  if (kind === 'tough') {
    if (stat.total >= 10 && stat.lossRate >= 70) return "Kị rơ";
    if (stat.avgDiff <= -4) return "Khắc chế cứng";
    if (stat.lossRate >= 65) return "Kèo khó xơi";
    if (stat.diffs.filter(diff => diff < 0 && diff >= -2).length >= 2) return "Tiếc nuối";
    return "Dưới cơ";
  }

  if (stat.total >= 10 && stat.winRate >= 75) return "Kèo thơm";
  if (stat.avgDiff >= 4) return "Trên cơ";
  if (stat.winRate >= 75) return "Sáng cửa";
  if (stat.diffs.filter(diff => diff > 0 && diff <= 2).length >= 2) return "Nhỉnh hơn chút";
  return "Dễ thở";
}

function toughRivalNote(stat: PairStat & { lossRate: number; avgDiff: number; score: number }, seed: string) {
  const candidates: InsightCandidate[] = [];
  const add = (category: InsightCategory, score: number, options: string[], salt: string) => {
    candidates.push({ category, score, text: pickSeeded(options, `${seed}|tough|${category}|${salt}`) });
  };
  const recentLosses = stat.recent.slice(0, 3).filter(r => r === 'L').length;
  const closeLosses = stat.diffs.filter(diff => diff < 0 && diff >= -2).length;

  if (recentLosses >= 3) {
    add('streak', 94, [
      'Gần đây hơi ám',
      'Ba lần mới đỏ',
      'Cần đổi bài gấp',
      'Gặp lại hơi căng',
      'Đang bị bắt nhịp',
      'Chuỗi thua khá nhức',
      'Cần xóa dớp đen',
      'Ám ảnh mấy trận rồi',
    ], 'recent-loss');
  }
  if (stat.lossRate >= 70 && stat.total >= 8) {
    add('opponent', 92, [
      'Gặp là hơi khó thở',
      'Kèo này chưa dễ gỡ',
      'Cửa thắng đang hẹp',
      'Kèo này hơi ám',
      'Drama còn tích tụ',
      'Cần bài khác khi gặp',
      'Dớp này hơi nặng',
      'Đúng đối cứng cựa',
    ], 'high-loss');
  }
  if (stat.avgDiff <= -4) {
    add('score', 88, [
      'Điểm thường bị kéo xa',
      'Hay bị bứt điểm sớm',
      'Cần giữ điểm đầu',
      'Khoảng cách hơi đau',
      'Ván đỏ thường sâu',
    ], 'deep-loss');
  }
  if (closeLosses >= 2) {
    add('score', 90, [
      'Thua sát nên còn cửa',
      'Chỉ thiếu chút là xanh',
      'Kèo căng chưa qua',
      'Sát nút hơi tiếc',
      'Có cửa nếu chốt tốt',
      'Đánh sát mép vẫn thua',
      'Thiếu tí bứt phá',
    ], 'close-loss');
  }
  if (candidates.length === 0) {
    add('fallback', 60, [
      'Kèo này hơi mệt',
      'Cần thêm trận giải mã',
      'Gặp lại phải tỉnh',
      'Chưa dễ vượt qua',
      'Vẫn còn cửa gỡ',
    ], 'default');
  }

  return selectInsight(candidates, `${seed}|tough-note|${stat.id}`);
}

function easyRivalNote(stat: PairStat & { winRate: number; avgDiff: number; score: number }, seed: string) {
  const candidates: InsightCandidate[] = [];
  const add = (category: InsightCategory, score: number, options: string[], salt: string) => {
    candidates.push({ category, score, text: pickSeeded(options, `${seed}|easy|${category}|${salt}`) });
  };
  const recentWins = stat.recent.slice(0, 3).filter(r => r === 'W').length;
  const closeWins = stat.diffs.filter(diff => diff > 0 && diff <= 2).length;

  if (recentWins >= 3) {
    add('streak', 94, [
      'Gần đây toàn xanh',
      'Gặp lại khá sáng',
      'Mấy lần mới rất ổn',
      'Đang có vía rõ',
      'Nhịp gặp này tốt',
      'Nuốt gọn mấy trận gần',
      'Vía đối đầu đang ngon',
    ], 'recent-win');
  }
  if (stat.winRate >= 75 && stat.total >= 8) {
    add('opponent', 92, [
      'Gặp là sáng cửa hơn',
      'Kèo này khá thuận',
      'Cửa này đang có vía',
      'Gặp là dễ vào nhịp',
      'Không dễ, nhưng thuận',
      'Đúng bài nên dễ thở',
      'Đã tìm ra bài giải',
      'Tự tin khi chạm mặt',
    ], 'high-win');
  }
  if (stat.avgDiff >= 4) {
    add('score', 88, [
      'Điểm xanh thường dày',
      'Thắng hay khá thoáng',
      'Kéo điểm rất tốt',
      'Kèo thắng có lực',
      'Ít khi bị dí sát',
    ], 'diff-good');
  }
  if (closeWins >= 2) {
    add('score', 86, [
      'Thắng sát nhưng đều',
      'Kèo căng vẫn qua',
      'Sát nút vẫn xanh',
      'Chốt game khá tỉnh',
      'Kèo sát vẫn qua',
    ], 'close-win');
  }
  if (candidates.length === 0) {
    add('fallback', 60, [
      'Cửa sáng hơn chút',
      'Kèo này có nét',
      'Gặp lại khá tự tin',
      'Có vẻ khá thuận',
      'Vẫn cần giữ nhịp',
    ], 'default');
  }

  return selectInsight(candidates, `${seed}|easy-note|${stat.id}`);
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

  const partnerSeed = `${playerId}|partner|${formPattern}|${String(playerMatches[0]?.id || '')}|${String(playerMatches[0]?.date || '')}`;
  const partners = new Map<string, PairStat>();
  playerMatches.forEach((match, index) => {
    const partnerId = partnerForPlayer(match, playerId);
    if (!partnerId) return;
    const stat = partners.get(partnerId) || createPairStat(partnerId);
    pushPairResult(stat, resultForPlayer(match, playerId), scoreDiffForPlayer(match, playerId), index);
    partners.set(partnerId, stat);
  });

  const partnerStats = Array.from(partners.values()).map(stat => {
    const rate = (stat.wins / stat.total) * 100;
    const avgDiff = average(stat.diffs);
    const recentWins = stat.recent.slice(0, 3).filter(r => r === 'W').length;
    const recentBonus = recentWins >= 3 ? 8 : recentWins >= 2 ? 4 : stat.latestIndex > 9 ? -5 : 0;
    const stabilityBonus = stat.recent10Count >= 4 ? 5 : 0;
    const score = rate * sampleConfidence(stat.total)
      + stat.wins * 1.6
      + stat.total * 0.6
      + recentBonus
      + scoreDiffBonus(avgDiff)
      + stabilityBonus;

    return {
      ...stat,
      rate,
      avgDiff,
      score,
      label: partnerLabel({ ...stat, rate, avgDiff }),
      note: partnerNote({ ...stat, rate, avgDiff, score }, partnerSeed),
    };
  });

  const bestPartner = partnerStats
    .filter(stat => stat.total >= 5 && stat.rate > 50)
    .sort((a, b) => b.score - a.score || b.wins - a.wins || b.total - a.total)[0] || null;

  const rivalSeed = `${playerId}|rival|${formPattern}|${String(playerMatches[0]?.id || '')}|${String(playerMatches[0]?.date || '')}`;
  const rivals = new Map<string, PairStat>();
  playerMatches.forEach((match, index) => {
    const result = resultForPlayer(match, playerId);
    const diff = scoreDiffForPlayer(match, playerId);
    opponentIdsForPlayer(match, playerId).forEach(rivalId => {
      const stat = rivals.get(rivalId) || createPairStat(rivalId);
      pushPairResult(stat, result, diff, index);
      rivals.set(rivalId, stat);
    });
  });

  const rivalStats = Array.from(rivals.values()).map(stat => {
    const winRate = (stat.wins / stat.total) * 100;
    const lossRate = (stat.losses / stat.total) * 100;
    const avgDiff = average(stat.diffs);
    const recentWins = stat.recent.slice(0, 3).filter(r => r === 'W').length;
    const recentLosses = stat.recent.slice(0, 3).filter(r => r === 'L').length;
    const toughScore = lossRate * sampleConfidence(stat.total)
      + stat.losses * 1.6
      + stat.total * 0.6
      + (recentLosses >= 3 ? 8 : recentLosses >= 2 ? 4 : 0)
      + scoreDiffBonus(-avgDiff)
      + (stat.diffs.filter(diff => diff < 0 && diff >= -2).length >= 2 ? 4 : 0);
    const easyScore = winRate * sampleConfidence(stat.total)
      + stat.wins * 1.6
      + stat.total * 0.6
      + (recentWins >= 3 ? 8 : recentWins >= 2 ? 4 : 0)
      + scoreDiffBonus(avgDiff)
      + (stat.diffs.filter(diff => diff > 0 && diff <= 2).length >= 2 ? 4 : 0);

    return {
      ...stat,
      winRate,
      lossRate,
      avgDiff,
      toughScore,
      easyScore,
    };
  });
  const maxRivalMeetings = rivalStats.reduce((max, rival) => Math.max(max, rival.total), 0);
  const toughestRival = rivalStats
    .filter(stat => stat.total >= 5 && stat.lossRate > 50)
    .map(stat => ({
      ...stat,
      label: rivalLabel(stat, 'tough'),
      note: toughRivalNote({ ...stat, score: stat.toughScore }, rivalSeed),
    }))
    .sort((a, b) => b.toughScore - a.toughScore || b.losses - a.losses || b.total - a.total)[0] || null;

  const easiestRival = rivalStats
    .filter(stat => stat.total >= 5 && stat.winRate > 50)
    .map(stat => ({
      ...stat,
      label: rivalLabel(stat, 'easy'),
      note: easyRivalNote({ ...stat, score: stat.easyScore }, rivalSeed),
    }))
    .sort((a, b) => b.easyScore - a.easyScore || b.wins - a.wins || b.total - a.total)[0] || null;

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
      ...bestPartner,
      name: getName(bestPartner.id),
      label: bestPartner.label,
      note: bestPartner.note,
    } : null,
    bestPartnerFallback: {
      main: "Chưa có cặp ăn ý",
      metric: "Đổi partner liên tục",
      note: "Chờ thêm trận chung",
    },
    toughestRival: toughestRival ? {
      ...toughestRival,
      name: getName(toughestRival.id),
      label: toughestRival.label,
      note: toughestRival.note,
    } : null,
    toughestRivalFallback: rivalFallback('tough'),
    easiestRival: easiestRival ? {
      ...easiestRival,
      name: getName(easiestRival.id),
      label: easiestRival.label,
      note: easiestRival.note,
    } : null,
    easiestRivalFallback: rivalFallback('easy'),
  };
}
