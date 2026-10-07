import { api, hasUsableCachedToken } from "../api";

export type SocialStats = {
  likes: { liked: boolean; count: number };
  comments: { count: number };
  favorites: { favorited: boolean; count: number };
  shares: { count: number };
  views?: { count: number };
};

export type Comment = {
  _id: string;
  gameId: string;
  userId: string;
  username: string;
  text: string;
  createdAt: string;
};

export type CommentsPage = {
  comments: Comment[];
  count: number;
  page: number;
  limit: number;
  totalPages: number;
};

// ─── Aggregate ─────────────────────────────────────────────────────────────

export async function fetchSocialStats(gameId: string, userId?: string): Promise<SocialStats> {
  const params = userId ? { userId } : {};
  const { data } = await api.get(`/social/stats/${gameId}`, { params });
  return data;
}

// ─── Likes ─────────────────────────────────────────────────────────────────

export async function toggleLike(gameId: string, userId: string) {
  const { data } = await api.post("/social/likes/toggle", { gameId, userId });
  return data as { liked: boolean; count: number };
}

export async function fetchLikeStatus(gameId: string, userId?: string) {
  const params = userId ? { userId } : {};
  const { data } = await api.get(`/social/likes/${gameId}`, { params });
  return data as { liked: boolean; count: number };
}

// ─── Comments ──────────────────────────────────────────────────────────────

export async function postComment(
  gameId: string,
  userId: string,
  username: string,
  text: string,
) {
  const { data } = await api.post("/social/comments", { gameId, userId, username, text });
  return data as { comment: Comment; count: number };
}

export async function fetchComments(gameId: string, page = 1, limit = 20) {
  const { data } = await api.get(`/social/comments/${gameId}`, { params: { page, limit } });
  return data as CommentsPage;
}

export async function removeComment(commentId: string, userId: string) {
  const { data } = await api.delete(`/social/comments/${commentId}`, { data: { userId } });
  return data as { deleted: boolean };
}

// ─── Favorites ─────────────────────────────────────────────────────────────

export async function toggleFavorite(gameId: string, userId: string) {
  const { data } = await api.post("/social/favorites/toggle", { gameId, userId });
  return data as { favorited: boolean; count: number };
}

export async function fetchFavoriteStatus(gameId: string, userId?: string) {
  const params = userId ? { userId } : {};
  const { data } = await api.get(`/social/favorites/${gameId}`, { params });
  return data as { favorited: boolean; count: number };
}

// ─── Shares ────────────────────────────────────────────────────────────────

export type SharePlatform = "link" | "twitter" | "discord" | "whatsapp" | "embed" | "instagram" | "email" | "youtube";

export async function recordShare(
  gameId: string,
  userId: string,
  platform: SharePlatform = "link",
) {
  const { data } = await api.post("/social/shares", { gameId, userId, platform });
  return data as { shared: boolean; count: number };
}

export async function fetchShareCount(gameId: string) {
  const { data } = await api.get(`/social/shares/${gameId}`);
  return data as { count: number };
}

export type UserActivity = {
  _id: string;
  userId: string;
  gameId: string | null;
  gameTitle: string | null;
  activityType: "like" | "favorite" | "share" | "comment" | "create" | "play" | "publish" | "major_edit";
  details: string;
  timestamp: string;
};

export async function fetchUserActivities(userId: string): Promise<UserActivity[]> {
  const { data } = await api.get(`/social/activity/user/${userId}`);
  return data as UserActivity[];
}

export async function fetchRecentActivities(limit = 50): Promise<UserActivity[]> {
  const { data } = await api.get("/social/activity/recent", { params: { limit } });
  return data as UserActivity[];
}

export type UserFavoritesResponse = {
  favorites: Array<{ gameId: string; userId: string; createdAt: string }>;
  count: number;
};

export type UserLikesResponse = {
  likes: Array<{ gameId: string; userId: string; createdAt: string }>;
  count: number;
};

export async function fetchUserFavorites(userId: string): Promise<UserFavoritesResponse> {
  const { data } = await api.get(`/social/favorites/user/${userId}`);
  return data as UserFavoritesResponse;
}

export async function fetchUserLikes(userId: string): Promise<UserLikesResponse> {
  const { data } = await api.get(`/social/likes/user/${userId}`);
  return data as UserLikesResponse;
}


// ─── Views (plays) ───────────────────────────────────────────────────────────

export async function recordView(gameId: string, userId: string) {
  const { data } = await api.post(`/social/views/${encodeURIComponent(gameId)}`, { userId });
  return data as { gameId: string; views: number };
}

export async function recordQualifiedPlay(
  gameId: string,
  input: { userId: string; sessionId: string; durationSeconds: number },
) {
  const { data } = await api.post(`/social/plays/${encodeURIComponent(gameId)}/qualify`, input);
  return data as {
    qualified: boolean;
    points: null | { awarded?: boolean; duplicate?: boolean; points?: number };
  };
}

// ─── Follows ─────────────────────────────────────────────────────────────────

