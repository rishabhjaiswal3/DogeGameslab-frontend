import { memo } from "react";

/*
 * Two-tone pixel icons for the bottom tab bar, drawn on a 14×14 grid.
 * `#` is the main colour (currentColor) and `o` is the tab's accent colour.
 */
const BITMAPS = {
  // A doghouse: home, for a Doge.
  home: [
    "......##......",
    ".....####.....",
    "....######....",
    "...###..###...",
    "..###....###..",
    ".###......###.",
    "###........###",
    ".#..........#.",
    ".#...oooo...#.",
    ".#..oooooo..#.",
    ".#..oooooo..#.",
    ".#..oooooo..#.",
    ".#..oooooo..#.",
    ".############.",
  ],
  // A game cartridge with a lit label.
  templates: [
    ".############.",
    ".#..........#.",
    ".#.oooooooo.#.",
    ".#.oooooooo.#.",
    ".#.oooooooo.#.",
    ".#.oooooooo.#.",
    ".#..........#.",
    ".#..##..##..#.",
    ".#..........#.",
    ".############.",
    "...#.#..#.#...",
    "...#.#..#.#...",
    "...########...",
    "..............",
  ],
  // A trophy with a gem.
  trophy: [
    "..##########..",
    "###........###",
    "#.#...oo...#.#",
    "#.#..oooo..#.#",
    "###...oo...###",
    "..#........#..",
    "..##......##..",
    "...########...",
    ".....####.....",
    "......##......",
    "......##......",
    "....######....",
    "...########...",
    "...########...",
  ],
  // The Doge in sunglasses.
  user: [
    ".##........##.",
    ".###......###.",
    ".############.",
    "##############",
    "##############",
    "#ooooo##ooooo#",
    "##oooo##oooo##",
    "##############",
    "##############",
    ".####....####.",
    ".###..oo..###.",
    "..##......##..",
    "...########...",
    "....######....",
  ],
  // A chunky plus with two sparkles.
  create: [
    "..........o...",
    ".....##..ooo..",
    ".....##...o...",
    ".....##.......",
    ".....##.......",
    "############..",
    "############..",
    ".....##.......",
    ".....##.......",
    "..o..##.......",
    ".ooo.##.......",
    "..o..##.......",
    "..............",
    "..............",
  ],
} as const;

export type NavIconName = keyof typeof BITMAPS;

// One path per colour: each lit pixel becomes a 1×1 square, merged along rows.
function toPath(rows: readonly string[], mark: string) {
  let d = "";
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== mark) {
        x += 1;
        continue;
      }
      let end = x;
      while (end < row.length && row[end] === mark) end += 1;
      d += `M${x} ${y}h${end - x}v1h-${end - x}z`;
      x = end;
    }
  });
  return d;
}

const PATHS = Object.fromEntries(
  Object.entries(BITMAPS).map(([name, rows]) => [
    name,
    { main: toPath(rows, "#"), accent: toPath(rows, "o"), size: rows[0].length },
  ]),
) as Record<NavIconName, { main: string; accent: string; size: number }>;

export const NavIcon = memo(function NavIcon({
  name,
  size = 22,
  accent = "currentColor",
  className,
}: {
  name: NavIconName;
  size?: number;
  /** Colour of the icon's highlight pixels. */
  accent?: string;
  className?: string;
}) {
  const icon = PATHS[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${icon.size} ${icon.size}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      className={className}
    >
      <path d={icon.main} fill="currentColor" />
      <path d={icon.accent} fill={accent} />
    </svg>
  );
});
