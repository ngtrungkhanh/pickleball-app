# Data Sync Agent Brief

Tài liệu này được viết để gửi cho các agent/consultant khác review riêng bài toán
đọc/ghi dữ liệu local/server của app Pickleball Ranking Dashboard. Người đọc có
thể chưa biết repo, nên tài liệu cố tình tự đủ ngữ cảnh và ghi rõ các file cần
tra khi cần kiểm chứng implementation.

Tài liệu này **không phải plan triển khai cuối cùng**. Mục tiêu là mô tả hiện
trạng, điểm rủi ro, mục tiêu tối ưu, và các câu hỏi cần tư vấn để agent khác có
thể đề xuất một architecture sync hợp lý.

## 1. Project Overview

Pickleball Ranking Dashboard là web app quản lý giải pickleball nội bộ. Người
dùng chính dùng app để nhập kết quả trận, xem bảng xếp hạng, lịch sử, tiền phạt,
season, Hall of Fame, và trang phân tích hiệu suất.

Sản phẩm hiện có các luồng chính:

- Nhập trận 2v2 từ Dashboard.
- Xem leaderboard, summary, recent history, full history.
- Xóa/sửa trận trong chế độ edit/admin.
- Quản lý thành viên, season, mức phạt, ảnh vinh danh.
- Analysis Center đọc dữ liệu trận để tính ELO, form, pair/opponent impact,
  radar profile, insights.
- Admin hỗ trợ import XLSX, backup/restore JSON, audit/archive.

Stack hiện tại:

- Next.js App Router.
- React client components.
- Tailwind CSS.
- Vercel hosting.
- Vercel Postgres là database chính.
- Vercel Blob lưu ảnh Hall of Fame.
- Browser IndexedDB lưu cache route-to-route.
- Browser localStorage/sessionStorage lưu trạng thái UX và pending retry.

Source of truth hiện tại:

- **Postgres là nguồn dữ liệu đúng cuối cùng**.
- **IndexedDB không phải source of truth**. IndexedDB chỉ là cache local để
  render nhanh, tránh tải lại full data khi đi giữa Dashboard/Analysis/Admin.
- **localStorage không phải source of truth**. localStorage chỉ dùng cho pending
  save, duplicate helper, device identity, edit/admin unlock, và vài preference
  UI.

Branch/database policy:

- Production domain: `https://conchimnon.vercel.app/`.
- Production branch: `main`.
- Shared working branch: `dev`.
- Preview branch `dev` dùng database dev riêng qua Vercel branch env override.
- Production dùng production database.
- Merge code từ `dev` vào `main` không merge data database.
- Không được chạy destructive migration/drop/alter production nếu chưa có xác
  nhận riêng.
- Preview write guard vẫn cần giữ để tránh preview vô tình ghi vào production DB.

Các file quan trọng để tra implementation:

- `src/app/actions.ts`
- `src/lib/db.ts`
- `src/lib/use-shared-app-data.ts`
- `src/lib/data-version.ts`
- `src/components/ScoreForm.tsx`
- `src/components/Dashboard.tsx`
- `src/app/admin/page.tsx`
- `src/components/SettingsModal.tsx`
- `src/components/analysis/AnalysisCenter.tsx`
- `src/app/analysis/page.tsx`
- `src/app/api/migrate/route.ts`
- `src/app/api/restore/route.ts`
- `docs/DATA_FLOW.md`

## 2. Current User Priority

Ưu tiên sản phẩm hiện tại:

- UX local phải nhanh, đặc biệt khi ghi/xóa trận trong lúc đang chơi.
- Bấm lưu/xóa phải phản hồi gần như ngay trên UI.
- Server là nơi lưu cuối cùng và đúng nhất.
- Hạn chế số lần gọi server.
- Hạn chế payload tải về từ server; chỉ tải phần thật sự đổi khi hợp lý.
- Không để F5/chuyển trang làm hiện dữ liệu cũ hoặc mất trận vừa ghi.
- Không over-engineer sync system.
- Bảo mật/auth không phải ưu tiên chính trong bài toán này, trừ khi ảnh hưởng
  trực tiếp đến consistency.
- Không cần tạo trang local test riêng vì vấn đề chính liên quan server thật/dev
  preview và cache thực tế.

Ưu tiên kỹ thuật:

- Correctness dữ liệu cao: match, stats, fines, season, history phải hội tụ về
  Postgres.
- Performance/UX cao: render từ local trước, sync sau.
- Maintainability cao: flow đơn giản, dễ debug.
- Ít payload: đặc biệt tránh tải full `matches` khi chỉ có 1 trận mới/xóa/sửa.

## 3. Data Stores

### Postgres

Các bảng/concept chính:

- `players`
  - Thành viên, active state, display name, hidden/pay fine flags, soft delete.
- `matches`
  - Lịch sử trận.
  - Các cột quan trọng: `id`, `date`, `win_1`, `win_2`, `lose_1`, `lose_2`,
    `win_score`, `lose_score`, `season`, `created_by`, `deleted_at`,
    `delete_group_id`, `client_request_id`.
  - `matches.id` và `matches.date` bắt buộc phải insert rõ ràng.
  - Hiện có unique index partial cho `client_request_id` khi khác null.
- `config`
  - Key-value app config.
  - Chứa `active_season`, `lose_money` legacy/global, và các data version keys.
- `seasons`
  - Season records.
  - Có `active`, `archived`, `lose_money`.
  - Có metadata ảnh Hall of Fame: `champion_image_url`,
    `champion_image_path`, `champion_image_updated_at`.
