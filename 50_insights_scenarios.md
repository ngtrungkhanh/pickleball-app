# 📊 BỘ SƯU TẬP 50 KỊCH BẢN "CHECK VAR" PICKLEBALL (250 BIẾN THỂ)

Tất cả 50 kịch bản dưới đây đều được thiết kế để **có thể lập trình bằng Data thực tế** (Win/Lose, Tỉ số, Chuỗi trận, Thời gian, ELO) mà không cần nhập tay. Các thông số [X], [Y] sẽ được truyền trực tiếp vào câu một cách tự nhiên nhất.

---

## PHẦN 1: CÁ NHÂN & PHONG ĐỘ (15 Kịch Bản)

### 1. 🔥 Đang Vào Form (Hot Streak)
*Điều kiện:* Có chuỗi thắng >= 3 trận hiện tại. (Truyền vào [X] = số trận chuỗi thắng)
1. `Không thể cản bước! [Tên] đang cực cháy với chuỗi [X] trận bất bại liên tiếp. Chạm vào là bỏng tay!`
2. `Thắng liền [X] trận, [Tên] dường như đã tìm ra công thức chiến thắng tối thượng.`
3. `Phong độ của [Tên] đang ở đỉnh cao, [X] đối thủ gần nhất đều đã phải ôm hận rời sân.`
4. `[Tên] đang thăng hoa với chuỗi thắng [X] trận. Hãy xem ai có thể cản bước!`
5. `Máy ghi điểm mang tên [Tên] đã thông nòng, càn quét giải đấu với [X] chiến thắng liên tiếp.`

### 2. 😔 Chuỗi Đen (Cold Streak)
*Điều kiện:* Có chuỗi thua >= 3 trận hiện tại. (Truyền vào [X] = số trận chuỗi thua)
1. `[Tên] đang gặp khủng hoảng nhẹ khi để thua tới [X] trận liên tiếp.`
2. `Cần một liệu pháp tâm lý khẩn cấp cho [Tên] sau chuỗi [X] trận toàn thua cay đắng.`
3. `[Tên] đang lạc lối với [X] thất bại liên tiếp. Đã đến lúc đi giải hạn đổi phong thủy?`
4. `Có vẻ [Tên] đang bị vận đen đeo bám suốt [X] trận qua chưa biết mùi chiến thắng.`
5. `Kéo dài chuỗi thua lên con số [X], [Tên] đang rất khát khao một trận đấu gỡ gạc danh dự!`

### 3. ⭐ Kẻ Hủy Diệt (Dominator)
*Điều kiện:* Tỉ lệ thắng tổng >= 70% (tối thiểu 8 trận). (Truyền vào [X] = Tỉ lệ thắng %)
1. `Với tỉ lệ thắng chạm mốc [X]%, [Tên] đang là nỗi khiếp sợ thực sự của giải đấu.`
2. `Ra sân là nắm chắc phần thắng! Con số [X]% win rate chứng minh [Tên] đang out trình.`
3. `Duy trì tỉ lệ chiến thắng [X]%, [Tên] đang sở hữu một phong độ mà ai cũng khao khát.`
4. `[Tên] đang thống trị sân bóng với [X]% số trận thắng. Đẳng cấp quá khác biệt.`
5. `Không thể cản phá! [Tên] càn quét mọi đối thủ, bỏ túi tỉ lệ thắng lên tới [X]%.`

### 4. 📉 Đang Chật Vật (Struggling)
*Điều kiện:* Tỉ lệ thắng tổng <= 30% (tối thiểu 8 trận). (Truyền vào [X] = Tỉ lệ thắng %)
1. `Chỉ thắng vỏn vẹn [X]% số trận, [Tên] cần nghiêm túc xem lại chiến thuật của mình.`
2. `Có vẻ [Tên] vẫn đang trong giai đoạn làm quen sân bãi với tỉ lệ thắng khiêm tốn [X]%.`
3. `Chỉ đạt [X]% tỉ lệ thắng từ đầu giải, [Tên] cần tập trung cao độ hơn ở các trận tới.`
4. `[Tên] đang là "mỏ điểm" của giải đấu khi tỉ lệ thắng hiện tại chỉ dừng ở mức [X]%.`
5. `Cần một khóa huấn luyện khẩn cấp cho [Tên] khi hiệu suất chiến thắng chỉ quanh quẩn ở mức [X]%.`

### 5. 🚜 Trâu Cày / Vua Thể Lực (Ironman)
*Điều kiện:* Số trận thi đấu trong 1 ngày cao nhất. (Truyền vào [X] = số trận trong 1 ngày)
1. `Nền tảng thể lực vô cực! [Tên] giữ kỷ lục xỏ giày ra sân tới [X] trận chỉ trong một buổi.`
2. `Đánh không biết mệt! [Tên] đã bào mòn sân bóng với [X] trận liên tiếp trong ngày hôm đó.`
3. `Cỗ máy chạy bằng cơm mang tên [Tên] vừa hoàn tất [X] trận đấu cực căng trong một buổi.`
4. `Ban tổ chức xin trao giải "Người cõi trên" cho [Tên] vì thể lực bào [X] trận/ngày.`
5. `Ai hụt hơi thì hụt chứ [Tên] vẫn dư sức cày ải [X] trận một buổi dễ như ăn kẹo.`

### 6. 💪 Vua Chốt Hạ (Clutch Master)
*Điều kiện:* Thắng sát nút (cách biệt 2 điểm: 11-9, 12-10) nhiều nhất. (Truyền vào [X] = số trận thắng sát nút)
1. `Chuyên gia thử thách nhịp tim! [Tên] có tới [X] lần chốt hạ đối thủ ở những điểm số nghẹt thở.`
2. `Bản lĩnh thép! [Tên] luôn lạnh lùng dứt điểm đối phương mang về [X] chiến thắng sát nút.`
3. `Chỉ cần điểm rơi vào Match-point, [Tên] chưa bao giờ làm anh em thất vọng với [X] lần lật kèo phút chót.`
4. `Cứ đánh giằng co là tự động bật Mode Quái vật. [Tên] đã vượt ải thành công [X] trận sát nút.`
5. `Những trận đấu của [Tên] luôn cần thuốc trợ tim cho khán giả, minh chứng là [X] lần thắng nghẹt thở.`

