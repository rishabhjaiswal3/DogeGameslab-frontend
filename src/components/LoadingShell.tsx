import { useEffect, useState } from "react";

import mascot from "@/assets/dogegamelab-project.webp";

const STATUS_LINES = [
  "WAKING UP THE DOGE",
  "CONNECTING TO DOGEOS",
  "MOUNTING GAME CARTRIDGES",
  "WARMING UP BUILD AGENTS",
  "POLISHING Ð COINS",
];

const BAR_SEGMENTS = 14;

// Small decorations drifting around the mascot: [left %, top %, size px, delay s, kind]
const FLOATERS: [number, number, number, number, "coin" | "spark" | "pixel"][] = [
  [-62, 8, 22, 0, "coin"],
  [150, 2, 16, 0.6, "spark"],
  [-38, 78, 12, 1.1, "pixel"],
  [142, 70, 20, 0.3, "coin"],
  [-78, 46, 14, 1.6, "spark"],
  [176, 38, 10, 0.9, "pixel"],
];

const CSS = `
@keyframes ls-bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-10px) } }
@keyframes ls-halo { 0%,100% { opacity: .55; transform: scale(1) } 50% { opacity: .95; transform: scale(1.08) } }
@keyframes ls-ring { to { transform: rotate(360deg) } }
@keyframes ls-float { 0%,100% { transform: translateY(0) rotate(0deg); opacity: .9 } 50% { transform: translateY(-14px) rotate(12deg); opacity: .55 } }
@keyframes ls-seg { 0%,100% { opacity: .16; transform: scaleY(.7) } 40%,60% { opacity: 1; transform: scaleY(1) } }
@keyframes ls-blink { 50% { opacity: 0 } }
@keyframes ls-rise { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
@keyframes ls-scan { from { transform: translateY(-100%) } to { transform: translateY(100vh) } }
@keyframes ls-shadow { 0%,100% { transform: scaleX(1); opacity: .5 } 50% { transform: scaleX(.78); opacity: .28 } }
@media (prefers-reduced-motion: reduce) {
  .ls-root * { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; }
}
`;

/**
 * Full-screen loading screen: the DogeGameLab mascot, wordmark and a pixel
 * progress bar. Fully inline-styled, because it is shown before the stylesheet
 * arrives, and again while the DogeOS SDK loads its wallet list.
 */