- `player_stats`
  - Stats incremental theo player/season: wins, losses, total, money.
  - Ghi trận/xóa/sửa trận phải giữ stats cân bằng.
- `player_season_settings`
  - Setting theo player/season: active, pay_fine, hidden.
- `audit_logs`
  - Log admin/action.
- `archives`
  - Lưu data archive khi soft delete player/season và restore từ archive.

Postgres là nguồn đúng cuối cùng cho tất cả dữ liệu user-visible.

### Vercel Blob

Vercel Blob dùng cho ảnh champion Hall of Fame:

- Ảnh thuộc về completed-season champion, không thuộc trực tiếp về player.
- Metadata ảnh lưu ở row `seasons`.
- Blob path/url được cache thêm trong IndexedDB store `hall_images`.

### IndexedDB

IndexedDB hiện dùng database:

- `PickleballDB`
- `DB_VERSION = 4`

Object stores trong `src/lib/db.ts`:

- `matches`
- `players`
- `seasons`
- `hall_images`
- `config`
- `sync_meta`
- `player_season_settings`

Vai trò từng store:

- `matches`: local copy của match history để Dashboard/Analysis/Admin render
  nhanh.
- `players`: local copy active/non-deleted players.
- `seasons`: local copy non-archived seasons.
- `config`: local copy key-value config.
- `player_season_settings`: local copy per-season player settings.
- `sync_meta`: metadata sync local, gồm `dataVersion`, `partVersions`,
  `lastManifestCheck`.
- `hall_images`: local blob cache cho ảnh Hall of Fame.

IndexedDB là replaceable cache. Nếu server/restore/import yêu cầu replace full
cache thì local data cũ không được quay lại.

### localStorage/sessionStorage

Các key chính:

- `pickleball_pending_match`
  - Queue pending match save để retry nếu server/network lỗi.
  - Không phải source of truth.
- `pickleball_recent_matches`
  - Helper duplicate check local trong 15 phút.
  - Không phải source of truth.
- `pickleball_client_id`
  - Anonymous device id để ghi `created_by`.
  - UX/attribution only.
- `pickleball_client_nickname`
  - Optional nickname cho `created_by`.
  - UX/attribution only.
- `pickleball_edit_unlocked`
  - Trạng thái unlock edit mode.
  - UX/auth-lite only.
- `pickleball_admin_auth_date`
  - Admin auth theo ngày.
  - UX/auth-lite only.
- `pickleball_admin_pending_match_edit`
  - Pending admin match edit local-first.
  - UX/retry only.
- `pickleball_ticker_closed`
  - sessionStorage state để ẩn ticker trên Dashboard.
  - UX only.
- Insight selection localStorage state
  - Dùng cho cooldown/pity/selection của insights.
  - Chỉ ảnh hưởng UI phân tích, không ảnh hưởng source-of-truth data.

## 4. Current Server Read Interfaces

### `getAppDataManifestAction()`

File: `src/app/actions.ts`.

Input:

- Không nhận input client.

Output:

- `globalVersion`
- `parts`
  - `matches`
  - `players`
  - `seasons`
  - `config`
  - `playerSeasonSettings`
  - `admin`
- `counts`
  - `matches`
  - `players`
  - `seasons`
  - `playerSeasonSettings`
- `checkedAt`

Data query:

- Gọi `getAppManifest()` trong `src/lib/data-version.ts`.
- `getAppManifest()` đọc part versions từ `config`.
- Query count:
  - `SELECT COUNT(*) FROM matches WHERE deleted_at IS NULL`
  - `SELECT COUNT(*) FROM players WHERE deleted_at IS NULL`
  - `SELECT COUNT(*) FROM seasons WHERE archived = false`
  - `SELECT COUNT(*) FROM player_season_settings`

Khi nào được gọi:

- Dashboard qua `useSharedAppData`.
- Admin qua `loadData`.
- Analysis có thể gọi qua `useSharedAppData` khi local-only nhưng cache rỗng
  hoặc cooldown hết.

Payload:

- Nhẹ về payload, nhưng query counts vẫn là DB work thêm.

Version/count metadata:

- Manifest hiện vừa trả version vừa trả counts.
- Client stale-check chủ yếu dựa trên `manifest.parts[part] >
  snapshot.partVersions[part]`.
- Counts dùng một phần để phát hiện local cache rỗng/missing.

Rủi ro:

- Nếu manifest action lỗi, hiện fallback trả version/count `0`. Client phải cẩn
  thận không ghi metadata `0` làm sai quyết định sync.
- Counts không đủ để phát hiện mọi lệch data nếu version metadata sai.

### `getAppDataPartsAction(parts)`

File: `src/app/actions.ts`.

Input:

- Optional array `parts`.
- Nếu input rỗng/invalid thì default lấy toàn bộ app parts trừ `admin`.

Output:

- Có thể gồm:
  - `players`
  - `matches`
  - `config`
  - `seasons`
  - `playerSeasonSettings`
- Kèm `manifest`, `dataVersion`, `partVersions`.

Data query:

- `players`: `SELECT * FROM players WHERE deleted_at IS NULL ORDER BY active DESC, name ASC`
- `matches`: `SELECT * FROM matches WHERE deleted_at IS NULL ORDER BY date DESC`
- `config`: `SELECT key, value FROM config`
- `seasons`: query non-archived seasons, gồm champion image metadata và
  `lose_money`