### 7. 💔 Thánh Nhọ (Heartbreaker)
*Điều kiện:* Thua sát nút (9-11, 10-12) nhiều nhất. (Truyền vào [X] = số trận thua sát nút)
1. `[Tên] quả thực là Thánh Nhọ của giải với [X] lần gục ngã đáng tiếc ở những điểm số quyết định.`
2. `Yếu bóng vía hay do tâm linh? [Tên] đã đánh rơi chiến thắng sát nút tới [X] lần.`
3. `Chỉ thiếu đúng một chút may mắn nữa thôi, [Tên] đã để vuột mất [X] trận cầu căng thẳng.`
4. `Vua về nhì trong các kèo đấu sòng phẳng. [Tên] đã ngậm ngùi thua [X] trận với tỉ số sát nút.`
5. `Khán giả luôn phải ôm đầu tiếc nuối cho [Tên] sau [X] lần gục ngã ngay trước vạch đích.`

### 8. 🪓 Bàn Tay Sắt / Vua Đồ Sát (Merciless)
*Điều kiện:* Số trận thắng áp đảo (cách biệt >= 7 điểm) nhiều nhất. (Truyền vào [X] = số trận thắng áp đảo)
1. `[Tên] ra tay quá tàn nhẫn! Có tới [X] nạn nhân đã bị anh hủy diệt với tỉ số cách biệt sâu.`
2. `Đánh không cho đối phương gỡ danh dự! [Tên] đã "đóng hòm" [X] trận với thế trận áp đảo hoàn toàn.`
3. `Đứng trước [Tên] là xác định mất điện. Đã có [X] đối thủ bị dội gáo nước lạnh không kịp ngáp.`
4. `Sức mạnh hủy diệt tuyệt đối. [Tên] có thói quen kết liễu trận đấu chóng vánh, ghi nhận [X] trận thắng áp đảo.`
5. `Một khi [Tên] đã nghiêm túc, đối thủ chỉ biết cất vợt xin hàng sau [X] chiến thắng quá chênh lệch.`

### 9. 🩹 Tai Nạn Giao Thông (Unlucky Bagel)
*Điều kiện:* Vừa thua một trận thảm họa (Chỉ ghi được <= 2 điểm). (Truyền vào [X] = số điểm ghi được)
1. `Trận thua thảm họa chỉ ghi được [X] điểm vừa qua quả thực là một tai nạn giao thông của [Tên].`
2. `Sập nguồn đột ngột! [Tên] vừa trải qua một trận đấu quên mang theo nhịp điệu khi chỉ lên được [X] điểm.`
3. `Chỉ vớt vát được [X] điểm danh dự, trận thua thảm họa vừa rồi chắc chắn sẽ khiến [Tên] mất ngủ đêm nay.`
4. `Cần một chầu bia để giải đen gấp cho [Tên] sau trận đấu "cất vợt" kết thúc với [X] điểm ít ỏi.`
5. `Không thể nhận ra [Tên] trong trận đấu bị dội gáo nước lạnh vừa rồi, chỉ kịp ghi [X] điểm trước khi rời sân.`

### 10. ⚽ Vua Phá Lưới (Top Scorer)
*Điều kiện:* Tổng điểm số cá nhân kiếm được trên sân (win_score) cao nhất. (Truyền vào [X] = tổng điểm)
1. `Cỗ máy bào điểm chăm chỉ nhất giải! [Tên] đã tự tay ghi tổng cộng [X] điểm kể từ đầu mùa.`
2. `Vua phá lưới gọi tên [Tên] với thành tích gom nhặt được [X] điểm qua các trận đấu.`
3. `Kẻ đánh cắp điểm số! [Tên] đã bỏ túi [X] điểm, một con số thể hiện sự cống hiện tuyệt đối.`
4. `Thành tích [X] điểm của [Tên] là minh chứng rõ nhất cho việc "Năng nhặt chặt bị" trên sân Pickleball.`
5. `Dù thắng hay thua, [Tên] vẫn luôn là người xả đạn miệt mài nhất, mang về [X] điểm tổng.`

### 11. 🦋 Lột Xác Ngoạn Mục (Most Improved)
*Điều kiện:* Tỉ lệ thắng 5 trận gần nhất cao hơn lịch sử >= 20%. (Truyền vào [X] = % tăng lên)
1. `Sự lột xác đáng kinh ngạc! Hiệu suất gần đây của [Tên] đang tăng vọt thêm [X]% so với hồi đầu mùa.`
2. `Càng đánh càng hay! [Tên] đập tan mọi nghi ngờ với tỉ lệ thắng thăng tiến vượt bậc [X]%.`
3. `Dường như [Tên] vừa được đả thông kinh mạch. Chuỗi phong độ cực kỳ khởi sắc, tăng mạnh [X]% tỉ lệ thắng!`
4. `Ai chê [Tên] dở thì ra đây mà xem! Sự tiến bộ tăng [X]% hiệu suất trong các trận gần đây là không thể bàn cãi.`
5. `Khởi đầu chậm nhưng bứt tốc cực gắt. [Tên] đang cho thấy một bộ mặt khác hẳn với mức tăng [X]% win rate.`

### 12. 🥶 Rớt Phong Độ (Slump)
*Điều kiện:* Tỉ lệ thắng 5 trận gần nhất thấp hơn lịch sử >= 20%. (Truyền vào [X] = % giảm đi)
1. `Có vẻ [Tên] đang mất cảm giác bóng khi thành tích gần đây tụt dốc không phanh, giảm tới [X]% hiệu suất.`
2. `Cỗ máy đang có dấu hiệu quá tải! [Tên] sụt giảm [X]% tỉ lệ thắng so với dạo trước.`
3. `Đang bay cao bỗng nhiên đứt cáp. Phong độ của [Tên] đang lao dốc [X]%, tạo ra một dấu hỏi lớn.`
4. `[Tên] cần sớm tìm lại chính mình trước khi mọi thứ trôi đi quá xa, bù đắp lại [X]% hiệu suất vừa đánh mất.`
5. `Màn trình diễn của [Tên] dạo này khá nhạt nhòa, tỉ lệ thắng bốc hơi [X]%, không còn sự sắc bén như trước.`

