# Pickleball Ranking Dashboard

Premium dark-mode Pickleball ranking dashboard built with Next.js, Tailwind CSS, and Vercel Postgres.

## Start Here
To save AI quota, read context in tiers.

Always read:
1. `WORKFLOW_LOG.md`
2. `README.md`

Read only when relevant:
- `AI_CONTEXT.md` for architecture, Vercel/ISR, database, or original design rules.
- `DEVELOPMENT_LOG.md` for historical changes, sync/local-first, or legacy decisions.
- `TASK_TODO.md` for backlog and sprint planning.
- `START_NEW_CHAT_PROMPT.md` when starting a fresh assistant chat.

## Development
```bash
npm run dev
```

Open `http://localhost:3000`.

## Verification
```bash
npm run build
npx eslint <changed-files>
```

`npm run lint` may still report older repo-wide lint debt. Prefer targeted lint for changed files until that debt is cleaned up.

## UI Priority
Every UI change must be reviewed in this order:

1. Mobile
2. Desktop Full HD
3. 2K
4. 4K
5. Other screen types
