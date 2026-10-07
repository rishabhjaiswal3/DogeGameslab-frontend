import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useStudioAuth } from "@/hooks/useStudioAuth";
import { useCreatorStudio } from "@/hooks/useCreatorStudio";
import { AUTH_TOKEN_STORED_EVENT, api, hasUsableCachedToken } from "@/lib/api";
import { engineOf } from "@/lib/studio-meta";
import { findGameTemplate } from "@/lib/templates-loader";
import { ownsGame } from "@/lib/identity";

type Studio = ReturnType<typeof useCreatorStudio>;

type StudioContextValue = {
  studio: Studio;
  createdGames: any[];
  addCreatedGame: (game: any) => void;
  removeCreatedGame: (gameId: string) => Promise<void>;
  /** Re-fetches backend games and merges them in (e.g. while waiting for a build). */
  refreshCreatedGames: () => Promise<void>;
  /** Select a template (switching engine if needed) and jump to the Create route. */
  openInStudio: (templateId: string) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
};

const StudioContext = createContext<StudioContextValue | null>(null);

type SidebarState = {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
};

// The rail's open/closed state lives in its own context: only the Sidebar reads it, so
// toggling the rail does not re-render every page that reads the studio, and studio
// changes do not re-render the rail.
const SidebarContext = createContext<SidebarState | null>(null);

// localStorage holds lean metadata only: generated code is 20-30KB per game
// and would blow the ~5MB quota within a few dozen creations. Full packages
// (with code) live in memory and in the backend.
const LEGACY_CREATED_GAMES_KEY = "dogegame-created-games";
const createdGamesKey = (walletUserId: string) => `dogegame-created-games:${walletUserId}`;

function persistCreatedGames(walletUserId: string, games: any[]) {
  if (!walletUserId) return;
  try {
    const lean = games.slice(0, 60).map((g: any) => {
      const { refinement, plan, promptBundle, ...rest } = g ?? {};
      void plan;
      void promptBundle;
      return { ...rest, hasBuild: Boolean(refinement?.generatedCode) };
    });
    localStorage.setItem(createdGamesKey(walletUserId), JSON.stringify(lean));
  } catch {
    // quota exceeded — keep the in-memory state, drop persistence silently
  }
}

// Dead draft: a pure-agent game whose build never delivered code. A real
// build resolves within ~16 minutes; anything older without code is junk
// from an interrupted build and must never show in My Creations.
const DEAD_DRAFT_MS = 20 * 60 * 1000;
function isDeadDraft(game: any) {
  if (game?.templateId !== "pure-agent") return false;
  if (game?.refinement?.generatedCode || game?.hasBuild) return false;
  const born = Date.parse(String(game?.createdAt ?? "")) || 0;
  return born > 0 && Date.now() - born > DEAD_DRAFT_MS;
}

function isPlayableCreation(game: any) {
  if (["building", "failed", "cancelled"].includes(String(game?.buildStatus ?? ""))) return false;
  if (game?.templateId === "pure-agent" && !game?.refinement?.generatedCode && !game?.hasBuild) {
    return false;
  }
  return !isDeadDraft(game);
}

