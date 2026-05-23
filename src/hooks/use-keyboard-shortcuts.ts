"use client";

import { useEffect } from "react";

interface KeyboardShortcutActions {
  toggleSidebar: () => void;
  toggleChat: () => void;
  newNote: () => void;
  closeModals: () => void;
  focusTitle: () => void;
  focusBody: () => void;
  prevNote: () => void;
  nextNote: () => void;
  saveNow: () => void;
}

/**
 * Global keyboard shortcuts for the notepad app.
 *
 * Shortcuts (using Alt to avoid browser conflicts):
 * - Ctrl+B           → Toggle sidebar
 * - Ctrl+J           → Toggle AI chat panel
 * - Alt+N            → New note (avoids Ctrl+N = new browser window)
 * - Ctrl+S           → Force save now
 * - Escape           → Close any open modal/panel
 * - Ctrl+Shift+T     → Focus title
 * - Ctrl+Shift+E     → Focus body/editor
 * - Alt+↑ / Alt+↓    → Navigate between notes (avoids Ctrl+↑/↓ = scroll)
 */
export function useKeyboardShortcuts(actions: KeyboardShortcutActions) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;
      const alt = e.altKey;
      const shift = e.shiftKey;
      const key = e.key.toLowerCase();

      // Escape — always works, closes modals/panels
      if (e.key === "Escape") {
        e.preventDefault();
        actions.closeModals();
        return;
      }

      // Alt-based shortcuts (no browser conflicts)
      if (alt && !ctrl) {
        switch (key) {
          case "n":
            e.preventDefault();
            actions.newNote();
            return;
          case "arrowup":
            e.preventDefault();
            actions.prevNote();
            return;
          case "arrowdown":
            e.preventDefault();
            actions.nextNote();
            return;
        }
      }

      // Ctrl shortcuts (only ones that don't conflict with browser)
      if (ctrl && !alt) {
        switch (key) {
          case "b":
            // Ctrl+B: no browser default (bold only in contenteditable)
            e.preventDefault();
            actions.toggleSidebar();
            return;
          case "j":
            // Ctrl+J: downloads page in Chrome, but rarely used — safe to override
            e.preventDefault();
            actions.toggleChat();
            return;
          case "s":
            // Ctrl+S: prevent browser "Save page" dialog
            e.preventDefault();
            actions.saveNow();
            return;
        }

        // Ctrl+Shift combos
        if (shift) {
          switch (key) {
            case "t":
              // Ctrl+Shift+T: reopens closed tab — but we override it
              // Alternative: users can use Ctrl+Shift+T in browser with another shortcut
              e.preventDefault();
              actions.focusTitle();
              return;
            case "e":
              e.preventDefault();
              actions.focusBody();
              return;
          }
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actions]);
}
