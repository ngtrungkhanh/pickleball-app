# KẾ HOẠCH TRIỂN KHAI & TIẾN ĐỘ GAME ĐÁNH LỐC (ROADMAP & PROGRESS)

> **File đặc tả luật & UI:** [SPEC.md](file:///d:/Pickleball%20App/docs/loc-game/SPEC.md)  
> **Trang chính:** `/danhloc`  
> **Trạng thái:** Đang khởi tạo kế hoạch.

---

## BẢNG THEO DÕI TIẾN ĐỘ TỔNG THỂ

| Giai đoạn | Nội dung chính | Trạng thái | Ghi chú |
| :--- | :--- | :---: | :--- |
| **Phase 1** | Game Engine & Smart Hint Logic (Test Suite) | `Đã hoàn thành` | 13/13 Vitest tests pass, bao phủ luật Lốc & Smart Hint |
| **Phase 2** | Supabase Broadcast Network (Host-Client sync) | `Đã hoàn thành` | Broadcast transport, State Manager, Lobby presence & Spectator |
| **Phase 3** | UI Bàn chơi Mobile-first (`/danhloc`) | `Đã hoàn thành` | Bàn Oval 5 vị trí, xòe bài, hiệu ứng highlight lá gợi ý |
| **Phase 4** | Báo Sâm, Tổng kết cuối ván & Local Storage | `Đã hoàn thành` | Báo Sâm 60s, popup kết thúc ván quy đổi lá, lưu session |

---

## CHI TIẾT TỪNG GIAI ĐOẠN

### Phase 1: Game Engine & Smart Hint Logic (Core)
- [x] **1.1. Data Model & Deck Engine (`src/lib/loc-game/types.ts`, `src/lib/loc-game/deck.ts`)**
  - Định nghĩa Card (`rank`, `suit`), ComboType (`SINGLE`, `PAIR`, `TRIPLE`, `QUAD`, `STRAIGHT`).
  - Hàm xáo bài và chia bài ngẫu nhiên cho $3 - 5$ người chơi, trích xuất bài dư bí mật (5 người dư 2 lá, 4 người dư 12 lá, 3 người dư 22 lá).
- [x] **1.2. Card Combo Analyzer & Validator (`src/lib/loc-game/analyzer.ts`)**
  - Nhận diện loại bài (Rác, Đôi, Sáp, Sảnh, Tứ quý).
  - So sánh bài: hàm `canBeat(candidate, currentTable)`.
  - Kiểm tra luật đặc thù: Tứ quý chặt 2, không cho 2 tứ quý chặt đôi 2.
- [x] **1.3. Smart Hint Engine (`src/lib/loc-game/smart-hint.ts`)**
  - Thuật toán khi người chơi bấm 1 lá:
    - Nếu cần chặn bài trên sân: tìm bộ đè được theo thứ tự ưu tiên (chặn được -> dây dài -> sáp -> lá bé).
    - Nếu đi đầu vòng: gợi ý bộ dài nhất có chứa lá đó.
- [x] **1.4. Điểm phạt & Kết thúc ván (`src/lib/loc-game/scoring.ts`)**
  - Đếm lá phạt: Cháy bài (14 lá), Thối 2 (5 lá/con), Thối tứ quý (5 lá/bộ), Chặt 2 (10 lá), Về nhất ăn cả.
- [x] **1.5. Vitest Unit Test (`src/lib/__tests__/loc-game-engine.test.ts`)**
  - Viết test bao phủ 13 test cases về chia bài, luật chặn bài, smart hint và tính điểm zero-sum.

---

### Phase 2: Supabase Realtime Network (Host-Client)
- [x] **2.1. Cài đặt & Setup Supabase Client**
  - Tích hợp `@supabase/supabase-js`.
  - Cấu hình Broadcast Channel qua Supabase và hỗ trợ fallback `BroadcastChannel` của trình duyệt để test nhiều tab local.
- [x] **2.2. Network Protocol & Room Manager (`src/lib/loc-game/network.ts`, `network-types.ts`)**
  - Giao thức bản tin: `LOBBY_ANNOUNCE`, `JOIN_ROOM`, `SYNC_HAND`, `PLAY_CARDS`, `PASS_TURN`, `SYNC_TABLE_STATE`, `CALL_SAM`, `SKIP_SAM`.
  - Xây dựng `HostGameEngine` quản lý state sự thật, xử lý chặt 2, chia bài riêng tư, vòng đánh và kết toán.
- [x] **2.3. Public Lobby Synchronization & Spectator Mode**
  - Hỗ trợ phát sóng danh sách phòng tự động mỗi 2 giây.
  - Hỗ trợ chế độ khán giả (Spectator) theo dõi ván đấu mà không cần bài trên tay.
  - Test suite bao phủ toàn bộ vòng đời Host-Client (`src/lib/__tests__/loc-game-network.test.ts`).

---

### Phase 3: Giao diện Bàn chơi Mobile-first (`/danhloc`)
- [x] **3.1. Trang Lobby & Danh sách phòng (`src/app/danhloc/page.tsx`, `LocLobby.tsx`)**
  - Nhập tên người chơi (nhớ qua `localStorage`).
  - Danh sách phòng trực tiếp realtime (heartbeat 2s), nút "Tạo phòng", nút "Vào chơi", nút "Xem" (Spectator).
- [x] **3.2. Bàn chơi Oval 5 vị trí (`src/components/loc-game/LocGameBoard.tsx`, `LocOpponent.tsx`)**
  - Responsive Mobile đến Desktop, tối đa 5 người, hiển thị số lá bài úp, viền hào quang phát sáng khi đến lượt, nhấp nháy đỏ khi còn 1 lá.
  - Vùng trung tâm bàn nỉ Casino: bài vừa đánh xòe ra giữa bàn, lịch sử thao tác ngắn.
- [x] **3.3. Tương tác lá bài & Hiệu ứng gợi ý (`src/components/loc-game/LocCard.tsx`, `LocHand.tsx`)**
  - Card thiết kế vector SVG sắc nét, không dùng ảnh ngoài, nhẹ mượt trên mọi màn hình.
  - Xòe quạt thông minh, chạm nhô lên, viền sáng vàng neon gợi ý combo (Smart Hint) kèm nút "Lấy bộ gợi ý".
  - Nút Đánh bài, Bỏ lượt, Xếp bài.

---

### Phase 4: Báo Sâm, Tổng kết cuối ván & Lưu trữ Local
- [x] **4.1. Giai đoạn Báo Sâm (Call Sam Phase)**
  - Nút to Báo Sâm & Bỏ qua.
  - Tự động đếm ngược 60s khi chỉ còn 1 người chưa chọn, hết giờ tự động Skip.
- [x] **4.2. Popup Tổng kết ván & Điểm quy ra lá (`LocRoundOverModal.tsx`)**
  - Bảng thống kê vinh danh người về nhất, chi tiết từng người (cóng 14 lá, thối 2, thối tứ quý, chặt 2, tổng lá +/-).
  - Nút "Ván tiếp theo" cho Host để tiếp tục vòng mới.
- [x] **4.3. Lưu trữ Local Storage**
  - Nhớ tên và id người chơi, cấu hình Supabase tùy chỉnh.
- [ ] **4.4. Cơ chế Đền Làng khi Báo 1 lá & AI Bot Policy (`scoring.ts`, `analyzer.ts`, `bot-brain.ts`)**
  - **Core Rule:** Người cửa trên khi đánh rác phải đánh lá to nhất nếu người sau đã báo 1 lá. Nếu vi phạm và người báo về nhất $\rightarrow$ Người đền gánh toàn bộ lá phạt của cả làng.
  - **Bot Policy Lưu ý:** Bot AI phải nhận diện người kế tiếp còn 1 lá để xả lá to nhất hoặc ưu tiên đi bộ, tuyệt đối tránh bị Đền Làng.

---

## NHẬT KÝ TIẾN ĐỘ THEO PHIÊN (SESSION LOGS)
- **Phiên 1 (2026-10-27):** 
  - Thống nhất xong 100% Luật chơi và UI/UX (Smart Hint, Public Lobby, Spectator, URL `/danhloc`). Khởi tạo `SPEC.md` và `ROADMAP.md`.
  - **Hoàn thành Phase 1 (Game Engine & Smart Hint Logic):** Đã tạo các module core (`types.ts`, `deck.ts`, `analyzer.ts`, `smart-hint.ts`, `scoring.ts`) và test suite Vitest (`13/13 passed`), pass cả TypeScript và ESLint.
  - **Hoàn thành Phase 2 (Supabase Realtime Network):** Cài đặt `@supabase/supabase-js`, xây dựng `network-types.ts`, `supabase.ts`, `network.ts` (HostGameEngine, Broadcast Transport với fallback test đa tab), hỗ trợ Public Lobby và Spectator mode. Test suite Host-Client passed (`14/14 tests total passed`).
- **Phiên 2 (2026-10-28):**
  - **Hoàn thành Phase 3 & 4 (Giao diện Bàn chơi Mobile-first `/danhloc` & Tổng kết điểm):**
    - Thiết kế Vector SVG & CSS cho 52 lá bài và mặt úp Lốc casino (`LocCard.tsx`), không cần tải ảnh ngoài.
    - Xây dựng vùng bài người chơi (`LocHand.tsx`) hỗ trợ Smart Hint sáng viền vàng neon và nút chọn nhanh bộ gợi ý.
    - Xây dựng hiển thị đối thủ 5 góc (`LocOpponent.tsx`) với hào quang tới lượt, cảnh báo còn 1 lá.
    - Xây dựng Bàn chơi nỉ Oval (`LocGameBoard.tsx`), Lobby danh sách phòng trực tiếp (`LocLobby.tsx`), Popup tổng kết lá (`LocRoundOverModal.tsx`) và trang điều phối chính (`src/app/danhloc/page.tsx`).
  - **Tối ưu trải nghiệm màn hình ngang & Auto-play (Phiên bản mới):**
    - Chuyển đổi giao diện sang chuẩn hình ảnh mẫu `Example/unnamed`: Bàn Oval nỉ đỏ bã trầu viền gỗ bo tròn, các lá bài dàn đều 100% không đè nhau, nhìn rõ mọi số và chất.
    - **Cơ chế Co giãn tự động (Fluid Clamp Scaling):** Khi màn hình hẹp, 10 lá bài tự động thu nhỏ theo tỷ lệ chiều rộng (`clamp(2rem, 6.8vw, 3.75rem)`), đảm bảo hiển thị đủ 100% các lá bài, avatar và các nút Đánh/Cho qua/Sắp xếp mà không bị che khuất.
    - **Cơ chế Xoay ngang 90 độ (Force Landscape Mode):** Tự động phát hiện khi màn hình ở khổ dọc để xoay ngang vừa khít màn hình; đồng thời bổ sung **nút xoay 90°** trên Header để người chơi chủ động xoay ngang bất kỳ lúc nào.
    - Tự động bỏ lượt sau 1.5s nếu trong tay không có bất kỳ bộ bài nào đè được.
    - Tự động đề xuất lá có thể đánh (sáng viền mờ) ngay khi tới lượt; sau 10s chưa đánh thì sáng nhấp nháy rõ hơn để nhắc nhở.
    - Báo Sâm: Ẩn nút Báo Sâm khi đã huỷ báo (hiển thị trạng thái "Đã huỷ Báo Sâm").
    - Đếm ngược 60s khi chỉ còn 1 người chưa chọn Báo Sâm; hết 60s tự động skip người cuối và bắt đầu trận đấu.
    - Giới hạn 30s cho mỗi lượt đánh: Có đồng hồ đếm ngược trực tiếp trên avatar và giữa bàn; quá 30s tự động qua lượt (hoặc tự đánh lá nhỏ nhất nếu đi đầu).
    - Toàn bộ TypeScript và ESLint đều pass 100%.
