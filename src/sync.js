// ─── Sync layer (the swappable "storage box") ─────────────────────────────────
// Everything the app needs to move files in/out of the shared drop-box lives
// behind this interface. To migrate to SharePoint later, you rewrite ONLY this
// file to keep the same function signatures — the rest of the app is untouched.
//
// Security model (enforced by Supabase policies, see SUPABASE-SETUP.md):
//   • Technician (not signed in / anon key): can LIST + DOWNLOAD worklists,
//     and can UPLOAD results. Cannot read back results.
//   • Supervisor (signed in with email+password): can also UPLOAD worklists and
//     LIST/DOWNLOAD/DELETE results.

import { supabase, WORKLISTS_BUCKET, RESULTS_BUCKET } from "./supabase.js";

// ── Connectivity ──────────────────────────────────────────────────────────────
// A real reachability check (navigator.onLine lies on plant wifi).
export async function checkOnline() {
  try {
    const { error } = await supabase.storage.from(WORKLISTS_BUCKET).list("", { limit: 1 });
    return !error;
  } catch {
    return false;
  }
}

// ── Worklists (supervisor pushes out, everyone pulls) ──────────────────────────
const WORKLIST_EXTS = [".xlsx", ".xls", ".csv"];
// Reserved names kept in the worklists bucket but NOT shown as selectable worklists.
const FLOC_KEY = "floc-source.xlsx";
const RESERVED = ["roster.json", FLOC_KEY];
function isWorklistFile(name) {
  const n = (name || "").toLowerCase();
  if (RESERVED.includes(n)) return false;
  return WORKLIST_EXTS.some(ext => n.endsWith(ext));
}

export async function listWorklists() {
  const { data, error } = await supabase.storage
    .from(WORKLISTS_BUCKET)
    .list("", { limit: 100, sortBy: { column: "updated_at", order: "desc" } });
  if (error) throw error;
  return (data || [])
    .filter(f => f.name && !f.name.startsWith(".") && isWorklistFile(f.name))
    .map(f => ({
      name: f.name,
      size: f.metadata?.size ?? 0,
      updatedAt: f.updated_at || f.created_at || null
    }));
}

// The most recently updated worklist, or null. Used for the "newer worklist
// available" prompt on app open.
export async function getLatestWorklist() {
  const list = await listWorklists();
  return list.length ? list[0] : null;
}

// ── Functional-location (IH06) file via the cloud ─────────────────────────────
// Supervisor publishes the raw IH06 file once; every device fetches and parses
// it automatically, so techs don't load it by hand.
export async function uploadFlocFile(blob) {
  const { error } = await supabase.storage
    .from(WORKLISTS_BUCKET)
    .upload(FLOC_KEY, blob, { upsert: true, contentType: blob.type || undefined });
  if (error) throw error;
}

// Returns a File for the app's existing parser, or null if none published.
export async function downloadFlocFile() {
  const { data, error } = await supabase.storage.from(WORKLISTS_BUCKET).download(FLOC_KEY);
  if (error || !data) return null;
  return new File([data], FLOC_KEY, { type: data.type || "application/octet-stream" });
}

export async function downloadWorklist(name) {
  const { data, error } = await supabase.storage.from(WORKLISTS_BUCKET).download(name);
  if (error) throw error;
  // Return a File so it drops straight into the app's existing processFile().
  return new File([data], name, { type: data.type || "application/octet-stream" });
}

// Supervisor only.
export async function uploadWorklist(name, blob) {
  const { error } = await supabase.storage
    .from(WORKLISTS_BUCKET)
    .upload(name, blob, { upsert: true, contentType: blob.type || undefined });
  if (error) throw error;
}

// ── Results (techs push, supervisor collects) ──────────────────────────────────
// Each push goes into its own timestamped folder so nothing overwrites.
// `files` = [{ name, blob }]. Returns the folder it wrote to.
export async function pushResult(techName, files) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = (techName || "tech").replace(/[^a-zA-Z0-9_-]/g, "_");
  const folder = `${safeName}__${stamp}`;
  for (const f of files) {
    const { error } = await supabase.storage
      .from(RESULTS_BUCKET)
      .upload(`${folder}/${f.name}`, f.blob, { contentType: f.blob.type || undefined });
    if (error) throw error;
  }
  return folder;
}

// Supervisor only — list result folders.
export async function listResultFolders() {
  const { data, error } = await supabase.storage
    .from(RESULTS_BUCKET)
    .list("", { limit: 200, sortBy: { column: "name", order: "desc" } });
  if (error) throw error;
  return (data || []).filter(d => d.name && !d.name.startsWith(".")).map(d => d.name);
}

// Supervisor only — list files inside one folder.
export async function listResultFiles(folder) {
  const { data, error } = await supabase.storage.from(RESULTS_BUCKET).list(folder, { limit: 200 });
  if (error) throw error;
  return (data || [])
    .filter(f => f.name && !f.name.startsWith("."))
    .map(f => ({ name: f.name, path: `${folder}/${f.name}`, size: f.metadata?.size ?? 0 }));
}

// Supervisor only — get a temporary download URL for a result file.
export async function getResultUrl(path) {
  const { data, error } = await supabase.storage.from(RESULTS_BUCKET).createSignedUrl(path, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}

// Supervisor only — download a result file as a Blob (used to build the zip).
export async function downloadResultFile(path) {
  const { data, error } = await supabase.storage.from(RESULTS_BUCKET).download(path);
  if (error) throw error;
  return data; // Blob
}

// Supervisor only — delete a whole result folder once collected.
export async function deleteResultFolder(folder) {
  const files = await listResultFiles(folder);
  const paths = files.map(f => f.path);
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(RESULTS_BUCKET).remove(paths);
  if (error) throw error;
}

// ── Technician roster (light user management) ─────────────────────────────────
// Stored as roster.json in the worklists bucket, which already allows anon read
// (so the sign-in screen can offer a name dropdown) and supervisor-only write.
const ROSTER_KEY = "roster.json";

export async function getRoster() {
  try {
    const { data, error } = await supabase.storage.from(WORKLISTS_BUCKET).download(ROSTER_KEY);
    if (error) return [];
    const text = await data.text();
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Supervisor only.
export async function saveRoster(names) {
  const clean = [...new Set((names || []).map(n => String(n).trim()).filter(Boolean))].sort();
  const blob = new Blob([JSON.stringify(clean)], { type: "application/json" });
  const { error } = await supabase.storage
    .from(WORKLISTS_BUCKET)
    .upload(ROSTER_KEY, blob, { upsert: true, contentType: "application/json" });
  if (error) throw error;
  return clean;
}

// ── Supervisor auth ─────────────────────────────────────────────────────────
export async function signInSupervisor(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signOutSupervisor() {
  await supabase.auth.signOut();
}

export async function getSupervisor() {
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
}
