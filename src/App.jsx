import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import * as XLSX from "xlsx";
import { saveSession, loadSession, clearSession } from "./storage.js";
import { compressImage } from "./photo.js";
import SyncPanel from "./SyncPanel.jsx";

// ─── MSAL CDN injection ───────────────────────────────────────────────────────
function injectMsal(callback) {
  if (window.msal) { callback(); return; }
  const existing = document.getElementById("msal-cdn");
  if (existing) { existing.addEventListener("load", callback); return; }
  const s = document.createElement("script");
  s.id = "msal-cdn";
  s.src = "https://alcdn.msauth.net/browser/2.38.3/js/msal-browser.min.js";
  s.onload = callback;
  s.onerror = () => console.warn("MSAL CDN failed — SSO unavailable");
  document.head.appendChild(s);
}

// ─── Status ───────────────────────────────────────────────────────────────────
const STATUS = { PENDING: "pending", DONE: "done", SKIPPED: "skipped" };
const STATUS_META = {
  pending:  { label: "Pending",      color: "#64748b", bg: "#1e2a3a", border: "#334155" },
  done:     { label: "Complete",     color: "#16a34a", bg: "#052e16", border: "#16a34a" },
  skipped:  { label: "Not Complete", color: "#dc2626", bg: "#2a0a0a", border: "#dc2626" },
};

// ─── Criticality ordering ─────────────────────────────────────────────────────
// Define the priority order for criticality values — most critical first.
// Keys are lowercase for matching; display uses the original capitalisation.
const CRITICALITY_ORDER = ["critical", "moderate", "minor", "low", "not reviewed", ""];
function criticalityRank(val) {
  const idx = CRITICALITY_ORDER.indexOf((val || "").toLowerCase().trim());
  return idx === -1 ? CRITICALITY_ORDER.length : idx;
}

// ─── Field keys ───────────────────────────────────────────────────────────────
const FIELD_KEYS = {
  taskId:           { label: "Task ID",           keywords: ["task id","taskid","task no","task number","tid"] },
  functLocation:    { label: "Funct Location",    keywords: ["funct loc","functional loc","funct location","functional location","floc","location"] },
  flocDesc:         { label: "Floc Description",  keywords: ["floc desc","functional location desc","floc description","equipment desc","description"] },
  opText:           { label: "Op Text",           keywords: ["op text","operation text","task desc","op desc","operation description"] },
  lubricant:        { label: "Lubricant",         keywords: ["lubricant","lube","oil","grease","fluid"] },
  route:            { label: "Route",             keywords: ["route","route no","route number","route id"] },
  acceptableLimit:  { label: "Acceptable Limit",  keywords: ["acceptable limit","limit","tolerance","spec"] },
  correctiveAction: { label: "Corrective Action", keywords: ["corrective action","corrective","action","remedy"] },
  systemCondition:  { label: "System Condition",  keywords: ["system condition","condition","sys condition","equipment condition"] },
  criticalityInd:   { label: "Criticality Ind",   keywords: ["criticality ind","criticality","critical ind","crit ind","priority ind"] },
  interval:         { label: "Interval",          keywords: ["interval","frequency","period","schedule"] },
  workProcedure:    { label: "Work Procedure",    keywords: ["work procedure","procedure","proc","wip","sop"] },
  order:            { label: "Order",             keywords: ["order","work order","wo","order no","order number","job"] },
};

function matchField(colName) {
  const lower = colName.toLowerCase().trim();
  for (const [key, meta] of Object.entries(FIELD_KEYS)) {
    if (meta.keywords.some(kw => lower === kw || lower.includes(kw) || kw.includes(lower))) return key;
  }
  return null;
}

function buildFieldMap(columns, savedMappings = {}) {
  const map = {};
  for (const [key, savedCol] of Object.entries(savedMappings)) {
    if (savedCol && columns.includes(savedCol)) map[key] = savedCol;
  }
  for (const col of columns) {
    const key = matchField(col);
    if (key && !map[key]) map[key] = col;
  }
  return map;
}

// ─── Location description map ─────────────────────────────────────────────────
// Parses the IH06 functional location file into a lookup:
//   { "NZ/054": "DEWATERING PLANT-NZ", "NZ/054/A01": "INLET KNIFE GATE VALVE", ... }
// Accepts .xls/.xlsx/.csv files exported from SAP IH06.
// The file is expected to have columns: "Functional Loc." and "FunctLocDescrip."
// or similarly named headers — we fuzzy-match.

function parseFlocDescFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buf = e.target.result;
        let rows = [];

        if (isBinaryOfficeFile(buf)) {
          // Real XLSX or binary XLS
          const wb = XLSX.read(buf, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
        } else {
          // Text/TSV file (SAP IH06 export masquerading as .xls)
          const text = new TextDecoder("latin-1").decode(new Uint8Array(buf));
          rows = parseTsv(text);
          if (!rows.length) {
            // Fallback: try XLSX anyway
            const wb = XLSX.read(buf, { type: "array" });
            const ws = wb.Sheets[wb.SheetNames[0]];
            rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
          }
        }

        if (!rows.length) { resolve({}); return; }

        // Fuzzy-match the floc and description columns
        const colNames = Object.keys(rows[0]);

        const flocCol = colNames.find(c => {
          const l = c.toLowerCase();
          return l.includes("functional loc") || l.includes("funct loc") || l === "floc" || l.includes("func loc");
        }) || colNames.find(c => c.toLowerCase().includes("loc"));

        const descCol = colNames.find(c => {
          const l = c.toLowerCase();
          return l.includes("descrip") || l.includes("description");
        }) || colNames.find(c => {
          const l = c.toLowerCase();
          return l.includes("desc") || l.includes("name");
        });

        if (!flocCol || !descCol) {
          // Return empty but with a diagnostic error so UI can show something useful
          reject(new Error(`Could not find location/description columns. Found: ${colNames.join(", ")}`));
          return;
        }

        const map = {};
        rows.forEach(row => {
          const loc  = String(row[flocCol]  || "").trim();
          const desc = String(row[descCol] || "").trim();
          if (loc && desc) map[loc] = desc;
        });
        resolve(map);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (e) => reject(new Error("File read error"));
    reader.readAsArrayBuffer(file);
  });
}

// Given a full floc string like "NZ/092/B02/MTR132" and the desc map,
// return the description for a given level (1=area, 2=subarea, 3=equipment prefix)
function getFlocLevelDesc(flocStr, descMap, level) {
  if (!flocStr || !descMap) return null;
  const parts = flocStr.split("/").map(s => s.trim()).filter(Boolean);
  // level 1 = parts[0]/parts[1] = "NZ/092"
  // level 2 = parts[0]/parts[1]/parts[2] = "NZ/092/B02"
  // level 3 = full string
  const key = parts.slice(0, level + 1).join("/");
  return descMap[key] || null;
}

// ─── Funct Location hierarchy ─────────────────────────────────────────────────
function parseFlocLevels(val) {
  if (!val) return [];
  return String(val).split("/").map(s => s.trim()).filter(Boolean);
}

function buildFlocHierarchy(tasks, fieldMap, descMap) {
  const col = fieldMap.functLocation;
  if (!col) return null;
  const l1Set = new Set(), l2PrefixByL1 = {}, l2ByL1 = {}, l3ByL2 = {};
  tasks.forEach(t => {
    const parts = parseFlocLevels(t.raw[col]);
    if (parts.length < 2) return;
    const l1Raw = parts[1]; // e.g. "092"
    const l1Key = parts.slice(0, 2).join("/"); // "NZ/092"
    const l1Label = (descMap && descMap[l1Key]) ? descMap[l1Key] : l1Raw;

    l1Set.add(l1Label);
    if (!l2PrefixByL1[l1Label]) l2PrefixByL1[l1Label] = new Set();
    if (!l2ByL1[l1Label]) l2ByL1[l1Label] = new Set();

    if (parts.length >= 3) {
      const l2Raw = parts[2];
      const l2Key = parts.slice(0, 3).join("/");
      const l2prefix = l2Raw.match(/^[A-Za-z]+/)?.[0] || l2Raw[0] || "";
      const l2Label = (descMap && descMap[l2Key]) ? descMap[l2Key] : l2Raw;
      l2PrefixByL1[l1Label].add(l2prefix);
      l2ByL1[l1Label].add(l2Label);

      if (!l3ByL2[l2Label]) l3ByL2[l2Label] = new Set();
      if (parts.length >= 4) l3ByL2[l2Label].add(parts[3]);
    }
  });

  // Store raw→label maps for reverse lookup in filters
  return { l1Set, l2PrefixByL1, l2ByL1, l3ByL2 };
}

// ─── Task ID dedup grouping ───────────────────────────────────────────────────
function groupTasksById(tasks, fieldMap) {
  const col = fieldMap.taskId;
  if (!col) return tasks.map(t => ({ ...t, children: [] }));
  const groups = {}, noId = [];
  tasks.forEach(t => {
    const tid = String(t.raw[col] ?? "").trim();
    if (!tid) { noId.push(t); return; }
    if (!groups[tid]) groups[tid] = [];
    groups[tid].push(t);
  });
  const grouped = [];
  Object.values(groups).forEach(grp => {
    const [leader, ...rest] = grp;
    grouped.push({ ...leader, children: rest.map(r => r.id) });
  });
  noId.forEach(t => grouped.push({ ...t, children: [] }));
  return grouped;
}

// ─── Display grouping ─────────────────────────────────────────────────────────
function getGroupValue(task, groupDef, fieldMap, descMap, getUpdatedCrit) {
  if (groupDef.type === "updatedCrit") {
    return getUpdatedCrit ? getUpdatedCrit(task).label : "—";
  }
  if (groupDef.type === "flocLevel") {
    const col = fieldMap.functLocation; if (!col) return "—";
    const flocStr = String(task.raw[col] || "");
    const parts = parseFlocLevels(flocStr);
    const level = parseInt(groupDef.value, 10);
    const rawKey = parts.slice(0, level + 1).join("/");
    return (descMap && descMap[rawKey]) ? descMap[rawKey] : (parts[level] || "—");
  }
  if (groupDef.type === "field") {
    const col = fieldMap[groupDef.value]; if (!col) return "—";
    return String(task.raw[col] ?? "") || "—";
  }
  return "—";
}

function buildDisplayGroups(tasks, groupConfig, depth, fieldMap, descMap, getUpdatedCrit) {
  if (!groupConfig || !groupConfig.length || depth >= groupConfig.length) return tasks;
  const def = groupConfig[depth];
  const buckets = {}, order = [];
  tasks.forEach(t => {
    const val = getGroupValue(t, def, fieldMap, descMap, getUpdatedCrit);
    if (!buckets[val]) { buckets[val] = []; order.push(val); }
    buckets[val].push(t);
  });
  const isCritSort = (def.type === "field" && def.value === "criticalityInd") || def.type === "updatedCrit";
  const sorted = isCritSort
    ? order.sort((a, b) => criticalityRank(a) - criticalityRank(b))
    : order.sort((a, b) => a.localeCompare(b));
  return sorted.map(key => ({
    key, label: key, groupDef: def, depth,
    items: buildDisplayGroups(buckets[key], groupConfig, depth + 1, fieldMap, descMap, getUpdatedCrit),
    isLeaf: depth === groupConfig.length - 1,
  }));
}

// ─── XLSX helpers ─────────────────────────────────────────────────────────────
// Robust TSV parser — finds the first line that has tabs and treats it as headers
function parseTsv(text) {
  const lines = text.split(/\r?\n/);
  const headerIdx = lines.findIndex(l => l.includes("\t") && l.trim().length > 0);
  if (headerIdx === -1) return [];
  const headers = lines[headerIdx].split("\t").map(h => h.trim());
  // Remove empty trailing headers
  while (headers.length && !headers[headers.length - 1]) headers.pop();
  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cells = line.split("\t");
    const row = {};
    headers.forEach((h, j) => { if (h) row[h] = (cells[j] || "").trim(); });
    if (Object.values(row).some(v => v)) rows.push(row);
  }
  return rows;
}

// Detect if an ArrayBuffer is a text/TSV file rather than a binary Office file.
// Real XLSX/XLS binary files start with specific magic bytes.
function isBinaryOfficeFile(buf) {
  const bytes = new Uint8Array(buf, 0, 8);
  // XLSX (ZIP): PK\x03\x04
  if (bytes[0] === 0x50 && bytes[1] === 0x4B) return true;
  // Legacy XLS (BIFF): \xD0\xCF\x11\xE0
  if (bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) return true;
  return false;
}

function parseXlsx(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buf = e.target.result;
        let data;
        if (isBinaryOfficeFile(buf)) {
          // Real XLSX or legacy binary XLS
          const wb = XLSX.read(buf, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          data = XLSX.utils.sheet_to_json(ws, { defval: "" });
        } else {
          // Text file (SAP exports .xls that is really TSV)
          const text = new TextDecoder("latin-1").decode(new Uint8Array(buf));
          data = parseTsv(text);
          if (!data.length) {
            // Last resort: try XLSX anyway
            const wb = XLSX.read(buf, { type: "array" });
            const ws = wb.Sheets[wb.SheetNames[0]];
            data = XLSX.utils.sheet_to_json(ws, { defval: "" });
          }
        }
        resolve({ data, columns: data.length ? Object.keys(data[0]) : [] });
      } catch (err) { reject(err); }
    };
    reader.onerror = (e) => reject(new Error("File read error: " + e));
    reader.readAsArrayBuffer(file);
  });
}

function doExport(tasks, filterFn, filename) {
  const rows = tasks.filter(filterFn).map(t => ({
    ...t.raw,
    "_Status": STATUS_META[t.status].label,
    "_Comment": t.comment || "",
    "_Actioned": t.actionedAt || "",
    "_ActionedBy": t.actionedBy || "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tasks");
  XLSX.writeFile(wb, filename);
}

// ─── Session store ────────────────────────────────────────────────────────────
// saveSession / loadSession / clearSession are now imported from ./storage.js
// (real IndexedDB persistence). Helper below converts a stored photo data URL
// back into a Blob for pushing to the cloud.
function dataURLtoBlob(dataUrl) {
  const [head, body] = dataUrl.split(",");
  const mime = (head.match(/:(.*?);/) || [null, "image/jpeg"])[1];
  const bytes = atob(body);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// ─── Default settings ─────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  azureClientId: "", azureTenantId: "",
  azureRedirectUri: typeof window !== "undefined" ? window.location.origin : "",
  sourceUrl: "", sourceFilename: "worklist.xlsx",
  exportUrl: "",
  exportCompletedFilename: "completed_tasks.xlsx",
  exportCompletedLinkedFilename: "completed_linked_tasks.xlsx",
  exportNotDoneFilename: "not_completed_tasks.xlsx",
  exportAllFilename: "worklist_all.xlsx",
  columnMappings: {
    taskId: "", functLocation: "", flocDesc: "", opText: "", lubricant: "",
    route: "", acceptableLimit: "", correctiveAction: "", systemCondition: "",
    criticalityInd: "", interval: "", workProcedure: "", order: "",
  },
  groupConfig: [],
  theme: "nzsteel-dark",
  // Updated Criticality escalation rules
  updatedCritSettings: {
    enabled: true,              // master toggle
    escalatePerChild: 2,        // number of linked tasks needed to escalate 1 level (e.g. 2 = every 2 children = +1 level)
    minChildrenToEscalate: 1,   // minimum children before any escalation kicks in
    maxEscalationLevels: 3,     // cap on how many levels it can escalate
  },
};

// ─── Themes ──────────────────────────────────────────────────────────────────
// Each theme defines a set of CSS custom property values injected on :root.
// Adding a new theme is just adding an entry here — no component changes needed.
const THEMES = {
  "nzsteel-dark": {
    label: "NZ Steel Dark",
    emoji: "🌑",
    preview: ["#0047BB", "#0a1628", "#1e3560"],
    vars: {
      "--brand":        "#0047BB",
      "--brand-light":  "#1a6fd4",
      "--brand-dim":    "#001a4a",
      "--bg-app":       "#0a1628",
      "--bg-mid":       "#0f1f3d",
      "--bg-card":      "#152040",
      "--bg-input":     "#0a1628",
      "--bg-bar":       "#0d1c35",
      "--bg-header":    "#0047BB",
      "--border":       "#1e3560",
      "--border-light": "#2a4a7a",
      "--text-primary": "#e8edf5",
      "--text-muted":   "#8fa3bf",
      "--text-dim":     "#5a7298",
      "--text-faint":   "#3d5a7a",
      "--text-vfaint":  "#2a3f5a",
      "--accent":       "#4a9eff",
      "--shadow":       "rgba(0,0,0,0.4)",
      "--row-hover":    "#0d1f3a",
      "--group-hdr":    "#0d1c35",
    },
  },
  "nzsteel-light": {
    label: "NZ Steel Light",
    emoji: "☀️",
    preview: ["#0047BB", "#f4f7fb", "#dbe4f0"],
    vars: {
      "--brand":        "#0047BB",
      "--brand-light":  "#1a6fd4",
      "--brand-dim":    "#dbeafe",
      "--bg-app":       "#f4f7fb",
      "--bg-mid":       "#ffffff",
      "--bg-card":      "#ffffff",
      "--bg-input":     "#f8fafc",
      "--bg-bar":       "#eef2f8",
      "--bg-header":    "#0047BB",
      "--border":       "#cdd8e8",
      "--border-light": "#b8cce0",
      "--text-primary": "#0f1f3d",
      "--text-muted":   "#3d5a7a",
      "--text-dim":     "#5a7298",
      "--text-faint":   "#8fa3bf",
      "--text-vfaint":  "#b8cce0",
      "--accent":       "#0047BB",
      "--shadow":       "rgba(0,71,187,0.12)",
      "--row-hover":    "#eef4ff",
      "--group-hdr":    "#eef2f8",
    },
  },
  "high-contrast": {
    label: "High Contrast",
    emoji: "⬛",
    preview: ["#ffffff", "#000000", "#ffff00"],
    vars: {
      "--brand":        "#ffff00",
      "--brand-light":  "#ffff99",
      "--brand-dim":    "#333300",
      "--bg-app":       "#000000",
      "--bg-mid":       "#111111",
      "--bg-card":      "#1a1a1a",
      "--bg-input":     "#000000",
      "--bg-bar":       "#0d0d0d",
      "--bg-header":    "#111111",
      "--border":       "#555555",
      "--border-light": "#777777",
      "--text-primary": "#ffffff",
      "--text-muted":   "#dddddd",
      "--text-dim":     "#aaaaaa",
      "--text-faint":   "#888888",
      "--text-vfaint":  "#555555",
      "--accent":       "#ffff00",
      "--shadow":       "rgba(0,0,0,0.8)",
      "--row-hover":    "#1a1a1a",
      "--group-hdr":    "#0d0d0d",
    },
  },
  "steel-grey": {
    label: "Steel Grey",
    emoji: "🔩",
    preview: ["#607080", "#1c2330", "#2d3748"],
    vars: {
      "--brand":        "#607080",
      "--brand-light":  "#7a8fa0",
      "--brand-dim":    "#1a2030",
      "--bg-app":       "#1c2330",
      "--bg-mid":       "#242e3d",
      "--bg-card":      "#2d3748",
      "--bg-input":     "#1c2330",
      "--bg-bar":       "#20293a",
      "--bg-header":    "#2d3748",
      "--border":       "#3d4f63",
      "--border-light": "#4a5f78",
      "--text-primary": "#e2e8f0",
      "--text-muted":   "#a0aec0",
      "--text-dim":     "#718096",
      "--text-faint":   "#4a5568",
      "--text-vfaint":  "#2d3748",
      "--accent":       "#90cdf4",
      "--shadow":       "rgba(0,0,0,0.5)",
      "--row-hover":    "#2a3547",
      "--group-hdr":    "#20293a",
    },
  },
  "safety-orange": {
    label: "Safety Orange",
    emoji: "🟠",
    preview: ["#ea580c", "#1a0d00", "#2d1500"],
    vars: {
      "--brand":        "#ea580c",
      "--brand-light":  "#f97316",
      "--brand-dim":    "#2d1500",
      "--bg-app":       "#1a0d00",
      "--bg-mid":       "#241200",
      "--bg-card":      "#2d1800",
      "--bg-input":     "#1a0d00",
      "--bg-bar":       "#200f00",
      "--bg-header":    "#2d1800",
      "--border":       "#4a2800",
      "--border-light": "#6b3a00",
      "--text-primary": "#fff7ed",
      "--text-muted":   "#fdba74",
      "--text-dim":     "#c2773a",
      "--text-faint":   "#7c3a10",
      "--text-vfaint":  "#4a2800",
      "--accent":       "#fb923c",
      "--shadow":       "rgba(0,0,0,0.5)",
      "--row-hover":    "#2d1800",
      "--group-hdr":    "#200f00",
    },
  },
  "forest": {
    label: "Forest",
    emoji: "🌲",
    preview: ["#16a34a", "#0a1f0d", "#122b16"],
    vars: {
      "--brand":        "#16a34a",
      "--brand-light":  "#22c55e",
      "--brand-dim":    "#052e16",
      "--bg-app":       "#0a1f0d",
      "--bg-mid":       "#112514",
      "--bg-card":      "#172d1a",
      "--bg-input":     "#0a1f0d",
      "--bg-bar":       "#0d2210",
      "--bg-header":    "#172d1a",
      "--border":       "#1e4027",
      "--border-light": "#2d5c38",
      "--text-primary": "#ecfdf5",
      "--text-muted":   "#6ee7b7",
      "--text-dim":     "#34d399",
      "--text-faint":   "#065f46",
      "--text-vfaint":  "#064e3b",
      "--accent":       "#4ade80",
      "--shadow":       "rgba(0,0,0,0.5)",
      "--row-hover":    "#172d1a",
      "--group-hdr":    "#0d2210",
    },
  },
  "daylight": {
    label: "Daylight",
    emoji: "🌤",
    preview: ["#2563eb", "#ffffff", "#f1f5f9"],
    vars: {
      "--brand":        "#2563eb",
      "--brand-light":  "#3b82f6",
      "--brand-dim":    "#eff6ff",
      "--bg-app":       "#f8fafc",
      "--bg-mid":       "#ffffff",
      "--bg-card":      "#f1f5f9",
      "--bg-input":     "#ffffff",
      "--bg-bar":       "#f1f5f9",
      "--bg-header":    "#2563eb",
      "--border":       "#cbd5e1",
      "--border-light": "#94a3b8",
      "--text-primary": "#0f172a",
      "--text-muted":   "#334155",
      "--text-dim":     "#64748b",
      "--text-faint":   "#94a3b8",
      "--text-vfaint":  "#cbd5e1",
      "--accent":       "#2563eb",
      "--shadow":       "rgba(37,99,235,0.1)",
      "--row-hover":    "#eff6ff",
      "--group-hdr":    "#e8f0fe",
    },
  },
  "warm-paper": {
    label: "Warm Paper",
    emoji: "📄",
    preview: ["#b45309", "#fefce8", "#fef3c7"],
    vars: {
      "--brand":        "#b45309",
      "--brand-light":  "#d97706",
      "--brand-dim":    "#fef3c7",
      "--bg-app":       "#fefce8",
      "--bg-mid":       "#ffffff",
      "--bg-card":      "#fef9ee",
      "--bg-input":     "#ffffff",
      "--bg-bar":       "#fef3c7",
      "--bg-header":    "#92400e",
      "--border":       "#e7c98a",
      "--border-light": "#d4a654",
      "--text-primary": "#1c1100",
      "--text-muted":   "#451a03",
      "--text-dim":     "#78350f",
      "--text-faint":   "#a16207",
      "--text-vfaint":  "#d4a654",
      "--accent":       "#b45309",
      "--shadow":       "rgba(180,83,9,0.12)",
      "--row-hover":    "#fef9e7",
      "--group-hdr":    "#fef3c7",
    },
  },
  "slate-pro": {
    label: "Slate Pro",
    emoji: "🪨",
    preview: ["#6366f1", "#f8fafc", "#e2e8f0"],
    vars: {
      "--brand":        "#6366f1",
      "--brand-light":  "#818cf8",
      "--brand-dim":    "#eef2ff",
      "--bg-app":       "#f8fafc",
      "--bg-mid":       "#ffffff",
      "--bg-card":      "#f1f5f9",
      "--bg-input":     "#ffffff",
      "--bg-bar":       "#f1f5f9",
      "--bg-header":    "#312e81",
      "--border":       "#e2e8f0",
      "--border-light": "#cbd5e1",
      "--text-primary": "#0f172a",
      "--text-muted":   "#1e293b",
      "--text-dim":     "#475569",
      "--text-faint":   "#94a3b8",
      "--text-vfaint":  "#cbd5e1",
      "--accent":       "#6366f1",
      "--shadow":       "rgba(99,102,241,0.1)",
      "--row-hover":    "#f5f3ff",
      "--group-hdr":    "#eef2ff",
    },
  },
};

// Apply a theme by injecting CSS variables on :root
function applyTheme(themeKey) {
  const theme = THEMES[themeKey] || THEMES["nzsteel-dark"];
  const root = document.documentElement;
  Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v));
}


