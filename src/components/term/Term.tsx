import { forwardRef, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PixelSprite, type SpriteName } from "./PixelSprite";

export type Tone = "phos" | "amber" | "magenta" | "cyan" | "violet" | "danger" | "dim";

export const TONE_VAR: Record<Tone, string> = {
  phos: "var(--phos)",
  amber: "var(--amber)",
  magenta: "var(--magenta)",
  cyan: "var(--cyan)",
  violet: "var(--violet)",
  danger: "var(--danger)",
  dim: "var(--text-2)",
};

export const TONE_TEXT: Record<Tone, string> = {
  phos: "text-phos",
  amber: "text-amber",
  magenta: "text-magenta",
  cyan: "text-cyan",
  violet: "text-violet",
  danger: "text-danger",
  dim: "text-text-2",
};

/* ── Panel ──────────────────────────────────────────────────────────────── */

type PanelTone = "phos" | "amber" | "magenta" | "cyan" | "hot";

export function Panel({
  title,
  tone,
  actions,
  className,
  bodyClassName,
  children,
  id,
}: {
  title?: ReactNode;
  tone?: PanelTone;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className={cn("px-panel", className)} data-tone={tone}>
      {(title || actions) && (
        <header className="px-titlebar">
          <span className="min-w-0 flex-1 truncate">{title}</span>
          {actions && <span className="flex shrink-0 items-center gap-2">{actions}</span>}
        </header>
      )}
      <div className={cn("p-3 sm:p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/* ── Button ─────────────────────────────────────────────────────────────── */

export type BtnVariant = "default" | "primary" | "amber" | "magenta" | "cyan" | "ghost" | "danger";
export type BtnSize = "sm" | "md" | "lg" | "icon";

/** Spread onto <a>/<Link> to make them look like a Btn. */
export function btnAttrs(variant: BtnVariant = "default", size: BtnSize = "md") {
  return {
    "data-variant": variant === "default" ? undefined : variant,
    "data-size": size === "md" ? undefined : size,
  } as const;
}

export const Btn = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize }
>(function Btn({ variant = "default", size = "md", className, type = "button", ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn("px-btn", className)}
      {...btnAttrs(variant, size)}
      {...props}
    />
  );
});

/* ── Small pieces ───────────────────────────────────────────────────────── */

export function Tag({
  tone = "phos",
  children,
  className,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn("px-tag", className)}
      style={{ "--tag": TONE_VAR[tone] } as React.CSSProperties}
    >
      {children}
    </span>
  );
}

export function Cursor({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "animate-blink ml-0.5 inline-block h-[1.05em] w-[0.6em] translate-y-[0.15em] bg-current",
        className,
      )}
    />
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd>{children}</kbd>;
}

/** Segmented block meter: ▮▮▮▮▯▯▯ */
export function Meter({
  value,
  segments = 12,
  tone = "phos",
  className,
  label,
}: {
  value: number;
  segments?: number;
  tone?: Tone;
  className?: string;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const lit = Math.round(clamped * segments);
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      aria-label={label}
      className={cn("flex gap-[3px]", className)}
    >
      {Array.from({ length: segments }).map((_, i) => (
        <span
          key={i}
          className="h-2.5 flex-1"
          style={{
            background: i < lit ? TONE_VAR[tone] : "var(--ink-4)",
            boxShadow: i < lit ? `0 0 6px ${TONE_VAR[tone]}` : undefined,
          }}
        />
      ))}
    </div>
  );
}