### 13. 🚜 Khởi Động Chậm / Máy Dầu (Diesel Engine)
*Điều kiện:* Thường xuyên thua trận đầu trong ngày, nhưng thắng các trận sau. (Truyền vào [X] = số lần lội ngược dòng sau trận mở màn)
1. `Máy dầu cần thời gian làm nóng! [Tên] đã [X] lần thua trận mở màn nhưng về sau đánh rất cháy.`
2. `Đừng vội mừng khi thắng [Tên] ở hiệp 1. Đây là chuyên gia nhường kèo test sân với [X] pha lội ngược dòng sau đó.`
3. `Trận đầu ra sân của [Tên] thường chỉ để khởi động khớp gối mà thôi, [X] lần thua trước thắng sau đã chứng minh điều đó.`
4. `Luôn mở màn bằng những cú vấp ngã, nhưng [Tên] biết cách tăng tốc ở chặng sau với [X] chuỗi lật bàn.`
5. `[Tên] thuộc tuýp người càng đổ mồ hôi đánh càng thăng hoa. Chấp đối thủ trận đầu [X] lần là chuyện bình thường.`

### 14. 🔋 Tụt Pin Cuối Trận (Gassed Out)
*Điều kiện:* Thắng trận đầu nhưng thua các trận cuối cùng. (Truyền vào [X] = số lần đuối sức cuối buổi)
1. `Vua phủ đầu nhưng lại là thánh hụt hơi. [Tên] đã [X] lần hết pin rất nhanh về cuối buổi.`
2. `Chỉ nguy hiểm lúc mới ra sân! Thể lực đang là bài toán khó giải của [Tên] với [X] lần hụt hơi trận chót.`
3. `Đầu voi đuôi chuột. [Tên] đánh cực cháy trận mở màn nhưng đã [X] lần thở dốc gục ngã ở các trận sau.`
4. `Cần tài trợ ngay một lon bò húc cho [Tên] để chống lại căn bệnh tụt huyết áp cuối ngày ([X] lần bị lội ngược dòng).`
5. `[Tên] đánh rất bay ở hiệp đầu, nhưng sự tập trung thường bay mất theo mồ hôi, dẫn đến [X] lần gãy gánh cuối buổi.`

### 15. ⏳ Mai Danh Ẩn Tích (M.I.A)
*Điều kiện:* Không ra sân >= 7 ngày qua. (Truyền vào [X] = số ngày vắng mặt)
1. `Gương mặt vàng trong làng mất tích. [Tên] đã để lại một khoảng trống lớn trên sân suốt [X] ngày qua.`
2. `Thiếu vắng [Tên], quỹ liên hoan dường như đang hao hụt nghiêm trọng. Đã [X] ngày rồi chưa thấy anh tái xuất.`
3. `[Tên] đã quy ẩn giang hồ được [X] ngày. Anh em đang ráo riết dán lệnh truy nã!`
4. `Mọi người đang rất nhớ những cú đánh lỗi của [Tên]. Đã qua [X] ngày, hãy mau chóng xỏ giày ra sân!`
5. `Chắc [Tên] đang bận tu luyện bí kíp ở đâu đó. Đã [X] ngày trôi qua mà bóng dáng cao thủ vẫn bặt vô âm tín.`

---

## PHẦN 2: CẶP ĐÔI & HỢP TÁC (15 Kịch Bản)

### 16. 🤝 Cặp Bài Trùng (Perfect Duo)
*Điều kiện:* Đánh chung >= 3 trận, Winrate > 75%, kéo hiệu suất cao. (Truyền vào [A], [B], [X] = Tỉ lệ thắng cặp đôi)
1. `Cứ ráp [A] & [B] vào nhau là nắm chắc phần thắng. Phép thuật tạo ra tỉ lệ thắng [X]% là đây!`
2. `Sự bọc lót giữa [A] và [B] đạt độ hoàn hảo, dường như họ đọc được suy nghĩ của nhau để vươn tới win rate [X]%.`
3. `Không một kẽ hở! [A] & [B] đang là cặp đôi ăn ý nhất giải với sức mạnh áp đảo [X]% chiến thắng.`
4. `[A] và [B] sinh ra là để đánh chung. Tỉ lệ chiến thắng lên tới [X]% không hề biết nói dối.`
5. `Đối đầu với [A] và [B] lúc này là một bài toán vô cùng nan giải khi họ cầm chắc [X]% cơ hội thắng.`

### 17. ⚓ Lạc Nhịp / Dẫm Chân Nhau (Bad Synergy)
*Điều kiện:* Đánh chung >= 3 trận, Winrate cặp đôi cực thấp. (Truyền vào [A], [B], [X] = Tỉ lệ thắng cặp đôi)
1. `[A] và [B] dường như chưa tìm được tiếng nói chung, thường xuyên giẫm chân nhau khiến tỉ lệ thắng rớt xuống [X]%.`
2. `Khắc rơ lối chơi! Việc [A] ghép cặp với [B] đang tự làm khó cả hai với vỏn vẹn [X]% win rate.`
3. `Đánh lẻ thì hay mà cứ ghép cặp là gãy. [A] & [B] cần xem lại chiến thuật khi kết quả chỉ đạt [X]% chiến thắng.`
4. `Có sự lệch pha không hề nhẹ mỗi khi [A] và [B] đứng chung một chiến hào, thể hiện qua con số [X]% khá thảm họa.`
5. `[A] và [B] giống như hai cực cùng dấu của nam châm, đẩy nhau ra xa khỏi chiến thắng (Thắng: [X]%).`

### 18. 🏋️ Thần Gánh Tạ (The Carry)
*Điều kiện:* Kéo hiệu suất của đồng đội tăng >= 20%. (Truyền vào [A], [B], [X] = phần trăm Impact tăng thêm)
1. `[A] đích thị là Bùa Hộ Mệnh, giúp tỉ lệ thắng của [B] tăng vọt thêm [X]% so với bình quân.`
2. `[A] bao sân cực tốt để kéo phong độ của [B] lên một tầm cao mới, buff mạnh [X]% hiệu suất.`
3. `Sự xuất hiện của [A] giúp [B] đánh như lên đồng, thành tích thi đấu được kéo lên tận [X]%.`
4. `Đứng cạnh [A], [B] dường như cởi bỏ được mọi áp lực, hiệu quả thi đấu được cải thiện thêm [X]%.`
5. `[A] đã gánh vác quá hay, tạo tiền đề cho [B] tỏa sáng với mức tăng trưởng [X]% tỉ lệ thắng.`

