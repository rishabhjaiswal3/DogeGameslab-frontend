import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bug, Copy, ExternalLink, Loader2, Lock, RotateCcw } from "lucide-react";
import { PixelIcon } from "@/components/term/PixelIcon";
import { Btn, Notice, Spinner } from "@/components/term/Term";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { publishGamePackage, unpublishGamePackage } from "@/lib/api/publishGame";
import { runCodeJob } from "@/hooks/useCreatorStudio";
import { useStudioAuth } from "@/hooks/useStudioAuth";
import { useStudioContext } from "@/context/StudioContext";
import { GamePreview } from "@/components/studio/GamePreview";
import { EditPageSkeleton } from "@/components/studio/PageSkeletons";
import { StudioSignInGate } from "@/components/studio/StudioSignInButton";
import { ownsGame } from "@/lib/identity";
import { buildPlayUrl } from "@/lib/playNavigation";

export const Route = createFileRoute("/_app/edit/$gameId")({
  pendingComponent: EditPageSkeleton,
  head: () => ({
    meta: [
      { title: "Edit Game — Creator Studio" },
      {
        name: "description",
        content: "Tweak settings, chat with the agent, and reshape your game.",
      },
    ],
  }),
  component: GameEditor,
});

type ChatMessage = { role: "user" | "assistant"; text: string };
type GameError = { message: string; stack: string };