- `player_season_settings`: `SELECT * FROM player_season_settings`
- Sau khi query parts, gọi lại `getAppManifest()` để trả manifest/version mới.

Khi nào được gọi:

- Dashboard/Admin/Analysis fetch stale parts.
- ScoreForm khi server báo stale player data thì refresh players/config/seasons
  /playerSeasonSettings.
- Admin sau JSON restore/import fetch full core parts để seed cache.

Payload nặng:

- `matches` là phần có thể nặng nhất vì hiện fetch full visible match history
  khi part `matches` stale.
- Các part còn lại nhỏ hơn, đổi ít hơn.

Version/count metadata:

- Response trả `dataVersion` bằng `manifest.globalVersion`.
- Response trả full `partVersions`.

Rủi ro:

- Nếu chỉ 1 trận thay đổi nhưng `matches` stale, client tải full matches.
- Nếu local metadata được nâng trước khi apply data hoàn chỉnh, cache có thể tự
  coi là mới dù thiếu row.

### `getAppDataAction()`

File: `src/app/actions.ts`.

Input:

- Không input.

Output:

- Wrapper gọi `getAppDataPartsAction(['players', 'matches', 'config',
  'seasons', 'playerSeasonSettings'])`.

Khi nào được gọi:

- Legacy/helper path.
- Nên xem là full app data read.

Payload:

- Có thể nặng vì gồm full `matches`.

### `getMatchesAfterAction(lastId)`

File: `src/app/actions.ts`.

Input:

- `lastId`.

Output:

- Nếu không có `lastId`: trả all non-deleted matches order ASC.
- Nếu có `lastId`: tìm date của last match rồi trả matches có date lớn hơn.
- Nếu không tìm được last match: trả all non-deleted matches order ASC.

Khi nào được gọi:

- Tài liệu hiện nói action này còn hỗ trợ older admin/helper screens.
- Shared client routes hiện nên ưu tiên shared cache + explicit refresh path.

Payload:

- Có thể full nếu `lastId` rỗng hoặc không còn tồn tại.

Rủi ro:

- Dựa vào `date > lastMatch.date`, không xử lý delete/edit cũ.
- Không phải delta sync đầy đủ.

### Admin/system reads

`getAuditLogs()`

- Input: none.
- Query: `SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100`.
- Dùng trong Admin.
- Không đi qua IndexedDB shared cache.

`getArchives()`

- Input: none.
- Query: `SELECT * FROM archives ORDER BY deleted_at DESC LIMIT 50`.
- Dùng trong Admin.
- Không đi qua IndexedDB shared cache.

### API routes

`/api/setup`

- Tạo/upgrade schema.
- Seed default data như Season 1, guest player, config.
- Cần bảo vệ bằng secret trong production.
- Không phải read path bình thường.

`/api/migrate`

- Hỗ trợ migration/import XLSX.
- Có flow destructive replace matches từ sheet `MATCHES`.
- Auto-create missing players referenced by matches.
- Rebuild `player_stats`.
- Bump versions cho affected parts.
- Không nên chạy production nếu chưa xác nhận.

`/api/restore`

- POST JSON backup restore.
- Xóa data hiện tại theo thứ tự dependency rồi insert lại từ backup.
- Restore seasons/config/playerSeasonSettings nếu có.
- Synthesize seasons nếu backup cũ thiếu season records.
- Rebuild stats.
- Bump versions cho `matches`, `players`, `seasons`, `config`,
  `playerSeasonSettings`, `admin`.
- Revalidate `/`, `/admin`, `/analysis`.
- Sau restore, Admin client fetch full core parts và seed IndexedDB.

## 5. Current Server Write Interfaces

Ghi chú chung:

- Nhiều write action có `shouldBlockPreviewWrites()` để chặn preview nếu env
  không cho phép write.
- Nhiều action gọi `bumpDataVersions(parts)` hoặc `bumpMatchWriteVersions()`.
- Không phải action nào cũng trả canonical data hoặc patch đủ cho client update
  cache local.

### `addMatchAction(formData)`

File: `src/app/actions.ts`.

Input:

- `win_1`, `win_2`, `lose_1`, `lose_2`
- `win_score`, `lose_score`
- `season`
- `created_by`
- `duplicate_confirmed`
- `client_request_id` hoặc `temp_id`

Transaction:

- Có dùng `withTransaction()`.
- Dùng advisory lock theo `client_request_id` để idempotency replay.
- Dùng advisory lock theo duplicate team key.

Server behavior:

- Validate đủ 4 player slots.
- Ensure guest player fast nếu có guest.
- Validate players tồn tại và chưa deleted.
- Check duplicate trong 15 phút theo team-based key trong same season.
- Insert match với id dạng `M<timestamp>`.
- Apply incremental stats.
- Write audit log.
- Bump `data_version`, `version_global`, `version_matches`, `version_admin`
  qua `bumpMatchWriteVersions()`.
- Revalidate `/` và `/analysis`.

Output:

- Success mới: trả `success`, canonical `match`, `dataVersion`, partial
  `partVersions` gồm `matches` và `admin`.
- Duplicate conflict: trả `duplicateConflict`, `duplicateMatch`.
- Replay cùng `client_request_id`: trả `success` và match đã insert; hiện
  `dataVersion` có thể null trong transaction result trước khi ra response.
- Stale local data: trả `staleClientData`, `missingPlayerIds`.

IndexedDB local:

- ScoreForm tạo optimistic row `TMP-*`.
- Khi success có `match`, client gọi `replaceOptimisticMatchLocal(tempId,
  match, dataVersion, partVersions)`.

