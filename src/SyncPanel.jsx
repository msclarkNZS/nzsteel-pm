// ─── SyncPanel ────────────────────────────────────────────────────────────────
// Technician-facing drop-box UI: load a published worklist, push results back.
// Supervisor tools now live in Settings (see SupervisorPanel.jsx).
//
// Props:
//   techName       — current technician's name (used to label the push folder)
//   onLoadWorklist — (file, meta) => void; meta = { name, updatedAt }
//   getResultFiles — () => Promise<[{ name, blob }]>

import { useState, useEffect, useCallback } from "react";
import { listWorklists, downloadWorklist, pushResult } from "./sync.js";

export default function SyncPanel({ techName, onLoadWorklist, getResultFiles }) {
  const [open, setOpen] = useState(false);
  const [worklists, setWorklists] = useState([]);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const note = (m) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };

  const refreshWorklists = useCallback(async () => {
    try { setWorklists(await listWorklists()); }
    catch (e) { note("⚠ Could not list worklists: " + (e.message || e)); }
  }, []);

  useEffect(() => { if (open) refreshWorklists(); }, [open, refreshWorklists]);

  const handleLoad = async (w) => {
    setBusy("load");
    try {
      const file = await downloadWorklist(w.name);
      await onLoadWorklist(file, { name: w.name, updatedAt: w.updatedAt });
      note(`✓ Loaded ${w.name}`);
      setOpen(false);
    } catch (e) { note("❌ Load failed: " + (e.message || e)); }
    setBusy("");
  };

  const handlePush = async () => {
    setBusy("push");
    try {
      const files = await getResultFiles();
      if (!files || files.length === 0) { note("Nothing to push yet"); setBusy(""); return; }
      const folder = await pushResult(techName, files);
      note(`✓ Pushed ${files.length} file(s) — ${folder}`);
    } catch (e) { note("❌ Push failed: " + (e.message || e)); }
    setBusy("");
  };

  const btn = (bg) => ({
    background: bg, color: "white", border: "none", borderRadius: 8,
    fontFamily: "'Roboto Condensed',sans-serif", fontSize: 16, fontWeight: 700,
    letterSpacing: 1, textTransform: "uppercase", padding: "16px", cursor: "pointer",
    minHeight: 56, display: "flex", alignItems: "center", justifyContent: "center", gap: 8
  });

  return (
    <>
      {/* Trigger button — lives in the export bar */}
      <button className="btn-exp blue" style={{ display: "flex", alignItems: "center", gap: 7 }} onClick={() => setOpen(true)}>
        ☁ Sync
      </button>

      {open && (
        <div className="backdrop" onClick={e => e.target === e.currentTarget && setOpen(false)}>
          <div className="panel" style={{ maxWidth: 560 }}>
            <div className="panel-handle" />
            <div className="panel-hdr">
              <div className="panel-hdr-left">
                <div className="panel-floc" style={{ fontSize: 22 }}>☁ Sync</div>
                <div className="panel-optext">Load a worklist, or push your completed results</div>
              </div>
              <button className="panel-x" onClick={() => setOpen(false)}>✕</button>
            </div>

            <div className="panel-body">
              {msg && <div style={{ background: "var(--brand-dim)", border: "1px solid var(--brand)", borderRadius: 6, padding: "10px 14px", fontSize: 14, color: "var(--accent)" }}>{msg}</div>}

              <button style={{ ...btn("var(--brand)") }} onClick={handlePush} disabled={busy === "push"}>
                {busy === "push" ? "Pushing…" : "⬆ Push Results"}
              </button>

              <div className="comment-lbl" style={{ marginTop: 4 }}>Available worklists — tap to load</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {worklists.length === 0 && <div style={{ color: "var(--text-faint)", fontSize: 14, padding: "8px 0" }}>None found. Ask your supervisor to publish one.</div>}
                {worklists.map(w => (
                  <button key={w.name} onClick={() => handleLoad(w)} disabled={busy === "load"}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, padding: "14px 16px", cursor: "pointer", textAlign: "left" }}>
                    <div>
                      <div style={{ fontSize: 15, color: "var(--text-primary)", fontWeight: 500 }}>📄 {w.name}</div>
                      <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{w.updatedAt ? new Date(w.updatedAt).toLocaleString() : ""} · {(w.size / 1024).toFixed(0)} KB</div>
                    </div>
                    <span style={{ color: "var(--accent)", fontFamily: "'Roboto Condensed',sans-serif", fontWeight: 700, fontSize: 13 }}>LOAD →</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
