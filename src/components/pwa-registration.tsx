"use client";

import { useEffect } from "react";

export function PWARegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || window.location.hostname === "localhost") return;

    const register = () => {
      void navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
        console.error("Service worker registration failed:", error);
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
