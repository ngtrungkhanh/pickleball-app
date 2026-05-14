/**
 * IndexedDB Utility for Pickleball App
 * Stores match history locally for instant analysis and quota saving.
 */

const DB_NAME = 'PickleballDB';
const STORE_NAME = 'matches';
const DB_VERSION = 1;

type StoredMatch = {
  id?: string;
  date?: string | Date | null;
  [key: string]: unknown;
};

export async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveMatchesLocal(matches: StoredMatch[]) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  matches.forEach(m => store.put(m));
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve(true);
  });
}

export async function replaceMatchesLocal(matches: StoredMatch[]) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  store.clear();
  matches.forEach(m => store.put(m));
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve(true);
  });
}

export async function getLocalMatches(): Promise<StoredMatch[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const request = store.getAll();
  return new Promise((resolve) => {
    request.onsuccess = () => {
      // Return sorted by date desc
      const sorted = (request.result || []).sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      resolve(sorted);
    };
  });
}

export async function getLastMatchId(): Promise<string | null> {
  const matches = await getLocalMatches();
  return matches.length > 0 ? matches[0].id || null : null;
}
