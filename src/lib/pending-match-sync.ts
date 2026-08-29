import type { StoredMatch } from './db';

export const PENDING_MATCH_KEY = 'pickleball_pending_match';
export const PENDING_MATCH_DELETE_KEY = 'pickleball_pending_match_deletes';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type PendingMatchSaveStatus = 'pending' | 'syncing' | 'error' | 'conflict';

export type PendingMatchSave = {
  requestId: string;
  match: Record<string, unknown>;
  timestamp: number;
  status?: PendingMatchSaveStatus;
  attemptCount?: number;
  lastError?: string;
  duplicateMatch?: Record<string, unknown>;
};

export type PendingMatchDelete = {
  requestId: string;
  matchId: string;
  timestamp: number;
  attemptCount: number;
  lastError?: string;
};

function browserStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function writeList(key: string, value: unknown[], storage?: StorageLike) {
  const target = browserStorage(storage);
  if (!target) return false;
  try {
    if (value.length === 0) target.removeItem(key);
    else target.setItem(key, JSON.stringify({ matches: value }));
    return true;
  } catch {
    return false;
  }
}

export function readPendingMatchSaves(storage?: StorageLike): PendingMatchSave[] {
  const target = browserStorage(storage);
  if (!target) return [];
  try {
    const raw = target.getItem(PENDING_MATCH_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as {
      matches?: PendingMatchSave[];
      match?: Record<string, unknown>;
      timestamp?: number;
    };
    if (Array.isArray(parsed?.matches)) {
      return parsed.matches.filter(item => Boolean(item?.requestId && item.match));
    }
    if (parsed?.match) {
      const requestId = String(
        parsed.match.client_request_id
        || parsed.match.temp_id
        || `LEGACY-${parsed.timestamp || Date.now()}`,
      );
      return [{ requestId, match: parsed.match, timestamp: parsed.timestamp || Date.now(), status: 'pending' }];
    }
  } catch {}
  return [];
}

export function writePendingMatchSaves(matches: PendingMatchSave[], storage?: StorageLike) {
  return writeList(PENDING_MATCH_KEY, matches, storage);
}

export function upsertPendingMatchSave(
  data: Record<string, unknown>,
  patch: Partial<Omit<PendingMatchSave, 'requestId' | 'match'>> = {},
  storage?: StorageLike,
) {
  const requestId = String(data.client_request_id || data.temp_id || '');
  if (!requestId) return false;
  const previous = readPendingMatchSaves(storage).find(item => item.requestId === requestId);
  const next = readPendingMatchSaves(storage).filter(item => item.requestId !== requestId);
  next.push({
    ...previous,
    requestId,
    match: data,
    timestamp: previous?.timestamp || Date.now(),
    status: previous?.status || 'pending',
    attemptCount: previous?.attemptCount || 0,
    ...patch,
  });
  return writePendingMatchSaves(next, storage);
}

export function patchPendingMatchSave(
  requestId: string,
  patch: Partial<Omit<PendingMatchSave, 'requestId'>>,
  storage?: StorageLike,
) {
  const next = readPendingMatchSaves(storage).map(item => (
    item.requestId === requestId ? { ...item, ...patch } : item
  ));
  return writePendingMatchSaves(next, storage);
}

export function removePendingMatchSave(requestId?: string, storage?: StorageLike) {
  if (!requestId) return writePendingMatchSaves([], storage);
  return writePendingMatchSaves(
    readPendingMatchSaves(storage).filter(item => item.requestId !== requestId),
    storage,
  );
}

export function isTemporaryMatch(match: Pick<StoredMatch, 'id'>) {
  return String(match.id || '').startsWith('TMP-');
}

export function recoverPendingMatchSavesFromLocal(
  matches: StoredMatch[],
  storage?: StorageLike,
) {
  const existing = readPendingMatchSaves(storage);
  const byRequestId = new Map(existing.map(item => [item.requestId, item]));

  matches.filter(isTemporaryMatch).forEach((match) => {
    const requestId = String(match.client_request_id || String(match.id || '').replace(/^TMP-/, ''));
    if (!requestId || byRequestId.has(requestId)) return;
    byRequestId.set(requestId, {
      requestId,
      timestamp: Number(match.local_created_at || Date.parse(String(match.date || ''))) || Date.now(),
      status: match.sync_status === 'error' ? 'error' : 'pending',
      attemptCount: 0,
      lastError: match.sync_error ? String(match.sync_error) : undefined,
      match: {
        win_1: match.win_1,
        win_2: match.win_2,
        lose_1: match.lose_1,
        lose_2: match.lose_2,
        win_score: match.win_score,
        lose_score: match.lose_score,
        season: match.season,
        created_by: match.created_by,
        temp_id: match.id,
        client_request_id: requestId,
        played_at: match.date,
        pending_retry: 'true',
      },
    });
  });

  const recovered = Array.from(byRequestId.values());
  writePendingMatchSaves(recovered, storage);
  return recovered;
}

export function removePendingMatchForTempId(tempId: string, storage?: StorageLike) {
  const requestId = tempId.replace(/^TMP-/, '');
  return removePendingMatchSave(requestId, storage);
}

export function readPendingMatchDeletes(storage?: StorageLike): PendingMatchDelete[] {
  const target = browserStorage(storage);
  if (!target) return [];
  try {
    const raw = target.getItem(PENDING_MATCH_DELETE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { matches?: PendingMatchDelete[] };
    return Array.isArray(parsed.matches)
      ? parsed.matches.filter(item => Boolean(item?.requestId && item.matchId))
      : [];
  } catch {
    return [];
  }
}

export function writePendingMatchDeletes(matches: PendingMatchDelete[], storage?: StorageLike) {
  return writeList(PENDING_MATCH_DELETE_KEY, matches, storage);
}

export function upsertPendingMatchDelete(matchId: string, storage?: StorageLike) {
  const previous = readPendingMatchDeletes(storage).find(item => item.matchId === matchId);
  const next = readPendingMatchDeletes(storage).filter(item => item.matchId !== matchId);
  next.push(previous || {
    requestId: `DELETE-${matchId}`,
    matchId,
    timestamp: Date.now(),
    attemptCount: 0,
  });
  writePendingMatchDeletes(next, storage);
  return next[next.length - 1];
}

export function patchPendingMatchDelete(
  matchId: string,
  patch: Partial<Omit<PendingMatchDelete, 'matchId' | 'requestId'>>,
  storage?: StorageLike,
) {
  const next = readPendingMatchDeletes(storage).map(item => (
    item.matchId === matchId ? { ...item, ...patch } : item
  ));
  return writePendingMatchDeletes(next, storage);
}

export function removePendingMatchDelete(matchId: string, storage?: StorageLike) {
  return writePendingMatchDeletes(
    readPendingMatchDeletes(storage).filter(item => item.matchId !== matchId),
    storage,
  );
}
