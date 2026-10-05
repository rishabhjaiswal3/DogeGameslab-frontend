import { api } from "../api";

/** Free games per tier for the signed-in wallet. Generation is free; this is the only limit. */
export type GenerationQuota = {
  limits: { fast: number; premium: number };
  used: { fast: number; premium: number };
  remaining: { fast: number; premium: number };
};

export async function fetchGenerationQuota(): Promise<GenerationQuota> {
  const { data } = await api.get("/games/generation-quota");
  return data.quota as GenerationQuota;
}

export function remainingForTier(quota: GenerationQuota | null | undefined, tier: 1 | 3): number {
  if (!quota) return 0;
  return tier === 1 ? quota.remaining.fast : quota.remaining.premium;
}

export function tierQuotaHint(
  quota: GenerationQuota | null | undefined,
  tier: 1 | 3,
): string | null {
  if (!quota) return null;
  const left = remainingForTier(quota, tier);
  return left > 0 ? `${left} free left` : "No free games left";
}