export function LoadingShell() {
  const light =
    typeof document !== "undefined" && document.documentElement.dataset.theme === "light";
  const [line, setLine] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setLine((n) => (n + 1) % STATUS_LINES.length), 1400);
    return () => window.clearInterval(timer);
  }, []);

  const c = light
    ? {
        bg: "#f1ede2",
        grid: "rgba(14,128,69,.10)",
        glow: "rgba(224,168,0,.30)",
        doge: "#b88600",
        game: "#15211b",
        lab: "#0e8045",
        dim: "#5d6b63",
        line: "#c9c2ad",
        bar: "#0e8045",
        pink: "#b8166f",
      }
    : {
        bg: "#080c0f",
        grid: "rgba(61,255,143,.07)",
        glow: "rgba(252,212,54,.28)",
        doge: "#fcd436",
        game: "#f4fff8",
        lab: "#3dff8f",
        dim: "#8fb5a1",
        line: "#1d2b25",
        bar: "#3dff8f",
        pink: "#ff3eb0",
      };

  const pixelFont = '"Press Start 2P", ui-monospace, Menlo, monospace';

  return (
    <div
      className="ls-root"
      role="status"
      aria-label="Loading DogeGameLab"
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        display: "grid",
        placeItems: "center",
        background: c.bg,
        backgroundImage: `radial-gradient(60% 45% at 50% 42%, ${c.glow}, transparent 70%), radial-gradient(circle at 1px 1px, ${c.grid} 1px, transparent 1.6px)`,
        backgroundSize: "100% 100%, 20px 20px",
        fontFamily: "ui-monospace, Menlo, monospace",
        color: c.dim,
      }}
    >
      <style>{CSS}</style>

      {/* slow scan line, like an old monitor warming up */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: 120,
          background: `linear-gradient(to bottom, transparent, ${c.grid}, transparent)`,
          animation: "ls-scan 4.5s linear infinite",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 26,
          padding: 24,
          animation: "ls-rise .5s ease-out both",
        }}
      >
        {/* mascot with halo, spinning dashed ring and floating bits */}
        <div style={{ position: "relative", width: 132, height: 132 }}>
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: -34,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${c.glow}, transparent 68%)`,
              animation: "ls-halo 2.4s ease-in-out infinite",
            }}
          />
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: -18,
              borderRadius: "50%",
              border: `3px dashed ${c.doge}`,
              opacity: 0.55,
              animation: "ls-ring 9s linear infinite",
            }}
          />
          {FLOATERS.map(([left, top, size, delay, kind], index) => (
            <span
              key={index}
              aria-hidden="true"
              style={{
                position: "absolute",
                left: `${left}%`,
                top: `${top}%`,
                width: size,
                height: size,
                animation: `ls-float ${2.6 + (index % 3) * 0.5}s ease-in-out ${delay}s infinite`,
                ...(kind === "coin"
                  ? {
                      borderRadius: "50%",
                      background: "radial-gradient(circle at 35% 30%, #ffe680, #f6b21b 60%, #c98a00)",
                      border: "2px solid #8a5a00",
                      boxShadow: `0 0 12px ${c.glow}`,
                    }
                  : kind === "spark"
                    ? {
                        background: c.lab,
                        clipPath:
                          "polygon(50% 0, 60% 40%, 100% 50%, 60% 60%, 50% 100%, 40% 60%, 0 50%, 40% 40%)",
                      }
                    : { background: c.pink }),
              }}
            />
          ))}
          <img
            src={mascot}
            alt=""
            width={132}
            height={132}
            draggable={false}
            style={{
              position: "relative",
              width: 132,
              height: 132,
              borderRadius: 30,
              border: `4px solid ${c.doge}`,
              boxShadow: `0 0 0 4px ${c.bg}, 0 0 34px ${c.glow}`,
              animation: "ls-bob 1.8s ease-in-out infinite",
              display: "block",
            }}
          />
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "18%",
              right: "18%",
              bottom: -22,
              height: 10,
              borderRadius: "50%",
              background: light ? "rgba(21,33,27,.25)" : "rgba(0,0,0,.6)",
              filter: "blur(4px)",
              animation: "ls-shadow 1.8s ease-in-out infinite",
            }}
          />
        </div>

        {/* wordmark */}
        <div
          style={{
            marginTop: 14,
            fontFamily: pixelFont,
            fontSize: "clamp(16px, 4.6vw, 26px)",
            letterSpacing: "0.02em",
            lineHeight: 1,
            whiteSpace: "nowrap",
            textShadow: `0 0 18px ${c.glow}`,
          }}
        >
          <span style={{ color: c.doge }}>DOGE</span>
          <span style={{ color: c.game }}>GAME</span>
          <span style={{ color: c.lab }}>LAB</span>
        </div>

        {/* pixel progress bar */}
        <div
          aria-hidden="true"
          style={{
            display: "flex",
            gap: 4,
            padding: 5,
            border: `2px solid ${c.line}`,
            background: light ? "rgba(255,255,255,.5)" : "rgba(0,0,0,.35)",
          }}
        >
          {Array.from({ length: BAR_SEGMENTS }, (_, index) => (
            <span
              key={index}
              style={{
                width: "clamp(8px, 2.6vw, 14px)",
                height: 16,
                background: index < 4 ? c.doge : c.bar,
                animation: `ls-seg 1.6s ease-in-out ${index * 0.09}s infinite`,
              }}
            />
          ))}
        </div>

        {/* rotating status line */}
        <div
          style={{
            minHeight: 18,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.16em",
            color: c.dim,
            textAlign: "center",
          }}
        >
          <span style={{ color: c.lab }}>&gt;</span>{" "}
          <span key={line} style={{ display: "inline-block", animation: "ls-rise .3s ease-out both" }}>
            {STATUS_LINES[line]}
          </span>
          <span style={{ color: c.lab, animation: "ls-blink 1s steps(1) infinite" }}>█</span>
        </div>

        <div style={{ fontSize: 10, letterSpacing: "0.22em", opacity: 0.7 }}>
          PROMPT <span style={{ color: c.pink }}>//</span> PLAY{" "}
          <span style={{ color: c.pink }}>//</span> SHARE
        </div>
      </div>
    </div>
  );
}
