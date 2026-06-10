// ─── Supabase client ──────────────────────────────────────────────────────────
// These two values are SAFE to be public and committed to GitHub:
//   - the project URL is just an address
//   - the "anon" key is DESIGNED to live in client apps; what it can actually
//     do is controlled entirely by the storage policies you set up (see
//     SUPABASE-SETUP.md). It cannot read results or write worklists on its own.
//
// The powerful "service_role" key is NEVER used here and must never be put in
// the app. Supervisor powers come from signing in with an email+password
// account instead (see sync.js / SyncPanel.jsx).
//
// Fill these in after creating your Supabase project (Settings → API).

import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://mztuehozsueasraygyew.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_WEffXVY_GR60lw9v_mqhIQ_F_7y09Uh";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,        // keep supervisor signed in across refreshes
    autoRefreshToken: true,
    storageKey: "nzsteel-pm-auth"
  }
});

export const WORKLISTS_BUCKET = "worklists";
export const RESULTS_BUCKET = "results";
