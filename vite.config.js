import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// If you later host under a sub-path (e.g. GitHub Pages /repo-name/),
// set base to "/repo-name/". For root hosting leave it as "/".
export default defineConfig({
  base: "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "NZ Steel Plant Maintenance",
        short_name: "PM Worklist",
        description: "Plant maintenance work list — offline capable",
        theme_color: "#0047BB",
        background_color: "#0a1628",
        display: "standalone",
        orientation: "portrait",
        // Must match the GitHub Pages sub-path (the `base` above). With base "/"
        // these would be "/". For the project repo it's "/nzsteel-pm/".
        id: "/nzsteel-pm/",
        scope: "/nzsteel-pm/",
        start_url: "/nzsteel-pm/",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        // Cache the app shell so it loads with no network.
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        // xlsx is large; raise the limit so it gets precached.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024
      },
      devOptions: {
        // Lets you test the service worker with `npm run dev`.
        enabled: true
      }
    })
  ]
});
