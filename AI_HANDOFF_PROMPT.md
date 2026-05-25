# AI Handoff Prompt

Copy the text below into a new AI session when continuing work on this project.

```text
You are working on the Pickleball Ranking Dashboard repo.

Communicate with the user in Vietnamese.

Production is running on Vercel:
https://conchimnon.vercel.app/

Dev preview for branch dev:
https://pickleball-app-git-dev-ngtrungkhanhs-projects.vercel.app/

Branch workflow:
- main is production. Do not edit main directly.
- dev is the shared working branch for all AI agents and all machines.
- Always continue work on dev.
- Before editing code, update dev from GitHub.
- After finishing a clear unit of work, commit and push to dev so another AI or machine can continue.
- Only merge dev into main when the user confirms everything is tested and ready for production release.

Database workflow:
- Production/main uses the Production database.
- Dev preview from branch dev uses a separate dev database.
- Merging dev into main merges code only; database data does not merge.
- Keep Preview write permissions scoped to branch dev only.

Before doing work, read these files:
1. README.md
2. PROJECT_CONTEXT.md
3. CHANGELOG.md

Read deeper docs only when relevant:
- docs/FEATURE_SPEC.md for product behavior, screens, and business rules.
- docs/DATA_FLOW.md for database, server actions, cache, localStorage, and match save flow.
- docs/UI_RULES.md for layout, wording, responsive behavior, and visual rules.
- docs/ANALYSIS_INSIGHTS_RULES.md before changing `/analysis` insight rules, thresholds, frequency, copy, or future scenario expansion.
- docs/ANALYSIS_INSIGHTS_SELECTION.md before tuning Hub insight weights, semantic groups, cooldown/pity behavior, audit simulation, or the agreed next selection implementation.

Recent behavior updates to remember:
- Match save now requires 4 selected players (no empty slot).
- Duplicate match guard uses team-based key (winner team > loser team), not sorted 4-player set.
- If duplicate is detected in 15 minutes, UI asks for confirmation; server also re-checks and only accepts duplicate when `duplicate_confirmed=true`.
- Admin has an `Import XLSX` button that uploads a local `.xlsx` file and replaces match history from sheet `MATCHES`.
- XLSX import now auto-creates missing player IDs before inserting matches to avoid FK errors.
- Dashboard expanded form/partner/rival/easy insights use seeded data-driven logic in `src/lib/stats.ts`; labels must stay short and directly understandable.
- `/analysis` is read-only, preloads non-deleted matches, uses the shared IndexedDB route cache/sync, and still has a Trend placeholder. Read the Analysis Center sections in `docs/FEATURE_SPEC.md`, `docs/DATA_FLOW.md`, and `docs/UI_RULES.md` before extending it.
- Shared route cache work is now higher priority than expanding 50 insight copy:
  Dashboard and Analysis seed/read a common IndexedDB cache, score-save responses
  replace optimistic local rows with canonical server matches, and Analysis only
  goes online through route preload/reload.
- Dashboard and Analysis should not show manual `Làm mới` buttons; use browser
  reload/F5 when fresh server data is needed.
- `/analysis` Hub insight rules are now 72 current rule types: 52 core rules
  plus Batch 1 and Batch 2 expansion. Read
  `docs/ANALYSIS_INSIGHTS_RULES.md` and `docs/ANALYSIS_INSIGHTS_SELECTION.md`
  before adding later batches or tuning weights.

Working rules:
- Do not touch main unless the user explicitly asks for a release.
- Do not run production database migration/drop/alter commands unless the user explicitly approves.
- Do not commit .env.local or any secret.
- If you change an important rule, architecture decision, workflow, or project assumption, update PROJECT_CONTEXT.md.
- If you complete a notable feature or fix, update CHANGELOG.md.
- If you change product behavior, data flow, or UI rules, update the matching docs/ file.
- The app is mobile-first. Review UI in this order: mobile, Desktop Full HD, 2K, 4K.
- Use the Vercel Preview deployment for dev testing. Production should only come from main.

When starting:
1. Confirm you are on dev and have updated dev from GitHub.
2. Briefly summarize the project state after reading README.md, PROJECT_CONTEXT.md, and CHANGELOG.md.
3. State what you will check or implement first.
6. When done, report changed files, verification run, and any remaining risk.
7. CURRENT PENDING TASKS TO IMPLEMENT:
   - **Insight Scenarios Wording Review (High Priority)**: Currently reviewing and expanding the 72 insight scenarios in [ANALYSIS_INSIGHTS_RULES.md](file:///d:/Pickleball%20App/docs/ANALYSIS_INSIGHTS_RULES.md).
     - **Progress**: Reviewed and committed approved trigger adjustments and 5 copy variants for **Scenarios 1 to 37**.
     - **Next Step**: Resume the review starting from **Scenario 38 (`target_dummy` - Kỵ rơ đối đầu)**.
     - **Workflow**: Present 2 scenarios at a time. Explain the trigger logic in plain Vietnamese first, present 5 natural copy variants, obtain user approval in chat, update the "Điều chỉnh" column of `ANALYSIS_INSIGHTS_RULES.md`, and then proceed. (Do not edit `insights.ts` until all 72 are approved).
   - **Shared Data Cache Validation**: Test local-first Dashboard/Analysis cache.
   - **Merge & Deploy**: Merge `dev` to `main` when features are validated.
```
