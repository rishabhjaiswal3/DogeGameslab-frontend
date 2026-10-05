import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/studio/PageHeader";
import { GameCard } from "@/components/studio/GameCard";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { type Game } from "@/lib/games-data";
import {
  templateEmoji,
  gradientForId,
  getThumbnailUrl,
  resolveGameThumbnail,
} from "@/lib/studio-meta";
import {
  fetchAchievements,
  claimDailyChallenge,
  fetchCreatorStats,
  fetchDailyChallenges,
  fetchFollowing,
  fetchNotifications,
  fetchPointSummary,
  fetchProfileName,
  markNotificationsRead,
  updateProfileName,
  type AchievementSummary,
  type CreatorStats,
  type DailyChallenge,
  type NotificationItem,
  type PointSummary,
} from "@/lib/api/social";
import {
  getCurrentUserId,
  getCurrentUsername,
  getWalletAddress,
  setCurrentUsername,
} from "@/lib/identity";
import { api } from "@/lib/api";
import { useGameTemplates } from "@/hooks/useGameTemplates";
import { ActivityListSkeleton, ProfileSkeleton } from "@/components/studio/PageSkeletons";
import { useStudioContext } from "@/context/StudioContext";
import { StudioSignInGate } from "@/components/studio/StudioSignInButton";
import { useStudioAuth } from "@/hooks/useStudioAuth";
import { Check, Copy, Loader2, Pencil, X } from "lucide-react";
import { useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import {
  fetchUserActivities,
  fetchUserFavorites,
  fetchUserLikes,
  type UserActivity,
} from "@/lib/api/social";
import { fetchReferralSummary, type ReferralSummary } from "@/lib/api/referral";
import { PixelIcon, type PixelIconName } from "@/components/term/PixelIcon";
import { PixelSprite } from "@/components/term/PixelSprite";
import { DogeIcon } from "@/components/dogeos/DogeBrand";
import {
  Btn,
  EmptyState,
  Meter,
  Notice,
  Panel,
  SectionHead,
  TONE_TEXT,
  Tag,
  type Tone,
} from "@/components/term/Term";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/profile")({
  pendingComponent: ProfileSkeleton,
  head: () => ({
    meta: [
      { title: "Profile — Creator Studio" },
      { name: "description", content: "Your creator profile, stats, and published games." },
    ],
  }),
  component: Profile,
});

const ACTIVITY_STYLE: Record<string, { icon: PixelIconName; tone: Tone; verb: string }> = {
  like: { icon: "heart", tone: "magenta", verb: "LIKE" },
  favorite: { icon: "bookmark", tone: "amber", verb: "SAVE" },
  share: { icon: "send", tone: "cyan", verb: "SHARE" },
  comment: { icon: "chat", tone: "cyan", verb: "CHAT" },
  create: { icon: "plus", tone: "phos", verb: "NEW" },
  play: { icon: "play", tone: "phos", verb: "PLAY" },
  publish: { icon: "star", tone: "amber", verb: "SHIP" },
  major_edit: { icon: "code", tone: "violet", verb: "EDIT" },
};

const achievementIconForTitle = (title: string): PixelIconName => {
  const normalized = title.toLowerCase();
  if (normalized.includes("publish")) return "send";
  if (normalized.includes("spark") || normalized.includes("like")) return "heart";
  if (normalized.includes("play")) return "play";
  if (normalized.includes("rising") || normalized.includes("creator score")) return "chart";
  if (normalized.includes("kp")) return "bolt";
  if (normalized.includes("genesis") || normalized.includes("founder")) return "crown";
  return "star";
};

const achievementLockedLabel = (title: string) => {
  const normalized = title.toLowerCase();
  if (normalized.includes("play")) return "0 / 100";
  if (normalized.includes("rising") || normalized.includes("creator score")) return "0 / 500";
  if (normalized.includes("genesis") || normalized.includes("founder")) return "Not earned";
  return "Locked";
};