### 19. ⚖️ Tròn Vai (Neutral Partnership)
*Điều kiện:* Đánh chung >= 5 trận, Impact dao động -5% đến +5%. (Truyền vào [A], [B], [X] = số trận đánh chung)
1. `Sau [X] trận sát cánh, [A] và [B] chứng tỏ họ là một cặp đôi ổn định. Không ai gánh ai, cũng không ai làm tạ.`
2. `Ra sân tìm nhau [X] lần, [A] và [B] thi đấu vừa vặn, đúng với phong độ vốn có của mỗi người.`
3. `Sự kết hợp giữa [A] và [B] qua [X] trận diễn ra khá mượt mà, thành tích phản ánh đúng thực lực hai bên.`
4. `[A] & [B] chơi tròn vai cùng nhau suốt [X] trận đụng độ, thắng thua sòng phẳng mà không có sự đột biến.`
5. `Cứ ráp chung là thi đấu an toàn. [A] và [B] luôn hoàn thành tốt nhiệm vụ qua [X] lần hợp tác.`

### 20. 👩‍❤️‍💋‍👨 Dính Như Sam (Inseparable)
*Điều kiện:* Cặp đôi đánh chung nhiều trận nhất giải. (Truyền vào [A], [B], [X] = số trận đánh chung)
1. `Ra sân là phải tìm nhau! [A] và [B] đã dính nhau như sam trong suốt [X] trận bất chấp kết quả.`
2. `Không thể chia lìa! [A] và [B] có số lần ghép cặp vượt trội so với phần còn lại, chạm mốc [X] trận.`
3. `Tình nghĩa anh em chắc có bền lâu? [A] và [B] luôn ưu tiên chọn nhau làm bạn đồng hành tới [X] lần.`
4. `Chỉ cần [A] nháy mắt là [B] hiểu ý ngay sau [X] lần sát cánh cày ải cùng nhau.`
5. `Hội chứng không thể rời xa gọi tên [A] và [B]. Cặp đôi chung thủy nhất giải đấu với [X] trận đôi.`

### 21. 👻 Chuyên Gia Bùng Kèo (The Ghost)
*Điều kiện:* Có số ngày vắng mặt cao nhất. (Truyền vào [Tên], [X] = số ngày vắng mặt)
1. `Cảnh sát điểm danh! Hội tổ chức đánh rất đều nhưng [Tên] thì đã bặt vô âm tín tới [X] buổi.`
2. `Đóng họ để giữ chỗ! [Tên] đang quán quân trong danh sách lười ra sân với [X] ngày báo vắng.`
3. `[Tên] rất chăm chỉ tương tác trên nhóm chat, nhưng thực tế thì vắng mặt tới [X] buổi tập.`
4. `Ban tổ chức đang cân nhắc phát lệnh truy nã [Tên] vì số buổi bùng kèo đã lên tới [X] ngày.`
5. `Đánh thì ít mà báo vắng thì nhiều. [Tên] bận rộn với mọi thứ ngoại trừ Pickleball ([X] buổi vắng mặt).`

### 22. 🏕️ Lính Đánh Thuê / Khách Mời (The Mercenary)
*Điều kiện:* Tổng số trận thi đấu ít nhất hội. (Truyền vào [Tên], [X] = số trận ra sân)
1. `Hoạt động cầm chừng! [Tên] dường như đóng họ chỉ để làm khán giả khi mới ra sân vỏn vẹn [X] trận.`
2. `Khách mời danh dự của giải đấu. Số trận thực chiến của [Tên] đang ở mức báo động đỏ: [X] trận.`
3. `Ra sân như nhỏ giọt. [Tên] cần đẩy cao cường độ thi đấu nếu không muốn cất vợt với [X] trận ít ỏi.`
4. `Không rõ [Tên] đang dưỡng sức chờ Playoff hay lười biếng với thành tích [X] trận khiêm tốn.`
5. `Thành viên VIP nhưng rất hiếm khi lộ diện. Mọi người đang mong chờ [Tên] cải thiện con số [X] trận đấu.`

### 23. 🚑 Đội Trưởng Chữ Thập Đỏ (The Mentor)
*Điều kiện:* ELO cao nhưng ghép với người ELO thấp nhiều nhất. (Truyền vào [Tên], [X] = số trận cõng tạ)
1. `Chuyên gia nhận thầu các ca khó! [Tên] đã [X] lần đóng vai trò người anh cả dìu dắt anh em tân binh.`
2. `Người hùng thầm lặng. [Tên] thường xuyên hi sinh ELO để cõng các đồng đội yếu thế hơn qua [X] trận đấu.`
3. `Ban tổ chức xin tri ân tấm lòng Bồ Tát của [Tên] vì đã [X] lần dũng cảm nhận phần tạ về mình.`
4. `[Tên] rất có khiếu sư phạm khi liên tục phải vừa đánh vừa chỉ đạo đồng đội trong suốt [X] trận qua.`
5. `Một mình [Tên] cân cả bầu trời, có tới [X] lần dũng cảm đứng chung sân với những tay vợt đang chật vật.`

### 24. 🔗 Kẻ Bám Càng / Ký Sinh (The Dependent)
*Điều kiện:* Thắng >= 5 trận, phần lớn thắng khi ghép với [B]. (Truyền vào [A], [B], [X] = % trận thắng phụ thuộc [B])
1. `Dường như sức mạnh của [A] chỉ kích hoạt khi đứng chung sân với [B], chiếm tới [X]% tổng số chiến thắng.`
2. `Mất đi [B], [A] dường như đánh mất sự tự tin. [X]% trận thắng của [A] là nhờ có [B] bọc lót.`
3. `[A] rất biết cách "nương tựa" vào đôi vai vững chãi của [B] để ôm trọn [X]% số trận thắng của mình.`
4. `Sự phụ thuộc không hề nhẹ! [X]% thành tích của [A] gắn liền mật thiết với phong độ của [B].`
5. `Nếu không có [B] kéo rank, [A] sẽ gặp vô vàn khó khăn vì đã quen dựa dẫm vào [B] trong [X]% chiến thắng.`

### 25. 📉 Đôi Cùng Tiến... Lùi (Disaster Duo)
*Điều kiện:* Đánh chung >= 4 trận nhưng tỉ lệ thắng cực thấp. (Truyền vào [A], [B], [X] = số trận đánh chung, [Y] = số trận thua)
1. `Cứ đứng cạnh nhau là rủ nhau đi xuống. [A] và [B] đã cùng nhau gục ngã [Y] trên tổng số [X] trận sát cánh.`
2. `Hai mảnh ghép không thuộc về nhau. [A] và [B] có thành tích thảm họa: Thua [Y]/[X] trận.`
3. `Nụ cười dập tắt mỗi khi [A] và [B] chung team. Có lẽ hai bạn chỉ hợp để làm đối thủ sau [Y] lần ôm hận trong [X] trận đôi.`
4. `Sự kết hợp này đang bào mòn ELO của cả hai một cách không thương tiếc với [Y] trận thua trên [X] trận.`
5. `Có tình anh em nhưng không có chiến thắng. [A] & [B] đang nợ nhau một lời xin lỗi sau [X] trận đánh chung mờ nhạt.`

