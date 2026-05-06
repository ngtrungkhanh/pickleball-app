Tôi đang xây dựng Dashboard Pickleball cao cấp trong repo này. Dự án làm local trước, sau này deploy website bằng Vercel. Làm việc theo hướng full A-Z: tôi đưa ý tưởng, bạn đọc context/code vừa đủ, tự sửa, tự verify, rồi báo kết quả ngắn gọn.

Ưu tiên tiết kiệm quota AI. Không đọc toàn bộ repo nếu chưa cần.

Quy trình đọc context:
1. Luôn đọc `WORKFLOW_LOG.md` và `README.md` trước.
2. Chỉ đọc `AI_CONTEXT.md` khi task liên quan kiến trúc, data fetching, ISR/Vercel, database, hoặc design rules gốc.
3. Chỉ đọc `DEVELOPMENT_LOG.md` khi task cần lịch sử thay đổi, sync/local-first, legacy/App Script, hoặc cần hiểu quyết định cũ.
4. Chỉ đọc `TASK_TODO.md` khi task liên quan backlog/sprint/chọn việc tiếp theo.
5. Khi cần chi tiết, dùng `rg` để tìm đúng file/đoạn rồi chỉ mở phần liên quan.

Quy tắc bắt buộc:
- UI review theo thứ tự: mobile > PC Full HD > 2K > 4K > màn khác.
- Không fix desktop nếu làm vỡ mobile.
- Code/kiến trúc phải hợp hướng deploy Vercel và tiết kiệm compute/quota.
- Giữ chữ `Season`; view all-season gọi là `Tổng hợp`.
- Header brand trên cùng đã bỏ.
- SummaryGrid là minimalist horizontal, không thêm dòng phụ dưới card.
- Leaderboard detail dùng 3 ô cân giữa, mỗi ô 3 tầng: tiêu đề, nội dung chính, dòng chỉ số.
- Rival wording dùng `Kèo khó`/`Thiên địch`, không dùng `Đối thủ kỵ rơ`.
- Metric text: `75% thắng • Thắng 6/8 trận`, `80% thua • Thua 4/5 trận`.
- Text user-facing dùng tiếng Việt sentence case, trừ label/bảng cố ý uppercase hoặc shorthand W/L/T.
- Score input nổi bật nhưng gọn, tránh quá to như `sm:text-6xl`.
- Không xóa/revert thay đổi không liên quan.

Trạng thái code gần nhất:
- Readonly/edit UI guard đã có. Mặc định readonly; unlock bằng pass trong Settings, lưu trạng thái edit bằng localStorage. Server-side guard để sau.
- Readonly mode ẩn hẳn phần nhập tỷ số, không hiện banner giải thích.
- Settings dùng modal, không dùng route riêng.
- Settings readonly chỉ thấy nhập pass. Khi edit chỉ còn nút khóa lại và các tab admin.
- Settings có tabs: Quyền, Thành viên, Season, Tiền phạt.
- Settings save qua server actions/database, rồi `router.refresh()`, không reload trang và không tự đóng modal.
- Thành viên inactive bị ẩn khỏi BXH, nhưng lịch sử và stats vẫn tính.
- Xóa hoàn toàn thành viên có modal confirm. Action chỉ cho xóa member chưa có lịch sử trận; member có lịch sử phải tắt Active để giữ thống kê.
- Lưu danh sách thành viên dùng một nút chung và có phản hồi UI tại khu vực nút.
- Season tạo mới không nhập ngày khởi tranh. Ngày hiển thị của season lấy từ trận đầu tiên của season khi có dữ liệu.
- Season selector phải hiện cả season có 0 trận từ bảng `seasons`.
- Active season đọc từ `config.active_season`; ghi trận mới phải vào active season, không hardcode Season 1.
- Match saving phải insert cả `id` và `date` vì schema DB hiện tại yêu cầu `matches.id` và `matches.date` NOT NULL, không có default.
- User-facing save feedback dùng `Đang lưu...` / `Lưu lỗi - thử lại`, không dùng `Đang đồng bộ...`.
- Settings server actions đã được bọc try/catch để trả lỗi ra UI, tránh treo `Đang lưu...`.
- `/analysis` đã có route Trung tâm phân tích read-only với tabs tổng quan/player/partner/opponent/trend/history. ELO hiện là bản đơn giản.
- Đã tích hợp **Bộ định danh thiết bị ẩn danh (Device Fingerprint)**: Tự tạo Device ID duy nhất `USR-XXXX` và cho phép người chơi đặt biệt danh (Lưu trong `localStorage`), kèm thu thập trình duyệt/phần cứng lưu trữ trực tiếp vào cột `created_by` có độ rộng nâng cấp lên 50 kí tự trong `src/app/api/setup/route.ts`.
- Đã xây dựng **Sửa đổi trực tiếp (Inline Edit)** tại trang Admin: cho phép sửa tên thành viên tại chỗ, sửa chi tiết trận đấu (Ngày-giờ dạng `datetime-local`, người thắng/thua, tỷ số) inline cực đẹp.
- Đã hoàn thiện **Logic Đảo ngược thống kê (Recalculation Balance)** trong server-action `updateMatchAction` tự động trừ điểm số/tiền phạt cũ rồi cộng điểm mới để cân bằng số liệu.
- Đã sửa triệt để **Lỗi mã hóa Phông chữ tiếng Việt (mojibake)** trên trang Admin Panel, khôi phục 100% hiển thị tiếng Việt UTF-8 chuẩn có dấu.