Rủi ro:

- Replay cùng request id cần được review kỹ: nếu trả canonical match nhưng không
  trả version hiện tại, client có thể replace row nhưng không cập nhật metadata.
- `Date.now()` làm version/id có thể đủ cho v1 nhưng cần review collision/order.
- Client/server duplicate behavior đã có, nhưng cần xem có quá nhiều state
  branch không.

### `deleteMatchAction(matchId)`

Input:

- `matchId`.

Transaction:

- Có dùng `withTransaction()`.
- Advisory lock theo `delete:${matchId}`.

Server behavior:

- Nếu match không tồn tại hoặc đã deleted: trả success, `dataVersion` null.
- Nếu tồn tại:
  - Load match.
  - Reverse stats/fines bằng `applyMatchStatsDelta(..., -1)`.
  - Soft delete: set `deleted_at = NOW()`, `delete_group_id`.
  - Write audit.
  - Bump match/admin versions.
  - Revalidate `/`, `/history`, `/analysis`.

Output:

- `success`, `deletedMatchId`, optional `dataVersion`, `partVersions`.

IndexedDB local:

- Dashboard xóa local trước bằng `removeMatchesLocal([matchId])`.
- Nếu server lỗi, restore row bằng `saveMatchesLocal([match])`.
- Nếu success, gọi lại `removeMatchesLocal([matchId], dataVersion,
  partVersions)`.

Rủi ro:

- Success với `dataVersion` null cho missing/already deleted không cập nhật local
  version.
- Response contract khác `addMatchAction`.

### `updateMatchAction(formData)`

Input:

- `id`, `win_1`, `win_2`, `lose_1`, `lose_2`, `win_score`, `lose_score`,
  `date`.

Transaction:

- Hiện không dùng `withTransaction()` cho toàn bộ reverse/update/apply/bump.

Server behavior:

- Load old match.
- Reverse old stats using multiple separate calls.
- Parse date.
- Update match row.
- Apply new stats.
- Audit.
- `bumpDataVersions(['matches', 'admin'])`.
- Revalidate `/` và `/analysis`.

Output:

- `{ success: true }` hoặc `{ error }`.
- Không trả canonical updated match.
- Không trả `partVersions`.

IndexedDB local:

- Admin inline edit apply local trước bằng `saveMatchesLocal([match])`.
- Sau server success, Admin gọi `loadData()` để sync.
- Nếu lỗi, restore previous match local.

Rủi ro:

- Vì không transaction hóa toàn bộ flow, có nguy cơ stats/match lệch nếu lỗi
  giữa chừng.
- Không trả canonical data khiến client phải reload/manifest path.
- Write response không thống nhất với add/delete.

### Player writes

`addPlayerAction(formData)`

- Insert player.
- Audit.
- Bump `players`, `admin`.
- Revalidate `/`.
- Trả success/error, không trả canonical player/partVersions.
- SettingsModal submit rồi `router.refresh()` gián tiếp.

`updatePlayerAction(formData)`

- Update name/active/pay_fine/hidden.
- Guest special-case.
- Bump `players`, `playerSeasonSettings`, `admin`.
- Revalidate.
- Không trả canonical cache patch.

`updatePlayersAction(formData)`

- Bulk update players.
- Bump `players`, `playerSeasonSettings`, `admin`.
- Không trả canonical cache patch.

`deletePlayerAction(formData)`

- Soft delete player.
- Archive player and related matches.
- Soft-delete related matches.
- Delete player_stats rows.
- Bump `players`, `matches`, `playerSeasonSettings`, `admin`.
- Cần review transaction coverage because multiple dependent writes happen.
- SettingsModal mostly refreshes route after success, not shared cache patch.

### Season/config writes

`deleteSeasonAction(formData)`

- Archive season and matches.
- Soft-delete season matches.
- Mark season archived.
- If active season deleted, clear config active season.
- Bump `seasons`, `matches`, `config`, `playerSeasonSettings`, `admin`.
- Cần review transaction coverage.

`createSeasonAction(formData)`

- End existing active season.
- Create new season and active config.
- Bump `seasons`, `config`, `admin`.

`setActiveSeasonAction(formData)`

- Set active season.
- Update config active season.
- Bump `seasons`, `config`, `admin`.

`updateFineAction(formData)`

- Update global/config fine or season-related fine path depending current code.
- Bump `config`, `seasons`, `admin`.

`updateSeasonFineAction(seasonId, loseMoney)`

- Update `seasons.lose_money`.
- Rebuild stats.
- Audit.
- Bump `seasons`, `config`, `admin`.
- Does not directly return updated season/versions to client.

`updatePlayerSeasonSettingsAction(playerId, season, active, pay_fine, hidden)`

- Upsert player-season setting.
- Rebuild stats.
- Audit.
- Bump `playerSeasonSettings`, `admin`.
- Revalidate `/`, `/analysis`.
- Potential issue: if settings affect visible leaderboard/stats, consultants
  should verify whether `players` or `matches` version also needs bump for
  current client derivation.

### Hall of Fame writes

`uploadChampionImageAction(formData)`

- Validate file/season.
- Upload processed image to Vercel Blob.
- Delete old blob path when replacing.
- Store image URL/path/update timestamp on `seasons`.
- Audit.
- Bump `seasons`, `admin`.
- Revalidate `/`, `/analysis`.
- Client image cache in `hall_images` depends on season image path/update time.

`deleteChampionImageAction(formData)`

