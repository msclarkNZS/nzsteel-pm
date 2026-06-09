# Supabase setup — the shared drop-box (free, no IT)

This is the one real "stop" we flagged. ~15 minutes, no credit card. Follow in
order. Where you copy a value, paste it straight into `src/supabase.js`.

---

## 1. Create the project

1. Go to https://supabase.com → **Start your project** → sign up (GitHub login
   is fine; no card required).
2. **New project.** Pick a name (e.g. `nzsteel-pm`), set a strong database
   password (save it — you rarely need it, but don't lose it), choose the region
   closest to you (e.g. Sydney). Create. Wait ~2 min while it provisions.

## 2. Grab your two public values

1. Left sidebar → **Project Settings** (gear) → **API**.
2. Copy **Project URL** → paste into `SUPABASE_URL` in `src/supabase.js`.
3. Copy the **anon public** key (the one literally labelled `anon` `public`) →
   paste into `SUPABASE_ANON_KEY`.
   - **Do NOT** copy the `service_role` key. We never use it. Leave it in the
     dashboard.

## 3. Create the buckets + access rules (one paste)

1. Left sidebar → **SQL Editor** → **New query**.
2. Open `supabase-policies.sql` from this project, copy the whole thing, paste
   it into the editor, click **Run**.
3. You should see "Success." Check **Storage** in the sidebar — you'll now have
   two buckets: `worklists` and `results`.

That SQL is what enforces the photo security we discussed: techs can upload
results but the anon key has no permission to read them back.

## 4. Create the supervisor login

1. Left sidebar → **Authentication** → **Users** → **Add user** → **Create new
   user**.
2. Enter your email + a password. **Tick "Auto Confirm User"** so you can sign
   in immediately without an email link.
3. That's the account you'll use in the app's "Supervisor sign-in". You can add
   more supervisors the same way. Techs never sign in here at all.

---

## 5. Wire SyncPanel into your app

Two small additions to `src/App.jsx`:

**a) Import it** near the top:

```js
import SyncPanel from "./SyncPanel.jsx";
```

**b) Build the result bundle.** Add this helper inside the `App` component
(alongside your other handlers). It packages the completed tasks, the
notifications, and each photo as separate files for the push:

```js
const getResultFiles = useCallback(async () => {
  const files = [];

  // 1. All task statuses as an xlsx
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

  // 2. Notifications + issues as an xlsx (without the inline photo blobs)
  if (notifications.length) {
    const nRows = notifications.map(n => ({
      Type: n.type === "issue" ? "Task Issue" : "Notification",
      Title: n.title, Description: n.description,
      FunctionalLocation: n.functLocation, LocationDesc: n.functLocationDesc,
      LinkedTaskId: n.taskId, RaisedBy: n.createdBy,
      RaisedAt: n.createdAt ? new Date(n.createdAt).toLocaleString() : "",
      PhotoCount: n.photos.length
    }));
    const ws = XLSX.utils.json_to_sheet(nRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Notifications");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    files.push({ name: `notifications_${techName}.xlsx`,
      blob: new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }) });
  }

  // 3. Each photo as its own jpg (already compressed + EXIF-stripped)
  notifications.forEach((n, ni) => {
    n.photos.forEach((dataUrl, pi) => {
      const blob = dataURLtoBlob(dataUrl);
      files.push({ name: `photo_${ni + 1}_${pi + 1}.jpg`, blob });
    });
  });

  return files;
}, [tasks, notifications, techName]);
```

**c) Add this tiny helper** (top-level in the file, near your other helpers):

```js
function dataURLtoBlob(dataUrl) {
  const [head, body] = dataUrl.split(",");
  const mime = head.match(/:(.*?);/)[1];
  const bytes = atob(body);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
```

**d) Render the panel** in the export bar. Find the export bar (the
`<div className="export-bar">`) and add, next to your other buttons:

```jsx
<SyncPanel
  techName={techName}
  onLoadWorklist={(file) => processFile(file)}
  getResultFiles={getResultFiles}
/>
```

---

## 6. Try it end to end

1. `npm install` (pulls in `@supabase/supabase-js`), then `npm run dev`.
2. Open the app → tap **☁ Sync** → **Supervisor sign-in** with the account from
   step 4 → **Publish a worklist** (pick an .xlsx).
3. Sign out of supervisor. Tap **☁ Sync** again → your worklist appears → **Load**.
4. Mark a task, add a photo, tap **⬆ Push Results**.
5. Sign back in as supervisor → **Show returned results** → **Collect** to
   download, **🗑** to clear it from the cloud (keeps you under the free tier and
   minimises how long photos sit in the cloud).

If any step errors, tell me the exact message — the most common ones are a
mistyped URL/key in `supabase.js`, or the SQL not having been run yet.

---

## Habit for the free tier + photo hygiene

- After collecting a round of results, **delete them** (the 🗑 button). Storage
  is cumulative; transfer resets monthly. This also means photos don't linger in
  the cloud longer than needed.
- A project pauses after **7 days of zero activity** — un-pause is one click in
  the dashboard, no data lost. Any normal week of use keeps it awake.
