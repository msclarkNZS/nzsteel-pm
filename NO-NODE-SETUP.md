# Building without Node on your PC

Your company blocks the Node download — that's fine. You can reach github.com,
and that's all you need. The build runs in the cloud. Three paths, easiest first.

---

## Path A — GitHub builds and hosts it for you (recommended, zero tools)

Nothing installed on your machine. You upload the files once; GitHub builds and
publishes the app to a real URL automatically, and re-builds every time you
change something.

### One-time setup

1. **Make a GitHub account** (if you don't have one) and **create a new repo** —
   e.g. name it `nzsteel-pm`. Make it **Public** (required for free Pages).
   Don't add a README — you're uploading one.

2. **Set the base path.** Because the app will live at
   `https://YOURNAME.github.io/nzsteel-pm/`, open `vite.config.js` and change:
   ```js
   base: "/",
   ```
   to your repo name:
   ```js
   base: "/nzsteel-pm/",
   ```
   (If you ever rename the repo, update this to match.)

3. **Upload the project.** Unzip `nzsteel-pm.zip`. On the repo page click
   **Add file → Upload files**, then drag in *everything inside* the
   `nzsteel-pm` folder (not the folder itself). Make sure the hidden
   `.github` folder comes along — if drag-drop skips it, you can also create
   the file `.github/workflows/deploy.yml` manually via **Add file → Create new
   file** and paste its contents. Commit.

4. **Turn on Pages with Actions.** Repo → **Settings → Pages** → under "Build and
   deployment", set **Source = GitHub Actions**.

5. Go to the **Actions** tab. You'll see the build running. When it finishes
   (~1–2 min), the URL appears in the deploy step — that's your live app:
   `https://YOURNAME.github.io/nzsteel-pm/`. Open it on your phone and "Add to
   Home Screen".

### To make changes later

Edit a file directly on GitHub (click the file → pencil icon → commit), or use
Path B below for a fuller editor. Every commit re-runs the build and updates the
live app within a couple of minutes. **You never run Node anywhere.**

> Don't forget to fill in `src/supabase.js` with your project URL + anon key
> (see SUPABASE-SETUP.md) before the sync features will work. You can edit that
> file right in the GitHub web UI.

---

## Path B — GitHub Codespaces (a full editor + live preview, in your browser)

If you want to actually run `npm run dev` and see changes live while developing,
Codespaces gives you a cloud machine with Node already installed, running inside
a browser tab. Free tier is plenty (tens of hours/month).

1. On your repo, click the green **Code** button → **Codespaces** tab →
   **Create codespace on main**.
2. A browser VS Code opens. In its terminal: `npm install` then `npm run dev`.
3. Click the forwarded-port popup to preview.

**Possible snag:** the live preview uses a `*.app.github.dev` address. Some
strict networks that allow `github.com` still block that subdomain. If the
preview won't open, Codespaces still works fine for *editing and committing* —
just rely on Path A's live Pages URL for testing on the phone.

---

## Path C — StackBlitz (instant, runs Node inside the browser)

A backup if Codespaces' preview is blocked. https://stackblitz.com runs the
whole Vite dev server inside your browser tab (no server round-trip), and can
import straight from your GitHub repo: visit
`https://stackblitz.com/github/YOURNAME/nzsteel-pm`. Good for quick edits and
seeing them live; for the installable PWA + real hosting, still deploy via
Path A.

---

## Which should I use?

- **Just want it live and installable:** Path A only. It's the whole job.
- **Want to tinker with live reload:** Path B for editing, Path A for the real
  URL.
- **Path B preview blocked by the network:** Path A + Path C.

Path A is the one that matters — it needs nothing but github.com, which you've
confirmed works.
