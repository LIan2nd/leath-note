"use client";

import * as React from "react";
import { RefreshCcw } from "lucide-react";
import { ActionErrorMessage } from "~/components/ui/action-error-message";

interface RouteErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RouteError({ error, reset }: RouteErrorProps) {
  React.useEffect(() => {
    console.error("Leath Notes route error", error);
  }, [error]);

  return (
    <main className="wood-background flex min-h-screen items-center justify-center px-4 py-10">
      <ActionErrorMessage
        title="Your writing space hit a small snag"
        message="Leath Notes could not finish opening this page. Anything already saved remains in your account. Try again, or reload if the problem continues."
        className="w-full max-w-md shadow-2xl"
        action={(
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={reset}
              className="btn-skeuomorphic flex items-center gap-2 px-3 py-2 text-sm"
            >
              <RefreshCcw className="h-4 w-4" aria-hidden="true" />
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-skeuomorphic px-3 py-2 text-sm"
            >
              Reload page
            </button>
          </div>
        )}
      />
    </main>
  );
}
