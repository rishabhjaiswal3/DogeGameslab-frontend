import axios from "axios";
import { getCurrentUserId, getIdentityAliases, getWalletAddress } from "./identity";
import { studioAuthLog, studioAuthWarn, tokenFingerprint } from "./authLog";

const rawBaseUrl = import.meta.env.VITE_API_URL ?? "";
const baseURL = rawBaseUrl.replace(/\/$/, "").endsWith("/api")
  ? rawBaseUrl.replace(/\/$/, "")
  : `${rawBaseUrl.replace(/\/$/, "")}/api`;

export const api = axios.create({
  baseURL,
  timeout: 12000,
  withCredentials: true,
});

type AnalyticsAxiosConfig = typeof api.defaults & { __analyticsStartedAt?: number };

function analyticsEndpoint(url?: string) {
  if (!url) return "unknown";
  try {
    const path = new URL(url, baseURL).pathname;
    return path
      .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "/:id")
      .replace(/\/[A-Za-z0-9_-]{18,}(?=\/|$)/g, "/:id")
      .replace(/\/\d+(?=\/|$)/g, "/:id");
  } catch {
    return "unknown";
  }
}

function reportApiAnalytics(detail: Record<string, unknown>) {
  window.dispatchEvent(
    new CustomEvent("dogegame:api-analytics", { detail: { service: "creator-studio", ...detail } }),
  );
}

api.interceptors.request.use((config) => {
  (config as unknown as AnalyticsAxiosConfig).__analyticsStartedAt = performance.now();
  return config;
});

// --- JWT plumbing -----------------------------------------------------------
// Write endpoints require a Bearer token. The token is issued after the
// connected DogeOS wallet signs a server challenge, so fetching one prompts the
// user — cache it and never re-prompt in a loop.

const TOKEN_KEY = "dogegame-auth-token";
const TOKEN_USER_KEY = "dogegame-auth-token-user";
const TOKEN_EVM_WALLET_KEY = "dogegame-auth-token-evm-wallet";
const SIGN_IN_COOLDOWN_MS = 60_000;

let tokenPromise: Promise<string | null> | null = null;
let signInBlockedUntil = 0;

/** Signs a sign-in message with the connected DogeOS wallet. */
export type WalletSigner = {
  address: string;
  signMessage: (message: string) => Promise<string>;
};

let walletSigner: WalletSigner | null = null;

/** Registered by the DogeOS provider while a wallet is connected. */
export function registerWalletSigner(signer: WalletSigner | null) {
  walletSigner = signer;
  if (!signer) tokenPromise = null;
}

export function storeAuthToken(
  token: string,
  userId?: string | null,
  evmWalletAddress?: string | null,
) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    const identityKey = normalizeIdentity(userId ?? evmWalletAddress ?? getCurrentUserId() ?? "");
    if (identityKey) localStorage.setItem(TOKEN_USER_KEY, identityKey);
    if (evmWalletAddress) {
      localStorage.setItem(TOKEN_EVM_WALLET_KEY, evmWalletAddress.toLowerCase());
    }
  } catch {
    // localStorage unavailable — ignore
  }
}

/** The account (wallet address) the stored studio token belongs to. */
export function getTokenUserId(): string | null {
  try {
    return localStorage.getItem(TOKEN_USER_KEY);
  } catch {
    return null;
  }
}

export function getTokenEvmWallet(): string | null {
  try {
    const cached = localStorage.getItem(TOKEN_EVM_WALLET_KEY);
    if (cached) return cached;
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
    const wallet = payload?.evmWalletAddress;
    return typeof wallet === "string" && wallet ? wallet.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function clearAuthToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_USER_KEY);
    localStorage.removeItem(TOKEN_EVM_WALLET_KEY);
  } catch {
    // localStorage unavailable — ignore
  }
  tokenPromise = null;
}

/** Warm the auth token cache after login — skips signing if a valid JWT exists. */
export function prefetchAuthToken(force = false): Promise<string | null> {
  if (!force && hasUsableCachedToken()) {
    return Promise.resolve(localStorage.getItem(TOKEN_KEY));
  }
  if (force) signInBlockedUntil = 0;
  return getToken(force);
}

function normalizeIdentity(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return /^0x[a-fA-F0-9]{40}$/.test(raw) ? raw.toLowerCase() : raw;
}

function tokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
    return typeof payload?.exp === "number" && payload.exp * 1000 <= Date.now() + 30_000;
  } catch {
    return true;
  }
}

