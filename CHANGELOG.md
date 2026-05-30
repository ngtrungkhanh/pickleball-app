# Changelog

This is a compact project history. Keep detailed chat transcripts out of the
repo.

## Current Production Snapshot

- Production domain: `https://conchimnon.vercel.app/`
- Latest released feature commit verified from Vercel/GitHub: `d7d3eba`
- Commit message: `fix: prevent summary card clipping`
- Latest pushed `dev` commit for preview validation: `4c01527`
- Dev commit message: `Refine analysis hub and restore flows`

## Major Completed Work

### Bug Fixes

- Fixed `boss_hunter` ("Thợ săn trùm" / "Đối thủ khó chịu của nhà vua") insight trigger: excluded the ELO King from triggering this rule against themselves, and ensured it only counts actual wins *against* the ELO King (excluding matches where the player and ELO King were on the same team).

### Analysis Hub, Restore, and Radar Calibration

- Fixed Dashboard Sports Ticker animation so it does not restart from the first
  item after routine insight/cache re-renders.
- Tightened `/analysis` Hub ELO layout, expanded the weekly ELO block, and
  moved the ELO explainer below the Hub grid so expanded help content uses full
  page width and natural scrolling.
- Updated JSON backup/restore handling so restored seasons replace the current
  dataset from the backup file and the shared IndexedDB route cache is refreshed
  after restore.
- Recalibrated Analysis Attack/Defense radar scoring with a hybrid raw +
  relative model so scores spread more naturally across the current group and
  season snapshot.
- Updated weekly ELO activity decay to apply only above `1500` ELO and fewer
  than 8 matches in the week.
- Aligned `most_improved` and `free_fall` insight deltas with the weekly ELO
  performance board, and adjusted copy to say "this week" instead of implying
  a 10-match window.
- Tightened `unlucky_draw` so it needs at least 10 partner matches, excludes
  players currently in the bottom 2, and requires at least 51% of partner
  matches with bottom-2 teammates across the selected season/snapshot.
- Synced handoff docs around the implemented 86-scenario insight registry and
  the 1500 ELO starting rating.

### Sports Ticker & Flash News Cards

- Sửa lỗi giật/reset chuyển động chạy của Sports Ticker (Tin Nhanh) sau mỗi chu kỳ (khoảng hơn 1 phút). Tự động nhân bản các tin tức để đảm bảo độ dài vượt quá chiều rộng màn hình (kể cả trên màn hình lớn/4K), đo đạc chính xác chiều rộng một chu kỳ lặp mà không gây lag trình duyệt (layout thrashing), và thực hiện dịch chuyển lặp vô hạn mượt mà, không có khe hở hay giật hình khi kết thúc một vòng chạy.
- Tích hợp thanh chạy tin tức thể thao chạy ngang (**Sports Ticker** / Marquee) trên Dashboard trang Home để hiển thị nhanh các nhận xét Insights của giải đấu.
  - Ticker hỗ trợ tự động tạm dừng khi rê chuột (hover pause) để dễ đọc các tin dài.
  - Tích hợp nút đóng `(X)` lưu trạng thái ẩn vào `sessionStorage` của trình duyệt để không làm phiền người dùng.
  - Chiều rộng ticker đồng bộ 85% trên PC và tự động co giãn full width 100% trên Mobile để đảm bảo thẩm mỹ tối đa.
- Nâng cấp nhận xét thành các thẻ tin nhanh thể thao (**Flash News Cards**) tại khu vực Tổng quan của Trung tâm phân tích (`/analysis`).
  - Đọc cấp độ độ hiếm `rarity` của từng tin tức (`common`, `uncommon`, `rare`, `epic`) để hiển thị nhãn độ hiếm tương ứng (TIN THƯỜNG, TIN MỚI, ĐẶC BIỆT, KINH ĐIỂN).
  - Tự động thay đổi giao diện thẻ, đổi màu sắc viền/nền và thêm các hiệu ứng gradient động/phát sáng mờ phù hợp với từng cấp độ độ hiếm của tin.
- Rà soát an toàn dữ liệu thưa thớt (Sparse Data) cho engine 86 quy tắc phân tích và cơ chế lưu trữ IndexedDB cache, đảm bảo hệ thống không bị crash hay trắng trang khi dữ liệu rỗng.

### Hall of Fame Champion Images

- Reworked the Analysis `Vinh danh` zone into an equal champion gallery with
  row-level inline detail panels.
- Tightened the Analysis header into a compact toolbar and refined Hall cards
  into horizontal portrait/detail layouts: 2 columns on Full HD, 3 columns only
  on very wide desktop.
- Added Settings `Vinh danh` controls to upload/delete a 3:4 champion image per
  completed season champion.
- Added Vercel Blob image storage wiring and season metadata fields for
  champion image URL/path/update time.
