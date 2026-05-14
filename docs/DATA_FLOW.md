# Data Flow

Read this file when changing database schema, server actions, match save/edit
logic, caching/revalidation, localStorage, or Vercel compute behavior.

## Data Stores

- Vercel Postgres is the source of truth.
- Browser localStorage is only for local UX state, draft/pending protection,
  device identity, and edit unlock state.
- IndexedDB stores cached match history for the analysis center.
- GitHub stores source code.
- Vercel deployments store build history, not local secrets or database data.

Current Vercel env status:

- Production deployments from `main` use the Production database.
- Preview deployments from branch `dev` use a separate dev database.
- The dev database is intended for testing and can be edited without affecting
  production data.
- Merging `dev` into `main` merges code only. Database data and Vercel env
  values do not merge through Git.
- Keep `ALLOW_PREVIEW_WRITES=true` scoped only to Preview branch `dev`. Do not
  add it to Production.

## Important Tables and Config

The exact schema lives in setup/migration code. Current important concepts:

- `players` - members, active state, and display names
- `matches` - match history
- `config` - app config such as active season and fine amount
- `seasons` - season records, including seasons with 0 matches
- `player_stats` - incremental per-player/per-season wins, losses, total, money
- `audit_logs` - admin/action log
- `archives` - soft-delete archive/recycle-bin data

Critical constraints:

- `matches.id` is required.
- `matches.date` is required.
- New matches must set both explicitly.
- New matches must use `config.active_season`.
- Soft-deleted records use `deleted_at` and optional `delete_group_id`.

## Read Flow

Normal viewing should be cheap:

1. `/` uses `revalidate = false` and is intended to be static/ISR-style.
2. Server-side data fetches preload enough bounded data for smooth client-side
   interaction.
3. Dashboard fetches players, up to 500 non-deleted matches, config, and
   non-archived seasons.
4. Client-side filtering/sorting handles common UI changes without extra DB
   calls where practical.

Expected match volume is only a few hundred records, so bounded full-preload is
acceptable and improves history UX.

Route cache notes:

- `/` and `/analysis` use `revalidate = false`.
- `/history` and `/add-match` currently use `revalidate = 0` and hit the server
  on request.
- Server actions revalidate `/`, `/history`, and/or `/analysis` after writes.

## Match Save Flow

Expected save flow:

1. `ScoreForm` validates all 4 player slots (`win_1`, `win_2`, `lose_1`,
   `lose_2`).
2. `ScoreForm` checks local duplicate risk using `pickleball_recent_matches`
   within 15 minutes with a team-based key:
   `season::sort(win_1,win_2)>sort(lose_1,lose_2)`.
3. If duplicate is detected, client asks for explicit confirmation before
   sending.
4. `ScoreForm` optimistically inserts a temporary match into local dashboard
   state.
5. `ScoreForm` saves pending match data under `pickleball_pending_match`.
6. `addMatchAction` reads form data and creates an id like `M<timestamp>`.
7. `addMatchAction` checks server duplicate risk against recent matching rows
   using the same team-based key and season.
8. If duplicate exists and `duplicate_confirmed` is missing/false, server skips
   insert and returns `skippedDuplicate`.
9. `addMatchAction` inserts into `matches` with id, date, players, score,
   season, and `created_by`.
10. `addMatchAction` updates `player_stats` incrementally:
   - guest matches do not count wins/losses
   - loser fines still count for non-guest losers
11. `addMatchAction` writes an audit log.
12. `addMatchAction` revalidates `/`, `/history`, and `/analysis`.
13. Client clears pending state after confirmed success, refreshes on
    `skippedDuplicate`, or keeps retry state on error.

Do not remove local-first/pending behavior unless replacing it with an equally
safe flow.

## Match Edit Flow

Editing a match must keep stats balanced:

1. Read old match state.
2. Reverse old contribution where incremental stats are used.
3. Update the match row.
4. Apply new match contribution.
5. Write audit log.
6. Revalidate `/`, `/history`, and `/analysis`.

Never update match rows in a way that leaves leaderboard/fines inconsistent.

## Delete Flow

Prefer recoverable deletion for user-visible data. Hard delete is only safe for
records with no historical dependency or when explicitly approved.

Current delete behavior:

- Match delete reverses stats/fines, then sets `matches.deleted_at`.
- Player delete archives the player and related matches, soft-deletes related
  matches, soft-deletes the player, and removes `player_stats` rows.
- Season delete archives the season and matches, soft-deletes season matches,
  marks season archived, and clears `active_season` when needed.
- Restore from archive can restore archived player and match data.

## localStorage Usage

Allowed localStorage uses:

- edit/unlock state
- pending or draft match data
- duplicate-protection helper data
- anonymous device id, nickname, and lightweight device attribution
- UI preferences that do not change source-of-truth data
- admin auth date for `/admin`

