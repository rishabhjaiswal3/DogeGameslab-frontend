import type { SVGProps } from "react";

// Line-drawn machines and objects in one style: 48px box, 2.4px rounded strokes,
// currentColor for the lines and --line-accent (when set) for small highlights.
type LineIconProps = SVGProps<SVGSVGElement> & { size?: number };

function Frame({ size = 48, children, ...props }: LineIconProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

const accent = "var(--line-accent, currentColor)";

/** A terminal window with a prompt: describing the game. */
export function LineTerminal(props: LineIconProps) {
  return (
    <Frame {...props}>
      <rect x="5" y="8" width="38" height="32" rx="4" />
      <path d="M5 16 H43" />
      <path d="M12 24 L18 28 L12 32" stroke={accent} />
      <path d="M22 33 H31" stroke={accent} />
      <circle cx="10" cy="12" r="0.6" />
      <circle cx="14.5" cy="12" r="0.6" />
    </Frame>
  );
}

/** A robot head: the build agents. */
export function LineRobot(props: LineIconProps) {
  return (
    <Frame {...props}>
      <path d="M24 5 V11" />
      <circle cx="24" cy="4.5" r="1.6" fill={accent} stroke={accent} />
      <rect x="9" y="11" width="30" height="24" rx="6" />
      <circle cx="18" cy="22" r="3" stroke={accent} />
      <circle cx="30" cy="22" r="3" stroke={accent} />
      <path d="M18 29 H30" />
      <path d="M5 20 V27 M43 20 V27" />
      <path d="M17 35 V41 H31 V35" />
    </Frame>
  );
}

/** A game controller: playtesting. */
export function LineGamepad(props: LineIconProps) {
  return (
    <Frame {...props}>
      <path d="M14 14 H34 C40 14 43 19 44 27 C45 34 43 38 39 38 C35 38 34 33 30 33 H18 C14 33 13 38 9 38 C5 38 3 34 4 27 C5 19 8 14 14 14 Z" />
      <path d="M15 20 V28 M11 24 H19" stroke={accent} />
      <circle cx="32" cy="21.5" r="1.8" stroke={accent} />
      <circle cx="36" cy="26" r="1.8" stroke={accent} />
    </Frame>
  );
}

/** A rocket: publishing. */
export function LineRocket(props: LineIconProps) {
  return (
    <Frame {...props}>
      <path d="M24 4 C31 9 34 17 33 28 H15 C14 17 17 9 24 4 Z" />
      <circle cx="24" cy="17" r="3.4" stroke={accent} />
      <path d="M15 24 L8 31 V35 L16 32 M33 24 L40 31 V35 L32 32" />
      <path d="M20 33 C20 38 22 41 24 44 C26 41 28 38 28 33" stroke={accent} />
    </Frame>
  );
}
