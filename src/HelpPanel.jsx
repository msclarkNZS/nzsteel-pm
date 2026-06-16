// ─── HelpPanel ────────────────────────────────────────────────────────────────
// In-app "how to use" guide. Opens from the ? button in the header.
// Uses the app's existing panel pattern (.backdrop / .panel) and theme tokens
// (var(--brand), var(--bg-*), var(--text-*), var(--accent)) so it themes with
// the rest of the app. Self-contained: only depends on React.
//
// Props:
//   open    — boolean; whether the panel is shown
//   onClose — () => void

import { useState } from "react";

// Each entry is one collapsible task. `icon` mirrors the real on-screen control
// so the guide maps directly to what the technician is looking at.
const SECTIONS = [
  {
    id: "start",
    icon: "🚀",
    title: "Getting started",
    body: [
      "Open the app and pick your name (or type it) on the sign-in screen, then tap Start. You don't need a password — that's only for supervisors.",
      "The app works offline once it has loaded. You can install it to your home screen from your browser's menu (\"Add to Home screen\") so it opens like a normal app.",
      "Your progress saves automatically on the device as you go, even with no signal.",
    ],
  },
  {
    id: "load",
    icon: "☁",
    title: "Load a worklist — ☁ Sync",
    body: [
      "Tap ☁ Sync at the bottom of the screen to see the worklists your supervisor has published.",
      "Tap a worklist to load it. The list of jobs appears, grouped by location.",
      "If a newer worklist is published while you're working, a 🆕 banner appears at the top — tap Load to switch to it.",
    ],
  },
  {
    id: "work",
    icon: "✓",
    title: "Work through tasks",
    body: [
      "Tap any job to open its detail panel. Linked jobs that share an order close together — the panel tells you when that's the case.",
      "Mark each job ✓ Complete or ✗ Not Done. Add a comment if there's anything worth noting — comments come back to your supervisor with the results.",
      "The counters at the top (Done / Not Done / Pending) and the progress bar update as you go.",
    ],
  },
  {
    id: "filter",
    icon: "▾",
    title: "Find jobs — filters & search",
    body: [
      "The status buttons (All / Pending / Complete / Not Complete) narrow the list to what you want to see.",
      "Tap ▾ Filters for extra dropdowns — lubricant, route, criticality, condition, interval, and a Location area picker (if your supervisor has published the location file).",
      "Use the search boxes to match on description, op text, order, procedure, limit, or corrective action. Tap ✕ Clear to reset everything.",
    ],
  },
  {
    id: "bulk",
    icon: "☑",
    title: "Close several jobs at once — ☑ Select",
    body: [
      "Tap ☑ Select, then tick the jobs you want — or Select all to grab everything currently shown.",
      "Add an optional comment that applies to all of them, then tap ✓ Complete or ✗ Not Done to close the whole batch in one go.",
      "Tap ✕ Cancel to leave Select mode without changing anything.",
    ],
  },
  {
    id: "raise",
    icon: "🔔",
    title: "Raise a notification or issue — 🔔 Raise",
    body: [
      "Tap 🔔 Raise to log a new notification or a task issue. You can also raise an issue against a specific job from inside its detail panel.",
      "Fill in the location, a title, and a description. Add photos straight from your phone camera — they're compressed automatically before they're sent.",
      "Everything you raise is listed under 📋 Log, with a count badge so you can see how many are outstanding.",
    ],
  },
  {
    id: "push",
    icon: "⬆",
    title: "Send your results back",
    body: [
      "When you're done (or want to check in), tap ☁ Sync, then ⬆ Push Results. Your completed tasks, notifications, issues, and photos are bundled and sent to your supervisor.",
      "You can push more than once — push at the end of a job, at smoko, or whenever you next have signal.",
      "Pushing needs a connection. If you're offline, finish your work anyway — it's saved — and push once you're back online.",
    ],
  },
  {
    id: "export",
    icon: "↓",
    title: "Export to a file (optional) — ↓ Export",
    body: [
      "↓ Export lets you save spreadsheets of your tasks, notifications, and issues directly, instead of (or as well as) pushing them through Sync.",
      "Use this if your supervisor has asked for the files a particular way. Exports need a connection.",
    ],
  },
  {
    id: "offline",
    icon: "📴",
    title: "Working offline",
    body: [
      "The banner under the header shows your connection. Green means you can sync; 📴 Offline means you're working from the device.",
      "Everything you do offline — statuses, comments, notifications, photos — is saved on the device and waits for you.",
      "Sync and Export are disabled while offline. Tap Recheck on the offline banner once you think you have signal again.",
    ],
  },
  {
    id: "newfile",
    icon: "↑",
    title: "Start a fresh list — ↑ New File",
    body: [
      "↑ New File (top right) clears the current worklist so you can load a different one. Push your results first if you haven't — clearing can't be undone.",
    ],
  },
];

