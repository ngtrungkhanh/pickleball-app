# Pickleball App Dev Log

## Versioning
- Bugfix after a release: bump patch, for example patch-level release to the next patch version.
- New feature or larger behavior change: bump minor, for example minor-level release to the next minor version.
- Do not bump to `2.0.0` unless the owner explicitly asks.
- Keep one current version marker file named `version_X_Y_Z.html`.

## Sync Rules
- Local-first: render/cache local changes before calling Apps Script.
- Add/delete match must write a temp/pending item before the server call.
- Remove pending items only after server success or server duplicate-success.
- Background LOG tier 1 should be silent and cheap.
- If LOG tier 2 detects changed parts and starts data sync, show sync status.
- Avoid `getAppData()` except cold load without cache and one-time fallback after partial sync failure.

## CSS Rules
- Use one active CSS include: `css.html`.
- Keep final mobile/detail overrides at the end of `css.html`.
- Do not add another versioned CSS include unless explicitly needed.

## Current Notes
- v1.8.2 keeps add-match success lightweight: replace temp, update log/cache, render history only unless season/view changed.
- Add match should not bump `seasons_version`; season/config actions own season/config versions.
- Server add-match duplicate guard checks only the last 3 match rows within 15 minutes.
- Server add-match returns match ids/date/score only; client enriches names from local cache.
- Match add/delete should use minimal sheet setup, not full `ensureDatabase()`.
- v1.8.3 uses one shared newest-first match sorter for history and player recent form.
- v1.9.0 adds score steppers and tap-to-select score inputs; Enter/Done blurs back toward submit.
- v1.9.0 full history delete button uses compact `×`.
- v1.9.1 keeps mobile score controls horizontal but stacks score steppers vertically on desktop to fit the center score box.
- v1.9.2 increases mobile score stepper touch targets and uses viewport maximum-scale to avoid score input focus zoom.
- v1.9.3 hides score +/- steppers on desktop and makes mobile +/- steppers larger.
- v1.9.4 restores desktop score layout to horizontal, applies large mobile steppers through `body.is-mobile-shell`, and locks viewport scale on score focus/blur.
- v1.9.5 adds `score-touch-shell` JS/CSS fallback so touch devices keep horizontal score controls with visible large +/- even when iframe viewport looks desktop-sized.
- v1.9.6 prevents +/- score taps from focusing/selecting score inputs, trusts real screen size for mobile shell detection, and tightens desktop score input width/spinners.
- v1.9.7 polishes desktop score box: wider center column, larger title, compact horizontal score inputs without touching mobile score controls.
- v1.10.0 adds smart score defaults: median win/lose score from up to 50 newest matches in the current season, fallback `11-5` when the season has fewer than 5 matches.
- v1.10.0 blocks mobile double-tap zoom only inside score controls with a scoped `touchend` guard plus `touch-action/user-select` CSS.- v1.10.1 applies smart score defaults on app/cache load too, but only while score inputs are pristine so background sync does not overwrite a user-entered score.
- v1.11.0 adds anonymous Device Fingerprinting (unique `USR-XXXX` + device details + custom nicknames) saved directly in the `matches` table under `created_by` (width raised from 20 to 50 in setup DB).
- v1.11.0 adds Direct Inline Editing for both players list (renaming) and matches history (time, players, scores) directly in the Admin Panel.
- v1.11.0 implements statistical balance reversal in `updateMatchAction` to correctly subtract old scores and apply new scores incrementally.
- v1.11.0 fixes all corrupted Vietnamese font encoding issues on the Admin Panel page.

