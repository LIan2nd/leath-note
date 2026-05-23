import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from "@tanstack/react-query";
import SuperJSON from "superjson";

/**
 * Check if a tRPC error is an UNAUTHORIZED error (session expired or invalid).
 * When detected, we trigger a page-level session refresh so the UI transitions
 * to guest state gracefully instead of showing broken authenticated UI.
 */
function isUnauthorizedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  // tRPC errors have a `data` object with a `code` field
  const err = error as Record<string, unknown>;
  if ("data" in err && typeof err.data === "object" && err.data !== null) {
    const data = err.data as Record<string, unknown>;
    if (data.code === "UNAUTHORIZED") return true;
  }
  // Also check the shape from httpBatchStreamLink errors
  if ("message" in err && typeof err.message === "string") {
    if (err.message.includes("UNAUTHORIZED")) return true;
  }
  return false;
}

/**
 * Handle session expiry globally: when any query/mutation returns UNAUTHORIZED,
 * trigger a session check which will cause useSession() to return "unauthenticated",
 * and the MainLayout will gracefully transition to guest state.
 */
function handleGlobalError(error: unknown) {
  if (typeof window === "undefined") return;
  if (isUnauthorizedError(error)) {
    // Trigger NextAuth session refresh — this updates the useSession() hook
    // across the app, causing the UI to transition to guest state
    void fetch("/api/auth/session").then(() => {
      // Force a re-render of session state by dispatching a storage event
      // (NextAuth's SessionProvider listens for this)
      const event = new Event("visibilitychange");
      document.dispatchEvent(event);
    });
  }
}

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // Keep data fresh for 5 minutes — notes don't change from other tabs
        staleTime: 5 * 60 * 1000,
        // Keep unused cache for 10 minutes so switching back is instant
        gcTime: 10 * 60 * 1000,
        // Don't refetch just because the window regained focus
        refetchOnWindowFocus: false,
        // Disable retries for auth errors — session is expired, retrying won't help
        retry: (failureCount, error) => {
          if (isUnauthorizedError(error)) return false;
          return failureCount < 3;
        },
      },
      mutations: {
        onError: handleGlobalError,
      },
      dehydrate: {
        serializeData: SuperJSON.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
      hydrate: {
        deserializeData: SuperJSON.deserialize,
      },
    },
  });