/** True when a cached JWT exists for the currently connected wallet. */
export function hasUsableCachedToken(): boolean {
  const cached = localStorage.getItem(TOKEN_KEY);
  if (!cached || tokenExpired(cached)) return false;

  const aliases = new Set(getIdentityAliases().map(normalizeIdentity).filter(Boolean));
  const tokenUser = normalizeIdentity(localStorage.getItem(TOKEN_USER_KEY));
  if (tokenUser && aliases.has(tokenUser)) return true;

  const tokenWallet = getTokenEvmWallet();
  const connectedWallet = normalizeIdentity(getWalletAddress());
  return Boolean(tokenWallet && connectedWallet && tokenWallet === connectedWallet);
}

async function postAuth(path: string, body: Record<string, unknown>) {
  studioAuthLog(`POST /auth/${path}`, { url: `${baseURL}/auth/${path}` });
  try {
    const response = await axios.post(`${baseURL}/auth/${path}`, body, {
      timeout: 10000,
      withCredentials: true,
    });
    return response.data ?? null;
  } catch (error) {
    const axiosError = axios.isAxiosError(error) ? error : null;
    studioAuthWarn(`/auth/${path} failed`, {
      status: axiosError?.response?.status ?? null,
      code: axiosError?.code ?? null,
      message: axiosError?.message ?? String(error),
      reason: (axiosError?.response?.data as { error?: string } | undefined)?.error ?? null,
    });
    throw error;
  }
}

async function fetchTokenWithWallet(): Promise<string | null> {
  if (Date.now() < signInBlockedUntil) return null;

  const signer = walletSigner;
  // Signed out: public requests simply go without a token.
  if (!signer) return null;

  try {
    const challenge = await postAuth("challenge", { address: signer.address });
    const signature = await signer.signMessage(challenge.message);
    const authResponse = await postAuth("token", {
      address: signer.address,
      message: challenge.message,
      signature,
    });
    const token = authResponse?.token ?? null;
    if (token) {
      storeAuthToken(token, authResponse.userId, authResponse.evmWalletAddress);
      studioAuthLog("studio JWT stored", { token: tokenFingerprint(token) });
    }
    return token;
  } catch (error) {
    // Usually the user declined the signature — don't re-prompt immediately.
    signInBlockedUntil = Date.now() + SIGN_IN_COOLDOWN_MS;
    studioAuthWarn("wallet sign-in failed — backing off", { error: String(error) });
    throw error;
  }
}

function getToken(force = false): Promise<string | null> {
  if (!force && hasUsableCachedToken()) {
    return Promise.resolve(localStorage.getItem(TOKEN_KEY));
  }

  if (!tokenPromise) {
    tokenPromise = fetchTokenWithWallet().finally(() => {
      tokenPromise = null;
    });
  }
  return tokenPromise;
}

api.interceptors.request.use(async (config) => {
  const token = await getToken().catch(() => null);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => {
    const startedAt = (response.config as unknown as AnalyticsAxiosConfig).__analyticsStartedAt;
    reportApiAnalytics({
      outcome: "success",
      method: response.config.method?.toUpperCase(),
      endpoint: analyticsEndpoint(response.config.url),
      status: response.status,
      duration_ms: startedAt ? Math.round(performance.now() - startedAt) : undefined,
    });
    return response;
  },
  async (error) => {
    const config = error.config;
    if (error.response?.status === 401 && config && !config.__retriedAuth) {
      if (Date.now() < signInBlockedUntil) {
        return Promise.reject(error);
      }
      clearAuthToken();
      const token = await getToken(true).catch(() => null);
      if (token) {
        config.__retriedAuth = true;
        config.headers.Authorization = `Bearer ${token}`;
        return api.request(config);
      }
    }
    const startedAt = (error.config as AnalyticsAxiosConfig | undefined)?.__analyticsStartedAt;
    reportApiAnalytics({
      outcome: "failure",
      method: error.config?.method?.toUpperCase(),
      endpoint: analyticsEndpoint(error.config?.url),
      status: error.response?.status,
      duration_ms: startedAt ? Math.round(performance.now() - startedAt) : undefined,
      error_code: typeof error.code === "string" ? error.code : undefined,
      is_timeout: error.code === "ECONNABORTED",
      retried_auth: Boolean(error.config?.__retriedAuth),
    });
    return Promise.reject(error);
  },
);