- Delete blob when path available.
- Clear image metadata on season.
- Audit.
- Bump `seasons`, `admin`.
- Revalidate `/`, `/analysis`.

Rủi ro:

- Client cache invalidation for `hall_images` depends on seasons metadata being
  refreshed correctly.

### Rebuild/import/restore

`rebuildStatsAction()`

- Rebuild `player_stats` from matches.
- Bump broad affected versions in current implementation path.
- Used after restore/import or admin repair.

JSON restore flow:

- API route `/api/restore` replaces database contents from backup.
- Rebuild stats and bump all relevant parts.
- Admin client then fetches core app parts and `seedAppCache()` full.
- This is the correct general shape for destructive/bulk operation: do not use
  incremental patch; replace full cache after restore.

XLSX import flow:

- `/api/migrate` POST can replace match history from sheet.
- Auto-create missing players.
- Rebuild stats.
- Bump relevant versions.

## 6. Current Versioning And Cache Metadata

### Server config version keys

Defined mostly in `src/lib/data-version.ts` and partly duplicated by
`bumpMatchWriteVersions()` in `src/app/actions.ts`.

Keys:

- `data_version`
  - Legacy/global version key.
- `version_global`
  - Global version key.
- `version_matches`
  - Version for `matches`.
- `version_players`
  - Version for `players`.
- `version_seasons`
  - Version for `seasons`.
- `version_config`
  - Version for `config`.
- `version_player_season_settings`
  - Version for `playerSeasonSettings`.
- `version_admin`
  - Version for admin/system data.

`bumpDataVersions(parts)` behavior:

- Ensures `config` table.
- Uses `Date.now()` as next version.
- Updates `data_version`, `version_global`, and selected part version keys.

`bumpMatchWriteVersions()` behavior:

- Specialized hot path for match add/delete.
- Updates `data_version`, `version_global`, `version_matches`, `version_admin`.

### IndexedDB `sync_meta`

Stored by `src/lib/db.ts`:

- `dataVersion`
  - Local global-ish version.
- `partVersions`
  - Local part version map.
- `lastManifestCheck`
  - Timestamp of last manifest check.

Relevant cache helpers:

- `seedAppCache(input)`
  - Replaces provided stores and writes metadata.
  - If `partVersions` missing but `dataVersion` present, it normalizes all part
    versions to that dataVersion.
- `replaceAppCacheParts(input, meta)`
  - Wrapper around `seedAppCache`.
- `replaceOptimisticMatchLocal(tempId, match, dataVersion, partVersions)`
  - Deletes optimistic temp row, puts canonical match, optionally updates
    metadata.
- `removeMatchesLocal(matchIds, dataVersion, partVersions)`
  - Deletes local matches, optionally updates metadata.
- `getAppCacheSnapshot()`
  - Reads stores and metadata.

### Current stale-check logic

In `src/lib/use-shared-app-data.ts`:

- Local snapshot read first.
- Manifest fetched depending route policy.
- `stalePartsFromManifest()` marks part stale when:
  - `manifest.parts[part] > snapshot.partVersions[part]`
  - plus some cache-empty/count checks.
- If stale parts exist: fetch via `getAppDataPartsAction(staleParts)`.
- Else: seed only metadata with manifest versions/check time.

In Admin:

- `getStaleParts()` has similar but not identical logic.

### Known versioning risks

- There are overlapping concepts: `dataVersion`, `version_global`, and
  per-part versions.
- If local `dataVersion` is used as fallback for all missing part versions,
  local metadata can imply parts are fresh even when not all stores were really
  updated.
- If metadata is elevated before data writes complete, cache can become stale
  but claim to be fresh.
- Manifest fallback `0` on server/read error can hide real error and create bad
  local decisions if saved.
- `matches` currently fetches full visible match list when stale; this is the
  main payload inefficiency.

## 7. Page-by-Page Data Flow

### Dashboard `/`

Files:

- `src/components/Dashboard.tsx`
- `src/lib/use-shared-app-data.ts`
- `src/components/ScoreForm.tsx`
- `src/components/dashboard/RecentHistory.tsx`

Mount/read flow:

1. Dashboard is intended as static/client shell with empty or minimal initial
   server props.
2. Dashboard calls `useSharedAppData({ routeKey: 'dashboard',
   syncOnMount: 'always' })`.
3. Hook reads IndexedDB via `getAppCacheSnapshot()`.
4. Dashboard renders local snapshot immediately if cache exists.
5. Hook checks manifest via `getAppDataManifestAction()`.
6. Hook calculates stale parts.
7. If stale parts exist, hook calls `getAppDataPartsAction(staleParts)`.
8. Hook writes returned parts into IndexedDB via `replaceAppCacheParts()`.
9. Hook updates React state from new local snapshot.

Dashboard local state:

- Dashboard also maintains local `matches` state separate from sharedData.
- When sharedData matches changes, it syncs into local state but tries not to
  wipe optimistic `TMP-*` rows if an older cache has fewer rows.

ScoreForm write flow:

- User selects 4 players and score.
- Client creates optimistic `TMP-*` match.
- Calls `onAddMatch()` to put row into Dashboard state.
- Calls `saveMatchesLocal([optimisticMatch])` to IndexedDB.
- Saves pending form into localStorage.
- Calls `addMatchAction()`.
- On success, replaces temp row via `onConfirmMatch()` and
  `replaceOptimisticMatchLocal()`.
- On error, marks temp row error and leaves pending retry.

Delete flow:

