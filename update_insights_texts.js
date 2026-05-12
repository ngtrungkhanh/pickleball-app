const fs = require('fs');
let code = fs.readFileSync('src/lib/insights.ts', 'utf8');

// 1. Revert addInsight definition
code = code.replace(
  /const addInsight = \(type: string, title: string, texts: string\[\], involved: \(string \| undefined\)\[\], category: InsightCategory, note: string = ''\) => {[\s\S]*?};/,
  `const addInsight = (type: string, title: string, texts: string[], involved: (string | undefined)[], category: InsightCategory) => {
    const randomText = texts[Math.floor(Math.random() * texts.length)];
    insights.push({ type, title, text: randomText, playersInvolved: involved, category });
  };`
);

// 2. Replace the individual blocks

code = code.replace(
  /addInsight\('hot_streak', '🔥 ĐANG VÀO FORM', \[[\s\S]*?\], \[p\.name\], 'individual', `Chuỗi thắng: \${streakVal}`\);/,
  `addInsight('hot_streak', '🔥 ĐANG VÀO FORM', [
        \`Không thể cản bước! \${p.name} đang cực cháy với chuỗi \${streakVal} trận bất bại liên tiếp. Chạm vào là bỏng tay!\`,
        \`Thắng liền \${streakVal} trận, \${p.name} dường như đã tìm ra công thức chiến thắng tối thượng.\`,
        \`Phong độ của \${p.name} đang ở đỉnh cao, \${streakVal} đối thủ gần nhất đều đã phải ôm hận rời sân.\`,
        \`\${p.name} đang thăng hoa với chuỗi thắng \${streakVal} trận. Hãy xem ai có thể cản bước!\`,
        \`Máy ghi điểm mang tên \${p.name} đã thông nòng, càn quét giải đấu với \${streakVal} chiến thắng liên tiếp.\`
      ], [p.name], 'individual');`
);

code = code.replace(
  /addInsight\('cold_streak', '😔 CHUỖI ĐEN', \[[\s\S]*?\], \[p\.name\], 'individual', `Chuỗi thua: \${streakVal}`\);/,
  `addInsight('cold_streak', '😔 CHUỖI ĐEN', [
        \`\${p.name} đang gặp khủng hoảng nhẹ khi để thua tới \${streakVal} trận liên tiếp.\`,
        \`Cần một liệu pháp tâm lý khẩn cấp cho \${p.name} sau chuỗi \${streakVal} trận toàn thua cay đắng.\`,
        \`\${p.name} đang lạc lối với \${streakVal} thất bại liên tiếp. Đã đến lúc đi giải hạn đổi phong thủy?\`,
        \`Có vẻ \${p.name} đang bị vận đen đeo bám suốt \${streakVal} trận qua chưa biết mùi chiến thắng.\`,
        \`Kéo dài chuỗi thua lên con số \${streakVal}, \${p.name} đang rất khát khao một trận đấu gỡ gạc danh dự!\`
      ], [p.name], 'individual');`
);

code = code.replace(
  /addInsight\('dominator', '⭐ KẺ HỦY DIỆT', \[[\s\S]*?\], \[p\.name\], 'individual', `Tỉ lệ thắng: \${Math\.round\(winRate\)}%`\);/,
  `addInsight('dominator', '⭐ KẺ HỦY DIỆT', [
        \`Với tỉ lệ thắng chạm mốc \${Math.round(winRate)}%, \${p.name} đang là nỗi khiếp sợ thực sự của giải đấu.\`,
        \`Ra sân là nắm chắc phần thắng! Con số \${Math.round(winRate)}% win rate chứng minh \${p.name} đang out trình.\`,
        \`Duy trì tỉ lệ chiến thắng \${Math.round(winRate)}%, \${p.name} đang sở hữu một phong độ mà ai cũng khao khát.\`,
        \`\${p.name} đang thống trị sân bóng với \${Math.round(winRate)}% số trận thắng. Đẳng cấp quá khác biệt.\`,
        \`Không thể cản phá! \${p.name} càn quét mọi đối thủ, bỏ túi tỉ lệ thắng lên tới \${Math.round(winRate)}%.\`
      ], [p.name], 'individual');`
);

