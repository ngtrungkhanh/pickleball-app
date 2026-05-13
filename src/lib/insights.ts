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

  const addInsight = (type: string, title: string, texts: string[], involved: (string | undefined)[], category: InsightCategory) => {
    const randomText = texts[Math.floor(Math.random() * texts.length)];
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

    const playerWinRate = p.total > 0 ? (p.wins / p.total) * 100 : 0;
    const streakMatch = p.streak?.match(/^(\d+)(W|L)$/);
    const streakVal = streakMatch ? parseInt(streakMatch[1]) : 0;
    const streakType = streakMatch ? streakMatch[2] : '';

    // 🔥 Đang Vào Form
    if (streakType === 'W' && streakVal >= 3) {
      addInsight('hot_streak', '🔥 ĐANG VÀO FORM', [
        `Không thể cản bước! ${p.name} đang cực cháy với chuỗi ${streakVal} trận bất bại liên tiếp. Chạm vào là bỏng tay!`,
        `Thắng liền ${streakVal} trận, ${p.name} dường như đã tìm ra công thức chiến thắng tối thượng.`,
        `Phong độ của ${p.name} đang ở đỉnh cao, ${streakVal} đối thủ gần nhất đều đã phải ôm hận rời sân.`,
        `${p.name} đang thăng hoa với chuỗi thắng ${streakVal} trận. Hãy xem ai có thể cản bước!`,
        `Máy ghi điểm mang tên ${p.name} đã thông nòng, càn quét giải đấu với ${streakVal} chiến thắng liên tiếp.`
      ], [p.name], 'individual');
    }

    // 😔 Chuỗi Đen
    if (streakType === 'L' && streakVal >= 3) {
      addInsight('cold_streak', '😔 CHUỖI ĐEN', [
        `${p.name} đang gặp khủng hoảng nhẹ khi để thua tới ${streakVal} trận liên tiếp.`,
        `Cần một liệu pháp tâm lý khẩn cấp cho ${p.name} sau chuỗi ${streakVal} trận toàn thua cay đắng.`,
        `${p.name} đang lạc lối với ${streakVal} thất bại liên tiếp. Đã đến lúc đi giải hạn đổi phong thủy?`,
        `Có vẻ ${p.name} đang bị vận đen đeo bám suốt ${streakVal} trận qua chưa biết mùi chiến thắng.`,
        `Kéo dài chuỗi thua lên con số ${streakVal}, ${p.name} đang rất khát khao một trận đấu gỡ gạc danh dự!`
      ], [p.name], 'individual');
    }

    // ⭐ Kẻ Hủy Diệt
    const playerWins = stats.dominantWins + stats.closeWins;
    if (p.total >= 8 && playerWinRate >= 70) {
      addInsight('dominator', '⭐ KẺ HỦY DIỆT', [
        `Với tỉ lệ thắng ${Math.round(playerWinRate)}% (thắng ${playerWins}/${p.total} trận), ${p.name} đang là nỗi khiếp sợ của giải đấu.`,
        `Ra sân là nắm chắc phần thắng! Tỉ lệ thắng ${Math.round(playerWinRate)}% (${playerWins}/${p.total} trận) chứng minh ${p.name} đang out trình.`,
        `Duy trì tỉ lệ thắng ${Math.round(playerWinRate)}% (${playerWins}/${p.total} trận), ${p.name} đang sở hữu phong độ mà ai cũng khao khát.`,
        `${p.name} đang thống trị sân bóng với tỉ lệ thắng ${Math.round(playerWinRate)}% (${playerWins} thắng/${p.total} trận). Đẳng cấp quá khác biệt.`,
        `Không thể cản phá! ${p.name} càn quét mọi đối thủ với tỉ lệ thắng lên tới ${Math.round(playerWinRate)}% (${playerWins}/${p.total} trận).`
      ], [p.name], 'individual');
    }

    // 📉 Đang Chật Vật
    if (p.total >= 8 && playerWinRate <= 30) {
      addInsight('struggling', '📉 ĐANG CHẬT VẬT', [
        `Chỉ thắng vỏn vẹn ${Math.round(playerWinRate)}% (${playerWins}/${p.total} trận), ${p.name} cần nghiêm túc xem lại chiến thuật.`,
        `Có vẻ ${p.name} vẫn đang trong giai đoạn làm quen sân bãi với tỉ lệ thắng khiêm tốn ${Math.round(playerWinRate)}% (${playerWins}/${p.total} trận).`,
        `Chỉ đạt ${Math.round(playerWinRate)}% tỉ lệ thắng từ đầu giải (${playerWins}/${p.total} trận), ${p.name} cần tập trung hơn.`,
        `${p.name} đang gặp khó khăn với tỉ lệ thắng hiện tại chỉ ${Math.round(playerWinRate)}% (${playerWins}/${p.total} trận).`,
        `Cần luyện tập thêm cho ${p.name} khi hiệu suất chiến thắng chỉ ${Math.round(playerWinRate)}% (${playerWins}/${p.total} trận).`
      ], [p.name], 'individual');
    }

    // 💪 Vua Chốt Hạ
    if (stats.closeWins >= 3) {
      addInsight('clutch', '💪 VUA CHỐT HẠ', [
        `Chuyên gia thử thách nhịp tim! ${p.name} có tới ${stats.closeWins} lần chốt hạ đối thủ ở những điểm số nghẹt thở.`,
        `Bản lĩnh thép! ${p.name} luôn lạnh lùng dứt điểm đối phương mang về ${stats.closeWins} chiến thắng sát nút.`,
        `Chỉ cần điểm rơi vào Match-point, ${p.name} chưa bao giờ làm anh em thất vọng với ${stats.closeWins} lần lật kèo phút chót.`,
        `Cứ đánh giằng co là tự động bật Mode Quái vật. ${p.name} đã vượt ải thành công ${stats.closeWins} trận sát nút.`,
        `Những trận đấu của ${p.name} luôn cần thuốc trợ tim cho khán giả, minh chứng là ${stats.closeWins} lần thắng nghẹt thở.`
      ], [p.name], 'individual');
    }

    // 💔 Thánh Nhọ
    if (stats.closeLosses >= 3) {
      addInsight('heartbreaker', '💔 THÁNH NHỌ', [
        `${p.name} quả thực là Thánh Nhọ của giải với ${stats.closeLosses} lần gục ngã đáng tiếc ở những điểm số quyết định.`,
        `Yếu bóng vía hay do tâm linh? ${p.name} đã đánh rơi chiến thắng sát nút tới ${stats.closeLosses} lần.`,
        `Chỉ thiếu đúng một chút may mắn nữa thôi, ${p.name} đã để vuột mất ${stats.closeLosses} trận cầu căng thẳng.`,
        `Vua về nhì trong các kèo đấu sòng phẳng. ${p.name} đã ngậm ngùi thua ${stats.closeLosses} trận với tỉ số sát nút.`,
        `Khán giả luôn phải ôm đầu tiếc nuối cho ${p.name} sau ${stats.closeLosses} lần gục ngã ngay trước vạch đích.`
      ], [p.name], 'individual');
    }

    // 🪓 Bàn Tay Sắt
    if (stats.dominantWins >= 5) {
      addInsight('merciless', '🪓 BÀN TAY SẮT', [
        `${p.name} ra tay quá tàn nhẫn! Có tới ${stats.dominantWins} nạn nhân đã bị anh hủy diệt với tỉ số cách biệt sâu.`,
        `Đánh không cho đối phương gỡ danh dự! ${p.name} đã "đóng hòm" ${stats.dominantWins} trận với thế trận áp đảo hoàn toàn.`,
        `Đứng trước ${p.name} là xác định mất điện. Đã có ${stats.dominantWins} đối thủ bị dội gáo nước lạnh không kịp ngáp.`,
        `Sức mạnh hủy diệt tuyệt đối. ${p.name} có thói quen kết liễu trận đấu chóng vánh, ghi nhận ${stats.dominantWins} trận thắng áp đảo.`,
        `Một khi ${p.name} đã nghiêm túc, đối thủ chỉ biết cất vợt xin hàng sau ${stats.dominantWins} chiến thắng quá chênh lệch.`
      ], [p.name], 'individual');
    }

    // ⚽ Vua Phá Lưới
    if (stats.totalPoints >= 150) {
      addInsight('top_scorer', '⚽ VUA PHÁ LƯỚI', [
        `Cỗ máy bào điểm chăm chỉ nhất giải! ${p.name} đã tự tay ghi tổng cộng ${stats.totalPoints} điểm kể từ đầu mùa.`,
        `Vua phá lưới gọi tên ${p.name} với thành tích tích lũy được ${stats.totalPoints} điểm qua các trận đấu.`,
        `Kẻ ghi điểm nhiều nhất! ${p.name} đã bỏ túi ${stats.totalPoints} điểm, thể hiện sự cống hiến tuyệt đối.`,
        `Thành tích ${stats.totalPoints} điểm của ${p.name} là minh chứng cho việc chăm chỉ trên sân Pickleball.`,
        `Dù thắng hay thua, ${p.name} vẫn luôn là người ghi điểm nhiều nhất, mang về ${stats.totalPoints} điểm tổng.`
      ], [p.name], 'individual');
    }

    // 👻 Chuyên Gia Bùng Kèo
    const absentDays = totalDays - stats.daysPlayed.size;
    if (totalDays > 5 && absentDays >= (totalDays * 0.5)) {
      addInsight('ghost', '👻 CHUYÊN GIA BÙNG KÈO', [
        `Cảnh sát điểm danh! Ban tổ chức đánh rất đều nhưng ${p.name} thì đã vắng mặt tới ${absentDays} buổi.`,
        `Giữ chỗ mà không ra sân! ${p.name} đang quán quân trong danh sách nghỉ chơi với ${absentDays} ngày vắng mặt.`
      ], [p.name], 'individual');
    }

    // 🏕️ Lính Đánh Thuê
    if (p.total > 0 && p.total <= 5 && totalDays >= 10) {
      addInsight('mercenary', '🏕️ LÍNH ĐÁNH THUÊ', [
        `Hoạt động cầm chừng! ${p.name} dường như chỉ đăng ký để ngồi xem khi mới ra sân vỏn vẹn ${p.total} trận.`,
        `Khách mời danh dự của giải đấu. Số trận thực chiến của ${p.name} đang ở mức báo động đỏ: chỉ ${p.total} trận.`
      ], [p.name], 'individual');
    }

    // ⏳ Mai Danh Ẩn Tích
    if (stats.lastMatchDate) {
      const lastMatch = new Date(stats.lastMatchDate);
      const diffTime = Math.abs(today.getTime() - lastMatch.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays >= 7) {
        addInsight('mia', '⏳ MAI DANH ẨN TÍCH', [
        `${p.name} đã quy ẩn giang hồ được ${diffDays} ngày. Anh em đang ráo riết dán lệnh truy nã!`,
        `Mọi người đang rất nhớ những cú đánh lỗi của ${p.name}. Đã qua ${diffDays} ngày, hãy mau chóng xỏ giày ra sân!`
      ], [p.name], 'individual');
      }
    }

    // 🎢 Chuyên Gia Lật Kèo
    if (stats.upsets >= 2) {
      addInsight('underdog', '🎢 CHUYÊN GIA LẬT KÈO', [
        `Chấp luôn cả chỉ số máy tính! ${p.name} vừa tạo ra cơn địa chấn khi đánh bại đối thủ cửa trên tới ${stats.upsets} lần.`,
        `Đừng bao giờ khinh thường cửa dưới. ${p.name} đã ${stats.upsets} lần chứng minh rằng ELO không phải là tất cả.`
      ], [p.name], 'individual');
    }

    // 🥵 Kẻ Đam Mê Deuce
    if (stats.deuceMatches >= 3) {
      addInsight('deuce', '🥵 KẺ ĐAM MÊ DEUCE', [
        `Không Deuce không về! ${p.name} có tới ${stats.deuceMatches} trận mắc hội chứng kéo dài tỉ số vượt mốc 11.`,
        `Vua dây dưa! Đánh với ${p.name} thì xác định phải bào thể lực với ${stats.deuceMatches} trận đấu nghẹt thở extra point.`,
        `Chỉ thích thắng ở điểm số 12 trở lên. ${p.name} đã ${stats.deuceMatches} lần khiến khán giả đau tim vì thói quen giằng co.`,
        `Đam mê Extra Point! ${p.name} là nguyên nhân chính khiến sân bị lố giờ nghỉ với ${stats.deuceMatches} trận cầu dai dẳng.`,
        `Thắng nhanh thì chê, phải kéo đến Deuce mới chịu. ${p.name} đã nướng bóng và thời gian trong ${stats.deuceMatches} trận giằng co.`
      ], [p.name], 'individual');
    }

    // 🩹 Tai Nạn Giao Thông
    const lastMatch = stats.lastMatchDate ? matches.find(m => getDay(m.date) === stats.lastMatchDate && [m.lose_1, m.lose_2].includes(p.id)) : null;
    if (lastMatch && (lastMatch.lose_score || 0) <= 2) {
      addInsight('bagel', '🩹 TAI NẠN GIAO THÔNG', [
        `Trận thua thảm họa chỉ ghi được ${lastMatch.lose_score} điểm vừa qua quả thực là một tai nạn giao thông của ${p.name}.`,
        `Sập nguồn đột ngột! ${p.name} vừa trải qua một trận đấu quên mang theo nhịp điệu khi chỉ lên được ${lastMatch.lose_score} điểm.`,
        `Chỉ vớt vát được ${lastMatch.lose_score} điểm danh dự, trận thua thảm họa vừa rồi chắc chắn sẽ khiến ${p.name} mất ngủ đêm nay.`,
        `Cần một chầu bia để giải đen gấp cho ${p.name} sau trận đấu "cất vợt" kết thúc với ${lastMatch.lose_score} điểm ít ỏi.`,
        `Không thể nhận ra ${p.name} trong trận đấu bị dội gáo nước lạnh vừa rồi, chỉ kịp ghi ${lastMatch.lose_score} điểm trước khi rời sân.`
      ], [p.name], 'individual');
    }

    // 🚜 Trâu Cày / Vua Thể Lực (Kịch bản #19)
    const matchesByDay = new Map<string, number>();
    stats.daysPlayed.forEach(day => {
      const dayMatches = matches.filter(m => getDay(m.date) === day && [m.win_1, m.win_2, m.lose_1, m.lose_2].includes(p.id));
      matchesByDay.set(day, dayMatches.length);
    });
    const maxMatchesInDay = Math.max(...Array.from(matchesByDay.values()), 0);
    if (maxMatchesInDay >= 5) {
      addInsight('ironman', '🚜 TRÂU CÀY', [
        `Thể lực bền bỉ đáng nể! ${p.name} giữ kỷ lục ra sân tới ${maxMatchesInDay} trận chỉ trong một buổi.`,
        `Đánh không biết mệt! ${p.name} đã thi đấu ${maxMatchesInDay} trận liên tiếp trong ngày hôm đó.`,
        `Cỗ máy chạy bằng cơm mang tên ${p.name} vừa hoàn tất ${maxMatchesInDay} trận đấu cực căng trong một buổi.`,
        `Ban tổ chức xin trao giải "Người có sức bền" cho ${p.name} vì đánh được ${maxMatchesInDay} trận/ngày.`,
        `Ai hụt hơi thì hụt chứ ${p.name} vẫn dư sức thi đấu ${maxMatchesInDay} trận một buổi dễ như ăn kẹo.`
      ], [p.name], 'individual');
    }

    // 🦋 Lột Xác Ngoạn Mục (Kịch bản #20)
    const playerMatches = matches
      .filter(m => [m.win_1, m.win_2, m.lose_1, m.lose_2].includes(p.id))
      .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    const last5 = playerMatches.slice(0, 5);
    const last5Wins = last5.filter(m => [m.win_1, m.win_2].includes(p.id)).length;
    const last5WR = last5.length > 0 ? (last5Wins / last5.length) * 100 : 0;
    // Calculate overall win rate from actual wins/total (dominantWins + closeWins = total wins)
    const totalWins = stats.dominantWins + stats.closeWins;
    const overallWR = stats.totalMatches > 0 ? (totalWins / stats.totalMatches) * 100 : 0;
    const improvement = last5WR - overallWR;
    if (improvement >= 20 && last5.length >= 5) {
      addInsight('improved', '🦋 LỘT XÁC NGOẠN MỤC', [
        `Sự lột xác đáng kinh ngạc! Hiệu suất gần đây của ${p.name} đang tăng vọt thêm ${Math.round(improvement)}% so với hồi đầu mùa.`,
        `Càng đánh càng hay! ${p.name} đập tan mọi nghi ngờ với tỉ lệ thắng thăng tiến vượt bậc ${Math.round(improvement)}%.`,
        `Dường như ${p.name} vừa được đả thông kinh mạch. Chuỗi phong độ cực kỳ khởi sắc, tăng mạnh ${Math.round(improvement)}% tỉ lệ thắng!`,
        `Ai chê ${p.name} dở thì ra đây mà xem! Sự tiến bộ tăng ${Math.round(improvement)}% hiệu suất trong các trận gần đây là không thể bàn cãi.`,
        `Khởi đầu chậm nhưng bứt tốc cực gắt. ${p.name} đang cho thấy một bộ mặt khác hẳn với mức tăng ${Math.round(improvement)}% tỉ lệ thắng.`
      ], [p.name], 'individual');
    }

    // 🥶 Rớt Phong Độ (Kịch bản #21)
    const decline = overallWR - last5WR;
    if (decline >= 20 && last5.length >= 5) {
      addInsight('slump', '🥶 RỚT PHONG ĐỘ', [
        `Có vẻ ${p.name} đang mất cảm giác bóng khi thành tích gần đây tụt dốc không phanh, giảm tới ${Math.round(decline)}% hiệu suất.`,
        `Cỗ máy đang có dấu hiệu quá tải! ${p.name} sụt giảm ${Math.round(decline)}% tỉ lệ thắng so với dạo trước.`,
        `Đang bay cao bỗng nhiên đứt cáp. Phong độ của ${p.name} đang lao dốc ${Math.round(decline)}%, tạo ra một dấu hỏi lớn.`,
        `${p.name} cần sớm tìm lại chính mình trước khi mọi thứ trôi đi quá xa, bù đắp lại ${Math.round(decline)}% hiệu suất vừa đánh mất.`,
        `Màn trình diễn của ${p.name} dạo này khá nhạt nhòa, tỉ lệ thắng bốc hơi ${Math.round(decline)}%, không còn sự sắc bén như trước.`
      ], [p.name], 'individual');
    }

    // 👑 Thống Trị ELO (Kịch bản #22)
    const currentElo = elo.rating.get(p.id) || 1000;
    const topPlayer = board[0];
    if (topPlayer && p.id === topPlayer.id && currentElo > 1050) {
      addInsight('king', '👑 THỐNG TRỊ ELO', [
        `${p.name} đang chễm chệ trên ngai vàng vương quyền. Liệu ai có đủ sức lật đổ mức điểm ${Math.round(currentElo)} ELO?`,
        `Mức ELO hiện tại ${Math.round(currentElo)} của ${p.name} là minh chứng cho một đẳng cấp out trình hoàn toàn.`,
        `${p.name} đang quá cô đơn trên đỉnh cao danh vọng với ${Math.round(currentElo)} điểm. Cần lắm một thế lực mới trỗi dậy!`,
        `Sở hữu ${Math.round(currentElo)} ELO áp đảo, ${p.name} chính là "Trùm cuối" mà anh em nào cũng muốn săn lùng.`,
        `BXH đang bị thống trị bởi bàn tay sắt của ${p.name}. Ngai vàng ${Math.round(currentElo)} điểm vẫn chưa có dấu hiệu đổi chủ.`
      ], [p.name], 'individual');
    }

    // 📈 Ngôi Sao Đang Lên (Kịch bản #25)
    if (stats.totalMatches >= 3 && stats.totalMatches <= 15 && currentElo > 1050) {
      const eloGain = currentElo - 1000;
      addInsight('rising_star', '📈 NGÔI SAO ĐANG LÊN', [
        `Làn gió mới mang tính hủy diệt! ${p.name} đang chứng tỏ tài năng thiên bẩm khi hốt gọn ${Math.round(eloGain)} ELO dù mới ra mắt.`,
        `Sự trỗi dậy của một thế lực mới. ${p.name} thăng tiến ${Math.round(eloGain)} ELO thần tốc khiến các đàn anh phải e dè.`,
        `${p.name} chính là phát hiện thú vị nhất mùa giải với những màn kiếm được ${Math.round(eloGain)} điểm cực kỳ ấn tượng.`,
        `Chưa có nhiều kinh nghiệm nhưng độ mượt thì khỏi bàn. ${p.name} đang leo tháp với ${Math.round(eloGain)} điểm dắt túi.`,
        `Chú ngựa ô của giải đấu. ${p.name} đang làm náo loạn trật tự BXH bằng sức trẻ bùng nổ, ẵm trọn ${Math.round(eloGain)} ELO.`
      ], [p.name], 'individual');
    }

    // 👴 Gừng Càng Già Càng Cay (Kịch bản #26)
    if (stats.totalMatches >= 20 && currentElo > 1050) {
      addInsight('veteran', '👴 GỪNG CÀNG GIÀ CÀNG CAY', [
        `Với ${stats.totalMatches} trận đấu, ${p.name} là minh chứng sống cho câu nói gừng càng già càng cay. Đẳng cấp là mãi mãi!`,
        `Sự điềm tĩnh từ kinh nghiệm ${stats.totalMatches} trận đấu của ${p.name} là vũ khí sắc bén đè bẹp sự xốc nổi.`,
        `Cáo già trên sân bóng! Lối chơi mềm mại đúc kết qua ${stats.totalMatches} trận của ${p.name} khiến bao tay đấu trẻ phải e ngại.`,
        `Đứng vững qua ${stats.totalMatches} thăng trầm, ${p.name} vẫn là hòn đá tảng khó nhằn ở đỉnh BXH.`,
        `Trải qua ${stats.totalMatches} trận rèn giũa, ${p.name} dùng cái đầu để giải quyết những đôi chân mệt mỏi đầy hiệu quả.`
      ], [p.name], 'individual');
    }

    // 🛡️ Bức Tường Thép (Kịch bản #27) - Defense stat
    const defenseAvg = stats.totalMatches > 0 ? (stats.totalPoints / stats.totalMatches) : 0;
    if (stats.totalMatches >= 5 && defenseAvg <= 6) {
      addInsight('wall', '🛡️ BỨC TƯỜNG THÉP', [
        `Hàng thủ không thể xuyên thủng! Đối phương trung bình chỉ kiếm được ${Math.round(defenseAvg)} điểm khi đối mặt với ${p.name}.`,
        `${p.name} phòng ngự như xe tăng, đối phương ghi trên ${Math.round(defenseAvg)} điểm cứ như đi bắt chim trời.`,
        `Kẻ cắp không gian thực sự. Đánh với ${p.name}, rổ đựng bóng của bạn thường rất trống rỗng (Mất ${Math.round(defenseAvg)} điểm/trận).`,
        `Lối chơi kín kẽ và lỳ lợm của ${p.name} đã làm nản lòng mọi tay đập trên sân (Chỉ mất ${Math.round(defenseAvg)} điểm mỗi trận).`,
        `Ghi nhiều hơn ${Math.round(defenseAvg)} điểm vào lưới của ${p.name} được xem là một thành tựu đáng tự hào trong giải đấu.`
      ], [p.name], 'individual');
    }

    // 🃏 Vua Đen Đủi (Kịch bản #28) - High ELO but low Win Rate
    const unluckyWR = stats.totalMatches > 0 ? (((stats.closeWins + stats.dominantWins) / stats.totalMatches) * 100) : 0;
    if (currentElo > 1050 && unluckyWR < 45) {
      addInsight('unlucky_king', '🃏 VUA ĐEN ĐỦI', [
        `Tài năng đi liền tai ương. ELO chạm mốc ${Math.round(currentElo)} nhưng ${p.name} toàn phải gánh đồng đội, khiến tỉ lệ thắng lẹt đẹt ở mức ${Math.round(unluckyWR)}%.`,
        `Đẳng cấp có thừa nhưng vận may từ chối. ${p.name} là định nghĩa của việc giỏi không bằng may (ELO: ${Math.round(currentElo)}, tỉ lệ thắng: ${Math.round(unluckyWR)}%).`,
        `Ông hoàng gánh team bất đắc dĩ. ${p.name} dùng mức ELO ${Math.round(currentElo)} của mình cõng đồng đội đến mức tỉ lệ thắng chỉ còn ${Math.round(unluckyWR)}%.`,
        `Trình độ thượng thừa nhưng chiến thắng thưa thớt (${Math.round(unluckyWR)}%). ${p.name} đang gặp toàn đồng đội không ngang tài.`,
        `${p.name} đánh bóng bằng kỹ năng nhưng kết quả lại do đồng đội quyết định. Đen thôi, đỏ quên đi!`
      ], [p.name], 'individual');
    }

    // 🏋️‍♂️ Thần Gánh Tạ (Kịch bản #29) - Carry impact
    const carryImpact = stats.totalMatches > 0 ? ((stats.dominantWins - stats.closeLosses) / stats.totalMatches) * 100 : 0;
    if (carryImpact >= 20 && stats.totalMatches >= 5) {
      addInsight('carry', '🏋️‍♂️ THẦN GÁNH TẠ', [
        `${p.name} đích thực là Bùa Hộ Mệnh, giúp tỉ lệ thắng của đồng đội tăng vọt thêm ${Math.round(carryImpact)}% so với bình quân.`,
        `${p.name} bao sân cực tốt để kéo phong độ của đồng đội lên một tầm cao mới, buff mạnh ${Math.round(carryImpact)}% hiệu suất.`,
        `Sự xuất hiện của ${p.name} giúp đồng đội đánh như lên đồng, thành tích thi đấu được kéo lên tới ${Math.round(carryImpact)}%.`,
        `Đứng cạnh ${p.name}, đồng đội dường như cởi bỏ được mọi áp lực, hiệu quả thi đấu được cải thiện thêm ${Math.round(carryImpact)}%.`,
        `${p.name} đã gánh vác quá hay, tạo tiền đề cho đồng đội tỏa sáng với mức tăng trưởng ${Math.round(carryImpact)}% tỉ lệ thắng.`
      ], [p.name], 'individual');
    }

    // 🎯 Sai Lầm (Kịch bản #34)
    if (stats.closeLosses >= 5) {
      addInsight('mistake', '🎯 SAI LẦM', [
        `${p.name} đã có ${stats.closeLosses} trận thua sát nút – cần cải thiện khả năng chốt hạ.`,
        `${p.name} cần tránh sai lầm khi đã để thua sát sao ${stats.closeLosses} lần.`,
        `${p.name} đang có xu hướng đánh rơi chiến thắng với ${stats.closeLosses} trận thua cận kề.`,
        `Các trận thua sát nút của ${p.name} (${stats.closeLosses} lần) cho thấy cần rèn luyện thêm về tinh thần.`,
        `${p.name} nên tập trung cải thiện khả năng giữ thắng lợi sau ${stats.closeLosses} lần vuột mất chiến thắng.`
      ], [p.name], 'individual');
    }

    // 📈 Động Lực Cao (Kịch bản #35)
    if (stats.dominantWins >= 4) {
      addInsight('momentum', '📈 ĐỘNG LỰC CAO', [
        `${p.name} đang lên cao với ${stats.dominantWins} trận thắng áp đảo.`,
        `${p.name} có động lực tăng tốc sau ${stats.dominantWins} lần thắng cách biệt lớn.`,
        `Dòng chảy của ${p.name} đang mạnh mẽ với ${stats.dominantWins} chiến thắng thuyết phục.`,
        `${p.name} ghi dấu ấn bằng ${stats.dominantWins} lần thắng đậm.`,
        `Động lực của ${p.name} bùng nổ khi thắng áp đảo ${stats.dominantWins} trận.`
      ], [p.name], 'individual');
    }

    // 🔥 PHÁ ĐẬP (Kịch bản #40) - Sử dụng dominantWins >= 6 để tránh trùng với momentum
    if (stats.dominantWins >= 6) {
      addInsight('smash', '🔥 PHÁ ĐẬP', [
        `${p.name} tạo sức ép ấn tượng với ${stats.dominantWins} trận thắng cách biệt từ 7 điểm trở lên.`,
        `Sức mạnh của ${p.name} được thể hiện qua ${stats.dominantWins} chiến thắng áp đảo.`,
        `${p.name} vượt trội hơn đối thủ với ${stats.dominantWins} trận thắng đậm cách biệt.`,
        `Phong độ ấn tượng của ${p.name} thể hiện qua ${stats.dominantWins} lần thắng cách biệt từ 7 điểm.`,
        `${p.name} để lại dấu ấn mạnh với ${stats.dominantWins} trận thắng thuyết phục.`
      ], [p.name], 'individual');
    }

    // 🏅 HUY CHƯƠNG (Kịch bản #48)
    if (stats.totalMatches >= 20 && playerWinRate >= 75) {
      addInsight('medal', '🏅 HUY CHƯƠNG', [
        `${p.name} xứng đáng nhận huy chương với tỉ lệ thắng ${Math.round(playerWinRate)}% qua ${stats.totalMatches} trận (thắng ${playerWins} trận).`,
        `${p.name} có đủ tiêu chuẩn cho huy chương – tỉ lệ thắng ${Math.round(playerWinRate)}% và ${stats.totalMatches} trận kinh nghiệm.`,
        `Thành tích ${Math.round(playerWinRate)}% qua ${stats.totalMatches} trận của ${p.name} (thắng ${playerWins}/${stats.totalMatches}) xứng đáng được trao huy chương.`,
        `${p.name} đạt "huy chương" với tỉ lệ thắng ${Math.round(playerWinRate)}% trong ${stats.totalMatches} trận (thắng ${playerWins} trận).`,
        `${p.name} sẽ mang về viên huy chương vì thành tích ${Math.round(playerWinRate)}% qua ${stats.totalMatches} trận đấu.`
      ], [p.name], 'individual');
    }

    // 🌟 NGÔI SAO MỚI (Kịch bản #49)
    if (stats.totalMatches <= 5 && currentElo >= 1100) {
      addInsight('new_star', '🌟 NGÔI SAO MỚI', [
        `${p.name} đang lên ngôi sao với ELO ${Math.round(currentElo)} trong chỉ ${stats.totalMatches} trận.`,
        `Ngôi sao mới ${p.name} – ELO ${Math.round(currentElo)} và ${stats.totalMatches} trận đã chơi.`,
        `${p.name} tỏa sáng với ELO ${Math.round(currentElo)} dù chỉ ${stats.totalMatches} trận.`,
        `Tân binh triển vọng ${p.name} với ELO ${Math.round(currentElo)} qua ${stats.totalMatches} trận.`,
        `${p.name} đang thu hút ánh nhìn với ELO ${Math.round(currentElo)} trong ${stats.totalMatches} trận đầu tiên.`
      ], [p.name], 'individual');
    }

    // 🧭 ĐỊNH HƯỚNG (Kịch bản #41)
    if (stats.totalMatches >= 10 && playerWinRate >= 60) {
      addInsight('direction', '🧭 ĐỊNH HƯỚNG', [
        `${p.name} đã tìm ra hướng đi đúng đắn với tỉ lệ thắng ${Math.round(playerWinRate)}%.`,
        `${p.name} đang trên con đường thành công nhờ tỉ lệ thắng ${Math.round(playerWinRate)}%.`,
        `Chiến lược của ${p.name} dẫn tới tỉ lệ thắng ${Math.round(playerWinRate)}% – một định hướng rõ ràng.`,
        `${p.name} có chỉ số thắng ổn định ${Math.round(playerWinRate)}% – minh chứng cho lối chơi đúng đắn.`,
        `${p.name} đang đi đúng hướng với tỉ lệ thắng ${Math.round(playerWinRate)}% qua ${stats.totalMatches} trận.`
      ], [p.name], 'individual');
    }

    // 🏓 NHỊP ĐIỆU (Kịch bản #42)
    if (stats.closeWins >= 4) {
      addInsight('rhythm', '🏓 NHỊP ĐIỆU', [
        `${p.name} đang duy trì nhịp độ ổn định với ${stats.closeWins} trận thắng sát nút qua ${stats.totalMatches} trận.`,
        `${p.name} chơi đều tay với ${stats.closeWins} chiến thắng cân não, minh chứng cho sự tập trung cao độ.`,
        `Nhịp độ thi đấu của ${p.name} rất tốt qua ${stats.closeWins} trận thắng sát sao trên tổng số ${stats.totalMatches} trận.`,
        `${p.name} duy trì phong độ ổn định với ${stats.closeWins} trận thắng cận kề, tạo nền tảng vững chắc cho sự thăng tiến.`,
        `Sự đều đặn của ${p.name} được thể hiện qua ${stats.closeWins} chiến thắng sát nút, khẳng định bản lĩnh trong các cuộc đối đầu.`
      ], [p.name], 'individual');
    }

    // 🐉 SỨC MẠNH (Kịch bản #44)
    if (currentElo >= 1200 && playerWinRate >= 70) {
      addInsight('power', '🐉 SỨC MẠNH', [
        `${p.name} sở hữu sức mạnh áp đảo với ELO ${Math.round(currentElo)} và tỉ lệ thắng ${Math.round(playerWinRate)}% qua ${stats.totalMatches} trận.`,
        `${p.name} là một thế lực đáng gờm với ELO ${Math.round(currentElo)} và tỉ lệ thắng ${Math.round(playerWinRate)}% sau nhiều lần thử thách.`,
        `Sức mạnh của ${p.name} đạt đỉnh cao với ELO ${Math.round(currentElo)} và tỉ lệ thắng ${Math.round(playerWinRate)}% trong ${stats.totalMatches} trận đã đấu.`,
        `${p.name} đang "bùng nổ" với ELO ${Math.round(currentElo)} và tỉ lệ thắng ${Math.round(playerWinRate)}%, là đối thủ khó chịu nhất hiện tại.`,
        `Độ mạnh của ${p.name} lên tới ELO ${Math.round(currentElo)} và tỉ lệ thắng ${Math.round(playerWinRate)}%, khẳng định vị thế dẫn đầu.`
      ], [p.name], 'individual');
    }

    // 🏆 VỊ THẾ (Kịch bản #45)
    if (stats.totalMatches >= 10 && playerWinRate >= 65) {
      addInsight('rank', '🏆 VỊ THẾ', [
        `${p.name} đang nhanh chóng leo lên vị trí cao với tỉ lệ thắng ${Math.round(playerWinRate)}% qua ${stats.totalMatches} trận đấu.`,
        `${p.name} đạt vị trí cao nhờ tỉ lệ thắng ${Math.round(playerWinRate)}%, một thành tích ấn tượng so với tổng số trận chơi.`,
        `Vị trí của ${p.name} trên bảng xếp hạng đang tăng mạnh với tỉ lệ thắng ${Math.round(playerWinRate)}% sau ${stats.totalMatches} trận.`,
        `${p.name} đang "chinh phục" các đối thủ để leo hạng với tỉ lệ thắng ${Math.round(playerWinRate)}% qua ${stats.totalMatches} trận đã qua.`,
        `Chỉ số tỉ lệ thắng ${Math.round(playerWinRate)}% đưa ${p.name} lên vị trí dẫn đầu sau chặng đường ${stats.totalMatches} trận.`
      ], [p.name], 'individual');
    }

    // 🎖️ THÀNH TỰU (Kịch bản #46)
    if (stats.totalMatches >= 15 && playerWinRate >= 80) {
      addInsight('achievement', '🎖️ THÀNH TỰU', [
        `${p.name} đạt thành tựu xuất sắc với tỉ lệ thắng ${Math.round(playerWinRate)}% qua ${stats.totalMatches} trận đấu.`,
        `${p.name} đã ghi dấu ấn bằng tỉ lệ thắng ${Math.round(playerWinRate)}% sau ${stats.totalMatches} trận – một thành tựu đáng tự hào.`,
        `Thành tựu của ${p.name}: tỉ lệ thắng ${Math.round(playerWinRate)}% và ${stats.totalMatches} trận đã chơi thật đáng nể.`,
        `${p.name} được công nhận vì tỉ lệ thắng ${Math.round(playerWinRate)}% qua ${stats.totalMatches} trận đấu – một thành tựu lớn.`,
        `Đạt thành tựu hàng đầu với tỉ lệ thắng ${Math.round(playerWinRate)}% sau ${stats.totalMatches} trận của ${p.name}.`
      ], [p.name], 'individual');
    }

    // 🧹 DỌN DẸP (Kịch bản #36)
    if (stats.closeLosses > 0 && stats.dominantWins > 0) {
      addInsight('balance', '🧹 DỌN DẸP', [
        `${p.name} đang cân bằng giữa thắng và thua – ${stats.dominantWins} thắng áp đảo vs ${stats.closeLosses} thua sát nút sau ${stats.totalMatches} trận.`,
        `${p.name} cần duy trì sự cân đối giữa các trận thắng áp đảo và thua sát nút để cải thiện tỉ lệ ${Math.round(playerWinRate)}%.`,
        `Hiệu suất của ${p.name} phản ánh sự cân đối: ${stats.dominantWins} thắng đậm / ${stats.closeLosses} thua gần qua ${stats.totalMatches} trận.`,
        `${p.name} đang có lịch trình đồng đều giữa thắng đậm và thua gần trong suốt ${stats.totalMatches} trận đấu đã tham gia.`,
        `Cân bằng giữa chiến thắng và thất bại của ${p.name} hiển thị qua ${stats.dominantWins} và ${stats.closeLosses} trong ${stats.totalMatches} trận.`
      ], [p.name], 'individual');
    }

    // 🌪️ XÁO TRỘN (Kịch bản #37)
    if (stats.dominantLosses >= 3) {
      addInsight('chaos', '🌪️ XÁO TRỘN', [
        `${p.name} để lại dấu ấn với ${stats.dominantLosses} trận thua áp đảo trong tổng số ${stats.totalMatches} trận.`,
        `${p.name} đã tạo ra sự hỗn loạn qua ${stats.dominantLosses} lần thua đậm, cần xem lại chiến thuật sau ${stats.totalMatches} trận.`,
        `Mỗi khi ${p.name} thua áp đảo ${stats.dominantLosses} lần, bảng xếp hạng rung chuyển, dù đã chơi tới ${stats.totalMatches} trận.`,
        `Đối thủ cảm nhận sự xáo trộn khi ${p.name} có ${stats.dominantLosses} thua đậm trong chặng đường ${stats.totalMatches} trận.`,
        `${p.name} để lại dấu ấn "xáo trộn" trong vòng đấu với ${stats.dominantLosses} trận thua áp đảo sau ${stats.totalMatches} lần ra sân.`
      ], [p.name], 'individual');
    }

    // 💡 TRÍ TUỆ (Kịch bản #38)
    if (stats.deuceMatches >= 2) {
      addInsight('smart', '💡 TRÍ TUỆ', [
        `${p.name} thể hiện trí tuệ khi vượt qua các trận đấu kéo dài (tỉ số vượt quá 11 điểm) ${stats.deuceMatches} lần trong ${stats.totalMatches} trận.`,
        `Chiến thuật thông minh của ${p.name} giúp thắng ${stats.deuceMatches} trận kéo dài hơn bình thường sau ${stats.totalMatches} lần ra sân.`,
        `${p.name} dựa vào trí tuệ để thắng các trận đấu kéo dài ${stats.deuceMatches} lần (tỉ số vượt quá 11) trong ${stats.totalMatches} trận.`,
        `${stats.deuceMatches} trận thắng kéo dài (12-12 trở lên) cho thấy ${p.name} biết cách giữ bình tĩnh qua ${stats.totalMatches} trận đã chơi.`,
        `${p.name} thể hiện trí tuệ qua ${stats.deuceMatches} lần thắng các trận đấu kéo dài bất thường trong tổng số ${stats.totalMatches} trận.`
      ], [p.name], 'individual');
    }

    // 🎲 RỦI RO THẤP (Kịch bản #39)
    if (stats.totalPoints < 30) {
      addInsight('risk_low', '🎲 RỦI RO THẤP', [
        `${p.name} có mức rủi ro thấp với chỉ ${stats.totalPoints} điểm tổng cộng sau ${stats.totalMatches} trận.`,
        `Những trận đấu của ${p.name} ít biến động điểm số qua ${stats.totalMatches} trận → rủi ro giảm thiểu tối đa.`,
        `${p.name} đang chơi "an toàn" với tổng điểm chỉ ${stats.totalPoints} sau ${stats.totalMatches} lần ra sân.`,
        `Tổng điểm ${stats.totalPoints} cho thấy ${p.name} không mạo hiểm qua ${stats.totalMatches} trận đã chơi.`,
        `${p.name} có chiến thuật "không rủi ro" với chỉ ${stats.totalPoints} điểm tích lũy sau ${stats.totalMatches} trận.`
      ], [p.name], 'individual');
    }

    // 🤝 HỢP TÁC (Kịch bản #43)
    if (stats.totalMatches >= 8 && stats.closeWins >= 3 && stats.dominantWins >= 3) {
      addInsight('cooperate', '🤝 HỢP TÁC', [
        `${p.name} và đồng đội cùng thắng ${stats.closeWins + stats.dominantWins} lần trong tổng số ${stats.totalMatches} trận đã phối hợp.`,
        `${p.name} thể hiện tinh thần đồng đội qua ${stats.closeWins + stats.dominantWins} chiến thắng sau ${stats.totalMatches} lần sát cánh.`,
        `Đội ngũ của ${p.name} cùng nhau giành ${stats.closeWins + stats.dominantWins} chiến thắng qua ${stats.totalMatches} trận đấu.`,
        `Số thắng cộng đồng của ${p.name} là ${stats.closeWins + stats.dominantWins} – minh chứng hợp tác sau ${stats.totalMatches} trận.`,
        `${p.name} và đồng đội ghi được ${stats.closeWins + stats.dominantWins} chiến thắng chung trong ${stats.totalMatches} trận.`
      ], [p.name], 'partnership');
    }

    // 📊 THỐNG KÊ (Kịch bản #47)
    if (stats.totalMatches >= 5) {
      const avgPoints = Math.round(stats.totalPoints / stats.totalMatches);
      addInsight('stats_overview', '📊 THỐNG KÊ', [
        `${p.name} đã chơi ${stats.totalMatches} trận, ghi trung bình ${avgPoints} điểm mỗi trận.`,
        `Thống kê ${p.name}: ${stats.totalMatches} trận, trung bình ${avgPoints} điểm/trận.`,
        `${p.name} có trung bình ${avgPoints} điểm mỗi trận qua ${stats.totalMatches} trận đã đấu.`,
        `Tổng cộng ${p.name} ghi được ${stats.totalPoints} điểm trong ${stats.totalMatches} trận (trung bình ${avgPoints} điểm/trận).`,
        `Dữ liệu ${p.name}: tham gia ${stats.totalMatches} trận, trung bình ${avgPoints} điểm/trận.`
      ], [p.name], 'individual');
    }

    // 🧱 Bị Khớp Tâm Lý (Kịch bản #30)
    const mentalBlockPerc = stats.totalMatches > 0 ? ((stats.closeLosses + stats.dominantLosses) / stats.totalMatches) * 100 : 0;
    if (stats.totalMatches >= 5 && mentalBlockPerc >= 50) {
      addInsight('mental_block', '🧱 BỊ KHỚP TÂM LÝ', [
        `${p.name} có vẻ đang gặp khó khăn tâm lý khi đối mặt với một số đối thủ nhất định – tỉ lệ khớp tâm lý ${Math.round(mentalBlockPerc)}%.`,
        `Có thể thấy ${p.name} tỏ ra e ngại khi gặp một số tay đấm cụ thể với tỉ lệ ${Math.round(mentalBlockPerc)}% bất lợi.`,
        `Phong độ của ${p.name} bị ảnh hưởng bởi yếu tố tâm lý với tỉ lệ ${Math.round(mentalBlockPerc)}%.`,
        `${p.name} cần vượt qua rào cản tâm lý khi đối đầu với một số đối thủ nhất định (${Math.round(mentalBlockPerc)}% bất lợi).`,
        `Một số đối thủ dường như "khớp" với lối chơi của ${p.name} với tỉ lệ ${Math.round(mentalBlockPerc)}%.`
      ], [p.name], 'individual');
    }

    // ⚔️ Cân Kèo (Kịch bản #31)
    if (matchExpected.has(p.id)) {
      const { winProb, loseProb } = matchExpected.get(p.id)!;
      const oddsDiff = winProb - loseProb;
      if (Math.abs(oddsDiff) >= 0.2) {
        const sentiment = oddsDiff > 0 ? 'khả quan' : 'thận trọng';
        addInsight('odds', '⚔️ CÂN KÈO', [
          `Dựa trên ELO, ${p.name} được đánh giá có cơ hội thắng khoảng ${Math.round(winProb * 100)}%.`,
          `Theo tính toán máy, ${p.name} có ${Math.round(winProb * 100)}% cơ hội thắng và ${Math.round(loseProb * 100)}% có thể thua.`,
          `Đối với ${p.name}, tỉ lệ kỳ vọng là ${Math.round(winProb * 100)}% thắng – triển vọng khá ${sentiment}.`,
          `Máy tính dự đoán ${p.name} có khoảng ${Math.round(winProb * 100)}% khả năng giành chiến thắng.`,
          `Căn cứ vào ELO, ${p.name} nằm ở thế ${sentiment} với tỉ lệ kỳ vọng ${Math.round(winProb * 100)}%.`
        ], [p.name], 'fun');
      }
    }

    // 🏃‍♂️ Đối Thủ Đánh Lớn (Kịch bản #32)
    if (stats.totalMatches >= 5) {
      const opponents = board.filter(q => q.id !== p.id);
      opponents.forEach(op => {
        const oppStats = playerStats.get(op.id);
        if (!oppStats) return;
        const oppWR = oppStats.totalMatches > 0 ? ((oppStats.closeWins + oppStats.dominantWins) / oppStats.totalMatches) * 100 : 0;
        if (oppWR >= 70 && oppStats.totalMatches >= 3) {
          const oppWins = oppStats.closeWins + oppStats.dominantWins;
          addInsight('rival_powerhouse', '🏃‍♂️ ĐỐI THỦ MẠNH', [
            `${op.name} là một đối thủ đáng gờm với tỉ lệ thắng ${Math.round(oppWR)}% (thắng ${oppWins}/${oppStats.totalMatches} trận) – cần chú ý khi đấu.`,
            `${op.name} đang có phong độ cực cao với tỉ lệ thắng ${Math.round(oppWR)}% (thắng ${oppWins}/${oppStats.totalMatches} trận) – đối thủ không hề dễ chơi.`,
            `Với tỉ lệ thắng ${Math.round(oppWR)}%, ${op.name} cho thấy đẳng cấp vượt trội trong ${oppStats.totalMatches} trận đã đấu.`,
            `${op.name} đang là \"quái vật\" trên sân với tỉ lệ thắng ${Math.round(oppWR)}% (thắng ${oppWins}/${oppStats.totalMatches} trận).`,
            `Cẩn thận với ${op.name} – đối thủ này đang sở hữu ${Math.round(oppWR)}% thắng trong ${oppStats.totalMatches} trận.`
          ], [p.name, op.name], 'rivalry');
        }
      });
    }

    // 🪂 Đối Thủ Yếu Hơn (Kịch bản #33)
    if (stats.totalMatches >= 5) {
      const opponents = board.filter(q => q.id !== p.id);
      opponents.forEach(op => {
        const oppStats = playerStats.get(op.id);
        if (!oppStats) return;
        const oppWR = oppStats.totalMatches > 0 ? ((oppStats.closeWins + oppStats.dominantWins) / oppStats.totalMatches) * 100 : 0;
        if (oppWR <= 30 && oppStats.totalMatches >= 3) {
          const oppWins = oppStats.closeWins + oppStats.dominantWins;
          addInsight('underdog_rival', '🪂 ĐỐI THỦ YẾU', [
            `${op.name} đang gặp khó khăn khi chỉ thắng ${oppWins} trận trong tổng số ${oppStats.totalMatches} trận (${Math.round(oppWR)}%).`,
            `${p.name} có thể tự tin đấu với ${op.name} vì đối thủ này chỉ thắng ${oppWins}/${oppStats.totalMatches} trận (${Math.round(oppWR)}%).`,
            `${op.name} dường như đang trong giai đoạn khó khăn khi chỉ thắng ${oppWins} trận trong ${oppStats.totalMatches} trận.`,
            `${op.name} cần cải thiện nhiều khi chỉ thắng ${oppWins} trận trong ${oppStats.totalMatches} trận.`,
            `${p.name} có thể tận dụng phong độ yếu của ${op.name} (thắng ${oppWins}/${oppStats.totalMatches} trận) để gia tăng chiến thắng.`
          ], [p.name, op.name], 'rivalry');
        }
      });
    }

    // 🏁 KẾT THÚC (Kịch bản #50)
    if (stats.totalMatches >= 30) {
      addInsight('finish', '🏁 KẾT THÚC HÀNH TRÌNH', [
        `${p.name} đã có một hành trình dài với ${stats.totalMatches} trận đấu – kinh nghiệm dồi dào!`,
        `Sau ${stats.totalMatches} trận, ${p.name} đã tích lũy được rất nhiều bài học quý giá.`,
        `${p.name} hoàn thành giai đoạn kinh nghiệm với ${stats.totalMatches} trận trên sân Pickleball.`,
        `Hành trình Pickleball của ${p.name} đã ghi dấu ấn qua ${stats.totalMatches} trận đấu.`,
        `${p.name} đã chứng tỏ sự bền bỉ với ${stats.totalMatches} trận tham gia – một người chơi thực thụ.`
      ], [p.name], 'individual');
    }
  });

  // 3. GENERATE PARTNER & RIVAL INSIGHTS
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
          `Cứ ráp ${n1} & ${n2} vào nhau là nắm chắc phần thắng. Phép thuật tạo ra tỉ lệ thắng chung ${Math.round(wr)}% là đây!`,
          `Sự bọc lót giữa ${n1} và ${n2} đạt độ hoàn hảo, dường như họ đọc được suy nghĩ của nhau, mang về tỉ lệ thắng chung lên tới ${Math.round(wr)}%.`
        ], [n1, n2], 'partnership');
      } else if (wr <= 25) {
        addInsight('bad_synergy', '⚓ DẪM CHÂN NHAU', [
          `${n1} và ${n2} dường như chưa tìm được tiếng nói chung, thường xuyên giẫm chân nhau khiến tỉ lệ thắng chỉ đạt ${Math.round(wr)}%.`,
          `Khắc rơi lối chơi! Việc ${n1} ghép cặp với ${n2} đang tự làm khó cả hai với tỉ lệ thắng vỏn vẹn ${Math.round(wr)}%.`
        ], [n1, n2], 'partnership');
      } else if (wr >= 45 && wr <= 55) {
        addInsight('neutral_duo', '⚖️ TRÒN VAI', [
          `Sau ${v.t} trận sát cánh, ${n1} và ${n2} chứng tỏ họ là một cặp đôi ổn định. Cả hai đều chơi đúng phong độ, không ai gánh ai quá nhiều.`,
          `Ra sân tìm nhau ${v.t} lần, ${n1} và ${n2} thi đấu vừa vặn, đúng với khả năng của mỗi người.`
        ], [n1, n2], 'partnership');
      }
    }
  });

  // 🦅 Thiên Địch (Kịch bản #24) - Head-to-Head Analysis
  const h2h = new Map<string, number>(); // format: "winnerId|loserId" -> count
  matches.forEach(m => {
    const winners = [m.win_1, m.win_2].filter(Boolean) as string[];
    const losers = [m.lose_1, m.lose_2].filter(Boolean) as string[];
    winners.forEach(w => {
      losers.forEach(l => {
        const k = `${w}|${l}`;
        h2h.set(k, (h2h.get(k) || 0) + 1);
      });
    });
  });

  h2h.forEach((wins, key) => {
    if (wins >= 3) {
      const [wId, lId] = key.split('|');
      const wName = getName(wId);
      const lName = getName(lId);
      
      addInsight('nemesis', '🦅 THIÊN ĐỊCH', [
        `Cứ gặp ${wName} là ${lName} lại tắt điện! Lịch sử ghi nhận ${wName} đã ${wins} lần gieo sầu cho đối thủ này.`,
        `${wName} chính là khắc tinh lớn nhất của ${lName} với ${wins} lần tiễn đối phương về chầu trời.`,
        `Đứng trước ${wName}, dường như ${lName} bị khớp tâm lý hoàn toàn (thua ${wins} trận).`,
        `${wName} đã bỏ túi hoàn toàn lối chơi của ${lName}. Cửa phản kháng là quá hẹp với ${wins} lần bại trận.`,
        `Một sự áp đảo tàn nhẫn! ${wName} dường như biết trước mọi đường bóng của ${lName}, thắng ${wins} lần.`
      ], [wName, lName], 'rivalry');
    }
  });

  // 4. QUOTA DIVERSITY FILTER
  const finalInsights: Insight[] = [];
  const playerMentions = new Map<string, number>();
  const usedCategories = new Map<string, Set<string>>(); // player -> Set of categories
  const usedTypes = new Set<string>(); // Global Set of insight types (e.g., 'clutch', 'deuce')

  // Shuffle insights for randomness
  const shuffled = insights.sort(() => 0.5 - Math.random());

  for (const ins of shuffled) {
    if (finalInsights.length >= 6) break;

    const involved = ins.playersInvolved.filter(Boolean) as string[];
    let canAdd = true;

    // Prevent same type of insight from appearing twice (e.g., two "Vua chốt hạ")
    if (usedTypes.has(ins.type)) {
      canAdd = false;
    }

    if (canAdd) {
      for (const p of involved) {
        const mentions = playerMentions.get(p) || 0;
        if (mentions >= 2) { canAdd = false; break; }
        
        const cats = usedCategories.get(p) || new Set();
        if (cats.has(ins.category)) { canAdd = false; break; }
      }
    }

    if (canAdd) {
      finalInsights.push({ type: ins.type, title: ins.title, text: ins.text, playersInvolved: ins.playersInvolved });
      usedTypes.add(ins.type);
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
