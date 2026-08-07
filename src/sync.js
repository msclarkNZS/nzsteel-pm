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
const CONFIG_KEY = "config.json";
const RESERVED = ["roster.json", FLOC_KEY, CONFIG_KEY];
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

// ── Storage assessment (admin) ────────────────────────────────────────────────
const SYSTEM_FILES = ["roster.json", "floc-source.xlsx", "config.json"];

// Every file in the worklists bucket, tagged Worklist vs System.
export async function listWorklistsBucket() {
  const { data, error } = await supabase.storage
    .from(WORKLISTS_BUCKET)
    .list("", { limit: 1000, sortBy: { column: "updated_at", order: "desc" } });
  if (error) throw error;
  return (data || [])
    .filter(f => f.name && !f.name.startsWith(".") && f.id) // f.id present → real file
    .map(f => ({
      name: f.name,
      type: SYSTEM_FILES.includes(f.name.toLowerCase()) ? "System" : "Worklist",
      size: f.metadata?.size ?? 0,
      updatedAt: f.updated_at || f.created_at || null
    }));
}

// Each returned-results folder summarised (file/photo counts, size, date).
export async function listResultsSummary() {
  const { data: folders, error } = await supabase.storage
    .from(RESULTS_BUCKET)
    .list("", { limit: 1000, sortBy: { column: "name", order: "desc" } });
  if (error) throw error;
  const out = [];
  for (const fo of (folders || [])) {
    if (!fo.name || fo.name.startsWith(".")) continue;
    const files = await listResultFiles(fo.name);
    const totalSize = files.reduce((s, f) => s + (f.size || 0), 0);
    const photoCount = files.filter(f => /\.(jpg|jpeg|png)$/i.test(f.name)).length;
    out.push({
      folder: fo.name,
      fileCount: files.length,
      photoCount,
      totalSize,
      updatedAt: fo.updated_at || fo.created_at || null
    });
  }
  return out;
}

// Delete selected worklist-bucket files by name.
export async function deleteWorklistFiles(names) {
  if (!names || !names.length) return;
  const { error } = await supabase.storage.from(WORKLISTS_BUCKET).remove(names);
  if (error) throw error;
}

// ── Shared admin configuration (config.json) ───────────────────────────────────
// Admin publishes one config that every device fetches and applies on startup
// (column mappings, criticality rules, file settings, location groups). Themes
// and per-device grouping are NOT included — they stay local.
export async function getConfig() {
  try {
    const { data, error } = await supabase.storage.from(WORKLISTS_BUCKET).download(CONFIG_KEY);
    if (error || !data) return null;
    const text = await data.text();
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

// Supervisor (admin) only.
export async function saveConfig(config) {
  const blob = new Blob([JSON.stringify(config)], { type: "application/json" });
  const { error } = await supabase.storage
    .from(WORKLISTS_BUCKET)
    .upload(CONFIG_KEY, blob, { upsert: true, contentType: "application/json" });
  if (error) throw error;
}

// ── Live-ish progress sharing (merge-on-pull multi-device sync) ───────────────
// Stored in a Postgres table (NOT storage) because storage sits behind a CDN
// that serves stale cached copies; database reads are always fresh. Needs a
// `progress` table with anon read/write (see setup notes).
//   columns: worklist text, device_id text, by_name text, tasks jsonb,
//            updated_at timestamptz   PRIMARY KEY (worklist, device_id)

export async function pushProgress(worklistName, deviceId, progress) {
  const row = {
    worklist: worklistName,
    device_id: deviceId,
    by_name: progress?.by || "tech",
    tasks: progress?.tasks || {},
    updated_at: progress?.updatedAt || new Date().toISOString()
  };
  const { error } = await supabase.from("progress").upsert(row, { onConflict: "worklist,device_id" });
  if (error) throw error;
}

export async function pullProgress(worklistName) {
  const { data, error } = await supabase.from("progress").select("device_id,by_name,tasks,updated_at").eq("worklist", worklistName);
  if (error) throw error;
  return (data || []).map(r => ({
    deviceId: r.device_id,
    by: r.by_name,
    tasks: r.tasks || {},
    updatedAt: r.updated_at
  }));
}
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

// ── Digital check sheets (Checklist mode) ─────────────────────────────────────
// Forms are designed in nzsteel-form-builder and stored in the shared `forms`
// table; completed results go to `form_submissions`. Submission photos go to a
// PRIVATE `submission-photos` bucket — we store long-lived SIGNED URLs so both
// apps can render them with <img src> without the bucket being public.
const SUBMISSION_BUCKET = "submission-photos";
const SIGNED_TTL = 315360000; // ~10 years

export async function listApprovedForms() {
  const { data, error } = await supabase
    .from("forms").select("*").eq("status", "approved").order("title", { ascending: true });
  if (error) throw error;
  return data || [];
}

// Sweep an object for base64 images, upload each to the private bucket, and
// replace with a long-lived signed URL. Non-image values pass through.
async function uploadDataUrlsInObject(obj, basePath) {
  const out = {};
  for (const [key, val] of Object.entries(obj || {})) {
    if (typeof val === "string" && val.startsWith("data:image")) {
      try {
        const res = await fetch(val);
        const blob = await res.blob();
        const ext = (blob.type.split("/")[1] || "jpg").split("+")[0];
        const path = `${basePath}/${key}.${ext}`;
        const up = await supabase.storage.from(SUBMISSION_BUCKET).upload(path, blob, { contentType: blob.type, upsert: true });
        if (up.error) throw up.error;
        const signed = await supabase.storage.from(SUBMISSION_BUCKET).createSignedUrl(path, SIGNED_TTL);
        if (signed.error) throw signed.error;
        out[key] = signed.data.signedUrl;
      } catch (e) {
        console.error("Photo upload failed for", key, e);
        out[key] = val; // fall back to embedding rather than losing the photo
      }
    } else {
      out[key] = val;
    }
  }
  return out;
}

// form = the row.data object (has id, title, docRef, version, sections)
export async function submitForm({ form, values, photos, submittedBy }) {
  const submissionId = (crypto.randomUUID ? crypto.randomUUID() : "s" + Date.now() + Math.random().toString(36).slice(2));
  const basePath = `${form.id}/${submissionId}`;
  const uploadedValues = await uploadDataUrlsInObject(values, basePath);
  const uploadedPhotos = await uploadDataUrlsInObject(photos || {}, basePath);
  const { error } = await supabase.from("form_submissions").insert({
    id: submissionId,
    form_id: form.id,
    form_title: form.title,
    form_doc_ref: form.docRef,
    form_version: form.version,
    submitted_by: submittedBy || "",
    responses: uploadedValues,
    photos: uploadedPhotos,
  });
  if (error) throw error;
  return submissionId;
}