## Handoff Notes
- Always read this file before changing code. Update it after every non-trivial fix so the next Codex session has the current assumptions.
- Also read `WORKFLOW_LOG.md` for owner-locked UI notes, active workflow, viewport review order, and recent UI decisions.
- Current active CSS file is `css.html`; `index.html` should include only `css`, `modules`, `js`, and `addon_loader`.
- Keep only one current version marker file, currently `version_1_10_1.html`; visible badge is in `addon_version_badge.html`.
- Score UI has several historical override blocks in `css.html`; the final blocks intentionally win. Be careful when changing PC/mobile score layout because Apps Script iframe/mobile detection can differ from browser devtools.
- Sync must stay local-first. Background LOG check must not lock add/delete buttons, and match add/delete should avoid full `getAppData()` when the server already returns enough match/log data.
- Pending queues are part of offline resilience: do not remove temp/pending match/delete records until server success or duplicate-success is confirmed.

## Sprint 1
- **Task 1 completed**: Cài đặt `@vercel/postgres`, file `.env.local` đã sẵn sàng, API `/api/setup` để khởi tạo database (`players`, `matches`, `config`) đã có sẵn code đúng chuẩn.
- **Task 2 completed**: Cài đặt `xlsx`, tạo API `/api/migrate` để đọc file `legacy/PICKLEBALL RANKING.xlsx` và map sang Postgres schema. Xử lý chuẩn epoch date từ Excel qua JavaScript Date.
- **Task 3 completed**: Sửa lỗi `Cannot access file` của thư viện `xlsx` trong Next.js bằng cách đọc file bằng `fs.readFileSync` rồi mới truyền buffer vào `xlsx.read`.

## Sprint 2 (Update: All-in-one Dashboard)
- **Task 1 completed**: Thiết lập Design System (Tailwind v4) và Layout cơ bản.
- **Task 2 & 3 completed**: Tái cấu trúc toàn bộ `app/page.tsx` thành Dashboard tổng hợp. Triển khai logic tính toán Leaderboard từ dữ liệu trận đấu. Tích hợp Optimistic UI sử dụng `useOptimistic` giúp Leaderboard, Summary và History cập nhật tức thì khi thêm trận đấu mới. Giao diện được tối ưu Glassmorphism và Responsive chuẩn PC/Mobile.

## Sprint 2 (Hotfix: Dark Mode & Việt Hóa)
- **Task 1 completed**: Chuyển hệ thống sang giao diện Dark Mode (Slate-950) mặc định. Việt hóa 100% giao diện sang Tiếng Việt. Mở rộng Summary Grid lên 4 thẻ (Ngày chơi, Tổng trận, Tiền phạt, Nhịp chơi).
- **Task 2 completed**: Cấu hình Dashboard 2 cột cho PC. Thêm tính năng click vào thành viên trên BXH để xem chi tiết phong độ (W/L) và thông tin cá nhân.
- **Task 3 completed**: Tối ưu RecentHistory (hiện 4 tên, ngày giờ chi tiết). Tinh chỉnh ScoreForm với Stepper nút to tối ưu cho mobile và chống đè layout trên PC.
- **Task 4 completed**: Đại tu giao diện PC cho độ phân giải Full HD (1920x1080) with container rộng (1800px) và typography lớn hơn. Thay thế Popup bằng hiệu ứng Accordion (trượt xuống) trong Leaderboard. Nâng cấp SummaryGrid với thiết kế thẻ sang trọng.
- **Task 7 completed**: Triển khai chiến lược Scaling cho màn hình 2K/4K sử dụng CSS `clamp()`. Nâng cấp Dashboard lên bố cục **3 cột** trên màn hình siêu rộng (BXH | Form | Lịch sử). Thêm hiệu ứng Glow Border và Shadow sâu để tăng độ Premium.
- **Task 5 & 6 completed**: Tối ưu Typography Mobile và PC (clamp). Triển khai cơ chế **Stacked Metadata** cho Leaderboard Mobile (Tên dòng trên, Stats dòng dưới) để chống che text và đảm bảo hiển thị 100% cột dữ liệu trên màn hình hẹp.
- **Task 8 & 9 completed**: Sửa lỗi hiển thị RecentHistory (chia 3 vùng rõ rệt). Tái cấu trúc Dashboard về **1 cột duy nhất (Compact & Clean)**. Thu gọn SummaryGrid thành dải mỏng, giảm padding BXH để tối ưu diện tích hiển thị trên màn Full HD. Khắc phục lỗi cụt chữ trong ScoreForm và Leaderboard.
- **Task 10 completed**: Chuyển SummaryGrid thành **StatusBar** siêu mỏng. Tái cấu trúc **Horizontal ScoreForm** (3 cột trên PC) giúp giảm 50% chiều cao form. Triển khai **2K Scaling** qua breakpoint `2xl`. Tinh giản Header và tối ưu nút Stepper cho diện tích nhỏ.
- **Task 11 completed**: Chuẩn hóa Typography bằng `clamp()` cho 2K/FullHD/Mobile. Đổi tên App thành **Pickleball Ranking**. Chuyển Summary Mobile sang Grid 2x2. Tối ưu ScoreForm với tỷ số 1 dòng và xử lý triệt để lỗi màu sắc Dropdown (Dark theme).
- **Task 13 completed**: Hoàn tất kỹ thuật **Mirror Layout Legacy**. Chuyển Leaderboard Detail sang dạng Text List tinh tế (Phong độ, Đồng đội, Đối thủ). Tái cấu trúc ScoreForm và SummaryGrid theo đúng tỷ lệ của bản App Script cũ. Tối ưu Stacked Metadata trên Mobile để chống che text 100%.
- **Task 14 completed**: Thực hiện Hotfix UX toàn diện: Căn giữa tiêu đề, tăng size font Summary & BXH cho màn 2K. Sửa lỗi logic ngày (Hôm nay/Hôm qua). Triển khai **Season Selector** tương tác. Đồng bộ cỡ chữ đồng đội trong Lịch sử và kích hoạt nút Xóa trận đấu.

