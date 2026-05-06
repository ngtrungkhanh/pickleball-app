# TASK TODO

> Current workflow note: read `WORKFLOW_LOG.md` before any UI work.

*File này chứa danh sách công việc chi tiết. Agent CODE (hoặc bất kỳ lập trình viên nào) đọc file này để biết việc cần làm. Đọc kèm `AI_CONTEXT.md` để hiểu kiến trúc tổng thể.*

---

## ✅ SPRINT 2 (ĐÃ HOÀN THÀNH): SỬA LỖI & ĐÁNH BÓNG GIAO DIỆN

### Task 1-3: Dark Mode, Việt hóa, Dashboard cơ bản
- [x] Dark Mode (Slate-950), Glassmorphism, Việt hóa 100%.
- [x] BXH với chi tiết mở rộng (Phong độ, Đồng đội, Đối thủ).
- [x] ScoreForm + RecentHistory + Optimistic UI.

### Task 5-11: Responsive, Typography, Layout 1 cột
- [x] Layout 1 cột, Scaling 2K (`clamp()`), gộp tỷ số 1 dòng.
- [x] Fix chữ bé, lệch hàng, Dropdown trắng xóa.

### Task 12-14: Mirror Legacy & Polish
- [x] Soi `legacy/js.html` + `legacy/css.html` để mirror bố cục.
- [x] Leaderboard Detail chuyển sang Text List, xóa Card to đùng.
- [x] Season Selector, Fix Date Logic, Summary Scaling 2K.

---

## ✅ SPRINT 2.5 (ĐÃ HOÀN THÀNH): TỐI ƯU HIỆU NĂNG & TRẢI NGHIỆM GHI ĐIỂM

### Task 15: Chuyển đổi sang ISR (Incremental Static Regeneration)
- [x] Đổi `export const revalidate = false` trong `src/app/page.tsx` và nâng giới hạn lấy dữ liệu lên 500 trận.
- [x] Đảm bảo gọi `revalidatePath('/')` trong các server actions để cập nhật cache tĩnh, tiết kiệm tối đa Compute CU-hrs cho Vercel Free Plan.

### Task 16: ScoreForm — Local-First Sync & Silent Background Upload
- [x] Bấm "Ghi" -> thấy thành công trong 1 giây và tự reset form, mở khóa nhập trận tiếp theo ngay lập tức.
- [x] Gửi dữ liệu đồng bộ âm thầm dưới nền (Background Sync) kèm Sync Indicator nhỏ gọn ở góc màn hình.

### Task 17: Chặn trùng 15 phút (Local Duplicate Check)
- [x] Tích hợp logic quét trùng 15 phút so sánh với 2 trận gần nhất trực tiếp tại localStorage của trình duyệt, ngăn chặn bấm nhầm mà không cần tốn Quota server.

### Task 18: Hộp đen (Offline Backup — localStorage)
- [x] Triển khai cơ chế "Hộp đen" tự động sao lưu trận đấu thành Draft tạm thời trước khi gửi, hiện banner khôi phục dữ liệu khi mạng chập chờn hoặc tắt trang giữa chừng.

### Task 19: Server-side Duplicate Check (Tầng bọc hậu)
- [x] Xây dựng tầng bọc hậu tại Postgres server để chặn trùng chéo khi nhiều thiết bị gửi điểm đồng thời.

### Task 20: Tối ưu Giao diện còn sót
- [x] Chuẩn hóa khoảng cách, độ cao của các ô Select nhập điểm, đồng bộ tỷ lệ Mirror Legacy chuẩn 100%.

---

## ✅ SPRINT 2.6 (ĐÃ HOÀN THÀNH): BẢO MẬT ĐỊNH DANH & QUẢN TRỊ ADMIN

### Task 21: Định danh thiết bị ẩn danh & Biệt danh (Device Fingerprint)
- [x] Tự động sinh mã định danh duy nhất vĩnh viễn `USR-XXXX` lưu trong localStorage.
- [x] Cho phép người dùng đặt Biệt danh thiết bị (Ví dụ: "Chung ĐT", "Tùng PC") trực tiếp dưới Form ghi điểm.
- [x] Tự động giải mã thông tin phần cứng và trình duyệt qua `navigator.userAgent`.
- [x] Ghép nối toàn bộ thông số thành chuỗi chi tiết dạng `USR-XXXX (Biệt danh) [Device Model]` và gửi lên lưu trữ tại cột `created_by` trong bảng `matches` (Độ rộng cột tăng lên 50 kí tự trong setup DB).

### Task 22: Sửa đổi trực tiếp (Inline Edit) trong Admin Panel
- [x] Thiết kế nút `[Sửa]` đổi tên thành viên trực tiếp, lưu tức thì qua `updatePlayerAction`.
- [x] Thiết kế nút `Sửa` trận đấu tại Tab Lịch sử, biến toàn bộ dòng dữ liệu thành form chỉnh sửa inline (Ngày-giờ dạng `datetime-local`, chọn người thắng/thua, nhập tỷ số) và lưu trực tiếp qua `updateMatchAction`.

### Task 23: Logic Đảo ngược thống kê cân bằng điểm số (Incremental Balance)
- [x] Xây dựng thuật toán trong `updateMatchAction` tự động trừ ngược điểm số, trận thắng, tiền phạt của người chơi cũ của trận đấu cũ trước khi cộng dồn số liệu mới, giữ vững tính nhất quán tuyệt đối cho bảng xếp hạng.

### Task 24: Khắc phục triệt để lỗi Phông chữ Tiếng Việt
- [x] Rà soát và chuyển đổi 100% các chuỗi ký tự Việt hóa bị hỏng encoding (mojibake) trên trang Admin thành UTF-8 chuẩn có dấu chuẩn chỉ.

---

## SPRINT 3 (DỰ KIẾN): THỐNG KÊ & PLUGINS
*(Sẽ cập nhật chi tiết sau khi vận hành ổn định các tính năng mới)*
- Phong độ nâng cao và biểu đồ xu hướng.
- Plugin Thiên địch / Kèo sáng nâng cấp.
- Plugin Cặp đôi ăn ý / Cạ cứng.
