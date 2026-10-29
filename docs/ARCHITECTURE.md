# Kiến trúc và dữ liệu

Chỉ đọc mục liên quan khi thay đổi database, server action, cache, localStorage,
revalidation, backup/restore hoặc Vercel.

## Thành phần

- Next.js App Router cung cấp static shell, server actions và API routes.
- Vercel Postgres là nguồn dữ liệu chuẩn.
- Vercel Blob lưu ảnh Hall of Fame.
- IndexedDB là cache dùng chung cho Dashboard và Analysis.
- localStorage chỉ lưu trạng thái UX cục bộ.
- GitHub lưu source; Vercel Preview/Production deploy theo branch.

## Bảng và config chính

- `players`: danh tính và tên chung; các cờ toàn cục chỉ còn phục vụ chuyển dữ liệu cũ.
- `matches`: lịch sử trận.
- `config`: `active_season`, `lose_money` và data versions.
- `seasons`: season và metadata ảnh champion.
- `player_season_settings`: danh sách thành viên theo mùa, ba tuỳ chọn và `deleted_at` riêng từng mùa.
- `audit_logs`: lịch sử thao tác.
- `archives`: dữ liệu soft-delete có thể phục hồi.

Bất biến quan trọng:

- `matches.id` và `matches.date` bắt buộc.
- Trận mới dùng `config.active_season`.
- Record bị xóa mềm dùng `deleted_at` và có thể có `delete_group_id`.
- Write làm thay đổi dữ liệu người dùng phải bump data version đúng phần.
- Xếp hạng, win/loss và tiền phạt được tính ở client từ `matches`; không duy trì
  bảng thống kê dẫn xuất trong luồng ghi.

## Read flow và cache

Dashboard và Analysis là static shell:

1. Client đọc IndexedDB và render ngay nếu cache dùng được.
2. Dashboard kiểm tra manifest từ server.
3. Với `matches`, client ưu tiên lấy change log từ version đang giữ và patch
   từng `upsert/delete` vào IndexedDB.
4. Nếu delta bị thiếu, quá dài, có reset marker hoặc schema chưa sẵn sàng,
   client tải lại full `matches` như trước.
5. Các phần khác chỉ tải khi version mới hơn và thay thế store tương ứng.
6. Filter/sort/analysis thông thường chạy ở client.

Các cache part:

- `players`
- `matches`
- `seasons`
- `config`
- `playerSeasonSettings`

Database IndexedDB là `PickleballDB`, thêm store `hall_images` và `sync_meta`.

Chính sách route:

- Dashboard luôn là điểm reconciliation chính khi mount/F5.
- Analysis đọc local trước, dùng cooldown manifest 60 giây và chỉ bootstrap
  online khi cache trống/không dùng được.
- Điều hướng Dashboard sang Analysis không seed/ghi đè lại toàn bộ IndexedDB.
  Match optimistic và canonical đã được lưu theo write flow; Analysis đọc cache
  dùng chung và tự bootstrap nếu cache không dùng được.
- Admin là luồng quản lý luôn-online.
- Không polling nền.

IndexedDB luôn có thể bị xóa và dựng lại; không được xem là nguồn sự thật.

Match delta được lưu trong `app_data_changes`. Add/edit/delete một trận tạo
change nhỏ; import, restore hoặc thao tác bulk tạo reset marker. Delta chỉ là
tối ưu payload, full snapshot luôn là fallback correctness.

## Match save flow

1. Client kiểm tra đủ bốn vị trí và duplicate local theo đội.
2. Client thêm `TMP-*` match vào state/IndexedDB.
3. Pending draft được lưu ở localStorage.
4. `addMatchAction` tạo id/date, kiểm tra duplicate server và insert Postgres.
5. Server ghi match delta, audit log và data versions.
6. Server trả canonical match.
7. Client thay optimistic row bằng canonical row.
8. Nếu lỗi, optimistic row bị xử lý theo trạng thái retry và pending draft
   không bị mất.

Pending add không tự hết hạn hoặc bị giới hạn số lượng. Khi khởi động, client
phục hồi cả pending cũ từ các row `TMP-*` còn trong IndexedDB, rồi retry khi
online, focus hoặc trở lại foreground. Retry dùng nguyên `client_request_id` để
server replay an toàn. Nếu server có trận khác request nhưng cùng season, đội và
tỷ số gần thời điểm local, row được giữ ở trạng thái conflict để người dùng xóa
temp hoặc xác nhận đây là trận khác.

