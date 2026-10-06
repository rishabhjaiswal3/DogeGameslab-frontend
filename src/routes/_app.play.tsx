import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Loader2, MessageSquareWarning, Shuffle, Trash2 } from "lucide-react";
import { PixelIcon, type PixelIconName } from "@/components/term/PixelIcon";
import { PixelSprite } from "@/components/term/PixelSprite";
import { DogeIcon } from "@/components/dogeos/DogeBrand";
import {
  Btn,
  EmptyState,
  Spinner,
  Tag,
  TermLoader,
  TONE_TEXT,
  TONE_VAR,
  type Tone,
} from "@/components/term/Term";
import { categoryTone } from "@/components/term/tones";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useGameTemplates } from "@/hooks/useGameTemplates";
import { useReelFeed } from "@/hooks/useReelFeed";
import { GamePreview } from "@/components/studio/GamePreview";
import { Html5Preview } from "@/components/studio/Html5Preview";
import { PlayPageSkeleton } from "@/components/studio/PageSkeletons";
import { engineOf, templateEmoji, getThumbnailUrl, resolveGameThumbnail } from "@/lib/studio-meta";
import { GameCoverArtwork } from "@/components/studio/GameCoverArtwork";
import { useGameCoverArtwork, type CoverArtworkGame } from "@/hooks/useGameCoverArtwork";
import { localPackage } from "@/hooks/useCreatorStudio";
import { templateToGame } from "@/lib/studio-meta";
import { useSocial } from "@/hooks/useSocial";
import { useFollow } from "@/hooks/useFollow";
import { getCurrentUserId } from "@/lib/identity";
import { recordQualifiedPlay, recordView } from "@/lib/api/social";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { reelDebugLog } from "@/lib/debug";
import { useStudioContext } from "@/context/StudioContext";
import { api } from "@/lib/api";
import type { LeaderboardEntry } from "@/lib/api/leaderboards";
import type { SharePlatform } from "@/lib/api/social";
import { qualifyReferral } from "@/lib/api/referral";
import { publishGamePackage } from "@/lib/api/publishGame";
import {
  buildPlayUrl,
  clearPlayReturnPath,
  getPlayBackFallback,
  readPlayReturnPath,
} from "@/lib/playNavigation";
import { withAppBase } from "@/lib/appBase";

// Built-in mini games each belong to a single game id, so they load only when that game opens.
const NeonSudokuGame = lazy(() =>
  import("@/components/studio/NeonSudokuGame").then((module) => ({
    default: module.NeonSudokuGame,
  })),
);
const SimpleAgentGame = lazy(() =>
  import("@/components/studio/SimpleAgentGame").then((module) => ({
    default: module.SimpleAgentGame,
  })),
);

export const Route = createFileRoute("/_app/play")({
  validateSearch: (search: Record<string, unknown>) => ({
    gameId: typeof search.gameId === "string" ? search.gameId : "",
  }),
  pendingComponent: PlayPageSkeleton,
  head: ({ match }) => ({
    meta: [
      { title: `${match.search.gameId} - Creator Studio` },
      { name: "description", content: "Play this game instantly from the social feed." },
    ],
  }),
  component: PlayFeed,
});

const creatorProfiles = [
  { handle: "@archeologist", name: "archeologist", avatar: "A", bio: "Browse their games" },
  { handle: "@neo", name: "neo", avatar: "N", bio: "Fast arcade experiments" },
  { handle: "@luma", name: "luma", avatar: "L", bio: "Puzzle loops and bright worlds" },
  { handle: "@pixel", name: "pixel", avatar: "P", bio: "Tiny games, big scores" },
  { handle: "@orbit", name: "orbit", avatar: "O", bio: "3D web playgrounds" },
];

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// Module-scoped so it survives remounts and is shared across every reel swipe
// in this tab. Without it, every community game hit its own fresh /games/:id
// round trip on each swipe — even ones already seen — which is what forced
// the full-page loading skeleton to flash on nearly every scroll (see
// hasRenderedOnceRef below for the other half of that fix).
const publicGameCache = new Map<string, any>();
const publicGameFetches = new Map<string, Promise<any>>();

function fetchPublicGame(id: string): Promise<any> {
  if (publicGameCache.has(id)) return Promise.resolve(publicGameCache.get(id));
  let inflight = publicGameFetches.get(id);
  if (!inflight) {
    inflight = api
      .get(`/games/${encodeURIComponent(id)}`)
      .then((res) => {
        const found = res.data?.game;
        if (found?.id === id) publicGameCache.set(id, found);
        publicGameFetches.delete(id);
        return found;
      })
      .catch((error) => {
        publicGameFetches.delete(id);
        throw error;
      });
    publicGameFetches.set(id, inflight);
  }
  return inflight;
}

// Loading placeholder for reel swipes after the first one. Deliberately just
// the reel's own black background + spinner — not the full PlayPageSkeleton
// (which renders a totally different layout with a header/sidebar/card rows)
// so a slow network swipe still looks like "this game is loading", not like
// the page itself reloaded.
function ReelSwipeFallback() {
  return (
    <div className="grid h-[100dvh] w-full place-items-center bg-ink-0">
      <TermLoader label="Next cartridge" />
    </div>
  );
}

