import { useEffect, useRef } from "react";
import type { ChatMessage, ChatStage } from "@/lib/createChatFlow";
import { createIdeaSeeds } from "@/lib/createChatFlow";
import { ConsoleChatMessages } from "@/components/studio/ConsoleChatMessages";
import { CreateConsolePanel } from "@/components/studio/CreateConsolePanel";
import { DogeOSBadge } from "@/components/dogeos/DogeOSBadge";
import { PixelSprite } from "@/components/term/PixelSprite";
import { DogeIcon } from "@/components/dogeos/DogeBrand";
import { LineGamepad, LineRobot, LineRocket, LineTerminal } from "@/components/art/LineIcons";
import { useTypewriter } from "@/components/term/TypeText";
import { cn } from "@/lib/utils";

// How a game gets made: four stations on one conveyor, each with its own colour.
const PIPELINE = [
  {
    step: "01",
    label: "Describe",
    note: "one line is enough",
    Icon: LineTerminal,
    color: "var(--phos)",
  },
  {
    step: "02",
    label: "AI builds",
    note: "agents write the code",
    Icon: LineRobot,
    color: "var(--cyan)",
  },
  {
    step: "03",
    label: "Playtest",
    note: "auto-tested & repaired",
    Icon: LineGamepad,
    color: "var(--magenta)",
  },
  {
    step: "04",
    label: "Publish",
    note: "share a playable link",
    Icon: LineRocket,
    color: "var(--amber)",
  },
];

const STAGES: { id: ChatStage; label: string }[] = [
  { id: "game", label: "Game" },
  { id: "vibe", label: "Vibe" },
  { id: "ready", label: "Build" },
];

type HomeHeroProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCategoryPick: (seed: string) => void;
  messages?: ChatMessage[];
  chatStage?: ChatStage;
  onQuickReply?: (text: string) => void;
  isThinking?: boolean;
};

