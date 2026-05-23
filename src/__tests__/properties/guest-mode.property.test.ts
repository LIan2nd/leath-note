import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import { render, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
import React from "react";

// Feature: login-register, Property 9: Guest mode does not persist data

/**
 * Mock next-auth/react to prevent import errors in jsdom
 */
vi.mock("next-auth/react", () => ({
  useSession: vi.fn(() => ({ data: null, status: "unauthenticated" })),
  signIn: vi.fn(),
  signOut: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

/**
 * Mock next/navigation to provide useSearchParams in test environment
 */
vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(() => new URLSearchParams()),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() })),
  usePathname: vi.fn(() => "/"),
}));

/**
 * Mock the env module to avoid validation errors in test
 */
vi.mock("~/env", () => ({
  env: {
    AUTH_GOOGLE_ID: "test-google-id",
    AUTH_GOOGLE_SECRET: "test-google-secret",
    AUTH_SECRET: "test-secret",
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    NODE_ENV: "test",
  },
}));

describe("Property 9: Guest mode does not persist data", () => {
  // **Validates: Requirements 2.6**

  let fetchSpy: ReturnType<typeof vi.fn>;
  let xhrOpenSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Mock global fetch to track any API calls
    fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof global.fetch;

    // Mock XMLHttpRequest.open to track any XHR calls
    xhrOpenSpy = vi.fn();
    global.XMLHttpRequest = vi.fn(() => ({
      open: xhrOpenSpy,
      send: vi.fn(),
      setRequestHeader: vi.fn(),
      addEventListener: vi.fn(),
    })) as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("no fetch calls are made when typing content in the guest notepad", async () => {
    const { GuestNotepad } = await import("~/components/layout/guest-notepad");

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 500 }),
        (content) => {
          cleanup();
          fetchSpy.mockClear();
          xhrOpenSpy.mockClear();

          const { getByPlaceholderText } = render(React.createElement(GuestNotepad));

          const contentTextarea = getByPlaceholderText("Start typing your note...");
          fireEvent.change(contentTextarea, { target: { value: content } });

          // No fetch or XHR calls should have been made
          expect(fetchSpy).not.toHaveBeenCalled();
          expect(xhrOpenSpy).not.toHaveBeenCalled();

          cleanup();
        },
      ),
      { numRuns: 20 },
    );
  });

  it("no fetch calls are made when typing title in the guest notepad", async () => {
    const { GuestNotepad } = await import("~/components/layout/guest-notepad");

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        (title) => {
          cleanup();
          fetchSpy.mockClear();
          xhrOpenSpy.mockClear();

          const { getByPlaceholderText } = render(React.createElement(GuestNotepad));

          const titleTextarea = getByPlaceholderText("Untitled Note");
          fireEvent.change(titleTextarea, { target: { value: title } });

          // No fetch or XHR calls should have been made
          expect(fetchSpy).not.toHaveBeenCalled();
          expect(xhrOpenSpy).not.toHaveBeenCalled();

          cleanup();
        },
      ),
      { numRuns: 20 },
    );
  });

  it("no API calls are made when typing both title and content in sequence", async () => {
    const { GuestNotepad } = await import("~/components/layout/guest-notepad");

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.string({ minLength: 1, maxLength: 500 }),
        (title, content) => {
          cleanup();
          fetchSpy.mockClear();
          xhrOpenSpy.mockClear();

          const { getByPlaceholderText } = render(React.createElement(GuestNotepad));

          const titleTextarea = getByPlaceholderText("Untitled Note");
          const contentTextarea = getByPlaceholderText("Start typing your note...");

          fireEvent.change(titleTextarea, { target: { value: title } });
          fireEvent.change(contentTextarea, { target: { value: content } });

          // No fetch or XHR calls should have been made
          expect(fetchSpy).not.toHaveBeenCalled();
          expect(xhrOpenSpy).not.toHaveBeenCalled();

          cleanup();
        },
      ),
      { numRuns: 20 },
    );
  });
});


// Feature: login-register, Property 10: Failed login preserves email input

describe("Property 10: Failed login preserves email input", () => {
  // **Validates: Requirements 4.6**

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("after a failed login attempt, the email input retains the original email and password is cleared", async () => {
    // Configure signIn mock to simulate failed credentials login
    const { signIn } = await import("next-auth/react");
    const signInMock = vi.mocked(signIn);

    const { LoginForm } = await import("~/components/auth/login-form");

    // Generate emails that pass Zod's z.string().email() validation
    // Use simple pattern: word chars only (no dots in local part to avoid edge cases)
    const zodValidEmail = fc
      .tuple(
        // Local part: simple alphanumeric (2-12 chars, no dots to avoid Zod rejection)
        fc.stringMatching(/^[a-z][a-z0-9]{1,11}$/),
        // Domain: simple valid domain
        fc.stringMatching(/^[a-z][a-z0-9]{1,8}$/),
        // TLD: 2-4 lowercase letters
        fc.stringMatching(/^[a-z]{2,4}$/),
      )
      .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

    await fc.assert(
      fc.asyncProperty(
        zodValidEmail,
        // Generate random passwords (non-empty, printable ASCII only)
        fc.stringMatching(/^[a-zA-Z0-9!@#$%^&*]{1,32}$/),
        async (email, password) => {
          cleanup();
          signInMock.mockClear();
          signInMock.mockResolvedValue({
            error: "CredentialsSignin",
            ok: false,
            status: 401,
            url: null,
          } as any);

          const { container } = render(React.createElement(LoginForm));

          const emailInput = container.querySelector("#login-email") as HTMLInputElement;
          const passwordInput = container.querySelector("#login-password") as HTMLInputElement;

          // Type email and password
          fireEvent.change(emailInput, { target: { value: email } });
          fireEvent.change(passwordInput, { target: { value: password } });

          // Submit the form
          const loginButton = container.querySelector('button[type="submit"]') as HTMLButtonElement;
          await act(async () => {
            fireEvent.click(loginButton);
          });

          // Wait for the async signIn to resolve and state to update
          await waitFor(() => {
            expect(passwordInput.value).toBe("");
          });

          // Verify email is preserved after failed login
          expect(emailInput.value).toBe(email);
        },
      ),
      { numRuns: 20 },
    );
  }, 60000);
});
