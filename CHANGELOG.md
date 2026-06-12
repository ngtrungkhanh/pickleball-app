# Changelog

File này chỉ giữ các thay đổi đáng chú ý. Chi tiết theo commit xem trong Git.

## Chưa phát hành

- Gom tài liệu về một entrypoint `AGENTS.md` và hai tài liệu chuyên sâu.
- Bỏ prompt bàn giao, context snapshot, kế hoạch cũ và bảng insight trùng code.
- Chuyển danh sách loại insight cho audit script sang nguồn sự thật trong
  `src/lib/insights.ts`.
- Thêm match delta sync với full-snapshot fallback để Dashboard chỉ nhận các
  trận vừa thêm/sửa/xóa thay vì tải lại toàn bộ lịch sử.
- Đưa audit/revalidation sau add/edit/delete ra khỏi response critical path và
  mở lại form ghi điểm sau khoảng 180 ms.
- Bỏ `player_stats` khỏi luồng ghi; leaderboard và tiền phạt luôn tính local từ
  `matches`.
- Thay version dựa trên thời gian bằng counter atomic trong Postgres để không
  trùng hoặc lùi version khi nhiều thiết bị ghi đồng thời.

## 2026-06

- Tinh chỉnh player picker ghi điểm trên mobile/desktop, trạng thái đã chọn,
  khoảng cách và thứ tự hiển thị so với lịch sử gần đây.
- Đơn giản hóa luồng đồng bộ local-first và tăng khả năng phục hồi khi manifest
  hoặc side effect sau ghi dữ liệu gặp lỗi.
- Giữ trận chưa đồng bộ ở local khi save thất bại; thay optimistic row bằng
  canonical server row khi thành công.
- Tối ưu INP khi submit điểm và tăng độ an toàn khi restore timestamp từ backup.
- Dashboard và Analysis dùng static shell cùng IndexedDB cache theo từng phần dữ
  liệu; Dashboard là điểm kiểm tra manifest chính.

## 2026-05

- Thêm Hall of Fame theo season, ảnh 3:4 lưu trên Vercel Blob và cache ảnh trong
  IndexedDB.
- Xây dựng Analysis Center với Hub, Vinh danh, Cá nhân và Mạng lưới.
- Chuẩn hóa `analysis-core.ts` làm nguồn chung cho ELO, radar, profile, partner,
  opponent và Hub insights.
- Nâng insight selector sang chọn theo rule type, weighted candidate, semantic
  group, cooldown và soft pity; thêm audit script chạy trên JSON backup.
- Thêm Sports Ticker trên Dashboard và Flash News Cards trong Analysis.
- Bổ sung JSON backup/restore toàn bộ dữ liệu và XLSX import cho Admin.
- Thêm duplicate guard theo cặp đội, yêu cầu đủ bốn vị trí và pending retry cho
  form ghi điểm.
- Chuyển lịch sử đầy đủ vào modal Dashboard; bỏ route `/history` và
  `/add-match`.
- Tách database Preview nhánh `dev` khỏi Production và giữ write guard.

## Giai đoạn nền tảng

- Chuyển ứng dụng cũ từ Apps Script/Sheets sang Next.js và Vercel Postgres.
- Xây Dashboard tối, mobile-first với leaderboard, score entry, history,
  settings, season và tiền phạt.
- Thêm Admin audit log, archive/restore, quản lý thành viên, season và trận.
- Giữ `legacy/` làm tài liệu tham khảo, không dùng làm nguồn dữ liệu hiện hành.