export function StudioProvider({
  children,
  openCreatePage,
}: {
  children: ReactNode;
  /**
   * Navigates to /create. Passed in by App rather than importing the router
   * here: router → routes → this module would form an import cycle, and in dev
   * every route edit would then re-run this module and orphan the provider.
   */
  openCreatePage: () => void;
}) {
  const studio = useCreatorStudio();
  const { ready: authReady, authenticated, user } = useStudioAuth();
  const walletUserId = authReady && authenticated ? (user?.id ?? "") : "";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [createdGames, setCreatedGames] = useState<any[]>([]);

  const loadCachedGames = useCallback((userId: string) => {
    if (!userId) return [];
    try {
      const key = createdGamesKey(userId);
      let stored = localStorage.getItem(key);

      // One-time migration from the old cache shared by every account. Only
      // records verified as belonging to this identity are retained.
      if (!stored) {
        const legacy = localStorage.getItem(LEGACY_CREATED_GAMES_KEY);
        const legacyGames: any[] = legacy ? JSON.parse(legacy) : [];
        const ownedLegacyGames = legacyGames.filter((g) => ownsGame(g?.creatorId));
        if (ownedLegacyGames.length) {
          persistCreatedGames(userId, ownedLegacyGames);
          stored = localStorage.getItem(key);
        }
        localStorage.removeItem(LEGACY_CREATED_GAMES_KEY);
      }

      const parsed: any[] = stored ? JSON.parse(stored) : [];
      return parsed
        .filter((g) => ownsGame(g?.creatorId))
        .filter(isPlayableCreation)
        .filter((g, i, all) => !g?.id || all.findIndex((x) => x?.id === g.id) === i);
    } catch {
      return [];
    }
  }, []);

  // Switching DogeOS wallets must immediately switch the in-memory game list.
  useEffect(() => {
    setCreatedGames(loadCachedGames(walletUserId));
  }, [loadCachedGames, walletUserId]);

  const addCreatedGame = useCallback(
    (game: any) => {
      if (!isPlayableCreation(game)) return;
      setCreatedGames((prev) => {
        const updated = [game, ...prev.filter((g: any) => g?.id !== game?.id)];
        persistCreatedGames(walletUserId, updated);
        return updated;
      });
    },
    [walletUserId],
  );

  const removeCreatedGame = useCallback(
    async (gameId: string) => {
      await api.delete(`/games/${encodeURIComponent(gameId)}`).catch(() => {});
      setCreatedGames((prev) => {
        const updated = prev.filter((g: any) => g?.id !== gameId);
        persistCreatedGames(walletUserId, updated);
        return updated;
      });
    },
    [walletUserId],
  );

  // A failed pure-agent build leaves a dead draft behind — no code and no
  // template to play. Delete it right away so it never lands in My Creations.
  const failedBuild = studio.activeBuild?.phase === "failed" ? studio.activeBuild : null;
  useEffect(() => {
    if (failedBuild?.strategy === "pure-agent" && failedBuild.game?.id) {
      void removeCreatedGame(failedBuild.game.id);
    }
  }, [failedBuild?.strategy, failedBuild?.game?.id, removeCreatedGame]);

  // localStorage only knows about games generated in this browser. Merge in
  // everything the backend persisted so creations show up on any client.
  // When both sides have the same game, prefer the copy that carries the
  // generated build (the backend saves it when the code job completes).
  const refreshCreatedGames = useCallback(async () => {
    if (!walletUserId) {
      setCreatedGames([]);
      return;
    }
    // The list is private to its owner, so it needs the session token. Signing
    // in takes a moment after the wallet connects; the list is fetched again
    // as soon as the token is stored (see the effect below).
    if (!hasUsableCachedToken()) return;
    try {
      // Only the current user's creations belong in My Creations.
      const response = await api.get("/games/list", {
        timeout: 15000,
        params: { creatorId: walletUserId, limit: 100 },
      });
      const remote: any[] = response.data?.games ?? [];
      setCreatedGames((prev) => {
        const remoteById = new Map(remote.filter((g: any) => g?.id).map((g: any) => [g.id, g]));
        // The backend list is authoritative. A cached game absent from this
        // authenticated creator's response belongs to another account or is stale.
        const kept = prev.filter(
          (g: any) => isPlayableCreation(g) && g?.id && remoteById.has(g.id),
        );
        const upgraded = kept.map((g: any) => {
          const r = remoteById.get(g?.id);
          if (!r) return g;
          if (r.refinement?.generatedCode && !g?.refinement?.generatedCode) {
            return r;
          }
          // The backend generates a real cover image in the background —
          // swap out the placeholder SVG when it has landed.
          const localIsPlaceholder =
            !g?.thumbnailUrl ||
            String(g.thumbnailUrl).startsWith("data:image/svg+xml") ||
            String(g.thumbnailUrl).startsWith("/api/"); // backend-served — upgrade to the CDN URL
          const remoteIsReal =
            r.thumbnailUrl && !String(r.thumbnailUrl).startsWith("data:image/svg+xml");
          if (localIsPlaceholder && remoteIsReal) {
            return { ...g, thumbnailUrl: r.thumbnailUrl };
          }
          return g;
        });
        const known = new Set(kept.map((g: any) => g?.id));
        const added = remote.filter((g: any) => isPlayableCreation(g) && g?.id && !known.has(g.id));
        const merged = [...upgraded, ...added];
        persistCreatedGames(walletUserId, merged);
        return merged;
      });
    } catch {
      // backend offline — local games still show
    }
  }, [walletUserId]);

  useEffect(() => {
    void refreshCreatedGames();
    const onToken = () => void refreshCreatedGames();
    window.addEventListener(AUTH_TOKEN_STORED_EVENT, onToken);
    return () => window.removeEventListener(AUTH_TOKEN_STORED_EVENT, onToken);
  }, [refreshCreatedGames]);

  const {
    createFromTemplate,
    customization,
    difficulty,
    extra,
    isTemplateSyncPaused,
    selectedId,
    setEngine,
    setSelectedId,
    theme,
    templatesReady,
  } = studio;

  // Keep the generated package in sync whenever the selection or options change.
  // Skipped while a prompt generation is updating the selection itself —
  // otherwise this would overwrite the AI-designed package with a template one.
  useEffect(() => {
    if (!templatesReady) return;
    if (isTemplateSyncPaused()) return;
    createFromTemplate();
  }, [
    createFromTemplate,
    customization,
    difficulty,
    extra,
    isTemplateSyncPaused,
    selectedId,
    templatesReady,
    theme,
  ]);

  // "Use Template" selects the template, tags it for the Create page, and lets
  // the user describe how the generated game should differ from the base.
  const openInStudio = useCallback(
    (templateId: string) => {
      void findGameTemplate(templateId).then((template) => {
        if (template) setEngine(engineOf(template));
        setSelectedId(templateId);
        sessionStorage.setItem("dogegame-create-template-id", templateId);
        openCreatePage();
      });
    },
    [openCreatePage, setEngine, setSelectedId],
  );

  // One stable object while nothing in it changed, so consumers re-render only on real changes.
  const value = useMemo<StudioContextValue>(
    () => ({
      studio,
      createdGames,
      addCreatedGame,
      removeCreatedGame,
      refreshCreatedGames,
      openInStudio,
      setSidebarCollapsed,
    }),
    [studio, createdGames, addCreatedGame, removeCreatedGame, refreshCreatedGames, openInStudio],
  );

  const sidebar = useMemo<SidebarState>(
    () => ({ sidebarCollapsed, setSidebarCollapsed }),
    [sidebarCollapsed],
  );

  return (
    <StudioContext.Provider value={value}>
      <SidebarContext.Provider value={sidebar}>{children}</SidebarContext.Provider>
    </StudioContext.Provider>
  );
}

/** The desktop rail's collapsed state and its setter. */
export function useSidebarState(): SidebarState {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebarState must be used within a StudioProvider");
  }
  return ctx;
}

export function useStudioContext(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) {
    throw new Error("useStudioContext must be used within a StudioProvider");
  }
  return ctx;
}
