import { useWalletConnect, WalletConnectProvider } from "@dogeos/dogeos-sdk";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";

import {
  clearAuthToken,
  hasUsableCachedToken,
  prefetchAuthToken,
  registerWalletSigner,
} from "@/lib/api";
import {
  buildDogeOSConfig,
  DOGEOS_CLIENT_ID,
  loadDogeOSChains,
  loadDogeOSConnectors,
  wagmiConfig,
  type DogeOSChains,
  type DogeOSConnectors,
} from "@/lib/dogeos";
import { clearWalletIdentity, setWalletIdentity } from "@/lib/identity";
import { queryClient } from "@/lib/queryClient";
import { useEvmAccount } from "@/lib/useEvmAccount";
import { LoadingShell } from "@/components/LoadingShell";

// The SDK injects its own Tailwind build (<style id="__wallet-connect-kit-styles__">)
// at the END of <head>, so its `.hidden`, `.flex`… would override the app's
// responsive utilities (e.g. `hidden lg:flex`). Keep it first in <head> so the
// app's stylesheet wins ties; the SDK's own components still get its styles.
const SDK_STYLE_ID = "__wallet-connect-kit-styles__";

function hoistSdkStyles() {
  const style = document.getElementById(SDK_STYLE_ID);
  if (style && style.parentNode === document.head && document.head.firstChild !== style) {
    document.head.insertBefore(style, document.head.firstChild);
  }
}

if (typeof document !== "undefined") {
  hoistSdkStyles();
  new MutationObserver(hoistSdkStyles).observe(document.head, { childList: true });
}

type AppTheme = "dark" | "light";

function readAppTheme(): AppTheme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** Follows the header theme switch so the DogeOS modal matches the app. */
function useAppTheme() {
  const [theme, setTheme] = useState<AppTheme>(readAppTheme);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readAppTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);
  return theme;
}

/**
 * Mirrors the DogeOS wallet session into the app: the connected wallet's EVM
 * (DogeOS) address is the user's identity, and the wallet signs the backend's
 * sign-in challenge to obtain the studio JWT. This works whether the wallet was
 * connected on its EVM side or, like MyDoge, on its Dogecoin side. Disconnecting
 * in the DogeOS modal signs the user out.
 */
function DogeOSSessionSync() {
  const { connectionStatus } = useWalletConnect();
  const { accountAddress, walletName, signForSignIn } = useEvmAccount();
  const previousAddressRef = useRef<string | null>(null);

  useEffect(() => {
    if (accountAddress) {
      setWalletIdentity({ walletAddress: accountAddress, walletName });
      registerWalletSigner({ address: accountAddress, signMessage: signForSignIn });
      if (previousAddressRef.current !== accountAddress) {
        previousAddressRef.current = accountAddress;
        if (!hasUsableCachedToken()) {
          clearAuthToken();
          void prefetchAuthToken(true).catch(() => null);
        }
      }
      return;
    }

    // Only a real connected → disconnected transition signs out; the SDK starts
    // "disconnected" on every page load while it restores the session.
    if (connectionStatus === "disconnected" && previousAddressRef.current) {
      previousAddressRef.current = null;
      registerWalletSigner(null);
      clearAuthToken();
      clearWalletIdentity();
    }
  }, [accountAddress, connectionStatus, signForSignIn, walletName]);

  return null;
}

// The SDK throws on an empty client ID, which would blank the whole app. Keep
// the app browsable and make the missing configuration loud instead; sign-in
// stays hidden until VITE_DOGEOS_CLIENT_ID is set.
const MISSING_CLIENT_ID = "missing-dogeos-client-id";
if (!DOGEOS_CLIENT_ID) {
  console.error("[dogeos] VITE_DOGEOS_CLIENT_ID is not set — DogeOS sign-in is disabled.");
}

export function DogeOSProvider({ children }: { children: ReactNode }) {
  const theme = useAppTheme();
  // The SDK's own chain list (EVM + Dogecoin + Solana). Loaded once before the
  // SDK starts; it falls back to DogeOS alone if loading stalls.
  const [chains, setChains] = useState<DogeOSChains | null>(null);
  const [connectors, setConnectors] = useState<DogeOSConnectors | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    // Wallet list loads alongside the chains so MyDoge is matched to the
    // globals the installed extension really exposes.
    void Promise.all([loadDogeOSChains(), loadDogeOSConnectors()]).then(
      ([loadedChains, loadedConnectors]) => {
        if (cancelled) return;
        setConnectors(loadedConnectors);
        setChains(loadedChains);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  const config = useMemo(() => {
    const next = buildDogeOSConfig(theme, chains ?? undefined, connectors);
    return next.clientId ? next : { ...next, clientId: MISSING_CLIENT_ID };
  }, [chains, connectors, theme]);

  // Keep the loading screen up while the wallet list loads; an empty page here
  // showed as a blank flash between the loader and the app.
  if (!chains) return <LoadingShell />;

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <WalletConnectProvider config={config}>
          <DogeOSSessionSync />
          {children}
        </WalletConnectProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
