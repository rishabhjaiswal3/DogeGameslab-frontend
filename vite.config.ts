import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

export default defineConfig(({ command }) => ({
  // The app is served from the domain root (dev and Cloudflare). The DigitalOcean build that
  // lives under /create/ opts in explicitly with `npm run build:do` (VITE_BASE_PATH=/create/).
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routeFileIgnorePattern: ".*\\.full\\.tsx$",
    }),
    // React Compiler memoizes components and hooks at build time. A file can opt out with a
    // "use no memo" directive at the top of the component or hook.
    react({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
    // Tailwind blocks the dev server for minutes on first compile — build CSS via
    // `npm run dev:css` instead and serve it from /public in development.
    ...(command === "build" ? [tailwindcss()] : []),
    tsconfigPaths(),
  ],
  optimizeDeps: {
    include: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-query"],
  },
  server: {
    // Listen on the local network too, so phones on the same Wi-Fi can open the dev app.
    host: true,
    // 5173 belongs to creator-studio-frontend-tg; this app runs beside it.
    port: 5174,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
    watch: {
      // The home page lives in _app.index.full.tsx; the router plugin skips it via
      // routeFileIgnorePattern, so the watcher must still see edits to it.
      ignored: ["**/public/templates/**"],
    },
  },
  build: {
    outDir: "dist",
  },
}));
