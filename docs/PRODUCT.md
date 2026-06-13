# Sản phẩm và UI

Đọc file này khi thay đổi hành vi người dùng, route, wording, responsive layout
hoặc thao tác quản trị. Không ghi chi tiết implementation có thể đọc trực tiếp
từ code.

## Phạm vi

Ứng dụng phục vụ một nhóm pickleball nhỏ, dữ liệu dự kiến từ vài trăm đến vài
nghìn trận:

- ghi điểm đôi nhanh trên điện thoại;
- leaderboard, form, partner/rival và tiền phạt;
- lịch sử trận và season;
- Hall of Fame;
- trung tâm phân tích ELO;
- công cụ quản trị, backup và restore.

## Chế độ người dùng

- Mặc định là read-only.
- Edit mode được mở trong Settings và lưu cục bộ trên trình duyệt.
- Read-only vẫn xem được leaderboard, lịch sử và Analysis.
- Edit mode cho phép ghi trận và dùng các thao tác quản trị phù hợp.
- Preview write guard có thể chặn toàn bộ write nếu môi trường chưa an toàn.

## Route

- `/`: Dashboard, summary, leaderboard, score form, recent/full history và
  Settings.
- `/analysis`: phân tích read-only.
- `/admin`: quản lý dữ liệu, audit, archive, backup/restore và import.
- `/fast-add`: Giao diện nhập điểm nhanh tối giản chuyên dùng cho PWA shortcut. Có một đường link bí mật (phiên bản v1.0.0) ẩn dưới cùng góc trái màn hình Settings để truy cập thủ công.
- Không có route người dùng riêng cho `/history` hoặc `/add-match`.

## Ghi điểm

- Bắt buộc chọn đủ `winner 1`, `winner 2`, `loser 1`, `loser 2`.
- Guest được chọn như người chơi nhưng không được lặp người thật trong cùng đội.
- Điểm mặc định là `11-5`.
- Mobile dùng control dễ bấm; desktop có layout gọn hơn.
- Duplicate guard dùng key theo đội trong cửa sổ 15 phút:
  `season::sort(win_1,win_2)>sort(lose_1,lose_2)`.
- Khi nghi trùng, client hỏi xác nhận và server kiểm tra lại.
- UI thêm optimistic match, lưu pending draft và hiển thị trạng thái
  saving/saved/error.
- Form reset gần như ngay sau optimistic save để có thể nhập trận tiếp theo;
  không cần chờ server hoàn thành audit/revalidation.
- Trận mới luôn dùng active season.

## Leaderboard

Ranking chỉ tính trận doubles hợp lệ, không có Guest.

Thứ tự xếp:

1. win rate giảm dần;
2. số trận thắng giảm dần;
3. số trận thua tăng dần;
4. tên tăng dần.

Leaderboard chỉ hiển thị người chơi active, non-guest và tối đa 20 người.

Chi tiết mở rộng gồm:

- form 5 trận mới nhất và nhận xét ổn định theo dữ liệu;
- partner đủ tối thiểu 5 trận và trên 50% win rate;
- đối thủ khó/dễ đủ mẫu;
- record, score difference, recent form và close-game context.

Form chip sắp mới nhất trước. Không dùng raw win rate đơn thuần để chọn partner
hoặc rival khi confidence/sample cho kết quả hợp lý hơn.

## Season và Guest

- Active season lấy từ `config.active_season`.
- `Tong hop` là chế độ xem tất cả season.
- Selector phải giữ cả season chưa có trận.
- Season bắt đầu dựa trên dữ liệu trận khi có thể.
- Guest id là `__GUEST__`, có thể xuất hiện trong lịch sử nhưng không tính
  ranking/analytics.
- Tiền phạt vẫn tính cho người thật ở đội thua trong trận có Guest.

## Settings và Admin

Settings hỗ trợ:

