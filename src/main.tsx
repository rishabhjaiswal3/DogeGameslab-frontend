// The DogeOS SDK stylesheet ships its own utility classes (.hidden, .flex…).
// Load it before the app's CSS so the app's responsive utilities win the cascade.
import "@dogeos/dogeos-sdk/style.css";
import { createRoot } from "react-dom/client";
import { Suspense, lazy } from "react";
import { Buffer } from "buffer";
import { initDebugConsole } from "./lib/debug";
import { logBootDiagnostics } from "./lib/bootDiagnostics";
import { LoadingShell } from "./components/LoadingShell";

logBootDiagnostics();

// Opt-in on-screen console for debugging on a phone with no cable — visit any
// page with ?debug=1 once. No-op unless that flag has been set.
initDebugConsole();

// The DogeOS SDK's wallet adapters read the Node Buffer global while their
// modules initialize; install the browser implementation first.
globalThis.Buffer = Buffer;

// One CSS stack: Tailwind v4 (+ tw-animate-css). In dev, Tailwind runs via CLI
// (`npm run dev:css`) because @tailwindcss/vite blocks the dev server on first compile.
if (import.meta.env.DEV) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `${import.meta.env.BASE_URL}dev-styles.css`;
  document.head.appendChild(link);
} else {
  await import("./styles.css");
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");

// The DogeOS SDK pulls in WalletConnect, viem and multi-chain wallet adapters.
// Loading it lazily behind Suspense lets the shell paint immediately instead of
// every route blocking on that one download.
const App = lazy(() => import("./App"));

createRoot(rootEl).render(
  <Suspense fallback={<LoadingShell />}>
    <App />
  </Suspense>,
);