const GROUP_OPTIONS = [
  { type: "flocLevel",       value: "1",                  label: "Location L1 (Area)" },
  { type: "flocLevel",       value: "2",                  label: "Location L2 (Sub-area)" },
  { type: "flocLevel",       value: "3",                  label: "Location L3 (Equipment)" },
  { type: "updatedCrit",     value: "updatedCriticalityInd", label: "Updated Criticality" },
  { type: "field",           value: "criticalityInd",     label: "Criticality Ind (original)" },
  { type: "field",           value: "lubricant",          label: "Lubricant" },
  { type: "field",           value: "route",              label: "Route" },
  { type: "field",           value: "systemCondition",    label: "System Condition" },
  { type: "field",           value: "interval",           label: "Interval" },
  { type: "field",           value: "workProcedure",      label: "Work Procedure" },
];

const DETAIL_FIELDS = [
  { key: "functLocation",    wide: false },
  { key: "lubricant",        wide: false },
  { key: "route",            wide: false },
  { key: "acceptableLimit",  wide: false },
  { key: "correctiveAction", wide: true  },
  { key: "systemCondition",  wide: false },
  { key: "criticalityInd",   wide: false },
  { key: "interval",         wide: false },
  { key: "workProcedure",    wide: false },
  { key: "order",            wide: false },
];

// Criticality badge colours for the filter bar
const CRITICALITY_COLORS = {
  "critical":     { color: "#dc2626", bg: "#2a0a0a", border: "#dc262666" },
  "moderate":     { color: "#f59e0b", bg: "#1c1400", border: "#f59e0b66" },
  "minor":        { color: "#3b82f6", bg: "#0c1829", border: "#3b82f666" },
  "low":          { color: "#16a34a", bg: "#052e16", border: "#16a34a66" },
  "not reviewed": { color: "#64748b", bg: "#1e2a3a", border: "#33415566" },
};
function critColor(val) {
  return CRITICALITY_COLORS[(val || "").toLowerCase().trim()] || { color: "#64748b", bg: "#1e2a3a", border: "#33415566" };
}

