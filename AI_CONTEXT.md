# Pickleball App — Design & Architecture Context

*File này mô tả toàn bộ kiến trúc, quy tắc thiết kế, và quyết định kỹ thuật đã chốt. Agent CODE (hoặc bất kỳ lập trình viên nào) đọc file này trước khi bắt đầu làm việc.*

---

## 🎯 Mục tiêu dự án
Xây dựng ứng dụng web **Xếp hạng Pickleball** thay thế bản Google App Script cũ (`legacy/`).
- **Nhanh tuyệt đối (Zero Delay):** Mở app ra là thấy dữ liệu ngay, không loading.
- **Tiết kiệm tối đa Quota Vercel Free:** Chỉ tốn Compute khi ghi điểm, không tốn khi xem.
- **Giao diện Premium:** Dark Mode, tối ưu cho Mobile + Full HD + 2K/4K.

---

## 🏗️ Kiến trúc Hệ thống

### 1. Rendering Strategy: ISR + Full-Preload + Client-side Power

**Vấn đề hiện tại (CẦN SỬA):**
- File `src/app/page.tsx` đang set `export const revalidate = 0`. Giá trị `0` nghĩa là **MỌI lượt truy cập đều gọi Database** → tốn Compute CU-hrs liên tục → dễ hết Quota.
- `LIMIT 100` chưa đủ cho Full-Preload.

**Giải pháp đã chốt (ISR On-demand):**
1. **Đổi `revalidate = 0` thành `revalidate = false`** (hoặc xóa dòng này). Điều này biến trang thành Static Page, chỉ rebuild khi có lệnh `revalidatePath('/')`.
2. **Nâng `LIMIT 100` lên `LIMIT 500`** để tải toàn bộ dữ liệu trận đấu (dự kiến chỉ vài trăm trận) ngay từ đầu.
3. **Client-side tiếp quản:** Sau khi HTML tĩnh được tải, mọi tương tác (sắp xếp BXH, lọc lịch sử, mở rộng chi tiết, xem Full History) đều xử lý **100% tại máy người dùng** bằng React State → **0ms delay, 0 Quota**.

**Quy trình hoạt động:**
```
[Người dùng vào xem] → Vercel CDN trả file HTML tĩnh có sẵn → 0 Compute
[Admin ghi điểm]     → Server Action INSERT + revalidatePath('/') → Tốn Compute 1 lần
[Lần xem tiếp theo]  → Vercel CDN trả file HTML mới (đã được rebuild ngầm) → 0 Compute
```

### 2. Giao dịch Ghi điểm: Local-First + Silent Sync

**Quy trình khi bấm "Ghi kết quả":**
1. **Validation tại Local (0ms):** Kiểm tra đã chọn đủ người chơi chưa, tỷ số hợp lệ chưa.
2. **Local Duplicate Check (0ms):** So sánh 4 người chơi (Thắng/Thua) với **2 trận gần nhất** đã lưu trong `localStorage`. Nếu trùng khớp (không phân biệt thứ tự) trong vòng **15 phút** → Chặn ngay, hiện cảnh báo.
3. **Lưu Draft vào localStorage (0ms):** Lưu trận đấu vào "Hộp đen" trước khi gửi đi. Đây là bảo hiểm cho trường hợp mất mạng/tắt trang.
4. **Phản hồi Instant (1 giây):** Nút đổi sang "✔ Đã lưu!" trong 1 giây → Reset Form → Sẵn sàng nhập trận tiếp.
5. **Background Sync (ngầm):** Gửi dữ liệu đi Singapore dưới nền. Hiển thị **"⟳ Đang đồng bộ..."** nhỏ ở **góc trên bên phải** màn hình.
6. **Khi server xác nhận OK:** Xóa Draft khỏi localStorage, ẩn indicator đồng bộ.
7. **Khi server lỗi (mất mạng):** Indicator đổi màu đỏ "⚠ Chờ đồng bộ". Lần mở app sau sẽ hiện thông báo phục hồi.

**Server-side Duplicate Check (Tầng bọc hậu):** Sau khi request đến server, server cũng check trùng lần nữa để đề phòng 2 người cùng ghi 1 trận trên 2 máy khác nhau.

**Chống bấm nhầm 2 lần:** Disable nút "Ghi" ngay sau cú bấm đầu tiên. Mở khóa lại sau khi Local đã xử lý xong (1 giây), KHÔNG đợi server.

### 3. Chống mất dữ liệu (Offline-first)

**Cơ chế "Hộp đen" (localStorage Backup):**
- Trước khi fetch API, lưu trận đấu vào `localStorage` với trạng thái `pending`.
- Sau khi server trả về `{ success: true }`, đổi trạng thái thành `synced` và xóa.
- Khi mở app, kiểm tra localStorage. Nếu có trận `pending` → Hiện banner: *"Có 1 trận đấu chưa đồng bộ, bấm để thử lại"*.

---

## 🎨 Giao diện & Typography

### Layout (1 cột duy nhất)
Trình tự hiển thị từ trên xuống dưới:
1. **Header:** Tiêu đề "Pickleball Ranking"
2. **StatusBar:** Dải thông số mỏng (Ngày, Tổng trận, Tiền phạt, Nhịp chơi)
3. **Bảng xếp hạng (Main Focus)**
4. **Form Nhập điểm** (Horizontal trên PC)
5. **Lịch sử trận đấu**

### Typography — Hàm `clamp()` co giãn mượt mà

| Thành phần | Mobile (360px) | Full HD (1920px) | 2K/4K (2560px) |
|---|---|---|---|
| Base text | 14px | 16px | 20px |
| Tên người chơi | 16px (Bold) | 18px | 24px |
| Số liệu thống kê | 24px | 36px | 48px |
| Tiêu đề App | 32px | 64px | 80px |

### Quy tắc thiết kế cứng
- **Cấm chữ dưới 14px** trên mọi màn hình.
- **Mirror Legacy:** Mọi tỷ lệ padding, margin, kích thước phải soi từ `legacy/css.html` và `legacy/js.html`. Không được tự ý "chế" ra kích thước mới.
- **Leaderboard Detail:** Dạng Text List (KHÔNG dùng Card to đùng). Gồm 3 dòng: Phong độ, Đồng đội, Đối thủ — cỡ chữ đồng nhất 15-16px.
- **Dropdown (Select):** Phải dùng theme tối đồng bộ (nền tối, chữ trắng). Sửa lỗi trắng xóa.

---

## 🛠️ Công nghệ sử dụng
- **Next.js 14+ (App Router)** + **Tailwind CSS**
- **Database:** Vercel Postgres (Neon) — Server đặt tại Singapore
- **Icons:** Lucide-React
- **State:** `useOptimistic`, `useTransition`
- **Hosting:** Vercel (Free Plan — 60 CU-hrs/tháng)

---

## 📂 Cấu trúc file quan trọng
```
src/
├── app/
│   ├── page.tsx          ← Server Component, ISR, fetch data
│   └── actions.ts        ← Server Actions (addMatch, deleteMatch)
├── components/
│   ├── Dashboard.tsx     ← Client Component gốc, quản lý Optimistic State
│   ├── ScoreForm.tsx     ← Form nhập điểm
│   └── dashboard/
│       ├── Leaderboard.tsx
│       ├── SummaryGrid.tsx
│       └── RecentHistory.tsx
├── lib/
│   └── stats.ts          ← Logic tính BXH, phong độ, đồng đội, đối thủ
legacy/
├── js.html               ← Logic gốc (tham chiếu bố cục, cấu trúc render)
└── css.html              ← CSS gốc (tham chiếu tỷ lệ, padding, margin, font-size)
```
