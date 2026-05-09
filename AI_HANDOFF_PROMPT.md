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

Recent behavior updates to remember:
- Match save now requires 4 selected players (no empty slot).
- Duplicate match guard uses team-based key (winner team > loser team), not sorted 4-player set.
- If duplicate is detected in 15 minutes, UI asks for confirmation; server also re-checks and only accepts duplicate when `duplicate_confirmed=true`.
- Admin has an `Import XLSX` button that uploads a local `.xlsx` file and replaces match history from sheet `MATCHES`.
- XLSX import now auto-creates missing player IDs before inserting matches to avoid FK errors.
- Dashboard expanded form/partner/rival/easy insights use seeded data-driven logic in `src/lib/stats.ts`; labels must stay short and directly understandable.
- `/analysis` is read-only, preloads up to 500 matches, uses IndexedDB cache/sync, and still has a Trend placeholder. Read the Analysis Center sections in `docs/FEATURE_SPEC.md`, `docs/DATA_FLOW.md`, and `docs/UI_RULES.md` before extending it.

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
4. When done, report changed files, verification run, and any remaining risk.
```
