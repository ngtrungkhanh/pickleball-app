# Project Context

This is the required context file for future agents. Keep it compact. Put
deeper product, data, or UI details in `docs/`.

## Current Source of Truth

- Production: `https://conchimnon.vercel.app/`
- Dev preview: `https://pickleball-app-git-dev-ngtrungkhanhs-projects.vercel.app/`
- Production branch: `main`
- Shared working branch: `dev`
- Latest production `main` commit after latest push: `120e7ce` (`Merge dev into main`)
- Latest released feature commit: `cd2d0f8` (`Refine analysis radar scoring`)
- Latest pushed `dev` commit: `cd2d0f8` (`Refine analysis radar scoring`)
- GitHub remote: `https://github.com/ngtrungkhanh/pickleball-app.git`

Do not edit `main` directly. Work on `dev`, push `dev`, test Vercel Preview,
and merge to `main` only when the user confirms release.

## What to Read

Always read:

1. `README.md`
2. `PROJECT_CONTEXT.md`
3. `CHANGELOG.md`

Read only when relevant:

- `docs/FEATURE_SPEC.md` for product screens, features, and business behavior.
- `docs/DATA_FLOW.md` for database, server actions, cache, localStorage, and
  match save flow.
- `docs/UI_RULES.md` for layout, wording, responsive behavior, and visual rules.
- `docs/ANALYSIS_INSIGHTS_RULES.md` before changing `/analysis` insight logic,
  trigger thresholds, feed frequency, scenario copy, or future scenario
  expansion. This is the active source of truth for Hub insight rules.
- `docs/ANALYSIS_INSIGHTS_SELECTION.md` before tuning Hub insight selection,
  weights, semantic groups, cooldown/pity behavior, or audit simulation.

## Product Priorities

- Fast viewing with minimal Vercel/Postgres compute.
- Smooth mobile-first score entry during live play.
- Accurate leaderboard, history, fines, seasons, guest behavior, and analysis.
- Simple read-only/edit mode without a full login system.
- Stable production; preview changes before release.

## Current UI Notes

- Recent dev work moved score entry toward a custom mobile-first player picker,
  2-by-2 mobile summary cards, natural page scrolling for the leaderboard, and
  four-line expanded leaderboard detail with compact fun remarks.
- Expanded leaderboard form remarks now read 5-match form newest-first and use
  seeded data-driven notes so similar players do not always get identical text.
- `/analysis` is a read-only analytics center with 3 zones (Hub, Profile,
  Matrix). Zone switching now lives in the header beside the season selector on
  desktop, and as a second dropdown below season on mobile. It uses
  `src/lib/analysis-core.ts` as the shared source for ELO, player metrics,
  partner/opponent impact edges, profile cards, Network cards, and Hub insight
  comments.
- Dashboard is the normal user-facing manifest sync point for the shared
  IndexedDB route cache. Postgres remains authoritative, Dashboard/F5 checks
  per-part versions and downloads only stale data parts, score-save responses
  replace optimistic local rows with canonical server matches, and Analysis
  reads local cache unless the cache is empty on first direct entry. Admin
  remains the always-online data-management path.
- Hall of Fame champion portraits are stored in Vercel Blob and cached locally
  in IndexedDB by season image path/update timestamp.
- Dashboard and Analysis no longer show manual `Làm mới` buttons; browser
  reload/F5 is the intended fresh-data action.
- Admin dashboard supports both `.xlsx` bulk migration and `.json` full database backup/restore mechanisms.
- Sports Ticker on Dashboard and Flash News Cards in `/analysis` are implemented.
- Latest released work includes compact `/analysis` Hub ELO layout, full-width
  ELO explainer accordion, JSON restore season replacement/cache refresh,
  adaptive Attack/Defense radar scoring, weighted 10-match Profile radar Form,
  weekly ELO decay `>1500` and fewer than 8 matches, and tightened Hub insight
  copy/triggers.
- Local demo routes such as `/ui-demo` and `/picker-demo` may exist on one
  machine for review, but should not be pushed unless explicitly requested.

## Current Pending Tasks (Next Session)

- **Production Validation**: Review Dashboard ticker, Analysis Flash News
  Cards, Hall of Fame, Pair analysis, Hub layout, and Profile radar scores on
  Production after the latest `main` deployment finishes.
- **Admin JSON Restore Review**: Validate that JSON restore replaces seasons
  exactly from the backup file and refreshes the shared IndexedDB cache so old
  seasons do not reappear.
- **Analysis Radar Review**: Validate the calibrated Attack/Defense radar
  scores and weighted 10-match Form with real production/dev data across
  multiple seasons/backups.
- **Shared Data Cache Review**: Validate Dashboard manifest/partial refresh,
  Dashboard-to-Analysis local cache handoff, direct-empty Analysis bootstrap,
  canonical score-save replacement, and Admin online reconciliation before
  resuming insight-copy expansion work.
- **Analysis Copy Review**: Review Hub insight comment tone on Production and
  Preview with real data, especially weekly ELO rise/fall, `score_bully`, and
  relationship/dependency wording.
- **Analysis Insights Review**: The insight registry is implemented as 87 rule
  types with 5 Vietnamese copy variants where applicable, type-first weighted
  selection, semantic-group diversity, cooldown/soft pity, and the relative
  `defense_wall` trigger. Next review Vercel Preview with real dev data, then
  tune wording/rule weights if needed.
- **Local Environment Cleanup**: Local `npm run build` currently reaches
  compile/TypeScript successfully but fails prerendering `/analysis` when
  `.env.local` contains a direct Vercel Postgres URL instead of a pooled URL.

## Architecture Snapshot

- Next.js App Router
- Tailwind CSS
- Vercel Postgres
- Vercel hosting
- Vercel Blob for Hall of Fame champion portrait images
- Server actions for writes
- Static/ISR-style reads where possible
- `legacy/` is reference-only for old Apps Script behavior. Current app data
  reads and writes Vercel Postgres; legacy Excel files are not the data source.

## Non-Negotiable Rules

- Do not commit `.env.local` or secrets.
- Do not run production database migration/drop/alter commands without explicit
  user approval.
- Do not casually delete user-visible production data.
- Production uses the Production database. Preview branch `dev` uses a separate
  dev database via Vercel branch env overrides.
- Keep the Preview write guard. Only branch `dev` should have
  `ALLOW_PREVIEW_WRITES=true`; it is a safety switch if Preview env is ever
  pointed at the wrong database again.
- New matches must use `config.active_season`.
- `matches.id` and `matches.date` are required and must be inserted explicitly.
- Match entry now requires all 4 player slots selected.
- Duplicate match guard uses team-based matching and confirmation
  (`duplicate_confirmed`) across client and server.
- Admin XLSX import can replace all `matches` data from sheet `MATCHES` and
  now auto-creates missing player IDs before match inserts.
- Full `npm run lint` has existing debt; use targeted lint for changed files.
- UI review order: mobile, Desktop Full HD, 2K, 4K.

## Documentation Maintenance

- Update `PROJECT_CONTEXT.md` only for important workflow, architecture, or
  project-assumption changes.
- Update `CHANGELOG.md` for notable completed features/fixes.
- Update `docs/FEATURE_SPEC.md` when user-facing behavior changes.
- Update `docs/DATA_FLOW.md` when data, cache, database, or server-action flow
  changes.
- Update `docs/UI_RULES.md` when UI rules or wording decisions change.
