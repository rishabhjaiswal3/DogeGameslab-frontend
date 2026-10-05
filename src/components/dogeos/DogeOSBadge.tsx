import { DogeOSIcon, DogeOSWordmark } from "@/components/dogeos/DogeBrand";
import { DOGEOS_IS_TESTNET, DOGEOS_SITE_URL } from "@/lib/dogeos";
import { cn } from "@/lib/utils";

/** "Built on DogeOS" chip with the official DogeOS icon and wordmark. */
export function DogeOSBadge({
  className = "",
  prefix = "Built on",
}: {
  className?: string;
  prefix?: string;
}) {
  return (
    <a
      href={DOGEOS_SITE_URL}
      target="_blank"
      rel="noopener noreferrer"
      title="DogeOS — the app layer for Dogecoin"
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-full border-2 border-doge-2 bg-ink-0 py-1 pl-1 pr-3 font-mono text-[10px] font-extrabold uppercase tracking-[0.14em] text-doge transition-colors hover:border-doge",
        className,
      )}
    >
      <DogeOSIcon size={20} className="rounded-full" />
      {prefix && <span className="shrink-0 text-text-2">{prefix}</span>}
      <DogeOSWordmark height={10} />
      {DOGEOS_IS_TESTNET && <span className="shrink-0 text-text-3">· Chikyū</span>}
    </a>
  );
}
