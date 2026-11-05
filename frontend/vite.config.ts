import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // We write the service worker ourselves (src/sw.ts) so push
      // notifications can be added to it later; the plugin only builds it
      // and puts the list of app files inside.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      // Keep our own public/manifest.webmanifest instead of generating one.
      manifest: false,
      injectRegister: "script",
      injectManifest: {
        // Save the app's code, page and icons. Skip the big iPhone splash
        // images: the browser fetches those itself when needed.
        globPatterns: ["**/*.{js,css,html,ico,svg}", "icons/*.png", "logo.png"],
      },
    }),
  ],
  server: {
    // In development, send /api requests to the backend on port 3000.
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
