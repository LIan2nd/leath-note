"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";

import { TRPCReactProvider } from "~/trpc/react";

function SessionCacheBoundary({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const previousUserId = React.useRef<string | null>(null);

  React.useLayoutEffect(() => {
    const currentUserId = session?.user?.id ?? null;
    const identityChanged =
      previousUserId.current !== null && previousUserId.current !== currentUserId;

    if (status === "unauthenticated" || identityChanged) {
      queryClient.clear();
    }
    previousUserId.current = currentUserId;
  }, [queryClient, session?.user?.id, status]);

  return children;
}

export function AuthenticatedProviders({ children }: { children: React.ReactNode }) {
  return (
    <TRPCReactProvider>
      <SessionCacheBoundary>{children}</SessionCacheBoundary>
    </TRPCReactProvider>
  );
}
