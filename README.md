# NZ Steel Plant Maintenance — PWA

An installable, offline-capable version of your maintenance work-list app.
No IT, no Azure, no admin consent required to run it. Microsoft SSO / SharePoint
sync remain as optional upgrades for later.

---

## Step 0 — Do you have Node.js?

Open a terminal (Command Prompt, PowerShell, or the VS Code terminal) and run:

```
node -v
npm -v
```

- **If you see version numbers** (e.g. `v20.x` and `10.x`) → skip to Step 1.
- **If you get "not recognized"** → you need Node. You almost certainly do NOT
  need admin rights:

  **Option A — portable Node (no install, no admin):**
  1. Go to https://nodejs.org/en/download → "Windows Binary (.zip)" (LTS).
  2. Extract the zip somewhere in your user folder, e.g. `C:\Users\<you>\node`.
  3. In your terminal, `cd` into that folder and use `.\node.exe` and
     `.\npm.cmd` — or add that folder to your user PATH (no admin needed:
     search "Edit environment variables for your account").

  **Option B — fnm/nvm-windows** if you're comfortable with it.

If your plant machine blocks the Node download entirely, tell me — we have a
fallback that produces a single self-contained file with no build step.

---

## Step 1 — Wire in real persistence + photo compression

1. **Replace `src/App.jsx`** with the full contents of your existing component.

2. **Add two imports** at the very top of `src/App.jsx`, just under the existing
   `import * as XLSX from "xlsx";` line:

   ```js
   import { saveSession, loadSession, clearSession } from "./storage.js";
   import { compressImage } from "./photo.js";
   ```

3. **Delete the old fake store.** Find and remove these three lines:

   ```js
   let _sessionStore = null;
   function saveSession(data) { try { _sessionStore = JSON.stringify(data); } catch (_) {} }
   function loadSession() { try { return _sessionStore ? JSON.parse(_sessionStore) : null; } catch (_) { return null; } }
   ```

4. **Fix the auto-save effect** (also persists notifications, and corrects the
   dependency list so location-file loads get saved). Replace:

   ```js
   useEffect(() => {
     if (tasks.length === 0) return;
     saveSession({ tasks, fieldMap, columns, rawData, settings, descMap });
     setLastSaved(new Date().toLocaleTimeString());
   }, [tasks, settings]);
   ```

   with:

   ```js
   useEffect(() => {
     if (tasks.length === 0) return;
     saveSession({ tasks, fieldMap, columns, rawData, settings, descMap, notifications });
     setLastSaved(new Date().toLocaleTimeString());
   }, [tasks, settings, fieldMap, columns, rawData, descMap, notifications]);
   ```

5. **Make the restore effect async** (and restore notifications too). Replace
   the `useEffect(() => { const saved = loadSession(); ... }, [])` block with:

   ```js
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
   ```

6. **Swap the two `_sessionStore = null` usages for `clearSession()`:**

   - The **"New File"** button:
     `onClick={()=>{setScreen("upload");setTasks([]);clearSession();}}`
   - The **"Clear Session Data"** button: replace `_sessionStore=null;` with
     `clearSession();` inside that handler.

7. **Compress photos on capture.** Replace `addPhoto` with:

   ```js
   const addPhoto = async (e) => {
     const file = e.target.files[0]; if (!file) return;
     try {
       const dataUrl = await compressImage(file);
       setNotifFormPhotos(prev => [...prev, dataUrl]);
     } catch {
       showToast("⚠ Could not process photo");
     }
     e.target.value = "";
   };
   ```

That's the whole migration. Everything else in your component runs unchanged.

---

## Step 2 — Run it

From the project folder:

```
npm install
npm run dev
```

Open the URL it prints (usually http://localhost:5173). Test that:
- you can load a work list,
- mark tasks, add a photo,
- **refresh the page** — your work should still be there (this is the big win),
- DevTools → Application → Service Workers shows it registered.

---

## Step 3 — Build for "real"

```
npm run build
npm run preview -- --host
```

`npm run build` produces a `dist/` folder — that's the entire deployable app.
`preview --host` serves it on your network so you can open it on your phone
(same wifi) and try "Add to Home Screen".

---

## What works now (no IT needed)

- Installs to the home screen, runs full-screen, works offline.
- Real persistence — close/reopen the app, data survives.
- Photos compressed (~1280px JPEG) so storage and export stay light.
- Manual sign-in (type name) + load file + export downloads back to the device.

## What's still optional / phase 2

- Microsoft SSO + direct SharePoint read/write (needs an Azure App Registration
  and admin consent — your existing code already handles this path).
- Hosting choice (Azure Static Web Apps / Cloudflare Pages / inside SharePoint).
  We'll pick based on what your network allows.
