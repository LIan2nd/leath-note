"use client";

import * as React from "react";
import { Clock3 } from "lucide-react";
import { cn } from "~/lib/utils";

interface AsyncStatusMessageProps {
  active: boolean;
  messages: readonly string[];
  className?: string;
  appearanceDelayMs?: number;
  longWaitDelayMs?: number;
  messageIntervalMs?: number;
}

/**
 * Keeps long-running actions understandable without making the interface feel
 * urgent. The first message appears immediately; later messages rotate only
 * after the wait becomes noticeable.
 */
export function AsyncStatusMessage({
  active,
  messages,
  className,
  appearanceDelayMs = 300,
  longWaitDelayMs = 2500,
  messageIntervalMs = 5000,
}: AsyncStatusMessageProps) {
  const [messageIndex, setMessageIndex] = React.useState(0);
  const [isVisible, setIsVisible] = React.useState(appearanceDelayMs === 0);

  React.useEffect(() => {
    setMessageIndex(0);
    if (!active) {
      setIsVisible(false);
      return;
    }

    const appearanceTimer = window.setTimeout(
      () => setIsVisible(true),
      appearanceDelayMs,
    );

    const messageTimers = messages.slice(1).map((_, index) =>
      window.setTimeout(
        () => setMessageIndex(index + 1),
        longWaitDelayMs + index * messageIntervalMs,
      ),
    );

    return () => {
      window.clearTimeout(appearanceTimer);
      messageTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [active, appearanceDelayMs, longWaitDelayMs, messageIntervalMs, messages]);

  if (!active || !isVisible || messages.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        "flex items-start gap-2 rounded-lg border border-[#8b7355]/30 bg-black/15 px-3 py-2.5 text-xs leading-5 text-[#d8c9ae]",
        className,
      )}
    >
      <Clock3
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#e7c88f]"
        aria-hidden="true"
      />
      <span>{messages[messageIndex]}</span>
    </div>
  );
}
