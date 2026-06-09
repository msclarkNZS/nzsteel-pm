// ─── Persistent storage (IndexedDB) ───────────────────────────────────────────
// Replaces the old in-memory `_sessionStore`, which reset on every page load.
// IndexedDB survives app close, phone restart, and handles large data (photos)
// far better than localStorage's ~5MB cap.
//
// API mirrors the old helpers so the swap in App.jsx is minimal, EXCEPT these
// are async (return Promises). The mount-time restore effect must `await`.

import { openDB } from "idb";

const DB_NAME = "nzsteel-pm";
const DB_VERSION = 1;
const STORE = "kv";
const SESSION_KEY = "session";

let _dbPromise = null;
function db() {
  if (!_dbPromise) {
    _dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) {
          database.createObjectStore(STORE);
        }
      }
    });
  }
  return _dbPromise;
}

// Save the full working session. Fire-and-forget is fine; we swallow errors so
// a storage hiccup never crashes the app.
export async function saveSession(data) {
  try {
    const database = await db();
    await database.put(STORE, data, SESSION_KEY);
    return true;
  } catch (e) {
    console.warn("saveSession failed:", e);
    return false;
  }
}

// Load the saved session, or null if none / on error.
export async function loadSession() {
  try {
    const database = await db();
    const data = await database.get(STORE, SESSION_KEY);
    return data ?? null;
  } catch (e) {
    console.warn("loadSession failed:", e);
    return null;
  }
}

// Wipe the session (used by "Clear Session Data" and "New File").
export async function clearSession() {
  try {
    const database = await db();
    await database.delete(STORE, SESSION_KEY);
    return true;
  } catch (e) {
    console.warn("clearSession failed:", e);
    return false;
  }
}
