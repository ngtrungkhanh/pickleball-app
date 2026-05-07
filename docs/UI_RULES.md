# UI Rules

Read this file when changing layout, text, responsive behavior, modals, score
entry, leaderboard, history, or analysis UI.

## Review Order

Every UI change must be reviewed in this order:

1. Mobile
2. Desktop Full HD
3. 2K
4. 4K
5. Other screen types

Do not make a desktop fix that causes mobile overflow, hidden text, or poor tap
targets.

## Overall Style

- Dark, compact, utilitarian dashboard with primary green accents.
- No marketing landing page.
- Current dashboard shows a large `Pickleball Ranking` title before the main
  content.
- Use dense but readable information layout.
- Avoid oversized decorative UI.

## Wording

- Communicate with the user in Vietnamese.
- Keep the word `Season`.
- All-season view is `Tong hop`.
- Rival concepts use `Keo kho` and `Thien dich`.
- Partner label can upgrade to `Ca cung`.
- Keep short shorthands such as `W`, `L`, and `T` when they protect mobile
  layout.
- Some source strings currently contain mojibake in code. Avoid adding new
  mojibake. Prefer UTF-8-safe edits or ASCII docs if shell encoding is uncertain.

## Responsive Rules

- Mobile first.
- Text must not overlap or overflow containers.
- Score input must remain prominent and fast to tap on mobile.
- SummaryGrid is 1 column on narrow mobile, 2 columns from 420px, 4 columns on
  wide desktop.
- Leaderboard table/header remains important content and should not become
  unreadable microcopy.

## Leaderboard Detail

Expanded player detail uses balanced blocks:

- title line
- main content line
- supporting metric line

Partner detail qualifies only above 50% win rate and at least 5 shared matches.
Partner label upgrades above 70% win rate.

Desktop leaderboard uses a table. Mobile leaderboard uses stacked rows.

## Settings and Modals

- Settings is a modal, not a separate route.
- Read-only Settings should focus on edit unlock.
- Edit mode exposes admin tabs.
- Save feedback should appear near the action area.
- Confirmation overlays should be visually above primary modals.
- Modal z-index convention in current UI:
  - primary modals around `z-[500]`
  - confirmation overlays around `z-[600]`
  - sync badge around `z-[700]`

## Score Form

- Mobile score controls should be large enough for fast court-side entry.
- Avoid oversized desktop score text.
- Do not make score entry depend on slow network feedback.
- Keep save feedback short and clear.
- Score steppers are hidden on desktop and shown on mobile.
- Winner and loser select groups sit around the centered score box on desktop.

## History

- Recent history must remain compact on mobile.
- Full history should be scannable and filterable.
- Guest and season labels should remain understandable without bloating each row.
- Full-history modal filters by member, partner/opponent relation, and result.
- Standalone `/history` is separate from the dashboard modal and currently uses a
  server-rendered request path.

## Analysis UI

- Analysis has horizontal tabs.
- Analysis should stay read-only.
- The sync/cache badge should stay small and unobtrusive.
- Trend is currently a placeholder; do not present it as complete charting.
