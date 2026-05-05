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

## 🔥 SPRINT 2.5 (CHƯA LÀM): TỐI ƯU HIỆU NĂNG & TRẢI NGHIỆM GHI ĐIỂM

### Task 15: Chuyển đổi sang ISR (Incremental Static Regeneration)

**Mục tiêu:** Tiết kiệm tối đa Compute CU-hrs cho Vercel Free Plan. Hiện tại mỗi lần truy cập đều gọi Database → tốn Quota liên tục.

**Hành động cụ thể:**

1. **Sửa `src/app/page.tsx`:**
   - Dòng 4: Đổi `export const revalidate = 0` thành `export const revalidate = false`.
   - Dòng 8: Đổi `LIMIT 100` thành `LIMIT 500` (Full-Preload toàn bộ trận đấu).

2. **Sửa `src/app/actions.ts`:**
   - Hàm `addMatchAction`: Sau `INSERT`, gọi `revalidatePath('/')` (đã có sẵn, chỉ cần đảm bảo không bị xóa).
   - Hàm `deleteMatchAction`: Tương tự, `revalidatePath('/')` đã có.

3. **Kết quả mong đợi:**
   - Truy cập xem BXH: **0 Compute** (trả file HTML tĩnh từ CDN).
   - Ghi điểm: Tốn Compute **1 lần duy nhất** (INSERT + rebuild HTML).
   - Xem Full Lịch sử: **0 Compute** (dữ liệu đã nhúng sẵn trong HTML).

### Task 16: ScoreForm — Local-First Sync & Silent Background Upload

**Mục tiêu:** Bấm "Ghi" → thấy "Đã lưu" trong 1 giây → Form reset ngay → Dữ liệu gửi ngầm xuống server.

**Hành động cụ thể (sửa `src/components/ScoreForm.tsx`):**

1. **Phản hồi 1 giây:**
   - Dòng 114: Đổi `setTimeout(() => setOptimisticSaved(false), 2000)` thành `1000`.
   - Sau 1 giây: Reset form (clear win1/win2/lose1/lose2), mở khóa nút bấm.

2. **Sync Indicator (góc trên bên phải):**
   - Thêm state `isSyncing` (boolean).
   - Khi bắt đầu gọi `addMatchAction`, set `isSyncing = true`.
   - Khi server trả về (success/error), set `isSyncing = false`.
   - Render một indicator nhỏ cố định ở góc trên bên phải (`fixed top-4 right-4`):
     ```
     isSyncing = true  → "⟳ Đang đồng bộ..." (màu vàng nhạt)
     syncError = true   → "⚠ Lỗi đồng bộ – Thử lại" (màu đỏ, bấm được)
     ```

3. **Tách biệt UI và Network:**
   - Nút "Ghi" chỉ bị disable trong 1 giây (tránh double-click), KHÔNG đợi server response.
   - Quá trình gửi dữ liệu lên server chạy hoàn toàn **dưới nền (Background)**.

### Task 17: Chặn trùng 15 phút (Local Duplicate Check)

**Mục tiêu:** Nếu người chơi nhập trùng y hệt một trận đã ghi trong 15 phút gần nhất → chặn ngay tại máy, không gửi lên server.

**Hành động cụ thể (sửa `src/components/ScoreForm.tsx`):**

1. **Lưu 2 trận gần nhất vào `localStorage`:**
   - Key: `pickleball_recent_matches`
   - Value: Array chứa tối đa 2 trận, mỗi trận gồm: `{ players: [win1, win2, lose1, lose2].sort(), timestamp: Date.now() }`
   - Lưu sau khi validation thành công, trước khi gửi lên server.

2. **Logic kiểm tra trùng:**
   ```typescript
   function isDuplicate(newPlayers: string[]): boolean {
     const recent = JSON.parse(localStorage.getItem('pickleball_recent_matches') || '[]');
     const sorted = newPlayers.filter(Boolean).sort();
     const now = Date.now();
     return recent.some((m: any) => {
       const timeDiff = (now - m.timestamp) / 60000; // phút
       if (timeDiff > 15) return false;
       return JSON.stringify(m.players) === JSON.stringify(sorted);
     });
   }
   ```

3. **Khi phát hiện trùng:** Hiện alert hoặc Toast: *"Trận đấu này dường như đã được ghi trong 15 phút gần đây. Vui lòng kiểm tra lại!"*

### Task 18: Hộp đen (Offline Backup — localStorage)

**Mục tiêu:** Tránh mất dữ liệu khi mạng chập chờn hoặc tắt trang giữa chừng.

**Hành động cụ thể:**

1. **Lưu Draft trước khi gửi:**
   - Key: `pickleball_pending_match`
   - Value: `{ match: { win1, win2, lose1, lose2, winScore, loseScore }, timestamp: Date.now() }`
   - Lưu **TRƯỚC** khi gọi `addMatchAction`.
   - Xóa **SAU** khi server trả về `{ success: true }`.

2. **Phục hồi khi mở App (sửa `src/components/Dashboard.tsx`):**
   - Trong `useEffect` đầu tiên, kiểm tra `localStorage.getItem('pickleball_pending_match')`.
   - Nếu có → Hiện banner cố định ở đầu trang: *"⚠ Có 1 trận đấu chưa đồng bộ do mất mạng. [Thử lại] [Bỏ qua]"*
   - Bấm "Thử lại" → Gọi lại `addMatchAction` với dữ liệu đã lưu.

### Task 19: Server-side Duplicate Check (Tầng bọc hậu)

**Mục tiêu:** Phòng trường hợp 2 người dùng trên 2 máy khác nhau cùng ghi 1 trận.

**Hành động cụ thể (sửa `src/app/actions.ts`):**

1. **Trước khi INSERT, thêm query kiểm tra:**
   ```sql
   SELECT id FROM matches
   WHERE date > NOW() - INTERVAL '15 minutes'
   AND (
     (win_1 IN (${win_1}, ${win_2}) AND win_2 IN (${win_1}, ${win_2}))
     OR (lose_1 IN (${lose_1}, ${lose_2}) AND lose_2 IN (${lose_1}, ${lose_2}))
   )
   LIMIT 1;
   ```
2. **Nếu tìm thấy kết quả:** Return `{ error: 'Trận đấu này đã được ghi trong 15 phút gần đây' }`.

### Task 20: Tối ưu Giao diện còn sót (Nếu vẫn lỗi sau Task 12-14)

**Chỉ làm nếu giao diện vẫn chưa ưng ý sau khi chạy xong Task 12-14.**

- [ ] Kiểm tra lại cỡ chữ toàn bộ Dashboard trên cả 3 loại màn hình (Mobile, Full HD, 2K).
- [ ] Đảm bảo các ô Select và ô Nhập điểm có chiều cao bằng nhau, thẳng hàng.
- [ ] Dấu gạch ngang giữa 2 tỷ số phải to và rõ.
- [ ] Kiểm tra Leaderboard Detail (phần mở rộng): các dòng Text List phải đều nhau.

---

## SPRINT 3 (DỰ KIẾN): THỐNG KÊ & PLUGINS
*(Sẽ cập nhật chi tiết sau khi hoàn thiện Sprint 2.5)*
- Phong độ nâng cao.
- Plugin Thiên địch / Kèo sáng.
- Plugin Cặp đôi tốt nhất.