Form chỉ khóa rất ngắn để tránh double-tap, sau đó reset cho trận tiếp theo mà
không chờ audit log hoặc revalidation. Trạng thái sync/error vẫn chạy độc lập.

Guest match không tăng win/loss ranking. Tiền phạt cho người thật ở đội thua vẫn
được tính.

## Danh sách người chơi theo mùa

Trạng thái xoá thành viên nằm trên player-season row, không ghi đè deleted_at
của trận. Read model loại trận nếu bất kỳ người nào bị xoá trong mùa của trận.
Write tuỳ chọn chỉ patch trường được đổi, yêu cầu row chưa xoá; đổi tên chỉ cập
nhật players.name. Tạo người và kiểm tra tên trùng chạy trong transaction có
advisory lock. Tạo mùa và sao chép roster cũng là một transaction.

Trước khi release cần chuyển dữ liệu bằng seedPlayerSeasonRoster: giữ các
setting hiện có, bổ sung membership từ lịch sử, đặt người chưa có trận/setting
vào mùa đang chạy; Guest có ở các mùa. Chuyển xoá toàn cục cũ thành xoá từng
mùa, chỉ gỡ tombstone trận thuộc chính thao tác xoá người cũ. Backup/restore và
import dùng cùng helper. Không gọi migration trong page render.
Endpoint POST /api/player-roster chỉ dành cho Preview dev, yêu cầu bearer token
PLAYER_ROSTER_MIGRATION_TOKEN và Preview write guard. Production phải được
phê duyệt và chạy migration riêng trước khi release. Bump players, matches,
playerSeasonSettings và ghi match reset sau chuyển đổi để cache đồng bộ lại.

## Edit, delete và restore

Khi chỉnh trận, server update bản ghi `matches`, ghi match delta, audit và bump version.
Client tính lại thống kê từ dữ liệu match đã patch.

Delete dữ liệu có dependency phải ưu tiên soft-delete và archive. Xóa trận là
local-first; client lưu pending delete tombstone trước khi gửi server và tự retry
khi kết nối trở lại. Xóa row `TMP-*` chỉ dọn row local và pending add tương ứng.
Không update trận theo cách làm lệch leaderboard hoặc tiền phạt.

JSON restore:

- thay dữ liệu hiện tại bằng nội dung backup;
- hỗ trợ backup cũ thiếu một số field;
- phục hồi config, seasons và player-season settings khi có;
- tạo season thiếu từ match nếu cần;
- refresh shared IndexedDB sau restore để dữ liệu cũ không quay lại.
- backup trận phải lấy snapshot canonical trực tiếp từ server; restore bỏ qua
  `TMP-*` hoặc row mang trạng thái pending/sync local.

XLSX import:

- đọc sheet `MATCHES`;
- có thể thay toàn bộ lịch sử;
- tạo player id còn thiếu trước khi insert;
- tạo reset marker để client tải snapshot mới sau import.

`sync_excel_to_db.js` là helper phá hủy dữ liệu hiện tại; không chạy với
production nếu chưa được phê duyệt.

## Hall of Fame image flow

- Season hoàn thành lưu `end_date`; Hall of Fame tính ELO đến mốc này. Dữ liệu
  cũ thiếu `end_date` dùng trận xếp hạng cuối cùng để kết quả không đổi theo
  ngày người dùng mở trang.
- Ảnh thuộc champion record của season, không thuộc profile người chơi.
- Client validate JPG/PNG/WebP, crop 3:4, chuyển WebP và giới hạn kích thước.
- Server upload Blob, xóa blob cũ khi thay ảnh và lưu URL/path/update time.
- Cache ảnh dùng season, path và update timestamp làm identity.
- Thiếu `BLOB_READ_WRITE_TOKEN` phải trả lỗi rõ ràng và dùng placeholder.

## localStorage

Các key hiện hành:

- `pickleball_edit_unlocked`
- `pickleball_pending_match`
- `pickleball_pending_match_deletes`
- `pickleball_recent_matches`
- `pickleball_client_id`
- `pickleball_client_nickname`
- `pickleball_admin_auth_date`
- trạng thái lựa chọn Hub insight

