import { useEffect, useState } from "react";

import mark from "@/assets/dogegamelab-mark.webp";
import mascot from "@/assets/dogegamelab-project.webp";

// What the build agents are doing, shown one line at a time like a build log.
const BUILD_STEPS = [
  "reading-your-prompt",
  "drawing-the-doge",
  "writing-game-code",
  "wiring-the-controls",
  "playtesting",
];

const BAR_SEGMENTS = 16;

// Bits of "game" flying into the machine while it is built: [text, side, top %, delay s]
const CHIPS: [string, "l" | "r", number, number][] = [
  ["{ }", "l", 16, 0],
  ["</>", "r", 24, 0.5],
  ["▲", "l", 52, 1.0],
  ["fn()", "r", 58, 1.5],
  ["Ð", "l", 82, 2.0],
  ["★", "r", 86, 2.5],
];

// An arcade cabinet is drawn line by line, switches on, and shows the Doge —
// the app building a game. Everything is in the app's own terminal theme.
const CSS = `
.ls-machine { position: relative; animation: ls-float 3.2s ease-in-out 1.4s infinite; }
.ls-cab { width: clamp(170px, 30vw, 270px); height: auto; overflow: visible; display: block; position: relative; }
.ls-line { fill: none; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 1; stroke-dashoffset: 1; animation: ls-draw 1s ease-out forwards; }
.ls-guide { stroke-dasharray: 4 6; animation: ls-fade 2.4s ease-out forwards; }
.ls-screen { animation: ls-on .9s steps(1) .75s both; }
.ls-screen-glow { animation: ls-glow 2.6s ease-in-out 1.4s infinite; }
.ls-stick { transform-origin: 78px 222px; animation: ls-stick 1.6s ease-in-out 1.3s infinite; }
.ls-btn { animation: ls-press 1.2s steps(1) 1.4s infinite; }
.ls-beam { animation: ls-beam 2.6s ease-in-out 1.1s infinite; }
.ls-chip { position: absolute; white-space: nowrap; opacity: 0; }
.ls-chip-l { left: -58%; animation: ls-chip-l 3s ease-in infinite; }
.ls-chip-r { right: -58%; animation: ls-chip-r 3s ease-in infinite; }
.ls-below { display: flex; flex-direction: column; align-items: center; gap: 16px; margin-top: clamp(22px, 4vh, 38px); animation: ls-rise .6s ease-out .6s both; }
@keyframes ls-draw { to { stroke-dashoffset: 0 } }
@keyframes ls-fade { 0% { opacity: 0 } 20% { opacity: .55 } 100% { opacity: .16 } }
@keyframes ls-on { 0% { opacity: 0 } 8% { opacity: .9 } 16% { opacity: .15 } 26% { opacity: 1 } 34% { opacity: .5 } 42%,100% { opacity: 1 } }
@keyframes ls-glow { 0%,100% { opacity: .55 } 50% { opacity: 1 } }
@keyframes ls-stick { 0%,100% { transform: rotate(-14deg) } 50% { transform: rotate(14deg) } }
@keyframes ls-press { 0%,100% { transform: translateY(0) } 50% { transform: translateY(2.5px) } }
@keyframes ls-beam { 0% { transform: translateY(0); opacity: 0 } 12% { opacity: .9 } 88% { opacity: .9 } 100% { transform: translateY(268px); opacity: 0 } }
@keyframes ls-chip-l { 0% { opacity: 0; transform: translateX(0) scale(1) } 15% { opacity: 1 } 80% { opacity: .9 } 100% { opacity: 0; transform: translateX(105%) scale(.4) } }
@keyframes ls-chip-r { 0% { opacity: 0; transform: translateX(0) scale(1) } 15% { opacity: 1 } 80% { opacity: .9 } 100% { opacity: 0; transform: translateX(-105%) scale(.4) } }
@keyframes ls-seg { 0%,100% { opacity: .16; transform: scaleY(.7) } 40%,60% { opacity: 1; transform: scaleY(1) } }
@keyframes ls-rise { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
@keyframes ls-blink { 50% { opacity: 0 } }
@keyframes ls-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-9px) } }
@media (max-width: 720px) {
  .ls-cab { width: clamp(160px, 50vw, 220px); }
  .ls-chip-l { left: -42%; }
  .ls-chip-r { right: -42%; }
}
@media (prefers-reduced-motion: reduce) {
  .ls-root *, .ls-root *::before { animation-duration: 0.01ms !important; animation-delay: 0s !important; animation-iteration-count: 1 !important; }
  .ls-chip, .ls-beam { display: none; }
}
`;

