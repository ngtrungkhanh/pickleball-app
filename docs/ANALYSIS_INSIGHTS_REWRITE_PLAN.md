# Analysis Insights Rewrite Plan

This plan tracks the agreed rewrite for `/analysis` and the Hub insight feed.
Keep it current while implementing so future sessions do not drift.

## Goals

- Make one analysis core the source of truth for all `/analysis` calculations.
- Rebuild Hub insights from typed, shared metrics instead of ad hoc stat loops.
- Connect insight comments to the same partner/opponent impact data shown in
  the Network view.
- Explain `impact` in the UI as a performance-score delta, not as a vague
  percentage.
- Preserve the dashboard leaderboard behavior while the analysis center moves
  onto the new core.

## Non-Goals

- Do not change production database schema or write flow.
- Do not add write controls to `/analysis`.
- Do not refactor dashboard expanded details unless needed for compatibility.
- Do not add extra commentary text to Network cards in this pass; keep Network
  focused on metric meaning and evidence.

## Phase 1: Shared Analysis Core

Create `src/lib/analysis-core.ts` as the source for all derived `/analysis`
data:

- Normalize matches:
  - ranking matches exclude guest/deleted records.
  - chronological order for ELO and expected probability.
  - newest-first order for recent form, streak, last match, and activity.
- Compute ELO:
  - ratings, history, and per-match expected probabilities.
- Compute player metrics:
  - wins, losses, total, win rate, current streak, latest 5-match form,
    points scored, points conceded, average points conceded, attack score,
    defense score, brave/performance score, synergy, activity, money/fines,
    daily max, last match date, close/deuce/dominant/bagel counts.
- Compute partner edges:
  - `playerId`, `partnerId`, names, total, wins, losses, rate, average score
    diff, baseline PS, with-partner PS, impact, confidence, label.
- Compute opponent edges:
  - `playerId`, `opponentId`, names, total, wins, losses, rate, average score
    diff, baseline PS, vs-opponent PS, impact, confidence, label.
- Compute profile and hub-ready data from the same metrics.

Important implementation notes:

- Use IDs as keys. Names are display-only.
- `calculatePS` must divide by the number of matches that have expected
  probabilities, not by the full input length after skipped rows.
- `impact` is a performance-score delta. Display it as `+18 hiệu suất` or
  `+18 điểm hiệu suất`, not raw `%`.
- Keep `analytics.ts` as a compatibility facade initially to reduce UI churn.

## Phase 2: Insight Rule Registry

Rewrite `src/lib/insights.ts` around typed candidates from the analysis core.

Each rule should define:

- `type`
- `group` such as `form`, `elo`, `partner`, `opponent`, `score`, or `fun`
- `priority`
- `rarity`: `common`, `uncommon`, `rare`, `epic`
- `weight`: tunable display frequency/selection bias
- `participants`
- `metrics`
- 4-5 deterministic text variants

Filtering rules:

- Return about 6-8 insights.
- A player can appear at most twice.
- A player can appear at most once in the same semantic group.
- A global insight type should appear at most once.
- Prefer higher rarity/weight/sample/impact when multiple candidates compete.
- Do not let always-available rules such as Top ELO drown out rare events such
  as long streaks, upsets, or strong partner/opponent impact.

Tone:

- Internal doubles pickleball, familiar group, playful but readable.
- Avoid machine-translation wording such as `Dọn dẹp`, `Trí tuệ`, `Động lực
  cao`, `Định hướng`, `Thắng cộng đồng`, `Rủi ro thấp`, and vague strategy
  filler.
- Use concrete data in comments: record, sample size, impact, score gap, or
  streak length.

## Phase 3: Network UI Metric Explanation

Update the Network (`Mạng lưới`) cards to explain the numbers without adding
extra commentary.

Partner card target:

- Badge: `Hợp cạ +18`, `Kỵ cạ -14`, or `Tròn vai`.
- Evidence: `7W-2L · 78% · 9 trận`.
- Explanation: `Đánh chung với A, hiệu suất cao hơn bình thường 18 điểm.`
- Optional tooltip can still show baseline/actual PS, but the card itself must
  be understandable.

Opponent card target:

- Badge: `Kèo thơm +18`, `Kèo khó -21`, or `Cân kèo`.
- Evidence: `1W-5L · 17% · 6 trận`.
- Explanation: `Gặp A, hiệu suất thấp hơn bình thường 21 điểm.`
- Avoid progress-bar semantics that make a low opponent win rate look good or
  a high opponent win rate look bad without explanation.

## Phase 4: Sync Profile, Hub, Network, Insights

All `/analysis` zones should read from the same core snapshot:

- Hub ELO and insight feed.
- Profile radar, best partner, difficult opponent, recent matches.
- Network partner/opponent rows.
- Insight generation.

This prevents Profile, Network, and Hub comments from disagreeing because of
different sort or confidence rules.

## Phase 5: Verification And Docs

Before finishing:

- Run targeted lint/type checks for changed files.
- Run `npm run build` if local Postgres env allows it; otherwise report the
  environment blocker.
- Review UI in order: mobile, Desktop Full HD, 2K, 4K.
- Update:
  - `docs/FEATURE_SPEC.md`
  - `docs/DATA_FLOW.md`
  - `docs/UI_RULES.md`
  - `PROJECT_CONTEXT.md`
  - `CHANGELOG.md` after implementation is complete.
- Commit and push to `dev`.

## Current Status

- Plan approved.
- Phase 1 implemented: `src/lib/analysis-core.ts` now centralizes ELO,
  player metrics, partner edges, opponent edges, and profile-ready data for
  `/analysis`.
- Phase 2 implemented: `src/lib/insights.ts` now uses a typed rule registry
  with `rarity` and `weight` metadata, reading from the shared analysis
  snapshot instead of recomputing ad hoc stats.
- Initial TypeScript check passed with `npx tsc --noEmit`.
- Phase 3 implemented: Network cards now use shared partner/opponent edges,
  filter by player id, show record evidence, and explain impact as a
  performance-score delta instead of a raw percent.
- Phase 4 implemented for `/analysis`: Hub, Profile, Network, and Insights now
  read from the same analysis snapshot.
- Documentation updated for Feature Spec, Data Flow, UI Rules, Project Context,
  and Changelog.
- Verification:
  - `npx tsc --noEmit --pretty false` passed.
  - `npx eslint src/lib/analysis-core.ts src/lib/analytics.ts
    src/lib/insights.ts src/components/analysis/AnalysisCenter.tsx` passed.
  - `npm run build` compiled and completed TypeScript, then failed while
    prerendering `/analysis` because local `.env.local` uses a direct Vercel
    Postgres connection string instead of a pooled connection string.
