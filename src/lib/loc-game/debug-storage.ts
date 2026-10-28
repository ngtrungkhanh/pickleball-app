import { RoundDebugLog } from './debug-types';

const DB_NAME = 'LocGameDebugDB';
const DB_VERSION = 1;
const STORE_NAME = 'debug_rounds';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not supported'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('roomId', 'roomId', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Lưu 1 ván đấu debug log vào IndexedDB của máy Host
 */
export async function saveRoundDebugLog(log: RoundDebugLog): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.put(log);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (error) {
    console.warn('Could not save debug log to IndexedDB, falling back to sessionStorage:', error);
    try {
      const key = `loc_debug_${log.roomId}`;
      const existing = JSON.parse(sessionStorage.getItem(key) || '[]');
      existing.push(log);
      sessionStorage.setItem(key, JSON.stringify(existing));
    } catch (e) {
      console.error('Debug log fallback failed:', e);
    }
  }
}

/**
 * Lấy toàn bộ danh sách các ván debug log của phòng
 */
export async function getRoomDebugLogs(roomId: string): Promise<RoundDebugLog[]> {
  if (typeof window === 'undefined') return [];

  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('roomId');
      const req = index.getAll(roomId);

      req.onsuccess = () => {
        const logs = (req.result || []) as RoundDebugLog[];
        logs.sort((a, b) => a.roundNumber - b.roundNumber);
        resolve(logs);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (error) {
    console.warn('Could not read debug logs from IndexedDB, trying fallback:', error);
    try {
      const key = `loc_debug_${roomId}`;
      return JSON.parse(sessionStorage.getItem(key) || '[]');
    } catch {
      return [];
    }
  }
}

/**
 * Tải file JSON debug về máy của Host
 */
export async function exportRoomDebugLogsAsJson(roomId: string): Promise<void> {
  const logs = await getRoomDebugLogs(roomId);
  if (!logs || logs.length === 0) {
    alert('Chưa có dữ liệu ván đấu nào để xuất file!');
    return;
  }

  const jsonStr = JSON.stringify(logs, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `loc_debug_${roomId}_${new Date().toISOString().substring(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