- `RecentHistory` calls `onDeleteMatch`.
- Dashboard `deleteLocalMatch()` removes local row immediately and calls
  `removeMatchesLocal([matchId])`.
- Then calls `deleteMatchAction(matchId)`.
- On server error, re-inserts previous row locally.
- On server success, removes again with returned metadata.

Analysis link:

- `openAnalysisFromLocalCache()` seeds current Dashboard in-memory snapshot into
  IndexedDB before navigating to `/analysis`.
- This is meant to make Analysis open instantly without server wait.

Risks:

- Dashboard has both sharedData and local matches state; consultants should
  review state ownership.
- SettingsModal writes may refresh route but not necessarily patch this shared
  local cache immediately.
- Current manifest path fetches full `matches` when stale.

### Analysis `/analysis`

Files:

- `src/app/analysis/page.tsx`
- `src/components/analysis/AnalysisCenter.tsx`
- `src/lib/use-shared-app-data.ts`
- `src/lib/analysis-core.ts`
- `src/lib/insights.ts`

Flow:

1. `/analysis` is a static local-cache shell.
2. Page renders `AnalysisCenter` with `localOnly`.
3. `AnalysisCenter` calls `useSharedAppData()` with:
   - `localOnly: true`
   - `fetchIfEmpty: true`
   - `syncOnMount: 'throttled'`
4. If IndexedDB has usable cache, Analysis renders from local cache.
5. If local cache is empty, hook is allowed to fetch full app parts once.
6. If cache exists, Analysis generally avoids server calls unless throttled
   manifest check is due.
7. Analysis derives all ELO/stats/insights client-side from cached matches,
   players, seasons, config, playerSeasonSettings.

Risks:

- Analysis intentionally trusts local cache more than Dashboard.
- If Dashboard/local cache is stale or metadata says fresh incorrectly,
  Analysis can show stale facts.
- If cache empty, first direct entry can fetch full app data.

### Admin `/admin`

Files:

- `src/app/admin/page.tsx`
- `src/app/actions.ts`

Auth:

- Uses `pickleball_admin_auth_date` in localStorage.
- This is lightweight UX auth, not the focus of this sync review.

Read flow:

1. Admin loads audit logs and archives from server actions.
2. Admin reads IndexedDB snapshot first.
3. Admin calls `getAppDataManifestAction()`.
4. Admin calculates stale parts with local helper `getStaleParts()`.
5. If stale, calls `getAppDataPartsAction(staleParts)`.
6. Writes parts to IndexedDB via `replaceAppCacheParts()`.
7. Applies snapshot to Admin state.

Inline match edit:

1. User edits match row.
2. Admin creates pending edit and stores in `pickleball_admin_pending_match_edit`.
3. Admin applies next match locally with `saveMatchesLocal([match])`.
4. Calls `updateMatchAction(fd)`.
5. On success, clears pending edit and calls `loadData()`.
6. On error, restores previous local match.

JSON restore:

1. User selects JSON backup.
2. Admin POSTs to `/api/restore`.
3. On success, Admin calls `rebuildStatsAction()`.
4. Admin fetches full core parts via `getAppDataPartsAction(CORE_PARTS)`.
5. Admin calls `seedAppCache()` with full data.
6. Admin calls `loadData()`.

Risks:

- Admin has a second stale-check implementation separate from
  `useSharedAppData`.
- Inline edit local-first is useful for UX but `updateMatchAction` response does
  not include canonical match/version.
- Restore flow has the right idea: full replace cache after destructive restore.

### SettingsModal

File:

- `src/components/SettingsModal.tsx`

Responsibilities:

- Add/update/delete players.
- Create/delete/activate seasons.
- Update fine values.
- Upload/delete Hall of Fame champion image.

Current flow shape:

- Many forms call server actions directly.
- On success, many paths call `router.refresh()` or rely on indirect reload.
- They do not all apply shared IndexedDB cache patch consistently.

Risks:

- Dashboard/Analysis/Admin can keep old cached players/seasons/config until next
  manifest/sync.
- For user-facing settings changes, lack of standardized write response can
  leave pages temporarily inconsistent.
- Settings changes can affect stats/visibility; agents should review affected
  part versions.

### Hall of Fame image flow

Files:

- `src/components/SettingsModal.tsx`
- `src/app/actions.ts`
- `src/lib/db.ts`
- `src/lib/hall-of-fame.ts`

Flow:

1. Settings derives completed-season champions.
2. Browser validates and processes image.
3. `uploadChampionImageAction` uploads to Vercel Blob.
4. Server stores image URL/path/update timestamp on `seasons`.
5. Delete action removes Blob and clears metadata.
6. Server bumps `seasons` and `admin`.
7. Client caches actual image blob in IndexedDB store `hall_images`.
8. Cache key/validity depends on season plus image path/update timestamp.

Risk:

- If `seasons` metadata is stale locally, Hall image cache can serve old image or
  miss new image.

## 8. Critical Match Save Flow Current State

Implementation files:

- `src/components/ScoreForm.tsx`
- `src/app/actions.ts`
- `src/lib/db.ts`
- `src/components/Dashboard.tsx`

Client steps:

1. User selects players and score.
2. ScoreForm requires all 4 slots:
   - `win_1`
   - `win_2`
   - `lose_1`
   - `lose_2`
3. Client checks local duplicate risk in `pickleball_recent_matches`.
4. Duplicate local key is team-based:
   - `season::sort(win_1,win_2)>sort(lose_1,lose_2)`
