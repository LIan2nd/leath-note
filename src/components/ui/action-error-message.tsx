import * as React from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "~/lib/utils";

interface ActionErrorMessageProps {
  title?: string;
  message: string;
  className?: string;
  action?: React.ReactNode;
}

/** A consistent, accessible explanation of what failed and how to recover. */
export function ActionErrorMessage({
  title = "Something did not work",
  message,
  className,
  action,
}: ActionErrorMessageProps) {
  return (
    <div
      role="alert"
      aria-atomic="true"
      className={cn(
        "flex items-start gap-2.5 rounded-lg border border-red-700/50 bg-red-950/35 px-3 py-2.5 text-sm leading-5 text-red-100",
        className,
      )}
    >
      <CircleAlert
        className="mt-0.5 h-4 w-4 shrink-0 text-red-300"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-red-100">{title}</p>
        <p className="mt-0.5 text-red-200">{message}</p>
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}
