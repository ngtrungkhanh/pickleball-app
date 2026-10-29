import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, [
  'scripts/run-resource-guard.mjs', 'test', 'src/lib/__tests__/loc-bot-arena.test.ts',
], { stdio: 'inherit', env: { ...process.env, LOC_BOT_ARENA: '1' } });
process.exit(result.status ?? 1);
