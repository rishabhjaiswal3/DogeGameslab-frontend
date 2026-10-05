import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { LeaderboardSkeleton } from "@/components/studio/PageSkeletons";
import { PageHeader } from "@/components/studio/PageHeader";
import { PixelIcon } from "@/components/term/PixelIcon";
import {
  Block,
  EmptyState,
  Notice,
  Spinner,
  TONE_TEXT,
  Tag,
  type Tone,
} from "@/components/term/Term";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { LEADERBOARD_PAGE_SIZE } from "@/lib/pagination";
import { getCurrentUsername, getWalletAddress } from "@/lib/identity";
import {
  fetchCreatorScoreLeaderboard,
  fetchDogeGamePointsLeaderboard,
  type CreatorScoreEntry,
  type DogeGamePointsEntry,
} from "@/lib/api/leaderboards";
import rankDoge1 from "@/assets/rank-doge-1.webp";
import rankDoge2 from "@/assets/rank-doge-2.webp";
import rankDoge3 from "@/assets/rank-doge-3.webp";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/leaderboard")({
  pendingComponent: LeaderboardSkeleton,
  head: () => ({
    meta: [
      { title: "Leaderboard - Creator Studio" },
      {
        name: "description",
        content: "Creator and player rankings by Creator Score and Doge Points.",
      },
    ],
  }),
  component: Leaderboard,
});

type LeaderboardTab = "creator" | "player";
type TimeRange = "weekly" | "monthly" | "allTime";
type CreatorRank = CreatorScoreEntry;
type PlayerRank = DogeGamePointsEntry;
type RankRow = CreatorRank | PlayerRank;

const timeRanges: Array<{ id: TimeRange; label: string }> = [
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "allTime", label: "All time" },
];