- Added IndexedDB local champion-image caching so unchanged Hall of Fame images
  do not need to be fetched again after the first load.

### Next.js Migration

- Migrated from legacy Google Apps Script + Sheets toward Next.js + Vercel
  Postgres.
- Added database setup and migration helpers.
- Kept `legacy/` as reference material for behavior and layout decisions.

### Dashboard

- Built dark ranking dashboard with summary, leaderboard, score form, recent
  history, full history, and analysis entry points.
- Added season filtering and active-season support.
- Added read-only default mode with edit unlock through Settings.

### Performance

- Shifted toward static/ISR-style reads to reduce Vercel/Postgres compute.
- Dashboard preloads a bounded match history because expected match volume is
  only a few hundred records.
- Writes use server actions and refresh/revalidate after database updates.

### Score Entry

- Added optimistic/local-first score entry.
- Added local backup/pending behavior for flaky network protection.
- Added client-side and server-side duplicate checks.
- Added smart score defaults based on recent match scores.

### Admin

- Added Settings modal with access, member, season, and fine settings.
- Added inline member rename.
- Added inline match editing in admin history.
- Added incremental stat-balance logic when editing matches.

### Analysis

- Added `/analysis` read-only analysis center with overview, player, partner,
  opponent, trend placeholder, and history views.
- Documented the current analysis center in detail for handoff: server preload,
  IndexedDB sync, read-only tabs, client-side ELO, matrix limitations, trend
  placeholder, and recommended next analysis work.

### Cleanup

- Consolidated root documentation into `README.md`, `PROJECT_CONTEXT.md`, and
  `CHANGELOG.md`.
- Removed old chat logs, duplicate handoff prompts, and temporary scratch files.

### Documentation Audit

- Rebuilt documentation around the current production Next.js app instead of the
  old `legacy/` Apps Script implementation.
- Added tiered docs:
  - `docs/FEATURE_SPEC.md`
  - `docs/DATA_FLOW.md`
  - `docs/UI_RULES.md`
- Consolidated insight docs into `docs/ANALYSIS_INSIGHTS_RULES.md` and
  `docs/ANALYSIS_INSIGHTS_SELECTION.md` so future agents have one rule source
  and one selection/audit source.
- Updated `AI_HANDOFF_PROMPT.md` so future AI sessions read only the required
  docs first and then open deeper docs by task type.

### Preview Safety

- Previously confirmed Vercel Preview and Production were using the same
  Postgres env before the dev database split.
- Added a Preview write guard so dev/preview cannot add, edit, delete, migrate,
  rebuild stats, or run setup writes unless `ALLOW_PREVIEW_WRITES=true` is set.
- Dashboard hides write controls on Preview and shows a warning while writes are
  blocked.

### Dev Database Split

- Created a separate dev database for Vercel Preview branch `dev`.
- Added Vercel branch env overrides so branch `dev` can use the dev database
  while Production remains on the Production database.
- Documented the dev preview URL:
  `https://pickleball-app-git-dev-ngtrungkhanhs-projects.vercel.app/`
- Kept the Preview write guard as a safety switch; only branch `dev` should have
  `ALLOW_PREVIEW_WRITES=true`.

### Duplicate Match Flow Hardening

- Changed duplicate key from sorted 4-player set to team-based key:
  `sort(win_1,win_2) > sort(lose_1,lose_2)`.
- Score entry now requires full 4-player selection.
- Local duplicate detection shows a confirm dialog instead of blocking forever.
- Server re-checks duplicates in 15 minutes and only allows duplicate insert
  when client sends `duplicate_confirmed=true`.
- Client now handles server duplicate skip by syncing view state back from
  server.

### Admin XLSX Import

- Added `Import XLSX` button on `/admin` to upload local `.xlsx` files.
- Added `POST /api/migrate` flow to replace all match history from sheet
  `MATCHES`.
- Import now auto-creates missing `players` IDs referenced by match rows before
  inserting matches to avoid foreign key failures.
- Rebuilds `player_stats` after import based on current match data and fine
  config.
- Reduced hidden file input INP cost by deferring heavy import logic out of the
  input change event.

### Dashboard UI Refresh

- Compact dashboard summary cards while keeping fine amounts in full grouped
  numeric format such as `35.000`.
- Brightened the main dashboard surfaces, borders, and hover states for better
  contrast on dark backgrounds.
- Kept the leaderboard season selector as a two-line header and kept the desktop
  table header sticky inside a bounded scroll area.
- Reworked expanded leaderboard detail into four compact blocks, adding `Kèo dễ`
  / `Khắc chế cứng` from easiest-rival stats.
- Rebalanced score entry into winner, score, and loser columns on desktop while
  keeping mobile tap targets large.
- Added a custom score-entry player picker with large touch targets, team-toned
  active states, and `Khach` separated at the end of the list.
