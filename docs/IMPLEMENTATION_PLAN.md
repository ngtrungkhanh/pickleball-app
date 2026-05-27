# Kế hoạch Triển khai: Tích hợp 86 Kịch bản Insights và các Phiên bản Nội dung

Chúng tôi đã hoàn thành việc rà soát toàn bộ file tài liệu quy tắc [docs/ANALYSIS_INSIGHTS_RULES.md](file:///d:/Pickleball%20App/docs/ANALYSIS_INSIGHTS_RULES.md), sửa chữa các lỗi nháp và lập kế hoạch chi tiết dưới đây để tích hợp vào codebase.

## Kết quả Rà soát File Tài liệu Quy tắc

1. **Số lượng kịch bản**: Đầy đủ 86 kịch bản (từ 1 đến 86), không thiếu kịch bản nào.
2. **Kịch bản có 2 bậc trigger (Trạng thái 1 & Trạng thái 2)**:
   - Gồm các kịch bản: `11 (streak_breaker)`, `12 (revenge_win)`, và `23 (glued_pair)`.
   - Mỗi trạng thái của các kịch bản này đã có đầy đủ **tối thiểu 4 phiên bản** văn bản tiếng Việt khác nhau (tổng cộng 8 phiên bản cho mỗi kịch bản).
3. **Các kịch bản khác**: Đều có **tối thiểu 5 phiên bản** tiếng Việt.
4. **Vết nháp/Ellipsis**:
   - Đã tìm thấy và loại bỏ hoàn toàn dòng chứa ký tự nháp `\dots` ở Kịch bản `82 (chameleon_partner)`.
   - Ký tự `...` ở Kịch bản `71` (`đỏ... lửa`) là chủ ý diễn đạt hài hước của nội dung, không phải vết nháp.
5. **Logic Trigger**: Khớp hoàn toàn với nội dung văn bản tương ứng của các phiên bản.

---

## Kế hoạch Triển khai Chi tiết (Tiếng Việt)

Chúng tôi sẽ tiến hành cập nhật file [src/lib/insights.ts](file:///d:/Pickleball%20App/src/lib/insights.ts) theo các bước sau:

### 1. Nâng cấp Engine Lựa chọn Insights để hỗ trợ chọn Phiên bản Ngẫu nhiên
- Hàm khởi tạo và các hàm tạo ứng viên (`addFormAndEloCandidates`, `addStoryCandidates`, `addPartnerCandidates`, `addScoreCandidates`, `addOpponentCandidates`, `addFunCandidates`) sẽ được truyền thêm hàm `random?: () => number` từ `InsightSelectionOptions`.
- Xây dựng hàm helper `getRandomVariant(variants: string[], randomFn?: () => number): string` để chọn phiên bản:
  - Nếu có `randomFn`, sử dụng kết quả của nó để chọn chỉ số phần tử trong mảng (đảm bảo tính nhất quán/deterministic khi có seed).
  - Nếu không có, sử dụng `Math.random()`.

### 2. Triển khai 86 Kịch bản và các Bản dịch/Biến thể tương ứng
Chúng tôi sẽ định nghĩa cấu trúc dữ liệu cho tất cả 86 kịch bản trong `src/lib/insights.ts`. Mỗi kịch bản sẽ có:
- Điều kiện Trigger (Trigger Logic) khớp chính xác với tài liệu [ANALYSIS_INSIGHTS_RULES.md](file:///d:/Pickleball%20App/docs/ANALYSIS_INSIGHTS_RULES.md).
- Mảng chứa 5 phiên bản (hoặc 4 phiên bản cho từng trạng thái đối với các kịch bản 2 bậc trigger) để lựa chọn ngẫu nhiên.

Các nhóm kịch bản sẽ được phân chia rõ ràng:
- **Form & ELO Candidates** (Kịch bản 1-10, 13-14, 55-56, 58-59, 61-62, 64)
- **Chronological / Story Candidates** (Kịch bản 11-12, 46, 67-68, 73)
- **Partner & Edge-based Candidates** (Kịch bản 15-26, 69, 71-72, 82)
- **Score Margin & Match Pattern Candidates** (Kịch bản 27-36, 60, 65, 80, 83)
- **Opponent & Matchup Candidates** (Kịch bản 37-45, 63, 70)
- **Fun / Attendance & Club Statistics Candidates** (Kịch bản 47-54, 57, 66, 74-79, 81, 84-86)

### 3. Quy tắc Biên soạn Wording trên UI
- Đảm bảo giữ đúng văn phong tự nhiên, vui vẻ, trêu đùa nhẹ nhàng mà không dùng các thuật ngữ kỹ thuật (như ELO cụ thể, deuce, impact score) trừ khi quy tắc chỉ định rõ.
- Riêng đối với kịch bản `86 (golden_victim)`, hiển thị chính xác số lần thua 11-0 bằng biến `${goldenPickled}` (dạng `bị thua \${goldenPickled} lần 11-0`) và không chèn các ghi chú phụ trong ngoặc đơn.

---

## Kế hoạch Xác minh & Kiểm thử (Verification Plan)

### Kiểm tra Tự động (Automated Testing)
1. **Kiểm tra Biên dịch (TypeScript Compilation)**:
   - Chạy lệnh `npm run dev` hoặc `npx tsc --noEmit` để đảm bảo code typescript biên dịch thành công mà không gặp bất kỳ lỗi cú pháp hay kiểu dữ liệu nào.
2. **Kiểm tra Logic & Seed**:
   - Chạy các test case hiện có để xác định xem các thay đổi có làm hỏng cấu trúc dữ liệu trả về của `/analysis` không.

### Kiểm tra Thủ công (Manual Verification)
1. **Kiểm tra hiển thị giao diện**:
   - Người dùng F5 lại trang `/analysis` để xác nhận các câu gợi ý xuất hiện đa dạng hơn, thay đổi ngẫu nhiên theo seed và không có dòng nào bị lỗi render hoặc hiển thị placeholder trống.