export type FollowStatus = { creatorId: string; following: boolean; followers: number };
export type FollowingResponse = { followerId: string; following: string[] };

export async function fetchFollowStatus(creatorId: string, userId: string) {
  const { data } = await api.get(`/social/follows/${encodeURIComponent(creatorId)}`, {
    params: { userId },
  });
  return data as FollowStatus;
}

export async function toggleFollowApi(creatorId: string, userId: string) {
  const { data } = await api.post(`/social/follows/toggle`, { creatorId, userId });
  return data as FollowStatus;
}

export async function fetchFollowing(userId: string) {
  const { data } = await api.get(`/social/follows/user/${encodeURIComponent(userId)}`);
  return data as FollowingResponse;
}

export type CreatorStats = {
  creatorId: string;
  games: number;
  plays: number;
  likes: number;
  shares: number;
  remixes: number;
  followers: number;
  featured: number;
  creatorScore: number;
  lifetimeScore: number;
  dailyScore: Record<string, number>;
  weeklyScore: Record<string, number>;
  lifetimePoints: number;
  dailyPoints: Record<string, number>;
  weeklyPoints: Record<string, number>;
  currentDay: string | null;
  currentWeek: string | null;
};

/** Persists the display name server-side so leaderboards show it everywhere. */
export async function updateProfileName(userId: string, username: string) {
  const { data } = await api.post("/social/profile", { userId, username });
  return data as { userId: string; username: string };
}

export async function fetchProfileName(userId: string) {
  const { data } = await api.get(`/social/profile/${encodeURIComponent(userId)}`);
  return data as { userId: string; username: string | null };
}

export async function fetchCreatorStats(creatorId: string) {
  const { data } = await api.get(`/social/creator-stats/${encodeURIComponent(creatorId)}`);
  return data as CreatorStats;
}

export type PointSummary = {
  userId: string;
  dogeGamePoints: number;
  level: null | {
    level: number;
    points: number;
    currentLevelPoints: number;
    nextLevelPoints: number;
    progress: number;
  };
  lifetimePoints: number;
  dailyPoints: Record<string, number>;
  weeklyPoints: Record<string, number>;
  currentDay: string | null;
  currentWeek: string | null;
  updatedAt: string | null;
};

export async function fetchPointSummary(userId: string) {
  const { data } = await api.get(`/social/points/${encodeURIComponent(userId)}`);
  return data as PointSummary;
}

export type DailyChallenge = {
  id: string;
  title: string;
  metric: string;
  target: number;
  progress: number;
  reward: string;
  completed: boolean;
};

export async function fetchDailyChallenges(userId: string) {
  const { data } = await api.get(`/social/daily-challenges/${encodeURIComponent(userId)}`);
  return data as { userId: string; date: string; week: string; challenges: DailyChallenge[] };
}

export async function claimDailyChallenge(userId: string, challengeId: string) {
  const { data } = await api.post("/social/daily-challenge", {
    userId,
    creatorId: userId,
    challengeId,
  });
  return data as { rewarded: boolean };
}

export type Achievement = {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
};

export type AchievementSummary = {
  userId: string;
  inventory: {
    badges: string[];
    genesisFounderBadge: boolean;
  };
  achievements: Achievement[];
};

export async function fetchAchievements(userId: string) {
  const { data } = await api.get(`/social/achievements/${encodeURIComponent(userId)}`);
  return data as AchievementSummary;
}

export type NotificationItem = {
  type: string;
  title: string;
  body: string;
  gameId?: string | null;
  actorId?: string | null;
  read: boolean;
  createdAt: string;
};

export async function fetchNotifications(userId: string, unreadOnly = false) {
  // Notifications are private to their owner. Until sign-in has produced a
  // session token there is nothing to ask for, and the request would be a 401.
  if (!hasUsableCachedToken()) return { userId, notifications: [] as NotificationItem[] };
  const { data } = await api.get(`/social/notifications/${encodeURIComponent(userId)}`, {
    params: { unreadOnly, limit: 20 },
  });
  return data as { userId: string; notifications: NotificationItem[] };
}

export async function markNotificationsRead(userId: string) {
  const { data } = await api.post(`/social/notifications/${encodeURIComponent(userId)}/read`);
  return data as { userId: string; updated: number };
}

export async function createNotification(input: {
  userId: string;
  type: string;
  title: string;
  body: string;
  gameId?: string | null;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { data } = await api.post("/social/notifications", input);
  return data as { notification: NotificationItem };
}

export type EconomyLeaderboardEntry = {
  rank: number;
  userId?: string;
  walletAddress?: string;
  creatorId?: string;
  dogeGamePoints?: number;
  creatorScore?: number;
  lifetimeScore?: number;
  level?: PointSummary["level"];
};

export async function fetchEconomyLeaderboard(
  economy: "kp" | "cs",
  period: "weekly" | "all-time" = "all-time",
  limit = 100,
) {
  const { data } = await api.get("/social/economy-leaderboard", {
    params: { economy, period, limit },
  });
  return data as { economy: "kp" | "cs"; period: string; entries: EconomyLeaderboardEntry[] };
}
