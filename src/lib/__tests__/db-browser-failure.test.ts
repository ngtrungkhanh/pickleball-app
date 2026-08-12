import { afterEach, describe, expect, it, vi } from 'vitest';

type MutableOpenRequest = {
  result: IDBDatabase;
  error: DOMException | null;
  onupgradeneeded: ((event: IDBVersionChangeEvent) => void) | null;
  onblocked: ((event: IDBVersionChangeEvent) => void) | null;
  onsuccess: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
};

function makeOpenRequest(database: IDBDatabase) {
  return {
    result: database,
    error: null,
    onupgradeneeded: null,
    onblocked: null,
    onsuccess: null,
    onerror: null,
  } satisfies MutableOpenRequest;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('IndexedDB browser failure handling', () => {
  it('rejects immediately when Chrome reports a blocked database upgrade', async () => {
    const database = { close: vi.fn() } as unknown as IDBDatabase;
    const request = makeOpenRequest(database);
    vi.stubGlobal('indexedDB', { open: vi.fn(() => request) });

    const { AppCacheUnavailableError, openDB } = await import('../db');
    const opening = openDB();
    (request.onblocked as ((event: IDBVersionChangeEvent) => void) | null)?.({} as IDBVersionChangeEvent);

    await expect(opening).rejects.toBeInstanceOf(AppCacheUnavailableError);
  });

  it('times out instead of waiting forever when Chrome never settles the open request', async () => {
    vi.useFakeTimers();
    const database = { close: vi.fn() } as unknown as IDBDatabase;
    const request = makeOpenRequest(database);
    vi.stubGlobal('indexedDB', { open: vi.fn(() => request) });

    const { AppCacheUnavailableError, openDB } = await import('../db');
    const opening = expect(openDB()).rejects.toBeInstanceOf(AppCacheUnavailableError);
    await vi.advanceTimersByTimeAsync(5_000);

    await opening;
  });

  it('closes an old connection when a newer database version is requested', async () => {
    const close = vi.fn();
    const database = { close, onclose: null, onversionchange: null } as unknown as IDBDatabase;
    const request = makeOpenRequest(database);
    vi.stubGlobal('indexedDB', { open: vi.fn(() => request) });

    const { openDB } = await import('../db');
    const opening = openDB();
    (request.onsuccess as ((event: Event) => void) | null)?.({} as Event);
    await expect(opening).resolves.toBe(database);

    database.onversionchange?.({} as IDBVersionChangeEvent);
    expect(close).toHaveBeenCalledOnce();
  });
});