### 26. 🚀 Đôi Bạn Cùng Tiến (The Ascendants)
*Điều kiện:* Cặp đôi đánh với nhau nhiều và có mức ELO cùng tăng. (Truyền vào [A], [B], [X] = số ELO kiếm được cùng nhau)
1. `Sức mạnh tình bạn! [A] và [B] đang giúp nhau leo rank vù vù, gom nhặt được [X] ELO khi sát cánh.`
2. `Bộ đôi cày ELO khét nhất giải. [A] và [B] cứ đánh chung là cùng nhau bỏ túi điểm số (+[X] ELO).`
3. `Nhờ có sự ăn ý tuyệt đối, [A] và [B] đang chia nhau chiến lợi phẩm [X] điểm ELO béo bở.`
4. `Ghép cặp để cùng nhau giàu lên. [A] và [B] kiếm được [X] ELO, là hình mẫu lý tưởng cho mọi đôi.`
5. `Cả hai đều được nâng tầm khi đứng chung một sân. [A] & [B] hốt trọn [X] ELO tiền thưởng.`

### 27. ⚔️ Huynh Đệ Tương Tàn (Friendly Fire)
*Điều kiện:* Cặp mượt khi chung team, nhưng khi đối đầu thì [A] càn quét [B]. (Truyền vào [A], [B], [X] = số trận [A] thắng [B])
1. `Đánh chung thì làm anh em, tách ra thì [A] không nương tay càn quét [B] tới [X] lần đối đầu.`
2. `[A] hiểu quá rõ điểm yếu của [B], biến người đồng đội cũ thành nạn nhân ưa thích với [X] chiến thắng.`
3. `Từng là tri kỷ nhưng giờ là ác mộng. [B] đã phải nếm mùi cay đắng [X] lần khi chạm trán [A].`
4. `Không có sự nhượng bộ nào! [A] luôn biết cách giải mã [B] khi đứng ở bên kia chiến tuyến ([X] trận thắng).`
5. `Tình anh em chỉ áp dụng khi cùng team. Khác team là [A] bật mode đồ sát [B] ngay tắp lự ([X] lần).`

### 28. 🌟 Ngôi Sao Độc Lập (The Lone Wolf)
*Điều kiện:* Tỉ lệ thắng xấp xỉ 50-60% với mọi đối tác. (Truyền vào [Tên], [X] = số partner khác nhau)
1. `Gánh team quốc dân! [Tên] đã ghép với [X] đồng đội khác nhau mà vẫn giữ vững phong độ độc lập.`
2. `Không bị ảnh hưởng bởi đồng đội. [Tên] tự tỏa sáng theo cách riêng dù ghép với [X] tay vợt khác biệt.`
3. `Dù đứng cạnh ai trong số [X] đồng đội đã thử, [Tên] vẫn đảm bảo được lối chơi sắc nét sòng phẳng.`
4. `Sự ổn định đáng kinh ngạc. Trải qua [X] bạn diễn, [Tên] không gánh ai nhưng cũng không ăn bám ai.`
5. `[Tên] là một hằng số vững chắc trong mọi phương trình ghép cặp, tự lực tự cường qua [X] tổ hợp.`

### 29. 💸 Cặp Đôi Tốn Kém (The Sponsors)
*Điều kiện:* Cặp thua nhiều nhất. (Truyền vào [A], [B], [X] = số trận thua)
1. `Bộ đôi nhà tài trợ kim cương! [A] và [B] cứ đánh chung là nộp phạt đều đặn với [X] trận thua liên đới.`
2. `[A] và [B] hợp tác rớt tiền rất nhịp nhàng qua [X] trận thua. Ban tổ chức cực kỳ yêu thích cặp đôi này.`
3. `Cứ ghép cặp là xác định đóng họ. [A] và [B] làm giàu cho quỹ liên hoan của giải qua [X] thất bại.`
4. `Sự kết hợp hoàn hảo để... đi ăn nhậu. [A] và [B] cống hiến tới [X] trận thua không ai sánh bằng.`
5. `Không xót ví mới lạ! [A] và [B] là cặp đôi chịu chi nhất mỗi khi chung đội, ôm trọn [X] trận thua.`

### 30. 🚜 Nông Dân Farm ELO (The ELO Farmer)
*Điều kiện:* >70% số trận thắng là đánh với người ELO thấp. (Truyền vào [Tên], [X] = % trận thắng gà)
1. `Cao thủ bóp gà! Tới [X]% chiến thắng của [Tên] đều đến từ việc hành hạ những anh em rank thấp.`
2. `Không cần thắng tay to, chỉ cần ăn người yếu! [Tên] là nông dân chính hiệu với [X]% trận thắng cày điểm an toàn.`
3. `Lên rank nhờ chính sách bắt nạt. Tránh né đối thủ khó, [Tên] có tới [X]% các trận thắng từ cửa trên.`
4. `Vua Farm Điểm! [X]% thành tích của [Tên] được xây dựng vững chắc trên nỗi đau của những người mới chơi.`
5. `Gặp mạnh thì khiêm tốn, gặp yếu thì tất tay. Chiến thuật farm ELO của [Tên] có tỉ lệ vặt lông tân binh lên tới [X]%.`

---

## PHẦN 3: ĐỐI ĐẦU & KHẮC CHẾ (10 Kịch Bản)

### 31. ⚔️ Thiên Địch (Nemesis)
*Điều kiện:* Đánh bại đối thủ làm giảm >= 10% hiệu suất. (Truyền vào [A], [B], [X] = % Winrate của [A] trước [B])
1. `[A] chính là cơn ác mộng lớn nhất của [B]. Cứ gặp là bắt bài với tỉ lệ thắng áp đảo [X]%!`
2. `Cứ chạm trán [B] là [A] lại đánh như lên đồng, kiểm soát hoàn toàn thế trận và nắm [X]% chiến thắng.`
3. `[A] đã bỏ túi hoàn toàn lối chơi của [B]. Cửa phản kháng là quá hẹp với win rate [X]% nghiêng về [A].`
4. `Một sự áp đảo tàn nhẫn! [A] dường như biết trước mọi đường bóng của [B], bỏ túi [X]% cơ hội thắng.`
5. `[B] chắc chắn sẽ phải toát mồ hôi hột mỗi khi thấy [A] đứng ở bên kia lưới ([A] nắm chắc [X]% chiến thắng).`

