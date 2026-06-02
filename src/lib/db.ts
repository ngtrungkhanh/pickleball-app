/**
 * IndexedDB utility for the Pickleball app.
 * Postgres is authoritative; IndexedDB is a route-to-route cache.
 */

const DB_NAME = 'PickleballDB';
const DB_VERSION = 4;

const STORES = {
  matches: 'matches',
  players: 'players',
  seasons: 'seasons',
  hallImages: 'hall_images',
  config: 'config',
  syncMeta: 'sync_meta',
  playerSeasonSettings: 'player_season_settings',
} as const;

export const APP_CACHE_PARTS = [
  'matches',
  'players',
  'seasons',
  'config',
  'playerSeasonSettings',
  'admin',
] as const;

export type AppCachePart = typeof APP_CACHE_PARTS[number];
export type AppCachePartVersions = Record<AppCachePart, number>;

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
  lose_money?: number;
  [key: string]: unknown;
};

export type StoredPlayerSeasonSetting = {
  id: string; // `${player_id}_${season}`
  player_id: string;
  season: string;
  active: boolean;
  pay_fine: boolean;
  hidden: boolean;
};

export type StoredHallImage = {
  season: string;
  imagePath: string;
  imageUpdatedAt: string;
  blob: Blob;
  cachedAt: number;
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
  playerSeasonSettings?: StoredPlayerSeasonSetting[];
  dataVersion?: number;
  partVersions?: Partial<AppCachePartVersions>;
  manifestCheckedAt?: number;
};

export type AppCacheSnapshot = {
  players: StoredPlayer[];
  matches: StoredMatch[];
  seasons: StoredSeason[];
  config: Record<string, string>;
  playerSeasonSettings: StoredPlayerSeasonSetting[];
  dataVersion: number;
  partVersions: AppCachePartVersions;
  lastManifestCheck: number;
};

export type AppCachePartsInput = Pick<AppCacheInput, 'players' | 'matches' | 'seasons' | 'config' | 'playerSeasonSettings'>;

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

function emptyPartVersions(): AppCachePartVersions {
  return {
    matches: 0,
    players: 0,
    seasons: 0,
    config: 0,
    playerSeasonSettings: 0,
    admin: 0,
  };
}

function normalizePartVersions(input: unknown, fallbackVersion = 0): AppCachePartVersions {
  const versions = emptyPartVersions();
  APP_CACHE_PARTS.forEach((part) => {
    const value = typeof input === 'object' && input !== null
      ? Number((input as Record<string, unknown>)[part] || 0)
      : 0;
    versions[part] = value || fallbackVersion || 0;
  });
  return versions;
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
      if (!db.objectStoreNames.contains(STORES.hallImages)) {
        db.createObjectStore(STORES.hallImages, { keyPath: 'season' });
      }
      if (!db.objectStoreNames.contains(STORES.config)) {
        db.createObjectStore(STORES.config, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.syncMeta)) {
        db.createObjectStore(STORES.syncMeta, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.playerSeasonSettings)) {
        db.createObjectStore(STORES.playerSeasonSettings, { keyPath: 'id' });
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

export async function replaceOptimisticMatchLocal(tempId: string, match: StoredMatch, dataVersion?: number, partVersions?: Partial<AppCachePartVersions>) {
  const db = await openDB();
  const tx = db.transaction([STORES.matches, STORES.syncMeta], 'readwrite');
  const matchStore = tx.objectStore(STORES.matches);
  if (tempId) matchStore.delete(tempId);
  matchStore.put(match);
  if (typeof dataVersion === 'number') {
    tx.objectStore(STORES.syncMeta).put({ key: 'dataVersion', value: dataVersion });
    tx.objectStore(STORES.syncMeta).put({ key: 'partVersions', value: normalizePartVersions(partVersions || { matches: dataVersion }, 0) });
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
  if (input.playerSeasonSettings) writes.push(replaceStore(STORES.playerSeasonSettings, input.playerSeasonSettings));
  if (typeof input.dataVersion === 'number') {
    writes.push(setMetaValue('dataVersion', input.dataVersion));
  }
  if (input.partVersions) {
    writes.push(setMetaValue('partVersions', normalizePartVersions(input.partVersions, input.dataVersion || 0)));
  } else if (typeof input.dataVersion === 'number') {
    writes.push(setMetaValue('partVersions', normalizePartVersions(null, input.dataVersion)));
  }
  if (typeof input.manifestCheckedAt === 'number') {
    writes.push(setMetaValue('lastManifestCheck', input.manifestCheckedAt));
  }
  await Promise.all(writes);
  emitCacheChange();
}

export async function replaceAppCacheParts(input: AppCachePartsInput, meta?: {
  dataVersion?: number;
  partVersions?: Partial<AppCachePartVersions>;
  manifestCheckedAt?: number;
}) {
  await seedAppCache({
    ...input,
    dataVersion: meta?.dataVersion,
    partVersions: meta?.partVersions,
    manifestCheckedAt: meta?.manifestCheckedAt,
  });
}

export async function getAppCacheSnapshot(): Promise<AppCacheSnapshot> {
  const [players, matches, seasons, configEntries, playerSeasonSettings, dataVersion, rawPartVersions, lastManifestCheck] = await Promise.all([
    getAllFromStore<StoredPlayer>(STORES.players),
    getLocalMatches(),
    getAllFromStore<StoredSeason>(STORES.seasons),
    getAllFromStore<ConfigEntry>(STORES.config),
    getAllFromStore<StoredPlayerSeasonSetting>(STORES.playerSeasonSettings),
    getMetaValue<number>('dataVersion', 0),
    getMetaValue<unknown>('partVersions', null),
    getMetaValue<number>('lastManifestCheck', 0),
  ]);

  const partVersions = normalizePartVersions(rawPartVersions, dataVersion);

  return {
    players,
    matches,
    seasons,
    config: entriesToConfig(configEntries),
    playerSeasonSettings,
    dataVersion,
    partVersions,
    lastManifestCheck,
  };
}

export function hasUsableAppCache(snapshot: AppCacheSnapshot) {
  return snapshot.players.length > 0
    && snapshot.matches.length > 0
    && Object.keys(snapshot.config).length > 0
    && snapshot.seasons.length > 0;
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

export async function getHallImageLocal(season: string): Promise<StoredHallImage | null> {
  const db = await openDB();
  const tx = db.transaction(STORES.hallImages, 'readonly');
  const store = tx.objectStore(STORES.hallImages);
  const request = store.get(season);
  return new Promise((resolve) => {
    request.onsuccess = () => resolve((request.result as StoredHallImage | undefined) || null);
    request.onerror = () => resolve(null);
  });
}

export async function saveHallImageLocal(record: StoredHallImage) {
  await putStore<StoredHallImage>(STORES.hallImages, [record]);
}

export async function removeHallImageLocal(season: string) {
  const db = await openDB();
  const tx = db.transaction(STORES.hallImages, 'readwrite');
  const store = tx.objectStore(STORES.hallImages);
  store.delete(season);
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}
