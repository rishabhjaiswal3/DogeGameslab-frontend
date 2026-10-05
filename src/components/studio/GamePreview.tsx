import { lazy, Suspense } from "react";
import { GeneratedGameFrame } from "./GeneratedGameFrame";
import { PreviewSkeleton } from "@/components/studio/PageSkeletons";
import { TermLoader } from "@/components/term/Term";

const ThreePreview = lazy(() =>
  import("./ThreePreview").then((module) => ({ default: module.ThreePreview })),
);

type AnyPackage = Record<string, unknown> & {
  title?: string;
  templateId?: string;
  createdAt?: string | number;
  updatedAt?: string | number;
  refinement?: { generatedCode?: string };
};

// A pure-agent build finishes (or fails) well within ~16 minutes. A codeless
// game older than this is a dead draft, not one that is "being built".
const STALE_BUILD_MS = 20 * 60 * 1000;

/**
 * Chooses how to play a generated package:
 *  - AI build: if the 0G agent produced runnable code, run it in the sandbox iframe.
 *  - Template: otherwise fall back to the deterministic built-in maker (instant, reliable).
 *  - Pure-agent packages have no template behind them, so until their code is
 *    ready there is nothing meaningful to play — show the build status instead
 *    of the maker's default (flappy) demo, which looks like the wrong game.
 */
export function GamePreview({
  gamePackage,
  onScoreSubmit,
  onReelTouchStart,
  onReelTouchMove,
  onReelTouchEnd,
}: {
  gamePackage: AnyPackage;
  onScoreSubmit?: (score: number) => void;
  onReelTouchStart?: (x: number, y: number, target: HTMLElement) => boolean | void;
  onReelTouchMove?: (x: number, y: number, event?: TouchEvent) => void;
  onReelTouchEnd?: () => void;
}) {
  const generatedCode = gamePackage?.refinement?.generatedCode;
  if (typeof generatedCode === "string" && generatedCode.trim().length > 0) {
    return (
      <GeneratedGameFrame
        gamePackage={gamePackage}
        onScoreSubmit={onScoreSubmit}
        onReelTouchStart={onReelTouchStart}
        onReelTouchMove={onReelTouchMove}
        onReelTouchEnd={onReelTouchEnd}
      />
    );
  }
  if (gamePackage?.templateId === "pure-agent") {
    const born = Date.parse(String(gamePackage?.createdAt ?? gamePackage?.updatedAt ?? "")) || 0;
    const buildIsDead = born > 0 && Date.now() - born > STALE_BUILD_MS;
    if (buildIsDead) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-ink-0 px-8 text-center">
          <p className="font-pixel text-[12px] leading-relaxed text-danger">BUILD INTERRUPTED</p>
          <p className="font-mono text-sm font-bold text-text">
            {String(gamePackage?.title ?? "This game")} didn&apos;t finish building
          </p>
          <p className="max-w-sm text-sm text-text-2">
            The AI build for this draft was interrupted and never delivered code. Generate it again
            from the Create page, or delete this draft from My Creations.
          </p>
        </div>
      );
    }
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-ink-0 px-8 text-center">
        <TermLoader label="Compiling" />
        <p className="font-mono text-sm font-bold text-text">
          {String(gamePackage?.title ?? "Your game")} is being built
        </p>
        <p className="max-w-sm text-sm text-text-2">
          The AI agent is writing this game from scratch — it usually takes 10-15 minutes. It will
          appear here automatically when ready.
        </p>
      </div>
    );
  }
  return (
    <Suspense fallback={<PreviewSkeleton />}>
      <ThreePreview gamePackage={gamePackage} onScoreSubmit={onScoreSubmit} />
    </Suspense>
  );
}
