"use client";

import * as React from "react";

const SCROLL_DURATION_MS = 150;

type SmoothAnchorLinkProps = Omit<React.ComponentProps<"a">, "href"> & {
  href: `#${string}`;
};

function easeOutCubic(progress: number) {
  return 1 - (1 - progress) ** 3;
}

export function SmoothAnchorLink({
  href,
  onClick,
  ...props
}: SmoothAnchorLinkProps) {
  const animationFrameRef = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    },
    [],
  );

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const target = document.getElementById(href.slice(1));
    if (!target) return;

    event.preventDefault();
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const focusTarget = () => {
      window.history.pushState(null, "", href);
      target.focus({ preventScroll: true });
      animationFrameRef.current = null;
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      target.scrollIntoView();
      focusTarget();
      return;
    }

    const startY = window.scrollY;
    const documentMaxY = Math.max(
      document.documentElement.scrollHeight - window.innerHeight,
      0,
    );
    const targetY = Math.min(
      Math.max(target.getBoundingClientRect().top + startY, 0),
      documentMaxY,
    );
    const distance = targetY - startY;
    if (Math.abs(distance) < 1) {
      focusTarget();
      return;
    }

    const startedAt = performance.now();

    const scrollFrame = (now: number) => {
      const progress = Math.min((now - startedAt) / SCROLL_DURATION_MS, 1);
      window.scrollTo({ top: startY + distance * easeOutCubic(progress) });

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(scrollFrame);
        return;
      }

      focusTarget();
    };

    animationFrameRef.current = requestAnimationFrame(scrollFrame);
  };

  return <a href={href} onClick={handleClick} {...props} />;
}
