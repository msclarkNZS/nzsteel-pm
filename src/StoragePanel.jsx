// ─── StoragePanel ─────────────────────────────────────────────────────────────
// Admin "Assess Storage" tool: scan both buckets, see every item with its type,
// size, age and whether the supervisor has collected it, then tick and delete
// behind a confirmation. Helps keep the Supabase free tier under control.

import { useState } from "react";
import JSZip from "jszip";
import {
  listWorklistsBucket, listResultsSummary, deleteWorklistFiles, deleteResultFolder,
  listResultFiles, downloadResultFile
} from "./sync.js";

const COLLECTED_KEY = "nzsteel-collected-folders";
function getCollected() {
  try { return new Set(JSON.parse(localStorage.getItem(COLLECTED_KEY) || "[]")); } catch { return new Set(); }
}
function markCollected(folder) {
  try { const s = getCollected(); s.add(folder); localStorage.setItem(COLLECTED_KEY, JSON.stringify([...s])); } catch { /* ignore */ }
}

function fmtSize(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function ageDays(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}
function fmtDate(iso) { try { return iso ? new Date(iso).toLocaleString("en-NZ", { timeZone: "Pacific/Auckland" }) : "—"; } catch { return "—"; } }

export default function StoragePanel({ onToast }) {
  const note = (m) => onToast && onToast(m);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [worklists, setWorklists] = useState([]);
  const [results, setResults] = useState([]);
  const [selWL, setSelWL] = useState(() => new Set());   // worklist file names
  const [selRes, setSelRes] = useState(() => new Set()); // result folder names
  const [collected, setCollected] = useState(() => getCollected());
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState("");

  const scan = async () => {
    setScanning(true);
    try {
      const [wl, res] = await Promise.all([listWorklistsBucket(), listResultsSummary()]);
      setWorklists(wl); setResults(res); setCollected(getCollected()); setScanned(true);
    } catch (e) { note("⚠ Scan failed: " + (e.message || e)); }
    setScanning(false);
  };

  const latestWorklist = worklists.filter(w => w.type === "Worklist")
    .reduce((a, w) => (!a || (w.updatedAt || "") > (a.updatedAt || "")) ? w : a, null);

  const toggle = (set, setSet, key) => { const n = new Set(set); n.has(key) ? n.delete(key) : n.add(key); setSet(n); };

  const totalBytes = worklists.reduce((s, w) => s + w.size, 0) + results.reduce((s, r) => s + r.totalSize, 0);
  const selCount = selWL.size + selRes.size;
  const selBytes =
    worklists.filter(w => selWL.has(w.name)).reduce((s, w) => s + w.size, 0) +
    results.filter(r => selRes.has(r.folder)).reduce((s, r) => s + r.totalSize, 0);
  const selSystem = worklists.filter(w => selWL.has(w.name) && w.type === "System").map(w => w.name);
  const selUncollected = [...selRes].filter(f => !collected.has(f));

  const downloadResult = async (folder) => {
    setBusy("dl-" + folder);
    try {
      const files = await listResultFiles(folder);
      if (!files.length) { note("Folder is empty"); setBusy(""); return; }
      const zip = new JSZip();
      for (const f of files) zip.file(f.name, await downloadResultFile(f.path));
      const out = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(out);
      const a = document.createElement("a");
      a.href = url; a.download = folder + ".zip";
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      markCollected(folder); setCollected(getCollected());
      note(`✓ Downloaded ${folder}.zip`);
    } catch (e) { note("❌ " + (e.message || e)); }
    setBusy("");
  };

  const doDelete = async () => {
    setBusy("delete");
    try {
      if (selWL.size) await deleteWorklistFiles([...selWL]);
      for (const folder of selRes) await deleteResultFolder(folder);
      note(`✓ Deleted ${selCount} item${selCount !== 1 ? "s" : ""}`);
      setSelWL(new Set()); setSelRes(new Set()); setConfirm(false);
      await scan();
    } catch (e) { note("❌ Delete failed: " + (e.message || e)); }
    setBusy("");
  };

  const itemRow = (checked, onTick, title, sub, right, warn) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bg-input)", border: `1px solid ${warn ? "#d97706" : "var(--border)"}`, borderRadius: 8, padding: "9px 12px" }}>
      <input type="checkbox" checked={checked} onChange={onTick} style={{ width: 18, height: 18, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: "var(--text-primary)", wordBreak: "break-word" }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{sub}</div>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "right", flexShrink: 0 }}>{right}</div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="settings-desc">Review what's stored in the cloud and delete what's no longer needed. Photos in returned results use the most space — collect, then clear, to stay under the free tier.</div>

      {!scanned ? (
        <button className="btn-primary" style={{ alignSelf: "flex-start" }} disabled={scanning} onClick={scan}>
          {scanning ? "Scanning…" : "🔍 Scan storage"}
        </button>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontFamily: "'Roboto Condensed',sans-serif", fontWeight: 700, color: "var(--accent)" }}>
              Total stored: {fmtSize(totalBytes)}
            </div>
            <button className="btn-ghost" style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-dim)", padding: "6px 12px", minHeight: 0 }} disabled={scanning} onClick={scan}>
              {scanning ? "…" : "↻ Rescan"}
            </button>
          </div>

          {/* Worklists + system files */}
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--text-faint)" }}>Worklist bucket ({worklists.length})</div>
          {worklists.length === 0 && <div className="settings-desc" style={{ margin: 0 }}>Empty.</div>}
          {worklists.map(w => {
            const isCurrent = latestWorklist && w.name === latestWorklist.name;
            const tag = w.type === "System" ? "⚙ System file" : (isCurrent ? "📄 Worklist · current" : "📄 Worklist · older");
            return itemRow(
              selWL.has(w.name),
              () => toggle(selWL, setSelWL, w.name),
              w.name,
              `${tag}${w.type === "System" ? " — needed by the app" : ""}`,
              <>{fmtSize(w.size)}<br />{fmtDate(w.updatedAt)}</>,
              w.type === "System"
            );
          })}

          {/* Returned results */}
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--text-faint)", marginTop: 4 }}>Returned results ({results.length})</div>
          {results.length === 0 && <div className="settings-desc" style={{ margin: 0 }}>Empty.</div>}
          {results.map(r => {
            const days = ageDays(r.updatedAt);
            const isCollected = collected.has(r.folder);
            const old = days !== null && days >= 30;
            return (
              <div key={r.folder} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px" }}>
                <input type="checkbox" checked={selRes.has(r.folder)} onChange={() => toggle(selRes, setSelRes, r.folder)} style={{ width: 18, height: 18, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: "var(--text-primary)", wordBreak: "break-word" }}>📦 {r.folder.replace(/__/g, " · ").replace(/_/g, " ")}</div>
                  <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                    {r.fileCount} file(s), {r.photoCount} photo(s) · {fmtDate(r.updatedAt)}{days !== null ? ` · ${days}d old` : ""}
                  </div>
                  <div style={{ fontSize: 11, marginTop: 2 }}>
                    {isCollected ? <span style={{ color: "#4ade80" }}>✓ collected on this device</span> : <span style={{ color: "#fbbf24" }}>⚠ not collected here</span>}
                    {old && <span style={{ color: "#fb923c" }}> · old</span>}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                  <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{fmtSize(r.totalSize)}</div>
                  <button className="btn-exp blue" style={{ minHeight: 30, fontSize: 11, padding: "4px 8px" }} disabled={busy === "dl-" + r.folder} onClick={() => downloadResult(r.folder)}>↓ Get</button>
                </div>
              </div>
            );
          })}

          {/* Action bar */}
          {selCount > 0 && (
            <div style={{ position: "sticky", bottom: 0, background: "var(--bg-card)", borderTop: "1px solid var(--brand)", padding: "10px 0", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{selCount} selected · {fmtSize(selBytes)}</div>
              <button className="btn-exp red" style={{ alignSelf: "flex-start", minHeight: 44 }} onClick={() => setConfirm(true)}>🗑 Delete selected</button>
            </div>
          )}

          {confirm && (
            <div style={{ background: "#200808", border: "1px solid #dc2626", borderRadius: 8, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ color: "#fca5a5", fontWeight: 700 }}>Permanently delete {selCount} item(s)?</div>
              <div style={{ fontSize: 13, color: "#fca5a5" }}>This frees {fmtSize(selBytes)} and cannot be undone.</div>
              {selUncollected.length > 0 && (
                <div style={{ fontSize: 13, color: "#fbbf24" }}>⚠ {selUncollected.length} selected result(s) are NOT collected on this device — download them first if you need them.</div>
              )}
              {selSystem.length > 0 && (
                <div style={{ fontSize: 13, color: "#fb923c" }}>⚠ Includes system file(s): {selSystem.join(", ")} — deleting these may break the app until re-published.</div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn-exp red" style={{ minHeight: 44 }} disabled={busy === "delete"} onClick={doDelete}>{busy === "delete" ? "Deleting…" : "Yes, delete permanently"}</button>
                <button className="btn-ghost" style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-dim)", minHeight: 44, padding: "0 16px" }} onClick={() => setConfirm(false)}>Cancel</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
