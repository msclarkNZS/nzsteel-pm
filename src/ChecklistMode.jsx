// ─── ChecklistMode ────────────────────────────────────────────────────────────
// Operator-facing digital check sheets. Loads approved forms from the shared
// `forms` table, renders them section by section, collects answers using the
// `${fieldId}_${responseType}` key convention, and submits to `form_submissions`
// (photos uploaded to a private bucket at submit time).
//
// Batch B covers the common field types. Matrix fields + markup come in Batch C;
// a matrix field here shows a "coming soon" note so the rest of the form still works.

import { useState, useEffect, useCallback } from "react";
import { listForms, submitForm } from "./sync.js";
import { compressImage } from "./photo.js";

export default function ChecklistMode({ techName, onToast }) {
  const note = (m) => onToast && onToast(m);
  const [stage, setStage] = useState("list"); // list | fill | done
  const [forms, setForms] = useState([]);
  const [allForms, setAllForms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState(null);      // the row.data object
  const [values, setValues] = useState({});
  const [secIdx, setSecIdx] = useState(0);
  const [openComments, setOpenComments] = useState({}); // fieldId -> bool
  const [matrixItems, setMatrixItems] = useState({});    // sectionId -> selected column (byItem)
  const [submitting, setSubmitting] = useState(false);

  const loadForms = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const rows = await listForms();
      setAllForms(rows);
      setForms(rows.filter(r => String(r.status || "").trim().toLowerCase() === "approved"));
    } catch (e) { setErr(e.message || String(e)); }
    setLoading(false);
  }, []);
  useEffect(() => { loadForms(); }, [loadForms]);

  const openForm = (row) => {
    const data = row.data || row;
    setForm({ ...data, id: data.id || row.id });
    setValues({}); setSecIdx(0); setOpenComments({}); setStage("fill");
  };

  const setV = (key, val) => setValues(v => ({ ...v, [key]: val }));

  const readPhoto = async (file, key) => {
    if (!file) return;
    try { const dataUrl = await compressImage(file, { maxDim: 1280, quality: 0.7 }); setV(key, dataUrl); }
    catch { note("Couldn't read photo"); }
  };

  // A single matrix cell (one column of a matrix check). Writes to
  // `${fieldId}_matrix_${column}` (+ _comment / _commentPhoto on a Fail).
  const renderMatrixControl = (f, col) => {
    const base = `${f.id}_matrix_${col}`;
    const cell = f.matrixCellType || "passfail";
    if (cell === "checkbox") {
      return <button className={`cf-toggle${values[base] ? " on" : ""}`} onClick={() => setV(base, !values[base])}>{values[base] ? "✓ Done" : "Mark done"}</button>;
    }
    if (cell === "number") {
      return (
        <div className="cf-numrow">
          <input className="cf-input" type="number" inputMode="decimal" value={values[base] ?? ""} onChange={e => setV(base, e.target.value)} />
          {f.unit && <span className="cf-unit">{f.unit}</span>}
        </div>
      );
    }
    if (cell === "text") {
      return <input className="cf-input" value={values[base] ?? ""} onChange={e => setV(base, e.target.value)} placeholder="…" />;
    }
    // default passfail
    const isFail = values[base] === "Fail";
    return (
      <>
        <div className="cf-btnrow">
          {["Pass", "Fail", ...(f.naAllowed ? ["N/A"] : [])].map(opt => (
            <button key={opt} className={`cf-pf cf-pf-${opt.replace("/", "").toLowerCase()}${values[base] === opt ? " on" : ""}`} onClick={() => setV(base, opt)}>{opt}</button>
          ))}
        </div>
        {isFail && (
          <div className="cf-comment" style={{ marginTop: 6 }}>
            <textarea className="cf-input" rows={2} value={values[`${base}_comment`] ?? ""} onChange={e => setV(`${base}_comment`, e.target.value)} placeholder="What's wrong?" />
            <label className="cf-photo-btn">{values[`${base}_commentPhoto`] ? "✓ Photo — replace" : "📷 Attach photo"}
              <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => readPhoto(e.target.files[0], `${base}_commentPhoto`)} />
            </label>
            {values[`${base}_commentPhoto`] && <img className="cf-thumb" src={values[`${base}_commentPhoto`]} alt="" />}
          </div>
        )}
      </>
    );
  };

  // ── Field renderer ──────────────────────────────────────────────────────────
  const renderInput = (f, rt) => {
    const key = `${f.id}_${rt}`;
    switch (rt) {
      case "checkbox":
        return (
          <button className={`cf-toggle${values[key] ? " on" : ""}`} onClick={() => setV(key, !values[key])}>
            {values[key] ? "✓ Done" : "Mark done"}
          </button>
        );
      case "passfail":
        return (
          <div className="cf-btnrow">
            {["Pass", "Fail", ...(f.naAllowed ? ["N/A"] : [])].map(opt => (
              <button key={opt} className={`cf-pf cf-pf-${opt.replace("/", "").toLowerCase()}${values[key] === opt ? " on" : ""}`} onClick={() => setV(key, opt)}>{opt}</button>
            ))}
          </div>
        );
      case "number":
        return (
          <div className="cf-numrow">
            <input className="cf-input" type="number" inputMode="decimal" value={values[key] ?? ""} onChange={e => setV(key, e.target.value)} />
            {f.unit && <span className="cf-unit">{f.unit}</span>}
          </div>
        );
      case "textfield":
        return <input className="cf-input" value={values[key] ?? ""} onChange={e => setV(key, e.target.value)} placeholder="Type answer…" />;
      case "dropdown":
        if (f.dropdownMulti) {
          const sel = Array.isArray(values[key]) ? values[key] : [];
          return (
            <div className="cf-chips">
              {(f.dropdownOptions || []).map(opt => (
                <button key={opt} className={`cf-chip${sel.includes(opt) ? " on" : ""}`} onClick={() => setV(key, sel.includes(opt) ? sel.filter(x => x !== opt) : [...sel, opt])}>{opt}</button>
              ))}
            </div>
          );
        }
        return (
          <select className="cf-input" value={values[key] ?? ""} onChange={e => setV(key, e.target.value)}>
            <option value="">— Select —</option>
            {(f.dropdownOptions || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        );
      case "datetime": {
        const mode = f.dtMode || "datetime";
        return (
          <div className="cf-numrow">
            {(mode === "date" || mode === "datetime") && <input className="cf-input" type="date" value={values[`${f.id}_date`] ?? ""} onChange={e => setV(`${f.id}_date`, e.target.value)} />}
            {(mode === "time" || mode === "datetime") && <input className="cf-input" type="time" value={values[`${f.id}_time`] ?? ""} onChange={e => setV(`${f.id}_time`, e.target.value)} />}
          </div>
        );
      }
      case "rating":
        return (
          <div className="cf-stars">
            {Array.from({ length: f.ratingMax || 5 }, (_, i) => i + 1).map(n => (
              <button key={n} className={`cf-star${(values[key] || 0) >= n ? " on" : ""}`} onClick={() => setV(key, n)}>★</button>
            ))}
          </div>
        );
      case "text": {
        const open = openComments[f.id] || f.required || values[key] || values[`${f.id}_commentPhoto`];
        if (!open) return <button className="cf-addcomment" onClick={() => setOpenComments(o => ({ ...o, [f.id]: true }))}>+ Comment</button>;
        return (
          <div className="cf-comment">
            <textarea className="cf-input" rows={2} value={values[key] ?? ""} onChange={e => setV(key, e.target.value)} placeholder="Comment…" />
            <label className="cf-photo-btn">{values[`${f.id}_commentPhoto`] ? "✓ Photo attached — replace" : "📷 Attach photo"}
              <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => readPhoto(e.target.files[0], `${f.id}_commentPhoto`)} />
            </label>
            {values[`${f.id}_commentPhoto`] && <img className="cf-thumb" src={values[`${f.id}_commentPhoto`]} alt="" />}
          </div>
        );
      }
      case "photo":
        return (
          <div className="cf-comment">
            <label className="cf-photo-btn">{values[key] ? "✓ Photo taken — retake" : "📷 Take / attach photo"}
              <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => readPhoto(e.target.files[0], key)} />
            </label>
            {values[key] && <img className="cf-thumb" src={values[key]} alt="" />}
          </div>
        );
      case "matrix":
        return (
          <div>
            {(f.matrixColumns || []).map(col => (
              <div className="cf-matrix-row" key={col}>
                <div className="cf-matrix-col">{col}</div>
                {renderMatrixControl(f, col)}
              </div>
            ))}
          </div>
        );
      case "markup":
        return <div className="cf-soon">Photo mark-up — coming soon.</div>;
      default:
        return <input className="cf-input" value={values[key] ?? ""} onChange={e => setV(key, e.target.value)} />;
    }
  };

  const renderField = (f) => {
    if (f.kind === "info") {
      return (
        <div key={f.id} className="cf-info">
          <div className="cf-info-title">{f.label}</div>
          {f.helpText && <div className="cf-info-body">{f.helpText}</div>}
        </div>
      );
    }
    return (
      <div key={f.id} className="cf-field">
        <div className="cf-label">{f.label}{f.required && <span className="cf-req"> *</span>}</div>
        {f.helpText && <div className="cf-help">{f.helpText}</div>}
        {f.refDoc && (/^https?:/.test(f.refDoc)
          ? <a className="cf-ref" href={f.refDoc} target="_blank" rel="noreferrer">📎 {f.refDoc}</a>
          : <div className="cf-ref">📎 {f.refDoc}</div>)}
        {f.refPhoto && <img className="cf-refphoto" src={f.refPhoto} alt="reference" />}
        {(f.responseTypes || []).map(rt => <div key={rt} className="cf-inputwrap">{renderInput(f, rt)}</div>)}
      </div>
    );
  };

  // Render a section, honouring matrixOrientation.
  const isMatrixField = (f) => f.kind === "check" && (f.responseTypes || []).includes("matrix");
  const renderSection = (sec) => {
    const fields = sec.fields || [];
    if (sec.matrixOrientation === "byItem") {
      const matrixFields = fields.filter(isMatrixField);
      const otherFields = fields.filter(f => !isMatrixField(f));
      const cols = [...new Set(matrixFields.flatMap(f => f.matrixColumns || []))];
      const item = matrixItems[sec.id] || "";
      return (
        <>
          {otherFields.map(renderField)}
          {matrixFields.length > 0 && (
            <div className="cf-field">
              <div className="cf-label">Select item</div>
              <div className="cf-item-picker">
                {cols.map(c => (
                  <button key={c} className={`cf-item-btn${item === c ? " on" : ""}`} onClick={() => setMatrixItems(m => ({ ...m, [sec.id]: c }))}>{c}</button>
                ))}
              </div>
            </div>
          )}
          {item && (
            <>
              <div className="cf-scope-note">Showing checks for item {item}</div>
              {matrixFields.filter(f => (f.matrixColumns || []).includes(item)).map(f => (
                <div key={f.id} className="cf-field">
                  <div className="cf-label">{f.label}{f.required && <span className="cf-req"> *</span>}</div>
                  {f.helpText && <div className="cf-help">{f.helpText}</div>}
                  {f.refDoc && (/^https?:/.test(f.refDoc)
                    ? <a className="cf-ref" href={f.refDoc} target="_blank" rel="noreferrer">📎 {f.refDoc}</a>
                    : <div className="cf-ref">📎 {f.refDoc}</div>)}
                  <div className="cf-inputwrap">{renderMatrixControl(f, item)}</div>
                </div>
              ))}
            </>
          )}
        </>
      );
    }
    return fields.map(renderField);
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const missingRequired = () => {
    const missing = [];
    (form.sections || []).forEach(sec => (sec.fields || []).forEach(f => {
      if (f.kind !== "check" || !f.required) return;
      const has = (f.responseTypes || []).some(rt => {
        if (rt === "datetime") return values[`${f.id}_date`] || values[`${f.id}_time`];
        if (rt === "matrix") {
          const cols = f.matrixColumns || [];
          return cols.length > 0 && cols.every(col => { const v = values[`${f.id}_matrix_${col}`]; return v !== undefined && v !== "" && v !== false; });
        }
        const v = values[`${f.id}_${rt}`];
        return Array.isArray(v) ? v.length : (v !== undefined && v !== "" && v !== false);
      });
      if (!has) missing.push(f.label || f.id);
    }));
    return missing;
  };

  const doSubmit = async () => {
    const missing = missingRequired();
    if (missing.length && !window.confirm(`${missing.length} required item(s) not filled in:\n\n• ${missing.slice(0, 8).join("\n• ")}${missing.length > 8 ? "\n…" : ""}\n\nSubmit anyway?`)) return;
    setSubmitting(true);
    try {
      await submitForm({ form, values, photos: {}, submittedBy: techName });
      setStage("done");
    } catch (e) { note("❌ Submit failed: " + (e.message || e)); }
    setSubmitting(false);
  };

  // ── Screens ─────────────────────────────────────────────────────────────────
  if (stage === "done") {
    return (
      <div className="mode-placeholder">
        <div className="mode-placeholder-icon">✓</div>
        <div className="mode-placeholder-title">Submitted</div>
        <div className="mode-placeholder-sub">{form.title} has been submitted. Thanks, {techName.split(" ")[0]}.</div>
        <button className="btn-primary" onClick={() => { setForm(null); setStage("list"); loadForms(); }}>Do another checklist</button>
      </div>
    );
  }

  if (stage === "fill" && form) {
    const sections = form.sections || [];
    const sec = sections[secIdx] || { fields: [] };
    const last = secIdx === sections.length - 1;
    return (
      <div className="cf-screen">
        <div className="cf-formhdr">
          <div className="cf-formtitle">{form.title}</div>
          <div className="cf-formmeta">{form.docRef ? form.docRef + " · " : ""}{sections.length > 1 ? `Section ${secIdx + 1} of ${sections.length}` : ""}</div>
          {sections.length > 1 && <div className="cf-secname">{sec.title}</div>}
        </div>
        {sections.length > 1 && (
          <div className="cf-navigator">
            {sections.map((s, i) => (
              <button key={s.id || i} className={`cf-navchip${i === secIdx ? " on" : ""}`} onClick={() => { setSecIdx(i); window.scrollTo(0, 0); }}>
                {i + 1}. {s.title || `Section ${i + 1}`}
              </button>
            ))}
          </div>
        )}
        <div className="cf-body">
          {renderSection(sec)}
        </div>
        <div className="cf-nav">
          {secIdx > 0 && <button className="btn-ghost cf-navbtn" onClick={() => { setSecIdx(i => i - 1); window.scrollTo(0, 0); }}>← Prev</button>}
          <button className="btn-ghost cf-navbtn" onClick={() => { if (window.confirm("Discard this checklist and go back?")) { setForm(null); setStage("list"); } }}>Cancel</button>
          {!last
            ? <button className="btn-primary cf-navbtn" onClick={() => { setSecIdx(i => i + 1); window.scrollTo(0, 0); }}>Next →</button>
            : <button className="btn-primary cf-navbtn" disabled={submitting} onClick={doSubmit}>{submitting ? "Submitting…" : "✓ Submit"}</button>}
        </div>
      </div>
    );
  }

  // list stage
  const byTag = {};
  forms.forEach(row => {
    const tags = row.tags && row.tags.length ? row.tags : ["Other"];
    (Array.isArray(tags) ? tags : [tags]).forEach(t => { (byTag[t] = byTag[t] || []).push(row); });
  });

  return (
    <div className="cf-screen">
      <div className="cf-body">
        <div className="cf-listhdr">Select a checklist</div>
        {loading && <div className="settings-desc">Loading…</div>}
        {err && <div className="cf-err">⚠ Could not load forms: {err}</div>}
        {!loading && !err && forms.length === 0 && (
          allForms.length === 0
            ? <div className="cf-err" style={{color:"#fbbf24",background:"#201808",borderColor:"#d97706"}}>No forms are visible to this app. Either none have been created, or the app doesn't have read access to the <code>forms</code> table (check the RLS policy for the <code>anon</code> role).</div>
            : <div className="cf-err" style={{color:"#fbbf24",background:"#201808",borderColor:"#d97706"}}>
                Found {allForms.length} form(s), but none are <strong>Approved</strong>. Statuses present: {[...new Set(allForms.map(f => f.status || "(none)"))].join(", ")}. Only approved checklists appear here — approve it in the Form Builder.
              </div>
        )}
        {Object.keys(byTag).sort().map(tag => (
          <div key={tag} style={{ marginBottom: 18 }}>
            <div className="cf-taghdr">{tag}</div>
            <div className="cf-cards">
              {byTag[tag].map(row => (
                <button key={row.id} className="cf-card" onClick={() => openForm(row)}>
                  <div className="cf-card-title">{row.title}</div>
                  <div className="cf-card-sub">{row.doc_ref ? row.doc_ref + " · " : ""}v{row.version || "1.0"}</div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