function formatTimeAgo(dateStr: string) {
  const date = new Date(dateStr);
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface GameRowProps {
  title: string;
  games: Game[];
  emptyMessage: ReactNode;
  /** Adds an edit button to each card — used by My Games only. */
  onEditGame?: (game: Game) => void;
}

function GameRow({ title, games, emptyMessage, onEditGame }: GameRowProps) {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);

  if (games.length === 0) {
    return (
      <EmptyState
        className="mt-4"
        sprite="invader"
        title="NO SAVE DATA"
        text={emptyMessage}
        action={
          title === "My Games" ? (
            <Btn variant="primary" onClick={() => navigate({ to: "/create" })}>
              <PixelIcon name="plus" size={11} /> Create game
            </Btn>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="mt-4">
      <h2 className="sr-only">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {games.slice(0, showAll ? undefined : 8).map((game, index) => (
          <GameCard
            key={`${game.title}-${index}`}
            game={game}
            index={index}
            onEdit={onEditGame}
            compact
          />
        ))}
      </div>
      {games.length > 8 && (
        <Btn variant="ghost" className="mx-auto mt-5 flex" onClick={() => setShowAll(!showAll)}>
          {showAll ? "Show less" : `View all ${games.length}`}
        </Btn>
      )}
    </div>
  );
}

type TimeFilter = "today" | "week" | "month" | "all";

function Profile() {
  const navigate = useNavigate();
  const { ready: authReady, authenticated, user, openLogin, signOut } = useStudioAuth();
  const loginAttemptedRef = useRef(false);
  const { createdGames } = useStudioContext();
  const { gameTemplates } = useGameTemplates();
  const [activities, setActivities] = useState<UserActivity[]>([]);
  // Real info (title, cover, views) for any game referenced by likes,
  // favorites, or history — fetched from the backend, never guessed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [gameInfo, setGameInfo] = useState<Record<string, any>>({});
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [likedGames, setLikedGames] = useState<Game[]>([]);
  const [favoriteGames, setFavoriteGames] = useState<Game[]>([]);
  const [mobileGameTab, setMobileGameTab] = useState("My Games");
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [referral, setReferral] = useState<ReferralSummary | null>(null);
  const [referralCopied, setReferralCopied] = useState(false);
  const [dailyChallenges, setDailyChallenges] = useState<DailyChallenge[]>([]);
  const [achievementSummary, setAchievementSummary] = useState<AchievementSummary | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [openPanel, setOpenPanel] = useState<
    "challenges" | "achievements" | "notifications" | null
  >(null);
  const [followingCount, setFollowingCount] = useState(0);
  const [pointSummary, setPointSummary] = useState<PointSummary | null>(null);
  const [displayName, setDisplayName] = useState(() => getCurrentUsername());
  const [draftDisplayName, setDraftDisplayName] = useState(displayName);
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [savingDisplayName, setSavingDisplayName] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [identityCopied, setIdentityCopied] = useState(false);

  useEffect(() => {
    if (!authReady || authenticated || loginAttemptedRef.current) return;
    loginAttemptedRef.current = true;
    void openLogin();
  }, [authReady, authenticated, openLogin]);

  const getThumbnail = useCallback((id: string | undefined, fallbackUrl?: string) => {
    if (!id) return fallbackUrl;
    return getThumbnailUrl(id);
  }, []);

  const formatViews = (views: number | undefined): string => {
    if (!views) return "—";
    return views >= 1000 ? `${(views / 1000).toFixed(1)}K` : String(views);
  };

  const mapActivityToGame = useCallback(
    (gameId: string, gameTitle: string): Game => {
      // 1) the user's own creations
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const customGame = createdGames.find(
        (cg: any) => cg.id === gameId || cg.templateId === gameId,
      );
      if (customGame) {
        return {
          title: customGame.title,
          category: customGame.category ?? "Game",
          plays: formatViews(customGame.views),
          emoji: templateEmoji[customGame.templateId] ?? "🎮",
          gradient: gradientForId(customGame.templateId ?? customGame.id),
          creator: "you",
          thumbnailUrl: resolveGameThumbnail(customGame),
          templateId: customGame.id ?? customGame.templateId,
        };
      }

      // 2) other creators' games — real record fetched from the backend
      const remote = gameInfo[gameId];
      if (remote) {
        return {
          title: remote.title,
          category: remote.category ?? "Game",
          plays: formatViews(remote.views),
          emoji: templateEmoji[remote.templateId] ?? "🎮",
          gradient: gradientForId(remote.templateId ?? remote.id),
          creator: remote.creatorId?.startsWith("0x")
            ? `${remote.creatorId.slice(0, 6)}…${remote.creatorId.slice(-4)}`
            : "community",
          thumbnailUrl: resolveGameThumbnail(remote),
          templateId: remote.id,
        };
      }

      // 3) platform templates (gameId IS the template id)
      const template = gameTemplates.find((t: any) => t.id === gameId);
      if (template) {
        return {
          title: String(template.name ?? ""),
          category: String(template.category ?? "Game"),
          plays: "—",
          emoji: templateEmoji[gameId] ?? "🎮",
          gradient: gradientForId(gameId),
          creator: "studio",
          thumbnailUrl: getThumbnail(gameId),
          templateId: gameId,
        };
      }

      // 4) deleted/unknown game — show only what was truthfully recorded
      return {
        title: gameTitle || "Removed game",
        category: "Game",
        plays: "—",
        emoji: "🎮",
        gradient: gradientForId(gameId),
        creator: "—",
        thumbnailUrl: getThumbnail(gameId),
        templateId: gameId,
      };
    },
    [createdGames, gameInfo, gameTemplates, getThumbnail],
  );

  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  useEffect(() => {
    if (!authenticated || !user) return;
    const uid = getCurrentUserId();
    fetchProfileName(uid)
      .then((profile) => {
        if (!profile.username) return;
        const savedName = setCurrentUsername(profile.username);
        setDisplayName(savedName);
        setDraftDisplayName(savedName);
      })
      .catch(() => setProfileError("Your saved profile name could not be loaded."));

    Promise.allSettled([
      fetchUserActivities(uid).then((data) => setActivities(data ?? [])),
      fetchUserFavorites(uid).then((data) => {
        if (data && Array.isArray(data.favorites))
          setFavoriteIds(data.favorites.map((f) => f.gameId));
      }),
      fetchUserLikes(uid).then((data) => {
        if (data && Array.isArray(data.likes)) setLikedIds(data.likes.map((l) => l.gameId));
      }),
    ]).finally(() => setActivitiesLoading(false));
  }, [authenticated, user]);

  // Resolve REAL records for every game referenced by likes/favorites/history.
  useEffect(() => {
    if (!authenticated || !user) return;
    const referenced = new Set<string>([...likedIds, ...favoriteIds]);
    for (const act of activities) {
      if (act.gameId) referenced.add(act.gameId);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const known = new Set<string>([
      ...createdGames.map((g: any) => g?.id),
      ...gameTemplates.map((t: any) => t.id),
    ]);
    const missing = [...referenced].filter((id) => id && !known.has(id));
    if (missing.length === 0) return;
    api
      .get("/games/list", { params: { ids: missing.join(","), limit: 20 } })
      .then((res) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const map: Record<string, any> = {};
        for (const g of res.data?.games ?? []) map[g.id] = g;
        setGameInfo(map);
      })
      .catch(() => {});
  }, [authenticated, user, likedIds, favoriteIds, activities, createdGames, gameTemplates]);

  useEffect(() => {
    setLikedGames(likedIds.map((id) => mapActivityToGame(id, "")));
    setFavoriteGames(favoriteIds.map((id) => mapActivityToGame(id, "")));
  }, [likedIds, favoriteIds, mapActivityToGame]);

  const games: Game[] = createdGames
    .filter(
      (g: any, i: number, all: any[]) => !g?.id || all.findIndex((x: any) => x?.id === g.id) === i,
    )
    .map((g: any) => ({
      title: g.title,
      category: g.category ?? "Game",
      plays: g.views
        ? g.views >= 1000
          ? `${(g.views / 1000).toFixed(1)}K`
          : String(g.views)
        : "New",
      emoji: templateEmoji[g.templateId] ?? "🎮",
      gradient: gradientForId(g.templateId ?? g.id),
      creator: "you",
      thumbnailUrl: resolveGameThumbnail(g),
      templateId: g.id ?? g.templateId,
    }));

  // Extract history games (played or created) from activities
  const historyGamesMap = new Map<string, string>();
  activities.forEach((act) => {
    if (act.gameId && (act.activityType === "play" || act.activityType === "create")) {
      if (!historyGamesMap.has(act.gameId)) {
        historyGamesMap.set(act.gameId, act.gameTitle || "");
      }
    }
  });
  const historyGames: Game[] = Array.from(historyGamesMap.entries()).map(([gameId, title]) =>
    mapActivityToGame(gameId, title),
  );
  const profileGameSections = [
    {
      title: "My Games",
      games,
      emptyMessage: (
        <>
          No games yet. Head to <span className="text-primary font-bold">Create</span> to generate
          your first playable build.
        </>
      ),
      onEditGame: (g: Game) => {
        if (g.templateId) navigate({ to: "/edit/$gameId", params: { gameId: g.templateId } });
      },
    },
    {
      title: "History",
      games: historyGames,
      emptyMessage: "No games in history. Play or generate games to see them listed here.",
    },
    {
      title: "Favorites",
      games: favoriteGames,
      emptyMessage: "No favorite games yet. Click the bookmark icon on any game to favorite it.",
    },
    {
      title: "Liked Games",
      games: likedGames,
      emptyMessage: "No liked games yet. Click the heart icon on any game to like it.",
    },
  ];
  const selectedMobileGameSection =
    profileGameSections.find((section) => section.title === mobileGameTab) ??
    profileGameSections[0];

  const [creatorStats, setCreatorStats] = useState<CreatorStats | null>(null);
  useEffect(() => {
    if (!authenticated || !user) return;
    const userId = getCurrentUserId();
    fetchCreatorStats(userId)
      .then(setCreatorStats)
      .catch(() => {});
    fetchFollowing(userId)
      .then((data) => setFollowingCount(data.following?.length ?? 0))
      .catch(() => {});
    setProfileError(null);
    fetchPointSummary(userId)
      .then(setPointSummary)
      .catch(() => setProfileError("Some profile information could not be loaded."));
    fetchDailyChallenges(userId)
      .then((data) => setDailyChallenges(data.challenges))
      .catch(() => setProfileError("Daily challenges could not be loaded."));
    fetchAchievements(userId)
      .then(setAchievementSummary)
      .catch(() => setProfileError("Achievements could not be loaded."));
    fetchNotifications(userId)
      .then((data) => setNotifications(data.notifications))
      .catch(() => {});
    fetchReferralSummary()
      .then(setReferral)
      .catch(() => {});
  }, [authenticated, user]);

  useEffect(() => {
    if (!authenticated || !user) return;
    const completed = dailyChallenges.filter((challenge) => challenge.completed);
    if (!completed.length) return;
    const userId = getCurrentUserId();
    void Promise.allSettled(
      completed.map((challenge) => claimDailyChallenge(userId, challenge.id)),
    ).then(() =>
      Promise.allSettled([
        fetchPointSummary(userId).then(setPointSummary),
        fetchCreatorStats(userId).then(setCreatorStats),
        fetchAchievements(userId).then(setAchievementSummary),
      ]),
    );
  }, [authenticated, dailyChallenges, user]);

  const formatStat = (value: number | undefined) => {
    const n = value ?? 0;
    return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
  };
  const formatDogeGamePoints = (value: number | undefined) => {
    const n = value ?? 0;
    const compact = (divisor: number, suffix: string) => {
      const scaled = n / divisor;
      const fixed = scaled >= 10 ? scaled.toFixed(1) : scaled.toFixed(2);
      return `${fixed.replace(/\.0+$/, "").replace(/(\.\d)0$/, "$1")}${suffix}`;
    };
    if (n >= 1_000_000_000) return compact(1_000_000_000, "b");
    if (n >= 1_000_000) return compact(1_000_000, "m");
    if (n >= 1_000) return compact(1_000, "k");
    return String(n);
  };
  const userId = getCurrentUserId();
  const wallet = getWalletAddress();
  const identityLine = wallet ?? userId;
  const compactIdentity =
    identityLine.length > 14
      ? `${identityLine.slice(0, 6)}...${identityLine.slice(-4)}`
      : identityLine;
  // Joined date from the earliest real record we have (creation or activity).
  const timestamps: number[] = [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...createdGames.map((g: any) => new Date(g?.createdAt ?? NaN).getTime()),
    ...activities.map((a) => new Date(a.timestamp).getTime()),
  ].filter((t) => Number.isFinite(t));
  const joined =
    timestamps.length > 0
      ? new Date(Math.min(...timestamps)).toLocaleDateString(undefined, {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : null;

  const todayPoints = creatorStats?.currentDay
    ? (creatorStats.dailyScore?.[creatorStats.currentDay] ??
      creatorStats.dailyPoints?.[creatorStats.currentDay] ??
      0)
    : 0;
  const weekPoints = creatorStats?.currentWeek
    ? (creatorStats.weeklyScore?.[creatorStats.currentWeek] ??
      creatorStats.weeklyPoints?.[creatorStats.currentWeek] ??
      0)
    : 0;

  const saveDisplayName = async () => {
    const nextName = draftDisplayName.trim().slice(0, 32);
    if (!nextName || savingDisplayName) return;
    setSavingDisplayName(true);
    setProfileError(null);
    try {
      const result = await updateProfileName(getCurrentUserId(), nextName);
      const savedName = setCurrentUsername(result.username);
      setDisplayName(savedName);
      setDraftDisplayName(savedName);
      setEditingDisplayName(false);
    } catch {
      setProfileError("Your profile name was not saved. Please try again.");
    } finally {
      setSavingDisplayName(false);
    }
  };

  const cancelDisplayNameEdit = () => {
    setDraftDisplayName(displayName);
    setEditingDisplayName(false);
  };

  const copyIdentity = async () => {
    try {
      await navigator.clipboard.writeText(identityLine);
      setIdentityCopied(true);
      window.setTimeout(() => setIdentityCopied(false), 1200);
    } catch {
      setIdentityCopied(false);
    }
  };

  const openNotificationsPanel = () => {
    setOpenPanel("notifications");
    void markNotificationsRead(getCurrentUserId())
      .then(() => {
        setNotifications((current) =>
          current.map((notification) => ({ ...notification, read: true })),
        );
      })
      .catch(() => null);
  };

  const filteredActivities = activities.filter((activity) => {
    const actDate = new Date(activity.timestamp);
    const now = new Date();

    if (timeFilter === "today") {
      return actDate.toDateString() === now.toDateString();
    }

    const diffTime = now.getTime() - actDate.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);

    if (timeFilter === "week") {
      return diffDays <= 7;
    }
    if (timeFilter === "month") {
      return diffDays <= 30;
    }
    return true;
  });

  const completedChallenges = dailyChallenges.filter((challenge) => challenge.completed).length;
  const challengeProgress = dailyChallenges.length
    ? (completedChallenges / dailyChallenges.length) * 100
    : 0;
  const nextChallenge =
    dailyChallenges.find((challenge) => !challenge.completed) ?? dailyChallenges[0];
  const unlockedAchievements = achievementSummary?.inventory.badges.length ?? 0;
  const totalAchievements = achievementSummary?.achievements.length ?? 0;
  const achievementProgress = totalAchievements
    ? (unlockedAchievements / totalAchievements) * 100
    : 0;
  const featuredAchievements = (achievementSummary?.achievements ?? []).slice(0, 2);

  if (!authReady) return <ProfileSkeleton />;

  if (!authenticated || !user) {
    return (
      <div className="grid min-h-[calc(100dvh-10rem)] place-items-center px-4 py-10">
        <StudioSignInGate
          title="Sign in to view your profile"
          description="Your games, rewards, points, and activity are private."
          footer={
            <button
              type="button"
              onClick={() => navigate({ to: "/" })}
              className="mt-4 font-mono text-xs font-bold text-text-3 hover:text-phos"
            >
              ‹ Back to Discover
            </button>
          }
        />
      </div>
    );
  }

  const level = pointSummary?.level;
  const levelProgress = level ? (level.progress > 1 ? level.progress / 100 : level.progress) : 0;
  const unreadCount = notifications.filter((n) => !n.read).length;
  const statTiles: { icon: PixelIconName; value: string; label: string; tone: Tone }[] = [
    { icon: "templates", value: formatStat(createdGames.length), label: "Games", tone: "phos" },
    { icon: "user", value: formatStat(creatorStats?.followers), label: "Followers", tone: "cyan" },
    { icon: "next", value: formatStat(followingCount), label: "Following", tone: "violet" },
    { icon: "heart", value: formatStat(creatorStats?.likes), label: "Likes", tone: "magenta" },
    { icon: "send", value: formatStat(creatorStats?.shares), label: "Shares", tone: "cyan" },
    { icon: "code", value: formatStat(creatorStats?.remixes), label: "Remixes", tone: "amber" },
  ];

  return (
    <div className="relative">
      <PageHeader
        command="cat ~/player.json"
        title="PLAYER 1"
        subtitle="Your creator identity, stats and saves."
        actions={
          <>
            <Btn variant="ghost" size="sm" onClick={openNotificationsPanel}>
              <PixelIcon name="bell" size={11} />
              Inbox{unreadCount > 0 ? ` (${unreadCount})` : ""}
            </Btn>
          </>
        }
      />

      <div className="mx-auto max-w-5xl space-y-5 px-4 pb-10 pt-3 sm:px-6 lg:px-8">
        {profileError && <Notice kind="error">{profileError}</Notice>}

        {/* Player card */}
        <Panel
          tone="phos"
          title="player_card"
          actions={<span className="text-phos">● online</span>}
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <div className="relative size-24 shrink-0 overflow-hidden border-2 border-phos-3 bg-[#fcd436] sm:size-28">
                <DogeIcon fill className="scale-[1.12]" />
                <span className="absolute -left-[2px] -top-[2px] bg-phos px-1 font-mono text-[9px] font-extrabold text-ink-0">
                  P1
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  {editingDisplayName ? (
                    <>
                      <input
                        value={draftDisplayName}
                        onChange={(event) => setDraftDisplayName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void saveDisplayName();
                          if (event.key === "Escape") cancelDisplayNameEdit();
                        }}
                        autoFocus
                        maxLength={32}
                        aria-label="Display name"
                        className="px-input min-w-0 flex-1 py-1.5 font-bold"
                      />
                      <Btn
                        variant="primary"
                        size="icon"
                        onClick={() => void saveDisplayName()}
                        disabled={savingDisplayName || !draftDisplayName.trim()}
                        aria-label="Save name"
                      >
                        {savingDisplayName ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Check className="size-4" />
                        )}
                      </Btn>
                      <Btn
                        variant="ghost"
                        size="icon"
                        onClick={cancelDisplayNameEdit}
                        aria-label="Cancel name edit"
                      >
                        <X className="size-4" />
                      </Btn>
                    </>
                  ) : (
                    <>
                      <h2 className="font-pixel min-w-0 truncate text-[14px] leading-snug text-text sm:text-[16px]">
                        @{displayName}
                      </h2>
                      <Btn
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 min-h-8"
                        onClick={() => {
                          setDraftDisplayName(displayName);
                          setEditingDisplayName(true);
                        }}
                        aria-label="Edit name"
                      >
                        <Pencil className="size-3.5" />
                      </Btn>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={copyIdentity}
                  className="mt-2 flex max-w-full items-center gap-1.5 font-mono text-[12px] text-cyan hover:underline"
                  title="Copy wallet address"
                >
                  <span className="truncate">{compactIdentity}</span>
                  {identityCopied ? (
                    <Check className="size-3 shrink-0" />
                  ) : (
                    <Copy className="size-3 shrink-0" />
                  )}
                </button>
                <p className="mt-1.5 font-mono text-[11px] text-text-3">joined {joined ?? "—"}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {achievementSummary?.inventory.genesisFounderBadge && (
                    <Tag tone="amber">★ Genesis founder</Tag>
                  )}
                  <Btn variant="danger" size="sm" onClick={() => void signOut()}>
                    <PixelIcon name="exit" size={10} /> Disconnect
                  </Btn>
                </div>
              </div>
            </div>

            <div className="w-full shrink-0 border-2 border-line bg-ink-1 p-3 sm:w-60">
              <div className="flex items-end justify-between">
                <span className="label-term text-text-3">Level</span>
                <span className="font-term text-[44px] leading-[0.8] text-phos glow-phos">
                  {String(level?.level ?? 1).padStart(2, "0")}
                </span>
              </div>
              <Meter className="mt-3" value={levelProgress} segments={14} label="Level progress" />
              <p className="mt-2 font-mono text-[10px] text-text-3">
                {level
                  ? `${formatDogeGamePoints(level.points)} / ${formatDogeGamePoints(level.nextLevelPoints)} DP to next`
                  : "Earn DP to level up"}
              </p>
            </div>
          </div>
        </Panel>

        {/* Scores */}
        <div className="grid grid-cols-2 gap-3">
          <div className="border-2 border-amber-2 bg-ink-2 p-4">
            <p className="label-term text-amber">Creator score</p>
            <p className="font-term mt-2 truncate text-[46px] leading-none text-amber glow-amber sm:text-[60px]">
              {formatStat(creatorStats?.lifetimeScore ?? creatorStats?.creatorScore)}
            </p>
            <p className="mt-1 font-mono text-[10px] text-text-3">lifetime</p>
          </div>
          <div className="border-2 border-magenta-2 bg-ink-2 p-4">
            <p className="label-term text-magenta">Doge Points</p>
            <p className="font-term mt-2 truncate text-[46px] leading-none text-magenta glow-magenta sm:text-[60px]">
              {formatDogeGamePoints(pointSummary?.dogeGamePoints ?? pointSummary?.lifetimePoints)}
            </p>
            <p className="mt-1 font-mono text-[10px] text-text-3">DP balance</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {statTiles.map((tile) => (
            <div
              key={tile.label}
              className="flex flex-col items-center gap-1.5 border-2 border-line bg-ink-2 px-2 py-3 text-center"
            >
              <PixelIcon name={tile.icon} size={14} className={TONE_TEXT[tile.tone]} />
              <span className="font-term text-[30px] leading-none text-text">{tile.value}</span>
              <span className="label-term text-text-3">{tile.label}</span>
            </div>
          ))}
        </div>

        {/* Quests & achievements */}
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setOpenPanel("challenges")}
            className="group flex flex-col border-2 border-line bg-ink-2 p-4 text-left transition-colors hover:border-magenta"
          >
            <span className="flex items-center justify-between">
              <span className="label-term text-magenta">Daily quests</span>
              <PixelSprite name="coin" scale={3} />
            </span>
            <span className="font-term mt-2 text-[40px] leading-none text-text">
              {completedChallenges}/{dailyChallenges.length || 3}
            </span>
            <Meter
              className="mt-3"
              value={challengeProgress / 100}
              tone="magenta"
              label="Quest progress"
            />
            <span className="mt-3 min-h-[2.4rem] font-mono text-[11px] text-text-2">
              {nextChallenge ? (
                nextChallenge.completed ? (
                  "All done for today — come back tomorrow"
                ) : (
                  <>
                    <span className="text-text">{nextChallenge.title}</span>
                    <br />
                    {nextChallenge.progress}/{nextChallenge.target} · {nextChallenge.reward}
                  </>
                )
              ) : (
                "3 quests refresh daily"
              )}
            </span>
            <span className="mt-2 font-mono text-[10px] font-extrabold uppercase tracking-[0.12em] text-magenta">
              open quest log ›
            </span>
          </button>

          <button
            type="button"
            onClick={() => setOpenPanel("achievements")}
            className="group flex flex-col border-2 border-line bg-ink-2 p-4 text-left transition-colors hover:border-amber"
          >
            <span className="flex items-center justify-between">
              <span className="label-term text-amber">Achievements</span>
              <PixelIcon name="trophy" size={18} className="text-amber" />
            </span>
            <span className="font-term mt-2 text-[40px] leading-none text-text">
              {unlockedAchievements}
              <span className="text-[24px] text-text-3">/{totalAchievements || "—"}</span>
            </span>
            <Meter
              className="mt-3"
              value={achievementProgress / 100}
              tone="amber"
              label="Achievement progress"
            />
            <span className="mt-3 min-h-[2.4rem] space-y-0.5 font-mono text-[11px]">
              {featuredAchievements.length > 0 ? (
                featuredAchievements.map((achievement) => (
                  <span
                    key={achievement.id}
                    className={cn(
                      "block truncate",
                      achievement.unlocked ? "text-amber" : "text-text-3",
                    )}
                  >
                    {achievement.unlocked ? "★" : "○"} {achievement.title}
                  </span>
                ))
              ) : (
                <span className="text-text-2">Earn badges by playing & creating</span>
              )}
            </span>
            <span className="mt-2 font-mono text-[10px] font-extrabold uppercase tracking-[0.12em] text-amber">
              open trophy case ›
            </span>
          </button>
        </div>

        {/* Saves */}
        <section>
          <SectionHead title="SAVE FILES" />
          <div
            role="tablist"
            aria-label="Game lists"
            className="no-scrollbar flex gap-1 overflow-x-auto border-b-2 border-line"
          >
            {profileGameSections.map((section) => {
              const selected = selectedMobileGameSection.title === section.title;
              return (
                <button
                  key={section.title}
                  role="tab"
                  type="button"
                  aria-selected={selected}
                  onClick={() => setMobileGameTab(section.title)}
                  className={cn(
                    "-mb-[2px] shrink-0 border-2 px-3 py-2 font-mono text-[11px] font-extrabold uppercase tracking-[0.1em] transition-colors",
                    selected
                      ? "border-phos border-b-ink-1 bg-ink-1 text-phos"
                      : "border-transparent text-text-3 hover:text-text",
                  )}
                >
                  {section.title}
                  <span className="ml-1.5 text-text-3">{section.games.length}</span>
                </button>
              );
            })}
          </div>
          <GameRow
            title={selectedMobileGameSection.title}
            games={selectedMobileGameSection.games}
            onEditGame={selectedMobileGameSection.onEditGame}
            emptyMessage={selectedMobileGameSection.emptyMessage}
          />
        </section>

        {/* Activity */}
        <Panel
          tone="cyan"
          title="activity.log"
          bodyClassName="p-0"
          actions={
            <label className="flex items-center gap-2">
              <span className="sr-only">Time range</span>
              <select
                value={timeFilter}
                onChange={(event) => setTimeFilter(event.target.value as TimeFilter)}
                className="h-7 border-2 border-line-2 bg-ink-0 px-2 font-mono text-[10px] font-extrabold uppercase text-text outline-none focus:border-cyan"
              >
                <option value="today">Today</option>
                <option value="week">This week</option>
                <option value="month">This month</option>
                <option value="all">All time</option>
              </select>
            </label>
          }
        >
          {activitiesLoading ? (
            <div className="p-3">
              <ActivityListSkeleton />
            </div>
          ) : filteredActivities.length > 0 ? (
            <>
              <ul className="max-h-96 divide-y-2 divide-line overflow-y-auto">
                {filteredActivities.slice(0, showAllActivities ? undefined : 5).map((activity) => {
                  const style = ACTIVITY_STYLE[activity.activityType] ?? {
                    icon: "play" as PixelIconName,
                    tone: "dim" as Tone,
                    verb: "EVT",
                  };
                  return (
                    <li key={activity._id} className="flex items-center gap-3 px-3 py-2.5">
                      <span
                        className={cn(
                          "w-11 shrink-0 font-mono text-[10px] font-extrabold",
                          TONE_TEXT[style.tone],
                        )}
                      >
                        {style.verb}
                      </span>
                      <PixelIcon name={style.icon} size={11} className={TONE_TEXT[style.tone]} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-[12px] text-text">
                          {activity.details}
                        </span>
                        <span className="block font-mono text-[10px] text-text-3">
                          {formatTimeAgo(activity.timestamp)}
                        </span>
                      </span>
                      {activity.gameId && (
                        <Btn
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            navigate({ to: "/play", search: { gameId: activity.gameId! } })
                          }
                        >
                          <PixelIcon name="play" size={9} /> Play
                        </Btn>
                      )}
                    </li>
                  );
                })}
              </ul>
              {filteredActivities.length > 5 && (
                <div className="border-t-2 border-line p-2">
                  <Btn
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => setShowAllActivities(!showAllActivities)}
                  >
                    {showAllActivities ? "Show less" : `View all ${filteredActivities.length}`}
                  </Btn>
                </div>
              )}
            </>
          ) : (
            <p className="p-4 font-mono text-[12px] text-text-3">
              No recent activity found for the selected time range.
            </p>
          )}
        </Panel>
      </div>

      {/* Quest log */}
      <Dialog
        open={openPanel === "challenges"}
        onOpenChange={(open) => !open && setOpenPanel(null)}
      >
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-xl">
          <DialogTitle className="px-titlebar font-mono text-[10px] text-text">
            quest_log — daily
          </DialogTitle>
          <DialogDescription className="sr-only">
            Today&apos;s daily challenges and their rewards.
          </DialogDescription>
          <div className="overflow-y-auto p-4">
            <ul className="space-y-2.5">
              {dailyChallenges.map((challenge) => (
                <li
                  key={challenge.id}
                  className={cn(
                    "border-2 p-3",
                    challenge.completed ? "border-phos bg-phos/5" : "border-line bg-ink-1",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "font-mono text-[13px] font-extrabold",
                          challenge.completed ? "text-phos" : "text-text",
                        )}
                      >
                        {challenge.completed ? "[✓] " : "[ ] "}
                        {challenge.title}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-amber">
                        reward: {challenge.reward}
                      </p>
                    </div>
                    <span className="font-term shrink-0 text-[24px] leading-none text-text-2">
                      {challenge.progress}/{challenge.target}
                    </span>
                  </div>
                  <Meter
                    className="mt-3"
                    value={challenge.target ? challenge.progress / challenge.target : 0}
                    tone={challenge.completed ? "phos" : "magenta"}
                    label={`${challenge.title} progress`}
                  />
                </li>
              ))}
              {dailyChallenges.length === 0 && (
                <p className="font-mono text-sm text-text-3">No daily challenges loaded yet.</p>
              )}
            </ul>
            <p className="mt-4 text-center font-mono text-[11px] text-text-3">
              Complete quests. Collect rewards. Keep KULTing.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Trophy case */}
      <Dialog
        open={openPanel === "achievements"}
        onOpenChange={(open) => !open && setOpenPanel(null)}
      >
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-xl">
          <DialogTitle className="px-titlebar font-mono text-[10px] text-text">
            trophy_case
          </DialogTitle>
          <DialogDescription className="sr-only">
            All achievements and whether you have unlocked them.
          </DialogDescription>
          <div className="overflow-y-auto p-4">
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {(achievementSummary?.achievements ?? []).map((achievement) => (
                <li
                  key={achievement.id}
                  className={cn(
                    "flex gap-3 border-2 p-3",
                    achievement.unlocked
                      ? "border-amber-2 bg-amber/5"
                      : "border-line bg-ink-1 opacity-70",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-11 shrink-0 place-items-center border-2",
                      achievement.unlocked
                        ? "border-amber text-amber"
                        : "border-line-2 text-text-3",
                    )}
                  >
                    <PixelIcon name={achievementIconForTitle(achievement.title)} size={18} />
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block font-mono text-[12px] font-extrabold",
                        achievement.unlocked ? "text-amber" : "text-text-2",
                      )}
                    >
                      {achievement.title}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-text-3">
                      {achievement.description}
                    </span>
                    <span
                      className={cn(
                        "mt-1.5 block font-mono text-[10px] font-extrabold uppercase",
                        achievement.unlocked ? "text-phos" : "text-text-3",
                      )}
                    >
                      {achievement.unlocked
                        ? "✓ unlocked"
                        : `🔒 ${achievementLockedLabel(achievement.title)}`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            {(achievementSummary?.achievements ?? []).length === 0 && (
              <p className="font-mono text-sm text-text-3">No achievements loaded yet.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Inbox */}
      <Dialog
        open={openPanel === "notifications"}
        onOpenChange={(open) => {
          if (!open) {
            setOpenPanel(null);
            return;
          }
          void markNotificationsRead(getCurrentUserId())
            .then(() => {
              setNotifications((current) =>
                current.map((notification) => ({ ...notification, read: true })),
              );
            })
            .catch(() => null);
        }}
      >
        <DialogContent className="flex max-h-[82vh] flex-col gap-0 p-0 sm:max-w-xl">
          <DialogTitle className="px-titlebar font-mono text-[10px] text-text">inbox</DialogTitle>
          <DialogDescription className="sr-only">Your notifications.</DialogDescription>
          <div className="overflow-y-auto p-4">
            {notifications.length === 0 ? (
              <EmptyState text="No notifications yet." />
            ) : (
              <ul className="divide-y-2 divide-line">
                {notifications.map((notification, index) => (
                  <li key={`${notification.createdAt}-${index}`} className="flex gap-3 py-3">
                    <span
                      className={cn(
                        "font-mono text-[11px] font-extrabold",
                        notification.read ? "text-text-3" : "text-magenta",
                      )}
                    >
                      {notification.read ? "·" : "●"}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-text">
                        {notification.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-text-2">{notification.body}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
