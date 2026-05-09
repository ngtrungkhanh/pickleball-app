# Changelog

This is a compact project history. Keep detailed chat transcripts out of the
repo.

## Current Production Snapshot

- Production domain: `https://conchimnon.vercel.app/`
- Production commit verified from Vercel/GitHub: `11cf340`
- Commit message: `fix: duplicate match confirm flow with server guard`

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
