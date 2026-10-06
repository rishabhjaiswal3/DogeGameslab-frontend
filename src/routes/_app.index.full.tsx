import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { fetchGamesPage } from "@/lib/api/games";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { VIEWS_TOP_LIMIT } from "@/lib/pagination";
import type { Game } from "@/lib/games-data";
import { fetchCreatorScoreLeaderboard, type CreatorScoreEntry } from "@/lib/api/leaderboards";
import { useStudioContext } from "@/context/StudioContext";
import { api } from "@/lib/api";
import {
  fetchCreatorStats,
  fetchRecentActivities,
  type CreatorStats,
  type UserActivity,
} from "@/lib/api/social";
import { HomeHero } from "@/components/studio/MobileHomeHero";
import { useCreateChatFlow } from "@/hooks/useCreateChatFlow";
import { GamePosterCard } from "@/components/studio/GamePosterCard";
import { PixelIcon, type PixelIconName } from "@/components/term/PixelIcon";
import {
  Block,
  Btn,
  EmptyState,
  Panel,
  SectionHead,
  Spinner,
  Stat,
  TONE_TEXT,
  formatCount,
  type Tone,
} from "@/components/term/Term";
import { getCurrentUserId } from "@/lib/identity";
import { prepareReelPlayEntry } from "@/lib/reelFeed";
import { cn } from "@/lib/utils";

// Full home page — loaded by _app.index.tsx.

const ACTIVITY_STYLE: Partial<Record<string, { icon: PixelIconName; tone: Tone; verb: string }>> = {
  like: { icon: "heart", tone: "magenta", verb: "LIKE" },
  favorite: { icon: "bookmark", tone: "amber", verb: "SAVE" },
  share: { icon: "send", tone: "cyan", verb: "SHARE" },
  comment: { icon: "chat", tone: "cyan", verb: "CHAT" },
  create: { icon: "plus", tone: "phos", verb: "NEW" },
  play: { icon: "play", tone: "phos", verb: "PLAY" },
  publish: { icon: "star", tone: "amber", verb: "SHIP" },
  major_edit: { icon: "code", tone: "violet", verb: "EDIT" },
  unpublish: { icon: "close", tone: "dim", verb: "HIDE" },
  reward_claim: { icon: "trophy", tone: "amber", verb: "WIN" },
};