### 32. 🛡️ Bị Khớp Tâm Lý (Mental Block)
*Điều kiện:* Thua nhiều trước một đối thủ, giảm hiệu suất mạnh. (Truyền vào [A], [B], [X] = % hiệu suất bị giảm)
1. `Cứ đứng bên kia lưới là cóng tâm lý! [A] thường xuyên thi đấu dưới sức, giảm tới [X]% hiệu suất mỗi khi chạm trán [B].`
2. `[B] dường như là ngọn núi không thể vượt qua đối với tâm lý của [A], khiến hiệu suất của [A] tụt [X]%.`
3. `Mỗi khi đụng độ [B], [A] lại đánh mất chính mình và để hụt mất [X]% hiệu suất so với bình thường.`
4. `Kỵ rơ hoàn toàn! [A] luôn lúng túng khi đối đầu với [B], tự trừ đi [X]% khả năng chiến thắng.`
5. `[A] cần một liệu pháp giải tỏa tâm lý gấp để bù lại [X]% hiệu suất bị đánh rơi mỗi khi gặp [B].`

### 33. 🤝 Cân Kèo (Equal Rivals)
*Điều kiện:* Đối đầu sòng phẳng. (Truyền vào [A], [B], [X] = số trận đối đầu)
1. `Kỳ phùng địch thủ! Thành tích đối đầu giữa [A] và [B] qua [X] trận luôn bám sát với thực lực hai bên.`
2. `Không có sự bất ngờ nào, [A] chạm trán [B] luôn là một kèo đấu cân não sau [X] lần đụng độ.`
3. `Cặp đấu giữa [A] và [B] diễn ra vô cùng sòng phẳng. Đẳng cấp hai bên đã được thể hiện rõ qua [X] trận.`
4. `Kẻ tám lạng người nửa cân. [A] và [B] ăn miếng trả miếng không ai nhường ai suốt [X] trận qua.`
5. `Với phong độ chuẩn mực, [A] và [B] luôn cống hiến những màn so tài cực kỳ mãn nhãn qua [X] lần giáp mặt.`

### 34. 🏹 Kẻ Ngáng Đường / Gạt Giò (Giant Killer)
*Điều kiện:* ELO thấp nhưng hay đánh bại Top ELO. (Truyền vào [Tên], [X] = số lần lật đổ cửa trên)
1. `Robin Hood của giải đấu! Dù không ở top đầu nhưng [Tên] đã [X] lần đi cướp điểm của các ông lớn.`
2. `Chuyên gia gạt giò Top Server! [Tên] đã [X] lần reo sầu cho các tay to trên bảng xếp hạng.`
3. `Cẩn thận khi đối đầu với [Tên]! Đây là hung thần chuyên hạ bệ hạt giống số 1 với [X] chiến tích lẫy lừng.`
4. `Dù ELO khiêm tốn nhưng [Tên] sở hữu [X] trận thắng đầy ngạo nghễ trước các kẻ thống trị.`
5. `Không ai có thể coi thường [Tên] sau [X] màn ngáng đường đầy tính nghệ thuật trước các cao thủ.`

### 35. 🩸 Đòn Thù Phục Hận (Vengeance)
*Điều kiện:* Vừa ngắt chuỗi thua trước đối thủ kỵ rơ. (Truyền vào [A], [B], [X] = chuỗi trận thua vừa phá được)
1. `Sự phục thù ngọt ngào! [A] cuối cùng cũng đòi lại được món nợ cay đắng sau chuỗi [X] lần ôm hận trước [B].`
2. `Pha lật bàn ngoạn mục. [A] đã giải mã thành công lời nguyền mang tên [B] sau [X] trận toàn thua.`
3. `Sau [X] ngày nếm mật nằm gai, [A] đã nở nụ cười chiến thắng trước thiên địch [B].`
4. `Đập tan bóng đen tâm lý! [A] vươn lên mạnh mẽ quật ngã [B], kết thúc chuỗi [X] trận bị đè đầu cưỡi cổ.`
5. `Sự kiên trì đã được đền đáp. Món nợ [X] trận thua với [B] cuối cùng cũng được [A] thanh toán sòng phẳng.`

### 36. 🐑 Bắt Nạt Gà (Bully)
*Điều kiện:* Ăn ELO từ đối thủ yếu cụ thể. (Truyền vào [A], [B], [X] = số trận [A] thắng [B])
1. `[A] rất biết cách thị uy sức mạnh khi toàn vặt lông anh bạn yếu thế [B] tới [X] lần.`
2. `Chuyên gia hái măng non! Phần lớn chiến tích của [A] đến từ việc bắt nạt [B] qua [X] trận.`
3. `Gặp mạnh thì hiền, gặp [B] thì hóa sói. [A] đang bòn rút ELO từ người anh em này tàn nhẫn tới [X] lần.`
4. `Thành tích của [A] được xây lên từ mồ hôi nước mắt của "con gà" lạc lối [B] ([X] lần bị làm thịt).`
5. `Rất tỉnh và đẹp trai, [A] luôn tìm đến [B] để nhặt điểm ELO mang về sau [X] lần đối đầu.`

### 37. 🎭 Nạn Nhân Hệ Thống (Victim of the System)
*Điều kiện:* ELO thấp nhưng phải đấu ELO cao. (Truyền vào [Tên], [X] = số trận đấu với Top ELO)
1. `Ông trời thật biết trêu đùa! [Tên] đã [X] lần phải hứng chịu hỏa lực từ những tay to nhất giải.`
2. `Nạn nhân đáng thương của việc chia cặp. [Tên] liên tục phải vào vai "thế vai" qua [X] kèo cực khó.`
3. `Dù kỹ năng chưa cao nhưng [Tên] toàn bị quăng vào giữa bầy sói đói khát tới [X] lần.`
4. `Sống sót qua [X] trận đấu với Top ELO đã là một kỳ tích đáng khen ngợi của [Tên].`
5. `[Tên] xứng đáng nhận danh hiệu "Người chịu trận dẻo dai nhất" vì [X] lần toàn gặp xương xẩu.`