Không dùng localStorage làm nguồn leaderboard hoặc match history chia sẻ.

## Bot đánh Lốc

Host điều phối bot Monte Carlo bằng một Web Worker dùng lại giữa các lượt.
Worker chỉ nhận bài của bot và trạng thái công khai, không nhận bài thật của
đối thủ, debug hay kết quả ván trước. Bài chưa thấy được lấy mẫu vào tay đối thủ
theo số lá còn lại và phần bài dư chưa chia.

Mô hình tìm kiếm dùng số lượng từng rank vì luật Lốc không so chất. Mỗi nước
được thử trên cùng các mẫu bài ẩn và chấm bằng `calculateRoundScores`; chỉ các
vòng so sánh đầy đủ mới được ghi nhận. Rollout của từng người chỉ dùng tay người
đó và thông tin công khai. Đây là Monte Carlo lấy mẫu, không phải mô hình đã
huấn luyện hay tìm kiếm ISMCTS.

Ngân sách, giới hạn mẫu và timeout worker nằm trong source bot. Khi worker lỗi,
không hỗ trợ hoặc quá hạn, host dùng nước dự phòng không chạy mô phỏng. Pause,
đổi lượt và destroy vô hiệu hóa kết quả cũ; worker đang tính bị hủy. Cache tìm
kiếm giới hạn theo từng quyết định, không giữ cây tìm kiếm qua nhiều ván.

`BotBrain` cũ giữ nguyên hành vi và có alias `LegacyBotBrain`. `addBot('legacy')`
cho phép dùng lại; mặc định thêm bot Monte Carlo. `npm run test:loc-bots` chạy
200 ván trên HostGameEngine thật, 100 bộ bài được đổi loại bot giữa các ghế,
và xuất báo cáo JSON vào thư mục tạm (hoặc `LOC_BOT_ARENA_REPORT`). Bộ arena
không gọi database; test thường bỏ qua lần đấu dài này. Các test mô hình đối
chiếu từng lượt và kết toán với engine thật trên bàn 3–5 người.

## Deploy và môi trường

- `main` deploy Production với Production database.
- `dev` deploy Preview với dev database riêng.
- Merge branch chỉ merge code.
- `ALLOW_PREVIEW_WRITES=true` chỉ thuộc Preview nhánh `dev`.
- Giữ `NEXT_PUBLIC_EDIT_PASS`, database URL, setup secret và Blob token ngoài
  Git.

API setup/migrate có khả năng thay schema/dữ liệu, phải được bảo vệ và không gọi
trong page render thông thường.

## Build local

Mức kiểm tra theo loại tác vụ nằm trong `AGENTS.md`. Tác vụ chỉ đọc/tài liệu
không cần build hoặc deploy. Với UI nhỏ không đổi logic, có thể dùng build
Vercel thành công thay build local. Thay đổi logic hoặc rủi ro cao
phải build local theo bảng kiểm tra và xác nhận deployment trước nghiệm thu.

Dashboard và Analysis không cần query Postgres trong prerender vì là static
shell. Route động/Admin/API vẫn cần env hợp lệ khi được chạy.

Nếu build lỗi kết nối Postgres trong prerender hoặc tool vận hành, kiểm tra
`.env.local` đang dùng pooled URL thay vì direct URL. Không sửa hoặc commit secret
chỉ để làm build qua.

## Bảo vệ tài nguyên kiểm tra

`npm run test` và `npm run build` đi qua `scripts/run-resource-guard.mjs`, dùng
chung khóa tài nguyên. Wrapper chuyển tiếp tham số: `npm run test -- <test-file>`
chạy test liên quan; `npm run test` chạy toàn bộ suite. Không gọi trực tiếp Vitest
hoặc Next build, không chạy test đồng thời build.

Giữ build Webpack, `webpackMemoryOptimizations`, `cpus: 1` và timeout 2 phút.
Turbopack từng kẹt compile và làm cạn pagefile local. Wrapper kiểm tra RAM/commit
headroom trước khi chạy; watchdog Windows dừng sớm khi host tiến gần vùng paging
nặng, giới hạn cây Node của test ở 640 MB và build ở 1,8 GB private memory.
Test dùng một worker-thread. Lỗi thiếu tài nguyên phải được xử lý theo nguyên
nhân; không bỏ guard hoặc lặp build trên cùng điều kiện lỗi.