function formatStat(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

function formatPodiumStat(value: number) {
  if (Math.abs(value) < 1_000_000) return formatStat(value);
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

function walletFor(row: RankRow) {
  const id = "walletAddress" in row ? row.walletAddress : row.creatorId;
  if (/^0x[a-f0-9]{40}$/i.test(id)) return id;
  const hex = Array.from(id || row.name)
    .map((char) => char.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("")
    .padEnd(40, "0")
    .slice(0, 40);
  return `0x${hex}`;
}

function compactWallet(row: RankRow) {
  const wallet = walletFor(row);
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

function getScore(row: RankRow) {
  return "creatorScore" in row ? row.creatorScore : row.dogeGamePoints;
}

function isCurrentUserRow(row: RankRow, currentUsername: string, currentWallet: string | null) {
  const rowWallet = walletFor(row);
  return (
    row.name.toLowerCase() === currentUsername.toLowerCase() ||
    (!!currentWallet && rowWallet.toLowerCase() === currentWallet.toLowerCase())
  );
}

function ordinal(n: number) {
  const tail = n % 100;
  if (tail >= 11 && tail <= 13) return `${n}TH`;
  return `${n}${["TH", "ST", "ND", "RD"][n % 10] ?? "TH"}`;
}

type PodiumStyle = {
  tone: Tone;
  /** CSS colour variables for this place. */
  color: string;
  dim: string;
  order: string;
  label: string;
  medal: string;
  image: string;
  /** Pedestal height: the champion stands highest. */
  pedestal: string;
  avatar: string;
};

const PODIUM: Record<1 | 2 | 3, PodiumStyle> = {
  1: {
    tone: "amber",
    color: "var(--amber)",
    dim: "var(--amber-2)",
    order: "order-2",
    label: "CHAMPION",
    medal: "GOLD",
    image: rankDoge1,
    pedestal: "clamp(54px, 9vw, 92px)",
    avatar: "clamp(64px, 19vw, 128px)",
  },
  2: {
    tone: "cyan",
    color: "var(--cyan)",
    dim: "var(--cyan-2)",
    order: "order-1",
    label: "RUNNER-UP",
    medal: "SILVER",
    image: rankDoge2,
    pedestal: "clamp(38px, 6.5vw, 64px)",
    avatar: "clamp(54px, 16vw, 104px)",
  },
  3: {
    tone: "magenta",
    color: "var(--magenta)",
    dim: "var(--magenta-2)",
    order: "order-3",
    label: "THIRD",
    medal: "BRONZE",
    image: rankDoge3,
    pedestal: "clamp(26px, 4.5vw, 44px)",
    avatar: "clamp(54px, 16vw, 104px)",
  },
};

function Podium({
  rows,
  isCreator,
  currentUsername,
  currentWallet,
}: {
  rows: RankRow[];
  isCreator: boolean;
  currentUsername: string;
  currentWallet: string | null;
}) {
  const podiumRows = rows.slice(0, 3);
  if (podiumRows.length === 0) return null;
  return (
    <div
      className={cn(
        "mb-6 grid items-end gap-2 sm:gap-4",
        podiumRows.length === 1
          ? "mx-auto max-w-xs grid-cols-1"
          : podiumRows.length === 2
            ? "grid-cols-2"
            : "grid-cols-3",
      )}
    >
      {podiumRows.map((row, index) => {
        const style = PODIUM[row.rank as 1 | 2 | 3] ?? PODIUM[3];
        const isYou = isCurrentUserRow(row, currentUsername, currentWallet);
        const champion = row.rank === 1;
        return (
          <div
            key={`podium-${row.rank}`}
            className={cn(
              "animate-rise flex min-w-0 flex-col items-stretch",
              podiumRows.length === 3 && style.order,
            )}
            style={{ animationDelay: `${index * 90}ms` }}
          >
            {/* the player: themed Doge, name and score */}
            <div
              className="relative flex min-w-0 flex-col items-center overflow-hidden border-2 border-b-0 px-2 pb-3 pt-4 text-center sm:pt-5"
              style={{
                borderColor: style.dim,
                background: `radial-gradient(120% 70% at 50% 0%, color-mix(in srgb, ${style.color} 26%, transparent), transparent 70%), var(--ink-2)`,
              }}
            >
              {champion && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-full"
                  style={{
                    background: `repeating-conic-gradient(from 0deg at 50% 22%, color-mix(in srgb, ${style.color} 14%, transparent) 0deg 8deg, transparent 8deg 20deg)`,
                    maskImage: "radial-gradient(70% 55% at 50% 22%, #000, transparent 75%)",
                    WebkitMaskImage: "radial-gradient(70% 55% at 50% 22%, #000, transparent 75%)",
                  }}
                />
              )}
              <div className="relative">
                <img
                  src={style.image}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  className={cn("block select-none", champion && "animate-bob")}
                  style={{
                    width: style.avatar,
                    height: style.avatar,
                    borderRadius: "22%",
                    border: `3px solid ${style.color}`,
                    boxShadow: `0 0 0 3px var(--ink-0), 0 0 ${champion ? 34 : 22}px color-mix(in srgb, ${style.color} 55%, transparent)`,
                  }}
                />
                <span
                  className="font-pixel absolute left-1/2 whitespace-nowrap px-1.5 py-1 text-[8px] leading-none sm:text-[9px]"
                  style={{
                    bottom: -9,
                    transform: "translateX(-50%)",
                    background: style.color,
                    color: "var(--ink-0)",
                    boxShadow: "0 2px 0 var(--ink-0)",
                  }}
                >
                  {ordinal(row.rank)}
                </span>
              </div>
              <p
                className="relative mt-4 flex w-full min-w-0 items-center justify-center gap-1"
                title={row.name}
              >
                <span className="truncate font-mono text-[12px] font-extrabold text-text sm:text-[14px]">
                  {row.name}
                </span>
                {isYou && <Tag tone="phos">you</Tag>}
              </p>
              <p className="relative mt-0.5 hidden truncate font-mono text-[10px] text-text-3 sm:block">
                {compactWallet(row)}
              </p>
              <p
                className={cn(
                  "font-term relative mt-1.5 text-[24px] leading-none sm:text-[32px]",
                  isCreator ? "text-amber" : "text-magenta",
                )}
                style={{ textShadow: "0 0 12px currentColor" }}
              >
                {formatPodiumStat(getScore(row))}
              </p>
            </div>

            {/* the step they stand on */}
            <div
              className="relative flex items-center justify-center overflow-hidden border-2"
              style={{
                height: style.pedestal,
                borderColor: style.dim,
                background: `linear-gradient(180deg, color-mix(in srgb, ${style.color} 34%, var(--ink-1)), color-mix(in srgb, ${style.color} 10%, var(--ink-0)))`,
                boxShadow: `inset 0 3px 0 color-mix(in srgb, ${style.color} 70%, transparent)`,
              }}
            >
              <span
                aria-hidden="true"
                className="font-term absolute leading-none"
                style={{
                  right: 6,
                  bottom: -6,
                  fontSize: `calc(${style.pedestal} * 1.25)`,
                  color: style.color,
                  opacity: 0.22,
                }}
              >
                {row.rank}
              </span>
              <span
                className={cn(
                  "font-pixel relative text-[8px] leading-none tracking-[0.08em] sm:text-[10px]",
                  TONE_TEXT[style.tone],
                )}
              >
                <span className="sm:hidden">{style.medal}</span>
                <span className="hidden sm:inline">{style.label}</span>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Leaderboard() {
  const [activeTab, setActiveTab] = useState<LeaderboardTab>("creator");
  const [timeRange, setTimeRange] = useState<TimeRange>("weekly");
  const [creatorRows, setCreatorRows] = useState<CreatorRank[]>([]);
  const [playerRows, setPlayerRows] = useState<PlayerRank[]>([]);
  const [rowLimit, setRowLimit] = useState(LEADERBOARD_PAGE_SIZE);
  const [hasMoreRows, setHasMoreRows] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentUsername = getCurrentUsername();
  const currentWallet = getWalletAddress();
  const isCreator = activeTab === "creator";
  const rows = isCreator ? creatorRows : playerRows;
  const podiumRows = rows;
  const tableRows = rows.slice(3);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRowLimit(LEADERBOARD_PAGE_SIZE);
    void (async () => {
      try {
        const [creatorTop, playerTop] = await Promise.all([
          fetchCreatorScoreLeaderboard(LEADERBOARD_PAGE_SIZE, timeRange),
          fetchDogeGamePointsLeaderboard(LEADERBOARD_PAGE_SIZE, timeRange),
        ]);
        if (cancelled) return;
        setCreatorRows(creatorTop.entries);
        setPlayerRows(playerTop.entries);
        setHasMoreRows(
          creatorTop.entries.length >= LEADERBOARD_PAGE_SIZE ||
            playerTop.entries.length >= LEADERBOARD_PAGE_SIZE,
        );
      } catch (requestError) {
        if (cancelled) return;
        setError(
          requestError instanceof Error ? requestError.message : "Unable to load leaderboard.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [timeRange]);

  const loadMoreRows = useCallback(() => {
    if (loadingMore || !hasMoreRows) return;
    const nextLimit = rowLimit + LEADERBOARD_PAGE_SIZE;
    setLoadingMore(true);
    void (async () => {
      try {
        const board = isCreator
          ? await fetchCreatorScoreLeaderboard(nextLimit, timeRange)
          : await fetchDogeGamePointsLeaderboard(nextLimit, timeRange);
        if (isCreator) setCreatorRows(board.entries as CreatorRank[]);
        else setPlayerRows(board.entries as PlayerRank[]);
        setRowLimit(nextLimit);
        setHasMoreRows(board.entries.length >= nextLimit);
      } catch {
        setHasMoreRows(false);
      } finally {
        setLoadingMore(false);
      }
    })();
  }, [hasMoreRows, isCreator, loadingMore, rowLimit, timeRange]);

  const loadMoreRef = useInfiniteScroll(
    loadMoreRows,
    hasMoreRows && !loading && tableRows.length > 0,
  );

  return (
    <div className="relative">
      <PageHeader
        command="./ranks --season"
        title="HIGH SCORES"
        subtitle="Creator Score & Doge Points rankings."
      />

      <div className="mx-auto max-w-5xl px-4 pb-10 pt-3 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div role="tablist" aria-label="Board" className="flex border-2 border-line bg-ink-0 p-1">
            {(
              [
                ["creator", "Creators", "star"],
                ["player", "Players", "user"],
              ] as const
            ).map(([id, label, icon]) => (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={activeTab === id}
                onClick={() => setActiveTab(id)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 px-4 py-2 font-mono text-[11px] font-extrabold uppercase tracking-[0.12em] transition-colors sm:flex-none",
                  activeTab === id ? "bg-phos text-ink-0" : "text-text-3 hover:text-text",
                )}
              >
                <PixelIcon name={icon} size={12} />
                {label}
              </button>
            ))}
          </div>
          <div
            role="tablist"
            aria-label="Time range"
            className="flex border-2 border-line bg-ink-0 p-1"
          >
            {timeRanges.map((range) => (
              <button
                key={range.id}
                role="tab"
                type="button"
                aria-selected={timeRange === range.id}
                onClick={() => setTimeRange(range.id)}
                className={cn(
                  "flex-1 px-3 py-2 font-mono text-[11px] font-extrabold uppercase tracking-[0.12em] transition-colors sm:flex-none",
                  timeRange === range.id ? "bg-amber text-ink-0" : "text-text-3 hover:text-text",
                )}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="mb-6 grid grid-cols-3 items-end gap-3">
            <Block className="h-36" />
            <Block className="h-48" />
            <Block className="h-32" />
          </div>
        ) : (
          <Podium
            rows={podiumRows}
            isCreator={isCreator}
            currentUsername={currentUsername}
            currentWallet={currentWallet}
          />
        )}

        <section className="px-panel" data-tone="phos">
          <div className="px-titlebar grid grid-cols-[4.5rem_1fr_auto] gap-3">
            <span>Rank</span>
            <span>Name</span>
            <span className="text-right">{isCreator ? "Creator score" : "Doge Points"}</span>
          </div>
          <div className="max-h-[620px] overflow-y-auto">
            {loading &&
              Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="grid grid-cols-[4.5rem_1fr_auto] gap-3 px-3 py-3">
                  <Block className="h-5 w-10" />
                  <Block className="h-5 w-40" />
                  <Block className="h-5 w-16" />
                </div>
              ))}
            {!loading && error && (
              <div className="p-4">
                <Notice kind="error">{error}</Notice>
              </div>
            )}
            {!loading && !error && rows.length === 0 && (
              <div className="p-4">
                <EmptyState
                  sprite="coin"
                  title="INSERT COIN"
                  text="No ranked users yet. Play and create to get on the board."
                />
              </div>
            )}
            {!loading && !error && rows.length > 0 && tableRows.length === 0 && (
              <p className="px-4 py-10 text-center font-mono text-sm text-text-3">
                All ranked users are on the podium.
              </p>
            )}
            <ol>
              {tableRows.map((row, index) => {
                const score = getScore(row);
                const isYou = isCurrentUserRow(row, currentUsername, currentWallet);
                return (
                  <li
                    key={`${activeTab}-${row.rank}`}
                    className={cn(
                      "animate-rise grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 px-3 py-2.5",
                      isYou
                        ? "bg-phos/10 shadow-[inset_3px_0_0_0_var(--phos)]"
                        : index % 2 === 0
                          ? "bg-ink-1"
                          : "",
                    )}
                    style={{ animationDelay: `${Math.min(index, 20) * 25}ms` }}
                  >
                    <span className="font-term text-[26px] leading-none text-text-3">
                      {ordinal(row.rank)}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "truncate font-mono text-[13px] font-bold",
                            isYou ? "text-phos" : "text-text",
                          )}
                        >
                          {row.name}
                        </span>
                        {isYou && <Tag tone="phos">you</Tag>}
                      </span>
                      <span className="block truncate font-mono text-[10px] text-text-3">
                        {compactWallet(row)}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "font-term text-right text-[26px] leading-none tabular-nums",
                        isCreator ? "text-amber" : "text-magenta",
                      )}
                      title={formatStat(score)}
                    >
                      {formatPodiumStat(score)}
                    </span>
                  </li>
                );
              })}
            </ol>
            {(hasMoreRows || loadingMore) && (
              <div
                ref={loadMoreRef}
                className="px-4 py-4 text-center font-mono text-xs text-text-3"
              >
                {loadingMore && (
                  <>
                    <Spinner /> loading more ranks…
                  </>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