### 38. ✂️ Chuyên Gia Cắt Chuỗi (Streak Breaker)
*Điều kiện:* Vừa đánh bại người đang có chuỗi thắng. (Truyền vào [A], [B], [X] = chuỗi thắng của B vừa bị cắt)
1. `Kẻ phá bỉnh vĩ đại! [A] vừa tạt một gáo nước lạnh, chấm dứt chuỗi [X] trận thăng hoa của [B].`
2. `Bay cao đến mấy gặp [A] cũng gãy cánh. Lời nguyền cắt chuỗi gọi tên [A] khi chặn đứng [X] chiến thắng của [B].`
3. `Chuyên gia dập tắt sự hưng phấn. [A] đã khép lại trang nhật ký [X] chiến thắng liên tiếp của [B].`
4. `[A] có thú vui tao nhã là đi tìm những ai đang "cháy" để dập lửa, và nạn nhân vừa mất chuỗi [X] trận là [B].`
5. `Nhiệm vụ bất khả thi đã được [A] hoàn tất: Chặn đứng đà thăng tiến [X] trận không thể cản phá của [B].`

### 39. 🎢 Chuyên Gia Lật Kèo (The Underdog)
*Điều kiện:* Giành chiến thắng dù Expected Winrate < 35%. (Truyền vào [Tên], [X] = số lần lật kèo khó)
1. `Kẻ phá bĩnh định mệnh! Hệ thống dự đoán thua thảm, nhưng [Tên] đã tạo ra [X] màn lật bàn ngoạn mục.`
2. `Chấp luôn cả chỉ số máy tính! [Tên] vừa tạo ra cơn địa chấn khi đánh bại đối thủ cửa trên tới [X] lần.`
3. `Đừng bao giờ khinh thường cửa dưới. [Tên] đã [X] lần chứng minh rằng ELO không phải là tất cả.`
4. `Cú tát thẳng mặt thuật toán dự đoán! [Tên] có [X] lần xuất sắc giành chiến thắng dù bị đánh giá siêu thấp.`
5. `Không ai tin [Tên] có thể thắng trận này ngoại trừ chính họ. Một chiến thắng lật kèo mang đậm dấu ấn cá nhân!`

### 40. 💥 Đáy Xã Hội / Chuông Báo Thức (Wake-up Call)
*Điều kiện:* Thua người bét bảng ELO. (Truyền vào [A] thua [B])
1. `Trận thua không tưởng! [A] vừa bị giội một gáo nước lạnh bởi đối thủ lót đường [B].`
2. `Cú vấp ngã đau điếng. [A] đã tự làm khó mình khi sảy chân trước [B] - một trong những đối thủ yếu nhất giải.`
3. `Cần xem lại thái độ thi đấu! [A] vừa có một màn ban phát ELO từ thiện đầy bất ngờ cho [B].`
4. `Sự chủ quan đã phải trả giá đắt. [A] trở thành tâm điểm chế giễu sau trận thua sốc trước [B].`
5. `[A] vừa bị rung chuông báo thức cực mạnh để tỉnh mộng sau thất bại khó nuốt trôi trước [B].`

---

## PHẦN 4: THỐNG KÊ TỔNG HỢP & BÊN LỀ (10 Kịch Bản)

### 41. 💸 Nhà Tài Trợ Vàng (Golden Sponsor)
*Điều kiện:* Tiền quỹ phạt nhiều nhất. (Truyền vào [Tên], [X] = số tiền quỹ)
1. `Giải đấu tri ân sâu sắc tới [Tên] vì đã miệt mài đóng quỹ liên hoan cho anh em tới [X] VNĐ.`
2. `Thiếu gia [Tên] giữ vai trò cây ATM chính thức của hội với số tiền nộp quỹ khủng khiếp [X] VNĐ.`
3. `Đánh bóng thì ít mà đóng họ thì nhiều. Số tiền [X] VNĐ chứng tỏ [Tên] đích thị là tấm thẻ đen của giải!`
4. `Ban tổ chức vô cùng hoan nghênh tinh thần "Thua không quỵt" của nhà tài trợ [Tên] ([X] VNĐ).`
5. `Đừng buồn vì rớt rank, [Tên] hãy vui vì mình đang nuôi sống cả hội bằng số quỹ khổng lồ [X] VNĐ!`

### 42. 👑 Thống Trị ELO (The King)
*Điều kiện:* Người đang giữ Top 1 ELO. (Truyền vào [Tên], [X] = số điểm ELO)
1. `[Tên] đang chễm chệ trên ngai vàng vương quyền. Liệu ai có đủ sức lật đổ mức điểm [X] ELO?`
2. `Mức ELO hiện tại [X] của [Tên] là minh chứng cho một đẳng cấp out trình hoàn toàn.`
3. `[Tên] đang quá cô đơn trên đỉnh cao danh vọng với [X] điểm. Cần lắm một thế lực mới trỗi dậy!`
4. `Sở hữu [X] ELO áp đảo, [Tên] chính là "Trùm cuối" mà anh em nào cũng muốn săn lùng.`
5. `BXH đang bị thống trị bởi bàn tay sắt của [Tên]. Ngai vàng [X] điểm vẫn chưa có dấu hiệu đổi chủ.`

### 43. 🃏 Vua Đen Đủi (Unlucky King)
*Điều kiện:* ELO rất cao nhưng Winrate thấp. (Truyền vào [Tên], [X] = Tỉ lệ thắng thấp, [Y] = số ELO khủng)
1. `Tài năng đi liền tai ương. ELO chạm mốc [Y] nhưng [Tên] toàn phải gánh tạ, khiến Winrate lẹt đẹt ở mức [X]%.`
2. `Đẳng cấp có thừa nhưng vận may từ chối. [Tên] là định nghĩa của việc hay không bằng hên (ELO: [Y], WR: [X]%).`
3. `Ông hoàng gánh team bất đắc dĩ. [Tên] dùng mức ELO [Y] của mình cõng đồng đội đến mức Winrate chỉ còn [X]%.`
4. `Trình độ thượng thừa nhưng chiến thắng thưa thớt ([X]%). [Tên] đang bị hệ thống chia cặp bạo hành.`
5. `[Tên] đánh bóng bằng kỹ năng nhưng kết quả lại do đồng đội quyết định. Đen thôi, đỏ quên đi!`

