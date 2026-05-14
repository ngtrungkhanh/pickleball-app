/**
 * IndexedDB utility for the Pickleball app.
 * Postgres is authoritative; IndexedDB is a route-to-route cache.
 */

const DB_NAME = 'PickleballDB';
const DB_VERSION = 2;

const STORES = {
  matches: 'matches',
  players: 'players',
  seasons: 'seasons',
  config: 'config',
  syncMeta: 'sync_meta',
} as const;

export type StoredMatch = {
  id?: string;
  date?: string | Date | null;
  season?: string | null;
  [key: string]: unknown;
};

export type StoredPlayer = {
  id?: string;
  name?: string;
  active?: boolean;
  [key: string]: unknown;
};

export type StoredSeason = {
  id?: string;
  name: string;
  active?: boolean;
  start_date?: string;
  [key: string]: unknown;
};

type ConfigEntry = {
  key: string;
  value: string;
};

type MetaEntry = {
  key: string;
  value: unknown;
};

export type AppCacheInput = {
  players?: StoredPlayer[];
  matches?: StoredMatch[];
  seasons?: StoredSeason[];
  config?: Record<string, string>;
  dataVersion?: number;
  manifestCheckedAt?: number;
};

export type AppCacheSnapshot = {
  players: StoredPlayer[];
  matches: StoredMatch[];
  seasons: StoredSeason[];
  config: Record<string, string>;
  dataVersion: number;
  lastManifestCheck: number;
};

function sortMatchesNewestFirst(matches: StoredMatch[]) {
  return [...matches].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
}

function uniqueMatches(matches: StoredMatch[]) {
  const byId = new Map<string, StoredMatch>();
  matches.forEach((match, index) => {
    byId.set(match.id || `missing-id-${index}`, match);
  });
  return sortMatchesNewestFirst(Array.from(byId.values()));
}

function configToEntries(config: Record<string, string>): ConfigEntry[] {
  return Object.entries(config).map(([key, value]) => ({ key, value: String(value) }));
}

function entriesToConfig(entries: ConfigEntry[]) {
  const config: Record<string, string> = {};
  entries.forEach((entry) => {
    config[String(entry.key)] = String(entry.value);
  });
  return config;
}

function emitCacheChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('pickleball-cache-change'));
  }
}

export async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.matches)) {
        db.createObjectStore(STORES.matches, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.players)) {
        db.createObjectStore(STORES.players, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.seasons)) {
        db.createObjectStore(STORES.seasons, { keyPath: 'name' });
      }
      if (!db.objectStoreNames.contains(STORES.config)) {
        db.createObjectStore(STORES.config, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.syncMeta)) {
        db.createObjectStore(STORES.syncMeta, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function replaceStore<T extends Record<string, unknown>>(storeName: string, records: T[]) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  store.clear();
  records.forEach((record) => store.put(record));
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function putStore<T extends Record<string, unknown>>(storeName: string, records: T[]) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  records.forEach((record) => store.put(record));
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllFromStore<T>(storeName: string): Promise<T[]> {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  const request = store.getAll();
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve((request.result || []) as T[]);
    request.onerror = () => reject(request.error);
  });
}

async function setMetaValue(key: string, value: unknown) {
  await putStore<MetaEntry>(STORES.syncMeta, [{ key, value }]);
}

async function getMetaValue<T>(key: string, fallback: T): Promise<T> {
  const db = await openDB();
  const tx = db.transaction(STORES.syncMeta, 'readonly');
  const store = tx.objectStore(STORES.syncMeta);
  const request = store.get(key);
  return new Promise((resolve) => {
    request.onsuccess = () => {
      const entry = request.result as MetaEntry | undefined;
      resolve((entry?.value as T | undefined) ?? fallback);
    };
    request.onerror = () => resolve(fallback);
  });
}

export async function saveMatchesLocal(matches: StoredMatch[]) {
  await putStore(STORES.matches, matches);
  emitCacheChange();
}

export async function replaceMatchesLocal(matches: StoredMatch[]) {
  await replaceStore(STORES.matches, uniqueMatches(matches));
  emitCacheChange();
}

export async function removeMatchesLocal(matchIds: string[]) {
  if (matchIds.length === 0) return;
  const db = await openDB();
  const tx = db.transaction(STORES.matches, 'readwrite');
  const store = tx.objectStore(STORES.matches);
  matchIds.forEach((id) => store.delete(id));
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
  emitCacheChange();
}

export async function replaceOptimisticMatchLocal(tempId: string, match: StoredMatch, dataVersion?: number) {
  const db = await openDB();
  const tx = db.transaction([STORES.matches, STORES.syncMeta], 'readwrite');
  const matchStore = tx.objectStore(STORES.matches);
  if (tempId) matchStore.delete(tempId);
  matchStore.put(match);
  if (typeof dataVersion === 'number') {
    tx.objectStore(STORES.syncMeta).put({ key: 'dataVersion', value: dataVersion });
  }
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
  emitCacheChange();
}

export async function getLocalMatches(): Promise<StoredMatch[]> {
  const matches = await getAllFromStore<StoredMatch>(STORES.matches);
  return sortMatchesNewestFirst(matches);
}

export async function getLastMatchId(): Promise<string | null> {
  const matches = await getLocalMatches();
  return matches.length > 0 ? matches[0].id || null : null;
}

export async function seedAppCache(input: AppCacheInput) {
  const writes: Array<Promise<unknown>> = [];
  if (input.matches) writes.push(replaceMatchesLocal(input.matches));
  if (input.players) writes.push(replaceStore(STORES.players, input.players));
  if (input.seasons) writes.push(replaceStore(STORES.seasons, input.seasons));
  if (input.config) writes.push(replaceStore(STORES.config, configToEntries(input.config)));
  if (typeof input.dataVersion === 'number') {
    writes.push(setMetaValue('dataVersion', input.dataVersion));
  }
  if (typeof input.manifestCheckedAt === 'number') {
    writes.push(setMetaValue('lastManifestCheck', input.manifestCheckedAt));
  }
  await Promise.all(writes);
  emitCacheChange();
}

export async function getAppCacheSnapshot(): Promise<AppCacheSnapshot> {
  const [players, matches, seasons, configEntries, dataVersion, lastManifestCheck] = await Promise.all([
    getAllFromStore<StoredPlayer>(STORES.players),
    getLocalMatches(),
    getAllFromStore<StoredSeason>(STORES.seasons),
    getAllFromStore<ConfigEntry>(STORES.config),
    getMetaValue<number>('dataVersion', 0),
    getMetaValue<number>('lastManifestCheck', 0),
  ]);

  return {
    players,
    matches,
    seasons,
    config: entriesToConfig(configEntries),
    dataVersion,
    lastManifestCheck,
  };
}

export async function getLocalMatchSummary() {
  const matches = await getLocalMatches();
  return {
    count: matches.length,
    latestDate: matches[0]?.date ? String(matches[0].date) : null,
    oldestDate: matches[matches.length - 1]?.date ? String(matches[matches.length - 1].date) : null,
  };
}

export async function markManifestChecked(dataVersion: number) {
  await Promise.all([
    setMetaValue('dataVersion', dataVersion),
    setMetaValue('lastManifestCheck', Date.now()),
  ]);
}