code = code.replace(
  /addInsight\('struggling', '📉 ĐANG CHẬT VẬT', \[[\s\S]*?\], \[p\.name\], 'individual', `Tỉ lệ thắng: \${Math\.round\(winRate\)}%`\);/,
  `addInsight('struggling', '📉 ĐANG CHẬT VẬT', [
        \`Chỉ thắng vỏn vẹn \${Math.round(winRate)}% số trận, \${p.name} cần nghiêm túc xem lại chiến thuật của mình.\`,
        \`Có vẻ \${p.name} vẫn đang trong giai đoạn làm quen sân bãi với tỉ lệ thắng khiêm tốn \${Math.round(winRate)}%.\`,
        \`Chỉ đạt \${Math.round(winRate)}% tỉ lệ thắng từ đầu giải, \${p.name} cần tập trung cao độ hơn ở các trận tới.\`,
        \`\${p.name} đang là "mỏ điểm" của giải đấu khi tỉ lệ thắng hiện tại chỉ dừng ở mức \${Math.round(winRate)}%.\`,
        \`Cần một khóa huấn luyện khẩn cấp cho \${p.name} khi hiệu suất chiến thắng chỉ quanh quẩn ở mức \${Math.round(winRate)}%.\`
      ], [p.name], 'individual');`
);

code = code.replace(
  /addInsight\('clutch', '💪 VUA CHỐT HẠ', \[[\s\S]*?\], \[p\.name\], 'individual', `Thắng sát nút: \${stats\.closeWins} trận`\);/,
  `addInsight('clutch', '💪 VUA CHỐT HẠ', [
        \`Chuyên gia thử thách nhịp tim! \${p.name} có tới \${stats.closeWins} lần chốt hạ đối thủ ở những điểm số nghẹt thở.\`,
        \`Bản lĩnh thép! \${p.name} luôn lạnh lùng dứt điểm đối phương mang về \${stats.closeWins} chiến thắng sát nút.\`,
        \`Chỉ cần điểm rơi vào Match-point, \${p.name} chưa bao giờ làm anh em thất vọng với \${stats.closeWins} lần lật kèo phút chót.\`,
        \`Cứ đánh giằng co là tự động bật Mode Quái vật. \${p.name} đã vượt ải thành công \${stats.closeWins} trận sát nút.\`,
        \`Những trận đấu của \${p.name} luôn cần thuốc trợ tim cho khán giả, minh chứng là \${stats.closeWins} lần thắng nghẹt thở.\`
      ], [p.name], 'individual');`
);

code = code.replace(
  /addInsight\('heartbreaker', '💔 THÁNH NHỌ', \[[\s\S]*?\], \[p\.name\], 'individual', `Thua sát nút: \${stats\.closeLosses} trận`\);/,
  `addInsight('heartbreaker', '💔 THÁNH NHỌ', [
        \`\${p.name} quả thực là Thánh Nhọ của giải với \${stats.closeLosses} lần gục ngã đáng tiếc ở những điểm số quyết định.\`,
        \`Yếu bóng vía hay do tâm linh? \${p.name} đã đánh rơi chiến thắng sát nút tới \${stats.closeLosses} lần.\`,
        \`Chỉ thiếu đúng một chút may mắn nữa thôi, \${p.name} đã để vuột mất \${stats.closeLosses} trận cầu căng thẳng.\`,
        \`Vua về nhì trong các kèo đấu sòng phẳng. \${p.name} đã ngậm ngùi thua \${stats.closeLosses} trận với tỉ số sát nút.\`,
        \`Khán giả luôn phải ôm đầu tiếc nuối cho \${p.name} sau \${stats.closeLosses} lần gục ngã ngay trước vạch đích.\`
      ], [p.name], 'individual');`
);

