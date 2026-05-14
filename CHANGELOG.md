# Changelog

This is a compact project history. Keep detailed chat transcripts out of the
repo.

## Current Production Snapshot

- Production domain: `https://conchimnon.vercel.app/`
- Latest released feature commit verified from Vercel/GitHub: `d7d3eba`
- Commit message: `fix: prevent summary card clipping`

## Major Completed Work

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
  `docs/ANALYSIS_INSIGHTS_50_RULE_PLAN.md`, with one evidence-backed sentence
  per scenario and rarity/frequency/appearance metadata for feed selection.
- Rephrased user-facing ELO expectation deltas as `cao hơn/thấp hơn kỳ vọng từ
  ELO X điểm` instead of raw `baseline`, `impact`, or machine-prediction wording.
- Updated Profile and Network analysis cards to use the same ELO-expectation
  wording, replacing user-facing `Baseline` / `điểm hiệu suất` labels with
  plain-language expectation deltas and sample size.
