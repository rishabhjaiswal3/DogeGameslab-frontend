import { useConnectors, useWalletConnect, useAccount } from "@dogeos/dogeos-sdk";
import { useCallback } from "react";

import { useEvmAccount } from "@/lib/useEvmAccount";

import { prefetchAuthToken } from "@/lib/api";
import { fetchDogeOSBalance } from "@/lib/dogeos";
import { getWalletAddress } from "@/lib/identity";
import { isWalletLinkedOnSession } from "@/lib/walletLink";

export type DogecoinBalance = { confirmed: number; unconfirmed: number; total: number };

type DogecoinProvider = { getBalance?: () => Promise<DogecoinBalance> };

/**
 * The connected DogeOS wallet. It is the user's identity; nothing is paid from
 * it — generating and editing games is free.
 */
export function useDogeWallet() {
  const { openModal } = useWalletConnect();
  const { currentWallet } = useAccount();
  const { connectors } = useConnectors();
  const { evmAddress, chainIdNumber, walletName, accountAddress } = useEvmAccount();

  const walletAddress = evmAddress ?? getWalletAddress();
  const isEmbeddedWallet = Boolean(
    (currentWallet as { isEmbeddedWallet?: boolean } | null)?.isEmbeddedWallet,
  );

  const readDogeOSBalance = useCallback(async () => {
    return walletAddress ? fetchDogeOSBalance(walletAddress) : 0n;
  }, [walletAddress]);

  /** Dogecoin L1 balance (satoshis) when the wallet exposes a Dogecoin account. */
  const readDogecoinBalance = useCallback(async (): Promise<DogecoinBalance | null> => {
    const provider = (
      connectors as { dogecoin?: { provider?: DogecoinProvider } & DogecoinProvider } | null
    )?.dogecoin;
    const dogecoin = provider?.provider ?? provider;
    if (typeof dogecoin?.getBalance !== "function") return null;
    // Wallets differ: DogeOS returns { confirmed, unconfirmed, total }; MyDoge's
    // `window.doge` returns { balance } (in koinu, 1e-8 DOGE). Normalise both.
    const raw = (await dogecoin.getBalance()) as unknown as Record<string, unknown> | null;
    const num = (value: unknown) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };
    const total = num(raw?.total) ?? num(raw?.balance) ?? null;
    if (total === null) return null;
    const confirmed = num(raw?.confirmed) ?? total;
    return { confirmed, unconfirmed: num(raw?.unconfirmed) ?? 0, total };
  }, [connectors]);

  /**
   * Makes sure the studio session belongs to the signed-in wallet (prompts one
   * signature if not). Works for DogeOS (0x) and MyDoge (Dogecoin) accounts.
   */
  const ensureSignedIn = useCallback(async () => {
    const account = accountAddress ?? getWalletAddress();
    if (!account) {
      openModal();
      throw new Error("Sign in with your DogeOS wallet to continue.");
    }
    if (!isWalletLinkedOnSession(account)) await prefetchAuthToken(true);
    return account;
  }, [accountAddress, openModal]);

  return {
    isConnected: Boolean(evmAddress),
    walletAddress,
    walletName,
    isEmbeddedWallet,
    chainId: chainIdNumber,
    walletLinkedOnSession: isWalletLinkedOnSession(walletAddress),
    openWalletModal: openModal,
    readDogeOSBalance,
    readDogecoinBalance,
    ensureSignedIn,
  };
}