/**
 * Full-screen loading screen. Fully inline-styled, because it is shown before
 * the stylesheet arrives, and again while the DogeOS SDK loads its wallet list.
 */
export function LoadingShell() {
  const light =
    typeof document !== "undefined" && document.documentElement.dataset.theme === "light";
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((n) => n + 1), 1300);
    return () => window.clearInterval(timer);
  }, []);

  const c = light
    ? {
        bg: "#f1ede2",
        ink: "#15211b",
        line: "#15211b",
        panel: "#fbf9f3",
        rule: "#c9c2ad",
        dot: "rgba(21,33,27,.09)",
        glow: "rgba(224,168,0,.34)",
        doge: "#b88600",
        lab: "#0e8045",
        dim: "#5d6b63",
        pink: "#b8166f",
      }
    : {
        bg: "#080c0f",
        ink: "#f4fff8",
        line: "#d9f7e6",
        panel: "#0c1215",
        rule: "#1d2b25",
        dot: "rgba(61,255,143,.075)",
        glow: "rgba(252,212,54,.30)",
        doge: "#fcd436",
        lab: "#3dff8f",
        dim: "#8fb5a1",
        pink: "#ff3eb0",
      };

  const pixelFont = '"Press Start 2P", ui-monospace, Menlo, monospace';
  const step = BUILD_STEPS[tick % BUILD_STEPS.length];

  return (
    <div
      className="ls-root"
      role="status"
      aria-label="Loading DogeGameLab"
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(16px, 4vw, 40px)",
        background: c.bg,
        backgroundImage: `radial-gradient(circle at 1px 1px, ${c.dot} 1px, transparent 1.6px)`,
        backgroundSize: "20px 20px",
        fontFamily: "ui-monospace, Menlo, monospace",
        color: c.ink,
      }}
    >
      <style>{CSS}</style>

      {/* the machine being built */}
      <div className="ls-machine">
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: "-18% -30%",
            background: `radial-gradient(closest-side, ${c.glow}, transparent 72%)`,
          }}
        />
        {CHIPS.map(([text, side, top, delay]) => (
          <span
            key={text}
            aria-hidden="true"
            className={`ls-chip ls-chip-${side}`}
            style={{
              top: `${top}%`,
              animationDelay: `${delay}s`,
              fontFamily: pixelFont,
              fontSize: "clamp(9px, 1.5vw, 13px)",
              color: side === "l" ? c.doge : c.lab,
              textShadow: `0 0 10px ${c.glow}`,
            }}
          >
            {text}
          </span>
        ))}
        <svg
          className="ls-cab"
          viewBox="0 0 240 320"
          role="img"
          aria-label="An arcade cabinet being built, with the DogeGameLab Doge on its screen"
        >
          <defs>
            <clipPath id="ls-screen-clip">
              <rect x="58" y="62" width="124" height="104" rx="10" />
            </clipPath>
          </defs>

          {/* blueprint guide lines */}
          <g className="ls-guide" stroke={c.lab} strokeWidth="1.2" fill="none">
            <path d="M4 20 H236 M4 304 H236 M34 4 V316 M206 4 V316 M120 4 V316" />
          </g>

          <g stroke={c.line} strokeWidth="3.2">
            {/* cabinet body */}
            <path
              className="ls-line"
              pathLength={1}
              style={{ fill: c.panel }}
              d="M44 20 H196 L206 46 V182 L222 214 V236 H206 V304 H34 V236 H18 V214 L34 182 V46 Z"
            />
            {/* marquee */}
            <path className="ls-line" pathLength={1} d="M52 30 H188 L192 46 H48 Z" />
            {/* screen bezel */}
            <rect
              className="ls-line"
              pathLength={1}
              x="50"
              y="54"
              width="140"
              height="120"
              rx="14"
              style={{ animationDelay: ".15s" }}
            />
            {/* control deck */}
            <path
              className="ls-line"
              pathLength={1}
              d="M34 182 H206 M18 214 H222"
              style={{ animationDelay: ".3s" }}
            />
            {/* coin door and base */}
            <rect
              className="ls-line"
              pathLength={1}
              x="96"
              y="250"
              width="48"
              height="34"
              rx="4"
              style={{ animationDelay: ".45s" }}
            />
            <path
              className="ls-line"
              pathLength={1}
              d="M114 262 V272 M126 262 V272 M34 296 H206"
              style={{ animationDelay: ".55s" }}
            />
          </g>

          {/* marquee lights */}
          {[70, 95, 120, 145, 170].map((x, index) => (
            <rect
              key={x}
              x={x - 6}
              y="35"
              width="12"
              height="6"
              fill={index % 2 ? c.lab : c.doge}
              style={{ animation: `ls-blink 1s steps(1) ${1 + index * 0.12}s infinite` }}
            />
          ))}

          {/* the screen switches on */}
          <g className="ls-screen">
            <rect x="58" y="62" width="124" height="104" rx="10" fill="#14192b" />
            <image
              href={mascot}
              x="58"
              y="52"
              width="124"
              height="124"
              clipPath="url(#ls-screen-clip)"
              preserveAspectRatio="xMidYMid slice"
            />
            <rect
              className="ls-screen-glow"
              x="58"
              y="62"
              width="124"
              height="104"
              rx="10"
              fill="none"
              stroke={c.doge}
              strokeWidth="2.5"
            />
          </g>

          {/* build beam sweeping down the cabinet */}
          <g className="ls-beam">
            <rect x="10" y="22" width="220" height="2.5" fill={c.lab} />
            <rect x="10" y="24" width="220" height="14" fill={c.lab} opacity="0.12" />
          </g>

          {/* joystick and buttons */}
          <g className="ls-stick">
            <path d="M78 222 V196" stroke={c.line} strokeWidth="4" strokeLinecap="round" />
            <circle cx="78" cy="192" r="8" fill={c.pink} stroke={c.line} strokeWidth="3" />
          </g>
          <ellipse cx="78" cy="224" rx="13" ry="5" fill={c.panel} stroke={c.line} strokeWidth="3" />
          <g className="ls-btn">
            <circle cx="138" cy="200" r="8" fill={c.doge} stroke={c.line} strokeWidth="3" />
          </g>
          <g className="ls-btn" style={{ animationDelay: "1.9s" }}>
            <circle cx="166" cy="198" r="8" fill={c.lab} stroke={c.line} strokeWidth="3" />
          </g>
        </svg>
      </div>

      {/* our logo, a pixel progress bar and the build log */}
      <div className="ls-below">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "clamp(8px, 1.6vw, 14px)",
            fontFamily: pixelFont,
            fontSize: "clamp(15px, 3.6vw, 26px)",
            lineHeight: 1,
            whiteSpace: "nowrap",
            textShadow: `0 0 18px ${c.glow}`,
          }}
        >
          <img
            src={mark}
            alt=""
            style={{ width: "clamp(26px, 5vw, 40px)", height: "clamp(26px, 5vw, 40px)" }}
          />
          <span>
            <span style={{ color: c.doge }}>DOGE</span>
            <span>GAME</span>
            <span style={{ color: c.lab }}>LAB</span>
          </span>
        </div>

        <div
          aria-hidden="true"
          style={{
            display: "flex",
            gap: 4,
            padding: 5,
            border: `2px solid ${c.rule}`,
            background: c.panel,
          }}
        >
          {Array.from({ length: BAR_SEGMENTS }, (_, index) => (
            <span
              key={index}
              style={{
                width: "clamp(7px, 2.2vw, 13px)",
                height: 14,
                background: index < 5 ? c.doge : c.lab,
                animation: `ls-seg 1.6s ease-in-out ${index * 0.08}s infinite`,
              }}
            />
          ))}
        </div>

        <div
          style={{
            minHeight: 18,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.12em",
            color: c.dim,
            textAlign: "center",
          }}
        >
          <span style={{ color: c.lab }}>$</span> build <span style={{ color: c.pink }}>--</span>
          <span key={step} style={{ display: "inline-block", animation: "ls-rise .3s ease-out both" }}>
            {step}
          </span>
          <span style={{ color: c.lab, animation: "ls-blink 1s steps(1) infinite" }}>█</span>
        </div>
      </div>
    </div>
  );
}
