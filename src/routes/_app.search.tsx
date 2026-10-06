import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { GamePosterCard } from "@/components/studio/GamePosterCard";
import { PageHeader } from "@/components/studio/PageHeader";
import { VirtualGrid, type GridBreakpoints } from "@/components/studio/VirtualGrid";
import { fetchGamesPage } from "@/lib/api/games";
import type { Game } from "@/lib/games-data";
import { prepareReelPlayEntry } from "@/lib/reelFeed";
import { PixelIcon } from "@/components/term/PixelIcon";
import { EmptyState, Notice, TermLoader } from "@/components/term/Term";

export const Route = createFileRoute("/_app/search")({
  head: () => ({
    meta: [
      { title: "Search Games — Creator Studio" },
      { name: "description", content: "Search community games and launch them instantly." },
    ],
  }),
  component: SearchGames,
});

// Mirrors the Tailwind grid this page used: 2 columns, md:3, xl:4, 2xl:5.
const RESULT_COLUMNS: GridBreakpoints = [
  [0, 2],
  [768, 3],
  [1280, 4],
  [1536, 5],
];

function SearchGames() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    inputRef.current?.focus();
    fetchGamesPage(0, 100)
      .then(({ games: fetchedGames }) => setGames(fetchedGames))
      .catch(() => setError("Games could not be loaded. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return games;
    return games.filter((game) =>
      [game.title, game.category, game.creator, game.prompt ?? ""].some((value) =>
        value.toLowerCase().includes(normalized),
      ),
    );
  }, [games, query]);

  const playGame = (game: Game) => {
    if (!game.templateId) return;
    prepareReelPlayEntry(
      game.templateId,
      results.map((entry) => entry.templateId).filter(Boolean) as string[],
    );
    navigate({ to: "/play", search: { gameId: game.templateId } });
  };

  return (
    <div className="relative">
      <PageHeader
        command="grep -ri games"
        title="SEARCH"
        subtitle="Find a world and play instantly."
      />

      <div className="px-4 pb-10 pt-3 sm:px-6 lg:px-8">
        <label className="sticky top-[60px] z-30 mx-auto flex h-12 w-full max-w-3xl items-center gap-3 border-2 border-phos bg-ink-0 px-4 shadow-[4px_4px_0_0_#000]">
          <span className="font-mono text-sm font-extrabold text-phos">grep</span>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="title, category, or creator…"
            aria-label="Search games"
            className="min-w-0 flex-1 bg-transparent font-mono text-sm text-text caret-phos outline-none placeholder:text-text-3"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="grid size-7 place-items-center border-2 border-line-2 text-text-2 hover:border-danger hover:text-danger"
            >
              <PixelIcon name="close" size={9} />
            </button>
          )}
        </label>

        <div className="mx-auto mt-6 flex max-w-7xl items-center justify-between gap-3 font-mono text-[12px]">
          <p className="text-text-2">
            {query.trim() ? (
              <>
                matches for <span className="text-phos">&quot;{query.trim()}&quot;</span>
              </>
            ) : (
              "all games"
            )}
          </p>
          {!loading && (
            <span className="text-text-3">
              {results.length} {results.length === 1 ? "result" : "results"}
            </span>
          )}
        </div>

        <div className="mx-auto max-w-7xl">
          {loading ? (
            <div className="grid min-h-56 place-items-center">
              <TermLoader label="Indexing games" />
            </div>
          ) : error ? (
            <Notice kind="error" className="mt-8">
              {error}
            </Notice>
          ) : results.length === 0 ? (
            <EmptyState
              className="mt-8"
              title="NO MATCHES"
              text="Try a different game title, category, or creator."
            />
          ) : (
            <VirtualGrid
              className="mt-4"
              items={results}
              breakpoints={RESULT_COLUMNS}
              getKey={(game, index) => `${game.templateId ?? game.title}-${index}`}
              renderItem={(game, index, intro) => (
                <GamePosterCard
                  game={game}
                  index={index}
                  onClick={() => playGame(game)}
                  animated={intro}
                />
              )}
            />
          )}
        </div>
      </div>
    </div>
  );
}