export function HomeHero({
  value,
  onChange,
  onSubmit,
  onCategoryPick,
  messages = [],
  chatStage = "game",
  onQuickReply,
  isThinking = false,
}: HomeHeroProps) {
  const logRef = useRef<HTMLDivElement>(null);
  const typed = useTypewriter(createIdeaSeeds);
  const stageIndex = STAGES.findIndex((stage) => stage.id === chatStage);

  // Keep the newest line in view without scrolling the page.
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, isThinking]);

  return (
    <section className="px-4 pt-5 sm:px-6 lg:px-8 lg:pt-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center xl:gap-10">
        {/* Headline column */}
        <div className="min-w-0">
          <p className="font-mono text-[12px] text-text-3">
            <span className="text-phos">$</span> ./dogegame --mode=create
          </p>
          <h1 className="font-pixel mt-4 text-[26px] leading-[1.25] text-text sm:text-[34px] xl:text-[42px]">
            <span className="block">PROMPT</span>
            <span className="block text-magenta glow-magenta">&gt; PLAYABLE</span>
          </h1>
          <p className="mt-5 max-w-md text-[14px] leading-relaxed text-text-2">
            Describe a game in plain words. DogeGame&apos;s AI agents write the code, playtest it,
            and hand you a world you can play, publish and share — on DogeOS.
          </p>
          <DogeOSBadge className="mt-4" />

          <div className="mt-6 flex items-end gap-4">
            <DogeIcon size={64} bob title="Doge" className="rounded-[18px]" />
            <div className="relative mb-6 min-w-0 flex-1 border-2 border-line-2 bg-ink-2 px-3 py-2 font-mono text-[12px] text-text-2">
              <span className="absolute -left-[9px] bottom-2 h-3 w-3 rotate-45 border-b-2 border-l-2 border-line-2 bg-ink-2" />
              <span className="text-text-3">try:</span> <span className="text-phos">{typed}</span>
              <span className="animate-blink text-phos">▌</span>
            </div>
          </div>
        </div>

        {/* Terminal */}
        <div className="px-panel shadow-none" data-tone="hot">
          <header className="px-titlebar bg-phos text-ink-0">
            <span className="flex gap-1.5" aria-hidden="true">
              <span className="size-2.5 bg-ink-0" />
              <span className="size-2.5 bg-ink-0/60" />
              <span className="size-2.5 bg-ink-0/30" />
            </span>
            <span className="flex-1 truncate">new_game.sh — dogegame-bot</span>
            <span className="hidden sm:inline">tty1</span>
          </header>

          <div className="p-3 sm:p-4">
            <ol
              className="mb-3 flex items-center gap-1 font-mono text-[10px] font-extrabold uppercase tracking-[0.12em]"
              aria-label="Progress"
            >
              {STAGES.map((stage, index) => (
                <li key={stage.id} className="flex items-center gap-1">
                  <span
                    className={cn(
                      "border-2 px-1.5 py-0.5",
                      index < stageIndex && "border-phos-3 text-phos",
                      index === stageIndex && "border-phos bg-phos text-ink-0",
                      index > stageIndex && "border-line text-text-3",
                    )}
                  >
                    {index + 1}.{stage.label}
                  </span>
                  {index < STAGES.length - 1 && <span className="text-text-3">▸</span>}
                </li>
              ))}
            </ol>

            <div
              ref={logRef}
              className="max-h-[300px] min-h-[120px] overflow-y-auto pr-1 sm:max-h-[340px]"
            >
              <ConsoleChatMessages
                messages={messages}
                chatStage={chatStage}
                isThinking={isThinking}
                onQuickReply={onQuickReply}
              />
            </div>

            <CreateConsolePanel
              className="mt-4"
              value={value}
              onChange={onChange}
              onSubmit={onSubmit}
              onCategoryPick={onCategoryPick}
              disabled={isThinking}
              placeholder={value ? "" : `${typed}`}
              submitLabel={chatStage === "ready" ? "Build it" : "Send"}
            />
          </div>
        </div>
      </div>

      {/* Pipeline: four stations joined by a moving conveyor belt */}
      <ol className="mt-8 grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-0" aria-label="How it works">
        {PIPELINE.map(({ step, label, note, Icon, color }, index) => (
          <li key={step} className="flex min-w-0 items-stretch">
            <div
              className="conveyor-step flex min-w-0 flex-1 items-center gap-2.5 border-2 border-line px-2.5 py-3 sm:gap-3 sm:px-3"
              style={
                {
                  "--step": color,
                  "--line-accent": color,
                  "--delay": `${index * 1.1}s`,
                } as React.CSSProperties
              }
            >
              <span
                aria-hidden="true"
                className="font-term pointer-events-none absolute -right-1 -top-3 select-none text-[76px] leading-none opacity-[0.08]"
                style={{ color }}
              >
                {step}
              </span>
              <span
                className="conveyor-icon relative grid size-10 shrink-0 place-items-center border-2 text-text sm:size-12"
                style={{
                  borderColor: color,
                  background: `color-mix(in oklab, ${color} 14%, transparent)`,
                  boxShadow: `0 0 18px color-mix(in oklab, ${color} 22%, transparent)`,
                }}
              >
                <Icon className="size-7 sm:size-8" />
              </span>
              <span className="relative min-w-0">
                <span className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
                  <span className="font-term text-[22px] leading-none" style={{ color }}>
                    {step}
                  </span>
                  <span className="font-mono text-[11px] font-extrabold uppercase tracking-[0.08em] text-text sm:truncate sm:text-[12px] sm:tracking-[0.1em]">
                    {label}
                  </span>
                </span>
                <span className="mt-1 block text-[10px] leading-tight text-text-3 sm:truncate sm:text-[11px]">
                  {note}
                </span>
              </span>
            </div>
            {index < PIPELINE.length - 1 && (
              <span
                aria-hidden="true"
                className="conveyor-belt hidden w-5 shrink-0 self-center lg:block xl:w-7"
                style={{ height: 14 }}
              />
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** @deprecated name kept for imports from the previous home page. */
export const MobileHomeHero = HomeHero;