### 44. 🛡️ Bức Tường Thép (The Wall)
*Điều kiện:* Điểm đối phương ghi (lose_score) trung bình thấp nhất. (Truyền vào [Tên], [X] = số điểm mất trung bình)
1. `Hàng thủ không thể xuyên thủng! Đối phương trung bình chỉ kiếm được [X] điểm khi đối mặt với [Tên].`
2. `[Tên] phòng ngự như xe tăng, đối phương ghi trên [X] điểm cứ như đi bắt chim trời.`
3. `Kẻ cắp không gian thực sự. Đánh với [Tên], rổ đựng bóng của bạn thường rất trống rỗng (Mất [X] điểm/trận).`
4. `Lối chơi kín kẽ và lỳ lợm của [Tên] đã làm nản lòng mọi tay đập trên sân (Chỉ mất [X] điểm mỗi trận).`
5. `Ghi nhiều hơn [X] điểm vào lưới của [Tên] được xem là một thành tựu đáng tự hào trong giải đấu.`

### 45. 🥵 Kẻ Đam Mê Deuce (The Deuce Lover)
*Điều kiện:* Số trận vượt 11 điểm cao nhất. (Truyền vào [Tên], [X] = số trận Deuce)
1. `Không Deuce không về! [Tên] có tới [X] trận mắc hội chứng kéo dài tỉ số vượt mốc 11.`
2. `Vua dây dưa! Đánh với [Tên] thì xác định phải bào thể lực với [X] trận đấu nghẹt thở extra point.`
3. `Chỉ thích thắng ở điểm số 12 trở lên. [Tên] đã [X] lần khiến khán giả đau tim vì thói quen giằng co.`
4. `Đam mê Extra Point! [Tên] là nguyên nhân chính khiến sân bị lố giờ nghỉ với [X] trận cầu dai dẳng.`
5. `Thắng nhanh thì chê, phải kéo đến Deuce mới chịu. [Tên] đã nướng bóng và thời gian trong [X] trận giằng co.`

### 46. 📈 Ngôi Sao Đang Lên (Rising Star)
*Điều kiện:* Tân binh nhưng có ELO bứt phá. (Truyền vào [Tên], [X] = ELO kiếm được gần đây)
1. `Làn gió mới mang tính hủy diệt! [Tên] đang chứng tỏ tài năng thiên bẩm khi hốt gọn [X] ELO dù mới ra mắt.`
2. `Sự trỗi dậy của một thế lực mới. [Tên] thăng tiến [X] ELO thần tốc khiến các đàn anh phải e dè.`
3. `[Tên] chính là phát hiện thú vị nhất mùa giải với những màn kiếm chác [X] điểm cực kỳ chững chạc.`
4. `Chưa có nhiều kinh nghiệm nhưng độ mượt thì khỏi bàn. [Tên] đang leo tháp với [X] điểm dắt túi.`
5. `Chú ngựa ô của giải đấu. [Tên] đang làm náo loạn trật tự BXH bằng sức trẻ bùng nổ, ẵm trọn [X] ELO.`

### 47. 👴 Gừng Càng Già Càng Cay (Veteran)
*Điều kiện:* Chơi nhiều trận nhất, ELO Top đầu. (Truyền vào [Tên], [X] = số trận chinh chiến)
1. `Với [X] trận cày ải, [Tên] là minh chứng sống cho câu nói gừng càng già càng cay. Đẳng cấp là mãi mãi!`
2. `Sự điềm tĩnh từ kinh nghiệm [X] trận thực chiến của [Tên] là vũ khí sắc bén đè bẹp sự xốc nổi.`
3. `Cáo già trên sân bóng! Lối chơi ma ranh đúc kết qua [X] trận của [Tên] khiến bao thanh niên ngửi khói.`
4. `Đứng vững qua [X] thăng trầm, [Tên] vẫn là hòn đá tảng khó nhằn ở đỉnh BXH.`
5. `Trải qua [X] trận rèn giũa, [Tên] dùng cái đầu để giải quyết những đôi chân mệt mỏi đầy hiệu quả.`

### 48. 📉 Rớt Giá Thảm Hại (Free Fall)
*Điều kiện:* Rớt ELO nhiều nhất giải. (Truyền vào [Tên], [X] = số ELO rớt)
1. `Triều đại sụp đổ. [Tên] đang nếm trải cảm giác tụt dốc không phanh khi đánh rơi [X] ELO trên BXH.`
2. `Cựu vương thất thế. [Tên] cần một cú hích lớn để bù đắp [X] điểm ELO vừa bốc hơi.`
3. `Từ đỉnh cao rớt xuống vực sâu, [Tên] đang bế tắc mất đi [X] ELO quý giá.`
4. `Các đối thủ dường như đã bắt bài hoàn toàn [Tên], bào mòn [X] điểm ELO không thương tiếc.`
5. `Khoảng cách giữa người dẫn đầu và [Tên] đã bị nới rộng sau khi [X] ELO cất cánh bay đi.`

### 49. 🎟️ Chuyên Gia Cọ Xát (The Experience Seeker)
*Điều kiện:* Xuất hiện trong các trận thua đậm, nhưng đi rất đủ. (Truyền vào [Tên], [X] = số trận ra sân dù toàn thua đậm)
1. `Lấy trải nghiệm làm niềm vui! [Tên] vẫn ra sân [X] buổi cống hiến hết mình mặc cho kết quả bầm dập.`
2. `Tinh thần thể thao bất diệt! Dù bị bán hành liên tục, [Tên] không bao giờ bỏ cuộc suốt [X] trận.`
3. `Thắng thua là chuyện thường, quan trọng là [Tên] luôn có mặt điểm danh đầy đủ [X] lần đọ sức.`
4. `[Tên] xứng đáng là đại sứ nghị lực vì sự kiên cường lỳ lợm qua [X] trận đấu khó nhằn.`
5. `Biến đau thương thành động lực cọ xát. [Tên] đang dần quen với việc đứng lên từ [X] thất bại.`

### 50. 🎲 Người Chơi Hệ Tâm Linh (The Gambler)
*Điều kiện:* Thắng bại thất thường. (Truyền vào [Tên])
1. `Phong độ hình sin chuẩn sách giáo khoa! [Tên] đánh hôm nay như rồng, ngày mai như rắn.`
2. `Tất cả phụ thuộc vào quẻ bói đầu ngày. Màn trình diễn của [Tên] luôn là một ẩn số khó lường.`
3. `[Tên] đánh bóng bằng hệ tâm linh. Khi hưng phấn thì chém đinh chặt sắt, khi xui thì ném bóng ra ngoài.`
4. `Trạng thái thi đấu của [Tên] được quyết định bằng việc tung đồng xu. Không ai biết phiên bản nào sẽ ra sân.`
5. `Là cỗ máy nhả điểm hay là hung thần săn đầu người? Hoàn toàn tùy thuộc vào tâm trạng của [Tên] hôm nay!`
