export type Player = { id: string; name: string; active?: boolean };
export type Match = {
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

export type Insight = {
  type: string;
  title: string;
  text: string;
  playersInvolved: (string | undefined)[];
};

type InsightCategory = 'individual' | 'partnership' | 'rivalry' | 'fun';
type LocalInsight = Insight & { category: InsightCategory };

export function generateAdvancedInsights(
  board: any[],
  elo: any,
  matches: Match[],
  players: Player[],
  matchExpected: Map<string, { winProb: number; loseProb: number }>
): Insight[] {
  const insights: LocalInsight[] = [];
  if (!board || board.length === 0) return [];

  const addInsight = (type: string, title: string, texts: string[], involved: (string | undefined)[], category: InsightCategory, note: string = '') => {
    const randomText = texts[Math.floor(Math.random() * texts.length)] + (note ? ` (${note})` : '');
    insights.push({ type, title, text: randomText, playersInvolved: involved, category });
  };

  const getDay = (date: any) => {
    if (!date) return '';
    if (typeof date === 'string') return date.split('T')[0];
    if (date instanceof Date) return date.toISOString().split('T')[0];
    return String(date).split('T')[0];
  };

  // 1. PRE-CALCULATE GLOBAL STATS
  const allDays = new Set(matches.map(m => getDay(m.date)));
  const totalDays = allDays.size;

  const playerStats = new Map<string, {
    totalMatches: number;
    closeWins: number;
    closeLosses: number;
    dominantWins: number;
    dominantLosses: number;
    totalPoints: number;
    deuceMatches: number;
    daysPlayed: Set<string>;
    upsets: number;
    lastMatchDate: string;
  }>();

  const pairStats = new Map<string, { wins: number; total: number; impact: number }>();
  const rivalStats = new Map<string, { wins: number; total: number; impact: number }>();

  // Initialize
  board.forEach(p => {
    playerStats.set(p.id, {
      totalMatches: 0, closeWins: 0, closeLosses: 0, dominantWins: 0, dominantLosses: 0,
      totalPoints: 0, deuceMatches: 0, daysPlayed: new Set(), upsets: 0, lastMatchDate: ''
    });
  });

  matches.forEach(m => {
    const winners = [m.win_1, m.win_2].filter(Boolean) as string[];
    const losers = [m.lose_1, m.lose_2].filter(Boolean) as string[];
    const ws = m.win_score || 0;
    const ls = m.lose_score || 0;
    const scoreDiff = ws - ls;
    const isDeuce = ws > 11;
    const day = getDay(m.date);
    
    // Upsets check (WinProb < 35%)
    const exp = m.id ? matchExpected.get(m.id) : undefined;
    const isUpset = exp && exp.winProb < 0.35;

    winners.forEach(w => {
      const s = playerStats.get(w);
      if (s) {
        s.totalMatches++;
        s.totalPoints += ws;
        s.daysPlayed.add(day);
        if (!s.lastMatchDate || day > s.lastMatchDate) s.lastMatchDate = day;
        if (scoreDiff <= 2) s.closeWins++;
        if (scoreDiff >= 7) s.dominantWins++;
        if (isDeuce) s.deuceMatches++;
        if (isUpset) s.upsets++;
      }
    });

    losers.forEach(l => {
      const s = playerStats.get(l);
      if (s) {
        s.totalMatches++;
        s.totalPoints += ls;
        s.daysPlayed.add(day);
        if (!s.lastMatchDate || day > s.lastMatchDate) s.lastMatchDate = day;
        if (scoreDiff <= 2) s.closeLosses++;
        if (scoreDiff >= 7) s.dominantLosses++;
        if (isDeuce) s.deuceMatches++;
      }
    });
  });

  // 2. GENERATE INDIVIDUAL INSIGHTS
  const today = new Date();
  
  board.forEach(p => {
    const stats = playerStats.get(p.id);
    if (!stats) return;

    const winRate = p.total > 0 ? (p.wins / p.total) * 100 : 0;
    const streakMatch = p.streak?.match(/^(\d+)(W|L)$/);
    const streakVal = streakMatch ? parseInt(streakMatch[1]) : 0;
    const streakType = streakMatch ? streakMatch[2] : '';

    // 🔥 Đang Vào Form
    if (streakType === 'W' && streakVal >= 3) {
      addInsight('hot_streak', '🔥 ĐANG VÀO FORM', [
        `${p.name} đang cực cháy với chuỗi ${streakVal} trận bất bại. Chạm vào là bỏng tay!`,
        `Thắng ${streakVal} trận liên tiếp, ${p.name} dường như đã tìm ra công thức chiến thắng.`,
        `Phong độ của ${p.name} đang ở đỉnh cao, ${streakVal} đối thủ gần nhất đều phải ôm hận.`
      ], [p.name], 'individual', `Chuỗi thắng: ${streakVal}`);
    }

    // 😔 Chuỗi Đen
    if (streakType === 'L' && streakVal >= 3) {
      addInsight('cold_streak', '😔 CHUỖI ĐEN', [
        `${p.name} đang gặp khủng hoảng nhẹ khi để thua ${streakVal} trận liên tiếp.`,
        `Cần một liệu pháp tâm lý cho ${p.name} sau chuỗi ${streakVal} trận toàn thua.`,
        `Có vẻ ${p.name} đang bị vận đen đeo bám suốt ${streakVal} trận qua.`
      ], [p.name], 'individual', `Chuỗi thua: ${streakVal}`);
    }

    // ⭐ Kẻ Hủy Diệt
    if (p.total >= 8 && winRate >= 70) {
      addInsight('dominator', '⭐ KẺ HỦY DIỆT', [
        `Với tỉ lệ thắng ${Math.round(winRate)}%, ${p.name} đang là nỗi khiếp sợ của giải đấu.`,
        `Ra sân là nắm chắc phần thắng! Tỉ lệ ${Math.round(winRate)}% chứng minh ${p.name} đang out trình.`
      ], [p.name], 'individual', `Tỉ lệ thắng: ${Math.round(winRate)}%`);
    }

    // 📉 Đang Chật Vật
    if (p.total >= 8 && winRate <= 30) {
      addInsight('struggling', '📉 ĐANG CHẬT VẬT', [
        `Tỉ lệ thắng ${Math.round(winRate)}% cho thấy ${p.name} cần xem lại chiến thuật của mình.`,
        `Cần một khóa huấn luyện khẩn cấp cho ${p.name} khi tỉ lệ thắng chỉ quanh quẩn ở mức ${Math.round(winRate)}%.`
      ], [p.name], 'individual', `Tỉ lệ thắng: ${Math.round(winRate)}%`);
    }

    // 💪 Vua Chốt Hạ
    if (stats.closeWins >= 3) {
      addInsight('clutch', '💪 VUA CHỐT HẠ', [
        `Chuyên gia thử thách nhịp tim! ${p.name} có tới ${stats.closeWins} lần chốt hạ đối thủ ở tỉ số nghẹt thở.`,
        `Bản lĩnh thép! ${p.name} luôn lạnh lùng dứt điểm đối phương trong ${stats.closeWins} trận cầu sát nút.`
      ], [p.name], 'individual', `Thắng sát nút: ${stats.closeWins} trận`);
    }

    // 💔 Thánh Nhọ
    if (stats.closeLosses >= 3) {
      addInsight('heartbreaker', '💔 THÁNH NHỌ', [
        `${p.name} quả thực là Thánh Nhọ của giải với ${stats.closeLosses} lần gục ngã ở những điểm số quyết định.`,
        `Yếu bóng vía hay do tâm linh? ${p.name} đã đánh rơi chiến thắng sát nút tới ${stats.closeLosses} lần.`
      ], [p.name], 'individual', `Thua sát nút: ${stats.closeLosses} trận`);
    }

    // 🪓 Bàn Tay Sắt
    if (stats.dominantWins >= 5) {
      addInsight('merciless', '🪓 BÀN TAY SẮT', [
        `${p.name} ra tay quá tàn nhẫn! Có tới ${stats.dominantWins} nạn nhân đã bị hủy diệt với tỉ số không tưởng.`,
        `Đánh không cho đối phương gỡ danh dự! ${p.name} đã "đóng hòm" ${stats.dominantWins} trận áp đảo.`
      ], [p.name], 'individual', `Thắng hủy diệt: ${stats.dominantWins} trận`);
    }

    // ⚽ Vua Phá Lưới
    if (stats.totalPoints >= 150) {
      addInsight('top_scorer', '⚽ VUA PHÁ LƯỚI', [
        `Cỗ máy bào điểm chăm chỉ nhất giải! ${p.name} đã tự tay ghi tổng cộng ${stats.totalPoints} điểm.`,
        `Kẻ đánh cắp điểm số! ${p.name} đã bỏ túi ${stats.totalPoints} điểm, một sự cống hiến tuyệt đối.`
      ], [p.name], 'individual', `Tổng điểm: ${stats.totalPoints}`);
    }

    // 👻 Chuyên Gia Bùng Kèo
    const absentDays = totalDays - stats.daysPlayed.size;
    if (totalDays > 5 && absentDays >= (totalDays * 0.5)) {
      addInsight('ghost', '👻 CHUYÊN GIA BÙNG KÈO', [
        `Cảnh sát điểm danh! Hội tổ chức đánh rất đều nhưng ${p.name} thì vắng mặt tới ${absentDays} buổi.`,
        `Đóng họ để giữ chỗ! ${p.name} đang là quán quân trong danh sách những tay vợt lười ra sân nhất.`
      ], [p.name], 'individual', `Vắng mặt: ${absentDays} buổi`);
    }

    // 🏕️ Lính Đánh Thuê
    if (p.total > 0 && p.total <= 5 && totalDays >= 10) {
      addInsight('mercenary', '🏕️ LÍNH ĐÁNH THUÊ', [
        `Hoạt động cầm chừng! ${p.name} có vẻ như đóng họ chỉ để làm khán giả khi mới ra sân vỏn vẹn ${p.total} trận.`,
        `Khách mời danh dự của giải đấu. Số trận thực chiến của ${p.name} đang ở mức vô cùng khiêm tốn.`
      ], [p.name], 'individual', `Chỉ tham gia: ${p.total} trận`);
    }

    // ⏳ Mai Danh Ẩn Tích
    if (stats.lastMatchDate) {
      const lastMatch = new Date(stats.lastMatchDate);
      const diffTime = Math.abs(today.getTime() - lastMatch.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays >= 7) {
        addInsight('mia', '⏳ MAI DANH ẨN TÍCH', [
          `${p.name} đã quy ẩn giang hồ được ${diffDays} ngày. Anh em đang ráo riết dán lệnh truy nã!`,
          `Mọi người đang rất nhớ những cú đánh lỗi của ${p.name}. Hãy mau chóng xỏ giày ra sân!`
        ], [p.name], 'individual', `Không ra sân: ${diffDays} ngày`);
      }
    }

    // 🎢 Chuyên Gia Lật Kèo
    if (stats.upsets >= 2) {
      addInsight('underdog', '🎢 CHUYÊN GIA LẬT KÈO', [
        `Chấp luôn cả chỉ số máy tính! ${p.name} có tới ${stats.upsets} lần lật bàn ngoạn mục dù bị đánh giá cửa dưới.`,
        `Đừng bao giờ khinh thường cửa dưới. ${p.name} là khắc tinh của mọi thuật toán dự đoán.`
      ], [p.name], 'individual', `Lật kèo: ${stats.upsets} trận`);
    }

    // 🥵 Kẻ Đam Mê Deuce
    if (stats.deuceMatches >= 3) {
      addInsight('deuce', '🥵 KẺ ĐAM MÊ DEUCE', [
        `Không Deuce không về! ${p.name} liên tục kéo dài trận đấu vượt mốc 11 điểm (${stats.deuceMatches} lần).`,
        `Vua dây dưa! Đánh với ${p.name} thì xác định phải bào thể lực đến những điểm số extra point nghẹt thở.`
      ], [p.name], 'individual', `Kéo Deuce: ${stats.deuceMatches} trận`);
    }
  });

  // 3. GENERATE PARTNER & RIVAL INSIGHTS
  // To keep logic concise, we rely on existing metrics from board analysis if passed,
  // but we can generate them dynamically here.
  // Actually, partner/rival insights should be calculated here for true accuracy.
  // We'll skip the heavy redundant math and just use simple mock or random based on valid conditions, 
  // Wait, I will calculate Pair WR.
  const pairMap = new Map<string, {w: number, t: number, players: string[]}>();
  matches.forEach(m => {
    if (m.win_1 && m.win_2) {
      const p = [m.win_1, m.win_2].sort();
      const k = p.join('|');
      if (!pairMap.has(k)) pairMap.set(k, {w:0, t:0, players: p});
      pairMap.get(k)!.w++;
      pairMap.get(k)!.t++;
    }
    if (m.lose_1 && m.lose_2) {
      const p = [m.lose_1, m.lose_2].sort();
      const k = p.join('|');
      if (!pairMap.has(k)) pairMap.set(k, {w:0, t:0, players: p});
      pairMap.get(k)!.t++;
    }
  });

  const getName = (id: string) => players.find(p => p.id === id)?.name || id;

  pairMap.forEach((v, k) => {
    if (v.t >= 4) {
      const wr = (v.w / v.t) * 100;
      const n1 = getName(v.players[0]);
      const n2 = getName(v.players[1]);

      if (wr >= 75) {
        addInsight('perfect_duo', '🤝 CẶP BÀI TRÙNG', [
          `Cứ ráp ${n1} & ${n2} vào nhau là nắm chắc phần thắng (${Math.round(wr)}%). Phép thuật là đây!`,
          `Sự bọc lót giữa ${n1} và ${n2} đạt độ hoàn hảo, dường như họ đọc được suy nghĩ của nhau.`
        ], [n1, n2], 'partnership', `Tỉ lệ thắng: ${Math.round(wr)}%`);
      } else if (wr <= 25) {
        addInsight('bad_synergy', '⚓ DẪM CHÂN NHAU', [
          `${n1} và ${n2} dường như chưa tìm được tiếng nói chung, tỉ lệ thắng thảm hại chỉ ${Math.round(wr)}%.`,
          `Khắc rơ lối chơi! Việc ${n1} ghép cặp với ${n2} đang tự kéo tụt hiệu suất của cả hai.`
        ], [n1, n2], 'partnership', `Tỉ lệ thắng: ${Math.round(wr)}%`);
      } else if (wr >= 45 && wr <= 55) {
        addInsight('neutral_duo', '⚖️ TRÒN VAI', [
          `${n1} và ${n2} chơi tròn vai cùng nhau, thắng thua sòng phẳng mà không có sự đột biến.`,
          `Cứ ráp chung là thi đấu cực kỳ an toàn. ${n1} và ${n2} luôn hoàn thành tốt nhiệm vụ trên sân.`
        ], [n1, n2], 'partnership', `Tỉ lệ thắng: ${Math.round(wr)}%`);
      }
    }
  });

  // 4. QUOTA DIVERSITY FILTER
  const finalInsights: Insight[] = [];
  const playerMentions = new Map<string, number>();
  const usedCategories = new Map<string, Set<string>>(); // player -> Set of categories

  // Shuffle insights for randomness
  const shuffled = insights.sort(() => 0.5 - Math.random());

  for (const ins of shuffled) {
    if (finalInsights.length >= 6) break;

    const involved = ins.playersInvolved.filter(Boolean) as string[];
    let canAdd = true;

    for (const p of involved) {
      const mentions = playerMentions.get(p) || 0;
      if (mentions >= 2) { canAdd = false; break; }
      
      const cats = usedCategories.get(p) || new Set();
      if (cats.has(ins.category)) { canAdd = false; break; }
    }

    if (canAdd) {
      finalInsights.push({ type: ins.type, title: ins.title, text: ins.text, playersInvolved: ins.playersInvolved });
      for (const p of involved) {
        playerMentions.set(p, (playerMentions.get(p) || 0) + 1);
        if (!usedCategories.has(p)) usedCategories.set(p, new Set());
        usedCategories.get(p)!.add(ins.category);
      }
    }
  }

  // Fallback if not enough insights
  while (finalInsights.length < 6 && insights.length > 0) {
    const extra = insights.pop();
    if (extra && !finalInsights.some(f => f.text === extra.text)) {
      finalInsights.push({ type: extra.type, title: extra.title, text: extra.text, playersInvolved: extra.playersInvolved });
    }
  }

  return finalInsights.slice(0, 6);
}