File/code quan trọng vừa chạm:
- `src/app/actions.ts`
  - Có `addMatchAction`, `deleteMatchAction`, `addPlayerAction`, `updatePlayerAction`, `updatePlayersAction`, `deletePlayerAction`, `createSeasonAction`, `setActiveSeasonAction`, `updateFineAction`.
  - `addMatchAction` hiện sinh `id = M...` và insert `date = NOW()`.
  - `setConfigValue()` tự đảm bảo bảng `config`.
  - Season actions tự đảm bảo bảng `seasons`.
- `src/components/SettingsModal.tsx`
  - Modal settings, feedback inline, confirm delete member.
- `src/components/Dashboard.tsx`
  - Truyền `activeSeason` và `initialSeasons` xuống Leaderboard; truyền `activeSeason` xuống ScoreForm.
- `src/components/dashboard/Leaderboard.tsx`
  - Nhận `seasons`, `activeSeason`; selector có season 0 trận; board lọc `active !== false`.
- `src/components/ScoreForm.tsx`
  - Sync badge đã đổi wording thành lưu.

Kiểm tra gần nhất:
- `npm run build`: pass.
- `npx eslint src\app\actions.ts src\components\SettingsModal.tsx`: pass.
- Nếu lint cả `ScoreForm.tsx` vẫn còn lint debt cũ: `any` và `react-hooks/set-state-in-effect`. Đừng xử lý nợ lint lớn nếu task không yêu cầu.
- Đã kiểm tra DB schema thật: `matches.id` và `matches.date` đều NOT NULL và không có default.
- Local server `http://localhost:3000` đang từng trả HTTP 200.

Việc cần agent tiếp theo ưu tiên kiểm tra ngay:
1. Test UI thật trên browser:
   - Unlock edit trong Settings.
   - Lưu danh sách thành viên, bật/tắt Active.
   - Tạo Season 2 và đặt active.
   - Kiểm tra Season 2 hiện trong selector dù 0 trận.
   - Ghi trận mới sau khi active Season 2, xác nhận trận vào Season 2.
   - Xóa hoàn toàn member chưa có lịch sử.
   - Thử xóa member đã có lịch sử, xác nhận bị chặn và hiển thị thông báo rõ.
2. Nếu vẫn báo lỗi lưu, đọc lỗi UI/server console trước, không đoán.
3. Nếu lỗi schema DB, cân nhắc route/setup hoặc migration nhẹ, không drop data.
4. Sau khi ổn settings/save, review mobile kỹ phần Settings modal và Leaderboard selector.

Cách làm tiết kiệm quota:
- Tìm bằng `rg` trước, mở đúng file liên quan.
- Sửa bằng `apply_patch`, tránh refactor lan rộng.
- Verify bằng `npm run build` và lint targeted cho changed files.
- `npm run lint` toàn repo có thể fail vì lint debt cũ.

Trước hết hãy đọc `WORKFLOW_LOG.md` và `README.md`, sau đó tóm tắt ngắn trạng thái dự án và nói rõ bạn sẽ kiểm tra phần nào trước. Nhiệm vụ cụ thể tôi sẽ gửi ở tin tiếp theo.