- mở/khóa edit mode;
- thêm, đổi tên, active/inactive và xóa thành viên;
- tạo, kích hoạt, kết thúc hoặc xóa season;
- chỉnh tiền phạt;
- upload/xóa ảnh Hall of Fame theo champion của season.

Admin hỗ trợ:

- xác thực theo ngày ở localStorage;
- audit log và archive/recycle bin;
- backup/restore JSON;
- import XLSX thay lịch sử từ sheet `MATCHES`;
- quản lý thành viên, season và chỉnh trận inline;
- rebuild stats.

Restore JSON thay toàn bộ trạng thái tương ứng trong backup. Season cũ không có
trong backup không được tự xuất hiện lại sau restore.

## Lịch sử

- Dashboard hiển thị 5 trận gần nhất.
- Full history mở bằng modal, nhóm theo season/ngày và có filter.
- Chỉ edit mode mới được xóa trận.
- Layout mobile ưu tiên date/time rail gọn và nội dung hai đội dễ đọc.

## Analysis

Analysis có bốn zone:

- `Tổng quan`: summary, ELO, weekly movement và insight feed.
- `Vinh danh`: champion của các season đã hoàn thành.
- `Cá nhân`: ELO, win rate, radar, form, partner, opponent và recent matches.
- `Mạng lưới`: quan hệ partner/opponent và chênh lệch so với kỳ vọng ELO.

Hall of Fame độc lập với season filter:

- chỉ season hoàn thành mới có champion;
- active season hiển thị trạng thái đang diễn ra;
- card ngang, ảnh 3:4 bên trái, thông tin bên phải;
- 2 cột ở Full HD thông thường, 3 cột chỉ ở viewport rất rộng;
- click card mở detail panel theo hàng, không dùng modal trên mobile.

## Quy tắc UI

- Mobile-first; không sửa desktop làm overflow hoặc giảm tap target trên mobile.
- Review lần lượt mobile, Full HD, 2K, 4K.
- Phong cách tối, gọn, thiên về công cụ nội bộ; tránh hero/decoration quá lớn.
- Card chính ưu tiên bo góc mềm, mật độ cao nhưng vẫn đọc được.
- Không tạo nested scroll cho leaderboard nhỏ; để trang cuộn tự nhiên.
- Dashboard và Analysis không có nút refresh thủ công; reload/F5 là hành động
  lấy dữ liệu mới.
- Insight không tự rotate theo timer trong một page load.
- Network card giải thích bằng ngôn ngữ kỳ vọng ELO, không lộ thuật ngữ kỹ thuật
  như `baseline`, `impact` hoặc phần trăm nội bộ.
- Tiếng Việt trong source phải là UTF-8 hợp lệ, không thêm mojibake.

## Không được phá vỡ

- Không làm mất lịch sử trận.
- Không tính Guest vào ranking.
- Không hardcode trận mới vào Season 1.
- Không ẩn season có 0 trận.
- Không bỏ optimistic save/pending retry mà không có cơ chế thay thế.
- Không dùng `legacy/` làm nguồn sự thật.

## Backlog (Ý tưởng tương lai)

- **Đóng gói file APK/App (PWABuilder / TWA / Capacitor):** Giải quyết triệt để giới hạn của Web Speech API trên PWA di động (iOS Safari/Android WebView), cho phép sử dụng nút Ghi âm trực tiếp (Native Mic) mà không cần dùng giải pháp "Nút Mic Lai" bật bàn phím ảo.
- **Cập nhật thời gian thực (Real-time/Push):** Tích hợp Pusher (hoặc Supabase Realtime) qua WebSocket để tự động đẩy trạng thái trận đấu mới xuống các client đang mở (active tab). Tránh dùng Server-Sent Events (SSE) hoặc Polling của Vercel để không bị cạn quota Free 100,000 invocations/tháng. Khi app bị tắt/xuống nền, ngắt kết nối WebSocket và dùng `visibilitychange` (SWR revalidateOnFocus) để đồng bộ lại dữ liệu mới nhất lúc mở lại.