function GameEditor() {
  const { gameId } = Route.useParams();
  const navigate = useNavigate();
  const { createdGames, addCreatedGame, refreshCreatedGames } = useStudioContext();
  const { ready: authReady, user, authenticated } = useStudioAuth();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [game, setGame] = useState<any>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "This is your game — tell me what to change. Colors, speed, rules, enemies, scoring… anything.",
    },
  ]);
  const [wish, setWish] = useState("");
  const [building, setBuilding] = useState(false);
  const [buildStatus, setBuildStatus] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const [publishing, setPublishing] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [publishPoints, setPublishPoints] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"settings" | "code">("settings");
  // Mobile shows one panel at a time, switched by the bottom control bar
  // (Wish = agent chat, Preview = the game, gear = game settings). Desktop
  // shows all three columns and ignores this.
  const [mobilePanel, setMobilePanel] = useState<"preview" | "wish" | "settings">("preview");
  const [codeDraft, setCodeDraft] = useState("");
  const [replayKey, setReplayKey] = useState(0);
  const [lastError, setLastError] = useState<GameError | null>(null);
  const buildToken = useRef(0);

  // Load the game: created games first, then the backend by id.
  useEffect(() => {
    const local = createdGames.find((g: any) => g?.id === gameId);
    if (local?.refinement?.generatedCode) {
      setGame(local);
      return;
    }
    api
      .get(`/games/${encodeURIComponent(gameId)}/manage`)
      .then((res) => {
        const found = res.data?.game;
        if (found?.id === gameId) setGame(found);
        else if (local) setGame(local);
      })
      .catch(() => {
        if (local) setGame(local);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  // AI builds finish after the game record exists — poll until code is ready.
  useEffect(() => {
    if (!gameId || game?.refinement?.generatedCode) return;
    let cancelled = false;
    const loadManagedGame = () => {
      api
        .get(`/games/${encodeURIComponent(gameId)}/manage`)
        .then((res) => {
          if (cancelled) return;
          const found = res.data?.game;
          if (found?.id === gameId) setGame(found);
        })
        .catch(() => {});
    };
    loadManagedGame();
    const interval = setInterval(loadManagedGame, 12000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [gameId, game?.refinement?.generatedCode]);

  useEffect(() => {
    setCodeDraft(game?.refinement?.generatedCode ?? "");
  }, [game?.refinement?.generatedCode]);

  // Runtime errors from inside the sandboxed game.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const err = event.data?.__dogeGameError;
      if (err?.message && !String(err.message).includes("ResizeObserver")) {
        setLastError({
          message: String(err.message).slice(0, 300),
          stack: String(err.stack ?? "").slice(0, 600),
        });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const colors: string[] = useMemo(
    () =>
      Array.isArray(game?.visuals?.colors)
        ? game.visuals.colors.slice(0, 3)
        : ["#35e8ff", "#ff3df2", "#ffd166"],
    [game],
  );
  const tuning: Record<string, unknown> = game?.gameplay?.tuning ?? {};
  const numericTuning = Object.entries(tuning).filter(([, v]) => typeof v === "number") as [
    string,
    number,
  ][];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patchGame = useCallback((patch: (g: any) => any) => {
    setGame((prev: any) => (prev ? patch(structuredClone(prev)) : prev));
    setDirty(true);
    setLastError(null);
    setSaving("idle");
  }, []);

  const setColor = (index: number, value: string) =>
    patchGame((g) => {
      const next = Array.isArray(g.visuals?.colors)
        ? [...g.visuals.colors]
        : ["#35e8ff", "#ff3df2", "#ffd166"];
      next[index] = value;
      g.visuals = { ...(g.visuals ?? {}), colors: next };
      return g;
    });

  const setTuningValue = (key: string, value: number) =>
    patchGame((g) => {
      g.gameplay = {
        ...(g.gameplay ?? {}),
        tuning: { ...(g.gameplay?.tuning ?? {}), [key]: value },
      };
      return g;
    });

  const applyCodeDraft = () => {
    patchGame((g) => {
      g.refinement = { ...(g.refinement ?? {}), generatedCode: codeDraft, source: "manual-edit" };
      return g;
    });
    setReplayKey((k) => k + 1);
  };

  const save = async () => {
    if (!game) return false;
    setSaving("saving");
    try {
      await api.put(
        `/games/${encodeURIComponent(gameId)}`,
        { gamePackage: game },
        { timeout: 30000 },
      );
      setGame(game);
      addCreatedGame(game);
      setDirty(false);
      setSaving("saved");
      void refreshCreatedGames();
      return true;
    } catch {
      setSaving("idle");
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "Could not save — is the backend running?" },
      ]);
      return false;
    }
  };

  const publish = async () => {
    if (!game || publishing) return;
    setPublishing(true);
    setPublishError("");
    setPublishPoints(null);
    try {
      if (dirty && !(await save())) {
        throw new Error("Save the latest changes before publishing.");
      }
      const response = await publishGamePackage(gameId);
      const publishedGame = response.game ?? game;
      const awardedPoints = response.points?.awarded
        ? Number(response.points.cs ?? response.points.points ?? 0)
        : 0;
      setPublishPoints(awardedPoints > 0 ? awardedPoints : null);
      setGame(publishedGame);
      addCreatedGame(publishedGame);
      setPublishDialogOpen(true);
      void refreshCreatedGames();
    } catch (error: any) {
      setPublishError(
        error?.response?.data?.error ?? error?.message ?? "Could not publish this game.",
      );
      setPublishDialogOpen(true);
    } finally {
      setPublishing(false);
    }
  };

  const unpublish = async () => {
    if (!game || publishing) return;
    setPublishing(true);
    setPublishError("");
    try {
      const response = await unpublishGamePackage(gameId);
      const draftGame = response.game ?? game;
      setGame(draftGame);
      addCreatedGame(draftGame);
      setPublishDialogOpen(false);
      void refreshCreatedGames();
    } catch (error: any) {
      setPublishError(error?.response?.data?.error ?? "Could not unpublish this game.");
    } finally {
      setPublishing(false);
    }
  };

  // Runs one edit against /agents/code. Edits are free.
  const runEdit = async (request: string): Promise<"ok" | "empty" | "error"> => {
    const token = ++buildToken.current;
    setBuilding(true);
    setLastError(null);
    try {
      const refinement = await runCodeJob(
        {
          gamePackage: game,
          request,
          baseCode: game.refinement.generatedCode,
          refinementLevel: "medium",
        },
        // Generous: a failed seed-edit now triggers a full pure-agent rebuild,
        // so allow time for both passes before giving up.
        14 * 60 * 1000,
        (status) => setBuildStatus(status),
        () => buildToken.current !== token,
      );
      if (buildToken.current !== token) return "ok";
      if (refinement?.generatedCode) {
        patchGame((g) => {
          g.refinement = refinement;
          return g;
        });
        setReplayKey((k) => k + 1);
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            text:
              refinement.source === "seed-fallback"
                ? "I couldn't apply that change cleanly, so I kept your previous working build. Try describing it differently."
                : "Done — the change is live in the preview. Hit Save Changes to keep it. ✨",
          },
        ]);
        return "ok";
      }
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "The build came back empty — please try again." },
      ]);
      return "empty";
    } catch (error: any) {
      const message = error instanceof Error ? error.message : "unknown error";
      setMessages((m) => [
        ...m,
        { role: "assistant", text: `That change failed (${message}). Try again or rephrase.` },
      ]);
      return "error";
    } finally {
      if (buildToken.current === token) {
        setBuilding(false);
        setBuildStatus("");
      }
    }
  };

  const sendWish = async (text: string) => {
    const request = text.trim();
    if (!request || building || !game?.refinement?.generatedCode) return;
    setWish("");
    setMessages((m) => [...m, { role: "user", text: request }]);
    await runEdit(request);
  };

  const fixError = () => {
    if (!lastError) return;
    void sendWish(
      `Please fix this runtime error without changing the gameplay:\n\n${lastError.message}\n\nStack trace:\n${lastError.stack}`,
    );
  };

  if (!game) {
    // The manage endpoint needs a session; signed-out visitors would wait forever.
    if (authReady && !authenticated) {
      return (
        <div className="grid min-h-[calc(100dvh-10rem)] place-items-center px-4 py-10">
          <StudioSignInGate
            title="Sign in to edit this game"
            description="Only the creator can open a game in the editor."
          />
        </div>
      );
    }
    return <EditPageSkeleton />;
  }

  const hasBuild = Boolean(game.refinement?.generatedCode);
  const isLocalCreation = createdGames.some((g: any) => g?.id === gameId);
  // Wallet identity = user. Only the creator can change their game.
  const isOwner =
    authenticated &&
    (ownsGame(game.creatorId) ||
      (isLocalCreation && (!game.creatorId || game.creatorId === "anonymous")));
  const wishDisabledReason = !authenticated
    ? "Sign in to edit this game"
    : !isOwner
      ? "Only the creator can edit this game"
      : !hasBuild
        ? "Waiting for the AI build to finish…"
        : building
          ? "Applying your change…"
          : null;
  const isPublished = game.publish?.published === true;
  const publicUrl = buildPlayUrl(gameId);

  const copyPublicUrl = async () => {
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="flex h-[calc(100dvh-52px-64px-env(safe-area-inset-bottom))] flex-col lg:h-[calc(100dvh-52px)]">
      {/* Top bar */}
      <header className="flex flex-wrap items-center gap-2 border-b-2 border-line bg-ink-0 px-3 py-2 sm:gap-3 sm:px-4">
        <span className="font-mono text-[12px] font-bold text-phos">vim</span>
        <input
          value={game.title ?? ""}
          readOnly={!isOwner}
          onChange={(e) => isOwner && patchGame((g) => ({ ...g, title: e.target.value }))}
          aria-label="Game title"
          className="min-w-0 flex-1 border-2 border-transparent bg-transparent px-2 py-1 font-mono text-[14px] font-extrabold text-text outline-none focus:border-phos-3 sm:max-w-md"
        />
        <span className="flex items-center gap-1.5 font-mono text-[10px] font-extrabold uppercase tracking-[0.12em]">
          {!isOwner ? (
            <span className="text-text-3">[view only]</span>
          ) : saving === "saved" && !dirty ? (
            <span className="text-phos">[saved ✓]</span>
          ) : dirty ? (
            <span className="text-amber">[modified +]</span>
          ) : (
            <span className="text-text-3">[up to date]</span>
          )}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Btn
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: "/play", search: { gameId } })}
          >
            <PixelIcon name="play" size={10} /> Play
          </Btn>
          <Btn
            variant="magenta"
            size="sm"
            onClick={() => (isPublished ? setPublishDialogOpen(true) : void publish())}
            disabled={!isOwner || publishing}
          >
            {publishing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <PixelIcon name="send" size={10} />
            )}
            {isPublished ? "Published" : "Publish"}
          </Btn>
          <Btn
            variant="primary"
            size="sm"
            onClick={() => void save()}
            disabled={!isOwner || !dirty || saving === "saving"}
          >
            {saving === "saving" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <span className="font-mono">:w</span>
            )}
            Save
          </Btn>
        </div>
      </header>

      <div
        className={cn(
          "flex items-center justify-between gap-3 border-b-2 px-4 py-1.5 font-mono text-[11px]",
          isPublished
            ? "border-phos-3 bg-phos/10 text-phos"
            : "border-amber-2 bg-amber/10 text-amber",
        )}
      >
        <span className="min-w-0 truncate">
          {isPublished
            ? "● PUBLIC — anyone with the link can play this version."
            : "○ DRAFT — only you can access this game until it is published."}
        </span>
        {isPublished && (
          <button
            type="button"
            onClick={() => void copyPublicUrl()}
            className="shrink-0 font-bold hover:underline"
          >
            {copied ? "copied ✓" : "copy link"}
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 lg:grid lg:grid-cols-[250px_minmax(0,1fr)_250px] lg:gap-2 xl:grid-cols-[310px_minmax(0,1fr)_290px]">
        {/* Pane 1: agent chat */}
        <section
          className={cn(
            mobilePanel === "wish" ? "flex" : "hidden",
            "px-panel min-h-0 flex-1 flex-col lg:flex lg:flex-none",
          )}
          data-tone="phos"
        >
          <header className="px-titlebar">
            <span className="text-phos">[1]</span>
            <span className="flex-1">agent — wish it</span>
          </header>
          <div className="flex-1 space-y-2.5 overflow-y-auto p-3 font-mono text-[12px] leading-relaxed">
            {messages.map((message, index) => (
              <p key={index} className="whitespace-pre-wrap break-words">
                <span
                  className={cn("font-bold", message.role === "user" ? "text-cyan" : "text-phos")}
                >
                  {message.role === "user" ? "you $ " : "agent ▸ "}
                </span>
                <span className={message.role === "user" ? "text-text-2" : "text-text"}>
                  {message.text}
                </span>
              </p>
            ))}
            {building && (
              <p className="text-amber">
                <Spinner /> {buildStatus || "Applying your change…"}
              </p>
            )}
          </div>
          {lastError && !building && (
            <button
              type="button"
              onClick={fixError}
              className="mx-3 mb-2 flex items-center gap-2 border-2 border-danger/60 bg-danger/10 px-3 py-2 text-left font-mono text-[11px] text-danger transition hover:bg-danger/20"
            >
              <Bug className="size-4 shrink-0" />
              <span className="min-w-0 truncate">ERR: {lastError.message} — tap to fix</span>
            </button>
          )}
          <div className="flex gap-2 border-t-2 border-line p-2.5">
            <label className="flex min-w-0 flex-1 items-center gap-2 border-2 border-line-2 bg-ink-0 px-2.5 focus-within:border-phos">
              <span className="font-mono font-bold text-phos">$</span>
              <input
                value={wish}
                onChange={(e) => setWish(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void sendWish(wish);
                }}
                disabled={Boolean(wishDisabledReason)}
                placeholder={wishDisabledReason ?? "make enemies faster…"}
                aria-label="Describe a change"
                className="h-9 min-w-0 flex-1 bg-transparent font-mono text-[13px] text-text outline-none placeholder:text-text-3 disabled:cursor-not-allowed"
              />
            </label>
            <Btn
              variant="primary"
              size="icon"
              onClick={() => void sendWish(wish)}
              disabled={building || !wish.trim() || !isOwner}
              aria-label="Send change request"
            >
              <PixelIcon name="send" size={12} />
            </Btn>
          </div>
        </section>

        {/* Pane 2: live preview */}
        <section
          className={cn(
            mobilePanel === "preview" ? "flex" : "hidden",
            "px-panel min-h-0 flex-1 flex-col bg-black lg:flex lg:flex-none",
          )}
        >
          <header className="px-titlebar">
            <span className="text-phos">[2]</span>
            <span className="flex-1">preview</span>
            <span className="hidden text-text-3 sm:inline">
              {game.refinement?.source === "manual-edit"
                ? "manual edit"
                : (game.refinement?.source ?? "build")}
              {game.refinement?.model ? ` · ${game.refinement.model}` : ""}
            </span>
            <button
              type="button"
              onClick={() => setReplayKey((k) => k + 1)}
              className="hidden items-center gap-1 text-phos hover:underline lg:flex"
            >
              <RotateCcw className="size-3" /> replay
            </button>
          </header>
          <div className="relative flex-1">
            <div className="editor-game-frame absolute inset-0" key={replayKey}>
              <GamePreview gamePackage={game} />
            </div>
          </div>
        </section>

        {/* Pane 3: settings / code */}
        <section
          className={cn(
            mobilePanel === "settings" ? "flex" : "hidden",
            "px-panel min-h-0 flex-1 flex-col lg:flex lg:flex-none",
          )}
          data-tone="cyan"
        >
          <div role="tablist" aria-label="Editor tools" className="flex bg-[var(--panel-line)]">
            {(["settings", "code"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                type="button"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex-1 px-3 py-2 font-mono text-[10px] font-extrabold uppercase tracking-[0.14em] transition-colors",
                  tab === t ? "bg-ink-2 text-cyan" : "text-text-2 hover:text-text",
                )}
              >
                {t === "settings" ? "[3] settings" : "[4] code"}
              </button>
            ))}
          </div>

          {tab === "settings" ? (
            <div className="flex-1 space-y-5 overflow-y-auto p-3">
              <div>
                <p className="label-term mb-2 text-text-3">colors</p>
                <div className="space-y-2">
                  {["Primary", "Secondary", "Accent"].map((label, index) => {
                    const hex = /^#[0-9a-fA-F]{6}$/.test(colors[index] ?? "")
                      ? colors[index]
                      : "#35e8ff";
                    return (
                      <label
                        key={label}
                        className="flex items-center justify-between gap-3 font-mono text-[12px] text-text-2"
                      >
                        {label.toLowerCase()}
                        <span className="flex items-center gap-2">
                          <span className="text-[11px] text-text-3">{hex}</span>
                          <input
                            type="color"
                            value={hex}
                            onChange={(e) => setColor(index, e.target.value)}
                            disabled={!isOwner}
                            className="h-8 w-12 cursor-pointer border-2 border-line-2 bg-ink-0 p-0.5"
                          />
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {numericTuning.length > 0 && (
                <div>
                  <p className="label-term mb-2 text-text-3">gameplay tuning</p>
                  <div className="space-y-3">
                    {numericTuning.map(([key, value]) => (
                      <label key={key} className="block font-mono text-[12px] text-text-2">
                        <span className="mb-1 flex items-center justify-between">
                          {key}
                          <span className="font-term text-[20px] leading-none text-cyan">
                            {value}
                          </span>
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={Math.max(10, value * 2)}
                          step={value >= 100 ? 10 : value >= 10 ? 1 : 0.5}
                          value={value}
                          disabled={!isOwner}
                          onChange={(e) => setTuningValue(key, Number(e.target.value))}
                          className="w-full accent-[var(--cyan)]"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <p className="border-l-2 border-cyan-2 pl-2.5 text-[11px] leading-relaxed text-text-3">
                Settings apply to the preview instantly. For deeper changes — rules, enemies, levels
                — use the agent pane.
              </p>
            </div>
          ) : (
            <div className="flex flex-1 flex-col overflow-hidden p-2">
              <textarea
                value={codeDraft}
                onChange={(e) => setCodeDraft(e.target.value)}
                spellCheck={false}
                aria-label="Game source code"
                className="min-h-0 flex-1 resize-none border-2 border-line bg-ink-0 p-2.5 font-mono text-[11px] leading-relaxed text-text caret-cyan outline-none focus:border-cyan-2"
              />
              <Btn
                variant="cyan"
                size="sm"
                className="mt-2"
                onClick={applyCodeDraft}
                disabled={!isOwner || codeDraft === (game.refinement?.generatedCode ?? "")}
              >
                Apply code to preview
              </Btn>
            </div>
          )}
        </section>
      </div>

      {/* Phone pane switcher */}
      <div className="flex items-center gap-2 border-t-2 border-line bg-ink-0 px-3 py-2 lg:hidden">
        <Btn
          variant="ghost"
          size="icon"
          onClick={() => {
            setReplayKey((k) => k + 1);
            setMobilePanel("preview");
          }}
          aria-label="Replay game"
        >
          <RotateCcw className="size-4" />
        </Btn>
        <div
          role="tablist"
          aria-label="Editor panes"
          className="flex min-w-0 flex-1 border-2 border-line p-0.5"
        >
          {(
            [
              ["wish", "Agent"],
              ["preview", "Preview"],
              ["settings", "Settings"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={mobilePanel === id}
              onClick={() => {
                if (id === "settings") setTab("settings");
                setMobilePanel(id);
              }}
              className={cn(
                "flex-1 py-2 font-mono text-[11px] font-extrabold uppercase tracking-[0.1em]",
                mobilePanel === id ? "bg-phos text-ink-0" : "text-text-3",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogContent className="max-w-lg gap-0 p-0">
          <DialogTitle className="px-titlebar font-mono text-[10px] text-text">
            {publishError ? "publish — failed" : "publish — live"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Publish status and sharing options for this game.
          </DialogDescription>
          <div className="p-5">
            <h2
              className={cn(
                "font-pixel text-[14px] leading-snug",
                publishError ? "text-danger" : "text-phos glow-phos",
              )}
            >
              {publishError ? "NOT PUBLISHED" : "YOUR GAME IS LIVE"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-text-2">
              {publishError ||
                "Anyone with this URL can open the game and play the saved build without signing in."}
            </p>
            {!publishError && (
              <>
                {publishPoints != null && (
                  <Notice kind="ok" className="mt-4">
                    +{publishPoints} Creator Score. You are now on the New leaderboard.
                  </Notice>
                )}
                <div className="mt-4 flex gap-2">
                  <input
                    readOnly
                    value={publicUrl}
                    aria-label="Public game link"
                    className="px-input min-w-0 flex-1 py-2 text-xs"
                  />
                  <Btn variant="primary" onClick={() => void copyPublicUrl()}>
                    <Copy className="size-3.5" /> {copied ? "Copied" : "Copy"}
                  </Btn>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-btn"
                    data-variant="ghost"
                    data-size="sm"
                  >
                    <ExternalLink className="size-3.5" /> Open public page
                  </a>
                  <Btn
                    variant="danger"
                    size="sm"
                    onClick={() => void unpublish()}
                    disabled={publishing}
                  >
                    <Lock className="size-3.5" /> Unpublish
                  </Btn>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
