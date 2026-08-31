import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";

import { useModalFocus } from "../use-modal-focus";

function FocusTestDialog() {
  const [isOpen, setIsOpen] = React.useState(false);
  const dialogRef = useModalFocus(isOpen);

  return (
    <>
      <button onClick={() => setIsOpen(true)}>Open dialog</button>
      {isOpen && (
        <div ref={dialogRef} role="dialog" aria-label="Test dialog">
          <button onClick={() => setIsOpen(false)}>Close dialog</button>
          <button>Last action</button>
        </div>
      )}
    </>
  );
}

describe("useModalFocus", () => {
  it("moves focus into the dialog, traps Tab, and restores the trigger", async () => {
    render(<FocusTestDialog />);
    const trigger = screen.getByRole("button", { name: "Open dialog" });

    trigger.focus();
    fireEvent.click(trigger);

    const closeButton = screen.getByRole("button", { name: "Close dialog" });
    const lastButton = screen.getByRole("button", { name: "Last action" });
    await waitFor(() => expect(closeButton).toHaveFocus());

    lastButton.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(lastButton).toHaveFocus();

    fireEvent.click(closeButton);
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
