# Feature Spec

Read this file when changing product behavior, routes, user workflows, or admin
features. Do not duplicate implementation details from code.

## Product Overview

Pickleball Ranking Dashboard tracks doubles matches, rankings, recent history,
fines, seasons, admin operations, and lightweight analysis for a small
pickleball group.

This spec reflects the current Next.js production app, not the old `legacy/`
Apps Script app.

Expected data size is modest: a few hundred to a few thousand matches, not
millions. The app can preload full non-deleted match history and stores a shared
IndexedDB route cache so dashboard, history, and analysis do not repeatedly
download the same raw data during normal route changes.

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
- `Tuần này` counts matches from Monday 00:00 through Sunday 23:59:59 in
  Vietnam time, not the last rolling 7 days.
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

Expanded detail behavior:

- Form compares the latest 5 matches with the previous 5 matches for the
  same player when enough history exists, but the current momentum always reads
  latest match first.
- The main form label is a fixed compact status for all 32 possible 5-match
  W/L patterns, such as `Huy diet`, `Hoi sinh manh`, or `Khung hoang`.
- The supporting form note is a seeded, data-driven third-party style comment.
  It can use streak, last-3 momentum, score differential, close-game drama,
  volatility, previous-5 comparison, partner stability, opponent difficulty,
  fine pressure, and recent activity. It should be stable for the same player
  state but varied enough that players with similar form do not all receive the
  same note.
- Form chips are ordered newest to oldest. The newest chip is visually
  highlighted; the last two older chips may be slightly dimmer.
- Difficult/easy rival fallback considers both player match count and
  maximum meetings with a single rival, not only whether a qualified rival
  exists. Suggested buckets:
  - too little player data
  - rivals are too scattered
  - repeated rival sample is almost enough
  - enough sample but no one dominates / no easy matchup
- Qualified rival metrics should stay concise, for example `85% thua - 11/13`
  or `85% thang - 11/13`, instead of long sentences.
- Partner selection uses a confidence score, not raw win rate only. Shared
  matches, wins, recent pair form, score differential, and recent stability can
  outrank a smaller perfect sample; for example `9/10` should generally beat
  `5/5`.
- Difficult and easy rival selection also uses confidence scoring with sample,
  win/loss rate, recent results, score differential, and close-game context.
  Notes should distinguish close losses from heavy losses and easy-looking
  matchups from genuinely favorable score gaps.

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

Current implementation files:

- `src/app/analysis/page.tsx` - server route that loads players, matches,
  config, and seasons.
- `src/components/analysis/AnalysisCenter.tsx` - client UI, zones, season
  filtering, IndexedDB sync, and local analysis display.
- `src/lib/analysis-core.ts` - shared derived-data core for ELO, player
  metrics, radar inputs, partner/opponent impact edges, profile data, and
  analysis snapshot assembly.
- `src/lib/analytics.ts` - compatibility facade for older analysis helper
  imports.
- `src/lib/insights.ts` - Hub insight rule registry built from the shared
  analysis snapshot.
- `src/lib/db.ts` - IndexedDB helpers for local match cache.
- `src/lib/stats.ts` - shared leaderboard and advanced stat logic used by both
  dashboard and analysis.

Current behavior:

- season selector with all-season option
- sync/cache badge showing current cached match count
- 4-zone navigation: `Tổng quan`, `Vinh danh`, `Cá nhân`, and `Mạng lưới`;
  desktop shows it in the header beside season, mobile shows it as a dropdown
  under season
- overview zone: summary cards, ELO leaderboard/sparkline, and automated
  insight feed
- Hall of Fame zone: latest completed-season champion plaque and compact
  season-history rail
- profile zone: selected player, ELO rank, win rate, radar chart, current
  streak, activity, best partner, toughest opponent, and recent matches
- network zone: partner/opponent cards for the selected player with record,
  win rate, impact label, and a plain-language explanation of the impact value

Current analysis rules:

- Analysis is read-only. Do not add write controls here unless the user
  explicitly changes the product direction.
- Guest matches are excluded from ranking analytics through `isRankingMatch`.
- The selected season filters all tabs. `Tong hop` uses all cached/preloaded
  matches.
- Hall of Fame is independent from the selected season filter. It reads full
  match history, only includes completed seasons, uses the Dashboard ranking
  sort to choose each champion, and keeps the active season as a "dang dien ra"
  timeline item instead of naming a champion.
- The main dashboard may show the latest completed-season champion. On wide
  desktop it appears as a real summary-row tile before the four summary cards;
  on smaller screens it appears as a compact card before the summary cards. It
  links to `/analysis?zone=hall` and only appears when at least one
  completed-season champion exists.
- `src/lib/analysis-core.ts` normalizes the selected match set once and is the
  source of truth for Hub, Profile, Network, and Hub insights.
- ELO is calculated client-side from full 2v2 ranking matches in chronological
  order. Starting rating is `1000`, team rating is average team ELO, dynamic K
  is based on match count, and score margin affects the delta.
- Player win/loss, form, streak, attack, defense, brave/performance score,
  activity, points scored, points conceded, and fines are derived directly from
  match rows.
- Defense uses average points conceded per match, not low points scored or low
  activity.
- Partner and opponent network rows use directed edges keyed by player id, not
  display name. Each edge only counts matches where that player actually
  appears and includes sample size, record, win rate, score diff,
  expected-result delta, confidence, and label.
- Expected-result delta compares the real result with the ELO-based win
  expectation before each match. UI and Hub comments should phrase it as
  `cao hơn kỳ vọng từ ELO 18 điểm` or `thấp hơn kỳ vọng từ ELO 18 điểm`, not as
  `baseline`, `impact`, or a raw percentage.
- Hub insights are generated from the same snapshot with
  rarity/frequency/appearance metadata so rare events can be prioritized over
  always-available facts.
- Hub insight comments read from the shared local cache. Analysis should not
  auto-fetch online after mount; reload/direct route preload is the normal
  online reconciliation path when the user needs fresh data.
- Hub insight copy that mentions win rate should include record context such as
  `wins/total` or `wins-total record`. Strong dominance wording should be
  reserved for players whose overall record/ELO supports that framing; otherwise
  describe dominant wins as isolated score highlights.
- The first full insight dictionary target is 52 scenarios with one strong
  evidence-backed sentence each. Expand to 4-5 variants per scenario only after
  data correctness and tone are verified.

Known gaps / good next work:

- Add a dedicated trend view if needed: ELO over time, rolling 5/10-match win
  rate, rolling score differential, close-game record, fine trend, and activity
  cadence.
- Add player-specific trend views: ELO over time, rolling 5/10-match win rate,
  rolling score differential, close-game record, fine trend, and activity
  cadence.
- Add partner/opponent detail drilldowns from matrix rows if the UI stays
  readable on mobile.
- Review the full Hub insight dictionary after the metric rewrite has settled.
- Keep analysis cheap: use preloaded/cached data and avoid polling or extra
  Postgres calls for normal tab/filter changes.

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
