import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadTemplateModule } from "../lib/templates-loader";
import { api } from "../lib/api";
import { engineOf } from "../lib/studio-meta";
import { getCurrentUserId } from "@/lib/identity";
import { createNotification } from "@/lib/api/social";
import { withAppBase } from "@/lib/appBase";

const defaultPrompt = "cyberpunk doge samurai fighting AI robots in a neon arena";

// Posts a code-generation job and polls until it finishes. Long generations
// (up to ~15 min for pure-agent) cannot survive a single HTTP request through
// browsers and gateways, so the backend returns a jobId immediately and we
// poll /agents/jobs/:id for the result.
const PROGRESS_STAGE_LABELS: Record<string, string> = {
  "writing-code": "Writing game code",
  "editing-seed": "Customizing game code",
  repairing: "Repairing build",
  "fixing-syntax": "Fixing syntax",
  "fixing-runtime": "Testing & fixing the build",
};

// The only gate on a build is the free-games limit (403 GENERATION_LIMIT_REACHED).
function generationLimitMessage(error: any) {
  if (error?.response?.data?.code !== "GENERATION_LIMIT_REACHED") return null;
  return (
    String(error.response.data.error ?? "").trim() ||
    "You've used all your free games for this mode."
  );
}

function logGenerationRequest(
  phase: string,
  detail: Record<string, unknown>,
  error?: unknown,
) {
  const payload = {
    phase,
    at: new Date().toISOString(),
    ...detail,
    ...(error
      ? {
          error:
            error instanceof Error
              ? { name: error.name, message: error.message, code: (error as { code?: string }).code }
              : String(error),
          status: (error as { response?: { status?: number } })?.response?.status ?? null,
          serverError: (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? null,
        }
      : {}),
  };
  if (error) {
    console.warn("[generation]", payload);
  } else {
    console.info("[generation]", payload);
  }
}

// Polls an existing code job until it finishes. Separated from runCodeJob so a
// build can be resumed after a page refresh from just its persisted jobId.
const JOB_POLL_TIMEOUT_MS = 60_000;
const JOB_POLL_INTERVAL_MS = 5000;
const JOB_POLL_MAX_CONSECUTIVE_FAILURES = 8;

export async function pollCodeJob(
  jobId: string,
  startedAt: number,
  maxWaitMs: number,
  onProgress?: (statusText: string, stage?: string) => void,
  isCancelled?: () => boolean,
) {
  let consecutivePollFailures = 0;
  while (Date.now() - startedAt < maxWaitMs) {
    await new Promise((resolve) => setTimeout(resolve, JOB_POLL_INTERVAL_MS));
    if (isCancelled?.()) return null;
    let job: any;
    try {
      const poll = await api.get(`/agents/jobs/${jobId}`, { timeout: JOB_POLL_TIMEOUT_MS });
      consecutivePollFailures = 0;
      job = poll.data;
    } catch (error: any) {
      // A slow API or brief network blip should not abort a still-running backend job.
      consecutivePollFailures += 1;
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      onProgress?.(
        `Waiting for build status… (${elapsed}s · retry ${consecutivePollFailures}/${JOB_POLL_MAX_CONSECUTIVE_FAILURES})`,
      );
      if (consecutivePollFailures < JOB_POLL_MAX_CONSECUTIVE_FAILURES) continue;
      throw error;
    }
    if (job?.status === "complete") return job.result?.refinement ?? job.result;
    if (job?.status === "failed") {
      throw new Error(job.error?.message ?? "Code generation job failed");
    }
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    // The backend streams the model output and reports how much code exists so
    // far — much more informative than a bare elapsed-seconds counter.
    const progress = job?.progress;
    const stage = PROGRESS_STAGE_LABELS[progress?.stage] ?? "AI build in progress";
    const chars = progress?.chars ? ` · ${Number(progress.chars).toLocaleString()} chars` : "";
    onProgress?.(`${stage}…${chars} (${elapsed}s)`, progress?.stage);
  }
  return null;
}

export async function runCodeJob(
  body: Record<string, unknown>,
  maxWaitMs: number,
  onProgress?: (statusText: string, stage?: string) => void,
  isCancelled?: () => boolean,
  onJobId?: (jobId: string) => void,
) {
  const response = await api.post("/agents/code", body, { timeout: 900000 });
  const jobId = response.data?.jobId;
  if (!jobId) throw new Error("No jobId returned for code generation");
  onJobId?.(jobId);
  return pollCodeJob(jobId, Date.now(), maxWaitMs, onProgress, isCancelled);
}

// --- Persistent build state -------------------------------------------------
// The active generation is recorded in localStorage so it survives both
// navigation and a full page refresh. The backend job keeps running either
// way (jobs are mirrored in Mongo); on reload we resume polling by jobId.
const ACTIVE_BUILD_KEY = "dogegame-active-build";
const BUILD_NOTIFICATION_PREFIX = "dogegame-build-notified";

/** Build tier: 1 = Fast, 3 = Premium. */
export type Tier = 1 | 3;

export type ActiveBuild = {
  tier: Tier;
  strategy: "hybrid" | "pure-agent";
  prompt: string;
  startedAt: number;
  maxWaitMs: number;
  phase: "building" | "done" | "failed";
  jobId?: string;
  statusText?: string;
  /** Raw backend progress stage (e.g. "writing-code", "repairing") — drives the build-console step list. */
  progressStage?: string;
  game?: { id?: string; templateId?: string; title?: string } | null;
};

function readActiveBuild(): ActiveBuild | null {
  try {
    const raw = localStorage.getItem(ACTIVE_BUILD_KEY);
    if (!raw) return null;
    const build = JSON.parse(raw) as ActiveBuild;
    // Remove records created by the old refresh handler. Commenting out that
    // handler does not remove the already-persisted failure from localStorage.
    if (build?.statusText?.startsWith("Build was interrupted before the job started")) {
      localStorage.removeItem(ACTIVE_BUILD_KEY);
      return null;
    }
    // A "building" record older than its own deadline can never finish.
    if (build?.phase === "building" && Date.now() - build.startedAt > build.maxWaitMs + 60_000) {
      localStorage.removeItem(ACTIVE_BUILD_KEY);
      return null;
    }
    return build;
  } catch {
    return null;
  }
}

function notifyBuildReadyOnce(game: any, jobId?: string) {
  const userId = getCurrentUserId();
  const gameId = game?.id ?? game?.templateId ?? null;
  const dedupeKey = `${BUILD_NOTIFICATION_PREFIX}-${jobId ?? gameId ?? "unknown"}`;
  if (localStorage.getItem(dedupeKey)) return;
  localStorage.setItem(dedupeKey, "1");
  void createNotification({
    userId,
    type: "build_ready",
    title: "Your AI build is ready",
    body: `"${game?.title ?? "Your game"}" finished building and is ready to play.`,
    gameId,
    actorId: userId,
    metadata: { jobId },
  }).catch(() => {
    localStorage.removeItem(dedupeKey);
  });
}

function templateForPrompt(prompt: string, gameTemplates: any[]) {
  const text = prompt.toLowerCase();
  const match = (ids: string[], terms: string[]) =>
    terms.some((term: string) => text.includes(term))
      ? gameTemplates.find((template: any) => ids.includes(template.id))
      : null;

  return (
    match(
      ["offline-fruitninja"],
      [
        "fruit ninja",
        "fruitninja",
        "fruit slice",
        "fruit slicing",
        "slice fruit",
        "slicing",
        "slash fruit",
        "blade fruit",
      ],
    ) ||
    match(["chess"], ["chess", "checkmate", "chessboard", "grandmaster"]) ||
    match(["head-soccer-2026"], ["soccer", "football", "world cup", "sports"]) ||
    match(["goof-runner"], ["endless runner", "runner", "run", "jump", "parkour"]) ||
    match(["mini-racer"], ["racing", "racer", "race", "car", "cars", "driving", "traffic"]) ||
    match(["bubble-shooter"], ["bubble", "shooter", "aim"]) ||
    match(["blocks-match3"], ["match 3", "match-3", "match three", "blocks", "jewel", "candy"]) ||
    gameTemplates.find(
      (template) =>
        template.category?.toLowerCase() && text.includes(template.category.toLowerCase()),
    ) ||
    gameTemplates.find((template) => text.includes(template.name.toLowerCase())) ||
    null
  );
}

function titleFromPrompt(prompt: string) {
  const markdownTitle = prompt.match(/^##\s*Title\s*\n\s*\*\*([^*\n]+)\*\*/i)?.[1]?.trim();
  if (markdownTitle) return markdownTitle;
  const text = prompt.toLowerCase();
  if (/(fruit\s*ninja|fruitninja|fruit\s*slice|slice\s*fruit|slicing)/.test(text)) {
    return "Fruit Ninja Game";
  }
  const cleaned = prompt
    .replace(/\b(generate|create|make|build|a|an|the|game|please|with|using)\b/gi, " ")
    .replace(/[^a-z0-9\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = (cleaned || "Custom AI Game").split(" ").slice(0, 5);
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function recentCreationContext() {
  try {
    const games = JSON.parse(localStorage.getItem("dogegame-created-games") ?? "[]");
    return games.slice(0, 12).map((game: any) => ({
      id: game.id,
      title: game.title,
      templateId: game.templateId,
      category: game.category,
      thumbnailUrl: game.thumbnailUrl,
      createdAt: game.createdAt,
    }));
  } catch {
    return [];
  }
}

const DEFAULT_DIFFICULTY = {
  easy: { speedMultiplier: 0.85 },
  normal: { speedMultiplier: 1 },
  hard: { speedMultiplier: 1.15 },
};

const DEFAULT_THEME = {
  label: "Neon",
  mood: "arcade",
  colors: ["#a855f7", "#22d3ee"],
};

export function localPackage(template: any, options: any, themePresets: any) {
  if (!template?.id) {
    throw new Error("Template is unavailable");
  }
  const presets =
    themePresets && typeof themePresets === "object" ? themePresets : ({} as Record<string, unknown>);
  const theme =
    presets[options?.theme as keyof typeof presets] ??
    presets.neon ??
    DEFAULT_THEME;
  const difficultyTable =
    template?.difficulty && typeof template.difficulty === "object"
      ? template.difficulty
      : DEFAULT_DIFFICULTY;
  const difficultyKey = options?.difficulty ?? "normal";
  const tuning =
    difficultyTable[difficultyKey] ??
    difficultyTable.normal ??
    DEFAULT_DIFFICULTY.normal;
  const slug = `${template.id}-${options?.theme ?? "neon"}-${Date.now().toString(36)}`;

  return {
    id: slug,
    tier: "template",
    title: `${theme.label} ${template.name}`,
    templateId: template.id,
    templateName: template.name,
    category: template.category,
    createdIn: template.time,
    apiCost: 0,
    reliability: template.reliability,
    customization: {
      prompt: options.prompt,
      theme: theme.label,
      level: options.customization,
      difficulty: options.difficulty,
      extra: options.extra,
    },
    gameplay: {
      mechanic: template.mechanic,
      controls: template.controls,
      tuning,
    },
    visuals: {
      mood: theme.mood,
      colors: theme.colors,
      assets: template.assets,
    },
    build: {
      renderer:
        template.engine === "construct"
          ? "Embedded HTML5 Construct runtime"
          : "Playable Canvas runtime",
      runtimeTarget: "Browser",
      externalAssets: template.engine === "construct",
      publishReady: true,
    },
    checklist: [
      "Deterministic template selected",
      "Difficulty tuning applied",
      "Theme colors injected",
      "Canvas-safe asset plan generated",
      "Optional AI refinement available",
    ],
  };
}

function localTemplateExport(gameTemplates: any[], themePresets: any) {
  return {
    name: "dogegame-template-pack",
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    strategy: {
      tier1: "Templates are primary: instant, deterministic, zero API cost.",
      tier2: "LLM refinement is optional and prompt-driven.",
    },
    themes: themePresets,
    templates: gameTemplates.map((template) => ({
      ...template,
      assets: [
        {
          id: `${template.id}-procedural-assets`,
          type: "procedural",
          format: "canvas",
          description: template.assets,
        },
      ],
      aiRefinement: {
        system:
          "You are an expert Phaser 3 game developer. Output only executable JavaScript. Use Canvas-drawn assets. No markdown.",
        userTemplate: `Game: ${template.name}\nMechanic: ${template.mechanic}\nControls: ${template.controls}`,
      },
    })),
    usage: {
      exportNote:
        "Assets are procedural Canvas manifests. The game runtime draws them instead of shipping image files.",
    },
  };
}

export function useCreatorStudio() {
  const generationRef = useRef(0);
  const [templatesModule, setTemplatesModule] = useState<Awaited<
    ReturnType<typeof loadTemplateModule>
  > | null>(null);
  const gameTemplates = templatesModule?.gameTemplates ?? [];
  const themePresets = templatesModule?.themePresets ?? {
    neon: { label: "Neon", mood: "", colors: [] },
  };
  const templatesReady = templatesModule !== null;

  useEffect(() => {
    void loadTemplateModule().then(setTemplatesModule);
  }, []);
  // While a prompt generation programmatically changes engine/selection, the
  // StudioContext "sync package to selection" effect must not run — it would
  // overwrite the AI-designed package with a plain template package.
  const templateSyncPausedUntil = useRef(0);
  const pauseTemplateSync = useCallback((ms = 8000) => {
    templateSyncPausedUntil.current = Date.now() + ms;
  }, []);
  const isTemplateSyncPaused = useCallback(() => Date.now() < templateSyncPausedUntil.current, []);
  const [engine, setEngine] = useState("threejs");
  const [selectedId, setSelectedId] = useState("flappy");
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [theme, setTheme] = useState("neon");
  const [difficulty, setDifficulty] = useState("normal");
  const [customization, setCustomization] = useState("light");
  const [extra, setExtra] = useState("none");
  const [status, setStatus] = useState("Ready");
  const [packageMode, setPackageMode] = useState("Tier 1");
  const [agentStack, setAgentStack] = useState<any>(null);
  const [agentStatus, setAgentStatus] = useState("Agents idle");
  const [orchestrationPlan, setOrchestrationPlan] = useState<any>(null);
  const [assetResult, setAssetResult] = useState<any>(null);
  const [generatedPackage, setGeneratedPackage] = useState<any>(() => ({
    id: "boot",
    tier: "template",
    title: "Creator Studio",
    templateId: "flappy",
    category: "Arcade",
    gameplay: { mechanic: "", controls: "" },
    visuals: { mood: "", colors: [], assets: "" },
  }));

  useEffect(() => {
    if (!templatesModule) return;
    setGeneratedPackage(
      localPackage(
        templatesModule.gameTemplates[0],
        {
          prompt: defaultPrompt,
          theme: "neon",
          difficulty: "normal",
          customization: "light",
          extra: "none",
        },
        templatesModule.themePresets,
      ),
    );
  }, [templatesModule]);
  const [activeBuild, setActiveBuild] = useState<ActiveBuild | null>(() => readActiveBuild());

  const updateActiveBuild = useCallback((patch: Partial<ActiveBuild> | null) => {
    setActiveBuild((prev) => {
      const next = patch === null ? null : ({ ...(prev as ActiveBuild), ...patch } as ActiveBuild);
      try {
        if (next === null) localStorage.removeItem(ACTIVE_BUILD_KEY);
        else localStorage.setItem(ACTIVE_BUILD_KEY, JSON.stringify(next));
      } catch {
        // localStorage full/unavailable — in-memory state still works for this session.
      }
      return next;
    });
  }, []);

  // Cancels the in-progress build (stops polling) or dismisses a finished one.
  const cancelActiveBuild = useCallback(() => {
    generationRef.current += 1; // invalidates every active polling loop
    if (activeBuild?.phase === "building") setAgentStatus("Build cancelled");
    updateActiveBuild(null);
  }, [activeBuild, updateActiveBuild]);

  // Resume polling after a page refresh: the backend job kept running, we just
  // lost the in-memory poller. Done/failed records simply render as-is.
  useEffect(() => {
    const build = readActiveBuild();
    if (!build || build.phase !== "building") return;
    if (!build.jobId) {
      // A refresh can happen between creating the optimistic client record and
      // receiving a backend job id. There is no job to resume, so dismiss the
      // incomplete record instead of leaving a permanent build/error console.
      updateActiveBuild(null);
      return;
    }
    const token = ++generationRef.current;
    setStatus("Generating from prompt");
    setPackageMode(build.strategy === "pure-agent" ? "Pure Agent" : "Prompt");
    setAgentStatus(build.statusText ?? "Resuming build…");
    void (async () => {
      try {
        const refinement = await pollCodeJob(
          build.jobId!,
          build.startedAt,
          build.maxWaitMs,
          (statusText, stage) => {
            setAgentStatus(statusText);
            updateActiveBuild({ statusText, ...(stage ? { progressStage: stage } : {}) });
          },
          () => generationRef.current !== token,
        );
        if (generationRef.current !== token) return;
        if (refinement?.generatedCode) {
          setGeneratedPackage((prev: any) => ({
            ...(prev ?? {}),
            ...(build.game ?? {}),
            tier: "ai-refinement",
            refinement,
          }));
          setPackageMode("Prompt + Agents");
          setStatus("Game generated with code");
          setAgentStatus(`AI build ready · ${refinement.source ?? refinement.model ?? "agent"}`);
          notifyBuildReadyOnce(build.game, build.jobId);
          updateActiveBuild({ phase: "done", statusText: "AI build ready" });
        } else {
          updateActiveBuild({
            phase: "done",
            statusText: "AI build returned no code — the playable template version was saved.",
          });
        }
      } catch (error: any) {
        if (generationRef.current !== token) return;
        const message = error?.response?.data?.error ?? error?.message ?? "AI build failed";
        setAgentStatus(`AI build failed: ${message}`);
        updateActiveBuild({ phase: "failed", statusText: message });
      }
    })();
    // Run once on mount: this recovers the poller that the refresh destroyed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAgentStack() {
      try {
        const response = await api.get("/agents/stack");
        if (!cancelled) setAgentStack(response.data);
      } catch {
        if (!cancelled) {
          setAgentStack({
            provider: "0g",
            hasApiKey: false,
            models: {
              orchestrator: "glm-5.1",
              coding: "deepseek-v4-pro",
              background: "deepseek-v4-flash",
              image: "z-image",
              vision: "qwen/qwen3-vl-30b-a3b-instruct",
              speech: "openai/whisper-large-v3",
            },
          });
        }
      }
    }

    loadAgentStack();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredTemplates = useMemo(
    () =>
      gameTemplates
        .map((t) => ({ ...t, engine: t.engine ?? "threejs" }))
        .filter((t) => t.engine === engine),
    [engine],
  );

  useEffect(() => {
    if (filteredTemplates.length > 0 && !filteredTemplates.some((t) => t.id === selectedId)) {
      setSelectedId(filteredTemplates[0].id);
    }
  }, [engine, filteredTemplates, selectedId]);

  const selectedTemplate = useMemo(
    () =>
      filteredTemplates.find((template) => template.id === selectedId) ??
      filteredTemplates[0] ??
      gameTemplates[0],
    [selectedId, filteredTemplates],
  );

  const options = useMemo(
    () => ({ prompt, theme, difficulty, customization, extra }),
    [prompt, theme, difficulty, customization, extra],
  );

  // Keeps the generated package in sync with the selected template. Built
  // locally on purpose: this runs ambiently on mount/selection change, and
  // hitting POST /games/create here used to persist a junk draft and log a
  // fake "Created game" activity on every page load. Real backend packages
  // are only created by actual builds (generateFromPrompt).
  const createFromTemplate = useCallback(() => {
    if (!selectedTemplate) return;
    setPackageMode("Tier 1");
    setGeneratedPackage(localPackage(selectedTemplate, options, themePresets));
    setStatus("Generated");
  }, [options, selectedTemplate, themePresets]);

  const generateFromPrompt = useCallback(
    async (tier: Tier = 1, promptOverride = "") => {
      // The tier owns the strategy: Fast (1) = hybrid (edit a seed), Premium (3) =
      // pure-agent (write from scratch). The backend enforces the same mapping;
      // this local copy only drives client-side pacing and fallbacks.
      const strategy: "hybrid" | "pure-agent" = tier === 1 ? "hybrid" : "pure-agent";
      const effectivePrompt = promptOverride || prompt;
      const effectiveOptions = { ...options, prompt: effectivePrompt };
      const token = ++generationRef.current;
      // Pure-agent writes a game from scratch (slow); hybrid edits a working seed.
      const maxWaitMs = strategy === "pure-agent" ? 16 * 60 * 1000 : 8 * 60 * 1000;
      updateActiveBuild({
        tier,
        strategy,
        prompt: effectivePrompt,
        startedAt: Date.now(),
        maxWaitMs,
        phase: "building",
        jobId: undefined,
        statusText: "Starting build…",
        game: null,
      });
      setStatus("Generating from prompt");
      setPackageMode(strategy === "pure-agent" ? "Pure Agent" : "Prompt");
      setAgentStatus(`Routing ${strategy === "pure-agent" ? "pure agent" : "hybrid"} request…`);
      setOrchestrationPlan(null);
      setAssetResult(null);
      try {
        await api.get("/games/generation-access", { timeout: 60_000, params: { tier } });
      } catch (error: any) {
        const limitMessage = generationLimitMessage(error);
        if (limitMessage) {
          setStatus("Free games used");
          setAgentStatus(limitMessage);
          // Hitting the limit is not a failed build — keep the console clean.
          updateActiveBuild(null);
        }
        throw error;
      }
      // A confident keyword match (e.g. "chess", "racing") — null for vague prompts.
      const localMatch = templateForPrompt(effectivePrompt, gameTemplates);
      const promptTemplate = localMatch ?? selectedTemplate;
      if (!promptTemplate?.id) {
        const message = "Game templates are still loading. Refresh the page and try again.";
        setStatus("Build failed");
        setAgentStatus(message);
        updateActiveBuild({
          phase: "failed",
          statusText: message,
          game: null,
        });
        throw new Error(message);
      }
      // Lock the matched template for hybrid so the routing agent can't drift to a different
      // game. Pure-agent always goes to the backend (it designs from scratch, no template).
      const lockTemplate = strategy !== "pure-agent" && Boolean(localMatch);

      // Phase 0 (instant): show a playable local build immediately so the preview is never blank.
      pauseTemplateSync();
      setEngine(engineOf(promptTemplate));
      setSelectedId(promptTemplate.id);
      const playableFallbackGame = localPackage(promptTemplate, effectiveOptions, themePresets);
      const localGame = { ...playableFallbackGame };
      if (strategy === "pure-agent") {
        localGame.title = titleFromPrompt(effectivePrompt);
        localGame.templateId = "pure-agent";
        localGame.templateName = "Pure AI Agent Game";
        localGame.tier = "prompt-agent";
        localGame.category = localMatch?.category ?? "Arcade";
        localGame.gameplay = {
          ...(localGame.gameplay ?? {}),
          mechanic: /fruit\s*ninja|fruitninja|fruit\s*slice|slice\s*fruit|slicing/i.test(
            effectivePrompt,
          )
            ? "Swipe or drag to slice flying fruit, build combo streaks, and avoid bombs."
            : localGame.gameplay?.mechanic,
          controls: /fruit\s*ninja|fruitninja|fruit\s*slice|slice\s*fruit|slicing/i.test(
            effectivePrompt,
          )
            ? "Touch or mouse drag to slice"
            : localGame.gameplay?.controls,
        };
      }
      setGeneratedPackage(localGame);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let baseGame: any = localGame;

      if (lockTemplate) {
        // Clear intent — keep the matched template, skip the ~23s routing call entirely.
        setPackageMode("Prompt");
        setStatus("Playable template ready");
        setAgentStatus(`Matched “${promptTemplate.name}” — generating AI build in the background…`);
      } else {
        // Phase 1 (fast): vague prompt — let the backend routing agent pick the closest template.
        // No code/assets/plan, so it returns well under the ~100s gateway timeout.
        try {
          logGenerationRequest("routing.start", {
            strategy,
            tier,
            timeoutMs: 120_000,
            promptLength: effectivePrompt.length,
          });
          const response = await api.post(
            "/games/generate-from-prompt",
            {
              prompt: effectivePrompt,
              userId: getCurrentUserId(),
              context: {
                preferredTemplateId: promptTemplate.id,
                recentCreations: recentCreationContext(),
                requestedStrategy: strategy,
              },
              theme,
              difficulty,
              customization,
              extra,
              includePlan: false,
              includeCode: false,
              includeAssets: false,
              strategy,
              tier,
            },
            { timeout: 120_000 },
          );
          logGenerationRequest("routing.done", {
            requestId: response.data?.requestId ?? null,
            gameId: response.data?.game?.id ?? null,
            templateId: response.data?.game?.templateId ?? null,
            warnings: response.data?.warnings ?? [],
          });
          const result = response.data;
          baseGame = {
            ...result.game,
            thumbnailUrl: result.game?.thumbnailUrl ?? withAppBase("/thumbnails/simple-agent-game-cover.png"),
          };
          // Only move the studio selection when the backend picked a real
          // template. Pure-agent games have templateId "pure-agent", which is
          // not in the template list — selecting it used to bounce the
          // selection back to the default template and wipe the AI package.
          const template = gameTemplates.find((t) => t.id === baseGame?.templateId);
          if (template) {
            pauseTemplateSync();
            setEngine(engineOf(template));
            setSelectedId(template.id);
          }
          setGeneratedPackage(baseGame);
          setPackageMode(strategy === "pure-agent" ? "Pure Agent" : "Prompt");
          setStatus(strategy === "pure-agent" ? "AI design ready" : "Playable template ready");
          setAgentStatus(
            strategy === "pure-agent"
              ? "Custom game designed — generating AI build in the background…"
              : "Template ready — generating AI build in the background…",
          );
        } catch (error: any) {
          const limitMessage = generationLimitMessage(error);
          if (limitMessage) {
            logGenerationRequest("routing.limit-reached", { strategy, tier }, error);
            setStatus("Free games used");
            setAgentStatus(limitMessage);
            updateActiveBuild(null);
            throw error;
          }
          logGenerationRequest(
            "routing.failed",
            {
              strategy,
              tier,
              timedOut: error?.code === "ECONNABORTED",
              axiosMessage: error?.message ?? null,
            },
            error,
          );
          // Routing failed (offline/timeout) — keep the instant local build, still playable.
          baseGame = localGame;
          setStatus("Generated locally");
          setAgentStatus(
            error.response?.data?.error ?? "Prompt pipeline unreachable — showing local template",
          );
        }
      }

      // The playable base game is known — record it so the create page can show
      // and link the build even after navigation or a refresh.
      if (generationRef.current === token) {
        updateActiveBuild({
          game: {
            id: baseGame?.id,
            templateId: baseGame?.templateId,
            title:
              strategy === "pure-agent"
                ? baseGame?.title || titleFromPrompt(effectivePrompt)
                : baseGame?.title,
          },
        });
      }

      // Phase 2 (background): ask the coding agent for the real build and swap it in
      // when ready. The backend returns a jobId immediately and we poll for the result,
      // so generation can take 10-15 minutes without any HTTP timeout killing it.
      // If it is slow or fails, the playable template stays in place.
      void (async () => {
        let codeJobId: string | undefined;
        try {
          logGenerationRequest("code-job.start", {
            strategy,
            tier,
            gameId: baseGame?.id ?? null,
            maxWaitMs,
          });
          const refinement = await runCodeJob(
            {
              gamePackage: baseGame,
              request: effectivePrompt,
              refinementLevel: customization,
              strategy,
              tier,
            },
            maxWaitMs,
            (statusText, stage) => {
              if (generationRef.current !== token) return;
              setAgentStatus(statusText);
              updateActiveBuild({ statusText, ...(stage ? { progressStage: stage } : {}) });
            },
            () => generationRef.current !== token,
            (jobId) => {
              codeJobId = jobId;
              if (generationRef.current === token) updateActiveBuild({ jobId });
            },
          );

          if (generationRef.current !== token) return; // superseded by a newer generation
          logGenerationRequest("code-job.done", {
            strategy,
            tier,
            hasCode: Boolean(refinement?.generatedCode),
            source: refinement?.source ?? refinement?.model ?? null,
          });
          if (refinement?.generatedCode) {
            setGeneratedPackage((prev: any) => ({
              ...(prev ?? baseGame),
              tier: "ai-refinement",
              refinement,
              ...(refinement.gameplayAssets
                ? { gameplayAssets: refinement.gameplayAssets }
                : {}),
            }));
            setPackageMode("Prompt + Agents");
            setStatus("Game generated with code");
            setAgentStatus(`AI build ready · ${refinement.source ?? refinement.model ?? "agent"}`);
            notifyBuildReadyOnce(baseGame, codeJobId);
            updateActiveBuild({ phase: "done", statusText: "AI build ready" });
          } else {
            const fallback = strategy === "pure-agent" ? playableFallbackGame : baseGame;
            if (strategy === "pure-agent") {
              setGeneratedPackage(fallback);
              if (baseGame?.id) {
                void api.delete(`/games/${encodeURIComponent(baseGame.id)}`).catch(() => {});
              }
            }
            setAgentStatus("AI build returned no code — showing the closest playable template");
            updateActiveBuild({
              phase: strategy === "pure-agent" ? "failed" : "done",
              statusText:
                strategy === "pure-agent"
                  ? "AI build returned no playable code. The incomplete game was removed."
                  : "AI build returned no code — the playable Fast template was saved.",
              game: { id: fallback?.id, templateId: fallback?.templateId, title: fallback?.title },
            });
          }
        } catch (error: any) {
          if (generationRef.current !== token) return;
          logGenerationRequest(
            "code-job.failed",
            {
              strategy,
              tier,
              gameId: baseGame?.id ?? null,
              timedOut: error?.code === "ECONNABORTED",
            },
            error,
          );
          // Surface the real failure (e.g. "interrupted by a server restart",
          // "insufficient balance") instead of calling everything a timeout.
          const detail =
            generationLimitMessage(error) ?? error.response?.data?.error ?? error?.message;
          const fallback = strategy === "pure-agent" ? playableFallbackGame : baseGame;
          if (strategy === "pure-agent") {
            setGeneratedPackage(fallback);
            setPackageMode("Prompt");
            if (baseGame?.id) {
              void api.delete(`/games/${encodeURIComponent(baseGame.id)}`).catch(() => {});
            }
          }
          const message =
            error?.code === "ECONNABORTED"
              ? "Lost contact with the build server — showing closest playable template"
              : detail
                ? `AI build failed: ${detail} — showing closest playable template`
                : "AI build timed out — showing closest playable template";
          setAgentStatus(message);
          updateActiveBuild({
            phase: "failed",
            statusText: message,
            game: { id: fallback?.id, templateId: fallback?.templateId, title: fallback?.title },
          });
        }
      })();

      return baseGame;
    },
    [customization, difficulty, extra, options, prompt, selectedTemplate, theme, updateActiveBuild],
  );

  const refineWithAi = useCallback(async () => {
    setStatus("Preparing AI");
    setPackageMode("AI build");
    try {
      const refinement = await runCodeJob(
        {
          gamePackage: generatedPackage,
          request: prompt,
          refinementLevel: customization,
        },
        8 * 60 * 1000,
        (statusText) => setAgentStatus(statusText),
      );
      setGeneratedPackage((prev: any) => ({
        ...prev,
        tier: "ai-refinement",
        refinement,
      }));
      setAgentStatus(`Code agent: ${refinement?.model ?? "deepseek-v4-pro"}`);
      setStatus(refinement?.generatedCode ? "AI code generated" : "AI prompt ready");
    } catch (error: any) {
      setGeneratedPackage((prev: any) => ({
        ...prev,
        tier: "ai-refinement",
        refinement: {
          error: error.response?.data?.error ?? "AI refinement failed",
          promptBundle: {
            system: "The AI build could not reach the configured 0G agent.",
            user: `Refine ${prev.title}. User request: ${prompt}`,
          },
        },
      }));
      setAgentStatus("Code agent unavailable");
      setStatus("AI setup needed");
    }
  }, [customization, generatedPackage, prompt]);

  const orchestrateBuild = useCallback(async () => {
    setAgentStatus("Planning with orchestrator");
    try {
      const response = await api.post(
        "/agents/orchestrate",
        {
          prompt,
          context: {
            template: selectedTemplate,
            options,
            gamePackage: generatedPackage,
          },
        },
        { timeout: 60000 },
      );
      setOrchestrationPlan(response.data.result);
      setAgentStatus(`Orchestrator: ${response.data.result?.model ?? "glm-5.1"}`);
    } catch (error: any) {
      setOrchestrationPlan({
        error: error.response?.data?.error ?? "Orchestrator unavailable",
        content: "Use the selected template and local deterministic package.",
      });
      setAgentStatus("Orchestrator unavailable");
    }
  }, [generatedPackage, options, prompt, selectedTemplate]);

  const generateAssets = useCallback(async () => {
    setAgentStatus("Generating image assets");
    try {
      const response = await api.post(
        "/agents/assets",
        {
          prompt: [
            `${generatedPackage.title} game thumbnail`,
            generatedPackage.gameplay?.mechanic,
            generatedPackage.visuals?.mood,
            "polished colorful game cover art, no text",
          ]
            .filter(Boolean)
            .join(", "),
        },
        { timeout: 60000 },
      );
      setAssetResult(response.data.result);
      setAgentStatus(`Image agent: ${response.data.result?.model ?? "z-image"}`);
    } catch (error: any) {
      setAssetResult({
        error: error.response?.data?.error ?? "Asset generation unavailable",
      });
      setAgentStatus("Image agent unavailable");
    }
  }, [generatedPackage]);

  const getTemplateExport = useCallback(async () => {
    try {
      const response = await api.get("/templates/export");
      return response.data;
    } catch {
      return localTemplateExport(gameTemplates, themePresets);
    }
  }, [gameTemplates, themePresets]);

  return {
    templates: filteredTemplates,
    engine,
    setEngine,
    themePresets,
    selectedTemplate,
    selectedId,
    setSelectedId,
    isTemplateSyncPaused,
    prompt,
    setPrompt,
    theme,
    setTheme,
    difficulty,
    setDifficulty,
    customization,
    setCustomization,
    extra,
    setExtra,
    status,
    agentStack,
    agentStatus,
    orchestrationPlan,
    assetResult,
    packageMode,
    generatedPackage,
    activeBuild,
    cancelActiveBuild,
    createFromTemplate,
    generateFromPrompt,
    refineWithAi,
    orchestrateBuild,
    generateAssets,
    getTemplateExport,
    templatesReady,
  };
}