Do not use localStorage as the source of truth for leaderboard or shared match
history.

Current localStorage keys:

- `pickleball_edit_unlocked`
- `pickleball_pending_match`
- `pickleball_recent_matches`
- `pickleball_client_id`
- `pickleball_client_nickname`
- `pickleball_admin_auth_date`

## IndexedDB Usage

The analysis center uses IndexedDB:

- database: `PickleballDB`
- object store: `matches`

Implementation files:

- `src/components/analysis/AnalysisCenter.tsx`
- `src/lib/analysis-core.ts`
- `src/lib/insights.ts`
- `src/lib/db.ts`
- `src/app/actions.ts` via `getMatchesAfterAction`
- `src/app/analysis/page.tsx`

Server preload:

1. `/analysis` uses `revalidate = false`.
2. The server route loads non-deleted players, up to 500 non-deleted matches,
   config, and non-archived seasons.
3. The route passes `players`, `matches`, `seasons`, `loseMoney`, and
   `activeSeason` into `AnalysisCenter`.
4. The route currently attempts lightweight schema/guest normalization, but
   skips it in Preview when preview writes are blocked.

Client sync flow:

1. Render immediately from server-provided `initialMatches`.
2. Ask server for the current full non-deleted match set via
   `getMatchesAfterAction('')`.
3. Replace the IndexedDB `matches` store with that server result.
4. Continue analysis from the refreshed cache.
5. If the full sync fails, use whichever is larger between the current server
   preload and local IndexedDB cache.

Important caveat:

- `getMatchesAfterAction(lastId)` still supports incremental reads for other
  screens, but `/analysis` intentionally uses the empty-id full read on page
  entry so stale IndexedDB rows cannot override newer Postgres data.
- The analysis cache is a replaceable local copy. Full imports, deletes, edits,
  and new match batches should converge on the next analysis page sync.

Client analysis derivation:

- `selectedSeason` filters cached/preloaded matches client-side.
- `buildAnalysisSnapshot` in `src/lib/analysis-core.ts` normalizes the selected
  data once for the entire analysis UI.
- Ranking analytics exclude guest/deleted records and require full 2v2 doubles
  rows before ELO, player metrics, partner edges, opponent edges, and insights
  are derived.
- ELO replay uses chronological order and stores per-match expected
  probabilities plus the two teams' pre-match ELO averages. User-facing copy
  should phrase this as `tỷ lệ thắng dự tính` or `kỳ vọng từ ELO trước trận`.
- Player metrics derive wins, losses, win rate, current streak, recent form,
  points scored, points conceded, average conceded, attack, defense, brave,
  synergy, activity, fines, and recent matches directly from match rows.
- Partner and opponent rows are directed edges keyed by player id and only count
  matches where that player actually appears. They include record, rate,
  average score diff, expected-result delta, confidence, and label.
- Hub insight candidates are generated from the same snapshot in
  `src/lib/insights.ts`; rules carry rarity/frequency/appearance metadata for
  feed tuning.

Cache and revalidation:

- Match writes revalidate `/analysis` together with `/` and `/history`.
- Analysis uses IndexedDB for a fast local copy, but page-entry sync treats
  Postgres as authoritative and replaces stale local match history.
- Do not use IndexedDB as source of truth. Postgres remains authoritative.

## Vercel and Cache

Goal: viewing should be cheap; writes can spend compute.

Rules:

- Avoid forcing every page view to hit Postgres.
- Revalidate or refresh after successful writes.
- Keep DB queries scoped to the data the route actually needs.
- Do not add polling or background DB reads without a clear need.
- Be careful with schema changes inside page render. They are convenient but can
  spend compute and should not grow uncontrolled.
- Page-render schema/guest normalization is skipped in Preview when preview
  writes are blocked. It can run on branch `dev` while `ALLOW_PREVIEW_WRITES`
  is true and the branch points to the separate dev database.

## Setup and Migration

- `/api/setup` creates/upgrades schema and seeds Season 1, guest player, and
  default config.
- `/api/migrate` reads `legacy/PICKLEBALL RANKING.xlsx`; production requires
  `SETUP_SECRET`.
- `/api/migrate` also supports `POST` with uploaded `.xlsx`:
  - replaces all records in `matches` from sheet `MATCHES`
  - auto-creates missing player IDs referenced by uploaded matches
  - rebuilds `player_stats` from imported match data
- `sync_excel_to_db.js` is a destructive local migration helper that deletes
  existing DB records before importing Excel data. Do not run it against
  production unless the user explicitly approves.

## Local Build Caveat

Local `npm run build` can fail if `.env.local` uses a direct Postgres connection
string during prerender. Use the pooled connection string when verifying builds
that prerender database-backed routes.