5. If duplicate local detected, user must confirm.
6. Client creates `client_request_id`.
7. Client creates optimistic id `TMP-${client_request_id}`.
8. Client inserts optimistic match into Dashboard state.
9. Client writes optimistic match into IndexedDB `matches`.
10. Client stores pending form data in `pickleball_pending_match`.
11. Client calls `addMatchAction(formData)`.

Server steps:

1. Reject if preview writes blocked.
2. Read form fields.
3. Validate 4 player slots.
4. Ensure guest player if needed.
5. Validate selected players still exist and are not deleted.
6. Build current win/lose team keys.
7. Load season fine.
8. Open transaction.
9. If `client_request_id` exists:
   - advisory lock `request:${client_request_id}`
   - query existing match by `client_request_id`
   - if found, return existing match.
10. Advisory lock duplicate key.
11. Query recent matches in same season within 15 minutes.
12. If duplicate found and not confirmed, return duplicate conflict.
13. Insert row into `matches`.
14. Apply stats delta.
15. Write audit log.
16. Bump match/admin versions.
17. Commit.
18. Revalidate `/` and `/analysis`.
19. Return canonical match and versions.

Client success:

1. Clear pending save by request id.
2. Replace optimistic `TMP-*` row with canonical server row in Dashboard state.
3. Replace optimistic row with canonical row in IndexedDB.
4. Save recent duplicate helper entry.
5. Show saved state.

Client duplicate conflict:

1. Remove optimistic row.
2. Prompt user if they want to save duplicate anyway.
3. If yes, retry same form with `duplicate_confirmed=true`.
4. If no, clear pending.

Client error:

1. Mark optimistic row as pending/error in Dashboard state.
2. Save error row in IndexedDB.
3. Keep pending form data for retry.
4. If server says stale player data, fetch small parts:
   - `players`
   - `config`
   - `seasons`
   - `playerSeasonSettings`

Pending retry:

- On mount, ScoreForm reads `pickleball_pending_match`.
- Pending saves younger than 60 minutes are retried.
- Retry uses same request id if present.

Questions consultants should evaluate:

- Should replay by `client_request_id` always return current `partVersions`?
- Can pending retry elevate local metadata incorrectly?
- Is duplicate logic split between local confirm/server confirm too complex?
- Should `addMatchAction` return a standardized mutation result type shared
  with delete/edit?
- Should `matches.id` generation remain timestamp-based or use a stronger server
  id generator?

## 9. Critical Delete/Edit Flow Current State

### Delete match

Files:

- `src/components/Dashboard.tsx`
- `src/components/dashboard/RecentHistory.tsx`
- `src/app/actions.ts`
- `src/lib/db.ts`

Flow:

1. User clicks delete in recent/full history while edit mode is enabled.
2. Dashboard finds current match locally.
3. Dashboard removes match from React state.
4. Dashboard removes match from IndexedDB.
5. Dashboard calls `deleteMatchAction(matchId)`.
6. Server transaction:
   - lock match id
   - load match
   - reverse stats/fines
   - set `deleted_at`
   - audit
   - bump match/admin versions
7. If server error:
   - Dashboard restores previous match into state.
   - Dashboard writes previous match back to IndexedDB.
8. If success:
   - Dashboard confirms removal with returned metadata.

Risk:

- Delete response shape differs from add.
- Missing/already-deleted success can return no version.
- If local delete succeeds but server metadata not applied, later sync behavior
  depends on manifest correctness.

### Edit match admin

Files:

- `src/app/admin/page.tsx`
- `src/app/actions.ts`
- `src/lib/db.ts`

Flow:

1. Admin edits match fields.
2. Admin creates `previousMatch` and `nextMatch`.
3. Admin writes pending edit to localStorage.
4. Admin applies `nextMatch` locally via `saveMatchesLocal`.
5. Admin calls `updateMatchAction`.
6. Server loads old match, reverses stats, updates row, applies stats, audits,
   bumps version.
7. On success, Admin clears pending edit and calls `loadData()`.
8. On failure, Admin restores `previousMatch`.

Risks:

- `updateMatchAction` is not wrapped in a single transaction currently.
- It does not return canonical match or version metadata.
- Admin must reload data to converge.
- If an error happens after reverse stats but before apply new stats, stats can
  become inconsistent.

### Cross-page cache consistency risk

Dashboard, Admin, Analysis, and Settings do not all apply write results into the
shared cache the same way:

- Dashboard add/delete match applies local/canonical cache directly.
- Admin edit applies local then reloads.
- Settings writes often rely on route refresh/manifest later.
- Restore/import does full seed cache, which is safer for bulk replacement.

Consultants should propose a simple unified policy.

## 10. Known Problems To Solve

Reported current dev problems:

- Có lúc không ghi được trận.
- Có lúc ghi xong không đồng bộ được với server.
- Local/server lệch pha.
- F5 hoặc chuyển trang có thể thấy data cũ.
- Analysis có thể đọc cache local không đúng server.

Suspected technical causes from current code:

- Version metadata chưa được coi như contract cứng.
- `dataVersion`, `version_global`, and `partVersions` overlap and can confuse
  sync decisions.
- Full/partial refresh policy chưa rõ đủ cho every write path.
- Write response không thống nhất giữa add/delete/edit/player/season/settings.
- Dashboard/Admin/Settings cập nhật IndexedDB không đồng nhất.
- `matches` là payload lớn nhưng chưa có real delta sync for edit/delete/new
  from other devices.
