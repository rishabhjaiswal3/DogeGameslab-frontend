/**
 * Full-screen "LOADING DOGEGAMELAB" screen. Fully inline-styled, because it is
 * shown before the stylesheet and fonts arrive, and again while the DogeOS SDK
 * loads its wallet list.
 */
export function LoadingShell() {
  const light =
    typeof document !== "undefined" && document.documentElement.dataset.theme === "light";
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: light ? "#f1ede2" : "#080c0f",
        color: light ? "#0e8045" : "#3dff8f",
        fontFamily: "ui-monospace, Menlo, monospace",
        fontSize: 13,
        letterSpacing: "0.12em",
      }}
    >
      <div>
        LOADING DOGEGAMELAB
        <span style={{ animation: "kb 1s steps(1) infinite" }}>█</span>
      </div>
      <style>{"@keyframes kb { 50% { opacity: 0; } }"}</style>
    </div>
  );
}
