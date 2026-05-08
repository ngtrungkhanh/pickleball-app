# Feature Spec

Read this file when changing product behavior, routes, user workflows, or admin
features. Do not duplicate implementation details from code.

## Product Overview

Pickleball Ranking Dashboard tracks doubles matches, rankings, recent history,
fines, seasons, admin operations, and lightweight analysis for a small
pickleball group.

This spec reflects the current Next.js production app, not the old `legacy/`
Apps Script app.

Expected data size is modest: a few hundred matches, not millions. The app
preloads up to 500 visible matches for dashboard and analysis so history and
filters feel instant while Vercel/Postgres usage stays low.

## User Modes

- Read-only is the default mode.
- Edit mode is unlocked in Settings and stored locally in the browser.
- Read-only users can view leaderboard, history, and analysis.
- Edit users can record matches and use admin controls.
- On Vercel Preview, writes are protected by a Preview write guard.
- Branch `dev` preview is expected to use a separate dev database and can enable
  writes with `ALLOW_PREVIEW_WRITES=true`.

## Main Routes

- `/` - dashboard with summary, leaderboard, score entry, recent history, and
  settings access.
- `/history` - standalone full history page.
- `/analysis` - read-only analysis center.
- `/admin` - admin-oriented data management view.
- `/add-match` - direct match-entry route retained for reference/direct entry.
- `/api/setup` - schema setup/upgrade helper; should be protected by process
  and not treated as a normal user feature.
- `/api/migrate` - Excel migration helper; production requires `SETUP_SECRET`.

## Dashboard Features

- Summary metrics for current selected season or all-season view.
- Leaderboard with expandable player details.
- Season selector, including seasons with 0 matches.
- Recent history with compact mobile-safe match cards/rows.
- Settings modal for edit access and admin controls.
- Analysis link to `/analysis`.
- Settings button opens the modal; score entry only appears after edit unlock.

## Score Entry

Score entry is designed for fast mobile use during live play.

Expected behavior:

- Require all 4 slots: `winner 1`, `winner 2`, `loser 1`, `loser 2`.
- Guest can be selected and is allowed in dropdowns.
- Prevent the same non-guest player from occupying duplicate slots on the same
  side by clearing conflicting selections.
- Default score is `11-5`.
- Score steppers are visible on mobile; desktop uses compact score inputs.
- Detect duplicate risk within 15 minutes using localStorage with a team-based
  match key, then ask for user confirmation before continuing.
- Optimistically add a temporary local match immediately.
- Save pending data to localStorage before server sync.
- Add device identity in `created_by`.
- Save to the active season.
- Show sync states: saving, saved, error/retry.
- Retry pending save when a recent pending draft exists.
- Refresh/revalidate dashboard/history/analysis after server success.

## Leaderboard and Stats

Rankings are derived from match data and player state. Guest matches do not
count for rankings or analytics.

Important stats concepts:

- wins/losses
- score differential
- fine amount
- recent form
- partner performance
- opponent/rival performance

Current ranking sort:

1. win rate descending
2. wins descending
3. losses ascending
4. name ascending

Dashboard leaderboard displays active non-guest players and limits the visible
board to the top 20.

Expanded player detail currently shows:

- recent form and form comment
- best partner when at least 5 shared matches and above 50% win rate
- toughest rival when at least 5 meetings and above 50% loss rate
- easiest rival when at least 5 meetings and above 50% win rate

## Seasons

- Active season comes from `config.active_season`.
- New matches go into the active season.
- All-season view is labeled `Tong hop`.
- Keep the word `Season` for season labels/selectors.
- Season start date is derived from actual match data when available.
- Season selector merges seasons from the `seasons` table, active season, and
  seasons present in match data.
- Creating or activating a season updates active season state and revalidates
  dashboard/history/analysis.

## Guest Player

- Guest player id: `__GUEST__`
- Guest display name: `Khach`
- Guest may appear in match history.
- Guest matches do not count ranking/stat/analytics.
- Fines still count for non-guest losing players.

## Settings and Admin

Settings supports:

- edit unlock/lock
- member management
- active/inactive members
- season management
- fine amount

Settings details:

- Access tab unlocks edit mode with `NEXT_PUBLIC_EDIT_PASS`, fallback
  `pickleball`.
- Unlock state is stored in localStorage.
- Member tab can add players, rename players on blur, toggle active state, and
  request player deletion.
- Guest cannot be renamed and cannot be deleted.
- Season tab can create a season, activate a season, end current season and
  create the next one, and request season deletion.
- Money tab updates `lose_money`.

Admin page supports:

- daily admin auth stored in localStorage after password verification
- audit log view
- archive/recycle-bin view and restore
- JSON backup download of players, matches, logs, archives, seasons
- rebuild stats action
- import XLSX and replace full match history from sheet `MATCHES`
- members tab with inline edit/toggle
- seasons tab
- matches tab with search and inline match editing

Editing a match must keep aggregate stats consistent.

## History

Recent history on dashboard:

- shows latest 5 matches
- opens a full-history modal
- groups full modal by season
- filters by member 1, member 2, partner/opponent relation, and member result
- allows delete only in edit mode

Standalone `/history`:

- fetches all non-deleted matches
- groups by season
- displays match rows with delete button

## Analysis Center

`/analysis` is read-only and uses IndexedDB as a local cache for match history.

Features:

- season selector with all-season option
- sync badge showing cached match count
- overview tab: match count, active member count, top player, highest ELO
- player tab: rank, ELO, streak, win rate, total matches, best partner, nemesis,
  last match
- partner matrix tab
- opponent matrix tab
- trend placeholder
- searchable match history tab

ELO is currently calculated client-side from preloaded/cached matches.

## Do Not Break

- Do not make production users wait on unnecessary loading for common viewing.
- Do not lose match history.
- Do not count guest matches in rankings.
- Do not hardcode new matches to Season 1.
- Do not hide seasons with 0 matches from selectors.
- Do not make score entry harder on mobile.
- Do not remove local pending save/retry behavior without replacing it.
- Do not treat `legacy/` as source of truth unless the user explicitly asks.
- Do not enable Preview writes unless the Preview deployment is confirmed to use
  a separate dev database or the user explicitly approves the risk.
