// ─── SyncPanel ────────────────────────────────────────────────────────────────
// Drop-in UI for the shared drop-box. Role-aware:
//   • Technician (default): big "Load Worklist" + "Push Results" buttons.
//   • Supervisor (after sign-in): also upload a new worklist and collect/delete
//     returned results.
//
// Wire it into App.jsx with three props:
//   <SyncPanel
//     techName={techName}
//     onLoadWorklist={(file) => processFile(file)}   // your existing loader
//     getResultFiles={getResultFiles}                // see README wiring
//   />
//
// getResultFiles() must return a Promise of [{ name, blob }] — e.g. a tasks
// xlsx, a notifications xlsx, and one blob per photo.
 
import { useState, useEffect, useCallback } from "react";
import JSZip from "jszip";
import {
  listWorklists, downloadWorklist, uploadWorklist, pushResult,
  listResultFolders, listResultFiles, downloadResultFile, deleteResultFolder,
  signInSupervisor, signOutSupervisor, getSupervisor
} from "./sync.js";
 
export default function SyncPanel({ techName, onLoadWorklist, getResultFiles }) {
  const [open, setOpen] = useState(false);
  const [supervisor, setSupervisor] = useState(null);
  const [worklists, setWorklists] = useState([]);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [signinOpen, setSigninOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [folders, setFolders] = useState([]);
 
  const note = (m) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };
 
  const refreshWorklists = useCallback(async () => {
    try { setWorklists(await listWorklists()); }
    catch (e) { note("⚠ Could not list worklists: " + (e.message || e)); }
  }, []);
 
  useEffect(() => { getSupervisor().then(setSupervisor); }, []);
  useEffect(() => { if (open) refreshWorklists(); }, [open, refreshWorklists]);
 
  const handleLoad = async (name) => {
    setBusy("load");
    try {
      const file = await downloadWorklist(name);
      await onLoadWorklist(file);
      note(`✓ Loaded ${name}`);
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
 
  const handleSignIn = async () => {
    setBusy("auth");
    try {
      const user = await signInSupervisor(email.trim(), pwd);
      setSupervisor(user); setSigninOpen(false); setPwd("");
      note("✓ Supervisor mode");
    } catch (e) { note("❌ Sign-in failed: " + (e.message || e)); }
    setBusy("");
  };
 
  const handleSignOut = async () => { await signOutSupervisor(); setSupervisor(null); note("Signed out of supervisor"); };
 
  const handleUploadWorklist = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setBusy("upload");
    try { await uploadWorklist(file.name, file); await refreshWorklists(); note(`✓ Published ${file.name}`); }
    catch (err) { note("❌ Upload failed: " + (err.message || err)); }
    setBusy(""); e.target.value = "";
  };
 
  const refreshFolders = async () => {
    try { setFolders(await listResultFolders()); }
    catch (e) { note("⚠ " + (e.message || e)); }
  };
 
  const collectFolder = async (folder) => {
    setBusy("collect-" + folder);
    try {
      const files = await listResultFiles(folder);
      if (!files.length) { note("Folder is empty"); setBusy(""); return; }
      // Bundle everything (xlsx + photos) into one zip — a single, same-origin
      // download that browsers don't block, and that keeps each tech's push tidy.
      const zip = new JSZip();
      for (const f of files) {
        const blob = await downloadResultFile(f.path);
        zip.file(f.name, blob);
      }
      const out = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(out);
      const a = document.createElement("a");
      a.href = url; a.download = folder + ".zip";
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      note(`✓ Downloaded ${files.length} file(s) as ${folder}.zip`);
    } catch (e) { note("❌ " + (e.message || e)); }
    setBusy("");
  };
 
  const removeFolder = async (folder) => {
    if (!window.confirm(`Delete results from ${folder}? Download them first.`)) return;
    setBusy("del-" + folder);
    try { await deleteResultFolder(folder); await refreshFolders(); note(`✓ Cleared ${folder}`); }
    catch (e) { note("❌ " + (e.message || e)); }
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
      {/* Trigger button — place this in your export bar */}
      <button className="btn-exp blue" style={{ display: "flex", alignItems: "center", gap: 7 }} onClick={() => setOpen(true)}>
        ☁ Sync{supervisor ? " ●" : ""}
      </button>
 
      {open && (
        <div className="backdrop" onClick={e => e.target === e.currentTarget && setOpen(false)}>
          <div className="panel" style={{ maxWidth: 560 }}>
            <div className="panel-handle" />
            <div className="panel-hdr">
              <div className="panel-hdr-left">
                <div className="panel-floc" style={{ fontSize: 22 }}>☁ Sync</div>
                <div className="panel-optext">
                  {supervisor ? `Supervisor: ${supervisor.email}` : "Technician mode"}
                </div>
              </div>
              <button className="panel-x" onClick={() => setOpen(false)}>✕</button>
            </div>
 
            <div className="panel-body">
              {msg && <div style={{ background: "var(--brand-dim)", border: "1px solid var(--brand)", borderRadius: 6, padding: "10px 14px", fontSize: 14, color: "var(--accent)" }}>{msg}</div>}
 
              {/* ── Technician actions ── */}
              <div style={{ display: "flex", gap: 10 }}>
                <button style={{ ...btn("var(--brand)"), flex: 1 }} onClick={handlePush} disabled={busy === "push"}>
                  {busy === "push" ? "Pushing…" : "⬆ Push Results"}
                </button>
              </div>
 
              <div className="comment-lbl" style={{ marginTop: 4 }}>Available worklists — tap to load</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {worklists.length === 0 && <div style={{ color: "var(--text-faint)", fontSize: 14, padding: "8px 0" }}>None found. {supervisor ? "Upload one below." : "Ask your supervisor to publish one."}</div>}
                {worklists.map(w => (
                  <button key={w.name} onClick={() => handleLoad(w.name)} disabled={busy === "load"}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, padding: "14px 16px", cursor: "pointer", textAlign: "left" }}>
                    <div>
                      <div style={{ fontSize: 15, color: "var(--text-primary)", fontWeight: 500 }}>📄 {w.name}</div>
                      <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{w.updatedAt ? new Date(w.updatedAt).toLocaleString() : ""} · {(w.size / 1024).toFixed(0)} KB</div>
                    </div>
                    <span style={{ color: "var(--accent)", fontFamily: "'Roboto Condensed',sans-serif", fontWeight: 700, fontSize: 13 }}>LOAD →</span>
                  </button>
                ))}
              </div>
 
              {/* ── Supervisor section ── */}
              <div style={{ borderTop: "1px solid var(--border)", marginTop: 8, paddingTop: 16 }}>
                {!supervisor ? (
                  !signinOpen ? (
                    <button className="btn-ghost" style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-dim)" }} onClick={() => setSigninOpen(true)}>
                      🔑 Supervisor sign-in
                    </button>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div className="comment-lbl">Supervisor sign-in</div>
                      <input className="comment-ta" style={{ minHeight: 0, padding: "12px 14px" }} placeholder="email" value={email} onChange={e => setEmail(e.target.value)} />
                      <input className="comment-ta" style={{ minHeight: 0, padding: "12px 14px" }} type="password" placeholder="password" value={pwd} onChange={e => setPwd(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSignIn()} />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button style={{ ...btn("var(--brand)"), flex: 1, minHeight: 48, fontSize: 14 }} onClick={handleSignIn} disabled={busy === "auth"}>Sign in</button>
                        <button className="pa-reset" style={{ minHeight: 48 }} onClick={() => setSigninOpen(false)}>Cancel</button>
                      </div>
                    </div>
                  )
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div className="comment-lbl" style={{ margin: 0 }}>Supervisor tools</div>
                      <button className="btn-ghost" style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-dim)", padding: "6px 12px", minHeight: 0 }} onClick={handleSignOut}>Sign out</button>
                    </div>
 
                    <label style={{ ...btn("#15803d"), cursor: "pointer", minHeight: 48, fontSize: 14 }}>
                      {busy === "upload" ? "Publishing…" : "⬆ Publish a worklist"}
                      <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={handleUploadWorklist} />
                    </label>
 
                    <button className="btn-ghost" style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-muted)" }} onClick={refreshFolders}>
                      ↻ Show returned results
                    </button>
                    {folders.map(f => (
                      <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px" }}>
                        <span style={{ flex: 1, fontSize: 13, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📦 {f}</span>
                        <button className="btn-exp blue" style={{ minHeight: 36, fontSize: 12, padding: "6px 10px" }} disabled={busy === "collect-" + f} onClick={() => collectFolder(f)}>↓ Collect</button>
                        <button className="btn-exp red" style={{ minHeight: 36, fontSize: 12, padding: "6px 10px" }} disabled={busy === "del-" + f} onClick={() => removeFolder(f)}>🗑</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
