# Kiến trúc và dữ liệu

Đọc file này khi thay đổi database, server action, cache, localStorage,
revalidation, backup/restore hoặc Vercel.

## Thành phần

- Next.js App Router cung cấp static shell, server actions và API routes.
- Vercel Postgres là nguồn dữ liệu chuẩn.
- Vercel Blob lưu ảnh Hall of Fame.
- IndexedDB là cache dùng chung cho Dashboard và Analysis.
- localStorage chỉ lưu trạng thái UX cục bộ.
- GitHub lưu source; Vercel Preview/Production deploy theo branch.

## Bảng và config chính

- `players`: thành viên và trạng thái active.
- `matches`: lịch sử trận.
- `config`: `active_season`, `lose_money` và data versions.
- `seasons`: season và metadata ảnh champion.
- `player_stats`: thống kê tăng dần theo người/season.
- `player_season_settings`: cấu hình theo người và season.
- `audit_logs`: lịch sử thao tác.
- `archives`: dữ liệu soft-delete có thể phục hồi.

Bất biến quan trọng:

- `matches.id` và `matches.date` bắt buộc.
- Trận mới dùng `config.active_season`.
- Record bị xóa mềm dùng `deleted_at` và có thể có `delete_group_id`.
- Write làm thay đổi dữ liệu người dùng phải bump data version đúng phần.

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
5. Server cập nhật `player_stats`, audit log và data versions.
6. Server trả canonical match.
7. Client thay optimistic row bằng canonical row.
8. Nếu lỗi, optimistic row bị xử lý theo trạng thái retry và pending draft
   không bị mất.

Form chỉ khóa rất ngắn để tránh double-tap, sau đó reset cho trận tiếp theo mà
không chờ audit log hoặc revalidation. Trạng thái sync/error vẫn chạy độc lập.

Guest match không tăng win/loss ranking. Tiền phạt cho người thật ở đội thua vẫn
được tính.

## Edit, delete và restore

Khi chỉnh trận:

1. đọc trạng thái cũ;
2. đảo contribution cũ;
3. update match;
4. áp contribution mới;
5. ghi audit và bump version.

Delete dữ liệu có dependency phải ưu tiên soft-delete và archive. Không update
trận theo cách làm lệch leaderboard hoặc tiền phạt.

JSON restore:

- thay dữ liệu hiện tại bằng nội dung backup;
- hỗ trợ backup cũ thiếu một số field;
- phục hồi config, seasons và player-season settings khi có;
- tạo season thiếu từ match nếu cần;
- refresh shared IndexedDB sau restore để dữ liệu cũ không quay lại.

XLSX import:

- đọc sheet `MATCHES`;
- có thể thay toàn bộ lịch sử;
- tạo player id còn thiếu trước khi insert;
- rebuild stats sau import.

`sync_excel_to_db.js` là helper phá hủy dữ liệu hiện tại; không chạy với
production nếu chưa được phê duyệt.

## Hall of Fame image flow

- Ảnh thuộc champion record của season, không thuộc profile người chơi.
- Client validate JPG/PNG/WebP, crop 3:4, chuyển WebP và giới hạn kích thước.
- Server upload Blob, xóa blob cũ khi thay ảnh và lưu URL/path/update time.
- Cache ảnh dùng season, path và update timestamp làm identity.
- Thiếu `BLOB_READ_WRITE_TOKEN` phải trả lỗi rõ ràng và dùng placeholder.

## localStorage

Các key hiện hành:

- `pickleball_edit_unlocked`
- `pickleball_pending_match`
- `pickleball_recent_matches`
- `pickleball_client_id`
- `pickleball_client_nickname`
- `pickleball_admin_auth_date`
- trạng thái lựa chọn Hub insight

Không dùng localStorage làm nguồn leaderboard hoặc match history chia sẻ.

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

Dashboard và Analysis không cần query Postgres trong prerender vì là static
shell. Route động/Admin/API vẫn cần env hợp lệ khi được chạy.

Nếu build lỗi kết nối Postgres trong prerender hoặc tool vận hành, kiểm tra
`.env.local` đang dùng pooled URL thay vì direct URL. Không sửa hoặc commit secret
chỉ để làm build qua.