- Removed nested leaderboard scrolling for the normal small member list.
- Expanded detail cards now use compact four-line content, short metrics, fun
  remarks, and form trend comparison against the previous 5 matches.
- Fixed the desktop score-entry player picker so its dropdown can extend outside
  the score card instead of being clipped by the card container.

### Analysis Center Rebuild (Phase 1)

- Rebuilt `/analysis` with a 4-zone mobile-first Bottom Navigation instead of 6 top tabs.
- Implemented "Tổng quan" hub with Bento Grid layout featuring ELO leaders, hot streaks, top fine payers, and automated insights.
- Implemented "Cá nhân" profile zone with hero stats, win rates, and best partner/nemesis cards.
- Refactored "Đối đầu" matrix from tables to card-based list view for better mobile usability.
- Added automated data-driven insights in `src/lib/analytics.ts` (getInsights).
- Improved "Lịch sử" log with tag-based match highlights (Close Win, Dominant, etc.).

### Text Encoding Cleanup

- Cleaned up mojibake in Vietnamese admin/dashboard/action messages so UI and
  server-action errors render readable UTF-8 text.

### Dashboard Score Entry Tuning

- Narrowed the desktop score-entry panel to about 85% of the dashboard width.
- Aligned desktop dashboard controls, summary, leaderboard, score entry, and
  recent history to the same compact content width while keeping mobile full
  width.
- Removed search from the score-entry player picker for the small member list.
- Made the score box larger and taller while keeping player-name fields more
  compact.
- Increased the leaderboard Season title size.
- Changed the summary fine total to compact notation such as `490k` to avoid
  desktop card label clipping.
- Changed `Tuần này` summary logic to count the Monday-Sunday week in Vietnam
  time instead of depending on server-local week boundaries.

### Form Insight Refresh

- Rebuilt expanded leaderboard form text so the main form line uses all 32
  latest-first W/L patterns correctly.
- Replaced the old simple trend line with seeded data-driven comments using
  streaks, last-3 momentum, score drama, score differential, volatility,
  previous-5 comparison, partner stability, opponent difficulty, fine pressure,
  and recent activity.
- Reweighted partner, difficult-rival, and easy-rival selection with sample
  confidence, recent results, score differential, and close-game context instead
  of sorting by raw win/loss rate alone.
- Simplified partner/rival/easy labels so they read as direct status text, not
  hidden-context slang.

### Detail Insights Vocabulary Overhaul

- Revamped "Dòng 2" descriptive labels in expanded leaderboard details to use more
  consistent, easy-to-read Vietnamese sports terminology (e.g., "Cặp ruột" -> "Cặp bài trùng",
  "Thiên địch" -> "Kị rơ", "Thua cách biệt" -> "Khắc chế cứng").
- Significantly expanded variation arrays for footer notes across all four panels (Form, Partner, Tough Rival, Easy Rival) by adding 100+ new string variations to further reduce visible text repetition.
### Analysis Center UI Refinements (Phase 2)

- Removed redundant "Lịch sử" (History) tab to focus on deep analytics (history is already managed on the main dashboard).
- Synchronized component heights in Hub and Profile zones for better visual balance on Desktop/2K screens.
- Enlarged Radar Chart on Desktop for improved readability.
- Added current ELO ratings directly into the Hub leaderboard list.
- Compressed vertical whitespace in ELO and Insight lists.
- Fixed layout shifting in "Form gần đây" cards by standardizing heights and flex behavior.

### Analysis Center Algorithms & UX (Phase 3)

- Implemented "Delta Hiệu Suất" algorithm to measure Synergy (Impact) between players using ELO-based expected win probabilities (Chronological Match-by-Match tracking).
- Replaced basic radar stats with "Bản lĩnh" (Clutch performance over expected ELO) and "Nhiệt huyết" (Activity in the last 7 days). Radar chart now dynamically supports 6 metrics.
- Upgraded the Matrix UI with color-coded Impact pills ("Hợp cạ" / "Kỵ cạ") and a 3-layer floating tooltip (Emotion - Insight - Data).
- Resolved Tooltip UI flickering using absolute positioning with `pointer-events-none` over expanded hitboxes.
- Expanded the Hub Insights engine to 15 unique logic triggers (Hot streak, Rivalry, Clutch King, Carry God, Anchor, etc.) with over 100 randomized text variations to prevent stale content.

### Admin Tools

- Added full database JSON Restore (`POST /api/restore`) to complement existing JSON Backup functionality, preventing data loss.

### Analysis Core and Insight Rewrite

- Added `src/lib/analysis-core.ts` as the shared calculation core for
  `/analysis`, covering ELO, player metrics, radar inputs, partner impact
  edges, opponent impact edges, and profile-ready data.
