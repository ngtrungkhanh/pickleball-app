import { createHash } from 'node:crypto';
import { open, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const mode = process.argv[2];
const forwardedArgs = process.argv.slice(3);
const root = process.cwd();

const commands = {
  test: {
    entry: path.join(root, 'node_modules', 'vitest', 'vitest.mjs'),
    args: ['run', ...forwardedArgs],
    memoryMb: 384,
    timeoutMs: 5 * 60 * 1000,
    totalNodePrivateLimitMb: 640,
    hostGuard: {
      startAvailableMb: 1536,
      startCommitHeadroomMb: 2048,
      runtimeAvailableMb: 1024,
      runtimeCommitHeadroomMb: 1536,
    },
  },
  'test:watch': {
    entry: path.join(root, 'node_modules', 'vitest', 'vitest.mjs'),
    args: [...forwardedArgs],
    memoryMb: 384,
    timeoutMs: null,
    totalNodePrivateLimitMb: 640,
    hostGuard: {
      startAvailableMb: 1536,
      startCommitHeadroomMb: 2048,
      runtimeAvailableMb: 1024,
      runtimeCommitHeadroomMb: 1536,
    },
  },
  build: {
    entry: path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'),
    args: ['build', '--webpack', ...forwardedArgs],
    memoryMb: 1024,
    timeoutMs: 2 * 60 * 1000,
    totalNodePrivateLimitMb: 1800,
    hostGuard: {
      startAvailableMb: 4096,
      startCommitHeadroomMb: 4096,
      runtimeAvailableMb: 2048,
      runtimeCommitHeadroomMb: 2560,
    },
  },
};

const command = commands[mode];
if (!command) {
  console.error(`Chế độ không hợp lệ: ${mode || '(trống)'}`);
  process.exit(2);
}

const lockId = createHash('sha256').update(path.resolve(root).toLowerCase()).digest('hex').slice(0, 16);
const lockPath = path.join(tmpdir(), `pickleball-resource-${lockId}.lock`);

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

async function acquireLock() {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockPath, 'wx');
      await handle.writeFile(JSON.stringify({ pid: process.pid, mode, startedAt: new Date().toISOString() }));
      await handle.close();
      return;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;

      let current = null;
      try {
        current = JSON.parse(await readFile(lockPath, 'utf8'));
      } catch {
        // Lock hỏng được xem như lock cũ và sẽ bị thay thế.
      }

      if (current && isProcessAlive(Number(current.pid))) {
        console.error(
          `Đã có tác vụ nặng "${current.mode}" chạy (PID ${current.pid}, từ ${current.startedAt}). `
          + `Không khởi động "${mode}" đồng thời.`
        );
        process.exit(3);
      }

      await unlink(lockPath).catch(() => {});
    }
  }

  throw new Error('Không thể tạo khóa tài nguyên sau khi dọn lock cũ.');
}

function withMemoryLimit(existing, memoryMb) {
  const cleaned = String(existing || '')
    .replace(/--max-old-space-size(?:=|\s+)\d+/g, '')
    .trim();
  return [cleaned, `--max-old-space-size=${memoryMb}`].filter(Boolean).join(' ');
}

function readWindowsHostMemory() {
  if (process.platform !== 'win32') return null;

  const script = [
    '$ErrorActionPreference = "Stop"',
    '$os = Get-CimInstance Win32_OperatingSystem',
    'Write-Output "$($os.FreePhysicalMemory)|$($os.FreeVirtualMemory)"',
  ].join('\n');
  const result = spawnSync(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', windowsHide: true, timeout: 10_000 }
  );

  if (result.status !== 0 || !result.stdout) return null;
  const [availableKb, commitHeadroomKb] = result.stdout.trim().split('|').map(Number);
  if (!Number.isFinite(availableKb) || !Number.isFinite(commitHeadroomKb)) return null;

  return {
    availableMb: Math.round(availableKb / 1024),
    commitHeadroomMb: Math.round(commitHeadroomKb / 1024),
  };
}

function assertWindowsHostCapacity(hostGuard) {
  if (process.platform !== 'win32' || !hostGuard) return;

  const memory = readWindowsHostMemory();
  if (!memory) {
    console.warn('Không đọc được áp lực bộ nhớ Windows; tiếp tục với watchdog runtime.');
    return;
  }

  if (
    memory.availableMb < hostGuard.startAvailableMb
    || memory.commitHeadroomMb < hostGuard.startCommitHeadroomMb
  ) {
    console.error(
      `Không khởi động "${mode}": Windows chỉ còn ${memory.availableMb} MB RAM khả dụng `
      + `và ${memory.commitHeadroomMb} MB commit headroom. `
      + `Cần tối thiểu ${hostGuard.startAvailableMb}/${hostGuard.startCommitHeadroomMb} MB.`
    );
    process.exit(4);
  }
}

