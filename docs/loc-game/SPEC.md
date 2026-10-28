# ĐẶC TẢ KỸ THUẬT GAME ĐÁNH LỐC (LOC SPECIFICATION)

> **Đường dẫn truy cập:** `/danhloc`  
> **Kiến trúc:** Host - Client qua Supabase Realtime Broadcast (Zero Serverless State, Pure RAM & Local Storage).

---

## 1. LUẬT CHƠI (GAME RULES)

### 1.1. Số người chơi & Chia bài
- **Số lượng:** 3 đến 5 người chơi (tối thiểu 3, tối đa 5). Có chế độ **Khán giả (Spectator)** để vào xem.
- **Chia bài:** Mỗi người chơi nhận đúng 10 lá bài.
- **Bài dư:** Úp kín bí mật ra ngoài bàn, không ai được biết:
  - 3 người: Chia 30 lá, dư 22 lá úp.
  - 4 người: Chia 40 lá, dư 12 lá úp.
  - 5 người: Chia 50 lá, dư 2 lá úp.
- **Lượt đánh đầu tiên:**
  - Ván đầu tiên: Máy Host đi trước.
  - Từ ván thứ 2 trở đi: Người về nhất ván trước đi trước.

### 1.2. Phân loại bộ bài & Quy tắc chặn
- Giá trị lá bài: $3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < A < 2$. (Không phân biệt chất Cơ, Rô, Chuồn, Bích).
- Các bộ bài hợp lệ:
  - **Rác:** 1 lá lẻ.
  - **Đôi:** 2 lá cùng bậc.
  - **Sáp (Sám):** 3 lá cùng bậc.
  - **Tứ quý:** 4 lá cùng bậc.
  - **Sảnh (Dây):** Tối thiểu 3 lá liên tiếp trở lên (từ $A-2-3$ đến $Q-K-A$). Không có sảnh vòng qua 2 (không có $K-A-2$).
- Quy tắc đè bài:
  - Phải cùng kiểu bộ và cùng số lượng lá bài (Đôi đè đôi, sảnh 5 lá đè sảnh 5 lá).
  - Lá/bộ chặn phải có giá trị cao hơn.
  - **Chặt 2:** 1 lá 2 bị chặt bởi **1 Tứ quý**. (Được cộng **+10 lá**, người bị chặt **-10 lá**).
  - **Không cho phép 2 Tứ quý chặt đôi 2** (Đôi 2 là to nhất không thể chặt).
  - Điểm chặt 2 được cộng dồn và kết toán vào bảng điểm cuối ván.

### 1.3. Báo Sâm (Cướp lượt ăn cả làng)
- Đầu mỗi ván, hệ thống có giai đoạn chờ Báo Sâm.
- **Luật chọn người:** Chỉ nhận **người bấm Báo Sâm sớm nhất**.
- **Điều kiện kết thúc chờ:**
  - Khi tất cả người chơi đều bấm "Bỏ qua" $\rightarrow$ Bắt đầu ván ngay lập tức.
  - Khi chỉ còn duy nhất 1 người chưa bấm $\rightarrow$ Kích hoạt đếm ngược 60 giây, hết giờ tự động Skip.
- **Kết quả Sâm:**
  - *Sâm thành công:* Ăn mỗi người chơi 20 lá.
  - *Đền Sâm (Bị chặn dù chỉ 1 nước):* Đền cho tất cả người chơi còn lại (mỗi người 20 lá).

### 1.4. Kết thúc ván & Quy đổi lá phạt
- Ván đấu kết thúc ngay khi có 1 người đánh hết bài (về nhất).
- **Về bằng lá 2:** Bị tính là **Thối 2**.
- **Cách tính điểm (Quy đổi ra lá):**
  - **Lá bài còn lại:** $-1$ lá / lá bài trên tay. Người về nhất ăn tổng số lá này.
  - **Cháy bài (Cóng - chưa đánh được lá nào):** Phạt cố định **14 lá**.
  - **Thối 2:** Phạt thêm **5 lá** / mỗi con 2 trên tay.
  - **Thối Tứ quý:** Phạt thêm **5 lá** / mỗi bộ tứ quý trên tay.
  - **Chặt 2:** $+10$ lá cho người chặt, $-10$ lá cho người bị chặt (kết toán dồn cuối trận).

### 1.5. Báo 1 lá & Luật Đền Làng (Đền Báo)
- **Trạng thái Báo 1 lá:** Khi bất kỳ người chơi nào chỉ còn đúng **1 lá bài trên tay**, hệ thống kích hoạt trạng thái "Đã báo" (hiển thị cảnh báo trực quan cho cả bàn).
- **Trách nhiệm của người cửa trên (người ngồi ngay trước người đã báo theo chiều đánh):**
  - Khi người cửa trên đánh bài rác (lá đơn), **bắt buộc phải đánh quân bài to nhất trên tay**.
- **Điều kiện Đền Làng:**
  - Người cửa trên đánh ra 1 lá rác trong khi trên tay **vẫn còn lá rác có rank lớn hơn**.
  - Người đã báo **chặn được lá rác đó và về nhất** (hết bài).
  - Lúc này, người cửa trên bị xử thua **Đền Làng**.
