import { AsyncStatusMessage } from "~/components/ui/async-status-message";

const PAGE_LOADING_MESSAGES = [
  "Opening your quiet writing space...",
  "This page is taking a little longer to settle. Please keep it open.",
  "If it stays here, refresh the page and try once more.",
] as const;

export default function Loading() {
  return (
    <main className="wood-background flex min-h-screen items-center justify-center px-4">
      <h1 className="sr-only">Leath Notes is loading</h1>
      <AsyncStatusMessage
        active
        appearanceDelayMs={0}
        messages={PAGE_LOADING_MESSAGES}
        className="w-full max-w-sm"
      />
    </main>
  );
}
