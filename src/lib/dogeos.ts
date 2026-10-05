import {
  getChains,
  getConnectors,
  type Chain,
  type WalletConnectKitConfig,
} from "@dogeos/dogeos-sdk";
import { createConfig, http } from "wagmi";
import { defineChain } from "viem";

// DogeOS — the app layer for Dogecoin. Users sign in with a DogeOS wallet
// (embedded email / Google / X wallet, or an external wallet such as MyDoge).
// Chikyū testnet is the live network today; point these env vars at mainnet
// when it launches.
export const DOGEOS_CLIENT_ID = import.meta.env.VITE_DOGEOS_CLIENT_ID ?? "";
export const DOGEOS_CHAIN_ID = Number(import.meta.env.VITE_DOGEOS_CHAIN_ID || 6281971);
export const DOGEOS_CHAIN_NAME = import.meta.env.VITE_DOGEOS_CHAIN_NAME || "DogeOS Chikyū Testnet";
export const DOGEOS_RPC_URL =
  import.meta.env.VITE_DOGEOS_RPC_URL || "https://rpc.testnet.dogeos.com/";
export const DOGEOS_EXPLORER_URL =
  import.meta.env.VITE_DOGEOS_EXPLORER_URL || "https://dogeos-testnet.l2scan.co";
export const DOGEOS_IS_TESTNET = (import.meta.env.VITE_DOGEOS_TESTNET ?? "true") !== "false";
export const DOGEOS_FAUCET_URL =
  import.meta.env.VITE_DOGEOS_FAUCET_URL || "https://faucet.testnet.dogeos.com";
export const DOGEOS_SITE_URL = "https://www.dogeos.com";

export const APP_NAME = import.meta.env.VITE_APP_NAME || "DogeGameLab";

/** DOGE brand yellow, from the DogeOS SDK theme. */
export const DOGE_YELLOW = "#fcd436";

export const dogeOS = defineChain({
  id: DOGEOS_CHAIN_ID,
  name: DOGEOS_CHAIN_NAME,
  nativeCurrency: { name: "DOGE", symbol: "DOGE", decimals: 18 },
  rpcUrls: { default: { http: [DOGEOS_RPC_URL] } },
  blockExplorers: { default: { name: "DogeOS L2Scan", url: DOGEOS_EXPLORER_URL } },
  testnet: DOGEOS_IS_TESTNET,
});

export const dogeOSChain = dogeOS satisfies Chain;

/** Wagmi mirrors the SDK's EVM chain so wagmi hooks follow the DogeOS wallet. */
export const wagmiConfig = createConfig({
  chains: [dogeOS],
  transports: {
    [dogeOS.id]: http(DOGEOS_RPC_URL),
  },
});

function appUrl(path = "") {
  if (typeof window === "undefined") return path;
  return new URL(`${import.meta.env.BASE_URL}${path}`, window.location.origin).toString();
}

export type DogeOSChains = NonNullable<WalletConnectKitConfig["chains"]>;

/**
 * Loads the SDK's own chain list (EVM + Dogecoin + Solana) and makes sure DogeOS
 * is in it. Passing only EVM chains would replace the SDK defaults and hide
 * Dogecoin-side wallets such as MyDoge.
 */
