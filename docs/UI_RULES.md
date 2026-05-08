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
- Keep dashboard cards and score-entry controls visually soft enough for the
  current style. Prefer medium/large rounded corners such as `rounded-2xl` for
  major cards and controls unless space is too tight; avoid reverting the main
  dashboard to a sharp, boxy look.

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
- SummaryGrid should use a compact 2-by-2 layout on mobile when possible and 4
  columns on wide desktop. Reduce mobile number text if needed so long money
  values do not collide with labels or icons.
- Leaderboard table/header remains important content and should not become
  unreadable microcopy.
- Avoid nested scrolling inside the leaderboard for the normal small member
  list. Let the page scroll naturally so mobile users can reach score entry
  without getting trapped in an inner scroll region.

## Leaderboard Detail

Expanded player detail uses balanced compact blocks:

- title line with optional icon
- main content line
- supporting metric line
- short fun/insight line when useful

Partner detail qualifies only above 50% win rate and at least 5 shared matches.
Partner label upgrades above 70% win rate.
Leaderboard expanded detail uses four compact blocks where possible: form,
partner, difficult rival, and easy rival. Mobile detail should use a 2-by-2
grid instead of four stacked single-column blocks.
Keep each detail line short. Prefer concise text such as `Khong ngan ai`,
`Khong keo free`, `Gap con rai rac`, `Drama dang tich tu`, `Dang len tay`,
or `Tut nhip nhe`.
Partner detail should also use the same compact four-line pattern when possible:
label/icon, partner name, short win metric, and one short fun line such as
`Danh chung rat ben` or `Cap nay kha on`.

Desktop leaderboard uses a table. Mobile leaderboard uses stacked rows.
Fine amounts should use grouped full numbers such as `35.000`, not `35k`.

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
- Duplicate detection in 15 minutes should show a confirmation prompt instead of
  hard blocking.
- Player select placeholders should act as hint-only when empty; option menus
  should prioritize actual player names.
- Native select menus are hard to style consistently. For the score form,
  prefer a custom player picker when implementing the next UI pass:
  - mobile opens a bottom sheet
  - desktop opens a popover
  - each player item should be at least about 56px tall for touch accuracy
  - winner picker uses green active/hover accents
  - loser picker uses red active/hover accents
  - real members appear first
  - guest (`Khach`) appears last, separated by a divider and a small user icon
  - keep the existing duplicate-slot prevention and required-four-slots behavior

## History

- Recent history must remain compact on mobile.
- Full history should be scannable and filterable.
- Guest and season labels should remain understandable without bloating each row.
- Full-history modal filters by member, partner/opponent relation, and result.
- Standalone `/history` is separate from the dashboard modal and currently uses a
  server-rendered request path.

## Admin Import

- Admin header includes an `Import XLSX` action for local file selection.
- Import action must clearly warn that existing match history will be replaced.
- Keep hidden file input handlers lightweight; defer heavy import work outside
  the direct input event to reduce INP spikes.

## Analysis UI

- Analysis has horizontal tabs.
- Analysis should stay read-only.
- The sync/cache badge should stay small and unobtrusive.
- Trend is currently a placeholder; do not present it as complete charting.
