import { Link } from "@tanstack/react-router";
import { NAV_ITEMS } from "@/components/studio/navItems";
import { NavIcon, type NavIconName } from "@/components/studio/NavIcon";

const SIDE = NAV_ITEMS.filter((item) => item.to === "/" || item.to === "/templates");
const END = NAV_ITEMS.filter((item) => item.to === "/leaderboard" || item.to === "/profile");

export const MOBILE_BAR_COLOR = "#040607";

// Each tab has its own icon and colour.
const TAB_STYLE: Record<string, { icon: NavIconName; color: string }> = {
  "/": { icon: "home", color: "var(--phos)" },
  "/templates": { icon: "templates", color: "var(--cyan)" },
  "/leaderboard": { icon: "trophy", color: "var(--amber)" },
  "/profile": { icon: "user", color: "var(--doge)" },
};

function Tab({ item }: { item: (typeof NAV_ITEMS)[number] }) {
  const { icon, color } = TAB_STYLE[item.to];
  return (
    <Link
      to={item.to}
      activeOptions={{ exact: item.to === "/" }}
      className="mobile-tab group flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-1 text-text-3"
      style={{ ["--tab" as string]: color }}
    >
      <span className="mobile-tab-tile grid size-9 place-items-center border-2 border-transparent">
        <NavIcon name={icon} size={22} accent="var(--tab)" />
      </span>
      <span className="mobile-tab-label font-mono text-[9px] font-extrabold uppercase tracking-[0.14em]">
        {item.label}
      </span>
    </Link>
  );
}

/** Bottom tab bar (phones and tablets). */
export function MobileNav() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-line bg-ink-0 pb-[env(safe-area-inset-bottom,0px)] lg:hidden"
    >
      <div className="flex h-[64px] items-stretch">
        {SIDE.map((item) => (
          <Tab key={item.to} item={item} />
        ))}
        <div className="relative flex min-w-0 flex-1 items-center justify-center">
          <span aria-hidden="true" className="mobile-create-ring absolute -top-5 size-14" />
          <Link
            to="/create"
            aria-label="Create a game"
            className="px-btn absolute -top-5 h-14 w-14 p-0"
            data-variant="magenta"
          >
            <NavIcon name="create" size={30} accent="var(--doge)" />
          </Link>
          <span className="mt-9 font-mono text-[9px] font-extrabold uppercase tracking-[0.14em] text-magenta">
            Create
          </span>
        </div>
        {END.map((item) => (
          <Tab key={item.to} item={item} />
        ))}
      </div>
    </nav>
  );
}
