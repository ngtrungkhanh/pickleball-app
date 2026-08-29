import { describe, expect, it } from 'vitest';
import {
  PENDING_MATCH_DELETE_KEY,
  PENDING_MATCH_KEY,
  readPendingMatchDeletes,
  readPendingMatchSaves,
  recoverPendingMatchSavesFromLocal,
  removePendingMatchForTempId,
  upsertPendingMatchDelete,
  upsertPendingMatchSave,
} from '../pending-match-sync';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    raw: values,
  };
}

describe('pending match sync queue', () => {
  it('keeps every pending save without the old 12-item cap or 60-minute expiry', () => {
    const storage = memoryStorage();
    for (let index = 0; index < 20; index += 1) {
      upsertPendingMatchSave({
        client_request_id: `SAVE-${index}`,
        temp_id: `TMP-SAVE-${index}`,
        win_score: 11,
        lose_score: 0,
      }, { timestamp: Date.now() - 48 * 60 * 60_000 }, storage);
    }

    const pending = readPendingMatchSaves(storage);
    expect(pending).toHaveLength(20);
    expect(pending[0].timestamp).toBeLessThan(Date.now() - 24 * 60 * 60_000);
    expect(storage.raw.has(PENDING_MATCH_KEY)).toBe(true);
  });

  it('recovers an orphaned TMP match from IndexedDB data and can discard it by temp id', () => {
    const storage = memoryStorage();
    const tempId = 'TMP-SAVE-OFFLINE-1';
    const recovered = recoverPendingMatchSavesFromLocal([{
      id: tempId,
      date: '2026-08-27T14:56:23.222Z',
      win_1: 'P001',
      win_2: 'P002',
      lose_1: 'P003',
      lose_2: 'P004',
      win_score: 12,
      lose_score: 10,
      season: 'Season 5',
      client_request_id: 'SAVE-OFFLINE-1',
      pending: true,
      sync_status: 'error',
      sync_error: 'Failed to fetch',
    }], storage);

    expect(recovered).toHaveLength(1);
    expect(recovered[0].match.played_at).toBe('2026-08-27T14:56:23.222Z');
    expect(recovered[0].match.pending_retry).toBe('true');

    removePendingMatchForTempId(tempId, storage);
    expect(readPendingMatchSaves(storage)).toEqual([]);
  });

  it('stores a durable tombstone for a local-first delete', () => {
    const storage = memoryStorage();
    upsertPendingMatchDelete('M123', storage);

    expect(readPendingMatchDeletes(storage)).toEqual([
      expect.objectContaining({ requestId: 'DELETE-M123', matchId: 'M123', attemptCount: 0 }),
    ]);
    expect(storage.raw.has(PENDING_MATCH_DELETE_KEY)).toBe(true);
  });
});