## Sprint 2.5 (ĐÃ HOÀN THÀNH: Tối ưu hiệu năng, Bảo mật, & Quản trị)
- **Tối ưu hóa Vercel Free Plan**: Chuyển đổi thành công sang kiến trúc ISR (Incremental Static Regeneration) tiết kiệm Compute CU-hrs tối đa. Lịch sử tải Full-Preload 500 trận chỉ tốn 0 Compute khi xem.
- **Local-First & Offline Resilience**: Trình làng cơ chế "Hộp đen" (localStorage backup) tự động lưu Draft khi sóng yếu, kèm Sync Indicator góc phải. Tính năng chống Duplicate 15 phút cả ở client (quét 2 trận gần nhất) lẫn bọc hậu ở Postgres server.
- **Bảo mật & Định danh Thiết bị**: Nhúng vĩnh viễn bộ tạo Device ID ẩn danh `USR-XXXX` và trường đặt Biệt danh (Ví dụ: "Hiếu PC") kết hợp navigator.userAgent ghi nhận dòng máy. Nâng cấp cột `created_by` từ 20 lên 50 ký tự trong setup DB (`src/app/api/setup/route.ts`).
- **Quản trị Inline Edit**: Thiết kế nút `[Sửa]` cạnh tên thành viên trong Tab Settings, và nút `Sửa` trực tiếp trên mỗi trận đấu tại Tab Lịch sử. Toàn bộ dòng biến thành Form Inline chỉnh sửa (Ngày-giờ, 4 người chơi, tỷ số) cực mượt.
- **Logic Cân bằng điểm số (Incremental Stats Recalculation)**: Hàm `updateMatchAction` tự động trừ ngược điểm số/tiền phạt của người chơi cũ và cộng điểm mới chính xác tuyệt đối mà không cần tính lại từ đầu.
- **Hotfix mã hóa phông chữ**: Dọn dẹp triệt để 100% lỗi phông hiển thị ký tự lạ (mojibake) trên trang Admin, chuyển đổi hoàn toàn sang UTF-8 thuần việt chuẩn.
