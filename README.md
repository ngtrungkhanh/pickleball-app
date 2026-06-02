# Pickleball Ranking Dashboard

Production app for `https://conchimnon.vercel.app/`.

Dev preview for branch `dev`:
`https://pickleball-app-git-dev-ngtrungkhanhs-projects.vercel.app/`

Built with Next.js App Router, Tailwind CSS, Vercel Postgres, and Vercel
hosting. The current production source is GitHub `main`.

## Start Here

Read in tiers to save context:

Always read:

1. `README.md`
2. `PROJECT_CONTEXT.md`
3. `CHANGELOG.md`

Read only when relevant:

- `docs/FEATURE_SPEC.md` for product behavior and screen overview
- `docs/DATA_FLOW.md` for database, server actions, cache, and localStorage
- `docs/UI_RULES.md` for layout, wording, and responsive UI rules
- `docs/ANALYSIS_INSIGHTS_RULES.md` for `/analysis` insight rules, triggers,
  copy, and expansion roadmap
- `docs/ANALYSIS_INSIGHTS_SELECTION.md` for `/analysis` insight audit,
  weighting, cooldown/pity, and implementation plan

Avoid reading large legacy files unless the task requires them. Use `rg` first.

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Verification

```bash
npm run build
npx eslint <changed-files>
```

Notes:

- `npm run lint` currently reports older repo-wide lint debt. Prefer targeted
  lint for changed files until that debt is cleaned up.
- Dashboard and Analysis are static shells, so `npm run build` should not need
  to prerender database-backed user pages. Dynamic/admin/API routes still need a
  valid pooled Vercel Postgres connection when exercised locally.

## Deployment

Production is deployed by Vercel from GitHub `main`.

Branch policy:

- `main` is production; do not edit directly.
- `dev` is the shared working branch for all AI agents and machines.
- Use Vercel Preview from `dev` for testing.
- Merge `dev` into `main` only after the user confirms release.

Database policy:

- Production deployments from `main` use the Production database.
- Preview deployments from branch `dev` use a separate dev database.
- Merging `dev` into `main` merges code only; database data does not merge.

Before assuming local code is production-current, compare against Vercel
Deployments:

- Domain: `conchimnon.vercel.app`
- Latest production `main` commit after latest sync: `120e7ce`
- Latest released feature commit after latest sync: `cd2d0f8`

## Repo Layout

- `src/app` - App Router pages, routes, and server actions
- `src/components` - UI components
- `src/lib` - stats, analytics, db, and utility logic
- `legacy` - old Apps Script implementation for reference only
- `sync_excel_to_db.js` - one-off Excel-to-Postgres migration helper
- `docs` - deeper product, data, and UI documentation

## UI Review Order

Every UI change must be checked in this order:

1. Mobile
2. Desktop Full HD
3. 2K
4. 4K
5. Other screen types
