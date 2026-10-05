import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useStudioContext } from "@/context/StudioContext";
import { AccountControls } from "@/components/studio/AccountControls";
import { DogeGameLogo } from "@/components/studio/DogeGameLogo";
import { NAV_ITEMS } from "@/components/studio/navItems";
import { PixelIcon } from "@/components/term/PixelIcon";
import { PixelSprite } from "@/components/term/PixelSprite";
import { DogeIcon, DogeOSWordmark } from "@/components/dogeos/DogeBrand";
import { DOGEOS_SITE_URL } from "@/lib/dogeos";
import { cn } from "@/lib/utils";

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

/** Desktop command rail. Number keys 1–6 jump between sections. */
export function Sidebar() {
  const { sidebarCollapsed, setSidebarCollapsed } = useStudioContext();
  const collapsed = sidebarCollapsed;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const inGame = /\/(play|edit)(\/|$)/.test(pathname);

  useEffect(() => {
    // Games read the keyboard too — never steal keys while one is on screen.
    if (inGame) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (isTypingTarget(event.target)) return;
      if (document.querySelector("[role='dialog']")) return;
      const item = NAV_ITEMS.find((entry) => entry.key === event.key);
      if (!item) return;
      event.preventDefault();
      void navigate({ to: item.to });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inGame, navigate]);

  return (
    <aside
      className={cn(
        "sticky top-0 z-40 hidden h-screen shrink-0 flex-col border-r-2 border-line bg-ink-0/95 lg:flex",
        collapsed ? "w-[68px]" : "w-[236px]",
      )}
    >
      <div
        className={cn(
          "flex h-[52px] shrink-0 items-center border-b-2 border-line",
          collapsed ? "justify-center" : "px-4",
        )}
      >
        <DogeGameLogo compact={collapsed} />
      </div>

      {!collapsed && (
        <div className="flex items-center gap-3 border-b-2 border-line px-4 py-3">
          <DogeIcon size={40} className="rounded-[11px]" />
          <div className="min-w-0 font-mono text-[10px] leading-4 text-text-3">
            <p className="font-bold text-phos">PROMPT → PLAYABLE</p>
            <p>Ai game studio · DogeOS</p>
          </div>
        </div>
      )}

      <nav
        aria-label="Main"
        className={cn("flex flex-1 flex-col gap-1 py-3", collapsed ? "px-2" : "px-3")}
      >
        {!collapsed && <p className="label-term mb-1 px-2 text-text-3">$ ls ~/</p>}
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.to === "/" }}
            title={collapsed ? `${item.label} (${item.key})` : undefined}
            className={cn(
              "group relative flex items-center border-2 border-transparent font-mono text-[13px] font-bold text-text-2 transition-colors hover:border-line-2 hover:bg-ink-2 hover:text-text",
              "data-[status=active]:border-phos-3 data-[status=active]:bg-phos/10 data-[status=active]:text-phos",
              collapsed ? "h-11 justify-center" : "h-10 gap-3 px-2.5",
            )}
          >
            <PixelIcon name={item.icon} size={15} />
            {!collapsed && (
              <>
                <span className="flex-1">
                  <span className="text-text-3 group-data-[status=active]:text-phos">./</span>
                  {item.cmd}
                </span>
                <kbd>{item.key}</kbd>
              </>
            )}
          </Link>
        ))}
      </nav>

      <div className={cn("border-t-2 border-line pt-3", collapsed ? "px-2" : "px-3")}>
        <AccountControls collapsed={collapsed} />
      </div>

      <div
        className={cn(
          "flex gap-2 border-t-2 border-line py-3",
          collapsed ? "flex-col items-center px-2" : "items-center justify-between px-3",
        )}
      >
        {!collapsed && (
          <a
            href={DOGEOS_SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="DogeOS — the app layer for Dogecoin"
            className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-text-3 transition-colors hover:text-text-2"
          >
            Powered by <DogeOSWordmark height={9} className="text-doge" />
          </a>
        )}
        <button
          type="button"
          onClick={() => setSidebarCollapsed(!collapsed)}
          className="px-btn"
          data-variant="ghost"
          data-size="icon"
          title={collapsed ? "Expand rail" : "Collapse rail"}
          aria-label={collapsed ? "Expand rail" : "Collapse rail"}
        >
          <PixelIcon name={collapsed ? "next" : "back"} size={12} />
        </button>
      </div>
    </aside>
  );
}
