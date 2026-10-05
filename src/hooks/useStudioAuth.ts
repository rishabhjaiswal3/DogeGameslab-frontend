import { useWalletConnect } from "@dogeos/dogeos-sdk";
import { useCallback, useMemo, useRef, useState } from "react";

import { clearAuthToken, hasUsableCachedToken, registerWalletSigner } from "@/lib/api";
import { DOGEOS_CLIENT_ID } from "@/lib/dogeos";
import { clearAllBrowserStorage, clearAllClientCookies } from "@/lib/fullLogout";
import { clearWalletIdentity, getWalletAddress, setWalletIdentity } from "@/lib/identity";
import { useDogeWallet } from "@/lib/useDogeWallet";
import { useEvmAccount } from "@/lib/useEvmAccount";

export type StudioAuthStatus = "idle" | "error";

export type StudioUser = { id: string; address: string; walletName: string | null };

/** Shared DogeOS login flow: email, Google, X, or an external wallet such as MyDoge. */
export function useStudioAuth() {
  const { isConnected, isConnecting, connectionStatus, error, openModal, disconnect } =
    useWalletConnect();
  const { accountAddress, walletName } = useEvmAccount();
  const { ensureSignedIn } = useDogeWallet();
  const [authStatus, setAuthStatus] = useState<StudioAuthStatus>("idle");
  const signingOutRef = useRef(false);

  // Already signed in earlier (valid studio session for the saved wallet)? Then
  // the user is signed in right away — no modal, no new signature — while the
  // wallet extension reconnects in the background.
  const restoredAddress = !accountAddress && hasUsableCachedToken() ? getWalletAddress() : null;
  const signedInAddress = accountAddress ?? restoredAddress;

  const user = useMemo<StudioUser | null>(
    () => (signedInAddress ? { id: signedInAddress, address: signedInAddress, walletName } : null),
    [signedInAddress, walletName],
  );

  const openLogin = useCallback(async () => {
    setAuthStatus("idle");
    openModal();
  }, [openModal]);

  const syncWalletIdentity = useCallback(async () => {
    if (!accountAddress) return getWalletAddress();
    setWalletIdentity({ walletAddress: accountAddress, walletName });
    return accountAddress;
  }, [accountAddress, walletName]);

  const signOut = useCallback(async () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    registerWalletSigner(null);
    clearAuthToken();
    clearWalletIdentity();
    try {
      await Promise.race([
        disconnect(),
        new Promise<void>((resolve) => window.setTimeout(() => resolve(), 2500)),
      ]);
    } catch {
      setAuthStatus("error");
    }

    clearAllBrowserStorage();
    clearAllClientCookies();

    // Back to this app's home page.
    window.location.replace(import.meta.env.BASE_URL);
  }, [disconnect]);

  const signInLabel = authStatus === "error" || error ? "Try again" : "Sign in";
  const signInHint = "Sign in with DogeOS — email, Google, X, or your MyDoge wallet";

  return {
    configured: Boolean(DOGEOS_CLIENT_ID),
    // A restored session is ready immediately, even while the SDK reconnects.
    ready: Boolean(restoredAddress) || connectionStatus !== "connecting",
    authenticated: Boolean(signedInAddress),
    user,
    authLoading: isConnecting,
    authStatus,
    signInLabel,
    signInHint,
    openLogin,
    signOut,
    syncWalletIdentity,
    ensureSignedIn,
  };
}
