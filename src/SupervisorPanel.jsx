// ─── SupervisorPanel ──────────────────────────────────────────────────────────
// All supervisor tools, rendered as a section inside Settings (techs never see
// these once signed out). Sign-in, publish a worklist, collect/clear returned
// results, and manage the technician roster.
//
// Drop into Settings:  <SupervisorPanel onToast={showToast} />

import { useState, useEffect } from "react";
import JSZip from "jszip";
import {
  uploadWorklist, listResultFolders, listResultFiles, downloadResultFile,
  deleteResultFolder, getRoster, saveRoster, uploadFlocFile,
  signInSupervisor, signOutSupervisor, getSupervisor
} from "./sync.js";

// "John_Smith__2026-06-10T03-04-05-123Z" → { tech: "John Smith", when: "2026-06-10 03:04" }
function parseFolder(folder) {
  const [rawName, stamp = ""] = folder.split("__");
  const tech = (rawName || "tech").replace(/_/g, " ");
  let when = stamp;
  const m = stamp.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})/);
  if (m) when = `${m[1]} ${m[2]}:${m[3]}`;
  return { tech, when };
}

export default function SupervisorPanel({ onToast }) {
  const note = (m) => onToast ? onToast(m) : null;

  const [supervisor, setSupervisor] = useState(null);
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState("");
  const [folders, setFolders] = useState([]);
  const [roster, setRoster] = useState([]);
  const [newName, setNewName] = useState("");
  const [rosterDirty, setRosterDirty] = useState(false);

  useEffect(() => { getSupervisor().then(setSupervisor).catch(() => setSupervisor(null)); }, []);
  useEffect(() => { if (supervisor) { refreshFolders(); getRoster().then(setRoster).catch(() => {}); } }, [supervisor]);

  const handleSignIn = async () => {
    setBusy("auth");
    try {
      const user = await signInSupervisor(email.trim(), pwd);
      setSupervisor(user); setPwd("");
      note("✓ Supervisor mode");
    } catch (e) { note("❌ Sign-in failed: " + (e.message || e)); }
    setBusy("");
  };

  const handleSignOut = async () => { await signOutSupervisor(); setSupervisor(null); setFolders([]); note("Signed out of supervisor"); };

  const handlePublish = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setBusy("publish");
    try { await uploadWorklist(file.name, file); note(`✓ Published ${file.name}`); }
    catch (err) { note("❌ Publish failed: " + (err.message || err)); }
    setBusy(""); e.target.value = "";
  };

  const handlePublishFloc = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setBusy("floc");
    try { await uploadFlocFile(file); note("✓ Published location file — devices will fetch it"); }
    catch (err) { note("❌ Location file failed: " + (err.message || err)); }
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
      const zip = new JSZip();
      for (const f of files) zip.file(f.name, await downloadResultFile(f.path));
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

  const addName = () => {
    const n = newName.trim(); if (!n) return;
    if (!roster.includes(n)) { setRoster(r => [...r, n].sort()); setRosterDirty(true); }
    setNewName("");
  };
  const removeName = (n) => { setRoster(r => r.filter(x => x !== n)); setRosterDirty(true); };
  const saveRosterNow = async () => {
    setBusy("roster");
    try { const saved = await saveRoster(roster); setRoster(saved); setRosterDirty(false); note("✓ Roster saved"); }
    catch (e) { note("❌ Roster save failed: " + (e.message || e)); }
    setBusy("");
  };

  return (
    <div className="settings-section">
      <div className="settings-section-hdr"><span className="settings-section-icon">🔑</span><span className="settings-section-title">Supervisor</span></div>
      <div className="settings-section-body">

        {!supervisor ? (
          <>
            <div className="settings-desc">Sign in to publish worklists, collect returned results, and manage the technician roster. Technicians do not need to sign in.</div>
            <div className="settings-row">
              <div className="settings-lbl">Supervisor Email</div>
              <input className="settings-input" placeholder="you@nzsteel" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username"/>
            </div>
            <div className="settings-row">
              <div className="settings-lbl">Password</div>
              <input className="settings-input" type="password" placeholder="••••••••" value={pwd}
                onChange={e=>setPwd(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSignIn()} autoComplete="current-password"/>
            </div>
            <button className="btn-primary" style={{alignSelf:"flex-start"}} disabled={busy==="auth"||!email||!pwd} onClick={handleSignIn}>
              {busy==="auth"?"Signing in…":"Sign in"}
            </button>
          </>
        ) : (
          <>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
              <div style={{fontSize:14,color:"var(--text-muted)"}}>Signed in as <strong style={{color:"var(--text-primary)"}}>{supervisor.email}</strong></div>
              <button className="btn-ghost" style={{background:"var(--bg-input)",border:"1px solid var(--border)",color:"var(--text-dim)"}} onClick={handleSignOut}>Sign out</button>
            </div>

            {/* Publish */}
            <div className="settings-row" style={{borderTop:"1px solid var(--border)",paddingTop:16}}>
              <div className="settings-lbl">Publish a Worklist</div>
              <label className="btn-primary" style={{alignSelf:"flex-start",cursor:"pointer",fontSize:14,padding:"12px 20px"}}>
                {busy==="publish"?"Publishing…":"⬆ Choose worklist to publish"}
                <input type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={handlePublish}/>
              </label>
              <div className="settings-desc">Uploads the file to the shared cloud. Technicians will see it (and a "newer worklist available" prompt) next time they open the app.</div>
              <label className="btn-ghost" style={{alignSelf:"flex-start",cursor:"pointer",background:"var(--bg-input)",border:"1px solid var(--border)",color:"var(--text-muted)",marginTop:8}}>
                {busy==="floc"?"Publishing…":"📍 Publish location (IH06) file"}
                <input type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={handlePublishFloc}/>
              </label>
              <div className="settings-desc">Published once; every device fetches and applies it automatically so technicians don't load it by hand.</div>
            </div>

            {/* Returned results */}
            <div className="settings-row" style={{borderTop:"1px solid var(--border)",paddingTop:16}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div className="settings-lbl">Returned Results ({folders.length})</div>
                <button className="btn-ghost" style={{background:"var(--bg-input)",border:"1px solid var(--border)",color:"var(--text-dim)",padding:"6px 12px",minHeight:0}} onClick={refreshFolders}>↻ Refresh</button>
              </div>
              {folders.length===0 && <div className="settings-desc">No results submitted yet.</div>}
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {folders.map(f => {
                  const { tech, when } = parseFolder(f);
                  return (
                    <div key={f} style={{display:"flex",alignItems:"center",gap:8,background:"var(--bg-input)",border:"1px solid var(--border)",borderRadius:8,padding:"10px 14px"}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:14,color:"var(--text-primary)",fontWeight:500}}>📦 {tech}</div>
                        <div style={{fontSize:12,color:"var(--text-dim)"}}>{when}</div>
                      </div>
                      <button className="btn-exp blue" style={{minHeight:36,fontSize:12,padding:"6px 10px"}} disabled={busy==="collect-"+f} onClick={()=>collectFolder(f)}>↓ Collect</button>
                      <button className="btn-exp red" style={{minHeight:36,fontSize:12,padding:"6px 10px"}} disabled={busy==="del-"+f} onClick={()=>removeFolder(f)}>🗑</button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Roster */}
            <div className="settings-row" style={{borderTop:"1px solid var(--border)",paddingTop:16}}>
              <div className="settings-lbl">Technician Roster</div>
              <div className="settings-desc">Names here appear as a dropdown on the technician sign-in screen, so techs pick their name instead of typing it.</div>
              <div style={{display:"flex",gap:8}}>
                <input className="settings-input" style={{flex:1}} placeholder="Add technician name…" value={newName}
                  onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addName()}/>
                <button className="btn-primary" style={{fontSize:14,padding:"0 18px",flexShrink:0}} onClick={addName}>Add</button>
              </div>
              {roster.length>0 && (
                <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:4}}>
                  {roster.map(n => (
                    <span key={n} style={{display:"flex",alignItems:"center",gap:6,background:"var(--brand-dim)",border:"1px solid var(--brand)",color:"var(--accent)",borderRadius:6,padding:"6px 10px",fontSize:14}}>
                      {n}
                      <button onClick={()=>removeName(n)} style={{background:"none",border:"none",color:"var(--accent)",cursor:"pointer",fontSize:14,lineHeight:1,padding:0}}>✕</button>
                    </span>
                  ))}
                </div>
              )}
              {rosterDirty && (
                <button className="btn-primary" style={{alignSelf:"flex-start",fontSize:14,padding:"11px 22px",marginTop:4}} disabled={busy==="roster"} onClick={saveRosterNow}>
                  {busy==="roster"?"Saving…":"Save Roster"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
