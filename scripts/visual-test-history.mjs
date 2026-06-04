import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';

const require = createRequire(import.meta.url);
const repoRoot = process.cwd();
const routeName = 'history-layout-visual-test';
const routeDir = path.join(repoRoot, 'src', 'app', routeName);
const routeFile = path.join(routeDir, 'page.tsx');
const outputDir = path.join(repoRoot, '.next', 'visual-tests');

function log(message) {
  console.log(`[visual-test:history] ${message}`);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findLatestBackup() {
  const files = await fs.readdir(repoRoot);
  const backups = files
    .filter(name => /^pickleball_backup_\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort();

  if (backups.length === 0) {
    throw new Error('No pickleball_backup_YYYY-MM-DD.json file found in repo root.');
  }

  return path.join(repoRoot, backups[backups.length - 1]);
}

function dateTime(value) {
  return new Date(value || 0).getTime() || 0;
}

function normalizeBackup(raw) {
  const matches = [...(raw.matches || [])]
    .filter(match => !match.deleted_at)
    .sort((a, b) => dateTime(b.date) - dateTime(a.date))
    .slice(0, 40);

  const config = raw.config && typeof raw.config === 'object' ? raw.config : {};
  const seasons = raw.seasons || [];

  return {
    players: raw.players || [],
    matches,
    seasons,
    config: {
      ...config,
      active_season: config.active_season || seasons.find(season => season.active)?.name || seasons[0]?.name || 'Season 1',
    },
    playerSeasonSettings: raw.playerSeasonSettings || [],
  };
}

function jsLiteral(value) {
  return JSON.stringify(value, null, 2).replace(/</g, '\\u003c');
}

async function writeRoute(data, backupName) {
  await fs.mkdir(routeDir, { recursive: true });
  await fs.writeFile(routeFile, `import HistoryClient from '@/components/HistoryClient';
import { RecentHistory } from '@/components/dashboard/RecentHistory';

const players: any[] = ${jsLiteral(data.players)};
const matches: any[] = ${jsLiteral(data.matches)};
const seasons: any[] = ${jsLiteral(data.seasons)};
const config: Record<string, string> = ${jsLiteral(data.config)};
const playerSeasonSettings: any[] = ${jsLiteral(data.playerSeasonSettings)};

export default function HistoryLayoutVisualTestPage() {
  return (
    <div className="mx-auto max-w-[1200px] space-y-10 px-4 py-8">
      <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-xs font-black uppercase tracking-widest text-primary">
        Local visual test data: ${backupName}
      </div>
      <RecentHistory matches={matches} players={players} />
      <HistoryClient
        initialPlayers={players}
        initialMatches={matches}
        initialConfig={config}
        initialSeasons={seasons}
        initialPlayerSeasonSettings={playerSeasonSettings}
      />
    </div>
  );
}
`, 'utf8');
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: false,
      ...options,
    });

    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function findFreePort(startPort) {
  for (let port = startPort; port < startPort + 20; port++) {
    const free = await new Promise(resolve => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close(() => resolve(true));
      });
      server.listen(port, '127.0.0.1');
    });

    if (free) return port;
  }

  throw new Error(`No free port found from ${startPort} to ${startPort + 19}.`);
}

function requestOk(url) {
  return new Promise(resolve => {
    const req = http.get(url, response => {
      response.resume();
      resolve(response.statusCode && response.statusCode >= 200 && response.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(url) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await requestOk(url)) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);

  return candidates.find(candidate => fsSyncExists(candidate));
}

function fsSyncExists(filePath) {
  try {
    return Boolean(filePath) && require('node:fs').existsSync(filePath);
  } catch {
    return false;
  }
}

async function screenshot(browserPath, url, name, size) {
  await fs.mkdir(outputDir, { recursive: true });
  const profileDir = path.join(outputDir, `chrome-profile-${name}`);
  const outputFile = path.join(outputDir, `${name}.png`);

  await fs.rm(profileDir, { recursive: true, force: true });
  await run(browserPath, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    `--window-size=${size}`,
    `--user-data-dir=${profileDir}`,
    `--screenshot=${outputFile}`,
    url,
  ]);

  return outputFile;
}

async function main() {
  const backupPath = await findLatestBackup();
  const backupName = path.basename(backupPath);
  const raw = JSON.parse(await fs.readFile(backupPath, 'utf8'));
  const data = normalizeBackup(raw);

  if (data.matches.length === 0) {
    throw new Error(`${backupName} has no usable matches.`);
  }

  const browserPath = chromePath();
  if (!browserPath) {
    throw new Error('Chrome or Edge was not found. Set CHROME_PATH to a Chromium-compatible browser.');
  }

  log(`using backup ${backupName} (${data.matches.length} newest matches)`);
  await writeRoute(data, backupName);

  let server;
  try {
    const nextBin = require.resolve('next/dist/bin/next');

    log('building production bundle with temporary visual-test route');
    await run(process.execPath, [nextBin, 'build']);

    const port = await findFreePort(3100);
    server = spawn(process.execPath, [nextBin, 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    server.stdout.on('data', chunk => process.stdout.write(chunk));
    server.stderr.on('data', chunk => process.stderr.write(chunk));

    const url = `http://127.0.0.1:${port}/${routeName}`;
    await waitForServer(url);

    const mobile = await screenshot(browserPath, url, 'history-mobile', '390,1200');
    const desktop = await screenshot(browserPath, url, 'history-desktop', '1366,1100');
    log(`screenshots written:\n  ${mobile}\n  ${desktop}`);
  } finally {
    if (server && !server.killed) server.kill();
    await fs.rm(routeDir, { recursive: true, force: true });
    if (await exists(path.join(repoRoot, 'src', 'app', routeName))) {
      throw new Error('Temporary route cleanup failed.');
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