- Rewrote `src/lib/insights.ts` as a typed rule registry using shared analysis
  metrics instead of recalculating wins/losses and score stats ad hoc.
- Added `rarity` and `weight` metadata to insight candidates so future tuning
  can control how often common vs rare events appear in the Hub feed.
- Updated Network cards to use player ids instead of display names, sort by
  confidence/impact, and explain impact as a performance-score delta such as
  `+18 điểm hiệu suất`.
- Synced Hub, Profile, Network, and Insights to read from the same analysis
  snapshot so partner/opponent labels and comments do not disagree.
- Hardened Hub insight copy rules so win-rate comments include record context
  and dominant-win comments are toned down when the player's overall record/ELO
  does not support a strong "hủy diệt" framing.
- Fixed partner/opponent edge counting so a player is only counted in matches
  where they actually appear, preventing impossible matchup records that exceed
  the player's real match total.
- Rebuilt the Hub insight registry to the 52-scenario first pass from
  `docs/ANALYSIS_INSIGHTS_RULES.md`, with one evidence-backed sentence
  per scenario and rarity/frequency/appearance metadata for feed selection.
- Rephrased user-facing ELO expectation deltas as `cao hơn/thấp hơn kỳ vọng từ
  ELO X điểm` instead of raw `baseline`, `impact`, or machine-prediction wording.
- Updated Profile and Network analysis cards to use the same ELO-expectation
  wording, replacing user-facing `Baseline` / `điểm hiệu suất` labels with
  plain-language expectation deltas and sample size.
- Aligned `docs/ANALYSIS_INSIGHTS_RULES.md` with the actual 52 rule
  triggers and feed frequency metadata in `src/lib/insights.ts`, including
  notes for approximation or global-only rules.
- Added the current code sentence for every 52-rule insight row so trigger,
  frequency, and copy can be reviewed together from the plan.
- Removed the older architecture rewrite plan so future work follows
  `docs/ANALYSIS_INSIGHTS_RULES.md` and `docs/ANALYSIS_INSIGHTS_SELECTION.md`.
- Delayed Hub insight rendering until the initial match cache/server sync
  finishes, preventing comments from appearing after refresh and then changing
  again a second later.
- Changed `/analysis` IndexedDB sync to fetch the full server match set on page
  entry and replace the local match cache, preventing stale browser cache counts
  from overriding fresh Postgres data after reload.
- Added shared route data cache groundwork: Dashboard and Analysis now seed/read
  a common IndexedDB cache, explicit refresh can replace it from Postgres, and
  the old 500-match preload limit was removed for full-history correctness.
- Changed score-save flow so the server returns the canonical inserted match and
  data version; the client replaces the optimistic `TMP-*` local row with that
  match so Analysis can read the latest result from local cache without an
  extra online sync.
- Removed manual `Làm mới` buttons from Dashboard and Analysis; reload/F5 is
  now the explicit fresh-data path.
- Tuned Hub insight selection so `KHẮC TINH` / `BỊCH BÔNG` opponent scenarios
  no longer dominate the first feed slot every time, and added page-load seeded
  ordering so similarly strong comments can reshuffle after F5 without using an
  auto-rotate timer.
- Added reusable Hub insight selection audit tooling and documented the agreed
  next selection redesign: rule-type weighted selection, weighted candidate
  choice, semantic groups for V4, cooldown/soft pity, and trigger updates for
  `cover_master`, `rare_pair_hot`, and `defense_wall`.
- Extended the insight audit script with a lab-only `--strategy balanced-v1`
  simulator so selection/cooldown/pity and proposed trigger changes can be
  tested against backup data before being ported to production insight code.
- Ported the approved `balanced-v1.1` Hub insight selection model into
  production: rule-type weighted selection, weighted candidate choice,
  semantic-group diversity, localStorage cooldown/soft pity, and relative
  `defense_wall` triggering.
- Implemented Batch 1 of the analysis insight expansion, bringing the current
  registry to 62 rule types with activity, rank-vs-ELO, top-gap, late-form,
  drama, and score-style scenarios, and updated the audit/docs to count the
  expanded current rule set.
- Implemented Batch 2 of the analysis insight expansion, bringing the current
  registry to 72 rule types with rank pressure, attendance/session behavior,
  streak-partner events, dependency, middle-rank gatekeeper, unlucky pairing,
  and partner/opponent crossover stories.
- Moved `/analysis` zone navigation out of the fixed bottom bar into the header:
  desktop uses segmented buttons beside season, while mobile uses a second
  dropdown below season.
- Added Hall of Fame handling for completed-season champions: the main
  dashboard shows a centered previous-champion title line under the main title when
  available, and
  `/analysis?zone=hall` opens the dedicated `Vinh danh` zone with the full
  champion plaque and season-history rail. The `/analysis` overview no longer
  shows Hall of Fame content.