- Manifest fallback `0` on error can mask real server/read failure.
- Admin match edit lacks full transaction.
- Some Vietnamese strings in source currently show mojibake, which can make
  debug/user-facing errors harder to understand.

Important non-negotiable constraints:

- Postgres remains source of truth.
- Do not remove local-first pending behavior unless replaced by equally safe
  flow.
- Match save must remain idempotent using `client_request_id` or equivalent.
- New matches must use active season.
- Match entry requires all 4 players.
- Duplicate guard must remain team-based and confirmable.
- Delete should remain recoverable/soft-delete for user-visible data.
- Admin JSON restore must not let old IndexedDB seasons/matches reappear.

## 11. Optimization Goal For Consultants

Please propose an architecture/implementation plan that optimizes:

- Few server calls.
- Small payloads.
- Fast local UI.
- Correct convergence to server.
- Simple mental model.
- Easy debugging.

Preferred direction:

- Local-first writes with canonical server response.
- Manifest/check request should be lightweight.
- Avoid full `matches` download on every small match change if practical.
- Part nhỏ như players/seasons/config may be full-fetched when stale if that
  keeps system simpler.
- Bulk restore/import can replace full cache once.
- Avoid event-log table or multi-layer sync system unless clearly necessary.

Priority ranking:

1. Data correctness.
2. User-perceived speed for save/delete/F5.
3. Low payload/server calls.
4. Maintainability.
5. Security/auth hardening only if required for consistency.

## 12. Open Design Questions For Other Agents

Please answer these directly in any consulting response:

- Có nên bỏ `globalVersion` khỏi client sync và chỉ dùng per-part versions không?
- Có nên thêm `matches.updated_at` + cursor delta không?
- Có nên giữ manifest 1 request rồi data request thứ 2 khi stale không?
- Có nên để part nhỏ fetch full, chỉ `matches` delta không?
- Write response nên chuẩn hóa ra type nào?
- Cách đơn giản nhất để tránh local metadata “nói đã mới” nhưng thiếu row là gì?
- Cách xử lý restore/import thế nào để chắc chắn IndexedDB cũ không làm data cũ
  quay lại?
- Có cần transaction hóa thêm write action nào?
- Có nên unify Dashboard/Admin stale-check logic vào cùng helper/hook không?
- Có nên update cache trực tiếp sau SettingsModal writes, hay chỉ rely on
  manifest refresh?
- Có cần giữ `getMatchesAfterAction(lastId)` không nếu có delta sync mới?
- Nên xử lý manifest server error ra sao để không phá local cache metadata?

## 13. Suggested Output Expected From Consulting Agents

Một consulting response hữu ích nên gồm:

- Proposed sync architecture.
- Schema changes tối thiểu, nếu có.
- Server actions cần thêm/sửa.
- IndexedDB/cache utilities cần thêm/sửa.
- Page-by-page flow sau khi sửa:
  - Dashboard
  - Analysis
  - Admin
  - SettingsModal
  - restore/import
- Mutation result contract đề xuất.
- Migration/rollout plan cho dev preview trước.
- Test plan trên dev preview/server thật.
- Failure-mode handling:
  - server manifest lỗi
  - write lỗi
  - pending retry
  - duplicate retry
  - restore/import
  - cache metadata mismatch

Không cần tư vấn auth/security nâng cao trừ khi ảnh hưởng trực tiếp tới data
consistency.

## 14. Current Code Path Quick Reference

Core server actions:

- `src/app/actions.ts`
  - `addMatchAction`
  - `deleteMatchAction`
  - `updateMatchAction`
  - `getAppDataManifestAction`
  - `getAppDataPartsAction`
  - `getMatchesAfterAction`
  - player/season/config/Hall of Fame actions

Cache/version:

- `src/lib/db.ts`
  - IndexedDB stores and cache helpers.
- `src/lib/use-shared-app-data.ts`
  - Shared Dashboard/Analysis sync hook.
- `src/lib/data-version.ts`
  - Server part version helpers.

Pages/components:

- `src/components/Dashboard.tsx`
  - Main user-facing page, shared cache, optimistic matches, delete match.
- `src/components/ScoreForm.tsx`
  - Local-first match save, pending retry, duplicate handling.
- `src/components/dashboard/RecentHistory.tsx`
  - Recent/full history UI and delete trigger.
- `src/components/analysis/AnalysisCenter.tsx`
  - Local cache analysis consumer.
- `src/app/analysis/page.tsx`
  - Static analysis route shell.
- `src/app/admin/page.tsx`
  - Admin data load, inline match edit, JSON restore.
- `src/components/SettingsModal.tsx`
  - Player/season/fine/Hall of Fame settings writes.

Bulk/data routes:

- `src/app/api/migrate/route.ts`
  - XLSX migration/import.
- `src/app/api/restore/route.ts`
  - JSON restore.

Docs:

- `docs/DATA_FLOW.md`
  - Existing intended data-flow documentation.
- `PROJECT_CONTEXT.md`
  - Current project assumptions and production/dev notes.
- `README.md`
  - Repo overview and verification notes.

## 15. Notes For Reviewers

- Do not assume local cache is trusted. It is only a performance layer.
- Do not assume all server actions currently have consistent transaction or
  response behavior.
- The likely biggest optimization win is avoiding full `matches` refetch when a
  small match change occurs.
- The likely biggest correctness win is making mutation response + local
  metadata update a strict contract.
- Keep the solution smaller than a full offline-first replication engine unless
  there is a concrete reason.