- **Quy tắc gánh phạt (Người đền gánh cả):**
  - Người đền làng phải **gánh toàn bộ số lá phạt của tất cả người chơi khác trong bàn** (bao gồm: số lá bài còn lại, phạt cóng, phạt thối 2, thối tứ quý) để nộp cho người về nhất.
  - Những người chơi còn lại trong bàn được **miễn trừ toàn bộ tiền phạt ván đó** ($0$ lá phạt, chỉ tính điểm bù trừ Chặt 2 nếu có).
  - Đảm bảo cơ chế kết toán Zero-sum ($Total = 0$).

### 1.6. Yêu cầu & Lưu ý đặc biệt cho Bot AI (Luật Báo)
- **Hành vi khi đối thủ cửa dưới đã Báo 1 lá:**
  - Engine của Bot AI (`bot-brain.ts` / `hand-evaluator.ts`) phải theo dõi số lá còn lại của người kế tiếp.
  - Nếu người kế tiếp còn 1 lá:
    - Khi Bot được quyền ra bài rác (hoặc đi đầu vòng rác): **BẮT BUỘC PHẢI CHỌN LÁ TO NHẤT TRÊN TAY**, tuyệt đối không được đánh lá bé / lá trung bình để chạy điểm.
    - Ưu tiên đi các bộ đôi, sáp, sảnh (nếu có) để người báo không thể chặn được, hạn chế tối đa rủi ro rơi vào tình huống bị đền làng.

---

## 2. GIAO DIỆN & TRẢI NGHIỆM (UI / UX)

### 2.1. Lobby & Danh sách phòng (`/danhloc`)
- Mở trang hiển thị ngay:
  - Ô nhập tên người chơi (lưu nhớ vào `localStorage`).
  - Danh sách các phòng đang mở (Public Room List): Tên phòng, tên Host, số người hiện có (`x/5`), trạng thái (Đang chờ / Đang chơi).
  - Nút **"Tạo phòng mới"**.
  - Mỗi phòng trong danh sách có 2 nút:
    - **"Vào chơi"** (nếu phòng $< 5$ người và chưa bắt đầu).
    - **"Xem" (Spectator)** (cho phép vào theo dõi bàn đấu bất kỳ lúc nào).

### 2.2. Bàn chơi 5 người (Game Table)
- **Bố cục Oval bàn tròn:**
  - Phía dưới (to nhất): 10 lá bài của người chơi, xếp xòe theo thứ tự từ $3 \rightarrow 2$.
  - 4 góc xung quanh: Vị trí của các đối thủ (Avatar, tên, số lá úp còn lại, viền phát sáng khi đến lượt, hiệu ứng cảnh báo khi còn 1 lá).
  - Trung tâm bàn: Vùng bài vừa đánh (Last Play) và lịch sử thao tác ngắn.
- **Thao tác & Gợi ý bài thông minh (Smart Hint):**
  - Khi người chơi click chọn 1 lá bài:
    - **Nếu đang cần chặn bài trên sân:** Ưu tiên làm sáng các lá ghép thành bộ **chặn được bài trên bàn** (Ví dụ: sân có `3-4-5`, bài có `5-5-5-6-7-8-9`, chọn `5` thì `6-7` sáng lên; nếu sân có `3-3`, chọn `5` thì các lá `5` còn lại sáng lên).
    - **Nếu là lượt đi mới (bàn trống):** Ưu tiên gợi ý theo thứ tự: Bộ dài hơn (dây dài nhất) $\rightarrow$ Sáp $\rightarrow$ Dây ngắn $\rightarrow$ Lá bé.
  - Các nút hành động:
    - Nút **"Đánh bài"** (chỉ sáng khi bộ bài chọn hợp lệ).
    - Nút **"Bỏ lượt"** (chỉ sáng khi không phải lượt đầu vòng).
    - Nút **"Xếp bài"** (sắp xếp lại bài gọn gàng).
- **Popup Tổng kết cuối ván:**
  - Bảng thống kê chi tiết từng người: Lá còn lại, Thối 2/Tứ quý, Cóng, Điểm chặt 2, Tổng lá $+/-$.
  - Nút **"Tiếp tục ván mới"**.

---

## 3. KIẾN TRÚC MẠNG & DỮ LIỆU

### 3.1. Supabase Realtime Broadcast (Host - Client)
- Kênh broadcast: `loc_game_{roomId}` với `broadcast: { self: false }`.
- **Máy Host:**
  - Nắm State sự thật (bộ bài, chia bài, thứ tự lượt, kiểm tra nước đi hợp lệ).
  - Gửi dữ liệu riêng tư (10 lá bài) riêng cho từng Client.
- **Client & Spectator:**
  - Chỉ nhận state hiển thị và gửi action (`PLAY`, `PASS`, `CALL_SAM`) về cho Host.
  - Spectator chỉ nhận `TABLE_UPDATE` (không có bài trên tay).
- **Lưu trữ:** Kết quả các ván đấu được ghi vào `localStorage` / `IndexedDB` của máy người chơi để xem lại bảng tổng kết buổi chơi mà không cần database server.
