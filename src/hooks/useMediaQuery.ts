import { useCallback, useSyncExternalStore } from "react";

/** Tracks a CSS media query, e.g. `useMediaQuery("(min-width: 1024px)")`. */
export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}