function ReelPeekSlide({ game }: { game: any | null }) {
  if (!game) return <div className="h-full w-full shrink-0 bg-ink-0" />;
  const coverGame: CoverArtworkGame = {
    id: String(game.id ?? ""),
    templateId: game.templateId ? String(game.templateId) : undefined,
    familyTemplateId: game.familyTemplateId ? String(game.familyTemplateId) : undefined,
    thumbnailUrl: game.thumbnailUrl,
    emoji: game.emoji,
    gradient: game.gradient,
  };
  return (
    <div className="scanlines relative h-full w-full shrink-0 overflow-hidden bg-ink-0">
      <GameCoverArtwork
        game={coverGame}
        lookupId={String(game.id)}
        emojiClass="text-6xl opacity-70"
        imageClassName="absolute inset-0 h-full w-full object-cover opacity-40"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-ink-0 via-ink-0/40 to-transparent" />
      <div className="absolute inset-x-0 bottom-28 px-6 text-center">
        <p className="font-pixel text-[11px] text-phos glow-phos">LOADING…</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  High-score table (per-game leaderboard)
// ═══════════════════════════════════════════════════════════════════════════

const PODIUM_TONES: Tone[] = ["amber", "cyan", "magenta"];

function LeaderboardPanel({
  template,
  entries,
  loading,
  onClose,
}: {
  template: any;
  entries: LeaderboardEntry[];
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b-2 border-line pb-4">
        <div className="min-w-0">
          <p className="font-pixel text-[14px] text-amber glow-amber">HIGH SCORES</p>
          <p className="mt-2 truncate font-mono text-[11px] text-text-3">{template.name}</p>
        </div>
        <Btn variant="ghost" size="icon" onClick={onClose} aria-label="Close leaderboard">
          <PixelIcon name="close" size={12} />
        </Btn>
      </div>

      {loading && (
        <div className="grid flex-1 place-items-center">
          <TermLoader label="Reading scores" />
        </div>
      )}

      {!loading && entries.length === 0 && (
        <div className="grid flex-1 place-items-center py-8">
          <EmptyState
            sprite="coin"
            title="NO SCORES YET"
            text="This game has its own leaderboard. Be the first name on it."
          />
        </div>
      )}

      {!loading && entries.length > 0 && (
        <div className="flex-1 overflow-y-auto py-3">
          <div className="grid grid-cols-[3rem_1fr_auto] gap-x-3 px-2 pb-2 font-mono text-[10px] font-extrabold uppercase tracking-[0.14em] text-text-3">
            <span>Rank</span>
            <span>Name</span>
            <span className="text-right">Score</span>
          </div>
          <ol>
            {entries.map((row, index) => {
              const tone = PODIUM_TONES[index];
              return (
                <li
                  key={`${row.rank}-${row.userId}`}
                  className={cn(
                    "grid grid-cols-[3rem_1fr_auto] items-center gap-x-3 px-2 py-1.5 font-mono",
                    index % 2 === 0 && "bg-ink-2",
                  )}
                >
                  <span
                    className={cn(
                      "font-term text-[26px] leading-none",
                      tone ? TONE_TEXT[tone] : "text-text-3",
                    )}
                  >
                    {ordinal(row.rank)}
                  </span>
                  <span
                    className={cn(
                      "truncate text-[13px] font-bold",
                      tone ? "text-text" : "text-text-2",
                    )}
                  >
                    {row.username}
                  </span>
                  <span
                    className={cn(
                      "font-term text-[24px] leading-none tabular-nums",
                      tone ? TONE_TEXT[tone] : "text-text",
                    )}
                  >
                    {String(row.score).padStart(6, "0")}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}

function ordinal(n: number) {
  const suffix =
    n % 10 === 1 && n % 100 !== 11
      ? "ST"
      : n % 10 === 2 && n % 100 !== 12
        ? "ND"
        : n % 10 === 3 && n % 100 !== 13
          ? "RD"
          : "TH";
  return `${n}${suffix}`;
}

function PlayFeed() {
  const { gameId } = Route.useSearch();
  const navigate = useNavigate();
  const { setSidebarCollapsed, studio, createdGames, refreshCreatedGames, addCreatedGame } =
    useStudioContext();
  const { gameTemplates, themePresets, loading: templatesLoading } = useGameTemplates();
  const isSimpleAgentGame = gameId === "simple-agent-game";
  const isNeonSudoku = gameId === "neon-sudoku";

  const isTemplateRoute = gameTemplates.some((template: any) => template.id === gameId);
  const generatedPackageMatches =
    !isTemplateRoute &&
    Boolean(studio.generatedPackage?.id) &&
    (studio.generatedPackage?.id === gameId ||
      studio.generatedPackage?.templateId === gameId ||
      (gameId === "pure-agent" && studio.generatedPackage?.templateId === "pure-agent"));
  // A created game opened by its own id (from My Creations / profile). Without
  // this lookup, unknown ids silently fell back to gameTemplates[0] and played
  // the wrong game instead of the creation's generated build.
  const localCustomGame = !generatedPackageMatches
    ? createdGames.find((cg: any) => cg?.id === gameId)
    : undefined;
  const [publicGame, setPublicGame] = useState<any>(null);
  const [publicLoadState, setPublicLoadState] = useState<
    "idle" | "loading" | "loaded" | "not-found"
  >("idle");
  const [publishingDraft, setPublishingDraft] = useState(false);
  const [publishDraftError, setPublishDraftError] = useState("");
  const [publishedLocally, setPublishedLocally] = useState(false);

  useEffect(() => {
    setPublishedLocally(false);
    setPublishDraftError("");
  }, [gameId]);
  const customGame = localCustomGame ?? (publicGame?.id === gameId ? publicGame : undefined);

  // Shared links resolve through the public-by-ID endpoint. It returns only
  // explicitly published games, so drafts cannot be opened by guessing an id.
  useEffect(() => {
    if (
      !gameId ||
      isSimpleAgentGame ||
      isNeonSudoku ||
      isTemplateRoute ||
      generatedPackageMatches ||
      localCustomGame
    ) {
      setPublicLoadState("idle");
      return;
    }
    const cached = publicGameCache.get(gameId);
    if (cached) {
      // Already fetched (earlier visit, or the reel prefetch below) — resolve
      // synchronously so this swipe never touches the loading state at all.
      setPublicGame(cached);
      setPublicLoadState("loaded");
      return;
    }
    let cancelled = false;
    setPublicGame(null);
    setPublicLoadState("loading");
    fetchPublicGame(gameId)
      .then((found) => {
        if (cancelled) return;
        if (found?.id === gameId) {
          setPublicGame(found);
          setPublicLoadState("loaded");
        } else setPublicLoadState("not-found");
      })
      .catch(() => {
        if (!cancelled) setPublicLoadState("not-found");
      });
    return () => {
      cancelled = true;
    };
  }, [
    gameId,
    isSimpleAgentGame,
    isNeonSudoku,
    isTemplateRoute,
    generatedPackageMatches,
    localCustomGame,
  ]);

  // The AI build finishes minutes after the game record exists. While this
  // created game has no code yet, poll the backend so the finished build
  // swaps in without requiring a manual refresh.
  const awaitingBuild = Boolean(customGame) && !customGame?.refinement?.generatedCode;
  useEffect(() => {
    if (!awaitingBuild) return;
    const interval = setInterval(() => {
      void refreshCreatedGames();
    }, 20000);
    return () => clearInterval(interval);
  }, [awaitingBuild, refreshCreatedGames]);

  const index = Math.max(
    0,
    gameTemplates.findIndex((t: any) => t.id === gameId),
  );
  const baseTemplate = gameTemplates[index] ?? gameTemplates[0] ?? null;
  const template = isNeonSudoku
    ? {
        ...(baseTemplate ?? {}),
        id: "neon-sudoku",
        name: "Neon Sudoku",
        category: "Puzzle",
        mechanic: "Complete the 9x9 number grid without repeating digits.",
        controls: "Mouse, touch, keyboard numbers, or R to restart.",
      }
    : isSimpleAgentGame
      ? {
          ...(baseTemplate ?? {}),
          id: "simple-agent-game",
          name: "Simple Agent Game",
          category: "Agent Arcade",
          mechanic: "Click the glowing target as many times as possible in 20 seconds.",
          controls: "Mouse, touch, or R to restart.",
        }
      : generatedPackageMatches && studio.generatedPackage
        ? {
            id: studio.generatedPackage.templateId || "pure-agent",
            name: studio.generatedPackage.title || "AI Custom Game",
            category: studio.generatedPackage.category || "Casual",
            mechanic: studio.generatedPackage.gameplay?.mechanic || "custom gameplay mechanics",
            controls: studio.generatedPackage.gameplay?.controls || "controls",
            engine:
              studio.generatedPackage.build?.renderer === "construct" ? "construct" : "threejs",
          }
        : customGame
          ? {
              id: customGame.id || customGame.templateId || "pure-agent",
              name: customGame.title || "AI Custom Game",
              category: customGame.category || "Casual",
              mechanic: customGame.gameplay?.mechanic || "custom gameplay mechanics",
              controls: customGame.gameplay?.controls || "controls",
              // Generated builds run on the canvas renderer regardless of the
              // template family they were routed from.
              engine: "threejs",
            }
          : isTemplateRoute
            ? baseTemplate
            : null!;

  const game = isNeonSudoku
    ? {
        ...templateToGame(template, index),
        title: template.name,
        category: template.category,
        emoji: "🔢",
      }
    : isSimpleAgentGame
      ? {
          ...templateToGame(template, index),
          title: template.name,
          category: template.category,
          emoji: "🎯",
        }
      : generatedPackageMatches && studio.generatedPackage
        ? {
            title: studio.generatedPackage.title,
            category: studio.generatedPackage.category,
            plays: "1.2K",
            emoji: "🎮",
            gradient: "violet" as const,
            creator: "0G AI Agent",
            thumbnailUrl:
              (studio.generatedPackage as any).thumbnailUrl ||
              withAppBase("/thumbnails/chess-cover.png"),
            templateId: studio.generatedPackage.id || studio.generatedPackage.templateId,
          }
        : customGame
          ? {
              id: gameId,
              title: customGame.title,
              category: customGame.category ?? "Game",
              plays: "New",
              emoji: "🎮",
              gradient: "violet" as const,
              creator: "you",
              thumbnailUrl: resolveGameThumbnail(customGame),
              templateId: customGame.id ?? customGame.templateId,
              familyTemplateId: customGame.familyTemplateId,
            }
          : templateToGame(template, index);

  const engine = engineOf(template);
  const gameTags = Array.from(
    new Set([game.category, engine === "construct" ? "HTML5" : "Canvas", "AI Generated"]),
  );
  const profile = creatorProfiles[index % creatorProfiles.length];
  const pkg = generatedPackageMatches
    ? studio.generatedPackage
    : (customGame ??
      (template
        ? localPackage(
            template,
            {
              prompt: `${template.name} playable feed session`,
              theme: "neon",
              difficulty: "normal",
              customization: "light",
              extra: "none",
            },
            themePresets,
          )
        : null));
  const coverGame = useMemo<CoverArtworkGame>(
    () => ({
      id: gameId,
      templateId: game.templateId ?? template?.id,
      familyTemplateId: customGame?.familyTemplateId,
      thumbnailUrl:
        customGame?.thumbnailUrl ??
        game.thumbnailUrl ??
        (pkg as { thumbnailUrl?: string } | null)?.thumbnailUrl,
      emoji: game.emoji,
      gradient: game.gradient,
    }),
    [
      customGame?.familyTemplateId,
      customGame?.thumbnailUrl,
      game.emoji,
      game.gradient,
      game.templateId,
      game.thumbnailUrl,
      gameId,
      pkg,
      template?.id,
    ],
  );
  const coverLookupId = String(template?.id ?? gameId);
  const playCoverArtwork = useGameCoverArtwork(coverGame, coverLookupId);
  const isCustomCreation = Boolean(generatedPackageMatches || customGame);
  const isShareable = !isCustomCreation || pkg?.publish?.published === true || publishedLocally;

  const handlePublishDraft = async () => {
    if (publishingDraft || !isCustomCreation) return;
    try {
      setPublishingDraft(true);
      setPublishDraftError("");
      const result = await publishGamePackage(gameId);
      if (result.game) {
        addCreatedGame(result.game as any);
        setPublishedLocally(true);
      }
      void refreshCreatedGames();
    } catch (error: any) {
      setPublishDraftError(
        error?.response?.data?.error ?? error?.message ?? "Could not publish this game.",
      );
    } finally {
      setPublishingDraft(false);
    }
  };
  const baseRemixCount = Number((customGame as any)?.remixes ?? (pkg as any)?.remixes ?? 0);
  const [remixCount, setRemixCount] = useState(baseRemixCount);
  const social = useSocial(gameId);
  // Real follow state: target the game's creator (template games fall back to
  // a stable pseudo-creator id derived from the displayed creator name).
  const creatorId =
    (pkg as any)?.creatorId ??
    (customGame as any)?.creatorId ??
    `creator:${game.creator ?? "studio"}`;
  const follow = useFollow(creatorId);
  const isFollowing = follow.following;
  const setIsFollowing = (_next?: boolean) => {
    if (follow.isSelf) return;
    void follow.toggle();
  };
  // Count a real play once per game per browser session.
  const [viewCount, setViewCount] = useState<number | null>(null);
  useEffect(() => {
    if (!gameId) return;
    const key = `dogegame-viewed-${gameId}`;
    const uid = getCurrentUserId();
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    recordView(gameId, uid)
      .then((r) => setViewCount(r.views))
      .catch(() => {});
  }, [gameId]);
  useEffect(() => {
    setRemixCount(baseRemixCount);
  }, [baseRemixCount, gameId]);

  const handleRemix = useCallback(() => {
    const seed = [
      `Remix ${game.title}`,
      (pkg as any)?.gameplay?.mechanic ||
        template?.mechanic ||
        `${template?.category ?? game.category ?? "Arcade"} game`,
      "Keep the core mechanics, physics, controls, and pacing.",
      "Change the theme, characters, visual style, and one gameplay twist.",
    ].join(". ");
    sessionStorage.setItem("dogegame-remix-prompt", seed);
    setRemixCount((count) => count + 1);
    navigate({ to: "/create" });
  }, [game.category, game.title, navigate, pkg, template?.category, template?.mechanic]);
  if (viewCount != null)
    game.plays = viewCount >= 1000 ? `${(viewCount / 1000).toFixed(1)}K` : String(viewCount);
  const isMobile = useIsMobile();
  const leaderboard = useLeaderboard(gameId);
  const { submitScore } = leaderboard;
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [isGameActive, setIsGameActive] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const playStartedAt = useRef(Date.now());
  // True once the reel has shown real content at least once this session.
  // The full PlayPageSkeleton (different layout entirely — header, sidebar,
  // card rows) is only appropriate for that very first paint; showing it
  // again on every later swipe is what made scrolling the reel look broken —
  // each swipe briefly tore down the whole page into an unrelated skeleton
  // instead of just the current slide. Later swipes use a small in-place
  // spinner (ReelSwipeFallback below) that matches the reel's own look.
  const hasRenderedOnceRef = useRef(false);

  useEffect(() => {
    setIsGameActive(false);
    playStartedAt.current = Date.now();
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;
    const key = `dogegame-qualified-play-${gameId}`;
    if (sessionStorage.getItem(key)) return;

    const uid = getCurrentUserId();
    if (!uid) return;
    const sessionId = `${gameId}:${uid}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const timer = window.setTimeout(() => {
      const durationSeconds = Math.floor((Date.now() - playStartedAt.current) / 1000);
      recordQualifiedPlay(gameId, { userId: uid, sessionId, durationSeconds })
        .then((result) => {
          if (result.qualified) sessionStorage.setItem(key, "1");
        })
        .catch(() => {});
    }, 30_000);

    return () => window.clearTimeout(timer);
  }, [gameId]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const platformTemplateIds = useMemo(
    () => [
      "neon-sudoku",
      "simple-agent-game",
      ...gameTemplates.map((template) => template.id as string),
    ],
    [gameTemplates],
  );

  const {
    activeGamesList,
    loading: reelFeedLoading,
    getNextGameId,
    getPrevGameId,
    tryLoadMoreForNavigation,
    orderedIds,
  } = useReelFeed(gameId, platformTemplateIds);

  const [endOfFeedOpen, setEndOfFeedOpen] = useState(false);

  useEffect(() => {
    setSidebarCollapsed(leaderboardOpen);
    return () => {
      setSidebarCollapsed(false);
    };
  }, [leaderboardOpen, setSidebarCollapsed]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === frameRef.current);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen?.();
      return;
    }
    await frameRef.current?.requestFullscreen?.();
  };

  const handleScoreSubmit = useCallback(
    async (score: number) => {
      const userId = getCurrentUserId();
      if (!userId) return;
      await submitScore(score).catch(() => {});
      const durationSeconds = Math.floor((Date.now() - playStartedAt.current) / 1000);
      const qualificationKey = `dogegame-referral-qualified-${userId}`;
      if (durationSeconds > 30 && !localStorage.getItem(qualificationKey)) {
        const result = await qualifyReferral(gameId, durationSeconds).catch(() => null);
        if (result?.qualified || result?.status === "held") {
          localStorage.setItem(qualificationKey, "1");
        }
      }
    },
    [gameId, submitScore],
  );

  const [isDragging, setIsDragging] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [reelPeekSide, setReelPeekSide] = useState<"next" | "prev" | null>(null);
  const isUiHidden = false;
  const startY = useRef(0);
  const startX = useRef(0);
  const dragYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const gestureModeRef = useRef<"undecided" | "reel" | "game">("undecided");
  const cooldownRef = useRef(false);
  const transitionTimerRef = useRef<number | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const reduceMotionRef = useRef(false);
  // Live drag position is painted straight to the DOM (see applyReelTransform)
  // instead of going through React state on every touchmove tick — a full
  // reconciliation of this component per finger-move tick is what made the
  // feed feel janky on phones, competing with each game's own render loop.
  const reelSlideRef = useRef<HTMLDivElement | null>(null);
  const reelNextPeekRef = useRef<HTMLDivElement | null>(null);
  const reelPrevPeekRef = useRef<HTMLDivElement | null>(null);
  const reelRafIdRef = useRef<number | null>(null);
  const reelPeekSideRef = useRef<"next" | "prev" | null>(null);

  const slideDistance = useCallback(() => {
    if (mainRef.current?.clientHeight) return mainRef.current.clientHeight;
    return typeof window !== "undefined" ? window.innerHeight : 720;
  }, []);

  const applyReelTransform = useCallback(
    (y: number, transitioning: boolean) => {
      if (reelSlideRef.current) {
        reelSlideRef.current.style.transform = `translate3d(0, ${y}px, 0)`;
        reelSlideRef.current.style.pointerEvents =
          Math.abs(y) > 10 || transitioning ? "none" : "auto";
      }
      if (reelNextPeekRef.current) {
        reelNextPeekRef.current.style.transform = `translate3d(0, ${slideDistance() + y}px, 0)`;
      }
      if (reelPrevPeekRef.current) {
        reelPrevPeekRef.current.style.transform = `translate3d(0, ${-slideDistance() + y}px, 0)`;
      }
    },
    [slideDistance],
  );

  useEffect(() => {
    reduceMotionRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current);
      }
      if (reelRafIdRef.current !== null) {
        cancelAnimationFrame(reelRafIdRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
    cooldownRef.current = false;
    setIsDragging(false);
    isDraggingRef.current = false;
    gestureModeRef.current = "undecided";
    dragYRef.current = 0;
    applyReelTransform(0, false);
    reelPeekSideRef.current = null;
    setReelPeekSide(null);
    setIsTransitioning(false);
    setIsGameActive(false);
  }, [gameId, applyReelTransform]);

  // Safety watchdog: the swipe path is gated by cooldownRef + isTransitioning,
  // which are supposed to clear on every navigation. If any reset is ever missed
  // (e.g. a navigation that doesn't change gameId, or a transition timer that got
  // cleared), those flags would stay set and freeze all further scrolling. This
  // force-clears them shortly after a transition starts so the reel can never get
  // permanently stuck.
  useEffect(() => {
    if (!isTransitioning) return;
    const timer = window.setTimeout(() => {
      cooldownRef.current = false;
      isDraggingRef.current = false;
      setIsDragging(false);
      gestureModeRef.current = "undecided";
      dragYRef.current = 0;
      applyReelTransform(0, false);
      setIsTransitioning(false);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [isTransitioning, applyReelTransform]);

  const navigateToReelGame = useCallback(
    (nextGameId: string) => {
      navigate({
        to: "/play",
        search: { gameId: nextGameId },
        replace: true,
        resetScroll: false,
      });
      // Snap track back instantly after route change (new game is already centered).
      dragYRef.current = 0;
      applyReelTransform(0, false);
      reelPeekSideRef.current = null;
      setReelPeekSide(null);
      setIsTransitioning(false);
      transitionTimerRef.current = window.setTimeout(() => {
        cooldownRef.current = false;
      }, 320);
    },
    [navigate, applyReelTransform],
  );

  const handlePlayBack = useCallback(() => {
    const returnTo = readPlayReturnPath();
    clearPlayReturnPath();

    if (returnTo) {
      const [pathname, search = ""] = returnTo.split("?");
      const target = pathname || "/";
      try {
        if (search) {
          const params = Object.fromEntries(new URLSearchParams(search));
          navigate({ to: target, search: params });
        } else {
          navigate({ to: target });
        }
      } catch {
        navigate({ to: getPlayBackFallback() });
      }
      return;
    }

    // No remembered origin (direct link / refresh) → leave reels for home.
    navigate({ to: getPlayBackFallback() });
  }, [navigate]);

  useEffect(() => {
    const currentIndex = orderedIds.indexOf(gameId);
    if (currentIndex < 0) return;
    const upcoming = orderedIds.slice(currentIndex + 1, currentIndex + 7);
    upcoming
      .map((id) => getThumbnailUrl(id))
      .filter(Boolean)
      .forEach((src) => {
        const image = new Image();
        image.decoding = "async";
        image.src = String(src);
      });

    // Warm the /games/:id cache for whatever the user is likely to swipe to
    // next (forward bias — a reel is scrolled forward far more than back) so
    // the data is already resolved by the time the swipe lands, instead of
    // fetching cold on every single navigation.
    const prevId = orderedIds[currentIndex - 1];
    [...upcoming.slice(0, 3), prevId]
      .filter((id): id is string => Boolean(id) && !platformTemplateIds.includes(id!))
      .forEach((id) => {
        void fetchPublicGame(id).catch(() => {});
      });
  }, [gameId, orderedIds, platformTemplateIds]);

  const triggerNextGame = useCallback(() => {
    reelDebugLog("triggerNextGame called", {
      cooldown: cooldownRef.current,
      activeGamesListLength: activeGamesList.length,
      isTransitioning,
    });
    if (cooldownRef.current || reelFeedLoading || isTransitioning) return;

    const goNext = (nextId: string) => {
      if (!nextId || nextId === gameId) return;
      cooldownRef.current = true;
      setIsTransitioning(true);
      isDraggingRef.current = false;
      setIsDragging(false);
      // Button/wheel/keyboard-triggered navigation skips the drag entirely, so
      // nothing else ever tells the incoming slide to render — without this,
      // the outgoing slide just translates off-screen onto the bare black
      // page background for the whole transition (a blank flash) instead of
      // sliding over the next game like a drag-driven swipe does.
      reelPeekSideRef.current = "next";
      setReelPeekSide("next");
      const distance = slideDistance();
      dragYRef.current = -distance;
      applyReelTransform(-distance, true);

      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current);
      }
      const delay = reduceMotionRef.current ? 40 : 340;
      transitionTimerRef.current = window.setTimeout(() => {
        navigateToReelGame(nextId);
      }, delay);
    };

    let nextId = getNextGameId(gameId);
    if (nextId) {
      goNext(nextId);
      return;
    }

    void (async () => {
      const loaded = await tryLoadMoreForNavigation();
      nextId = getNextGameId(gameId);
      if (nextId) {
        goNext(nextId);
        return;
      }
      if (!loaded) setEndOfFeedOpen(true);
    })();
  }, [
    activeGamesList.length,
    applyReelTransform,
    gameId,
    getNextGameId,
    isTransitioning,
    navigateToReelGame,
    reelFeedLoading,
    slideDistance,
    tryLoadMoreForNavigation,
  ]);

  const triggerPrevGame = useCallback(() => {
    reelDebugLog("triggerPrevGame called", {
      cooldown: cooldownRef.current,
      activeGamesListLength: activeGamesList.length,
      isTransitioning,
    });
    if (cooldownRef.current || reelFeedLoading || isTransitioning) return;
    const prevId = getPrevGameId(gameId);
    if (!prevId || prevId === gameId) return;

    cooldownRef.current = true;
    setIsTransitioning(true);
    isDraggingRef.current = false;
    setIsDragging(false);
    // See the matching comment in triggerNextGame's goNext — without this the
    // transition has no incoming slide to show and just goes blank.
    reelPeekSideRef.current = "prev";
    setReelPeekSide("prev");
    const distance = slideDistance();
    dragYRef.current = distance;
    applyReelTransform(distance, true);

    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
    }
    const delay = reduceMotionRef.current ? 40 : 340;
    transitionTimerRef.current = window.setTimeout(() => {
      navigateToReelGame(prevId);
    }, delay);
  }, [
    activeGamesList.length,
    applyReelTransform,
    gameId,
    getPrevGameId,
    isTransitioning,
    navigateToReelGame,
    reelFeedLoading,
    slideDistance,
  ]);

  // Deliberately does NOT bail out for every <button>/<a> — the "Play" cover
  // button alone covers a large chunk of the screen, so a swipe that happens
  // to start on it (very common — it's dead center) was being dropped
  // entirely: handleDragStart never armed, so the whole gesture went nowhere.
  // A plain tap still works fine without this: with no significant movement
  // gestureModeRef stays "undecided" and we never call preventDefault, so the
  // native click still fires. Only real "hand this whole area to something
  // else" zones (inputs, the actions bar, comments/leaderboard panels) opt out.
  const shouldIgnoreReelTarget = (target: HTMLElement) =>
    Boolean(
      target.closest("input") ||
      target.closest("textarea") ||
      target.closest("[data-reel-actions]") ||
      target.closest(".comments-panel") ||
      target.closest(".leaderboard-panel"),
    );

  const setReelPeekSideIfChanged = (side: "next" | "prev" | null) => {
    if (side === reelPeekSideRef.current) return;
    reelPeekSideRef.current = side;
    setReelPeekSide(side);
  };

  const handleDragStart = (clientX: number, clientY: number, target: HTMLElement) => {
    // While a game is actually being played, swipe is reserved for the game
    // itself — reel navigation only happens via the explicit up/down buttons.
    // Only the poster/cover state (thumbnail + Play button, game paused) is
    // swipeable. This also means we no longer try to intercept any touch
    // inside an active game at all, so there's nothing left to fight over.
    if (isGameActive || cooldownRef.current || isTransitioning || shouldIgnoreReelTarget(target)) {
      reelDebugLog("handleDragStart bailed", {
        isGameActive,
        cooldown: cooldownRef.current,
        isTransitioning,
        ignoredTarget: shouldIgnoreReelTarget(target),
        tag: target?.tagName,
      });
      return false;
    }
    startX.current = clientX;
    startY.current = clientY;
    dragYRef.current = 0;
    gestureModeRef.current = "undecided";
    isDraggingRef.current = true;
    setIsDragging(true);
    applyReelTransform(0, false);
    return true;
  };

  // Returns the gesture mode this move landed on ("reel" | "game" |
  // "undecided" | undefined for ignored moves). Iframe-hosted games (see
  // GeneratedGameFrame) read this to stop double-handling a vertical swipe —
  // without it, the same drag would both slide the reel AND get replayed as
  // an in-game arrow-key press by the game's own touch bridge.
  const handleDragMove = (
    clientX: number,
    clientY: number,
    event?: TouchEvent | MouseEvent,
  ): "reel" | "game" | "undecided" | void => {
    if (!isDraggingRef.current || cooldownRef.current || isTransitioning) return;
    const deltaX = clientX - startX.current;
    const deltaY = clientY - startY.current;

    if (gestureModeRef.current === "undecided") {
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      if (absX < 10 && absY < 10) return "undecided";
      // Vertical intent → reel. Horizontal / game-like → leave to the game.
      if (absY > absX * 1.15 && absY > 12) {
        gestureModeRef.current = "reel";
        reelDebugLog("gesture mode → reel", { absX, absY });
      } else if (absX > absY * 1.05) {
        gestureModeRef.current = "game";
        reelDebugLog("gesture mode → game (bailing, letting game handle it)", { absX, absY });
        isDraggingRef.current = false;
        setIsDragging(false);
        dragYRef.current = 0;
        applyReelTransform(0, false);
        setReelPeekSideIfChanged(null);
        return "game";
      } else {
        return "undecided";
      }
    }

    if (gestureModeRef.current !== "reel") return gestureModeRef.current;

    event?.preventDefault();
    const distance = slideDistance();
    const next = Math.max(-distance, Math.min(distance, deltaY * 0.92));
    dragYRef.current = next;

    setReelPeekSideIfChanged(next < -4 ? "next" : next > 4 ? "prev" : null);

    if (reelRafIdRef.current === null) {
      reelRafIdRef.current = requestAnimationFrame(() => {
        reelRafIdRef.current = null;
        applyReelTransform(dragYRef.current, false);
      });
    }
    return "reel";
  };

  const handleDragEnd = () => {
    if (!isDraggingRef.current || isTransitioning) return;
    isDraggingRef.current = false;
    setIsDragging(false);

    if (reelRafIdRef.current !== null) {
      cancelAnimationFrame(reelRafIdRef.current);
      reelRafIdRef.current = null;
    }

    if (gestureModeRef.current !== "reel") {
      gestureModeRef.current = "undecided";
      dragYRef.current = 0;
      applyReelTransform(0, false);
      setReelPeekSideIfChanged(null);
      return;
    }

    const y = dragYRef.current;
    const threshold = Math.min(96, slideDistance() * 0.14);
    gestureModeRef.current = "undecided";
    reelDebugLog("handleDragEnd", { y, threshold, cooldown: cooldownRef.current });

    if (y < -threshold) {
      triggerNextGame();
      return;
    }
    if (y > threshold) {
      triggerPrevGame();
      return;
    }
    dragYRef.current = 0;
    applyReelTransform(0, false);
    setReelPeekSideIfChanged(null);
  };

  const prevReelGame = useMemo(() => {
    const prevId = getPrevGameId(gameId);
    return prevId ? { id: prevId } : null;
  }, [gameId, getPrevGameId]);

  const nextReelGame = useMemo(() => {
    const nextId = getNextGameId(gameId);
    return nextId ? { id: nextId } : null;
  }, [gameId, getNextGameId]);

  const activeIndex = useMemo(() => {
    const index = orderedIds.indexOf(gameId);
    return index === -1 ? 0 : index;
  }, [gameId, orderedIds]);

  const reelHandlersRef = useRef({
    handleDragStart,
    handleDragMove,
    handleDragEnd,
  });
  reelHandlersRef.current = { handleDragStart, handleDragMove, handleDragEnd };

  // Games render in an iframe (or a same-document canvas). Touches that start
  // inside an iframe never bubble to `mainRef` below — the browser dispatches
  // them entirely within the iframe's own document. These stable callbacks let
  // Html5Preview/GeneratedGameFrame forward gesture coordinates they capture
  // (via direct same-origin listeners or postMessage) into the exact same
  // swipe-to-change-game logic `mainRef` already uses, so reel navigation keeps
  // working even while swiping over the game itself.
  const forwardReelTouchStart = useCallback((x: number, y: number, target: HTMLElement) => {
    const accepted = reelHandlersRef.current.handleDragStart(x, y, target);
    reelDebugLog("iframe-forwarded touchstart", { accepted });
    return accepted;
  }, []);
  const forwardReelTouchMove = useCallback(
    (x: number, y: number, event?: TouchEvent) =>
      reelHandlersRef.current.handleDragMove(x, y, event),
    [],
  );
  const forwardReelTouchEnd = useCallback(() => reelHandlersRef.current.handleDragEnd(), []);

  // A plain `useEffect(() => { if (!mainRef.current) return; ... }, [])` here
  // was the actual "swipe just doesn't work" bug: that effect only ever runs
  // ONCE, right after this component's very first commit. The very first
  // commit is almost always a loading skeleton (data hasn't arrived yet), so
  // `<main>` doesn't exist in the tree yet and `mainRef.current` is null — the
  // effect saw that, bailed, and (because its deps are `[]`) never tried
  // again once the real reel UI mounted moments later. Every same-document
  // touch (the cover/poster state, canvas-rendered games) went through this
  // dead listener forever after. Iframe-hosted games still worked because
  // they reach the reel via a completely separate path (postMessage
  // forwarding, see forwardReelTouchStart/Move/End) that never depended on
  // this attachment. A callback ref fixes it at the source: it fires exactly
  // when the `<main>` DOM node itself actually appears/disappears, no matter
  // how many loading renders happened first.
  const reelTouchCleanupRef = useRef<(() => void) | null>(null);
  const setMainNode = useCallback((node: HTMLElement | null) => {
    reelTouchCleanupRef.current?.();
    reelTouchCleanupRef.current = null;
    mainRef.current = node;
    if (!node) return;

    const onTouchStart = (event: TouchEvent) => {
      reelDebugLog("mainRef touchstart", {
        touches: event.touches.length,
        target: (event.target as HTMLElement)?.tagName,
      });
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      const accepted = reelHandlersRef.current.handleDragStart(
        touch.clientX,
        touch.clientY,
        event.target as HTMLElement,
      );
      reelDebugLog("mainRef handleDragStart", { accepted });
    };
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      reelHandlersRef.current.handleDragMove(touch.clientX, touch.clientY, event);
    };
    const onTouchEnd = () => {
      reelDebugLog("mainRef touchend");
      reelHandlersRef.current.handleDragEnd();
    };
    const onTouchCancel = () => reelHandlersRef.current.handleDragEnd();

    node.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
    node.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
    node.addEventListener("touchend", onTouchEnd, { capture: true });
    node.addEventListener("touchcancel", onTouchCancel, { capture: true });
    reelTouchCleanupRef.current = () => {
      node.removeEventListener("touchstart", onTouchStart, true);
      node.removeEventListener("touchmove", onTouchMove, true);
      node.removeEventListener("touchend", onTouchEnd, true);
      node.removeEventListener("touchcancel", onTouchCancel, true);
    };
  }, []);

  useEffect(() => {
    let lastWheelTime = 0;
    const handleWheel = (e: WheelEvent) => {
      // Same rule as touch: while actually playing, only the explicit
      // up/down buttons change games — an implicit scroll gesture shouldn't.
      if (isGameActive) return;
      const target = e.target as HTMLElement;
      if (shouldIgnoreReelTarget(target)) return;
      if (Math.abs(e.deltaY) < 10) return;

      const now = Date.now();
      if (now - lastWheelTime < 480) return;

      e.preventDefault();
      lastWheelTime = now;
      if (e.deltaY > 0) triggerNextGame();
      else triggerPrevGame();
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, [isGameActive, triggerNextGame, triggerPrevGame]);

  const socialButtons = (
    <>
      <ActionButton
        icon={<Shuffle className="size-5" />}
        label={formatCount(remixCount)}
        caption="Remix"
        onClick={handleRemix}
        tone="magenta"
      />
      <ActionButton
        icon={<PixelIcon name="trophy" size={17} />}
        label="Rank"
        onClick={() => setLeaderboardOpen(true)}
        tone="amber"
      />
      <ShareButton
        count={social.shareCount}
        open={social.shareMenuOpen}
        onToggle={() => social.setShareMenuOpen(!social.shareMenuOpen)}
        onShare={social.handleShare}
        template={template}
        game={game}
        gameId={gameId}
        disabled={!isShareable}
      />
      <ActionButton
        icon={<PixelIcon name="chat" size={17} />}
        label={social.commentCount > 0 ? formatCount(social.commentCount) : "0"}
        caption="Chat"
        onClick={() => social.setCommentsOpen(!social.commentsOpen)}
        active={social.commentsOpen}
        tone="cyan"
      />
      <LikeButton
        liked={social.liked}
        count={social.likeCount}
        onToggle={social.handleLike}
        animating={social.likeAnimating}
      />
      <FavoriteButton
        favorited={social.favorited}
        count={social.favoriteCount}
        onToggle={social.handleFavorite}
        animating={social.favoriteAnimating}
      />
      <ActionButton
        icon={<PixelIcon name="expand" size={16} />}
        label={isFullscreen ? "Exit" : "Full"}
        onClick={toggleFullscreen}
      />
    </>
  );

  const isKnownGame =
    isSimpleAgentGame ||
    isNeonSudoku ||
    generatedPackageMatches ||
    Boolean(customGame) ||
    gameTemplates.some((candidate: any) => candidate.id === gameId);

  // Wait for templates and/or the public game payload before rendering play UI.
  if (
    templatesLoading &&
    !isSimpleAgentGame &&
    !isNeonSudoku &&
    !customGame &&
    !generatedPackageMatches
  ) {
    return hasRenderedOnceRef.current ? <ReelSwipeFallback /> : <PlayPageSkeleton />;
  }

  if (!isKnownGame && (publicLoadState === "idle" || publicLoadState === "loading")) {
    return hasRenderedOnceRef.current ? <ReelSwipeFallback /> : <PlayPageSkeleton />;
  }

  if (!isKnownGame && publicLoadState === "not-found") {
    return (
      <div className="grid h-[100dvh] place-items-center bg-ink-0 px-6">
        <div className="crt-overlay" aria-hidden="true" />
        <div className="max-w-md text-center">
          <PixelSprite name="ghost" scale={6} color="var(--text-3)" className="mx-auto" />
          <h1 className="font-pixel mt-6 text-[16px] leading-relaxed text-magenta glow-magenta">
            CARTRIDGE NOT FOUND
          </h1>
          <p className="mt-4 text-sm leading-6 text-text-2">
            This link does not exist, or the creator has not published the game yet.
          </p>
          <Link to="/" className="px-btn mt-6" data-variant="primary">
            Browse games
          </Link>
        </div>
      </div>
    );
  }

  // Still resolving game metadata — avoid rendering against a null template/pkg.
  if (!template || !pkg) {
    return hasRenderedOnceRef.current ? <ReelSwipeFallback /> : <PlayPageSkeleton />;
  }
  hasRenderedOnceRef.current = true;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-ink-0 text-text">
      {/* Back (phones) */}
      <button
        type="button"
        onClick={handlePlayBack}
        aria-label="Go back"
        className="px-btn absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-50 lg:hidden"
        data-variant="ghost"
        data-size="icon"
        style={{ background: "rgb(4 6 7 / 0.75)" }}
      >
        <PixelIcon name="back" size={13} />
      </button>

      {isCustomCreation && !isShareable && (
        <div className="absolute left-1/2 top-3 z-[60] flex -translate-x-1/2 flex-col items-center gap-1.5">
          <div className="flex items-center gap-3 border-2 border-amber-2 bg-ink-0/90 py-1 pl-3 pr-1 font-mono text-[11px] font-extrabold uppercase tracking-[0.12em] text-amber">
            <span className="animate-blink">●</span> Draft
            <Btn
              variant="amber"
              size="sm"
              onClick={() => void handlePublishDraft()}
              disabled={publishingDraft}
            >
              {publishingDraft ? "Publishing…" : "Publish"}
            </Btn>
          </div>
          {publishDraftError ? (
            <p className="max-w-[min(90vw,20rem)] border-2 border-danger/50 bg-ink-0/90 px-3 py-1 text-[11px] font-bold text-danger">
              {publishDraftError}
            </p>
          ) : null}
        </div>
      )}

      {/* Prev / next (desktop) */}
      <div className="absolute right-6 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-3 lg:flex">
        <Btn size="icon" onClick={triggerPrevGame} aria-label="Previous game" className="h-12 w-12">
          <PixelIcon name="up" size={16} />
        </Btn>
        <span className="text-center font-mono text-[10px] font-bold text-text-3">
          {String(activeIndex + 1).padStart(2, "0")}
        </span>
        <Btn size="icon" onClick={triggerNextGame} aria-label="Next game" className="h-12 w-12">
          <PixelIcon name="down" size={16} />
        </Btn>
      </div>

      <main
        ref={setMainNode}
        onMouseDown={(event) => {
          handleDragStart(event.clientX, event.clientY, event.target as HTMLElement);
        }}
        onMouseMove={(event) => {
          if (!isDraggingRef.current) return;
          handleDragMove(event.clientX, event.clientY, event.nativeEvent);
        }}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
        className="absolute inset-x-0 top-0 bottom-[calc(64px+env(safe-area-inset-bottom))] w-full touch-none select-none lg:bottom-0"
      >
        {/* Adjacent reel peeks — positioned imperatively by applyReelTransform. */}
        {nextReelGame && reelPeekSide === "next" && (
          <div
            ref={reelNextPeekRef}
            className="pointer-events-none absolute inset-0 z-[5]"
            style={{
              transform: `translate3d(0, ${slideDistance()}px, 0)`,
              transition: isDragging ? "none" : "transform 0.34s cubic-bezier(0.22, 1, 0.36, 1)",
              willChange: "transform",
            }}
            aria-hidden="true"
          >
            <ReelPeekSlide game={nextReelGame} />
          </div>
        )}
        {prevReelGame && reelPeekSide === "prev" && (
          <div
            ref={reelPrevPeekRef}
            className="pointer-events-none absolute inset-0 z-[5]"
            style={{
              transform: `translate3d(0, ${-slideDistance()}px, 0)`,
              transition: isDragging ? "none" : "transform 0.34s cubic-bezier(0.22, 1, 0.36, 1)",
              willChange: "transform",
            }}
            aria-hidden="true"
          >
            <ReelPeekSlide game={prevReelGame} />
          </div>
        )}

        <div
          ref={reelSlideRef}
          className="absolute inset-0 z-10 h-full w-full"
          style={{
            transform: "translate3d(0, 0, 0)",
            transition: isDragging ? "none" : "transform 0.34s cubic-bezier(0.22, 1, 0.36, 1)",
            opacity: isTransitioning ? 0.9 : 1,
            willChange: "transform",
            pointerEvents: "auto",
          }}
        >
          {!playCoverArtwork.showFallback && playCoverArtwork.thumbnailUrl ? (
            <img
              src={playCoverArtwork.thumbnailUrl}
              alt=""
              onError={(event) => playCoverArtwork.handleImageError(event.currentTarget)}
              className="absolute inset-0 h-full w-full object-cover opacity-20 blur-2xl"
            />
          ) : null}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgb(61_255_143/0.08)_1px,transparent_1.4px)] [background-size:18px_18px]" />

          {/* Game column */}
          <div
            className={`pointer-events-none absolute inset-0 z-10 flex items-center justify-center transition-all duration-500 ease-out ${leaderboardOpen ? "lg:pr-[420px]" : ""}`}
          >
            <div className="relative flex h-full w-full items-center justify-center lg:w-auto">
              <div
                ref={frameRef}
                className={`feed-game-frame pointer-events-auto relative h-full w-full overflow-hidden bg-black lg:w-[400px] lg:border-x-2 lg:border-line ${
                  engine === "construct" ? "feed-game-frame--construct" : "feed-game-frame--canvas"
                } ${leaderboardOpen ? "feed-game-frame--leaderboard-open" : ""}`}
              >
                <div
                  className={`h-full w-full lg:h-[calc(100%-72px)] ${!isGameActive ? "invisible pointer-events-none" : ""}`}
                >
                  {isNeonSudoku ? (
                    <Suspense fallback={null}>
                      <NeonSudokuGame onScoreSubmit={handleScoreSubmit} />
                    </Suspense>
                  ) : isSimpleAgentGame ? (
                    <Suspense fallback={null}>
                      <SimpleAgentGame onScoreSubmit={handleScoreSubmit} />
                    </Suspense>
                  ) : engine === "construct" ? (
                    <Html5Preview
                      templateId={String(template?.id ?? gameId)}
                      onReelTouchStart={forwardReelTouchStart}
                      onReelTouchMove={forwardReelTouchMove}
                      onReelTouchEnd={forwardReelTouchEnd}
                    />
                  ) : (
                    <GamePreview
                      gamePackage={pkg}
                      onScoreSubmit={handleScoreSubmit}
                      onReelTouchStart={forwardReelTouchStart}
                      onReelTouchMove={forwardReelTouchMove}
                      onReelTouchEnd={forwardReelTouchEnd}
                    />
                  )}
                </div>

                {/* Attract mode: the game stays paused until PRESS START. */}
                {!isGameActive && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center overflow-hidden bg-ink-0/92 px-6 lg:bottom-[72px]">
                    <div
                      key={gameId}
                      className="animate-rise relative z-10 w-[min(78vw,340px)] border-2 border-line-2 bg-ink-2 p-1.5 shadow-[6px_6px_0_0_#000]"
                    >
                      <div className="scanlines relative aspect-[4/3] overflow-hidden bg-ink-0">
                        <GameCoverArtwork
                          game={coverGame}
                          lookupId={coverLookupId}
                          alt={`${game.title} cover`}
                          emojiClass="text-7xl"
                          className="relative z-[1]"
                          imageClassName="relative h-full w-full object-cover"
                          fallbackClassName="relative grid h-full w-full place-items-center"
                        />
                        <span className="absolute bottom-2 left-2 z-[3] flex items-center gap-1 border border-line-2 bg-ink-0/85 px-1.5 py-0.5 font-mono text-[10px] font-extrabold text-text">
                          <PixelIcon name="play" size={8} className="text-phos" />
                          {game.plays || "0"}
                        </span>
                      </div>
                      <div className="px-1 pb-1 pt-2.5">
                        <p className="font-pixel truncate text-[11px] leading-snug text-text">
                          {game.title}
                        </p>
                        <div className="mt-2 flex items-center gap-1.5">
                          <Tag tone={categoryTone(game.category)}>{game.category}</Tag>
                          <Tag tone="dim">{engine === "construct" ? "HTML5" : "Canvas"}</Tag>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        reelDebugLog("Play button clicked", { gameId });
                        setIsGameActive(true);
                      }}
                      className="px-btn relative z-10 mt-6 w-[min(64vw,260px)]"
                      data-variant="primary"
                      data-size="lg"
                    >
                      <PixelIcon name="play" size={13} />
                      <span>Press start</span>
                      <span className="animate-blink">_</span>
                    </button>
                    <p className="relative z-10 mt-4 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-text-3">
                      <span className="lg:hidden">Swipe for another game</span>
                      <span className="hidden lg:inline">Scroll or ↑↓ for another game</span>
                    </p>
                  </div>
                )}

                {/* Creator bar (desktop, bottom of the frame) */}
                <div className="absolute bottom-0 left-0 right-0 z-30 hidden h-[72px] items-center gap-3 border-t-2 border-line bg-ink-0 px-4 lg:flex">
                  <span className="grid size-10 shrink-0 place-items-center border-2 border-line-2 bg-ink-2">
                    <DogeIcon size={24} className="rounded-[7px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[12px] font-extrabold text-text">
                      {game.title}
                    </span>
                    <span className="block truncate font-mono text-[10px] text-text-3">
                      @{game.creator}
                    </span>
                  </span>
                  {isFullscreen && (
                    <Btn
                      variant="ghost"
                      size="icon"
                      onClick={toggleFullscreen}
                      title="Exit fullscreen"
                      aria-label="Exit fullscreen"
                    >
                      <PixelIcon name="close" size={11} />
                    </Btn>
                  )}
                  <Btn
                    variant={isFollowing ? "ghost" : "primary"}
                    size="sm"
                    onClick={() => setIsFollowing(!isFollowing)}
                    disabled={follow.isSelf}
                    title={follow.isSelf ? "You cannot follow yourself" : undefined}
                  >
                    {follow.isSelf ? "You" : isFollowing ? "Following" : "+ Follow"}
                  </Btn>
                </div>
              </div>

              {/* Action rail (desktop) */}
              <aside className="pointer-events-auto ml-5 hidden flex-col items-center gap-3 pb-6 lg:flex">
                {socialButtons}
              </aside>
            </div>
          </div>
        </div>

        {/* Iframe touches cannot bubble to the reel; these edge zones keep
            next/previous navigation available without blocking game controls. */}
        <div
          aria-label="Swipe up or down to change game"
          className="absolute bottom-[calc(64px+env(safe-area-inset-bottom)+0.75rem)] left-0 top-24 z-30 flex w-11 touch-none items-center justify-start pl-1.5 lg:hidden"
        >
          <span className="h-16 w-1 bg-phos/40" />
        </div>
        <div
          aria-label="Tap or swipe up or down to change game"
          className="absolute bottom-[calc(64px+env(safe-area-inset-bottom)+0.75rem)] right-0 top-24 z-30 flex w-11 touch-none items-center justify-end pr-1.5 lg:hidden"
        >
          <span className="flex h-24 w-6 flex-col items-center justify-between border-2 border-line-2 bg-ink-0/70 py-1.5 text-text-2">
            <button
              type="button"
              onClick={triggerPrevGame}
              className="pointer-events-auto -m-1 grid place-items-center p-1"
              aria-label="Previous game"
            >
              <PixelIcon name="up" size={10} />
            </button>
            <span className="h-6 w-1 bg-phos/60" />
            <button
              type="button"
              onClick={triggerNextGame}
              className="pointer-events-auto -m-1 grid place-items-center p-1"
              aria-label="Next game"
            >
              <PixelIcon name="down" size={10} />
            </button>
          </span>
        </div>
      </main>

      {/* Phone footer: creator, follow, actions */}
      <aside
        data-reel-actions
        className="absolute inset-x-0 bottom-0 z-40 flex h-[calc(64px+env(safe-area-inset-bottom))] touch-manipulation items-center gap-2 border-t-2 border-line bg-ink-0 px-2.5 pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <Btn
          variant={isFollowing ? "ghost" : "primary"}
          size="sm"
          onClick={() => setIsFollowing(!isFollowing)}
          disabled={follow.isSelf}
          className="shrink-0 px-2.5"
        >
          {follow.isSelf ? "You" : isFollowing ? "Following" : "+ Follow"}
        </Btn>
        <div className="flex min-w-0 flex-1 items-center justify-around">
          <LikeButton
            liked={social.liked}
            count={social.likeCount}
            onToggle={social.handleLike}
            animating={social.likeAnimating}
            compact
          />
          <ActionButton
            icon={<PixelIcon name="chat" size={16} />}
            label={social.commentCount > 0 ? formatCount(social.commentCount) : "0"}
            onClick={() => social.setCommentsOpen(!social.commentsOpen)}
            active={social.commentsOpen}
            tone="cyan"
            compact
          />
          <FavoriteButton
            favorited={social.favorited}
            count={social.favoriteCount}
            onToggle={social.handleFavorite}
            animating={social.favoriteAnimating}
            compact
          />
          <ActionButton
            icon={<PixelIcon name="trophy" size={16} />}
            label="Rank"
            onClick={() => setLeaderboardOpen(true)}
            tone="amber"
            compact
          />
          <ShareButton
            count={social.shareCount}
            open={social.shareMenuOpen}
            onToggle={() => social.setShareMenuOpen(!social.shareMenuOpen)}
            onShare={social.handleShare}
            template={template}
            game={game}
            gameId={gameId}
            disabled={!isShareable}
            compact
          />
          <ActionButton
            icon={<PixelIcon name="more" size={14} />}
            label="More"
            onClick={() => setDetailsModalOpen(true)}
            compact
          />
        </div>
      </aside>

      <DetailsModal
        open={detailsModalOpen}
        onClose={() => setDetailsModalOpen(false)}
        template={template}
        profile={profile}
        social={social}
        pkg={pkg}
        plays={game.plays}
        generatedPackageMatches={generatedPackageMatches}
        isFollowing={isFollowing}
        setIsFollowing={setIsFollowing}
      />

      {endOfFeedOpen && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-ink-0/90 px-5">
          <section className="px-panel w-full max-w-sm" data-tone="magenta">
            <div className="flex flex-col items-center p-6 text-center">
              <PixelSprite name="invader" scale={5} color="var(--magenta)" />
              <h2 className="font-pixel mt-5 text-[18px] text-magenta glow-magenta">GAME OVER</h2>
              <p className="mt-3 text-sm leading-relaxed text-text-2">
                You reached the end of the feed. Continue? Turn your own idea into the next playable
                world.
              </p>
              <Btn
                variant="magenta"
                size="lg"
                className="mt-5 w-full"
                onClick={() => navigate({ to: "/create" })}
              >
                Create your game
              </Btn>
              <Btn
                variant="ghost"
                className="mt-2.5 w-full"
                onClick={() => setEndOfFeedOpen(false)}
              >
                Keep playing this game
              </Btn>
            </div>
          </section>
        </div>
      )}

      <CommentsPanel
        open={social.commentsOpen}
        onClose={() => social.setCommentsOpen(false)}
        comments={social.comments}
        loading={social.commentsLoading}
        onAdd={social.handleAddComment}
        onDelete={social.handleDeleteComment}
        onLoadMore={social.loadMoreComments}
        hasMore={social.hasMoreComments}
        count={social.commentCount}
      />

      {leaderboardOpen && (
        <>
          <div
            className="fixed inset-0 z-[65] bg-ink-0/80 animate-in fade-in lg:hidden"
            onClick={() => setLeaderboardOpen(false)}
          />
          <div className="leaderboard-panel fixed inset-x-0 bottom-0 z-[70] flex max-h-[88vh] w-full flex-col border-t-2 border-amber-2 bg-ink-1 p-5 pb-8 animate-in slide-in-from-bottom lg:bottom-0 lg:left-auto lg:right-0 lg:top-0 lg:max-h-screen lg:w-[min(420px,calc(100vw-92px))] lg:border-l-2 lg:border-t-0 lg:pb-6 lg:slide-in-from-right">
            <LeaderboardPanel
              template={template}
              entries={leaderboard.entries}
              loading={leaderboard.loading}
              onClose={() => setLeaderboardOpen(false)}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Action buttons
// ═══════════════════════════════════════════════════════════════════════════

function ActionButton({
  icon,
  label,
  caption,
  onClick,
  active,
  tone = "dim",
  compact = false,
  disabled = false,
  title,
}: {
  icon: ReactNode;
  label: string;
  caption?: string;
  onClick?: () => void;
  active?: boolean;
  tone?: Tone;
  compact?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? caption ?? label}
      aria-label={caption ? `${caption} (${label})` : label}
      aria-pressed={active}
      className="group flex min-w-10 touch-manipulation flex-col items-center gap-1 disabled:cursor-not-allowed disabled:opacity-35"
    >
      <span
        className={cn(
          "grid place-items-center border-2 transition-colors",
          compact
            ? "size-8 border-transparent"
            : "size-11 border-line-2 bg-ink-2 group-hover:border-current",
          active
            ? TONE_TEXT[tone === "dim" ? "phos" : tone]
            : compact
              ? "text-text"
              : TONE_TEXT[tone],
          active && !compact && "border-current bg-ink-3",
        )}
        style={
          active && !compact
            ? { boxShadow: `0 0 12px ${TONE_VAR[tone === "dim" ? "phos" : tone]}` }
            : undefined
        }
      >
        {icon}
      </span>
      <span className="max-w-full truncate font-mono text-[9px] font-extrabold uppercase leading-none text-text-2 lg:text-[10px]">
        {label}
      </span>
    </button>
  );
}

function LikeButton({
  liked,
  count,
  onToggle,
  animating,
  compact = false,
}: {
  liked: boolean;
  count: number;
  onToggle: () => void;
  animating: boolean;
  compact?: boolean;
}) {
  return (
    <ActionButton
      icon={
        <PixelIcon
          name="heart"
          size={16}
          className={animating ? "scale-125 transition-transform" : "transition-transform"}
        />
      }
      label={count > 0 ? formatCount(count) : "Like"}
      caption="Like"
      onClick={onToggle}
      active={liked}
      tone="magenta"
      compact={compact}
    />
  );
}

function FavoriteButton({
  favorited,
  count,
  onToggle,
  animating,
  compact = false,
}: {
  favorited: boolean;
  count: number;
  onToggle: () => void;
  animating: boolean;
  compact?: boolean;
}) {
  return (
    <ActionButton
      icon={
        <PixelIcon
          name="bookmark"
          size={15}
          className={animating ? "scale-125 transition-transform" : "transition-transform"}
        />
      }
      label={count > 0 ? formatCount(count) : "Save"}
      caption="Favorite"
      onClick={onToggle}
      active={favorited}
      tone="amber"
      compact={compact}
    />
  );
}

const SHARE_PLATFORMS: { label: string; platform: SharePlatform; mark: string; tone: Tone }[] = [
  { label: "Copy link", platform: "link", mark: "⧉", tone: "phos" },
  { label: "X", platform: "twitter", mark: "𝕏", tone: "dim" },
  { label: "WhatsApp", platform: "whatsapp", mark: "WA", tone: "phos" },
  { label: "Discord", platform: "discord", mark: "DC", tone: "violet" },
  { label: "Email", platform: "email", mark: "@", tone: "amber" },
];

function ShareButton({
  count,
  open,
  onToggle,
  onShare,
  template,
  game,
  gameId,
  disabled = false,
  compact = false,
}: {
  count: number;
  open: boolean;
  onToggle: () => void;
  onShare: (platform?: SharePlatform) => Promise<void>;
  template: any;
  game?: any;
  gameId?: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  // Link to THIS game (its real id).
  const url = buildPlayUrl(gameId ?? template?.id ?? "");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setToastMessage("Link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
      setTimeout(() => setToastMessage(""), 3000);
      await onShare("link");
    } catch (err) {
      console.error("Failed to copy link", err);
    }
  };

  const handlePlatformClick = async (platform: SharePlatform) => {
    if (platform === "link") {
      await handleCopy();
      return;
    }
    await onShare(platform);
    if (platform === "discord") {
      setToastMessage("Link copied! Paste it in Discord.");
      setTimeout(() => setToastMessage(""), 3000);
    } else {
      onToggle(); // other platforms redirect away
    }
  };

  const shareDialog =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-ink-0/90 p-4 animate-in fade-in duration-150"
            onClick={onToggle}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Share this game"
              className="px-panel relative w-full max-w-md animate-in zoom-in-95 duration-150"
              data-tone="phos"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="px-titlebar">
                <span className="flex-1">share --game</span>
                <button
                  type="button"
                  onClick={onToggle}
                  aria-label="Close"
                  className="hover:text-danger"
                >
                  <PixelIcon name="close" size={10} />
                </button>
              </header>
              <div className="p-5">
                <div className="mb-5 flex items-center gap-3 border-2 border-line bg-ink-1 p-2.5">
                  <div className="relative size-14 shrink-0 overflow-hidden border-2 border-line-2">
                    <GameCoverArtwork
                      game={{
                        id: gameId ?? template?.id,
                        templateId: game?.templateId ?? template?.id,
                        familyTemplateId: game?.familyTemplateId,
                        thumbnailUrl: game?.thumbnailUrl,
                        emoji: game?.emoji,
                        gradient: game?.gradient,
                      }}
                      lookupId={String(gameId ?? template?.id ?? "")}
                      emojiClass="text-3xl"
                      className="size-full"
                      imageClassName="size-full object-cover"
                      fallbackClassName="grid size-full place-items-center"
                      alt={game?.title ?? template?.name}
                    />
                  </div>
                  <div className="min-w-0">
                    <h4 className="truncate font-mono text-sm font-extrabold text-text">
                      {game?.title ?? template?.name}
                    </h4>
                    <p className="mt-0.5 truncate font-mono text-[10px] font-bold uppercase text-text-3">
                      {game?.category ?? template?.category} · HTML5 game
                    </p>
                  </div>
                </div>

                <div className="mb-5 grid grid-cols-3 gap-2">
                  {SHARE_PLATFORMS.map((platform) => (
                    <button
                      key={platform.platform}
                      type="button"
                      onClick={() => void handlePlatformClick(platform.platform)}
                      className="group flex flex-col items-center gap-1.5 border-2 border-line bg-ink-1 py-3 transition-colors hover:border-phos"
                    >
                      <span
                        className={cn(
                          "font-term text-[26px] leading-none",
                          TONE_TEXT[platform.tone],
                        )}
                      >
                        {platform.mark}
                      </span>
                      <span className="font-mono text-[10px] font-bold text-text-2 group-hover:text-text">
                        {platform.label}
                      </span>
                    </button>
                  ))}
                </div>

                <label className="label-term mb-2 block text-text-3">Direct link</label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={url}
                    className="px-input min-w-0 flex-1 py-2 text-xs"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Btn variant="primary" onClick={() => void handleCopy()}>
                    {copied ? "Copied!" : "Copy"}
                  </Btn>
                </div>

                {toastMessage && (
                  <p
                    role="status"
                    className="mt-3 text-center font-mono text-xs font-bold text-phos"
                  >
                    [OK] {toastMessage}
                  </p>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative">
      <ActionButton
        icon={<PixelIcon name="send" size={15} />}
        label={count > 0 ? formatCount(count) : "Share"}
        caption="Share"
        onClick={() => !disabled && onToggle()}
        active={open}
        tone="cyan"
        compact={compact}
        disabled={disabled}
        title={disabled ? "Publish this game before sharing it" : "Share game"}
      />
      {shareDialog}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Comments (slide-up chat)
// ═══════════════════════════════════════════════════════════════════════════

function CommentsPanel({
  open,
  onClose,
  comments,
  loading,
  onAdd,
  onDelete,
  onLoadMore,
  hasMore,
  count,
}: {
  open: boolean;
  onClose: () => void;
  comments: { _id: string; userId: string; username: string; text: string; createdAt: string }[];
  loading: boolean;
  onAdd: (text: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  onLoadMore: () => Promise<void>;
  hasMore: boolean;
  count: number;
}) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentUserId = useRef(getCurrentUserId()).current;

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await onAdd(trimmed);
      setText("");
      inputRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  }, [text, submitting, onAdd]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[55] bg-ink-0/70 animate-in fade-in" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Comments"
        className="comments-panel fixed inset-x-0 bottom-0 z-[60] flex max-h-[72vh] flex-col border-t-2 border-cyan-2 bg-ink-1 animate-in slide-in-from-bottom lg:inset-x-auto lg:left-1/2 lg:w-full lg:max-w-[560px] lg:-translate-x-1/2 lg:border-x-2"
      >
        <div className="flex shrink-0 items-center justify-between border-b-2 border-line px-4 py-3">
          <h2 className="font-mono text-[13px] font-extrabold text-cyan">
            #game-chat <span className="text-text-3">({formatCount(count)})</span>
          </h2>
          <Btn variant="ghost" size="icon" onClick={onClose} aria-label="Close comments">
            <PixelIcon name="close" size={11} />
          </Btn>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 font-mono text-[13px]">
          {loading && comments.length === 0 ? (
            <div className="grid place-items-center py-12">
              <TermLoader label="Loading chat" />
            </div>
          ) : comments.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-text-2">No comments yet.</p>
              <p className="mt-1 text-xs text-text-3">Be the first to share your thoughts!</p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {comments.map((c) => (
                <li key={c._id} className="group flex gap-2">
                  <span className="shrink-0 text-text-3">
                    [
                    {new Date(c.createdAt).toLocaleDateString(undefined, {
                      month: "2-digit",
                      day: "2-digit",
                    })}
                    ]
                  </span>
                  <span className="min-w-0 flex-1 break-words">
                    <span
                      className={cn(
                        "font-bold",
                        c.userId === currentUserId ? "text-phos" : "text-cyan",
                      )}
                    >
                      &lt;{c.username}&gt;
                    </span>{" "}
                    <span className="text-text">{c.text}</span>
                  </span>
                  {c.userId === currentUserId && (
                    <button
                      type="button"
                      onClick={() => onDelete(c._id)}
                      aria-label="Delete comment"
                      className="shrink-0 text-text-3 opacity-100 transition hover:text-danger sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {hasMore && comments.length > 0 && (
            <Btn
              variant="ghost"
              size="sm"
              onClick={() => void onLoadMore()}
              disabled={loading}
              className="mx-auto mt-4 flex"
            >
              {loading ? <Spinner /> : null} Load more
            </Btn>
          )}
        </div>

        <div className="shrink-0 border-t-2 border-line px-3 pb-6 pt-3 sm:pb-3">
          <div className="flex items-center gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 border-2 border-line-2 bg-ink-0 px-3 focus-within:border-cyan">
              <span className="font-mono font-bold text-cyan">&gt;</span>
              <input
                ref={inputRef}
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSubmit();
                  }
                }}
                placeholder="say something…"
                maxLength={2000}
                aria-label="Add a comment"
                className="h-10 min-w-0 flex-1 bg-transparent font-mono text-sm text-text outline-none placeholder:text-text-3"
              />
            </label>
            <Btn
              variant="cyan"
              onClick={() => void handleSubmit()}
              disabled={!text.trim() || submitting}
              aria-label="Send comment"
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <PixelIcon name="send" size={13} />
              )}
            </Btn>
          </div>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Details sheet
// ═══════════════════════════════════════════════════════════════════════════

function DetailsModal({
  open,
  onClose,
  template,
  profile,
  social,
  pkg,
  plays,
  generatedPackageMatches,
  isFollowing,
  setIsFollowing,
}: any) {
  const navigate = useNavigate();
  if (!open) return null;

  const title = generatedPackageMatches ? pkg?.title : template?.name;
  const description = generatedPackageMatches ? pkg?.gameplay?.mechanic : template?.mechanic;
  const detailsCoverGame: CoverArtworkGame = {
    id: pkg?.id ?? template?.id,
    templateId: pkg?.templateId ?? template?.id,
    familyTemplateId: pkg?.familyTemplateId,
    thumbnailUrl: pkg?.thumbnailUrl,
    emoji: templateEmoji[template?.id] ?? "🎮",
  };
  const remix = () => {
    const seed = [
      `Remix ${title}`,
      description || `${template?.category ?? "Arcade"} game`,
      "Keep the core mechanics, physics, controls, and pacing.",
      "Change the theme, characters, visual style, and one gameplay twist.",
    ].join(". ");
    sessionStorage.setItem("dogegame-remix-prompt", seed);
    onClose();
    navigate({ to: "/create" });
  };

  const actions: {
    label: string;
    icon: PixelIconName;
    tone: Tone;
    active?: boolean;
    onClick?: () => void;
    value: string;
  }[] = [
    {
      label: "Like",
      icon: "heart",
      tone: "magenta",
      active: social.liked,
      onClick: social.handleLike,
      value: formatCount(social.likeCount),
    },
    {
      label: "Chat",
      icon: "chat",
      tone: "cyan",
      onClick: () => {
        onClose();
        social.setCommentsOpen(true);
      },
      value: formatCount(social.commentCount),
    },
    {
      label: "Save",
      icon: "bookmark",
      tone: "amber",
      active: social.favorited,
      onClick: social.handleFavorite,
      value: "Favorite",
    },
    {
      label: "Share",
      icon: "send",
      tone: "cyan",
      onClick: () => {
        onClose();
        social.setShareMenuOpen(true);
      },
      value: "Share",
    },
  ];

  return (
    <>
      <div className="fixed inset-0 z-[65] bg-ink-0/80 animate-in fade-in" onClick={onClose} />
      <div
        role="dialog"
        aria-label={`${title} details`}
        className="fixed inset-x-0 bottom-0 z-[70] flex max-h-[90vh] flex-col border-t-2 border-phos-3 bg-ink-1 animate-in slide-in-from-bottom lg:inset-x-auto lg:left-1/2 lg:w-full lg:max-w-[560px] lg:-translate-x-1/2 lg:border-x-2"
      >
        <header
          className="px-titlebar"
          style={{ "--panel-line": "var(--phos-3)" } as React.CSSProperties}
        >
          <span className="flex-1">cartridge.info</span>
          <button type="button" onClick={onClose} aria-label="Close" className="hover:text-danger">
            <PixelIcon name="close" size={10} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="scanlines relative mb-5 aspect-video w-full overflow-hidden border-2 border-line bg-ink-0">
            <GameCoverArtwork
              game={detailsCoverGame}
              lookupId={String(template?.id ?? pkg?.id ?? "")}
              alt={title}
              emojiClass="text-6xl"
              className="size-full"
              imageClassName="size-full object-cover"
              fallbackClassName="grid size-full place-items-center"
            />
            <span className="absolute left-2 top-2 z-[3] flex items-center gap-1 border border-line-2 bg-ink-0/85 px-1.5 py-0.5 font-mono text-[10px] font-extrabold">
              <PixelIcon name="play" size={8} className="text-phos" /> {plays || "0"}
            </span>
          </div>

          <h2 className="font-pixel text-[14px] leading-snug text-text">{title}</h2>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center border-2 border-line-2 bg-ink-2 font-pixel text-[11px] text-phos">
                {profile.avatar}
              </span>
              <span className="font-mono text-sm font-bold text-text">@{profile.name}</span>
              <Btn
                variant={isFollowing ? "ghost" : "primary"}
                size="sm"
                onClick={() => setIsFollowing(!isFollowing)}
              >
                {isFollowing ? "✓" : "+"}
              </Btn>
            </div>
            <Btn variant="magenta" size="sm" onClick={remix}>
              <Shuffle className="size-3.5" /> Remix
            </Btn>
          </div>

          <p className="mt-4 border-l-2 border-phos-3 pl-3 text-sm leading-relaxed text-text-2">
            {description}
          </p>

          <div className="mt-6 grid grid-cols-5 gap-2">
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={action.onClick}
                className={cn(
                  "flex flex-col items-center gap-1.5 border-2 border-line bg-ink-2 py-3 transition-colors hover:border-current",
                  action.active ? TONE_TEXT[action.tone] : "text-text",
                )}
              >
                <PixelIcon name={action.icon} size={16} />
                <span className="font-mono text-[9px] font-bold text-text-2">{action.value}</span>
              </button>
            ))}
            <button
              type="button"
              className="flex flex-col items-center gap-1.5 border-2 border-line bg-ink-2 py-3 text-text transition-colors hover:border-current"
            >
              <MessageSquareWarning className="size-4" />
              <span className="font-mono text-[9px] font-bold text-text-2">Feedback</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
