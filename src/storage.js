// ─── Persistent storage (IndexedDB) ───────────────────────────────────────────
// Survives app close, phone restart, and accidental page reloads. Holds the
// working session AND a small auth record so a refresh doesn't bounce the user
// back to the sign-in screen.

import { openDB } from "idb";

const DB_NAME = "nzsteel-pm";
const DB_VERSION = 1;
const STORE = "kv";
const SESSION_KEY = "session";
const AUTH_KEY = "auth";

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

// ── Working session ───────────────────────────────────────────────────────────
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

// ── Sign-in persistence (manual-name path) ────────────────────────────────────
// Keeps the technician signed in across reloads. MSAL handles its own session
// separately, so this only covers the "type your name" sign-in.
export async function saveAuth(data) {
  try {
    const database = await db();
    await database.put(STORE, data, AUTH_KEY);
    return true;
  } catch (e) {
    console.warn("saveAuth failed:", e);
    return false;
  }
}

export async function loadAuth() {
  try {
    const database = await db();
    const data = await database.get(STORE, AUTH_KEY);
    return data ?? null;
  } catch (e) {
    console.warn("loadAuth failed:", e);
    return null;
  }
}

export async function clearAuth() {
  try {
    const database = await db();
    await database.delete(STORE, AUTH_KEY);
    return true;
  } catch (e) {
    console.warn("clearAuth failed:", e);
    return false;
  }
}

// ── Checklist drafts (save/resume half-filled forms, per device) ──────────────
export async function saveDraft(draft) {
  try {
    const database = await db();
    await database.put(STORE, draft, `draft:${draft.id}`);
    return true;
  } catch (e) { console.warn("saveDraft failed:", e); return false; }
}

export async function listDrafts() {
  try {
    const database = await db();
    const keys = await database.getAllKeys(STORE);
    const draftKeys = keys.filter(k => typeof k === "string" && k.startsWith("draft:"));
    const out = [];
    for (const k of draftKeys) { const d = await database.get(STORE, k); if (d) out.push(d); }
    return out.sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")));
  } catch (e) { console.warn("listDrafts failed:", e); return []; }
}

export async function deleteDraft(id) {
  try {
    const database = await db();
    await database.delete(STORE, `draft:${id}`);
    return true;
  } catch (e) { console.warn("deleteDraft failed:", e); return false; }
}
