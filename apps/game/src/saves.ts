import type { SaveFile } from '@void-frontier/simulation';

export type SlotId = 'auto' | 'slot1' | 'slot2' | 'slot3';
export const SLOTS: SlotId[] = ['auto', 'slot1', 'slot2', 'slot3'];

export interface SlotRecord {
  slot: SlotId;
  savedAt: number;
  /** seconds of simulated play */
  playtime: number;
  credits: number;
  file: SaveFile;
}

const DB_NAME = 'void-frontier';
const STORE = 'saves';
const FALLBACK_PREFIX = 'void-frontier.save.';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'slot' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = run(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/**
 * Local saves in IndexedDB, with localStorage as a fallback when IndexedDB is blocked
 * (some private modes). A write either fully lands or throws; the previous record stays.
 */
export const saveStore = {
  async put(record: SlotRecord): Promise<void> {
    try {
      await withStore('readwrite', (store) => store.put(record));
    } catch {
      localStorage.setItem(FALLBACK_PREFIX + record.slot, JSON.stringify(record));
    }
  },

  async get(slot: SlotId): Promise<SlotRecord | null> {
    try {
      const record = await withStore<SlotRecord | undefined>('readonly', (store) => store.get(slot));
      if (record) return record;
    } catch {
      // Fall through to the fallback.
    }
    try {
      const text = localStorage.getItem(FALLBACK_PREFIX + slot);
      return text ? (JSON.parse(text) as SlotRecord) : null;
    } catch {
      return null;
    }
  },

  async list(): Promise<SlotRecord[]> {
    const records = await Promise.all(SLOTS.map((slot) => this.get(slot)));
    return records.filter((r): r is SlotRecord => r !== null);
  },

  async remove(slot: SlotId): Promise<void> {
    try {
      await withStore('readwrite', (store) => store.delete(slot));
    } catch {
      // Ignore: nothing to delete.
    }
    try {
      localStorage.removeItem(FALLBACK_PREFIX + slot);
    } catch {
      // Storage unavailable.
    }
  },
};

/** Offer a save file to the player as a download. */
export function downloadSave(file: SaveFile, name: string): void {
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
