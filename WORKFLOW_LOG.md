# Workflow Log

This file is the lightweight operating log for anyone continuing work on the Pickleball dashboard.

## Context Budget Workflow
Use context in tiers to reduce AI quota.

Always read:
1. `WORKFLOW_LOG.md` - active workflow, owner-locked UI decisions, review checklist, and recent decisions.
2. `README.md` - repo entrypoint, dev commands, and verification notes.

Read only when relevant:
- `AI_CONTEXT.md` - architecture, data fetching, ISR/Vercel, database, or original design rules.
- `DEVELOPMENT_LOG.md` - historical changes, sync/local-first behavior, legacy/App Script decisions, or old regressions.
- `TASK_TODO.md` - backlog, sprint planning, or choosing next work.
- `START_NEW_CHAT_PROMPT.md` - reusable first message when starting a fresh assistant chat.

When possible, search with `rg` and open only the specific files/sections needed for the task.

## UI Review Order
Every UI change must be checked in this order:
1. Mobile
2. Desktop Full HD
3. 2K
4. 4K
5. Other screen types

Do not make a desktop fix that causes mobile overflow, hidden content, or unreadable tap targets.

## Current UI Decisions
- Keep `Season` wording for season names/selectors.
- The all-season leaderboard view is labeled `Tổng hợp`, not `Tất cả mùa`.
- Season selector title shows a small start-date line: `Khởi tranh dd/mm/yyyy`.
- Top brand header is removed. Dashboard content starts immediately.
- SummaryGrid is minimalist horizontal and must remain mobile-safe.
- SummaryGrid must stay one column on very narrow phones, two columns from 420px, four columns on desktop.
- Leaderboard table header is important content and should stay readable, not microcopy.
- Leaderboard expanded detail uses 3 balanced cards:
  - Title line
  - Main content line
  - Supporting metric line
- Rival wording follows legacy: `Kèo khó` or `Thiên địch`, not `Đối thủ kỵ rơ`.
- Rival/partner metric lines use sentence-style Vietnamese: `75% thắng • Thắng 6/8 trận`, `80% thua • Thua 4/5 trận`.
- Partner detail only qualifies above 50% win rate and at least 5 shared matches.
- Partner detail label upgrades to `Cạ cứng` above 70% win rate.
- `Thiên địch` should have a small playful icon marker when shown.
- Score inputs should be prominent but compact. Avoid oversized desktop score text like `sm:text-6xl`.

## Text Rules
- User-facing Vietnamese should use sentence case unless it is a compact table heading or intentionally uppercase label.
- Avoid leftover English in user-facing pages.
- Keep short sports shorthands like `W`, `L`, and `T` where they protect mobile layout.
- Keep `Season` for now to match existing data and legacy behavior.

## Recent Changes
- Reworked Leaderboard detail cards to centered 3-line content.
- Normalized selected UI text: `Ghi kết quả`, `Lịch sử trận đấu`, `Lịch sử gần đây`, `Ghi trận mới`.
- Changed sync error text to `Đồng bộ lỗi - thử lại`.
- Added readonly/edit UI guard. Dashboard defaults to readonly; edit unlock is stored in localStorage. Server-side guard is intentionally deferred.
- Added Settings modal with tabs for edit access, members, Season, and fine amount.
- Settings readonly state only shows the pass unlock panel. Edit state shows lock control plus admin tabs.
- Settings changes are saved to server/database through server actions, then refreshed with `router.refresh()` without closing the modal. They are not local-only changes.
- Member settings use one shared save button for the whole member list.
- Inactive members are hidden from the leaderboard display, but their historical matches still count in stats and opponent/partner analysis.
- Complete member deletion is guarded: only members without match history can be deleted. Members with history should be set inactive instead.
- Settings save actions must show immediate UI feedback next to the action area.
- Season creation no longer asks for a start date; season display derives start date from the first match in that season.
- Season selector must include seasons from the `seasons` table even when they have 0 matches.
- Added `/analysis` route as the read-only Analysis Center. Initial tabs: overview, player, partner, opponent, trend placeholder, and filterable match history.
- Active season is read from `config.active_season`; new matches use active season instead of hardcoded Season 1.
- User-facing save feedback should say `Đang lưu...` / `Lưu lỗi - thử lại`, not `Đang đồng bộ...`.
- Match saving must insert both `id` and `date` because the current `matches` schema requires them and has no database defaults.
- Settings server actions should catch database errors and return user-visible feedback instead of throwing and leaving the modal stuck at `Đang lưu...`.

- Standardized Modal UI: All modals (Settings, History, Confirm) use consistent backdrop (`bg-black/80 backdrop-blur-md`), animations, and `rounded-3xl` corners.
- Z-Index Standardization: Primary modals are `z-[500]`, confirmation overlays are `z-[600]`, and global notifications (SyncBadge) are `z-[700]`.
- Polished ScoreForm: Mobile inputs are more prominent, spacing increased for better touch accessibility, and score stepper uses larger typography.
- Polished RecentHistory: Mobile view shows Season label, dense metadata line, and clear team names/scores.
- Standardized Text: Changed 'Unlock' to 'Mở khóa' in Settings. Standardized 'Ghi kết quả' and 'Active' across the UI.
- SummaryGrid: Enhanced visuals with refined gradients, `rounded-3xl` containers, and better typography.
- Integrated anonymous Device Fingerprinting (`USR-XXXX` + user custom nickname + browser hardware model) to attribute match logging securely without logins.
- Raised database `created_by` column size to 50 characters in `src/app/api/setup/route.ts` to fully store metadata.
- Implemented direct inline renaming `[Sửa]` for players list in Settings Settings.
- Built comprehensive inline editing for historical matches, allowing admins to modify dates/times, player rosters, and scores directly from the admin history table.
- Added incremental stats balance recalculation inside `updateMatchAction` to seamlessly subtract previous score weight and add updated scores.
- Cleaned and corrected all Vietnamese character encodings (mojibake) in the admin console.

## Immediate Handover Notes
- `npm run build` passed.
- UI has been polished specifically for Mobile (primary) and Desktop.
- Modal consistency issues have been addressed.
- Recent History now includes Season markers in the mobile view.
- ScoreForm is optimized for fast entry during play.

## Guest Player / Season Filter Decisions
- System guest player uses `id = __GUEST__` and display name `Khách`.
- `Khách` is always protected: do not rename it and do not delete it. Its `active` checkbox only controls whether it appears in match-entry dropdowns and history filters.
- Normal inactive members are hidden from leaderboard and match-entry dropdowns, but old data remains.
- Matches containing `Khách` remain in history, do not count ranking/stats/analytics, and still count fines for non-guest losers only.
- Dashboard season selector is now global for SummaryGrid, Leaderboard, Recent History, and Full History. Default selected season is `activeSeason`; `Tổng hợp` means all seasons.
- Analysis Center has its own season selector, defaulting to `activeSeason`.
- Deletes should be recoverable. Match/member/season delete flows should soft-delete visible records with `deleted_at`/`delete_group_id` rather than hard deleting user-visible data.