function relativeTime(timestamp: string) {
  const ms = Date.now() - Date.parse(timestamp);
  if (!Number.isFinite(ms) || ms < 0) return "now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

const preferredCategories = ["Action", "Arcade", "Racing", "Puzzle", "Strategy"];
const categoryPriority = ["Action", "Arcade", "Racing", "Puzzle", "Strategy"];

/** The fixed categories browsed on phones, one horizontal row each. */
const browseCategories = [
  "Arcade",
  "Puzzle",
  "Sports",
  "Action",
  "Strategy",
  "Adventure",
  "RPG",
  "Multiplayer",
];

function shortAddress(value: string | undefined) {
  if (!value) return "";
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function homeCategory(category: string | undefined) {
  const value = String(category ?? "Game").trim();
  const lower = value.toLowerCase();
  if (lower.includes("strategy")) return "Strategy";
  if (lower.includes("board")) return "Board Games";
  if (lower.includes("puzzle")) return "Puzzle";
  if (lower.includes("racing")) return "Racing";
  if (lower.includes("arcade")) return "Arcade";
  if (lower.includes("action")) return "Action";
  return value || "Game";
}

function withHomeCategory(game: Game): Game {
  return { ...game, category: homeCategory(game.category) };
}

function uniqueGames(games: Game[]) {
  return games.filter(
    (game, index, collection) =>
      collection.findIndex((candidate) => candidate.templateId === game.templateId) === index,
  );
}

export function Home() {
  const navigate = useNavigate();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const { studio, createdGames } = useStudioContext();
  const createChat = useCreateChatFlow({
    onReady: (prompt) => {
      sessionStorage.setItem("dogegame-create-prompt", prompt);
      studio.setPrompt(prompt);
      navigate({ to: "/create" });
    },
    onPromptChange: (prompt) => studio.setPrompt(prompt),
  });
  const [creatorStats, setCreatorStats] = useState<CreatorStats | null>(null);
  const [recentEventsOpen, setRecentEventsOpen] = useState(false);
  const [activities, setActivities] = useState<UserActivity[]>([]);

  useEffect(() => {
    const userId = getCurrentUserId();
    fetchRecentActivities(50)
      .then((items) => setActivities(items))
      .catch(() => setActivities([]));
    if (!userId) {
      setCreatorStats(null);
      return;
    }
    fetchCreatorStats(userId)
      .then(setCreatorStats)
      .catch(() => setCreatorStats(null));
  }, []);

  // The user's own packages, newest first — fallback events when the
  // platform feed is empty.
  const myProjects = useMemo(
    () =>
      (createdGames as any[])
        .filter((g: any) => g?.title)
        .filter(
          (g: any, i: number, all: any[]) =>
            !g?.id || all.findIndex((x: any) => x?.id === g.id) === i,
        )
        .sort(
          (a: any, b: any) =>
            (Date.parse(b?.updatedAt ?? b?.createdAt ?? "") || 0) -
            (Date.parse(a?.updatedAt ?? a?.createdAt ?? "") || 0),
        )
        .slice(0, 4),
    [createdGames],
  );

  const fallbackActivities: UserActivity[] = useMemo(
    () =>
      myProjects.map((game: any, index: number) => ({
        _id: `local-${game.id ?? game.templateId ?? index}`,
        userId: game.creatorId ?? getCurrentUserId(),
        gameId: game.id ?? game.templateId ?? null,
        gameTitle: game.title ?? null,
        activityType: game.publish?.published ? "publish" : "create",
        details: game.publish?.published ? `Published ${game.title}` : `Created ${game.title}`,
        timestamp: game.updatedAt ?? game.createdAt ?? new Date().toISOString(),
      })),
    [myProjects],
  );

  const displayedActivities = activities.length > 0 ? activities : fallbackActivities;

  // Real view counts drive the Trending order: most viewed first.
  const [viewsMap, setViewsMap] = useState<Record<string, number>>({});
  const [communityGames, setCommunityGames] = useState<Game[]>([]);
  const [gamesOffset, setGamesOffset] = useState(0);
  const [hasMoreGames, setHasMoreGames] = useState(true);
  const [loadingMoreGames, setLoadingMoreGames] = useState(false);
  const [gamesLoading, setGamesLoading] = useState(true);

  const loadGamesPage = useCallback(async (offset: number, append: boolean) => {
    const { games, hasMore } = await fetchGamesPage(offset);
    setCommunityGames((current) => uniqueGames(append ? [...current, ...games] : games));
    setGamesOffset(offset + games.length);
    setHasMoreGames(hasMore);
  }, []);

  useEffect(() => {
    api
      .get("/social/views-top", { params: { limit: VIEWS_TOP_LIMIT } })
      .then((res) => {
        const map: Record<string, number> = {};
        for (const g of res.data?.games ?? []) map[g.gameId] = g.views;
        setViewsMap(map);
      })
      .catch(() => {});
    setGamesLoading(true);
    void loadGamesPage(0, false)
      .catch(() => {
        setCommunityGames([]);
        setHasMoreGames(false);
      })
      .finally(() => setGamesLoading(false));
  }, [loadGamesPage]);

  const loadMoreGames = useCallback(() => {
    if (!hasMoreGames || loadingMoreGames) return;
    setLoadingMoreGames(true);
    void loadGamesPage(gamesOffset, true)
      .catch(() => {})
      .finally(() => setLoadingMoreGames(false));
  }, [gamesOffset, hasMoreGames, loadGamesPage, loadingMoreGames]);

  const gamesLoadMoreRef = useInfiniteScroll(loadMoreGames, hasMoreGames);

  const realGames = useMemo(
    () => uniqueGames(communityGames.map(withHomeCategory)),
    [communityGames],
  );

  const shelves = useMemo(() => {
    const realViews = (game: Game) => viewsMap[game.templateId ?? ""] ?? 0;
    const withRealPlays = (game: Game): Game => {
      const v = realViews(game);
      if (v <= 0) return game;
      return { ...game, plays: v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(v) };
    };
    const trending = [...realGames]
      .sort((first, second) => realViews(second) - realViews(first))
      .map(withRealPlays);
    const latest = uniqueGames(
      [...communityGames]
        .sort(
          (first, second) =>
            (Date.parse(second.createdAt ?? "") || 0) - (Date.parse(first.createdAt ?? "") || 0),
        )
        .map(withHomeCategory),
    ).map(withRealPlays);
    const playersChoice = uniqueGames([
      ...preferredCategories.flatMap((category) =>
        trending.filter((game) => game.category === category),
      ),
      ...trending,
    ]);
    const favorites = uniqueGames([...trending])
      .sort((first, second) => (second.likes ?? 0) - (first.likes ?? 0))
      .slice(0, 14);

    const categories = Array.from(new Set(realGames.map((game) => game.category))).sort(
      (first, second) => {
        const firstPriority = categoryPriority.indexOf(first);
        const secondPriority = categoryPriority.indexOf(second);
        if (firstPriority !== -1 || secondPriority !== -1) {
          if (firstPriority === -1) return 1;
          if (secondPriority === -1) return -1;
          return firstPriority - secondPriority;
        }
        return first.localeCompare(second);
      },
    );

    return [
      {
        title: "Trending",
        icon: "bolt" as PixelIconName,
        tone: "magenta" as Tone,
        games: trending,
      },
      { title: "Latest", icon: "star" as PixelIconName, tone: "cyan" as Tone, games: latest },
      {
        title: "Players' Choice",
        icon: "trophy" as PixelIconName,
        tone: "amber" as Tone,
        games: playersChoice,
      },
      {
        title: "Favourite Games",
        icon: "heart" as PixelIconName,
        tone: "magenta" as Tone,
        games: favorites,
      },
      ...categories.map((category) => ({
        title: category,
        icon: "templates" as PixelIconName,
        tone: "phos" as Tone,
        games: realGames.filter((game) => game.category === category),
      })),
    ].filter((shelf) => shelf.games.length > 0);
  }, [communityGames, realGames, viewsMap]);

  const homeRowCategories = useMemo(
    () =>
      Array.from(
        new Set([...browseCategories, ...realGames.map((game) => game.category).filter(Boolean)]),
      ),
    [realGames],
  );

  const [topCreators, setTopCreators] = useState<CreatorScoreEntry[]>([]);
  useEffect(() => {
    fetchCreatorScoreLeaderboard(10)
      .then((board) => setTopCreators(board.entries))
      .catch(() => setTopCreators([]));
  }, []);

  const openGame = useCallback(
    (game: Game, listIds?: string[]) => {
      if (!game.templateId) return;
      prepareReelPlayEntry(game.templateId, listIds ?? [game.templateId]);
      navigate({ to: "/play", search: { gameId: game.templateId } });
    },
    [navigate],
  );

  const tickerItems = useMemo(
    () =>
      shelves
        .find((shelf) => shelf.title === "Latest")
        ?.games.slice(0, 10)
        .map((game) => ({ title: game.title, creator: game.creator, category: game.category })) ??
      [],
    [shelves],
  );

  return (
    <div className="relative">
      <HomeHero
        value={createChat.chatInput}
        onChange={createChat.setChatInput}
        onSubmit={createChat.submitComposerPrompt}
        onCategoryPick={createChat.sendChat}
        messages={createChat.messages}
        chatStage={createChat.chatStage}
        onQuickReply={createChat.sendChat}
        isThinking={createChat.isThinking}
      />

      {tickerItems.length > 0 && <Ticker items={tickerItems} />}

      {/* Only the layout for the current viewport is mounted, so the hidden one neither
          renders nor fetches. `isDesktop` matches Tailwind's `lg` breakpoint. */}
      {/* Phones & tablets: one horizontal row per category, then creators. */}
      {!isDesktop && (
        <div className="mt-8 space-y-7 px-4 sm:px-6 lg:hidden">
          {homeRowCategories.map((category) => (
            <CategoryGameRow key={category} category={category} onOpen={openGame} />
          ))}
          {topCreators.length > 0 && (
            <TopCreators
              creators={topCreators}
              onViewAll={() => navigate({ to: "/leaderboard" })}
            />
          )}
        </div>
      )}

      {/* Desktop: every shelf in the main column; stats/events stay pinned beside it. */}
      {isDesktop && (
        <div className="mt-8 hidden gap-6 px-8 lg:grid xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-8">
            {gamesLoading ? (
              <ShelfSkeleton />
            ) : shelves.length === 0 ? (
              <EmptyState
                title="NO CARTRIDGES"
                text="No games found. Check back soon or create the first one!"
              />
            ) : (
              shelves.map((shelf) => (
                <GameShelf
                  key={shelf.title}
                  {...shelf}
                  onOpen={openGame}
                  onLoadMore={loadMoreGames}
                  hasMore={hasMoreGames}
                  loadingMore={loadingMoreGames}
                />
              ))
            )}
            {(hasMoreGames || loadingMoreGames) && communityGames.length > 0 && (
              <div
                ref={gamesLoadMoreRef}
                className="py-6 text-center font-mono text-xs text-text-3"
              >
                {loadingMoreGames && (
                  <>
                    <Spinner /> loading more cartridges…
                  </>
                )}
              </div>
            )}
          </div>

          <aside className="no-scrollbar hidden space-y-5 self-start xl:sticky xl:top-[68px] xl:block xl:max-h-[calc(100dvh-84px)] xl:overflow-y-auto">
            <Panel title="creator_stats" tone="phos">
              <div className="grid grid-cols-2 gap-2">
                <Stat
                  label="Games"
                  value={formatCount(creatorStats?.games ?? createdGames.length)}
                  tone="phos"
                />
                <Stat label="Plays" value={formatCount(creatorStats?.plays)} tone="cyan" />
                <Stat
                  label="Creator score"
                  value={formatCount(creatorStats?.creatorScore)}
                  tone="amber"
                />
                <Stat
                  label="Doge Points"
                  value={formatCount(creatorStats?.lifetimePoints)}
                  tone="magenta"
                />
              </div>
              <div className="mt-2 flex items-center justify-between border-2 border-line bg-ink-1 px-3 py-2.5">
                <span className="label-term text-text-3">Followers</span>
                <span className="font-term text-[28px] leading-none text-text">
                  {formatCount(creatorStats?.followers)}
                </span>
              </div>
            </Panel>

            <Panel
              title="event_log"
              tone="cyan"
              actions={
                <button
                  type="button"
                  onClick={() => setRecentEventsOpen(true)}
                  className="font-mono text-[10px] font-extrabold uppercase tracking-[0.12em] text-cyan hover:underline"
                >
                  tail -f ›
                </button>
              }
              bodyClassName="p-0"
            >
              {displayedActivities.length === 0 ? (
                <p className="p-4 text-xs text-text-3">
                  No platform events yet — created and published games will show up here.
                </p>
              ) : (
                <ul className="divide-y-2 divide-line">
                  {displayedActivities.slice(0, 6).map((item) => (
                    <ActivityEventRow key={item._id} item={item} />
                  ))}
                </ul>
              )}
            </Panel>

            {topCreators.length > 0 && (
              <TopCreators
                creators={topCreators}
                onViewAll={() => navigate({ to: "/leaderboard" })}
              />
            )}
          </aside>
        </div>
      )}

      <Dialog open={recentEventsOpen} onOpenChange={setRecentEventsOpen}>
        <DialogContent className="max-h-[82vh] overflow-hidden p-0 sm:max-w-xl">
          <DialogTitle className="px-titlebar font-mono text-[10px] text-text">
            tail -f /var/log/dogegame/events
          </DialogTitle>
          <DialogDescription className="sr-only">Recent platform activity.</DialogDescription>
          <div className="max-h-[70vh] overflow-y-auto">
            {displayedActivities.length === 0 ? (
              <p className="p-4 text-sm text-text-3">No platform events yet.</p>
            ) : (
              <ul className="divide-y-2 divide-line">
                {displayedActivities.map((item) => (
                  <ActivityEventRow key={item._id} item={item} />
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Ticker({ items }: { items: { title: string; creator: string; category: string }[] }) {
  const line = items.map((item) => (
    <span key={`${item.title}-${item.creator}`} className="inline-flex items-center gap-2 px-5">
      <span className="text-magenta">◆</span>
      <span className="text-text">{item.title}</span>
      <span className="text-text-3">by @{shortAddress(item.creator)}</span>
      <span className="text-amber">[{item.category}]</span>
    </span>
  ));
  return (
    <div
      className="mt-8 flex items-stretch border-y-2 border-line bg-ink-0"
      aria-label="Newest games"
    >
      <span className="flex shrink-0 items-center gap-2 bg-magenta px-3 font-mono text-[10px] font-extrabold uppercase tracking-[0.14em] text-white">
        <span className="animate-blink">●</span> New
      </span>
      <div className="relative min-w-0 flex-1 overflow-hidden py-2">
        <div className="animate-marquee flex w-max whitespace-nowrap font-mono text-[12px]">
          {line}
          <span aria-hidden="true" className="inline-flex">
            {line}
          </span>
        </div>
      </div>
    </div>
  );
}

function ActivityEventRow({ item }: { item: UserActivity }) {
  const navigate = useNavigate();
  const style = ACTIVITY_STYLE[item.activityType] ?? {
    icon: "play" as PixelIconName,
    tone: "cyan" as Tone,
    verb: "EVT",
  };
  const actor =
    item.userId?.startsWith("0x") && item.userId.length > 10
      ? `${item.userId.slice(0, 6)}...${item.userId.slice(-4)}`
      : item.userId;
  const detail =
    item.details || [actor, item.activityType, item.gameTitle].filter(Boolean).join(" ");
  const content = (
    <>
      <span
        className={cn("w-11 shrink-0 font-mono text-[10px] font-extrabold", TONE_TEXT[style.tone])}
      >
        {style.verb}
      </span>
      <PixelIcon name={style.icon} size={11} className={TONE_TEXT[style.tone]} />
      <p className="min-w-0 flex-1 truncate font-mono text-[12px] text-text-2" title={detail}>
        {detail}
      </p>
      <span className="shrink-0 font-mono text-[10px] text-text-3">
        {relativeTime(item.timestamp)}
      </span>
    </>
  );

  if (item.gameId) {
    return (
      <li>
        <button
          type="button"
          onClick={() => navigate({ to: "/play", search: { gameId: item.gameId! } })}
          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-ink-3"
          aria-label={`Open ${item.gameTitle ?? "game"}`}
        >
          {content}
        </button>
      </li>
    );
  }
  return <li className="flex items-center gap-2.5 px-3 py-2.5">{content}</li>;
}

function GameShelf({
  title,
  icon,
  tone,
  games,
  onOpen,
  onLoadMore,
  hasMore,
  loadingMore,
}: {
  title: string;
  icon: PixelIconName;
  tone: Tone;
  games: Game[];
  onOpen: (game: Game, ids?: string[]) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const modalLoadMoreRef = useInfiniteScroll(
    () => onLoadMore?.(),
    Boolean(showAll && hasMore && onLoadMore),
  );
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "start",
    dragFree: true,
    loop: false,
    containScroll: "trimSnaps",
    skipSnaps: true,
  });
  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    const viewport = emblaApi.rootNode();
    const handleWheel = (event: WheelEvent) => {
      // Only hijack clearly horizontal wheel gestures — vertical wheel scrolls the page.
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) || Math.abs(event.deltaX) < 2) return;
      viewport.scrollLeft += event.deltaX;
      event.preventDefault();
    };
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [emblaApi]);

  const shelfIds = useMemo(
    () => games.map((game) => game.templateId).filter(Boolean) as string[],
    [games],
  );

  return (
    <section>
      <SectionHead
        tone={tone}
        title={
          <span className="inline-flex items-center gap-2">
            <PixelIcon name={icon} size={12} />
            {title}
            <span className="font-mono text-[10px] text-text-3">({games.length})</span>
          </span>
        }
        action={
          <div className="flex items-center gap-2">
            <Btn
              variant="ghost"
              size="icon"
              onClick={scrollPrev}
              aria-label={`Scroll ${title} left`}
            >
              <PixelIcon name="back" size={11} />
            </Btn>
            <Btn
              variant="ghost"
              size="icon"
              onClick={scrollNext}
              aria-label={`Scroll ${title} right`}
            >
              <PixelIcon name="next" size={11} />
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => setShowAll(true)}>
              View all
            </Btn>
          </div>
        }
      />
      <div
        ref={emblaRef}
        className="cursor-grab select-none overflow-hidden active:cursor-grabbing"
      >
        <div className="flex touch-pan-y items-stretch gap-3">
          {games.map((game, index) => (
            <div
              key={`${game.templateId ?? game.title}-${index}`}
              className="flex min-w-0 shrink-0 grow-0 basis-[calc(33.333%-8px)] 2xl:basis-[calc(25%-9px)]"
            >
              <GamePosterCard game={game} onClick={() => onOpen(game, shelfIds)} />
            </div>
          ))}
        </div>
      </div>

      <Dialog open={showAll} onOpenChange={setShowAll}>
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-6xl flex-col gap-0 p-0">
          <DialogTitle className="px-titlebar font-mono text-[10px] text-text">
            ls ~/games/{title.toLowerCase().replace(/[^a-z0-9]+/g, "-")} — {games.length} cartridges
          </DialogTitle>
          <DialogDescription className="sr-only">All games in {title}.</DialogDescription>
          <div className="overflow-y-auto p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {games.map((game, index) => (
                <GamePosterCard
                  key={`${game.templateId ?? game.title}-grid-${index}`}
                  game={game}
                  size="compact"
                  onClick={() => {
                    setShowAll(false);
                    onOpen(game, shelfIds);
                  }}
                />
              ))}
            </div>
            {(hasMore || loadingMore) && onLoadMore && (
              <div
                ref={modalLoadMoreRef}
                className="py-4 text-center font-mono text-xs text-text-3"
              >
                {loadingMore && (
                  <>
                    <Spinner /> loading more…
                  </>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ShelfSkeleton() {
  return (
    <div className="space-y-8">
      {Array.from({ length: 2 }).map((_, section) => (
        <div key={section}>
          <Block className="mb-3 h-5 w-48" />
          <div className="grid grid-cols-3 gap-3 2xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className={cn("border-2 border-line", index === 3 && "hidden 2xl:block")}
              >
                <Block className="aspect-[4/3] w-full" />
                <div className="space-y-2 p-2.5">
                  <Block className="h-3 w-3/4" />
                  <Block className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const HOME_CATEGORY_PAGE_SIZE = 6;

function CategoryGameRow({
  category,
  onOpen,
}: {
  category: string;
  onOpen: (game: Game, ids?: string[]) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadPage = useCallback(
    async (nextOffset: number, append: boolean) => {
      const page = await fetchGamesPage(nextOffset, HOME_CATEGORY_PAGE_SIZE, category);
      setGames((current) => uniqueGames(append ? [...current, ...page.games] : page.games));
      setOffset(nextOffset + page.games.length);
      setHasMore(page.hasMore && page.games.length > 0);
    },
    [category],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchGamesPage(0, HOME_CATEGORY_PAGE_SIZE, category)
      .then((page) => {
        if (cancelled) return;
        setGames(uniqueGames(page.games));
        setOffset(page.games.length);
        setHasMore(page.hasMore && page.games.length > 0);
      })
      .catch(() => {
        if (!cancelled) {
          setGames([]);
          setHasMore(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category]);

  const loadMore = useCallback(() => {
    if (!hasMore || loading || loadingMore) return;
    setLoadingMore(true);
    void loadPage(offset, true)
      .catch(() => setHasMore(false))
      .finally(() => setLoadingMore(false));
  }, [hasMore, loadPage, loading, loadingMore, offset]);

  const handleScroll = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const remaining = viewport.scrollWidth - viewport.scrollLeft - viewport.clientWidth;
    if (remaining < viewport.clientWidth * 0.7) loadMore();
  };

  const rowIds = useMemo(
    () => games.map((game) => game.templateId).filter(Boolean) as string[],
    [games],
  );

  if (!loading && games.length === 0) return null;

  return (
    <section>
      <SectionHead title={category} className="mb-2.5" />
      <div
        ref={viewportRef}
        onScroll={handleScroll}
        className="no-scrollbar -mx-4 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6"
      >
        <div className="flex items-stretch gap-3">
          {loading
            ? Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="w-[44%] shrink-0 border-2 border-line min-[520px]:w-[30%]"
                >
                  <Block className="aspect-[4/3] w-full" />
                  <Block className="m-2.5 h-3 w-3/4" />
                </div>
              ))
            : games.map((game, index) => (
                <div
                  key={`${game.templateId ?? game.title}-${index}`}
                  className="flex w-[44%] shrink-0 min-[520px]:w-[30%]"
                >
                  <GamePosterCard game={game} size="compact" onClick={() => onOpen(game, rowIds)} />
                </div>
              ))}
          {loadingMore && (
            <div className="grid w-16 shrink-0 place-items-center font-mono text-phos">
              <Spinner />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

const MEDAL: Record<number, Tone> = { 1: "amber", 2: "cyan", 3: "magenta" };

function TopCreators({
  creators,
  onViewAll,
}: {
  creators: CreatorScoreEntry[];
  onViewAll: () => void;
}) {
  return (
    <Panel
      title="top_creators"
      tone="amber"
      bodyClassName="p-0"
      actions={
        <button
          type="button"
          onClick={onViewAll}
          className="font-mono text-[10px] font-extrabold uppercase tracking-[0.12em] text-amber hover:underline"
        >
          ranks ›
        </button>
      }
    >
      <ol className="divide-y-2 divide-line">
        {creators.slice(0, 5).map((entry) => {
          const tone = MEDAL[entry.rank] ?? "dim";
          const label = shortAddress(entry.name) || shortAddress(entry.creatorId);
          return (
            <li key={entry.id ?? entry.creatorId}>
              <button
                type="button"
                onClick={onViewAll}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-ink-3"
              >
                <span className={cn("font-term w-8 text-[28px] leading-none", TONE_TEXT[tone])}>
                  {String(entry.rank).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-bold text-text">
                  {label}
                </span>
                <span className="font-term text-[22px] leading-none text-amber">
                  {formatCount(entry.creatorScore)}
                </span>
                <span className="font-mono text-[9px] font-bold text-text-3">CS</span>
              </button>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
