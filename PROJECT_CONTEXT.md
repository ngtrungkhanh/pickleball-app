# Project Context

This is the required context file for future agents. Keep it compact. Put
deeper product, data, or UI details in `docs/`.

## Current Source of Truth

- Production: `https://conchimnon.vercel.app/`
- Dev preview: `https://pickleball-app-git-dev-ngtrungkhanhs-projects.vercel.app/`
- Production branch: `main`
- Shared working branch: `dev`
- Latest released feature commit after latest push: `d7d3eba`
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
- `/analysis` is currently a read-only analytics center with overview, player,
  partner, opponent, trend placeholder, and match-history tabs. It preloads up
  to 500 matches, then uses IndexedDB plus `getMatchesAfterAction` for local
  cache/sync. The best next analysis work is replacing the trend placeholder and
  bringing richer confidence-scored partner/opponent logic into matrix views.
- Local demo routes such as `/ui-demo` and `/picker-demo` may exist on one
  machine for review, but should not be pushed unless explicitly requested.

## Architecture Snapshot

- Next.js App Router
- Tailwind CSS
- Vercel Postgres
- Vercel hosting
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