/** Big VT323 readout with a small label. */
export function Stat({
  label,
  value,
  tone = "phos",
  icon,
  className,
  sub,
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  className?: string;
  sub?: ReactNode;
}) {
  return (
    <div className={cn("min-w-0 border-2 border-line bg-ink-1 px-3 py-2.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="label-term truncate text-text-3">{label}</span>
        {icon && <span className={TONE_TEXT[tone]}>{icon}</span>}
      </div>
      <p
        className={cn("font-term mt-1 truncate text-[34px] tabular-nums", TONE_TEXT[tone])}
        style={{ textShadow: `0 0 10px color-mix(in srgb, ${TONE_VAR[tone]} 45%, transparent)` }}
      >
        {value}
      </p>
      {sub && <div className="mt-1 text-[11px] text-text-3">{sub}</div>}
    </div>
  );
}

/** `## TITLE ────────── action` */
export function SectionHead({
  title,
  kicker,
  action,
  className,
  tone = "phos",
}: {
  title: ReactNode;
  kicker?: ReactNode;
  action?: ReactNode;
  className?: string;
  tone?: Tone;
}) {
  return (
    <div className={cn("mb-3 flex items-end gap-3", className)}>
      <div className="min-w-0">
        {kicker && <p className="label-term mb-1.5 text-text-3">{kicker}</p>}
        <h2
          className={cn(
            "font-pixel flex items-center gap-2 text-[12px] sm:text-[13px]",
            TONE_TEXT[tone],
          )}
        >
          <span aria-hidden="true" className="text-text-3">
            ##
          </span>
          <span className="truncate">{title}</span>
        </h2>
      </div>
      <span
        aria-hidden="true"
        className="mb-[5px] h-[2px] min-w-4 flex-1 bg-[repeating-linear-gradient(90deg,var(--line-2)_0_6px,transparent_6px_10px)]"
      />
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

const SPIN = ["|", "/", "-", "\\"];

/** Rotating ASCII spinner. */
export function Spinner({ className }: { className?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setI((n) => (n + 1) % SPIN.length), 110);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block w-[1ch] text-center font-mono", className)}
    >
      {SPIN[i]}
    </span>
  );
}

/** `[■■■□□□] LOADING…` with blocks that walk. */
export function TermLoader({
  label = "Loading",
  className,
}: {
  label?: string;
  className?: string;
}) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setStep((s) => (s + 1) % 8), 140);
    return () => window.clearInterval(id);
  }, []);
  const blocks = Array.from({ length: 8 }, (_, i) => (i <= step ? "■" : "□")).join("");
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("font-mono text-xs font-bold uppercase tracking-[0.14em] text-phos", className)}
    >
      <span className="text-text-3">[</span>
      {blocks}
      <span className="text-text-3">]</span> {label}
      <span className="animate-blink">_</span>
    </div>
  );
}

export function EmptyState({
  title,
  text,
  action,
  sprite = "ghost",
  className,
}: {
  title?: ReactNode;
  text: ReactNode;
  action?: ReactNode;
  sprite?: SpriteName;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 border-2 border-dashed border-line-2 bg-ink-1/60 px-6 py-10 text-center",
        className,
      )}
    >
      <PixelSprite name={sprite} scale={4} color="var(--text-3)" />
      {title && <p className="font-pixel text-[11px] text-text">{title}</p>}
      <p className="max-w-sm text-sm text-text-2">{text}</p>
      {action}
    </div>
  );
}

export type NoticeKind = "info" | "error" | "ok";

const NOTICE_STYLE: Record<NoticeKind, { tone: Tone; label: string }> = {
  info: { tone: "cyan", label: "INFO" },
  error: { tone: "danger", label: "ERROR" },
  ok: { tone: "phos", label: "OK" },
};

/** `[ERROR] message` log-style banner. */
export function Notice({
  kind = "info",
  label,
  children,
  className,
}: {
  kind?: NoticeKind;
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  const style = NOTICE_STYLE[kind];
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={cn("border-2 px-3 py-2.5 text-sm", className)}
      style={{
        borderColor: `color-mix(in srgb, ${TONE_VAR[style.tone]} 45%, transparent)`,
        background: `color-mix(in srgb, ${TONE_VAR[style.tone]} 8%, var(--ink-1))`,
      }}
    >
      <span className={cn("mr-2 font-mono text-[11px] font-extrabold", TONE_TEXT[style.tone])}>
        [{label ?? style.label}]
      </span>
      <span className="text-text">{children}</span>
    </div>
  );
}

/** Dithered placeholder block for skeletons. */
export function Block({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("dither animate-shimmer bg-ink-3", className)} />;
}

export function formatCount(value: number | undefined | null) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}