code = code.replace(
  /addInsight\('merciless', '🪓 BÀN TAY SẮT', \[[\s\S]*?\], \[p\.name\], 'individual', `Thắng hủy diệt: \${stats\.dominantWins} trận`\);/,
  `addInsight('merciless', '🪓 BÀN TAY SẮT', [
        \`\${p.name} ra tay quá tàn nhẫn! Có tới \${stats.dominantWins} nạn nhân đã bị anh hủy diệt với tỉ số cách biệt sâu.\`,
        \`Đánh không cho đối phương gỡ danh dự! \${p.name} đã "đóng hòm" \${stats.dominantWins} trận với thế trận áp đảo hoàn toàn.\`,
        \`Đứng trước \${p.name} là xác định mất điện. Đã có \${stats.dominantWins} đối thủ bị dội gáo nước lạnh không kịp ngáp.\`,
        \`Sức mạnh hủy diệt tuyệt đối. \${p.name} có thói quen kết liễu trận đấu chóng vánh, ghi nhận \${stats.dominantWins} trận thắng áp đảo.\`,
        \`Một khi \${p.name} đã nghiêm túc, đối thủ chỉ biết cất vợt xin hàng sau \${stats.dominantWins} chiến thắng quá chênh lệch.\`
      ], [p.name], 'individual');`
);

code = code.replace(
  /addInsight\('top_scorer', '⚽ VUA PHÁ LƯỚI', \[[\s\S]*?\], \[p\.name\], 'individual', `Tổng điểm: \${stats\.totalPoints}`\);/,
  `addInsight('top_scorer', '⚽ VUA PHÁ LƯỚI', [
        \`Cỗ máy bào điểm chăm chỉ nhất giải! \${p.name} đã tự tay ghi tổng cộng \${stats.totalPoints} điểm kể từ đầu mùa.\`,
        \`Vua phá lưới gọi tên \${p.name} với thành tích gom nhặt được \${stats.totalPoints} điểm qua các trận đấu.\`,
        \`Kẻ đánh cắp điểm số! \${p.name} đã bỏ túi \${stats.totalPoints} điểm, một con số thể hiện sự cống hiện tuyệt đối.\`,
        \`Thành tích \${stats.totalPoints} điểm của \${p.name} là minh chứng rõ nhất cho việc "Năng nhặt chặt bị" trên sân Pickleball.\`,
        \`Dù thắng hay thua, \${p.name} vẫn luôn là người xả đạn miệt mài nhất, mang về \${stats.totalPoints} điểm tổng.\`
      ], [p.name], 'individual');`
);

code = code.replace(
  /addInsight\('ghost', '👻 CHUYÊN GIA BÙNG KÈO', \[[\s\S]*?\], \[p\.name\], 'individual', `Vắng mặt: \${absentDays} buổi`\);/,
  `addInsight('ghost', '👻 CHUYÊN GIA BÙNG KÈO', [
        \`Cảnh sát điểm danh! Hội tổ chức đánh rất đều nhưng \${p.name} thì đã bặt vô âm tín tới \${absentDays} buổi.\`,
        \`Đóng họ để giữ chỗ! \${p.name} đang quán quân trong danh sách lười ra sân với \${absentDays} ngày báo vắng.\`
      ], [p.name], 'individual');`
);

code = code.replace(
  /addInsight\('mercenary', '🏕️ LÍNH ĐÁNH THUÊ', \[[\s\S]*?\], \[p\.name\], 'individual', `Chỉ tham gia: \${p\.total} trận`\);/,
  `addInsight('mercenary', '🏕️ LÍNH ĐÁNH THUÊ', [
        \`Hoạt động cầm chừng! \${p.name} dường như đóng họ chỉ để làm khán giả khi mới ra sân vỏn vẹn \${p.total} trận.\`,
        \`Khách mời danh dự của giải đấu. Số trận thực chiến của \${p.name} đang ở mức báo động đỏ: \${p.total} trận.\`
      ], [p.name], 'individual');`
);

code = code.replace(
  /addInsight\('mia', '⏳ MAI DANH ẨN TÍCH', \[[\s\S]*?\], \[p\.name\], 'individual', `Không ra sân: \${diffDays} ngày`\);/,
  `addInsight('mia', '⏳ MAI DANH ẨN TÍCH', [
        \`\${p.name} đã quy ẩn giang hồ được \${diffDays} ngày. Anh em đang ráo riết dán lệnh truy nã!\`,
        \`Mọi người đang rất nhớ những cú đánh lỗi của \${p.name}. Đã qua \${diffDays} ngày, hãy mau chóng xỏ giày ra sân!\`
      ], [p.name], 'individual');`
);

