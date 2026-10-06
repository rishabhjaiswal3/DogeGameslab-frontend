import { createRouter } from "@tanstack/react-router";
import { APP_BASE } from "./lib/appBase";
import { queryClient } from "./lib/queryClient";
import { routeTree } from "./routeTree.gen";

/** Singleton — App and StudioContext both need the same router instance. */
export const router = createRouter({
  routeTree,
  context: { queryClient },
  scrollRestoration: true,
  // Route chunks are split per page; start fetching one when a link is hovered or touched.
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  ...(APP_BASE ? { basepath: APP_BASE } : {}),
});

export function getRouter() {
  return router;
}