assertWindowsHostCapacity(command.hostGuard);
await acquireLock();

let child;
let memoryWatchdog;
let timedOut = false;
let memoryExceeded = false;
let hostPressureExceeded = false;

function stopChildTree(signal = 'SIGTERM') {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } else {
    child.kill(signal);
  }
}

function startWindowsMemoryWatchdog(limitMb, rootPid, hostGuard) {
  if (process.platform !== 'win32' || !limitMb || !rootPid) return null;

  const limitBytes = limitMb * 1024 * 1024;
  const availableLimitKb = (hostGuard?.runtimeAvailableMb || 0) * 1024;
  const commitHeadroomLimitKb = (hostGuard?.runtimeCommitHeadroomMb || 0) * 1024;
  const script = [
    '$ErrorActionPreference = "SilentlyContinue"',
    `$limit = ${limitBytes}`,
    `$rootProcessId = ${rootPid}`,
    'while ($true) {',
    "  $nodes = @(Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Select-Object ProcessId, ParentProcessId, PrivatePageCount)",
    '  $ids = [System.Collections.Generic.HashSet[int]]::new()',
    '  [void]$ids.Add([int]$rootProcessId)',
    '  do {',
    '    $added = $false',
    '    foreach ($node in $nodes) {',
    '      if ($ids.Contains([int]$node.ParentProcessId) -and $ids.Add([int]$node.ProcessId)) { $added = $true }',
    '    }',
    '  } while ($added)',
    '  [long]$total = 0',
    '  foreach ($node in $nodes) {',
    '    if ($ids.Contains([int]$node.ProcessId)) { $total += [long]$node.PrivatePageCount }',
    '  }',
    '  if ($total -gt $limit) { exit 42 }',
    '  $os = Get-CimInstance Win32_OperatingSystem',
    `  if ([long]$os.FreePhysicalMemory -lt ${availableLimitKb}) { exit 43 }`,
    `  if ([long]$os.FreeVirtualMemory -lt ${commitHeadroomLimitKb}) { exit 44 }`,
    '  Start-Sleep -Milliseconds 500',
    '}',
  ].join('\n');

  return spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    stdio: 'ignore',
    windowsHide: true,
  });
}

process.once('SIGINT', () => stopChildTree('SIGINT'));
process.once('SIGTERM', () => stopChildTree('SIGTERM'));

try {
  child = spawn(process.execPath, [command.entry, ...command.args], {
    cwd: root,
    env: {
      ...process.env,
      NODE_OPTIONS: withMemoryLimit(process.env.NODE_OPTIONS, command.memoryMb),
    },
    stdio: 'inherit',
    windowsHide: true,
  });

  memoryWatchdog = startWindowsMemoryWatchdog(
    command.totalNodePrivateLimitMb,
    child.pid,
    command.hostGuard
  );
  memoryWatchdog?.once('exit', code => {
    if (![42, 43, 44].includes(code) || !child || child.exitCode !== null) return;
    if (code === 42) {
      memoryExceeded = true;
      console.error(
        `Tổng private memory của các tiến trình Node vượt ${command.totalNodePrivateLimitMb} MB; `
        + `tác vụ "${mode}" đã bị dừng để bảo vệ hệ thống.`
      );
    } else {
      hostPressureExceeded = true;
      const reason = code === 43 ? 'RAM vật lý khả dụng xuống thấp' : 'commit headroom xuống thấp';
      console.error(`Windows ${reason}; tác vụ "${mode}" đã bị dừng sớm trước khi máy bắt đầu paging nặng.`);
    }
    stopChildTree();
  });

  const timeout = command.timeoutMs
    ? setTimeout(() => {
      timedOut = true;
      console.error(`Tác vụ "${mode}" vượt quá ${Math.round(command.timeoutMs / 60000)} phút và đã bị dừng.`);
      stopChildTree();
    }, command.timeoutMs)
    : null;

  const result = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });

  if (timeout) clearTimeout(timeout);
  if (memoryWatchdog?.exitCode === null) memoryWatchdog.kill();

  if (memoryExceeded) {
    process.exitCode = 125;
  } else if (hostPressureExceeded) {
    process.exitCode = 126;
  } else if (timedOut) {
    process.exitCode = 124;
  } else if (result.signal) {
    console.error(`Tác vụ "${mode}" dừng bởi tín hiệu ${result.signal}.`);
    process.exitCode = 1;
  } else {
    process.exitCode = result.code ?? 1;
  }
} finally {
  if (memoryWatchdog?.exitCode === null) memoryWatchdog.kill();
  await unlink(lockPath).catch(() => {});
}