code = code.replace(
  /addInsight\('underdog', '🎢 CHUYÊN GIA LẬT KÈO', \[[\s\S]*?\], \[p\.name\], 'individual', `Lật kèo: \${stats\.upsets} trận`\);/,
  `addInsight('underdog', '🎢 CHUYÊN GIA LẬT KÈO', [
        \`Chấp luôn cả chỉ số máy tính! \${p.name} vừa tạo ra cơn địa chấn khi đánh bại đối thủ cửa trên tới \${stats.upsets} lần.\`,
        \`Đừng bao giờ khinh thường cửa dưới. \${p.name} đã \${stats.upsets} lần chứng minh rằng ELO không phải là tất cả.\`
      ], [p.name], 'individual');`
);

code = code.replace(
  /addInsight\('deuce', '🥵 KẺ ĐAM MÊ DEUCE', \[[\s\S]*?\], \[p\.name\], 'individual', `Kéo Deuce: \${stats\.deuceMatches} trận`\);/,
  `addInsight('deuce', '🥵 KẺ ĐAM MÊ DEUCE', [
        \`Không Deuce không về! \${p.name} có tới \${stats.deuceMatches} trận mắc hội chứng kéo dài tỉ số vượt mốc 11.\`,
        \`Vua dây dưa! Đánh với \${p.name} thì xác định phải bào thể lực với \${stats.deuceMatches} trận đấu nghẹt thở extra point.\`
      ], [p.name], 'individual');`
);

code = code.replace(
  /addInsight\('perfect_duo', '🤝 CẶP BÀI TRÙNG', \[[\s\S]*?\], \[n1, n2\], 'partnership', `Tỉ lệ thắng: \${Math\.round\(wr\)}%`\);/,
  `addInsight('perfect_duo', '🤝 CẶP BÀI TRÙNG', [
          \`Cứ ráp \${n1} & \${n2} vào nhau là nắm chắc phần thắng. Phép thuật tạo ra tỉ lệ thắng \${Math.round(wr)}% là đây!\`,
          \`Sự bọc lót giữa \${n1} và \${n2} đạt độ hoàn hảo, dường như họ đọc được suy nghĩ của nhau để vươn tới win rate \${Math.round(wr)}%.\`
        ], [n1, n2], 'partnership');`
);

code = code.replace(
  /addInsight\('bad_synergy', '⚓ DẪM CHÂN NHAU', \[[\s\S]*?\], \[n1, n2\], 'partnership', `Tỉ lệ thắng: \${Math\.round\(wr\)}%`\);/,
  `addInsight('bad_synergy', '⚓ DẪM CHÂN NHAU', [
          \`\${n1} và \${n2} dường như chưa tìm được tiếng nói chung, thường xuyên giẫm chân nhau khiến tỉ lệ thắng rớt xuống \${Math.round(wr)}%.\`,
          \`Khắc rơ lối chơi! Việc \${n1} ghép cặp với \${n2} đang tự làm khó cả hai với vỏn vẹn \${Math.round(wr)}% win rate.\`
        ], [n1, n2], 'partnership');`
);

code = code.replace(
  /addInsight\('neutral_duo', '⚖️ TRÒN VAI', \[[\s\S]*?\], \[n1, n2\], 'partnership', `Tỉ lệ thắng: \${Math\.round\(wr\)}%`\);/,
  `addInsight('neutral_duo', '⚖️ TRÒN VAI', [
          \`Sau \${v.t} trận sát cánh, \${n1} và \${n2} chứng tỏ họ là một cặp đôi ổn định. Không ai gánh ai, cũng không ai làm tạ.\`,
          \`Ra sân tìm nhau \${v.t} lần, \${n1} và \${n2} thi đấu vừa vặn, đúng với phong độ vốn có của mỗi người.\`
        ], [n1, n2], 'partnership');`
);

fs.writeFileSync('src/lib/insights.ts', code);
console.log('Update Complete!');