// ─── Styles — all colours via CSS custom properties ──────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@400;700;800&family=Roboto:wght@300;400;500;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { font-size: 16px; }
  body { font-family: 'Roboto', sans-serif; background: var(--bg-app); color: var(--text-primary); min-height: 100vh; -webkit-text-size-adjust: 100%; transition: background 0.25s, color 0.25s; }
  .app { height: 100vh; display: flex; flex-direction: column; overflow: hidden; }

  /* ── Header ── */
  .hdr { background: var(--bg-header); padding: 0 20px; display: flex; align-items: stretch; justify-content: space-between; gap: 14px; flex-shrink: 0; box-shadow: 0 2px 16px var(--shadow); }
  .hdr-brand { display: flex; align-items: center; gap: 14px; padding: 14px 0; border-right: 1px solid rgba(255,255,255,0.18); padding-right: 20px; }
  .hdr-logo { width: 44px; height: 44px; background: white; border-radius: 5px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .hdr-logo-txt { font-family: 'Roboto Condensed', sans-serif; font-size: 14px; font-weight: 800; color: var(--brand); letter-spacing: -0.5px; line-height: 1.1; text-align: center; }
  .hdr-brand-text { display: flex; flex-direction: column; gap: 1px; }
  .hdr-brand-name { font-family: 'Roboto Condensed', sans-serif; font-size: 18px; font-weight: 800; color: white; text-transform: uppercase; letter-spacing: 0.5px; }
  .hdr-brand-sub  { font-size: 11px; color: rgba(255,255,255,0.6); letter-spacing: 2px; text-transform: uppercase; }
  .hdr-center { flex: 1; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 12px 0 12px 16px; }
  .hdr-right  { display: flex; align-items: center; gap: 8px; padding: 12px 0; }
  .stat-pill { font-family: 'Roboto Condensed', sans-serif; font-size: 13px; font-weight: 700; padding: 5px 12px; border-radius: 4px; white-space: nowrap; }
  .prog-wrap { display: flex; align-items: center; gap: 8px; }
  .prog-track { width: 90px; height: 5px; background: rgba(255,255,255,0.2); border-radius: 3px; overflow: hidden; }
  .prog-fill  { height: 100%; background: white; border-radius: 3px; transition: width 0.4s; }
  .prog-pct   { font-family: 'Roboto Condensed', sans-serif; font-size: 14px; font-weight: 700; color: rgba(255,255,255,0.75); }
  .hdr-icon-btn { background: rgba(255,255,255,0.14); border: none; color: white; width: 44px; height: 44px; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 20px; transition: background 0.15s; flex-shrink: 0; }
  .hdr-icon-btn:hover { background: rgba(255,255,255,0.24); }
  .hdr-user-chip { display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.14); border-radius: 6px; padding: 8px 14px; font-size: 14px; color: rgba(255,255,255,0.9); font-weight: 500; white-space: nowrap; cursor: pointer; border: none; min-height: 44px; }
  .hdr-user-chip:hover { background: rgba(255,255,255,0.24); }
  .hdr-user-avatar { width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,0.25); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: white; flex-shrink: 0; }

  /* ── Net banner ── */
  .net-banner { padding: 7px 20px; display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 500; flex-shrink: 0; }
  .net-banner.online  { background: #052e16; color: #4ade80; border-bottom: 1px solid #16a34a22; }
  .net-banner.offline { background: #2a0a0a; color: #fca5a5; border-bottom: 2px solid #dc2626; }
  .net-banner.checking{ background: var(--bg-mid); color: var(--accent); border-bottom: 1px solid var(--border); }
  .net-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .net-banner.online .net-dot  { background: #4ade80; box-shadow: 0 0 6px #4ade80; }
  .net-banner.offline .net-dot { background: #dc2626; animation: pulse-red 1.4s infinite; }
  @keyframes pulse-red { 0%,100%{opacity:1;}50%{opacity:0.3;} }
  .net-msg { flex: 1; }
  .net-recheck { font-family: 'Roboto Condensed', sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; background: none; border: 1px solid currentColor; border-radius: 3px; color: inherit; padding: 4px 10px; cursor: pointer; min-height: 32px; }
  .net-saved { font-family: 'Roboto Condensed', sans-serif; font-size: 11px; color: rgba(255,255,255,0.3); margin-left: auto; }

  /* ── Sign-in ── */
  .signin-wrap { min-height: 100vh; background: var(--bg-app); display: flex; align-items: center; justify-content: center; padding: 24px; }
  .signin-card { background: var(--bg-mid); border: 1px solid var(--border); border-radius: 14px; padding: 40px 36px; width: 100%; max-width: 440px; display: flex; flex-direction: column; gap: 24px; }
  .signin-logo { display: flex; align-items: center; gap: 14px; justify-content: center; }
  .signin-logo-mark { width: 56px; height: 56px; background: var(--brand); border-radius: 10px; display: flex; align-items: center; justify-content: center; }
  .signin-logo-txt { font-family: 'Roboto Condensed', sans-serif; font-size: 16px; font-weight: 800; color: white; line-height: 1.1; text-align: center; }
  .signin-brand { display: flex; flex-direction: column; gap: 2px; }
  .signin-brand-name { font-family: 'Roboto Condensed', sans-serif; font-size: 22px; font-weight: 800; color: var(--text-primary); text-transform: uppercase; letter-spacing: 0.5px; }
  .signin-brand-sub  { font-size: 12px; color: var(--text-dim); letter-spacing: 2px; text-transform: uppercase; }
  .signin-title { font-family: 'Roboto Condensed', sans-serif; font-size: 28px; font-weight: 800; color: var(--text-primary); text-align: center; text-transform: uppercase; }
  .signin-sub { font-size: 15px; color: var(--text-dim); text-align: center; line-height: 1.5; }
  .btn-sso { display: flex; align-items: center; justify-content: center; gap: 12px; width: 100%; background: white; color: #1a1a2e; border: none; border-radius: 8px; padding: 16px 24px; font-size: 17px; font-weight: 700; cursor: pointer; transition: all 0.15s; min-height: 56px; font-family: 'Roboto', sans-serif; }
  .btn-sso:hover { background: #f0f4ff; box-shadow: 0 4px 20px rgba(0,71,187,0.3); }
  .btn-sso:disabled { opacity: 0.5; cursor: not-allowed; }
  .ms-logo { width: 24px; height: 24px; flex-shrink: 0; }
  .signin-divider { display: flex; align-items: center; gap: 12px; color: var(--text-vfaint); font-size: 13px; }
  .signin-divider::before, .signin-divider::after { content: ""; flex: 1; height: 1px; background: var(--border); }
  .form-row { display: flex; flex-direction: column; gap: 7px; }
  .form-lbl { font-family: 'Roboto Condensed', sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--text-dim); }
  .form-input { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border); border-radius: 6px; padding: 14px 16px; font-size: 17px; font-family: 'Roboto', sans-serif; outline: none; transition: border-color 0.15s; width: 100%; min-height: 52px; }
  .form-input:focus { border-color: var(--brand); }
  .form-input::placeholder { color: var(--text-vfaint); }
  .signin-error { font-size: 14px; color: #dc2626; text-align: center; font-weight: 500; }

  /* ── Upload ── */
  .upload-screen { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 36px 24px; gap: 24px; overflow-y: auto; background: var(--bg-app); }
  .upload-hero { font-family: 'Roboto Condensed', sans-serif; font-size: clamp(32px, 4.5vw, 58px); font-weight: 800; letter-spacing: 1px; text-transform: uppercase; line-height: 1.15; text-align: center; color: var(--text-primary); }
  .upload-hero span { color: var(--accent); }
  .upload-zone { width: 100%; max-width: 540px; border: 2px dashed var(--border); border-radius: 10px; padding: 48px 32px; display: flex; flex-direction: column; align-items: center; gap: 18px; cursor: pointer; transition: all 0.2s; background: var(--bg-mid); }
  .upload-zone:hover, .upload-zone.drag { border-color: var(--brand); background: var(--bg-card); }
  .upload-icon { font-size: 56px; }
  .upload-cta { font-family: 'Roboto Condensed', sans-serif; font-size: 20px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; text-align: center; }
  .upload-sub  { font-size: 15px; color: var(--text-faint); }
  .sp-fetch-row { display: flex; gap: 10px; align-items: center; width: 100%; max-width: 540px; }
  .sp-url-display { flex: 1; background: var(--bg-input); border: 1px solid var(--border); border-radius: 6px; padding: 12px 14px; font-size: 14px; color: var(--text-dim); font-family: 'Roboto', sans-serif; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hint { max-width: 540px; width: 100%; background: var(--bg-mid); border-radius: 7px; padding: 16px 20px; border-left: 3px solid var(--brand); }
  .hint h3 { font-family: 'Roboto Condensed', sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--accent); margin-bottom: 8px; }
  .hint p { font-size: 14px; color: var(--text-dim); line-height: 1.6; }
  .hint code { background: var(--bg-input); padding: 2px 6px; border-radius: 3px; font-size: 13px; color: var(--text-muted); font-family: monospace; }

  /* ── Mapper ── */
  .mapper-screen { flex: 1; display: flex; flex-direction: column; align-items: center; padding: 28px 20px; gap: 18px; overflow-y: auto; background: var(--bg-app); }
  .mapper-title { font-family: 'Roboto Condensed', sans-serif; font-size: 26px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: var(--text-primary); }
  .mapper-card  { background: var(--bg-mid); border: 1px solid var(--border); border-radius: 10px; padding: 24px; width: 100%; max-width: 720px; }
  .mapper-intro { font-size: 14px; color: var(--text-dim); line-height: 1.6; margin-bottom: 20px; }
  .mapper-grid  { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media (max-width: 540px) { .mapper-grid { grid-template-columns: 1fr; } }
  .map-row { display: flex; flex-direction: column; gap: 5px; }
  .map-lbl { font-family: 'Roboto Condensed', sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--text-muted); display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
  .map-tag { font-size: 10px; padding: 2px 6px; border-radius: 2px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
  .map-tag.card   { background: var(--brand-dim); color: var(--accent); border: 1px solid var(--brand); }
  .map-tag.detail { background: #1a1a2e; color: #a78bfa; border: 1px solid #6d28d955; }
  .map-tag.drop   { background: #0f2a1a; color: #4ade80; border: 1px solid #16a34a55; }
  .map-tag.search { background: #0a1f14; color: #86efac; border: 1px solid #16a34a33; }
  .map-tag.group  { background: #2a1505; color: #fb923c; border: 1px solid #ea580c55; }
  .map-tag.hier   { background: #0f1a2a; color: #7dd3fc; border: 1px solid #0284c755; }
  .map-sel { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border); border-radius: 5px; padding: 11px 13px; font-size: 15px; font-family: 'Roboto', sans-serif; cursor: pointer; appearance: none; outline: none; transition: border-color 0.15s; width: 100%; min-height: 48px; }
  .map-sel:focus { border-color: var(--brand); }
  .map-sel.matched { border-color: #16a34a; }
  .mapper-actions { display: flex; gap: 12px; margin-top: 20px; }

  /* ── Buttons ── */
  .btn-primary { background: var(--brand); color: white; border: none; border-radius: 6px; font-family: 'Roboto Condensed', sans-serif; font-size: 17px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 14px 32px; cursor: pointer; transition: background 0.15s; min-height: 52px; }
  .btn-primary:hover { background: var(--brand-light); }
  .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-ghost { background: transparent; color: rgba(255,255,255,0.7); border: 1px solid rgba(255,255,255,0.25); border-radius: 5px; font-family: 'Roboto Condensed', sans-serif; font-size: 14px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 10px 18px; cursor: pointer; transition: all 0.15s; white-space: nowrap; min-height: 44px; }
  .btn-ghost:hover { border-color: rgba(255,255,255,0.55); color: white; }
  .btn-danger { background: #991b1b; color: white; border: none; border-radius: 5px; font-family: 'Roboto Condensed', sans-serif; font-size: 15px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 12px 22px; cursor: pointer; transition: background 0.15s; min-height: 48px; }
  .btn-danger:hover { background: #dc2626; }

  /* ── List layout ── */
  .list-layout { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

  /* ── Filter bar ── */
  .filter-bar { background: var(--bg-bar); border-bottom: 1px solid var(--border); padding: 10px 16px; display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }
  .filter-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .f-status-group { display: flex; gap: 3px; background: var(--bg-input); border-radius: 5px; padding: 4px; }
  .f-status-btn { font-family: 'Roboto Condensed', sans-serif; font-size: 13px; font-weight: 700; padding: 8px 14px; border-radius: 3px; border: none; background: transparent; color: var(--text-dim); cursor: pointer; transition: all 0.15s; white-space: nowrap; min-height: 40px; }
  .f-status-btn:hover { color: var(--text-muted); }
  .f-status-btn.active { background: var(--brand); color: white; }
  .f-sel { background: var(--bg-input); color: var(--text-muted); border: 1px solid var(--border); border-radius: 5px; padding: 8px 11px; font-size: 14px; font-family: 'Roboto', sans-serif; outline: none; cursor: pointer; max-width: 180px; min-height: 40px; }
  .f-sel:focus { border-color: var(--brand); }
  .f-sel.active { border-color: var(--brand); color: var(--accent); background: var(--brand-dim); }
  .hier-group { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; background: var(--bg-input); border: 1px solid var(--border); border-radius: 6px; padding: 6px 12px; }
  .hier-lbl { font-family: 'Roboto Condensed', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--brand); white-space: nowrap; }
  .hier-arrow { color: var(--border); font-size: 14px; }
  .f-search { position: relative; }
  .f-search input { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border); border-radius: 5px; padding: 8px 10px 8px 30px; font-size: 14px; font-family: 'Roboto', sans-serif; outline: none; transition: border-color 0.15s; width: 100%; min-height: 40px; }
  .f-search input:focus { border-color: var(--brand); }
  .f-search input::placeholder { color: var(--text-vfaint); }
  .f-search input.active { border-color: var(--brand); background: var(--brand-dim); color: var(--accent); }
  .f-search-ico { position: absolute; left: 9px; top: 50%; transform: translateY(-50%); color: var(--text-vfaint); font-size: 14px; pointer-events: none; }
  .filter-count { font-family: 'Roboto Condensed', sans-serif; font-size: 13px; color: var(--text-faint); white-space: nowrap; margin-left: auto; }
  .clear-all { font-family: 'Roboto Condensed', sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; background: none; border: none; color: var(--text-faint); cursor: pointer; padding: 4px 6px; min-height: 36px; }
  .clear-all:hover { color: var(--text-muted); }

  /* ── Group headers ── */
  .group-hdr { display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: var(--group-hdr); border-bottom: 1px solid var(--border); cursor: pointer; user-select: none; min-height: 52px; }
  .group-hdr:hover { filter: brightness(1.08); }
  .group-hdr-depth-0 { border-left: 4px solid var(--brand); }
  .group-hdr-depth-1 { border-left: 4px solid var(--brand-light); padding-left: 28px; background: var(--bg-app); }
  .group-hdr-depth-2 { border-left: 4px solid var(--border); padding-left: 44px; background: var(--bg-input); }
  .group-chevron { color: var(--text-faint); font-size: 16px; transition: transform 0.2s; }
  .group-chevron.open { transform: rotate(90deg); }
  .group-hdr-label { font-family: 'Roboto Condensed', sans-serif; font-size: 16px; font-weight: 700; color: var(--text-muted); flex: 1; }
  .group-hdr-depth-0 .group-hdr-label { color: var(--text-primary); font-size: 17px; }
  .group-hdr-stats { display: flex; gap: 6px; }
  .group-stat { font-family: 'Roboto Condensed', sans-serif; font-size: 12px; font-weight: 700; padding: 3px 9px; border-radius: 3px; white-space: nowrap; }
  .crit-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 7px; vertical-align: middle; flex-shrink: 0; }

  /* ── Task rows ── */
  .task-list { flex: 1; overflow-y: auto; }
  .task-row { display: flex; align-items: stretch; border-bottom: 1px solid var(--bg-mid); cursor: pointer; transition: background 0.1s; min-height: 72px; background: var(--bg-app); }
  .task-row:hover { background: var(--row-hover); }
  .task-row:active { filter: brightness(1.1); }
  .task-row.indent-1 { padding-left: 16px; }
  .task-row.indent-2 { padding-left: 32px; }
  .row-bar { width: 4px; flex-shrink: 0; }
  .row-body { flex: 1; padding: 13px 15px; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
  .row-top { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .row-floc { font-size: 16px; font-weight: 500; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
  .row-order { font-family: 'Roboto Condensed', sans-serif; font-size: 13px; color: var(--accent); font-weight: 700; white-space: nowrap; flex-shrink: 0; }
  .row-optext { font-size: 14px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row-tags { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .row-tag { font-family: 'Roboto Condensed', sans-serif; font-size: 12px; font-weight: 700; padding: 3px 9px; border-radius: 3px; background: var(--bg-mid); color: var(--text-dim); white-space: nowrap; border: 1px solid var(--border); }
  .row-tag.lube { background: var(--brand-dim); color: var(--accent); border-color: var(--brand); }
  .row-tag.floc { background: var(--bg-input); color: var(--text-muted); border-color: var(--border-light); }
  .group-badge { display: flex; flex-direction: column; align-items: center; justify-content: center; background: var(--bg-mid); border: 1px solid var(--border-light); border-radius: 5px; min-width: 46px; padding: 3px 7px; flex-shrink: 0; }
  .group-count { font-family: 'Roboto Condensed', sans-serif; font-size: 26px; font-weight: 800; color: var(--accent); line-height: 1; }
  .group-sub   { font-family: 'Roboto Condensed', sans-serif; font-size: 9px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--text-faint); }
  .row-right { padding: 13px 13px 13px 6px; display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .s-chip { font-family: 'Roboto Condensed', sans-serif; font-size: 12px; font-weight: 700; text-transform: uppercase; padding: 4px 10px; border-radius: 3px; white-space: nowrap; border: 1px solid transparent; }
  .row-chevron { color: var(--text-vfaint); font-size: 20px; }
  .empty-state { padding: 60px 24px; text-align: center; color: var(--border); font-family: 'Roboto Condensed', sans-serif; font-size: 18px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }

  /* ── Export bar ── */
  .export-bar { background: var(--bg-bar); border-top: 1px solid var(--border); padding: 10px 16px; display: flex; gap: 8px; align-items: center; flex-shrink: 0; flex-wrap: wrap; }
  .exp-lbl { font-family: 'Roboto Condensed', sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--text-faint); }
  .btn-exp { font-family: 'Roboto Condensed', sans-serif; font-size: 14px; font-weight: 700; text-transform: uppercase; padding: 10px 16px; border-radius: 4px; border: none; cursor: pointer; transition: all 0.15s; min-height: 44px; }
  .btn-exp.green { background: #15803d; color: #f0fdf4; } .btn-exp.green:hover { background: #16a34a; }
  .btn-exp.red   { background: #991b1b; color: #fee2e2; } .btn-exp.red:hover   { background: #dc2626; }
  .btn-exp.blue  { background: var(--brand); color: white; } .btn-exp.blue:hover  { background: var(--brand-light); }
  .btn-exp:disabled { opacity: 0.35; cursor: not-allowed; }
  .offline-msg { font-size: 13px; color: #dc2626; font-family: 'Roboto Condensed', sans-serif; }

  /* ── Bulk selection ── */
  .row-check { display: flex; align-items: center; padding: 0 4px 0 12px; flex-shrink: 0; }
  .row-check-box { width: 26px; height: 26px; border-radius: 6px; border: 2px solid var(--border-light); display: flex; align-items: center; justify-content: center; color: white; font-size: 15px; font-weight: 700; background: var(--bg-input); }
  .row-check-box.on { background: var(--brand); border-color: var(--brand); }
  .task-row.row-selected { background: var(--brand-dim); }
  .bulk-bar { background: var(--bg-bar); border-top: 1px solid var(--brand); padding: 10px 16px; display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }
  .bulk-bar-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .bulk-count { font-family: 'Roboto Condensed', sans-serif; font-size: 15px; font-weight: 700; color: var(--accent); }
  .bulk-link { background: none; border: none; color: var(--text-dim); font-family: 'Roboto Condensed', sans-serif; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; cursor: pointer; padding: 4px 6px; min-height: 36px; }
  .bulk-link:hover { color: var(--text-primary); }
  .bulk-comment { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border); border-radius: 6px; padding: 11px 14px; font-size: 15px; font-family: 'Roboto', sans-serif; outline: none; width: 100%; min-height: 44px; }
  .bulk-comment:focus { border-color: var(--brand); }
  .bulk-act { flex: 1; border: none; border-radius: 7px; color: white; font-family: 'Roboto Condensed', sans-serif; font-size: 16px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 14px; cursor: pointer; min-height: 52px; }
  .bulk-act.done { background: #15803d; } .bulk-act.done:hover { background: #16a34a; }
  .bulk-act.skip { background: #991b1b; } .bulk-act.skip:hover { background: #dc2626; }
  .bulk-act:disabled { opacity: 0.4; cursor: not-allowed; }

  /* ── Detail panel ── */
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.75); z-index: 200; display: flex; align-items: flex-end; justify-content: center; }
  .panel { background: var(--bg-mid); width: 100%; max-width: 780px; border-radius: 14px 14px 0 0; border-top: 3px solid var(--brand); display: flex; flex-direction: column; max-height: 92vh; animation: slideUp 0.2s ease; }
  @keyframes slideUp { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  .panel-handle { width: 36px; height: 4px; background: var(--border); border-radius: 2px; margin: 12px auto 0; flex-shrink: 0; }
  .panel-hdr { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-shrink: 0; }
  .panel-hdr-left { flex: 1; min-width: 0; }
  .panel-badges { display: flex; gap: 7px; align-items: center; margin-bottom: 8px; flex-wrap: wrap; }
  .panel-order-badge { font-family: 'Roboto Condensed', sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--accent); background: var(--brand-dim); padding: 4px 10px; border-radius: 3px; border: 1px solid var(--brand); }
  .panel-tid-badge   { font-family: 'Roboto Condensed', sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #fb923c; background: #2a1505; padding: 4px 10px; border-radius: 3px; border: 1px solid #ea580c44; }
  .panel-group-info  { font-family: 'Roboto Condensed', sans-serif; font-size: 13px; color: var(--text-dim); }
  .panel-floc { font-size: clamp(18px, 2.5vw, 26px); font-weight: 500; color: var(--text-primary); line-height: 1.3; }
  .panel-optext { font-size: 15px; color: var(--text-dim); margin-top: 5px; line-height: 1.5; }
  .panel-x { background: var(--bg-input); border: 1px solid var(--border); color: var(--text-dim); font-size: 18px; width: 40px; height: 40px; border-radius: 5px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .panel-x:hover { border-color: var(--text-dim); color: var(--text-primary); }
  .panel-body { flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 14px; }
  .detail-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(165px, 1fr)); gap: 8px; }
  .detail-field { background: var(--bg-input); border: 1px solid var(--border); border-radius: 5px; padding: 11px 14px; }
  .detail-field.wide { grid-column: span 2; }
  .detail-lbl { font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--text-faint); margin-bottom: 5px; }
  .detail-val { font-size: 15px; color: var(--text-muted); line-height: 1.4; }
  .detail-val.empty { color: var(--border); font-style: italic; }
  .loc-breadcrumb { font-size: 12px; color: var(--text-dim); margin-top: 4px; font-style: italic; }
  .subtasks-section { background: var(--bg-input); border: 1px solid var(--border); border-radius: 7px; padding: 14px 16px; }
  .subtasks-title { font-family: 'Roboto Condensed', sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--text-faint); margin-bottom: 10px; }
  .subtask-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--bg-mid); }
  .subtask-row:last-child { border-bottom: none; }
  .subtask-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .subtask-text { flex: 1; font-size: 14px; color: var(--text-muted); }
  .subtask-chip { font-family: 'Roboto Condensed', sans-serif; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 3px; white-space: nowrap; }
  .panel-status-row { display: flex; align-items: center; gap: 9px; }
  .panel-status-lbl { font-family: 'Roboto Condensed', sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--text-faint); }
  .comment-lbl { font-family: 'Roboto Condensed', sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--text-faint); margin-bottom: 7px; }
  .comment-ta { width: 100%; background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border); border-radius: 7px; padding: 13px 15px; font-size: 16px; font-family: 'Roboto', sans-serif; resize: none; min-height: 80px; outline: none; transition: border-color 0.15s; }
  .comment-ta:focus { border-color: var(--brand); }
  .comment-ta::placeholder { color: var(--border); }
  .panel-actions { display: flex; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--border); flex-shrink: 0; }
  .pa-done  { flex: 1; background: #15803d; color: white; border: none; border-radius: 8px; font-family: 'Roboto Condensed', sans-serif; font-size: 20px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 18px; cursor: pointer; transition: all 0.15s; min-height: 64px; }
  .pa-done:hover, .pa-done.active  { background: #16a34a; }
  .pa-skip  { flex: 1; background: #991b1b; color: white; border: none; border-radius: 8px; font-family: 'Roboto Condensed', sans-serif; font-size: 20px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 18px; cursor: pointer; transition: all 0.15s; min-height: 64px; }
  .pa-skip:hover, .pa-skip.active  { background: #dc2626; }
  .pa-reset { background: var(--bg-input); color: var(--text-dim); border: 1px solid var(--border); border-radius: 8px; font-family: 'Roboto Condensed', sans-serif; font-size: 20px; font-weight: 700; padding: 18px; cursor: pointer; transition: all 0.15s; min-height: 64px; }
  .pa-reset:hover { border-color: var(--text-dim); color: var(--text-muted); }

  /* ── Settings ── */
  .settings-screen { flex: 1; overflow-y: auto; background: var(--bg-app); }
  .settings-inner  { max-width: 760px; margin: 0 auto; padding: 28px 20px; display: flex; flex-direction: column; gap: 22px; }
  .settings-title  { font-family: 'Roboto Condensed', sans-serif; font-size: 26px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: var(--text-primary); }
  .settings-section { background: var(--bg-mid); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
  .settings-section-hdr { padding: 14px 20px; background: var(--bg-card); border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px; }
  .settings-section-icon { font-size: 20px; }
  .settings-section-title { font-family: 'Roboto Condensed', sans-serif; font-size: 15px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--text-muted); }
  .settings-section-body { padding: 20px; display: flex; flex-direction: column; gap: 16px; }
  .settings-row { display: flex; flex-direction: column; gap: 6px; }
  .settings-lbl { font-family: 'Roboto Condensed', sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--text-dim); }
  .settings-desc { font-size: 13px; color: var(--text-faint); margin-top: 3px; line-height: 1.5; }
  .settings-input { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border); border-radius: 5px; padding: 12px 14px; font-size: 15px; font-family: 'Roboto', sans-serif; outline: none; transition: border-color 0.15s; width: 100%; min-height: 48px; }
  .settings-input:focus { border-color: var(--brand); }
  .settings-input::placeholder { color: var(--text-vfaint); }
  .col-map-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media (max-width: 540px) { .col-map-grid { grid-template-columns: 1fr; } }
  .col-map-row { display: flex; flex-direction: column; gap: 5px; }
  .col-map-lbl { font-family: 'Roboto Condensed', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--text-dim); }

  /* Theme picker */
  .theme-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
  .theme-card { background: var(--bg-input); border: 2px solid var(--border); border-radius: 10px; padding: 14px 12px; cursor: pointer; transition: all 0.15s; display: flex; flex-direction: column; gap: 8px; }
  .theme-card:hover { border-color: var(--brand-light); transform: translateY(-1px); }
  .theme-card.active { border-color: var(--brand); background: var(--brand-dim); }
  .theme-swatches { display: flex; gap: 4px; }
  .theme-swatch { width: 20px; height: 20px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.15); flex-shrink: 0; }
  .theme-name { font-family: 'Roboto Condensed', sans-serif; font-size: 13px; font-weight: 700; color: var(--text-primary); letter-spacing: 0.3px; }
  .theme-emoji { font-size: 18px; line-height: 1; }
  .theme-active-badge { font-family: 'Roboto Condensed', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--brand); }

  /* Location file load */
  .loc-load-row { display: flex; gap: 10px; align-items: center; }
  .loc-status { font-size: 13px; padding: 6px 12px; border-radius: 4px; }
  .loc-status.loaded { background: #052e16; color: #4ade80; border: 1px solid #16a34a44; }
  .loc-status.empty  { background: var(--bg-card); color: var(--text-dim); border: 1px solid var(--border); }
  .loc-preview { background: var(--bg-input); border: 1px solid var(--border); border-radius: 5px; padding: 12px 14px; font-size: 13px; color: var(--text-dim); max-height: 140px; overflow-y: auto; }
  .loc-preview-item { display: flex; gap: 10px; padding: 3px 0; border-bottom: 1px solid var(--bg-mid); }
  .loc-preview-item:last-child { border-bottom: none; }
  .loc-preview-key { color: var(--accent); font-family: monospace; min-width: 120px; font-size: 12px; }

  /* Toggle */
  .settings-toggle { display: flex; align-items: center; gap: 14px; cursor: pointer; min-height: 40px; }
  .toggle-track { width: 48px; height: 28px; background: var(--border); border-radius: 14px; position: relative; transition: background 0.2s; flex-shrink: 0; }
  .toggle-track.on { background: var(--brand); }
  .toggle-thumb { width: 22px; height: 22px; background: white; border-radius: 50%; position: absolute; top: 3px; left: 3px; transition: left 0.2s; }
  .toggle-track.on .toggle-thumb { left: 23px; }
  .toggle-label { font-size: 15px; color: var(--text-primary); }

  /* Grouping builder */
  .group-config-list { display: flex; flex-direction: column; gap: 10px; }
  .group-config-item { display: flex; align-items: center; gap: 10px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 6px; padding: 10px 14px; }
  .group-config-num { font-family: 'Roboto Condensed', sans-serif; font-size: 14px; font-weight: 700; color: var(--text-faint); width: 24px; flex-shrink: 0; }
  .group-config-select { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border); border-radius: 5px; padding: 8px 11px; font-size: 14px; font-family: 'Roboto', sans-serif; outline: none; flex: 1; cursor: pointer; min-height: 44px; }
  .group-config-select:focus { border-color: var(--brand); }
  .group-config-remove { background: none; border: none; color: var(--text-faint); font-size: 20px; cursor: pointer; padding: 4px 8px; border-radius: 4px; min-height: 40px; display: flex; align-items: center; }
  .group-config-remove:hover { color: #dc2626; background: #2a0a0a; }
  .group-add-btn { background: var(--bg-card); border: 1px dashed var(--border); border-radius: 6px; color: var(--accent); font-family: 'Roboto Condensed', sans-serif; font-size: 14px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 12px; cursor: pointer; transition: all 0.15s; width: 100%; min-height: 48px; }
  .group-add-btn:hover { border-color: var(--brand); }
  .group-preview { background: var(--bg-input); border: 1px solid var(--border); border-radius: 6px; padding: 13px 16px; }
  .group-preview-title { font-family: 'Roboto Condensed', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--text-faint); margin-bottom: 9px; }
  .group-preview-item { font-size: 14px; color: var(--text-dim); display: flex; align-items: center; gap: 7px; padding: 3px 0; }
  .group-preview-arrow { color: var(--brand); }

  /* ── Notifications & Issues ── */
  .notif-panel { background: var(--bg-mid); width: 100%; max-width: 780px; border-radius: 14px 14px 0 0; border-top: 3px solid #f59e0b; display: flex; flex-direction: column; max-height: 92vh; animation: slideUp 0.2s ease; }
  .notif-hdr { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-shrink: 0; }
  .notif-hdr-title { font-family: 'Roboto Condensed', sans-serif; font-size: 20px; font-weight: 800; color: var(--text-primary); text-transform: uppercase; letter-spacing: 1px; }
  .notif-hdr-sub { font-size: 13px; color: var(--text-dim); margin-top: 2px; }
  .notif-body { flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 14px; }
  .notif-type-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .notif-type-btn { flex: 1; min-width: 120px; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 10px; border-radius: 8px; border: 2px solid var(--border); background: var(--bg-input); color: var(--text-muted); font-family: 'Roboto Condensed', sans-serif; font-size: 15px; font-weight: 700; text-transform: uppercase; cursor: pointer; transition: all 0.15s; }
  .notif-type-btn.selected { border-color: #f59e0b; background: #1c1400; color: #f59e0b; }
  .notif-type-btn.issue-selected { border-color: #dc2626; background: #2a0a0a; color: #dc2626; }
  .notif-field { display: flex; flex-direction: column; gap: 6px; }
  .notif-field-lbl { font-family: 'Roboto Condensed', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--text-dim); }
  .notif-input { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border); border-radius: 6px; padding: 12px 14px; font-size: 15px; font-family: 'Roboto', sans-serif; outline: none; transition: border-color 0.15s; width: 100%; min-height: 48px; }
  .notif-input:focus { border-color: #f59e0b; }
  .notif-input::placeholder { color: var(--text-vfaint); }
  .notif-ta { width: 100%; background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border); border-radius: 6px; padding: 12px 14px; font-size: 15px; font-family: 'Roboto', sans-serif; resize: none; min-height: 90px; outline: none; transition: border-color 0.15s; }
  .notif-ta:focus { border-color: #f59e0b; }
  .notif-ta::placeholder { color: var(--text-vfaint); }
  .photo-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  .photo-thumb { width: 72px; height: 72px; border-radius: 6px; object-fit: cover; border: 1px solid var(--border); cursor: pointer; }
  .photo-add-btn { width: 72px; height: 72px; border-radius: 6px; border: 2px dashed var(--border); background: var(--bg-input); display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; color: var(--text-faint); font-size: 24px; gap: 4px; transition: border-color 0.15s; }
  .photo-add-btn:hover { border-color: #f59e0b; color: #f59e0b; }
  .photo-lbl { font-size: 10px; font-family: 'Roboto Condensed', sans-serif; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
  .notif-actions { display: flex; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--border); flex-shrink: 0; }
  .pa-notif { flex: 1; background: #92400e; color: white; border: none; border-radius: 8px; font-family: 'Roboto Condensed', sans-serif; font-size: 18px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 16px; cursor: pointer; transition: all 0.15s; min-height: 60px; }
  .pa-notif:hover { background: #b45309; }
  .pa-notif.blue { background: var(--brand); }
  .pa-notif.blue:hover { background: var(--brand-light); }
  .notif-list-panel { background: var(--bg-mid); width: 100%; max-width: 780px; border-radius: 14px 14px 0 0; border-top: 3px solid #f59e0b; display: flex; flex-direction: column; max-height: 92vh; animation: slideUp 0.2s ease; }
  .notif-log-row { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--bg-mid); cursor: pointer; transition: background 0.1s; background: var(--bg-app); }
  .notif-log-row:hover { background: var(--row-hover); }
  .notif-type-badge { font-family: 'Roboto Condensed', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 3px 9px; border-radius: 3px; white-space: nowrap; flex-shrink: 0; margin-top: 2px; }
  .notif-log-body { flex: 1; min-width: 0; }
  .notif-log-title { font-size: 15px; font-weight: 500; color: var(--text-primary); margin-bottom: 3px; }
  .notif-log-meta  { font-size: 12px; color: var(--text-dim); }
  .notif-log-photos { display: flex; gap: 6px; margin-top: 6px; }
  .notif-log-thumb { width: 44px; height: 44px; border-radius: 4px; object-fit: cover; border: 1px solid var(--border); }

  /* ── Fab (removed but kept stub) ── */
  .fab { position: fixed; bottom: 90px; right: 20px; z-index: 150; display: flex; flex-direction: column; gap: 10px; align-items: flex-end; }

  /* ── Toast ── */
  .toast { position: fixed; bottom: 86px; left: 50%; transform: translateX(-50%); background: var(--brand); color: white; font-family: 'Roboto Condensed', sans-serif; font-size: 15px; font-weight: 700; padding: 12px 22px; border-radius: 6px; box-shadow: 0 4px 24px var(--shadow); z-index: 400; animation: fadeInUp 0.25s ease; pointer-events: none; white-space: nowrap; }
  @keyframes fadeInUp { from { opacity:0; transform:translateX(-50%) translateY(8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }

  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
`;
// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  // MSAL
  const [msalReady, setMsalReady]       = useState(false);
  const [msalInstance, setMsalInstance] = useState(null);
  const [authAccount, setAuthAccount]   = useState(null);
  const [authLoading, setAuthLoading]   = useState(false);
  const [authError, setAuthError]       = useState("");
  const [manualName, setManualName]     = useState("");
  const [manualAuthed, setManualAuthed] = useState(false);
  const [signOutConfirm, setSignOutConfirm] = useState(false);

  const authed   = !!authAccount || manualAuthed;
  const techName = authAccount?.name || authAccount?.username || manualName || "Technician";

  // Data
  const [screen, setScreen]     = useState("upload");
  const [rawData, setRawData]   = useState([]);
  const [columns, setColumns]   = useState([]);
  const [fieldMap, setFieldMap] = useState({});
  const [tasks, setTasks]       = useState([]);
  const [drag, setDrag]         = useState(false);
  const fileRef    = useRef();
  const locFileRef = useRef();
  const srcPickerRef = useRef();    // file picker to set source file path
  const expPickerRef = useRef();    // file picker to set export folder path

  // Export submenu
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  // Location description map
  const [descMap, setDescMap]           = useState({}); // { "NZ/092": "MELTER 1", ... }
  const [descMapLoaded, setDescMapLoaded] = useState(false);
  const [descMapCount, setDescMapCount]   = useState(0);

  // Network
  const [netStatus, setNetStatus] = useState("checking");
  const [lastSaved, setLastSaved] = useState(null);
  const [toast, setToast]         = useState(null);
  const [fetching, setFetching]   = useState(false);

  // Filters
  const [statusFilter, setStatusFilter]     = useState("all");
  const [searchFloc, setSearchFloc]         = useState("");
  const [searchOpText, setSearchOpText]     = useState("");
  const [searchLimit, setSearchLimit]       = useState("");
  const [searchAction, setSearchAction]     = useState("");
  const [searchProcedure, setSearchProcedure] = useState("");
  const [searchOrder, setSearchOrder]       = useState("");
  const [dropLubricant, setDropLubricant]   = useState("");
  const [dropRoute, setDropRoute]           = useState("");
  const [dropCriticality, setDropCriticality]           = useState("");
  const [dropUpdatedCriticality, setDropUpdatedCriticality] = useState("");
  const [dropCondition, setDropCondition]   = useState("");
  const [dropInterval, setDropInterval]     = useState("");
  const [hierL1, setHierL1]                 = useState("");
  const [hierL2, setHierL2]                 = useState("");
  const [hierL3, setHierL3]                 = useState("");

  // Grouping
  const [collapsedGroups, setCollapsedGroups] = useState({});

  // Panel
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [panelComment, setPanelComment]   = useState("");

  // Bulk selection (main-screen multi-close)
  const [selectMode, setSelectMode]   = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkComment, setBulkComment] = useState("");

  // ── Notifications & Issues
  // Each item: { id, type: "notification"|"issue", taskId?, functLocation, title, description, photos: [dataUrl], createdAt, createdBy }
  const [notifications, setNotifications]       = useState([]);
  const [showNotifForm, setShowNotifForm]        = useState(false); // "new"|"task"|false
  const [showNotifLog, setShowNotifLog]          = useState(false);
  const [notifFormTask, setNotifFormTask]        = useState(null); // the task group it's attached to (if from task panel)
  const [notifFormType, setNotifFormType]        = useState("notification"); // "notification"|"issue"
  const [notifFormFloc, setNotifFormFloc]        = useState("");
  const [notifFormFlocDesc, setNotifFormFlocDesc] = useState("");
  const [notifFormTitle, setNotifFormTitle]      = useState("");
  const [notifFormDesc, setNotifFormDesc]        = useState("");
  const [notifFormPhotos, setNotifFormPhotos]    = useState([]); // array of dataURLs
  const [viewingNotif, setViewingNotif]          = useState(null); // notification id for detail view
  const photoInputRef = useRef();

  // Apply theme on mount and whenever it changes
  useEffect(() => { applyTheme(settings.theme || "nzsteel-dark"); }, [settings.theme]);

  // Network
  useEffect(() => {
    const upd = () => setNetStatus(navigator.onLine ? "online" : "offline");
    upd();
    window.addEventListener("online", upd); window.addEventListener("offline", upd);
    return () => { window.removeEventListener("online", upd); window.removeEventListener("offline", upd); };
  }, []);

  // Auto-save
  useEffect(() => {
    if (tasks.length === 0) return;
    saveSession({ tasks, fieldMap, columns, rawData, settings, descMap, notifications });
    setLastSaved(new Date().toLocaleTimeString());
  }, [tasks, settings, fieldMap, columns, rawData, descMap, notifications]);

  // Restore session
  useEffect(() => {
    (async () => {
      const saved = await loadSession();
      if (saved?.tasks?.length > 0) {
        setTasks(saved.tasks); setFieldMap(saved.fieldMap || {}); setColumns(saved.columns || []);
        setRawData(saved.rawData || []);
        if (saved.settings) setSettings(s => ({ ...s, ...saved.settings }));
        if (saved.notifications) setNotifications(saved.notifications);
        if (saved.descMap && Object.keys(saved.descMap).length > 0) {
          setDescMap(saved.descMap); setDescMapLoaded(true); setDescMapCount(Object.keys(saved.descMap).length);
        }
        setScreen("list"); showToast("Session restored");
      }
    })();
  }, []);

  // MSAL init
  useEffect(() => {
    const { azureClientId, azureTenantId, azureRedirectUri } = settings;
    if (!azureClientId || !azureTenantId) return;
    injectMsal(() => {
      if (!window.msal) return;
      try {
        const config = {
          auth: { clientId: azureClientId, authority: `https://login.microsoftonline.com/${azureTenantId}`, redirectUri: azureRedirectUri || window.location.origin },
          cache: { cacheLocation: "sessionStorage", storeAuthStateInCookie: false },
        };
        const instance = new window.msal.PublicClientApplication(config);
        instance.initialize().then(() => {
          instance.handleRedirectPromise().then(resp => {
            if (resp?.account) { instance.setActiveAccount(resp.account); setAuthAccount(resp.account); }
            else {
              const accounts = instance.getAllAccounts();
              if (accounts.length > 0) { instance.setActiveAccount(accounts[0]); setAuthAccount(accounts[0]); }
            }
          }).catch(e => setAuthError(String(e)));
          setMsalInstance(instance); setMsalReady(true);
        });
      } catch (e) { setAuthError("MSAL init: " + String(e)); }
    });
  }, [settings.azureClientId, settings.azureTenantId, settings.azureRedirectUri]);

  const showToast = (msg, dur = 2600) => { setToast(msg); setTimeout(() => setToast(null), dur); };

  const handleMsalSignIn = async () => {
    if (!msalInstance) return;
    setAuthLoading(true); setAuthError("");
    const scopes = ["User.Read", "Files.ReadWrite.All"];
    try {
      const result = await msalInstance.loginPopup({ scopes, prompt: "select_account" });
      msalInstance.setActiveAccount(result.account); setAuthAccount(result.account);
    } catch (e) {
      if (String(e).includes("popup_window_error") || String(e).includes("user_cancelled")) {
        try { await msalInstance.loginRedirect({ scopes }); } catch (e2) { setAuthError("Sign-in failed: " + String(e2)); }
      } else { setAuthError("Sign-in failed: " + String(e)); }
    }
    setAuthLoading(false);
  };

  const getSharePointToken = async () => {
    if (!msalInstance || !authAccount) return null;
    try {
      const r = await msalInstance.acquireTokenSilent({ scopes: ["https://graph.microsoft.com/Files.ReadWrite.All"], account: authAccount });
      return r.accessToken;
    } catch {
      try { const r = await msalInstance.acquireTokenPopup({ scopes: ["https://graph.microsoft.com/Files.ReadWrite.All"] }); return r.accessToken; }
      catch { return null; }
    }
  };

  const handleSignOut = () => {
    if (msalInstance && authAccount) msalInstance.logoutPopup({ account: authAccount }).catch(() => {});
    setAuthAccount(null); setManualAuthed(false); setManualName(""); setSignOutConfirm(false);
    showToast("Signed out");
  };

  // ─── Location description file loader ────────────────────────────────────────
  const loadLocFile = async (file) => {
    try {
      const map = await parseFlocDescFile(file);
      const count = Object.keys(map).length;
      if (count === 0) { showToast("⚠ No location data found — check file has Functional Loc. and FunctLocDescrip. columns"); return; }
      setDescMap(map); setDescMapLoaded(true); setDescMapCount(count);
      showToast(`✓ Loaded ${count} location descriptions`);
    } catch (e) {
      const msg = e?.message || String(e);
      showToast("❌ " + (msg.length > 80 ? msg.slice(0, 80) + "…" : msg), 5000);
    }
  };

  // ─── Work file loader — auto-maps, skips mapper if possible ──────────────────
  const processFile = useCallback(async (file) => {
    try {
      const { data, columns: cols } = await parseXlsx(file);
      const fm = buildFieldMap(cols, settings.columnMappings);
      const discovered = { ...settings.columnMappings };
      for (const [key, col] of Object.entries(fm)) { if (!discovered[key]) discovered[key] = col; }
      setSettings(s => ({ ...s, columnMappings: discovered }));
      setRawData(data); setColumns(cols); setFieldMap(fm);
      const coreFields = ["flocDesc", "opText"];
      if (coreFields.every(k => fm[k])) {
        const t = data.map((row, i) => ({ id: i, raw: row, status: STATUS.PENDING, comment: "", actionedAt: "", actionedBy: "" }));
        setTasks(t); resetFilters(); setScreen("list");
        showToast(`Loaded ${data.length} tasks`);
      } else { setScreen("map"); }
    } catch (e) {
      const msg = e?.message || String(e);
      alert("Could not read file: " + msg + "\n\nPlease upload a valid .xlsx or .xls (or SAP tab-separated export).");
    }
  }, [settings.columnMappings]);

  const onDrop = (e) => { e.preventDefault(); setDrag(false); processFile(e.dataTransfer.files[0]); };

  const fetchFromSharePoint = async () => {
    if (!settings.sourceUrl) { showToast("⚠ Configure SharePoint URL in Settings first"); return; }
    if (netStatus !== "online") { showToast("📴 Offline — cannot fetch"); return; }
    setFetching(true);
    try {
      const token = authAccount ? await getSharePointToken() : null;
      if (!token) { showToast("⚠ Sign in with Microsoft to fetch from SharePoint"); setFetching(false); return; }
      const spUrl = settings.sourceUrl.replace(/\/$/, "");
      const encodedPath = encodeURIComponent(`${spUrl}/${settings.sourceFilename}`);
      const graphUrl = `https://graph.microsoft.com/v1.0/shares/u!${btoa(encodedPath).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}/driveItem/content`;
      const resp = await fetch(graphUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      await processFile(new File([blob], settings.sourceFilename, { type: blob.type }));
      showToast(`✓ Fetched ${settings.sourceFilename} from SharePoint`);
    } catch (e) { showToast(`❌ SharePoint fetch failed: ${e.message}`); }
    setFetching(false);
  };

  const pushToSharePoint = async (tasks, filterFn, filename) => {
    if (!settings.exportUrl || !authAccount) { doExport(tasks, filterFn, filename); return; }
    const token = await getSharePointToken();
    if (!token) { doExport(tasks, filterFn, filename); return; }
    try {
      const rows = tasks.filter(filterFn).map(t => ({ ...t.raw, "_Status": STATUS_META[t.status].label, "_Comment": t.comment||"", "_Actioned": t.actionedAt||"", "_ActionedBy": t.actionedBy||"" }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Tasks");
      const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const spUrl = settings.exportUrl.replace(/\/$/, "");
      const encodedPath = encodeURIComponent(`${spUrl}/${filename}`);
      const uploadUrl = `https://graph.microsoft.com/v1.0/shares/u!${btoa(encodedPath).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}/driveItem/content`;
      const resp = await fetch(uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }, body: blob });
      if (resp.ok) showToast(`✓ Pushed ${filename} to SharePoint`);
      else { doExport(tasks, filterFn, filename); showToast("⚠ SharePoint push failed — downloaded locally"); }
    } catch { doExport(tasks, filterFn, filename); }
  };

  const startWork = () => {
    const t = rawData.map((row, i) => ({ id: i, raw: row, status: STATUS.PENDING, comment: "", actionedAt: "", actionedBy: "" }));
    setTasks(t); resetFilters(); setScreen("list");
  };

  const resetFilters = () => {
    setStatusFilter("all"); setSearchFloc(""); setSearchOpText(""); setSearchLimit("");
    setSearchAction(""); setSearchProcedure(""); setSearchOrder("");
    setDropLubricant(""); setDropRoute(""); setDropCriticality(""); setDropUpdatedCriticality(""); setDropCondition(""); setDropInterval("");
    setHierL1(""); setHierL2(""); setHierL3("");
  };

  const fv = useCallback((task, key) => {
    const col = fieldMap[key]; return col ? String(task.raw[col] ?? "") : "";
  }, [fieldMap]);

  // Get the human-readable location description for a floc string at a given level
  const flocDesc = useCallback((flocStr, level) => {
    return getFlocLevelDesc(flocStr, descMap, level) || null;
  }, [descMap]);

  const groupedTasks = useMemo(() => groupTasksById(tasks, fieldMap), [tasks, fieldMap]);
  const taskById     = useMemo(() => { const m = {}; tasks.forEach(t => { m[t.id] = t; }); return m; }, [tasks]);

  const uniqueVals = useCallback((key) => {
    const col = fieldMap[key]; if (!col) return [];
    return [...new Set(tasks.map(t => String(t.raw[col])).filter(v => v && v !== "undefined" && v.trim()))].sort();
  }, [tasks, fieldMap]);

  // ── Updated Criticality — must be declared before the memos that use it
  // Escalates based on linked duplicate task count, controlled by settings.updatedCritSettings.
  const getUpdatedCriticality = useCallback((group) => {
    const base = fv(group, "criticalityInd") || "Not Reviewed";
    const baseRank = criticalityRank(base);
    const cs = settings.updatedCritSettings || {};
    if (!cs.enabled) {
      const label = base.charAt(0).toUpperCase() + base.slice(1);
      return { label, changed: false, base, baseRank, newRank: baseRank };
    }
    const childCount = group.children?.length || 0;
    const minChildren = cs.minChildrenToEscalate ?? 1;
    const perChild    = cs.escalatePerChild      ?? 2;
    const maxLevels   = cs.maxEscalationLevels   ?? 3;
    const effectiveChildren = childCount >= minChildren ? childCount : 0;
    const escalation = Math.min(Math.floor(effectiveChildren / Math.max(perChild, 1)), maxLevels);
    const newRank = Math.max(0, baseRank - escalation);
    const escalatedLabel = CRITICALITY_ORDER[newRank] || CRITICALITY_ORDER[0];
    const label = escalatedLabel.charAt(0).toUpperCase() + escalatedLabel.slice(1);
    return { label, changed: newRank < baseRank, base, baseRank, newRank, escalation };
  }, [fv, settings.updatedCritSettings]);

  // Criticality values sorted by severity (original and updated)
  const criticalityVals = useMemo(() => {
    const vals = uniqueVals("criticalityInd");
    return vals.sort((a, b) => criticalityRank(a) - criticalityRank(b));
  }, [uniqueVals]);

  const updatedCritVals = useMemo(() => {
    const vals = [...new Set(groupedTasks.map(g => getUpdatedCriticality(g).label))].filter(Boolean);
    return vals.sort((a, b) => criticalityRank(a) - criticalityRank(b));
  }, [groupedTasks, getUpdatedCriticality]);

  const flocHier = useMemo(() => buildFlocHierarchy(tasks, fieldMap, descMap), [tasks, fieldMap, descMap]);
  const l1Options = useMemo(() => flocHier ? [...flocHier.l1Set].sort() : [], [flocHier]);
  const l2Options = useMemo(() => (!flocHier || !hierL1) ? [] : [...(flocHier.l2ByL1[hierL1]||[])].sort(), [flocHier, hierL1]);
  const l3Options = useMemo(() => (!flocHier || !hierL2) ? [] : [...(flocHier.l3ByL2[hierL2]||[])].sort(), [flocHier, hierL2]);

  // Helper: does a task match the hierarchy filter (using desc labels)
  const matchesHier = useCallback((task) => {
    if (!fieldMap.functLocation) return true;
    if (!hierL1 && !hierL2 && !hierL3) return true;
    const flocStr = String(task.raw[fieldMap.functLocation] || "");
    const parts = parseFlocLevels(flocStr);
    if (hierL1) {
      const l1Key = parts.slice(0, 2).join("/");
      const l1Label = (descMap && descMap[l1Key]) ? descMap[l1Key] : (parts[1] || "");
      if (l1Label !== hierL1) return false;
    }
    if (hierL2) {
      const l2Key = parts.slice(0, 3).join("/");
      const l2Label = (descMap && descMap[l2Key]) ? descMap[l2Key] : (parts[2] || "");
      if (l2Label !== hierL2) return false;
    }
    if (hierL3) { if (parts[3] !== hierL3) return false; }
    return true;
  }, [fieldMap, descMap, hierL1, hierL2, hierL3]);

  const filtered = useMemo(() => {
    const lc = s => s.toLowerCase();
    return groupedTasks.filter(g => {
      if (statusFilter !== "all" && g.status !== statusFilter) return false;
      if (searchFloc && !lc(fv(g,"flocDesc")).includes(lc(searchFloc))) return false;
      if (searchOpText && !lc(fv(g,"opText")).includes(lc(searchOpText))) return false;
      if (searchLimit && !lc(fv(g,"acceptableLimit")).includes(lc(searchLimit))) return false;
      if (searchAction && !lc(fv(g,"correctiveAction")).includes(lc(searchAction))) return false;
      if (searchProcedure && !lc(fv(g,"workProcedure")).includes(lc(searchProcedure))) return false;
      if (searchOrder && !lc(fv(g,"order")).includes(lc(searchOrder))) return false;
      if (dropLubricant && fv(g,"lubricant") !== dropLubricant) return false;
      if (dropRoute && fv(g,"route") !== dropRoute) return false;
      if (dropCriticality && fv(g,"criticalityInd") !== dropCriticality) return false;
      if (dropUpdatedCriticality && getUpdatedCriticality(g).label !== dropUpdatedCriticality) return false;
      if (dropCondition && fv(g,"systemCondition") !== dropCondition) return false;
      if (dropInterval && fv(g,"interval") !== dropInterval) return false;
      if (!matchesHier(g)) return false;
      return true;
    });
  }, [groupedTasks,statusFilter,searchFloc,searchOpText,searchLimit,searchAction,
      searchProcedure,searchOrder,dropLubricant,dropRoute,dropCriticality,dropUpdatedCriticality,
      dropCondition,dropInterval,matchesHier,fv,getUpdatedCriticality]);

  const displayTree = useMemo(() => {
    if (!settings.groupConfig?.length) return null;
    return buildDisplayGroups(filtered, settings.groupConfig, 0, fieldMap, descMap, getUpdatedCriticality);
  }, [filtered, settings.groupConfig, fieldMap, descMap, getUpdatedCriticality]);

  const hasFilter = statusFilter!=="all"||searchFloc||searchOpText||searchLimit||
    searchAction||searchProcedure||searchOrder||dropLubricant||dropRoute||
    dropCriticality||dropUpdatedCriticality||dropCondition||dropInterval||hierL1||hierL2||hierL3;

  const done         = groupedTasks.filter(g => g.status===STATUS.DONE).length;
  const skipped      = groupedTasks.filter(g => g.status===STATUS.SKIPPED).length;
  const pending      = groupedTasks.filter(g => g.status===STATUS.PENDING).length;
  const total        = groupedTasks.length;
  const pct          = total ? Math.round(((done+skipped)/total)*100) : 0;

  // For "Completed Linked": flat tasks that are children of a done group
  const doneGroupLeaderIds = new Set(
    groupedTasks.filter(g => g.status===STATUS.DONE && g.children.length>0).map(g=>g.id)
  );
  const doneLinkedIds = new Set(
    groupedTasks.filter(g => g.status===STATUS.DONE && g.children.length>0)
      .flatMap(g=>g.children)
  );
  const completedLinkedCount = doneLinkedIds.size;

  // Export helpers split by leader vs linked
  const doExportCompleted = () => {
    // Leaders only (not child rows)
    const allChildIds = new Set(groupedTasks.flatMap(g=>g.children));
    pushToSharePoint(tasks, t => t.status===STATUS.DONE && !allChildIds.has(t.id), settings.exportCompletedFilename);
  };
  const doExportCompletedLinked = () => {
    pushToSharePoint(tasks, t => doneLinkedIds.has(t.id), settings.exportCompletedLinkedFilename);
  };

  const updateManyTasks = (ids, patch) =>
    setTasks(prev => prev.map(t => ids.includes(t.id) ? { ...t, ...patch } : t));

  const openGroup  = (g) => { setActiveGroupId(g.id); setPanelComment(g.comment); };
  const closePanel = () => setActiveGroupId(null);

  const applyStatus = (status) => {
    const group = groupedTasks.find(g => g.id === activeGroupId); if (!group) return;
    updateManyTasks([group.id, ...group.children], { status, comment: panelComment, actionedAt: new Date().toISOString(), actionedBy: techName });
    setActiveGroupId(null);
    if (netStatus === "offline") showToast("📴 Saved locally — export when back online");
  };

  const resetGroupTask = () => {
    const group = groupedTasks.find(g => g.id === activeGroupId); if (!group) return;
    updateManyTasks([group.id, ...group.children], { status: STATUS.PENDING, comment: "", actionedAt: "", actionedBy: "" });
    setPanelComment(""); setActiveGroupId(null);
  };

  // ── Bulk selection helpers ──────────────────────────────────────────────────
  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); setBulkComment(""); };
  const selectAllFiltered = () => setSelectedIds(new Set(filtered.map(g => g.id)));
  const applyBulk = (status) => {
    if (selectedIds.size === 0) return;
    const ids = [];
    groupedTasks.forEach(g => { if (selectedIds.has(g.id)) ids.push(g.id, ...g.children); });
    updateManyTasks(ids, { status, comment: bulkComment, actionedAt: new Date().toISOString(), actionedBy: techName });
    showToast(`${selectedIds.size} job${selectedIds.size !== 1 ? "s" : ""} marked ${STATUS_META[status].label}`);
    exitSelectMode();
    if (netStatus === "offline") showToast("📴 Saved locally — export when back online");
  };

  const activeGroup = groupedTasks.find(g => g.id === activeGroupId) || null;

  const updateSetting    = (key, val) => setSettings(s => ({ ...s, [key]: val }));
  const updateColMapping = (key, val) => setSettings(s => ({ ...s, columnMappings: { ...s.columnMappings, [key]: val } }));

  const addGroupLevel = () => {
    if (settings.groupConfig.length >= 3) return;
    const avail = GROUP_OPTIONS.filter(o => !settings.groupConfig.some(c => c.type===o.type&&c.value===o.value));
    if (!avail.length) return;
    updateSetting("groupConfig", [...settings.groupConfig, { ...avail[0] }]);
  };
  const removeGroupLevel = (i) => updateSetting("groupConfig", settings.groupConfig.filter((_,idx)=>idx!==i));
  const changeGroupLevel = (i, optKey) => {
    const opt = GROUP_OPTIONS.find(o => `${o.type}:${o.value}` === optKey);
    if (!opt) return;
    const next = [...settings.groupConfig]; next[i] = { ...opt };
    updateSetting("groupConfig", next);
  };
  // Default state = collapsed (undefined). Toggle: undefined/true → false (open), false → true (collapsed)
  const toggleGroup = (key) => setCollapsedGroups(c => ({ ...c, [key]: c[key] !== false ? false : true }));
  const setMapField = (key, col) => setFieldMap(m => ({ ...m, [key]: col }));

  function groupStats(items) {
    const flat = [];
    function collect(arr) { arr.forEach(x => { if (x.status !== undefined) flat.push(x); else if (x.items) collect(x.items); }); }
    collect(items);
    return { done: flat.filter(t=>t.status===STATUS.DONE).length, skip: flat.filter(t=>t.status===STATUS.SKIPPED).length, total: flat.length };
  }

  // ── Notification helpers
  const openNotifForm = (type = "notification", taskGroup = null) => {
    setNotifFormType(type);
    setNotifFormTask(taskGroup);
    setNotifFormTitle("");
    setNotifFormDesc("");
    setNotifFormPhotos([]);
    if (taskGroup) {
      const loc = fv(taskGroup, "functLocation");
      setNotifFormFloc(loc);
      // Build breadcrumb
      const parts = parseFlocLevels(loc);
      const crumb = parts.map((p,i)=>{ const k=parts.slice(0,i+1).join("/"); return descMap[k]||p; }).join(" › ");
      setNotifFormFlocDesc(crumb);
    } else {
      setNotifFormFloc(""); setNotifFormFlocDesc("");
    }
    setShowNotifForm(true);
  };

  const saveNotif = () => {
    if (!notifFormTitle.trim()) return;
    const newNotif = {
      id: Date.now() + Math.random(),
      type: notifFormType,
      taskId: notifFormTask ? fv(notifFormTask, "taskId") : "",
      taskDesc: notifFormTask ? fv(notifFormTask, "flocDesc") : "",
      functLocation: notifFormFloc,
      functLocationDesc: notifFormFlocDesc,
      title: notifFormTitle.trim(),
      description: notifFormDesc.trim(),
      photos: [...notifFormPhotos],
      createdAt: new Date().toISOString(),
      createdBy: techName,
    };
    setNotifications(prev => [...prev, newNotif]);
    setShowNotifForm(false);
    setActiveGroupId(null); // close task panel if open
    showToast(notifFormType === "issue" ? "⚠ Task issue logged" : "🔔 Notification raised");
  };

  const addPhoto = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const dataUrl = await compressImage(file);
      setNotifFormPhotos(prev => [...prev, dataUrl]);
    } catch {
      showToast("⚠ Could not process photo");
    }
    e.target.value = ""; // reset so same file can be re-selected
  };

  // Build the bundle of files a technician pushes to the cloud:
  // a tasks xlsx, a notifications xlsx, and one jpg per photo.
  const getResultFiles = useCallback(async () => {
    const files = [];

    const taskRows = tasks.map(t => ({
      ...t.raw,
      _Status: STATUS_META[t.status].label,
      _Comment: t.comment || "",
      _Actioned: t.actionedAt || "",
      _ActionedBy: t.actionedBy || ""
    }));
    if (taskRows.length) {
      const ws = XLSX.utils.json_to_sheet(taskRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Tasks");
      const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      files.push({ name: `tasks_${techName}.xlsx`,
        blob: new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }) });
    }

    // Build photo files with meaningful names (tied to the location + which
    // notification they belong to), and remember each notification's filenames
    // so the spreadsheet can reference them directly.
    const photoNamesByNotif = notifications.map((n, ni) => {
      const locSlug = (n.functLocation || "loc").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      return n.photos.map((dataUrl, pi) => {
        const name = `photo_${locSlug}_n${ni + 1}_${pi + 1}.jpg`;
        files.push({ name, blob: dataURLtoBlob(dataUrl) });
        return name;
      });
    });

    if (notifications.length) {
      const nRows = notifications.map((n, ni) => ({
        Type: n.type === "issue" ? "Task Issue" : "Notification",
        Title: n.title, Description: n.description,
        FunctionalLocation: n.functLocation, LocationDesc: n.functLocationDesc,
        LinkedTaskId: n.taskId, RaisedBy: n.createdBy,
        RaisedAt: n.createdAt ? new Date(n.createdAt).toLocaleString() : "",
        PhotoCount: n.photos.length,
        PhotoFiles: photoNamesByNotif[ni].join("; ")
      }));
      const ws = XLSX.utils.json_to_sheet(nRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Notifications");
      const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      files.push({ name: `notifications_${techName}.xlsx`,
        blob: new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }) });
    }

    return files;
  }, [tasks, notifications, techName]);

  const exportNotifications = (filterFn, filename) => {
    const rows = notifications.filter(filterFn).map(n => ({
      "Type": n.type === "issue" ? "Task Issue" : "Notification",
      "Title": n.title,
      "Description": n.description,
      "Functional Location": n.functLocation,
      "Location Description": n.functLocationDesc,
      "Linked Task ID": n.taskId,
      "Linked Task Desc": n.taskDesc,
      "Raised By": n.createdBy,
      "Raised At": n.createdAt ? new Date(n.createdAt).toLocaleString() : "",
      "Photos": n.photos.length > 0 ? `${n.photos.length} photo(s)` : "",
    }));
    if (!rows.length) { showToast("No items to export"); return; }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Notifications");
    XLSX.writeFile(wb, filename);
    showToast(`✓ Exported ${rows.length} items`);
  };

  const notifCount    = notifications.filter(n => n.type === "notification").length;
  const issueCount    = notifications.filter(n => n.type === "issue").length;
  const totalNotifs   = notifications.length;

  function renderTree(nodes, depth = 0) {
    return nodes.map(node => {
      if (node.status !== undefined) {
        const g = node, sm = STATUS_META[g.status];
        const floc    = fv(g,"flocDesc") || "(no description)";
        const opTxt   = fv(g,"opText"), lube=fv(g,"lubricant"), order=fv(g,"order");
        const crit    = fv(g,"criticalityInd"), route=fv(g,"route");
        const flocRaw = fv(g,"functLocation");
        const locParts = parseFlocLevels(flocRaw);

        // Build L1/L2/L3 labels using descMap
        const l1Key   = locParts.slice(0,2).join("/");
        const l2Key   = locParts.slice(0,3).join("/");
        const l3Key   = locParts.slice(0,4).join("/");
        const l1Label = descMap[l1Key] || locParts[1] || "";
        const l2Label = descMap[l2Key] || locParts[2] || "";
        const l3Label = descMap[l3Key] || locParts[3] || "";

        // Updated criticality (escalated by duplicate count)
        const updCrit = getUpdatedCriticality(g);
        const cc = critColor(updCrit.label);

        return (
          <div className={"task-row" + (depth>0 ? " indent-" + Math.min(depth,2) : "") + (selectMode && selectedIds.has(g.id) ? " row-selected" : "")} key={g.id} onClick={()=> selectMode ? toggleSelect(g.id) : openGroup(g)}>
            {selectMode && (
              <div className="row-check" onClick={e=>{e.stopPropagation();toggleSelect(g.id);}}>
                <span className={"row-check-box" + (selectedIds.has(g.id) ? " on" : "")}>{selectedIds.has(g.id) ? "✓" : ""}</span>
              </div>
            )}
            <div className="row-bar" style={{background:sm.border}}/>
            <div className="row-body">
              <div className="row-top">
                <div className="row-floc">{floc}</div>
                {order && <div className="row-order">#{order}</div>}
              </div>
              {opTxt && <div className="row-optext">{opTxt}</div>}

              {/* Location breadcrumb: show each non-empty level */}
              {(l1Label||l2Label||l3Label) && (
                <div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap",marginTop:1}}>
                  {l1Label && <span style={{fontSize:11,color:"var(--accent)",background:"var(--brand-dim)",padding:"1px 6px",borderRadius:3,fontFamily:"'Roboto Condensed',sans-serif",fontWeight:700,letterSpacing:"0.3px"}}>{l1Label}</span>}
                  {l2Label && <><span style={{fontSize:10,color:"var(--text-vfaint)"}}>›</span><span style={{fontSize:11,color:"var(--text-muted)",background:"var(--bg-card)",padding:"1px 6px",borderRadius:3,fontFamily:"'Roboto Condensed',sans-serif",fontWeight:700}}>{l2Label}</span></>}
                  {l3Label && <><span style={{fontSize:10,color:"var(--text-vfaint)"}}>›</span><span style={{fontSize:11,color:"var(--text-dim)",background:"var(--bg-mid)",padding:"1px 6px",borderRadius:3,fontFamily:"'Roboto Condensed',sans-serif"}}>{l3Label}</span></>}
                  {flocRaw && <span style={{fontSize:10,color:"var(--text-faint)",fontFamily:"monospace",marginLeft:2}}>({flocRaw})</span>}
                </div>
              )}

              <div className="row-tags">
                {lube  && <span className="row-tag lube">{lube}</span>}
                {route && <span className="row-tag">Route: {route}</span>}
                {/* Updated criticality tag — show escalation arrow if changed */}
                {updCrit.label && (
                  <span className="row-tag" style={{color:cc.color,background:cc.bg,borderColor:cc.border}}>
                    <span style={{background:cc.color,width:7,height:7,borderRadius:"50%",display:"inline-block",marginRight:5}}/>
                    {updCrit.label}
                    {updCrit.changed && <span style={{marginLeft:4,fontSize:11}} title={`Escalated from ${updCrit.base}`}>⚡</span>}
                  </span>
                )}
                {g.comment && <span className="row-tag" style={{color:"var(--text-muted)",borderColor:"var(--border)"}}>💬 {g.comment.slice(0,28)}{g.comment.length>28?"…":""}</span>}
              </div>
            </div>
            <div className="row-right">
              {g.children.length>0 && <div className="group-badge"><div className="group-count">{g.children.length+1}</div><div className="group-sub">tasks</div></div>}
              <span className="s-chip" style={{color:sm.color,background:sm.bg,borderColor:sm.border+"44"}}>{sm.label}</span>
              <span className="row-chevron">›</span>
            </div>
          </div>
        );
      }
      const gkey=`${depth}-${node.key}`;
      // Default collapsed = true; explicit toggle sets key to false (open)
      const collapsed = collapsedGroups[gkey] !== false;
      const stats=groupStats(node.items);
      // Criticality group header gets coloured indicator
      const isCrit = node.groupDef?.value === "criticalityInd";
      const cc = isCrit ? critColor(node.label) : null;
      return (
        <div key={gkey}>
          <div className={`group-hdr group-hdr-depth-${Math.min(depth,2)}`} onClick={()=>toggleGroup(gkey)}>
            <span className={`group-chevron${!collapsed?" open":""}`}>›</span>
            {isCrit && cc && <span style={{width:12,height:12,borderRadius:"50%",background:cc.color,display:"inline-block",flexShrink:0}}/>}
            <span className="group-hdr-label" style={isCrit&&cc?{color:cc.color}:{}}>{node.label}</span>
            <div className="group-hdr-stats">
              {stats.done>0 && <span className="group-stat" style={{color:STATUS_META.done.color,background:STATUS_META.done.bg}}>✓ {stats.done}</span>}
              {stats.skip>0 && <span className="group-stat" style={{color:STATUS_META.skipped.color,background:STATUS_META.skipped.bg}}>✗ {stats.skip}</span>}
              <span className="group-stat" style={{color:"#5a7298",background:"#1e2a3a"}}>{stats.total}</span>
            </div>
          </div>
          {!collapsed && renderTree(node.items, depth+1)}
        </div>
      );
    });
  }

  const msalConfigured = !!(settings.azureClientId && settings.azureTenantId);

  // ─── Sign-in ──────────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <>
        <style>{css}</style>
        <div className="signin-wrap">
          <div className="signin-card">
            <div className="signin-logo">
              <div className="signin-logo-mark"><div className="signin-logo-txt">NZ<br/>STL</div></div>
              <div className="signin-brand">
                <div className="signin-brand-name">New Zealand Steel</div>
                <div className="signin-brand-sub">Plant Maintenance</div>
              </div>
            </div>
            <div className="signin-title">Sign In</div>
            {msalConfigured ? (
              <>
                <div className="signin-sub">Use your NZ Steel Microsoft 365 account.</div>
                <button className="btn-sso" onClick={handleMsalSignIn} disabled={authLoading || !msalReady}>
                  <svg className="ms-logo" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
                    <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                    <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                    <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                    <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
                  </svg>
                  {authLoading ? "Signing in…" : !msalReady ? "Loading…" : "Sign in with Microsoft"}
                </button>
                {authError && <div className="signin-error">{authError}</div>}
                <div className="signin-divider">or continue without SSO</div>
              </>
            ) : (
              <div className="signin-sub">Enter your name to continue. Enable Microsoft SSO in Settings for secure sign-in.</div>
            )}
            <div className="form-row">
              <div className="form-lbl">Your Name</div>
              <input className="form-input" placeholder="e.g. John Smith" value={manualName}
                onChange={e=>setManualName(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&manualName.trim()&&setManualAuthed(true)} autoFocus/>
            </div>
            <button className="btn-primary" style={{width:"100%"}} disabled={!manualName.trim()} onClick={()=>setManualAuthed(true)}>
              {msalConfigured ? "Continue without Microsoft →" : "Start →"}
            </button>
            {!msalConfigured && (
              <div style={{fontSize:13,color:"#3d5a7a",textAlign:"center",lineHeight:1.5}}>
                💡 Add your Azure App ID in Settings for Microsoft 365 SSO and SharePoint integration.
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  // ─── Main app ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{css}</style>
      <div className="app">

        <header className="hdr">
          <div className="hdr-brand">
            <div className="hdr-logo"><div className="hdr-logo-txt">NZ<br/>STL</div></div>
            <div className="hdr-brand-text">
              <div className="hdr-brand-name">New Zealand Steel</div>
              <div className="hdr-brand-sub">Plant Maintenance</div>
            </div>
          </div>
          {screen === "list" && (
            <div className="hdr-center">
              <span className="stat-pill" style={{color:STATUS_META.done.color,background:STATUS_META.done.bg,border:`1px solid ${STATUS_META.done.border}44`}}>{done} Done</span>
              <span className="stat-pill" style={{color:STATUS_META.skipped.color,background:STATUS_META.skipped.bg,border:`1px solid ${STATUS_META.skipped.border}44`}}>{skipped} Not Done</span>
              <span className="stat-pill" style={{color:STATUS_META.pending.color,background:STATUS_META.pending.bg,border:`1px solid ${STATUS_META.pending.border}44`}}>{pending} Pending</span>
              <div className="prog-wrap">
                <div className="prog-track"><div className="prog-fill" style={{width:`${pct}%`}}/></div>
                <span className="prog-pct">{pct}%</span>
              </div>
            </div>
          )}
          {screen === "settings" && (
            <div className="hdr-center">
              <span style={{fontFamily:"'Roboto Condensed',sans-serif",fontSize:18,fontWeight:700,color:"rgba(255,255,255,0.8)",letterSpacing:1,textTransform:"uppercase"}}>Settings</span>
            </div>
          )}
          <div className="hdr-right">
            {screen === "list" && <button className="btn-ghost" onClick={()=>{setScreen("upload");setTasks([]);clearSession();}}>↑ New File</button>}
            {screen !== "settings"
              ? <button className="hdr-icon-btn" title="Settings" onClick={()=>setScreen("settings")}>⚙</button>
              : <button className="btn-ghost" onClick={()=>setScreen(tasks.length>0?"list":"upload")}>← Back</button>
            }
            {signOutConfirm ? (
              <div style={{display:"flex",gap:6}}>
                <button className="btn-ghost" style={{borderColor:"#dc262666",color:"#dc2626"}} onClick={handleSignOut}>Sign Out</button>
                <button className="btn-ghost" onClick={()=>setSignOutConfirm(false)}>Cancel</button>
              </div>
            ) : (
              <button className="hdr-user-chip" onClick={()=>setSignOutConfirm(true)}>
                <div className="hdr-user-avatar">{techName.charAt(0).toUpperCase()}</div>
                {techName.split(" ")[0]}
                {authAccount && <span style={{fontSize:10,color:"rgba(255,255,255,0.5)"}}>●</span>}
              </button>
            )}
          </div>
        </header>

        {screen !== "settings" && (
          <div className={`net-banner ${netStatus}`}>
            <div className="net-dot"/>
            <span className="net-msg">
              {netStatus==="online"?"Online — ready to sync":netStatus==="offline"?"No connection — working offline, progress saved locally":"Checking connection…"}
            </span>
            {netStatus==="online"&&lastSaved&&<span className="net-saved">Saved {lastSaved}</span>}
            {netStatus==="offline"&&<button className="net-recheck" onClick={()=>setNetStatus(navigator.onLine?"online":"offline")}>Recheck</button>}
          </div>
        )}

        {/* ══ Upload ══ */}
        {screen === "upload" && (
          <div className="upload-screen">
            <div className="upload-hero">Plant Maintenance<br/><span>Work List</span></div>
            {settings.sourceUrl && (
              <div className="sp-fetch-row">
                <div className="sp-url-display">📁 {settings.sourceUrl}/{settings.sourceFilename}</div>
                <button className="btn-primary" onClick={fetchFromSharePoint} disabled={fetching||netStatus!=="online"}>
                  {fetching?"Fetching…":"↓ Fetch"}
                </button>
              </div>
            )}
            <div className={`upload-zone${drag?" drag":""}`} onClick={()=>fileRef.current.click()}
              onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={onDrop}>
              <div className="upload-icon">📋</div>
              <div className="upload-cta">Load work list (.xlsx / .xls)</div>
              <div className="upload-sub">Drop file here or tap to browse</div>
              <button className="btn-primary" onClick={e=>{e.stopPropagation();fileRef.current.click();}}>Choose File</button>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={e=>processFile(e.target.files[0])}/>
            <div className="hint">
              <h3>Auto-mapping</h3>
              <p>Columns are matched automatically. Define exact header names in <strong>Settings → Column Mappings</strong> to always skip the mapping screen. Load your <strong>IH06 functional location file</strong> in Settings to see plant area descriptions in filters and groups.</p>
            </div>
          </div>
        )}

        {/* ══ Map columns ══ */}
        {screen === "map" && (
          <div className="mapper-screen">
            <div className="mapper-title">Confirm Column Mapping</div>
            <div className="mapper-card">
              <p className="mapper-intro">Some columns could not be auto-matched. Green = matched. Save mappings in Settings to skip this screen next time.</p>
              <div className="mapper-grid">
                {Object.entries(FIELD_KEYS).map(([key, meta]) => {
                  const tags = [];
                  if (key==="taskId") tags.push(<span key="g" className="map-tag group">Group</span>);
                  if (key==="functLocation") tags.push(<span key="h" className="map-tag hier">Hierarchy</span>);
                  if (["flocDesc","opText","lubricant"].includes(key)) tags.push(<span key="c" className="map-tag card">Card</span>);
                  if (key!=="taskId") tags.push(<span key="d" className="map-tag detail">Panel</span>);
                  if (["lubricant","route","criticalityInd","systemCondition","interval"].includes(key))
                    tags.push(<span key="f" className="map-tag drop">▾ Filter</span>);
                  else if (!["taskId","functLocation"].includes(key))
                    tags.push(<span key="fs" className="map-tag search">⌕ Search</span>);
                  return (
                    <div className="map-row" key={key}>
                      <div className="map-lbl">{meta.label} {tags}</div>
                      <select className={`map-sel${fieldMap[key]?" matched":""}`} value={fieldMap[key]||""} onChange={e=>setMapField(key,e.target.value)}>
                        <option value="">— not mapped —</option>
                        {columns.map(c=><option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
              <div className="mapper-actions">
                <button className="btn-ghost" style={{background:"#0a1628",border:"1px solid #1e3560",color:"#8fa3bf"}} onClick={()=>setScreen("upload")}>← Back</button>
                <button className="btn-primary" style={{flex:1}} onClick={startWork}>Start — {rawData.length} rows →</button>
              </div>
            </div>
          </div>
        )}

        {/* ══ Settings ══ */}
        {screen === "settings" && (
          <div className="settings-screen">
            <div className="settings-inner">
              <div className="settings-title">Settings</div>

              {/* Azure SSO */}
              <div className="settings-section">
                <div className="settings-section-hdr"><span className="settings-section-icon">🔐</span><span className="settings-section-title">Microsoft SSO (Azure)</span></div>
                <div className="settings-section-body">
                  <div className="settings-row">
                    <div className="settings-lbl">Azure App (Client) ID</div>
                    <input className="settings-input" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={settings.azureClientId} onChange={e=>updateSetting("azureClientId",e.target.value)}/>
                  </div>
                  <div className="settings-row">
                    <div className="settings-lbl">Azure Directory (Tenant) ID</div>
                    <input className="settings-input" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={settings.azureTenantId} onChange={e=>updateSetting("azureTenantId",e.target.value)}/>
                  </div>
                  <div className="settings-row">
                    <div className="settings-lbl">Redirect URI</div>
                    <input className="settings-input" placeholder={typeof window!=="undefined"?window.location.origin:"https://maintenance.nzsteel.co.nz"} value={settings.azureRedirectUri} onChange={e=>updateSetting("azureRedirectUri",e.target.value)}/>
                    <div className="settings-desc">Must match a Redirect URI registered in your Azure app. For the PWA this is your hosted domain.</div>
                  </div>
                  <div className="hint">
                    <h3>Setup steps</h3>
                    <p>1. Azure Portal → App registrations → New registration. Name: "NZ Steel Maintenance", Redirect URI: your PWA URL.<br/>2. API permissions: <code>User.Read</code>, <code>Files.ReadWrite.All</code> (delegated) → Grant admin consent.<br/>3. Copy Application (client) ID and Directory (tenant) ID above.</p>
                  </div>
                  {msalConfigured && authAccount && (
                    <div style={{background:"#052e16",border:"1px solid #16a34a44",borderRadius:6,padding:"12px 16px",fontSize:14,color:"#4ade80"}}>
                      ✓ Signed in as <strong>{authAccount.name}</strong> ({authAccount.username})
                    </div>
                  )}
                </div>
              </div>

              {/* File Locations */}
              <div className="settings-section">
                <div className="settings-section-hdr"><span className="settings-section-icon">📁</span><span className="settings-section-title">File Locations (SharePoint)</span></div>
                <div className="settings-section-body">

                  {/* Source file */}
                  <div className="settings-row">
                    <div className="settings-lbl">Source Work List File</div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <div style={{flex:1,background:"#0a1628",border:"1px solid #1e3560",borderRadius:5,padding:"10px 13px",fontSize:13,color:settings.sourceUrl?"#c8d8ed":"#2a3f5a",fontFamily:"Roboto,sans-serif",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minHeight:46}}>
                        {settings.sourceUrl
                          ? <><span style={{color:"#4a9eff",marginRight:6}}>📄</span>{settings.sourceUrl}{settings.sourceFilename ? ` / ${settings.sourceFilename}` : ""}</>
                          : "No file selected"}
                      </div>
                      <button className="btn-primary" style={{fontSize:13,padding:"10px 16px",flexShrink:0,minHeight:46}}
                        onClick={()=>srcPickerRef.current.click()}>
                        Browse…
                      </button>
                      {settings.sourceUrl && (
                        <button className="btn-ghost" style={{background:"#0a1628",border:"1px solid #1e3560",color:"#5a7298",padding:"9px 12px",fontSize:13,minHeight:46,flexShrink:0}}
                          onClick={()=>{updateSetting("sourceUrl","");updateSetting("sourceFilename","");}}>✕</button>
                      )}
                    </div>
                    {/* Hidden file input — captures filename; URL stored separately */}
                    <input ref={srcPickerRef} type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}}
                      onChange={e=>{
                        const f = e.target.files[0]; if(!f) return;
                        // Store just the filename; URL is the SharePoint base path entered below
                        updateSetting("sourceFilename", f.name);
                        // If no base URL set yet, store a placeholder so the display shows something
                        if (!settings.sourceUrl) updateSetting("sourceUrl","(local file selected)");
                        showToast(`✓ Source file set: ${f.name}`);
                        // Also load it immediately
                        processFile(f);
                      }}/>
                    <div className="settings-desc">
                      Tap <strong>Browse</strong> to select the file from your device — this sets the filename and loads it immediately.
                      For SharePoint auto-fetch, also enter the library URL below.
                    </div>
                  </div>

                  <div className="settings-row">
                    <div className="settings-lbl">SharePoint Source Library URL (optional)</div>
                    <input className="settings-input" placeholder="https://nzsteel.sharepoint.com/sites/Maintenance/Shared Documents"
                      value={settings.sourceUrl==="(local file selected)"?"":settings.sourceUrl}
                      onChange={e=>updateSetting("sourceUrl",e.target.value)}/>
                    <div className="settings-desc">When set alongside Microsoft SSO, the app will fetch the file automatically on startup.</div>
                  </div>

                  <div style={{borderTop:"1px solid #1e3560",paddingTop:16,display:"flex",flexDirection:"column",gap:14}}>
                    {/* Export folder */}
                    <div className="settings-row">
                      <div className="settings-lbl">Export Destination</div>
                      <div style={{display:"flex",gap:8,alignItems:"center"}}>
                        <div style={{flex:1,background:"#0a1628",border:"1px solid #1e3560",borderRadius:5,padding:"10px 13px",fontSize:13,color:settings.exportUrl?"#c8d8ed":"#2a3f5a",fontFamily:"Roboto,sans-serif",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minHeight:46}}>
                          {settings.exportUrl
                            ? <><span style={{color:"#4a9eff",marginRight:6}}>📂</span>{settings.exportUrl}</>
                            : "No folder selected — will download locally"}
                        </div>
                        <button className="btn-primary" style={{fontSize:13,padding:"10px 16px",flexShrink:0,minHeight:46}}
                          onClick={()=>expPickerRef.current.click()}>
                          Browse…
                        </button>
                        {settings.exportUrl && (
                          <button className="btn-ghost" style={{background:"#0a1628",border:"1px solid #1e3560",color:"#5a7298",padding:"9px 12px",fontSize:13,minHeight:46,flexShrink:0}}
                            onClick={()=>updateSetting("exportUrl","")}>✕</button>
                        )}
                      </div>
                      {/* Folder picker — any file inside the folder works; we just capture the path */}
                      <input ref={expPickerRef} type="file" style={{display:"none"}}
                        onChange={e=>{
                          const f = e.target.files[0]; if(!f) return;
                          // webkitRelativePath gives folder context when available
                          const pathParts = (f.webkitRelativePath || f.name).split("/");
                          const folder = pathParts.length > 1 ? pathParts.slice(0,-1).join("/") : "(selected folder)";
                          updateSetting("exportUrl", folder);
                          showToast(`✓ Export folder set`);
                        }}/>
                      <div className="settings-desc">
                        Select any file inside your target export folder to remember it. For SharePoint push, enter the library URL instead.
                      </div>
                    </div>

                    <div className="settings-row">
                      <div className="settings-lbl">SharePoint Export Library URL (optional)</div>
                      <input className="settings-input" placeholder="https://nzsteel.sharepoint.com/sites/Maintenance/Completed"
                        value={settings.exportUrl.startsWith("http") ? settings.exportUrl : ""}
                        onChange={e=>updateSetting("exportUrl",e.target.value)}/>
                    </div>

                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                      <div className="settings-row"><div className="settings-lbl">Completed Filename</div><input className="settings-input" value={settings.exportCompletedFilename} onChange={e=>updateSetting("exportCompletedFilename",e.target.value)}/></div>
                      <div className="settings-row"><div className="settings-lbl">Completed Linked Filename</div><input className="settings-input" value={settings.exportCompletedLinkedFilename||"completed_linked_tasks.xlsx"} onChange={e=>updateSetting("exportCompletedLinkedFilename",e.target.value)}/></div>
                      <div className="settings-row"><div className="settings-lbl">Not-Done Filename</div><input className="settings-input" value={settings.exportNotDoneFilename} onChange={e=>updateSetting("exportNotDoneFilename",e.target.value)}/></div>
                      <div className="settings-row"><div className="settings-lbl">All-Tasks Filename</div><input className="settings-input" value={settings.exportAllFilename} onChange={e=>updateSetting("exportAllFilename",e.target.value)}/></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Functional Location Descriptions */}
              <div className="settings-section">
                <div className="settings-section-hdr"><span className="settings-section-icon">📍</span><span className="settings-section-title">Functional Location Descriptions</span></div>
                <div className="settings-section-body">
                  <div className="settings-desc">
                    Load your SAP IH06 functional location export (or any file with "Functional Loc." and "FunctLocDescrip." columns). Location codes in the work list will be shown with their descriptions in filters, groups, and task rows. Reload this file whenever locations are added or descriptions change.
                  </div>
                  <div className="loc-load-row">
                    <button className="btn-primary" style={{fontSize:14,padding:"12px 20px"}} onClick={()=>locFileRef.current.click()}>
                      📂 Load Location File
                    </button>
                    <input ref={locFileRef} type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={e=>loadLocFile(e.target.files[0])}/>
                    <div className={`loc-status ${descMapLoaded?"loaded":"empty"}`}>
                      {descMapLoaded ? `✓ ${descMapCount.toLocaleString()} locations loaded` : "No file loaded"}
                    </div>
                    {descMapLoaded && (
                      <button className="btn-ghost" style={{background:"#0a1628",border:"1px solid #1e3560",color:"#5a7298",padding:"8px 14px",fontSize:13}}
                        onClick={()=>{setDescMap({});setDescMapLoaded(false);setDescMapCount(0);showToast("Location descriptions cleared");}}>
                        Clear
                      </button>
                    )}
                  </div>
                  {descMapLoaded && (
                    <div className="loc-preview">
                      {Object.entries(descMap).slice(0, 10).map(([k,v]) => (
                        <div className="loc-preview-item" key={k}>
                          <span className="loc-preview-key">{k}</span>
                          <span style={{color:"#c8d8ed",fontSize:13}}>{v}</span>
                        </div>
                      ))}
                      {descMapCount > 10 && <div style={{color:"#3d5a7a",fontSize:12,marginTop:6}}>…and {descMapCount-10} more</div>}
                    </div>
                  )}
                </div>
              </div>

              {/* Column Mappings */}
              <div className="settings-section">
                <div className="settings-section-hdr"><span className="settings-section-icon">🗂</span><span className="settings-section-title">Column Mappings</span></div>
                <div className="settings-section-body">
                  <div className="settings-desc">
                    Map each field to its exact column header from your report. Once saved, files load straight to the task list without a mapping screen. {columns.length === 0 && <span style={{color:"#f59e0b"}}>Load a work list file first to see available columns.</span>}
                  </div>
                  <div className="col-map-grid">
                    {Object.entries(FIELD_KEYS).map(([key, meta]) => (
                      <div className="col-map-row" key={key}>
                        <div className="col-map-lbl">{meta.label}</div>
                        {columns.length > 0 ? (
                          <select className="settings-input" style={{cursor:"pointer"}}
                            value={settings.columnMappings[key] || fieldMap[key] || ""}
                            onChange={e => {
                              updateColMapping(key, e.target.value);
                              // Also update live fieldMap immediately
                              setFieldMap(m => ({ ...m, [key]: e.target.value }));
                            }}>
                            <option value="">— not mapped —</option>
                            {columns.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        ) : (
                          <input className="settings-input" placeholder="Load a file to see columns"
                            value={settings.columnMappings[key] || ""}
                            onChange={e => updateColMapping(key, e.target.value)}/>
                        )}
                      </div>
                    ))}
                  </div>
                  <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                    <button className="btn-primary" style={{alignSelf:"flex-start",fontSize:14,padding:"11px 22px"}}
                      onClick={() => {
                        // Save current fieldMap (including any dropdown changes) to persistent settings
                        const snap = { ...settings.columnMappings };
                        for (const [k, v] of Object.entries(fieldMap)) { if (v) snap[k] = v; }
                        setSettings(s => ({ ...s, columnMappings: snap }));
                        // Re-derive fieldMap from columns using new saved mappings so the list refreshes
                        if (columns.length > 0) {
                          const newFm = buildFieldMap(columns, snap);
                          setFieldMap(newFm);
                        }
                        showToast("✓ Column mappings saved — task list updated");
                      }} disabled={!columns.length}>
                      Save Mappings &amp; Refresh List
                    </button>
                    {columns.length > 0 && (
                      <button className="btn-ghost" style={{background:"#0a1628",border:"1px solid #1e3560",color:"#5a7298",alignSelf:"flex-start"}}
                        onClick={() => {
                          // Auto-detect from current columns
                          const autoFm = buildFieldMap(columns, {});
                          setFieldMap(autoFm);
                          const snap = { ...settings.columnMappings };
                          for (const [k,v] of Object.entries(autoFm)) snap[k] = v;
                          setSettings(s => ({ ...s, columnMappings: snap }));
                          showToast("✓ Auto-detected column mappings");
                        }}>
                        Auto-detect
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Task Grouping */}
              <div className="settings-section">
                <div className="settings-section-hdr"><span className="settings-section-icon">📂</span><span className="settings-section-title">Task Grouping</span></div>
                <div className="settings-section-body">
                  <div className="settings-desc">Up to 3 levels. Criticality groups are ordered Critical → Moderate → Minor → Low → Not Reviewed. Location levels use descriptions when the location file is loaded.</div>
                  <div className="group-config-list">
                    {settings.groupConfig.map((cfg,i) => (
                      <div className="group-config-item" key={i}>
                        <span className="group-config-num">L{i+1}</span>
                        <select className="group-config-select" value={`${cfg.type}:${cfg.value}`} onChange={e=>changeGroupLevel(i,e.target.value)}>
                          {GROUP_OPTIONS.map(o=>(
                            <option key={`${o.type}:${o.value}`} value={`${o.type}:${o.value}`}>{o.label}</option>
                          ))}
                        </select>
                        <button className="group-config-remove" onClick={()=>removeGroupLevel(i)}>✕</button>
                      </div>
                    ))}
                    {settings.groupConfig.length < 3 && (
                      <button className="group-add-btn" onClick={addGroupLevel}>+ Add grouping level</button>
                    )}
                  </div>
                  {settings.groupConfig.length > 0 && (
                    <div className="group-preview">
                      <div className="group-preview-title">Structure preview</div>
                      {settings.groupConfig.map((cfg,i) => (
                        <div className="group-preview-item" key={i} style={{paddingLeft:i*18}}>
                          {i>0&&<span className="group-preview-arrow">└</span>}
                          <span>{cfg.label}</span>
                        </div>
                      ))}
                      <div className="group-preview-item" style={{paddingLeft:settings.groupConfig.length*18,color:"#3d5a7a"}}>
                        <span className="group-preview-arrow">└</span>
                        <span style={{fontStyle:"italic"}}>Individual tasks</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Updated Criticality Settings */}
              <div className="settings-section">
                <div className="settings-section-hdr"><span className="settings-section-icon">⚡</span><span className="settings-section-title">Updated Criticality</span></div>
                <div className="settings-section-body">
                  <div className="settings-desc">
                    Updated Criticality starts from the task's original Criticality Ind, then escalates upward based on how many duplicate (linked) tasks share the same Task ID.
                    The logic is: <strong>every N linked tasks = +1 severity level</strong>, up to a maximum number of levels.
                    Tasks with updated criticality show a ⚡ badge and can be filtered and grouped separately.
                  </div>

                  <label className="settings-toggle" onClick={() => updateSetting("updatedCritSettings", { ...settings.updatedCritSettings, enabled: !settings.updatedCritSettings?.enabled })}>
                    <div className={"toggle-track" + (settings.updatedCritSettings?.enabled ? " on" : "")}><div className="toggle-thumb"/></div>
                    <span className="toggle-label">Enable Updated Criticality escalation</span>
                  </label>

                  {settings.updatedCritSettings?.enabled && (<>
                    <div className="settings-row">
                      <div className="settings-lbl">Linked tasks needed per escalation level</div>
                      <div style={{display:"flex",alignItems:"center",gap:12}}>
                        <input type="range" min={1} max={10} step={1}
                          value={settings.updatedCritSettings?.escalatePerChild ?? 2}
                          onChange={e => updateSetting("updatedCritSettings", { ...settings.updatedCritSettings, escalatePerChild: Number(e.target.value) })}
                          style={{flex:1,accentColor:"var(--brand)"}}/>
                        <span style={{fontFamily:"'Roboto Condensed',sans-serif",fontSize:18,fontWeight:700,color:"var(--accent)",minWidth:28,textAlign:"right"}}>
                          {settings.updatedCritSettings?.escalatePerChild ?? 2}
                        </span>
                      </div>
                      <div className="settings-desc">Every {settings.updatedCritSettings?.escalatePerChild ?? 2} linked task{(settings.updatedCritSettings?.escalatePerChild ?? 2) !== 1 ? "s" : ""} escalates criticality by 1 level. Set to 1 to escalate on every linked task.</div>
                    </div>

                    <div className="settings-row">
                      <div className="settings-lbl">Minimum linked tasks before escalation starts</div>
                      <div style={{display:"flex",alignItems:"center",gap:12}}>
                        <input type="range" min={1} max={5} step={1}
                          value={settings.updatedCritSettings?.minChildrenToEscalate ?? 1}
                          onChange={e => updateSetting("updatedCritSettings", { ...settings.updatedCritSettings, minChildrenToEscalate: Number(e.target.value) })}
                          style={{flex:1,accentColor:"var(--brand)"}}/>
                        <span style={{fontFamily:"'Roboto Condensed',sans-serif",fontSize:18,fontWeight:700,color:"var(--accent)",minWidth:28,textAlign:"right"}}>
                          {settings.updatedCritSettings?.minChildrenToEscalate ?? 1}
                        </span>
                      </div>
                      <div className="settings-desc">Escalation only kicks in once a task has at least this many linked duplicates.</div>
                    </div>

                    <div className="settings-row">
                      <div className="settings-lbl">Maximum escalation levels</div>
                      <div style={{display:"flex",alignItems:"center",gap:12}}>
                        <input type="range" min={1} max={4} step={1}
                          value={settings.updatedCritSettings?.maxEscalationLevels ?? 3}
                          onChange={e => updateSetting("updatedCritSettings", { ...settings.updatedCritSettings, maxEscalationLevels: Number(e.target.value) })}
                          style={{flex:1,accentColor:"var(--brand)"}}/>
                        <span style={{fontFamily:"'Roboto Condensed',sans-serif",fontSize:18,fontWeight:700,color:"var(--accent)",minWidth:28,textAlign:"right"}}>
                          {settings.updatedCritSettings?.maxEscalationLevels ?? 3}
                        </span>
                      </div>
                      <div className="settings-desc">Caps how many severity levels a task can be escalated, regardless of how many duplicates it has.</div>
                    </div>

                    {/* Live preview */}
                    <div style={{background:"var(--bg-input)",border:"1px solid var(--border)",borderRadius:7,padding:"14px 16px"}}>
                      <div style={{fontFamily:"'Roboto Condensed',sans-serif",fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase",color:"var(--text-faint)",marginBottom:10}}>Preview — how a "Low" task escalates</div>
                      {[0,1,2,3,4,5,6].map(n => {
                        const cs = settings.updatedCritSettings;
                        const per = cs?.escalatePerChild ?? 2;
                        const minC = cs?.minChildrenToEscalate ?? 1;
                        const maxL = cs?.maxEscalationLevels ?? 3;
                        const baseRank = criticalityRank("Low");
                        const eff = n >= minC ? n : 0;
                        const esc = Math.min(Math.floor(eff / Math.max(per,1)), maxL);
                        const newRank = Math.max(0, baseRank - esc);
                        const label = CRITICALITY_ORDER[newRank] || CRITICALITY_ORDER[0];
                        const displayLabel = label.charAt(0).toUpperCase() + label.slice(1);
                        const cc = critColor(displayLabel);
                        const changed = newRank < baseRank;
                        return (
                          <div key={n} style={{display:"flex",alignItems:"center",gap:10,padding:"4px 0",borderBottom:"1px solid var(--bg-mid)"}}>
                            <span style={{fontFamily:"'Roboto Condensed',sans-serif",fontSize:12,color:"var(--text-faint)",width:90,flexShrink:0}}>{n} linked task{n!==1?"s":""}</span>
                            <span style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:cc.color,flexShrink:0}}/>
                            <span style={{fontFamily:"'Roboto Condensed',sans-serif",fontSize:13,fontWeight:700,color:cc.color}}>
                              {displayLabel}{changed && <span style={{color:"var(--text-faint)",fontWeight:400,marginLeft:6,fontSize:11}}>⚡ escalated from Low</span>}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </>)}
                </div>
              </div>

              {/* Theme / Appearance */}
              <div className="settings-section">
                <div className="settings-section-hdr"><span className="settings-section-icon">🎨</span><span className="settings-section-title">Appearance</span></div>
                <div className="settings-section-body">
                  <div className="settings-desc">Choose a colour theme for the app. Changes apply instantly.</div>
                  <div className="theme-grid">
                    {Object.entries(THEMES).map(([key, theme]) => (
                      <div key={key}
                        className={`theme-card${settings.theme === key ? " active" : ""}`}
                        onClick={() => updateSetting("theme", key)}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                          <span className="theme-emoji">{theme.emoji}</span>
                          {settings.theme === key && <span className="theme-active-badge">✓ Active</span>}
                        </div>
                        <div className="theme-swatches">
                          {theme.preview.map((c,i) => (
                            <div key={i} className="theme-swatch" style={{background:c}}/>
                          ))}
                        </div>
                        <div className="theme-name">{theme.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Data */}
              <div className="settings-section" style={{borderColor:"#2a0a0a"}}>
                <div className="settings-section-hdr" style={{background:"#200808"}}>
                  <span className="settings-section-icon">⚠️</span>
                  <span className="settings-section-title" style={{color:"#f87171"}}>Data</span>
                </div>
                <div className="settings-section-body">
                  <button className="btn-danger" onClick={()=>{if(window.confirm("Clear session data?")){clearSession();setTasks([]);setRawData([]);setColumns([]);setFieldMap({});setScreen("upload");showToast("Session cleared");}}}>
                    Clear Session Data
                  </button>
                  <div className="settings-desc">Clears the work list. Settings and column mappings are kept. Location descriptions are kept.</div>
                </div>
              </div>
              <div style={{paddingBottom:24}}/>
            </div>
          </div>
        )}

        {/* ══ Main list ══ */}
        {screen === "list" && (
          <div className="list-layout">
            <div className="filter-bar">
              <div className="filter-row">
                <div className="f-status-group">
                  {["all","pending","done","skipped"].map(s=>(
                    <button key={s} className={`f-status-btn${statusFilter===s?" active":""}`} onClick={()=>setStatusFilter(s)}>
                      {s==="all"?"All":STATUS_META[s].label}
                    </button>
                  ))}
                </div>
                {fieldMap.lubricant    && <select className={`f-sel${dropLubricant?" active":""}`}   value={dropLubricant}   onChange={e=>setDropLubricant(e.target.value)}  ><option value="">All Lubricants</option>{uniqueVals("lubricant").map(v=><option key={v}>{v}</option>)}</select>}
                {fieldMap.route        && <select className={`f-sel${dropRoute?" active":""}`}        value={dropRoute}        onChange={e=>setDropRoute(e.target.value)}       ><option value="">All Routes</option>{uniqueVals("route").map(v=><option key={v}>{v}</option>)}</select>}
                {fieldMap.criticalityInd && (
                  <select className={`f-sel${dropCriticality?" active":""}`} value={dropCriticality} onChange={e=>setDropCriticality(e.target.value)}>
                    <option value="">All Criticality</option>
                    {criticalityVals.map(v => {
                      const cc = critColor(v);
                      return <option key={v} value={v}>{v}</option>;
                    })}
                  </select>
                )}
                {settings.updatedCritSettings?.enabled && updatedCritVals.length > 0 && (
                  <select className={`f-sel${dropUpdatedCriticality?" active":""}`} value={dropUpdatedCriticality} onChange={e=>setDropUpdatedCriticality(e.target.value)}>
                    <option value="">All Updated Crit ⚡</option>
                    {updatedCritVals.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                )}
                {fieldMap.systemCondition && <select className={`f-sel${dropCondition?" active":""}`}   value={dropCondition}   onChange={e=>setDropCondition(e.target.value)}  ><option value="">All Conditions</option>{uniqueVals("systemCondition").map(v=><option key={v}>{v}</option>)}</select>}
                {fieldMap.interval        && <select className={`f-sel${dropInterval?" active":""}`}    value={dropInterval}    onChange={e=>setDropInterval(e.target.value)}   ><option value="">All Intervals</option>{uniqueVals("interval").map(v=><option key={v}>{v}</option>)}</select>}
                {hasFilter && <button className="clear-all" onClick={resetFilters}>✕ Clear</button>}
                <button className={`f-status-btn${selectMode?" active":""}`} style={{border:"1px solid var(--border)",borderRadius:5}}
                  onClick={()=> selectMode ? exitSelectMode() : setSelectMode(true)}>
                  {selectMode ? "✕ Cancel" : "☑ Select"}
                </button>
                <span className="filter-count">{filtered.length} / {total}</span>
              </div>

              {flocHier && l1Options.length>0 && (
                <div className="filter-row">
                  <div className="hier-group">
                    <span className="hier-lbl">📍 Location</span>
                    <select className={`f-sel${hierL1?" active":""}`} value={hierL1} onChange={e=>{setHierL1(e.target.value);setHierL2("");setHierL3("");}}>
                      <option value="">Area</option>{l1Options.map(v=><option key={v}>{v}</option>)}
                    </select>
                    {hierL1&&l2Options.length>0&&(<><span className="hier-arrow">›</span>
                      <select className={`f-sel${hierL2?" active":""}`} value={hierL2} onChange={e=>{setHierL2(e.target.value);setHierL3("");}}>
                        <option value="">Sub-area</option>{l2Options.map(v=><option key={v}>{v}</option>)}
                      </select></>)}
                    {hierL2&&l3Options.length>0&&(<><span className="hier-arrow">›</span>
                      <select className={`f-sel${hierL3?" active":""}`} value={hierL3} onChange={e=>setHierL3(e.target.value)}>
                        <option value="">Equipment</option>{l3Options.map(v=><option key={v}>{v}</option>)}
                      </select></>)}
                  </div>
                </div>
              )}

              <div className="filter-row">
                {[
                  {val:searchFloc,     set:setSearchFloc,     ph:"Floc description…", show:!!fieldMap.flocDesc},
                  {val:searchOpText,   set:setSearchOpText,   ph:"Op text…",          show:!!fieldMap.opText},
                  {val:searchOrder,    set:setSearchOrder,    ph:"Order…",            show:!!fieldMap.order},
                  {val:searchProcedure,set:setSearchProcedure,ph:"Work procedure…",   show:!!fieldMap.workProcedure},
                  {val:searchLimit,    set:setSearchLimit,    ph:"Acceptable limit…", show:!!fieldMap.acceptableLimit},
                  {val:searchAction,   set:setSearchAction,   ph:"Corrective action…",show:!!fieldMap.correctiveAction},
                ].filter(f=>f.show).map((f,i)=>(
                  <div className="f-search" key={i} style={{flex:"1 1 130px",maxWidth:200}}>
                    <span className="f-search-ico">⌕</span>
                    <input className={f.val?"active":""} placeholder={f.ph} value={f.val} onChange={e=>f.set(e.target.value)}/>
                  </div>
                ))}
              </div>
            </div>

            <div className="task-list">
              {filtered.length===0
                ? <div className="empty-state">No tasks match current filters</div>
                : displayTree ? renderTree(displayTree) : filtered.map(g=>renderTree([g]))
              }
            </div>

            {selectMode && (
              <div className="bulk-bar">
                <div className="bulk-bar-row">
                  <span className="bulk-count">{selectedIds.size} selected</span>
                  <button className="bulk-link" onClick={selectAllFiltered}>Select all {filtered.length}</button>
                  {selectedIds.size>0 && <button className="bulk-link" onClick={()=>setSelectedIds(new Set())}>Clear</button>}
                </div>
                <input className="bulk-comment" placeholder="Optional comment applied to all selected…" value={bulkComment} onChange={e=>setBulkComment(e.target.value)}/>
                <div className="bulk-bar-row">
                  <button className="bulk-act done" disabled={selectedIds.size===0} onClick={()=>applyBulk(STATUS.DONE)}>✓ Complete ({selectedIds.size})</button>
                  <button className="bulk-act skip" disabled={selectedIds.size===0} onClick={()=>applyBulk(STATUS.SKIPPED)}>✗ Not Done ({selectedIds.size})</button>
                </div>
              </div>
            )}

            <div className="export-bar">
              {/* Export menu button */}
              <div style={{position:"relative"}}>
                <button className="btn-exp blue"
                  style={{display:"flex",alignItems:"center",gap:8,paddingRight:14}}
                  onClick={()=>setExportMenuOpen(o=>!o)}>
                  ↓ Export
                  <span style={{fontSize:11,opacity:0.7,marginLeft:2}}>{exportMenuOpen?"▲":"▼"}</span>
                </button>
                {exportMenuOpen && (
                  <>
                    {/* Backdrop to close */}
                    <div style={{position:"fixed",inset:0,zIndex:290}} onClick={()=>setExportMenuOpen(false)}/>
                    <div style={{
                      position:"absolute",bottom:"calc(100% + 8px)",left:0,
                      background:"#0f1f3d",border:"1px solid #1e3560",borderRadius:8,
                      minWidth:260,zIndex:300,overflow:"hidden",
                      boxShadow:"0 -8px 32px rgba(0,0,0,0.5)"
                    }}>
                      {/* Section: Tasks */}
                      <div style={{padding:"8px 14px 4px",fontFamily:"'Roboto Condensed',sans-serif",fontSize:10,fontWeight:700,letterSpacing:2,textTransform:"uppercase",color:"#3d5a7a"}}>Task Exports</div>
                      {[
                        { label:"Completed (Leaders)", sub:`${done - completedLinkedCount > 0 ? done - completedLinkedCount : done} tasks`, icon:"✓", col:"#15803d", fn: doExportCompleted, disabled: done===0 },
                        { label:"Completed Linked",    sub:`${completedLinkedCount} tasks`,    icon:"⛓", col:"#1a6fd4", fn: doExportCompletedLinked, disabled: completedLinkedCount===0 },
                        { label:"Not Complete",        sub:`${skipped} tasks`,                icon:"✗", col:"#991b1b", fn:()=>pushToSharePoint(tasks,t=>t.status===STATUS.SKIPPED,settings.exportNotDoneFilename), disabled: skipped===0 },
                        { label:"All Tasks",           sub:`${total} tasks`,                  icon:"≡", col:"#334155", fn:()=>pushToSharePoint(tasks,()=>true,settings.exportAllFilename), disabled: total===0 },
                      ].map(item=>(
                        <button key={item.label}
                          disabled={netStatus==="offline"||item.disabled}
                          onClick={()=>{item.fn();setExportMenuOpen(false);}}
                          style={{
                            display:"flex",alignItems:"center",gap:12,width:"100%",
                            padding:"12px 16px",background:"transparent",border:"none",
                            borderBottom:"1px solid #1e356033",cursor:item.disabled||netStatus==="offline"?"not-allowed":"pointer",
                            opacity:item.disabled||netStatus==="offline"?0.4:1,
                            transition:"background 0.1s",textAlign:"left",
                          }}
                          onMouseEnter={e=>{if(!item.disabled&&netStatus!=="offline")e.currentTarget.style.background="#152040";}}
                          onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>
                          <span style={{width:28,height:28,borderRadius:5,background:item.col,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"white",flexShrink:0}}>{item.icon}</span>
                          <div>
                            <div style={{fontFamily:"'Roboto Condensed',sans-serif",fontSize:14,fontWeight:700,color:"#c8d8ed",letterSpacing:"0.3px"}}>{item.label}</div>
                            <div style={{fontSize:12,color:"#3d5a7a"}}>{item.sub}</div>
                          </div>
                        </button>
                      ))}
                      {/* Section: Notifications */}
                      <div style={{padding:"8px 14px 4px",fontFamily:"'Roboto Condensed',sans-serif",fontSize:10,fontWeight:700,letterSpacing:2,textTransform:"uppercase",color:"#3d5a7a",borderTop:"1px solid #1e3560"}}>Notification Exports</div>
                      {[
                        { label:"Notifications",  sub:`${notifCount} raised`,  icon:"🔔", col:"#92400e", fn:()=>exportNotifications(n=>n.type==="notification","notifications.xlsx"), disabled:notifCount===0 },
                        { label:"Task Issues",     sub:`${issueCount} logged`,  icon:"⚠",  col:"#7f1d1d", fn:()=>exportNotifications(n=>n.type==="issue","task_issues.xlsx"),          disabled:issueCount===0 },
                      ].map(item=>(
                        <button key={item.label}
                          disabled={netStatus==="offline"||item.disabled}
                          onClick={()=>{item.fn();setExportMenuOpen(false);}}
                          style={{
                            display:"flex",alignItems:"center",gap:12,width:"100%",
                            padding:"12px 16px",background:"transparent",border:"none",
                            borderBottom:"1px solid #1e356022",cursor:item.disabled||netStatus==="offline"?"not-allowed":"pointer",
                            opacity:item.disabled||netStatus==="offline"?0.4:1,
                            transition:"background 0.1s",textAlign:"left",
                          }}
                          onMouseEnter={e=>{if(!item.disabled&&netStatus!=="offline")e.currentTarget.style.background="#152040";}}
                          onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>
                          <span style={{width:28,height:28,borderRadius:5,background:item.col,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"white",flexShrink:0}}>{item.icon}</span>
                          <div>
                            <div style={{fontFamily:"'Roboto Condensed',sans-serif",fontSize:14,fontWeight:700,color:"#c8d8ed",letterSpacing:"0.3px"}}>{item.label}</div>
                            <div style={{fontSize:12,color:"#3d5a7a"}}>{item.sub}</div>
                          </div>
                        </button>
                      ))}
                      {netStatus==="offline" && (
                        <div style={{padding:"8px 16px",fontSize:12,color:"#dc2626",fontFamily:"'Roboto Condensed',sans-serif"}}>📴 Offline — exports disabled</div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Spacer */}
              <div style={{flex:1}}/>

              {/* Notification / Log buttons in bottom bar */}
              {totalNotifs > 0 && (
                <button className="btn-exp" style={{background:"#92400e",color:"#fef3c7",display:"flex",alignItems:"center",gap:7}}
                  onClick={()=>setShowNotifLog(true)}>
                  📋 Log
                  <span style={{background:"#dc2626",color:"white",fontSize:11,fontWeight:800,width:20,height:20,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{totalNotifs}</span>
                </button>
              )}
              <button className="btn-exp blue" style={{display:"flex",alignItems:"center",gap:7}}
                onClick={()=>openNotifForm("notification", null)}>
                🔔 Raise
              </button>

              <SyncPanel
                techName={techName}
                onLoadWorklist={(file) => processFile(file)}
                getResultFiles={getResultFiles}
              />

              {netStatus==="offline"&&<span className="offline-msg">📴 Offline</span>}
            </div>
          </div>
        )}

        {/* Detail panel */}
        {activeGroup && (
          <div className="backdrop" onClick={e=>e.target===e.currentTarget&&closePanel()}>
            <div className="panel">
              <div className="panel-handle"/>
              <div className="panel-hdr">
                <div className="panel-hdr-left">
                  <div className="panel-badges">
                    {fv(activeGroup,"order")  && <span className="panel-order-badge">Order #{fv(activeGroup,"order")}</span>}
                    {fv(activeGroup,"taskId") && <span className="panel-tid-badge">Task {fv(activeGroup,"taskId")}</span>}
                    {activeGroup.children.length>0 && <span className="panel-group-info">+{activeGroup.children.length} linked — closes together</span>}
                  </div>
                  <div className="panel-floc">{fv(activeGroup,"flocDesc")||"(no description)"}</div>
                  {fv(activeGroup,"opText")&&<div className="panel-optext">{fv(activeGroup,"opText")}</div>}
                  {/* L1 / L2 / L3 location breadcrumb */}
                  {fv(activeGroup,"functLocation") && (() => {
                    const flocRaw = fv(activeGroup,"functLocation");
                    const parts = parseFlocLevels(flocRaw);
                    const l1k = parts.slice(0,2).join("/"), l1 = descMap[l1k]||parts[1]||"";
                    const l2k = parts.slice(0,3).join("/"), l2 = descMap[l2k]||parts[2]||"";
                    const l3k = parts.slice(0,4).join("/"), l3 = descMap[l3k]||parts[3]||"";
                    return (
                      <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap",marginTop:7}}>
                        {l1&&<span style={{fontSize:12,color:"var(--accent)",background:"var(--brand-dim)",padding:"2px 8px",borderRadius:4,fontFamily:"'Roboto Condensed',sans-serif",fontWeight:700}}>L1: {l1}</span>}
                        {l2&&<><span style={{color:"var(--text-vfaint)",fontSize:12}}>›</span><span style={{fontSize:12,color:"var(--text-muted)",background:"var(--bg-card)",padding:"2px 8px",borderRadius:4,fontFamily:"'Roboto Condensed',sans-serif",fontWeight:700}}>L2: {l2}</span></>}
                        {l3&&<><span style={{color:"var(--text-vfaint)",fontSize:12}}>›</span><span style={{fontSize:12,color:"var(--text-dim)",background:"var(--bg-mid)",padding:"2px 8px",borderRadius:4,fontFamily:"'Roboto Condensed',sans-serif"}}>L3: {l3}</span></>}
                        <span style={{fontSize:11,color:"var(--text-faint)",fontFamily:"monospace",marginLeft:2}}>({flocRaw})</span>
                      </div>
                    );
                  })()}
                </div>
                <button className="panel-x" onClick={closePanel}>✕</button>
              </div>
              <div className="panel-body">
                <div className="detail-grid">
                  {DETAIL_FIELDS.map(({key,wide})=>{
                    const val=fv(activeGroup,key); if(!fieldMap[key]) return null;
                    const cc = key==="criticalityInd" ? critColor(val) : null;
                    return (
                      <div className={`detail-field${wide?" wide":""}`} key={key}
                        style={cc?{borderColor:cc.border,background:cc.bg}:{}}>
                        <div className="detail-lbl">{FIELD_KEYS[key].label}</div>
                        <div className={`detail-val${!val?" empty":""}`} style={cc&&val?{color:cc.color,fontWeight:700}:{}}>
                          {cc&&val&&<span style={{display:"inline-block",width:10,height:10,borderRadius:"50%",background:cc.color,marginRight:7,verticalAlign:"middle"}}/>}
                          {val||"—"}
                        </div>
                      </div>
                    );
                  })}
                  {/* Updated Criticality field */}
                  {(() => {
                    const uc = getUpdatedCriticality(activeGroup);
                    const cc = critColor(uc.label);
                    return (
                      <div className="detail-field" style={{borderColor:cc.border,background:cc.bg,borderWidth:uc.changed?2:1}}>
                        <div className="detail-lbl">Updated Criticality {uc.changed&&<span style={{color:"#f59e0b",marginLeft:4}}>⚡ escalated</span>}</div>
                        <div className="detail-val" style={{color:cc.color,fontWeight:700}}>
                          <span style={{display:"inline-block",width:10,height:10,borderRadius:"50%",background:cc.color,marginRight:7,verticalAlign:"middle"}}/>
                          {uc.label}
                          {uc.changed&&<span style={{fontSize:12,color:"var(--text-dim)",fontWeight:400,marginLeft:8}}>was {uc.base} — {activeGroup.children.length} linked task{activeGroup.children.length!==1?"s":""}</span>}
                        </div>
                      </div>
                    );
                  })()}
                </div>
                {activeGroup.children.length>0 && (
                  <div className="subtasks-section">
                    <div className="subtasks-title">{activeGroup.children.length+1} linked tasks — Task ID "{fv(activeGroup,"taskId")}"</div>
                    {[activeGroup.id,...activeGroup.children].map((cid,idx)=>{
                      const ct=taskById[cid]; if(!ct) return null;
                      const csm=STATUS_META[ct.status];
                      return (
                        <div className="subtask-row" key={cid}>
                          <div className="subtask-dot" style={{background:csm.border}}/>
                          <div className="subtask-text">
                            {idx===0&&<strong style={{color:"#4a9eff",marginRight:6,fontSize:13}}>Primary</strong>}
                            {fv(ct,"opText")||fv(ct,"flocDesc")||`Row ${cid+1}`}
                          </div>
                          <span className="subtask-chip" style={{color:csm.color,background:csm.bg}}>{csm.label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="panel-status-row">
                  <span className="panel-status-lbl">Status:</span>
                  <span className="s-chip" style={{color:STATUS_META[activeGroup.status].color,background:STATUS_META[activeGroup.status].bg,borderColor:STATUS_META[activeGroup.status].border+"44"}}>
                    {STATUS_META[activeGroup.status].label}
                  </span>
                  {activeGroup.children.length>0&&<span style={{fontSize:13,color:"#3d5a7a",marginLeft:6}}>— applies to all {activeGroup.children.length+1} tasks</span>}
                </div>
                <div>
                  <div className="comment-lbl">Comment / Reason</div>
                  <textarea className="comment-ta" rows={3} placeholder="Add a note — required for tasks marked Not Complete…" value={panelComment} onChange={e=>setPanelComment(e.target.value)}/>
                </div>
              </div>
              <div className="panel-actions">
                <button className={`pa-done${activeGroup.status===STATUS.DONE?" active":""}`} onClick={()=>applyStatus(STATUS.DONE)}>✓ Complete</button>
                <button className={`pa-skip${activeGroup.status===STATUS.SKIPPED?" active":""}`} onClick={()=>applyStatus(STATUS.SKIPPED)}>✗ Not Done</button>
                {activeGroup.status!==STATUS.PENDING&&<button className="pa-reset" onClick={resetGroupTask}>↺</button>}
              </div>
              {/* Secondary actions */}
              <div style={{display:"flex",gap:8,padding:"0 20px 14px",flexShrink:0}}>
                <button style={{flex:1,background:"#1c1400",color:"#f59e0b",border:"1px solid #d9770644",borderRadius:7,fontFamily:"'Roboto Condensed',sans-serif",fontSize:14,fontWeight:700,letterSpacing:"0.5px",textTransform:"uppercase",padding:"11px 8px",cursor:"pointer",minHeight:44,display:"flex",alignItems:"center",justifyContent:"center",gap:7}}
                  onClick={()=>openNotifForm("notification", activeGroup)}>
                  🔔 Raise Notification
                </button>
                <button style={{flex:1,background:"#2a0a0a",color:"#dc2626",border:"1px solid #dc262644",borderRadius:7,fontFamily:"'Roboto Condensed',sans-serif",fontSize:14,fontWeight:700,letterSpacing:"0.5px",textTransform:"uppercase",padding:"11px 8px",cursor:"pointer",minHeight:44,display:"flex",alignItems:"center",justifyContent:"center",gap:7}}
                  onClick={()=>openNotifForm("issue", activeGroup)}>
                  ⚠ Issue with Task
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Notification panels below — FAB removed; buttons are in the export bar */}

        {/* ── Notification Form Panel ── */}
        {showNotifForm && (
          <div className="backdrop" onClick={e=>e.target===e.currentTarget&&setShowNotifForm(false)}>
            <div className="notif-panel">
              <div className="panel-handle"/>
              <div className="notif-hdr">
                <div>
                  <div className="notif-hdr-title">
                    {notifFormType === "issue" ? "⚠ Issue with Task" : "🔔 Raise Notification"}
                  </div>
                  <div className="notif-hdr-sub">
                    {notifFormTask ? `Linked to: ${fv(notifFormTask,"flocDesc")||"(task)"}` : "Standalone — not linked to a task"}
                  </div>
                </div>
                <button className="panel-x" onClick={()=>setShowNotifForm(false)}>✕</button>
              </div>
              <div className="notif-body">

                {/* Type selector — only show if opening from FAB (not pre-set from task) */}
                {!notifFormTask && (
                  <div className="notif-field">
                    <div className="notif-field-lbl">Type</div>
                    <div className="notif-type-row">
                      <button className={`notif-type-btn${notifFormType==="notification"?" selected":""}`}
                        onClick={()=>setNotifFormType("notification")}>🔔 Notification</button>
                      <button className={`notif-type-btn${notifFormType==="issue"?" issue-selected":""}`}
                        onClick={()=>setNotifFormType("issue")}>⚠ Issue with Task</button>
                    </div>
                  </div>
                )}

                {/* Functional Location — cascading tree picker */}
                <div className="notif-field">
                  <div className="notif-field-lbl">Functional Location *</div>
                  {notifFormTask ? (
                    <div style={{background:"var(--bg-input)",border:"1px solid var(--border)",borderRadius:6,padding:"12px 14px",fontSize:14,color:"var(--text-muted)"}}>
                      <div style={{fontFamily:"monospace",fontSize:13,color:"var(--accent)"}}>{notifFormFloc}</div>
                      {notifFormFlocDesc && <div style={{color:"var(--text-dim)",marginTop:4,fontSize:13}}>{notifFormFlocDesc}</div>}
                    </div>
                  ) : (() => {
                    // Build unique floc values from tasks for the tree
                    const allFlocs = [...new Set(tasks.map(t=>{ const col=fieldMap.functLocation; return col?String(t.raw[col]||""):""; }).filter(Boolean))];
                    // L1 options
                    const nL1Set = new Set();
                    allFlocs.forEach(f=>{ const p=parseFlocLevels(f); if(p.length>=2) nL1Set.add(p.slice(0,2).join("/")); });
                    const nL1Opts = [...nL1Set].sort();
                    // Helper to set floc + auto-compute description
                    const setFlocWithDesc = (v) => {
                      setNotifFormFloc(v);
                      const p = parseFlocLevels(v);
                      setNotifFormFlocDesc(p.map((_,i) => { const k=p.slice(0,i+1).join("/"); return descMap[k]||p[i]; }).join(" › "));
                    };
                    const nSelL1 = notifFormFloc.split("/").slice(0,2).join("/");
                    const nL2Set = new Set();
                    if(nSelL1) allFlocs.forEach(f=>{ const p=parseFlocLevels(f); if(p.slice(0,2).join("/")=== nSelL1 && p.length>=3) nL2Set.add(p.slice(0,3).join("/")); });
                    const nL2Opts = [...nL2Set].sort();
                    const selL1 = parseFlocLevels(notifFormFloc).slice(0,2).join("/");
                    const selL2 = parseFlocLevels(notifFormFloc).slice(0,3).join("/");
                    const nL3Set = new Set();
                    if(selL2&&selL2!==selL1) allFlocs.forEach(f=>{ const p=parseFlocLevels(f); if(p.slice(0,3).join("/")=== selL2 && p.length>=4) nL3Set.add(f); });
                    const nL3Opts = [...nL3Set].sort();
                    const getLabel = (key) => { const p=parseFlocLevels(key); return descMap[key] || p[p.length-1] || key; };
                    return (
                      <div style={{display:"flex",flexDirection:"column",gap:8}}>
                        {/* L1 */}
                        <select className="notif-input" value={selL1||""} onChange={e=>{ setNotifFormFloc(e.target.value); const desc=getLabel(e.target.value); setNotifFormFlocDesc(desc); }}>
                          <option value="">— Select Area (L1) —</option>
                          {nL1Opts.map(k=><option key={k} value={k}>{k} — {getLabel(k)}</option>)}
                        </select>
                        {/* L2 */}
                        {selL1 && nL2Opts.length>0 && (
                          <select className="notif-input" value={selL2&&selL2!==selL1?selL2:""} onChange={e=>{ setNotifFormFloc(e.target.value||selL1); const desc=e.target.value?getLabel(e.target.value):getLabel(selL1); setNotifFormFlocDesc(desc); }}>
                            <option value="">— Select Sub-area (L2) —</option>
                            {nL2Opts.map(k=><option key={k} value={k}>{k} — {getLabel(k)}</option>)}
                          </select>
                        )}
                        {/* L3 */}
                        {selL2&&selL2!==selL1&&nL3Opts.length>0 && (
                          <select className="notif-input" value={nL3Opts.includes(notifFormFloc)?notifFormFloc:""} onChange={e=>{ setNotifFormFloc(e.target.value||selL2); const p=parseFlocLevels(e.target.value||selL2); const desc=p.map((_,i)=>{ const k=p.slice(0,i+1).join("/"); return descMap[k]||p[i]; }).join(" › "); setNotifFormFlocDesc(desc); }}>
                            <option value="">— Select Equipment (L3) —</option>
                            {nL3Opts.map(k=>{ const p=parseFlocLevels(k); return <option key={k} value={k}>{k} — {descMap[k]||p[p.length-1]||k}</option>; })}
                          </select>
                        )}
                        {/* Manual override */}
                        <input className="notif-input" style={{fontSize:13,color:"var(--text-dim)"}}
                          placeholder="Or type a location code manually…"
                          value={notifFormFloc}
                          onChange={e=>{ setNotifFormFloc(e.target.value); const p=parseFlocLevels(e.target.value); const desc=p.map((_,i)=>{ const k=p.slice(0,i+1).join("/"); return descMap[k]||p[i]; }).join(" › "); setNotifFormFlocDesc(desc); }}/>
                        {notifFormFlocDesc && notifFormFlocDesc !== notifFormFloc && (
                          <div style={{fontSize:13,color:"var(--accent)",marginTop:-4}}>📍 {notifFormFlocDesc}</div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Title */}
                <div className="notif-field">
                  <div className="notif-field-lbl">{notifFormType==="issue"?"Issue Description *":"Notification Title *"}</div>
                  <input className="notif-input" placeholder={notifFormType==="issue"?"What is the issue with this task?":"What did you observe?"}
                    value={notifFormTitle} onChange={e=>setNotifFormTitle(e.target.value)}/>
                </div>

                {/* Detail */}
                <div className="notif-field">
                  <div className="notif-field-lbl">Additional Detail</div>
                  <textarea className="notif-ta" rows={3}
                    placeholder={notifFormType==="issue"?"Describe why this task cannot be completed, what needs to be fixed, or any relevant context…":"Additional observations, urgency, suggested action…"}
                    value={notifFormDesc} onChange={e=>setNotifFormDesc(e.target.value)}/>
                </div>

                {/* Photos */}
                <div className="notif-field">
                  <div className="notif-field-lbl">Photos ({notifFormPhotos.length})</div>
                  <div className="photo-row">
                    {notifFormPhotos.map((src,i) => (
                      <div key={i} style={{position:"relative"}}>
                        <img src={src} className="photo-thumb" alt={`Photo ${i+1}`}/>
                        <button onClick={()=>setNotifFormPhotos(p=>p.filter((_,j)=>j!==i))}
                          style={{position:"absolute",top:-6,right:-6,background:"#dc2626",border:"none",borderRadius:"50%",width:20,height:20,color:"white",fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>✕</button>
                      </div>
                    ))}
                    <div className="photo-add-btn" onClick={()=>photoInputRef.current.click()}>
                      <span>📷</span>
                      <span className="photo-lbl">Add</span>
                    </div>
                  </div>
                  <input ref={photoInputRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={addPhoto}/>
                </div>

              </div>
              <div className="notif-actions">
                <button className="pa-reset" style={{minHeight:56}} onClick={()=>setShowNotifForm(false)}>Cancel</button>
                <button className={`pa-notif${notifFormType==="notification"?" blue":""}`}
                  disabled={!notifFormTitle.trim() || !notifFormFloc.trim()}
                  onClick={saveNotif}
                  style={!notifFormTitle.trim()||!notifFormFloc.trim()?{opacity:0.4}:{}}>
                  {notifFormType==="issue"?"⚠ Log Issue":"🔔 Raise Notification"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Notification Log Panel ── */}
        {showNotifLog && (
          <div className="backdrop" onClick={e=>e.target===e.currentTarget&&setShowNotifLog(false)}>
            <div className="notif-list-panel">
              <div className="panel-handle"/>
              <div className="notif-hdr">
                <div>
                  <div className="notif-hdr-title">Notification Log</div>
                  <div className="notif-hdr-sub">{notifCount} notification{notifCount!==1?"s":""} · {issueCount} task issue{issueCount!==1?"s":""}</div>
                </div>
                <button className="panel-x" onClick={()=>setShowNotifLog(false)}>✕</button>
              </div>

              {/* Export row */}
              <div style={{padding:"10px 20px",borderBottom:"1px solid #1e3560",display:"flex",gap:8,flexWrap:"wrap",flexShrink:0}}>
                <span style={{fontFamily:"'Roboto Condensed',sans-serif",fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase",color:"#3d5a7a",alignSelf:"center"}}>Export:</span>
                <button className="btn-exp" style={{background:"#92400e",color:"#fef3c7"}} disabled={netStatus==="offline"||notifCount===0}
                  onClick={()=>exportNotifications(n=>n.type==="notification","notifications.xlsx")}>
                  🔔 Notifications ({notifCount})
                </button>
                <button className="btn-exp red" disabled={netStatus==="offline"||issueCount===0}
                  onClick={()=>exportNotifications(n=>n.type==="issue","task_issues.xlsx")}>
                  ⚠ Task Issues ({issueCount})
                </button>
              </div>

              <div style={{flex:1,overflowY:"auto"}}>
                {notifications.length === 0 ? (
                  <div className="empty-state">No notifications or issues yet</div>
                ) : [...notifications].reverse().map(n => {
                  const isIssue = n.type === "issue";
                  return (
                    <div className="notif-log-row" key={n.id} onClick={()=>setViewingNotif(n.id)}>
                      <span className="notif-type-badge" style={isIssue?{background:"#2a0a0a",color:"#dc2626",border:"1px solid #dc262644"}:{background:"#1c1400",color:"#f59e0b",border:"1px solid #f59e0b44"}}>
                        {isIssue?"⚠ Issue":"🔔 Notif"}
                      </span>
                      <div className="notif-log-body">
                        <div className="notif-log-title">{n.title}</div>
                        <div className="notif-log-meta">
                          📍 {n.functLocationDesc||n.functLocation||"—"} · {n.createdBy} · {n.createdAt?new Date(n.createdAt).toLocaleString():""}
                          {n.taskDesc && <span> · Task: {n.taskDesc.slice(0,40)}</span>}
                        </div>
                        {n.photos.length>0 && (
                          <div className="notif-log-photos">
                            {n.photos.slice(0,4).map((src,i)=><img key={i} src={src} className="notif-log-thumb" alt=""/>)}
                            {n.photos.length>4&&<span style={{fontSize:12,color:"#5a7298",alignSelf:"center"}}>+{n.photos.length-4}</span>}
                          </div>
                        )}
                      </div>
                      <span style={{color:"#2a3f5a",fontSize:18}}>›</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Notification detail view ── */}
        {viewingNotif && (() => {
          const n = notifications.find(x=>x.id===viewingNotif);
          if (!n) return null;
          const isIssue = n.type==="issue";
          return (
            <div className="backdrop" onClick={e=>e.target===e.currentTarget&&setViewingNotif(null)}>
              <div className="notif-panel">
                <div className="panel-handle"/>
                <div className="notif-hdr">
                  <div>
                    <div className="notif-hdr-title">{isIssue?"⚠ Task Issue":"🔔 Notification"}</div>
                    <div className="notif-hdr-sub">{n.createdBy} · {n.createdAt?new Date(n.createdAt).toLocaleString():""}</div>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button className="panel-x" style={{background:"#2a0a0a",borderColor:"#dc262644",color:"#dc2626"}}
                      onClick={()=>{ if(window.confirm("Delete this item?")){ setNotifications(p=>p.filter(x=>x.id!==viewingNotif)); setViewingNotif(null); }}}>🗑</button>
                    <button className="panel-x" onClick={()=>setViewingNotif(null)}>✕</button>
                  </div>
                </div>
                <div className="notif-body">
                  <div className="notif-field">
                    <div className="notif-field-lbl">Functional Location</div>
                    <div style={{background:"#0a1628",border:"1px solid #1e3560",borderRadius:6,padding:"12px 14px"}}>
                      <div style={{fontFamily:"monospace",fontSize:13,color:"#4a9eff"}}>{n.functLocation||"—"}</div>
                      {n.functLocationDesc&&<div style={{color:"#5a7298",marginTop:4,fontSize:13}}>{n.functLocationDesc}</div>}
                    </div>
                  </div>
                  {n.taskDesc && (
                    <div className="notif-field">
                      <div className="notif-field-lbl">Linked Task</div>
                      <div style={{background:"#0a1628",border:"1px solid #1e3560",borderRadius:6,padding:"12px 14px",fontSize:14,color:"#c8d8ed"}}>{n.taskDesc}{n.taskId&&<span style={{color:"#4a9eff",marginLeft:8,fontSize:12}}>#{n.taskId}</span>}</div>
                    </div>
                  )}
                  <div className="notif-field">
                    <div className="notif-field-lbl">{isIssue?"Issue":"Title"}</div>
                    <div style={{fontSize:17,color:"#e8edf5",fontWeight:500,lineHeight:1.4}}>{n.title}</div>
                  </div>
                  {n.description && (
                    <div className="notif-field">
                      <div className="notif-field-lbl">Detail</div>
                      <div style={{fontSize:15,color:"#8fa3bf",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{n.description}</div>
                    </div>
                  )}
                  {n.photos.length>0 && (
                    <div className="notif-field">
                      <div className="notif-field-lbl">Photos ({n.photos.length})</div>
                      <div className="photo-row">
                        {n.photos.map((src,i)=><img key={i} src={src} style={{width:100,height:100,objectFit:"cover",borderRadius:7,border:"1px solid #1e3560"}} alt={`Photo ${i+1}`}/>)}
                      </div>
                    </div>
                  )}
                </div>
                <div className="notif-actions">
                  <button className="pa-reset" style={{minHeight:52}} onClick={()=>setViewingNotif(null)}>← Back</button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </>
  );
}
