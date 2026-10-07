import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DogeGameLogo } from "@/components/studio/DogeGameLogo";
import { StudioSignInButton } from "@/components/studio/StudioSignInButton";
import { BackgroundAudioToggle } from "@/components/studio/GlobalAudioEffects";
import { ThemeToggle } from "@/components/studio/ThemeToggle";
import { DogeOSBadge } from "@/components/dogeos/DogeOSBadge";
import { shellPath } from "@/components/studio/navItems";
import { PixelIcon } from "@/components/term/PixelIcon";
import { Btn, Cursor, EmptyState } from "@/components/term/Term";
import { getCurrentUserId } from "@/lib/identity";
import { fetchNotifications, markNotificationsRead, type NotificationItem } from "@/lib/api/social";
import { AUTH_TOKEN_STORED_EVENT } from "@/lib/api";
import { cn } from "@/lib/utils";

function timeAgo(iso: string) {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 60_000) return "now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * Global status bar: shell prompt + search on the left, account and system
 * controls on the right. Rendered once by the app layout.
 */
export function AppHeader({ className = "" }: { className?: string }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  // "/" jumps to search, like most terminals and docs sites.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (document.querySelector("[role='dialog']")) return;
      event.preventDefault();
      void navigate({ to: "/search" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  useEffect(() => {
    const refresh = () => {
      // Read the user each time: sign-in can finish after this header mounts.
      const userId = getCurrentUserId();
      if (!userId) return;
      fetchNotifications(userId)
        .then((data) => setNotifications(data.notifications))
        .catch(() => setNotifications([]));
    };
    refresh();
    const interval = window.setInterval(refresh, 30_000);
    // Load them as soon as sign-in completes, not on the next 30s tick.
    window.addEventListener(AUTH_TOKEN_STORED_EVENT, refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener(AUTH_TOKEN_STORED_EVENT, refresh);
    };
  }, []);

  const openNotifications = async () => {
    setNotificationsOpen(true);
    const userId = getCurrentUserId();
    if (!userId) return;
    const data = await fetchNotifications(userId).catch(() => null);
    if (data) setNotifications(data.notifications);
    await markNotificationsRead(userId).catch(() => null);
    setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
  };

  const openNotificationTarget = (notification: NotificationItem) => {
    if (!notification.gameId) return;
    setNotificationsOpen(false);
    navigate({ to: "/play", search: { gameId: notification.gameId } });
  };

  const unread = notifications.filter((notification) => !notification.read).length;
  const path = shellPath(pathname);

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-40 flex h-[52px] w-full items-center gap-2 border-b-2 border-line bg-ink-0/95 px-3 backdrop-blur-sm sm:gap-3 lg:px-5",
          className,
        )}
      >
        <div className="lg:hidden">
          <span className="sm:hidden">
            <DogeGameLogo compact />
          </span>
          <span className="hidden sm:inline">
            <DogeGameLogo />
          </span>
        </div>

        <p
          className="hidden min-w-0 items-center font-mono text-[13px] lg:flex"
          aria-label={`Current section ${path}`}
        >
          <span className="text-phos">dogegame@create</span>
          <span className="text-text-3">:</span>
          <span className="text-cyan">{path}</span>
          <span className="text-text-3">$</span>
          <Cursor className="text-phos" />
        </p>

        <button
          type="button"
          onClick={() => navigate({ to: "/search" })}
          className="ml-2 hidden h-9 min-w-0 max-w-sm flex-1 items-center gap-2 border-2 border-line-2 bg-ink-1 px-3 text-left font-mono text-[12px] text-text-3 transition-colors hover:border-phos-3 hover:text-text-2 xl:flex"
        >
          <PixelIcon name="search" size={13} />
          <span className="truncate">grep games, categories, creators…</span>
          <kbd className="ml-auto">/</kbd>
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <DogeOSBadge className="hidden xl:inline-flex" prefix="" />
          <ThemeToggle />
          <StudioSignInButton variant="header" responsive compact />
          <BackgroundAudioToggle />
          <Btn
            variant="ghost"
            size="icon"
            onClick={() => navigate({ to: "/dashboard" })}
            aria-label="Open dashboard"
            title="Dashboard"
            className={pathname.includes("/dashboard") ? "text-phos" : ""}
          >
            <PixelIcon name="chart" size={15} />
          </Btn>
          <Btn
            variant="ghost"
            size="icon"
            onClick={() => navigate({ to: "/search" })}
            aria-label="Search games"
            title="Search"
            className="xl:hidden"
          >
            <PixelIcon name="search" size={15} />
          </Btn>
          <Btn
            variant="ghost"
            size="icon"
            onClick={() => void openNotifications()}
            aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
            title="Notifications"
            className="relative"
          >
            <PixelIcon name="bell" size={15} />
            {unread > 0 && (
              <span className="absolute -right-1.5 -top-1.5 grid min-w-4 place-items-center bg-magenta px-1 font-mono text-[9px] font-extrabold leading-4 text-white">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Btn>
        </div>
      </header>

      <Dialog open={notificationsOpen} onOpenChange={setNotificationsOpen}>
        <DialogContent className="max-h-[82vh] overflow-hidden p-0 sm:max-w-xl">
          <DialogTitle className="px-titlebar font-mono text-[10px] text-text">
            inbox — {notifications.length} message{notifications.length === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription className="sr-only">Your latest notifications.</DialogDescription>
          <div className="max-h-[70vh] overflow-y-auto px-4 pb-4">
            {notifications.length === 0 ? (
              <EmptyState text="No notifications yet. Builds, likes, and follows land here." />
            ) : (
              <ul className="divide-y-2 divide-line">
                {notifications.map((notification, index) => (
                  <li key={`${notification.createdAt}-${index}`}>
                    <button
                      type="button"
                      onClick={() => openNotificationTarget(notification)}
                      disabled={!notification.gameId}
                      className={cn(
                        "flex w-full gap-3 py-3 text-left transition-colors",
                        notification.gameId ? "hover:bg-ink-3" : "cursor-default",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-1 font-mono text-[11px] font-extrabold",
                          notification.read ? "text-text-3" : "text-magenta",
                        )}
                      >
                        {notification.read ? "·" : "●"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="text-sm font-bold text-text">{notification.title}</span>
                          <span className="shrink-0 font-mono text-[10px] text-text-3">
                            {timeAgo(notification.createdAt)}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-xs text-text-2">
                          {notification.body}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