const SUPERVISOR = {
  icon: "🔑",
  title: "For supervisors",
  body: [
    "Supervisor tools live in Settings (the ⚙ icon, top right) under the Supervisor section. Sign in there with your email and password — technicians never see these tools.",
    "From there you can publish a worklist, publish the location (IH06) file once for all devices, collect and clear returned results, and manage the technician roster that fills the sign-in dropdown.",
    "Full setup steps are in the supervisor guide (the PDF that came with the app).",
  ],
};

function Accordion({ icon, title, body, open, onToggle }) {
  return (
    <div style={{
      border: "1px solid var(--border)", borderRadius: 8,
      background: "var(--bg-input)", overflow: "hidden",
    }}>
      <button onClick={onToggle} style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%",
        padding: "14px 16px", background: "transparent", border: "none",
        cursor: "pointer", textAlign: "left", minHeight: 52,
      }}>
        <span style={{
          width: 30, height: 30, borderRadius: 6, flexShrink: 0,
          background: "var(--brand-dim)", border: "1px solid var(--brand)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15,
        }}>{icon}</span>
        <span style={{
          flex: 1, fontFamily: "'Roboto Condensed', sans-serif", fontSize: 16,
          fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.3px",
        }}>{title}</span>
        <span style={{ color: "var(--text-dim)", fontSize: 14, flexShrink: 0 }}>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div style={{
          padding: "0 16px 16px 58px", display: "flex",
          flexDirection: "column", gap: 10,
        }}>
          {body.map((p, i) => (
            <p key={i} style={{
              margin: 0, fontSize: 14.5, lineHeight: 1.55, color: "var(--text-muted)",
            }}>{p}</p>
          ))}
        </div>
      )}
    </div>
  );
}

export default function HelpPanel({ open, onClose }) {
  const [openId, setOpenId] = useState("start");
  const toggle = (id) => setOpenId(cur => (cur === id ? "" : id));

  if (!open) return null;

  return (
    <div className="backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="panel" style={{ maxWidth: 640 }}>
        <div className="panel-handle" />
        <div className="panel-hdr">
          <div className="panel-hdr-left">
            <div className="panel-floc" style={{ fontSize: 22 }}>How to use this app</div>
            <div className="panel-optext">Tap a topic to expand it. This guide works offline.</div>
          </div>
          <button className="panel-x" onClick={onClose}>✕</button>
        </div>

        <div className="panel-body">
          {SECTIONS.map(s => (
            <Accordion key={s.id} {...s} open={openId === s.id} onToggle={() => toggle(s.id)} />
          ))}

          <div style={{
            marginTop: 4, paddingTop: 14, borderTop: "1px solid var(--border)",
          }}>
            <Accordion
              {...SUPERVISOR}
              open={openId === "supervisor"}
              onToggle={() => toggle("supervisor")}
            />
          </div>

          <div style={{
            textAlign: "center", fontSize: 12.5, color: "var(--text-faint)",
            padding: "6px 0 2px",
          }}>
            New Zealand Steel · Plant Maintenance
          </div>
        </div>
      </div>
    </div>
  );
}