export async function loadDogeOSChains(timeoutMs = 6000): Promise<DogeOSChains> {
  const fallback: DogeOSChains = { evm: [dogeOSChain] };
  const sdkChains = await Promise.race([
    getChains().catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
  if (!sdkChains) return fallback;
  const evm = [...((sdkChains.evm as Chain[] | undefined) ?? [])];
  for (const chain of [dogeOSChain]) {
    if (!evm.some((existing) => Number(existing.id) === chain.id)) evm.push(chain);
  }
  return { ...sdkChains, evm } as DogeOSChains;
}

export type DogeOSConnectors = NonNullable<WalletConnectKitConfig["connectors"]>;

// Global names the MyDoge extension may expose. DogeOS's wallet registry only
// checks `mydoge.ethereum` / `mydoge.dogecoin`; some extension versions expose
// other names (e.g. `window.doge`), which made the SDK show "Install MyDoge"
// even with the extension installed.
const MYDOGE_EVM_PATHS = ["mydoge.ethereum", "mydoge.evm", "doge.ethereum", "dogeos.ethereum"];
const MYDOGE_DOGECOIN_PATHS = ["mydoge.dogecoin", "doge", "mydoge.doge"];

function resolveWindowPath(path: string): unknown {
  if (typeof window === "undefined") return undefined;
  return path
    .split(".")
    .reduce<unknown>((obj, key) => (obj as Record<string, unknown> | undefined)?.[key], window);
}

const firstInjected = (paths: string[]) => paths.find((path) => resolveWindowPath(path) != null);

/** Wallet extensions inject on load; give MyDoge a moment before reading it. */
async function waitForMyDoge(timeoutMs = 1500) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (firstInjected([...MYDOGE_EVM_PATHS, ...MYDOGE_DOGECOIN_PATHS])) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * True inside the MyDoge mobile app's browser. There the SDK (4.0.1+) finds the
 * app's own wallet itself, so the app must not hand it a custom wallet list.
 */
function isMyDogeNativeHost() {
  return (
    typeof window !== "undefined" &&
    Object.prototype.hasOwnProperty.call(window, "__mydogeWalletDocumentCapability")
  );
}

/**
 * The SDK's wallet list (from getConnectors()), with the MyDoge browser
 * extension's `window.doge` account filled in where the SDK did not find it.
 * Returns undefined — meaning "use the SDK's own list" — inside the MyDoge
 * mobile app, or if the list can't be fetched.
 */
export async function loadDogeOSConnectors(
  timeoutMs = 6000,
): Promise<DogeOSConnectors | undefined> {
  if (isMyDogeNativeHost()) return undefined;
  const [list] = await Promise.all([
    Promise.race([
      getConnectors().catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]),
    waitForMyDoge(),
  ]);
  if (!list?.length) return undefined;

  const evmPath = firstInjected(MYDOGE_EVM_PATHS);
  const dogecoinPath = firstInjected(MYDOGE_DOGECOIN_PATHS);
  console.info("[dogeos] MyDoge detected", {
    evm: evmPath ?? "not found",
    dogecoin: dogecoinPath ?? "not found",
    windowKeys:
      typeof window === "undefined" ? [] : Object.keys(window).filter((key) => /doge/i.test(key)),
  });

  // getConnectors() returns wallets the SDK has already processed
  // ({ info, isInstalled, connectors }), so MyDoge is patched in that shape:
  // attach the provider the extension really injects and mark it installed.
  type ProcessedWallet = {
    info?: { name?: string; rdns?: string; uuid?: string };
    isInstalled?: boolean;
    connectors?: Record<string, unknown>;
  };
  const isMyDoge = (wallet: ProcessedWallet) =>
    wallet.info?.uuid === "mydoge" ||
    wallet.info?.uuid === "76c06710-5988-80d9-3d01-31e2a716f636" ||
    wallet.info?.rdns === "inc.tomo.mydoge" ||
    wallet.info?.rdns === "com.mydoge" ||
    wallet.info?.rdns === "com.mydoge.wallet" ||
    /^mydoge$/i.test(wallet.info?.name ?? "");

  const patched = (list as ProcessedWallet[]).map((wallet) => {
    if (!isMyDoge(wallet)) return wallet;
    const connectors = { ...(wallet.connectors ?? {}) };
    const hasProvider = (chain: string) =>
      Boolean((connectors[chain] as { provider?: unknown } | null | undefined)?.provider);
    // Only fill in what the SDK did not find; a provider it found is left alone.
    if (evmPath && !hasProvider("evm")) {
      connectors.evm = {
        provider: resolveWindowPath(evmPath),
        protocol: "inject",
        standard: "eip1193",
      };
    }
    if (dogecoinPath && !hasProvider("dogecoin")) {
      connectors.dogecoin = {
        provider: resolveWindowPath(dogecoinPath),
        protocol: "inject",
        standard: "normal",
      };
    }
    // Drop the registry's empty slots (networks with no provider), so the
    // extension's Dogecoin-only account connects straight away with no picker.
    for (const chain of Object.keys(connectors)) {
      if (!hasProvider(chain)) delete connectors[chain];
    }
    const found = Object.keys(connectors).length > 0;
    return {
      ...wallet,
      isInstalled: found || wallet.isInstalled,
      connectors,
    };
  });

  // DogeOS first: MyDoge leads the wallet list, ahead of every other wallet.
  return [
    ...patched.filter(isMyDoge),
    ...patched.filter((wallet) => !isMyDoge(wallet)),
  ] as unknown as DogeOSConnectors;
}

export function buildDogeOSConfig(
  theme: "dark" | "light",
  chains?: DogeOSChains,
  connectors?: DogeOSConnectors,
): WalletConnectKitConfig {
  return {
    clientId: DOGEOS_CLIENT_ID,
    ...(connectors ? { connectors } : {}),
    // No defaultConnectChain: the wallet list would otherwise be filtered to
    // EVM-only connectors and hide MyDoge. The app reads the EVM account either way.
    ...(chains ? { chains } : {}),
    metadata: {
      name: APP_NAME,
      description: "Prompt to playable — build and share games on DogeOS.",
      url: appUrl(),
      icons: [appUrl("brand/icon-192x192.png?v=3")],
    },
    theme: {
      defaultTheme: theme,
      themes: {
        light: { colors: { primary: { DEFAULT: DOGE_YELLOW } } },
        dark: { colors: { primary: { DEFAULT: DOGE_YELLOW } } },
      },
    },
  };
}

export function formatDogeAmount(wei: bigint, decimals = 18, maxDecimals = 4) {
  const base = 10n ** BigInt(decimals);
  const whole = wei / base;
  const fraction = wei % base;
  if (fraction === 0n) return whole.toString();
  const text = fraction.toString().padStart(decimals, "0").slice(0, maxDecimals).replace(/0+$/, "");
  return text ? `${whole}.${text}` : whole.toString();
}

export async function fetchDogeOSBalance(address: string): Promise<bigint> {
  const response = await fetch(DOGEOS_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getBalance",
      params: [address, "latest"],
    }),
  });
  const payload = (await response.json()) as { result?: string };
  return payload.result ? BigInt(payload.result) : 0n;
}

/** "0x1234...abcd" — short form of a wallet address for display. */
export function formatShortAddress(address: string) {
  const trimmed = address.trim();
  if (trimmed.length <= 12) return trimmed;
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

export function dogeOSAddressUrl(address: string) {
  return `${DOGEOS_EXPLORER_URL.replace(/\/$/, "")}/address/${address}`;
}

export function dogeOSTxUrl(hash: string) {
  return `${DOGEOS_EXPLORER_URL.replace(/\/$/, "")}/tx/${hash}`;
}
