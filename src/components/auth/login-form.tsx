"use client";

import * as React from "react";
import { signIn, type SignInResponse } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { Loader2, LockKeyhole } from "lucide-react";
import { ActionErrorMessage } from "~/components/ui/action-error-message";
import { AsyncStatusMessage } from "~/components/ui/async-status-message";

type AuthMethod = "credentials" | "google";

interface AuthError {
  method: AuthMethod;
  title: string;
  message: string;
}

const CREDENTIALS_LOADING_MESSAGES = [
  "Checking your account securely...",
  "This is taking a little longer than usual. Please keep this page open.",
  "If the request stays here, refresh the page and try signing in once more.",
] as const;

const GOOGLE_LOADING_MESSAGES = [
  "Preparing a secure handoff to Google...",
  "Google is taking a little longer to respond. This page will continue automatically.",
  "If Google does not open, refresh the page or use your existing email account.",
] as const;

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Please enter a valid email address")
  .max(254, "Email address is too long.");

/** Map Auth.js URL errors to a calm explanation and a useful next step. */
function getOAuthError(errorCode: string | null): AuthError | null {
  if (!errorCode) return null;

  const baseError = {
    method: "google" as const,
    title: "Google sign-in did not finish",
  };

  switch (errorCode) {
    case "OAuthCallbackError":
    case "OAuthSignin":
    case "OAuthCreateAccount":
      return {
        ...baseError,
        message: "Google could not complete the request. Try again, or use an existing email account.",
      };
    case "Callback":
      return {
        ...baseError,
        message: "The sign-in was cancelled. You can try again or keep using the scratchpad.",
      };
    case "AccessDenied":
      return {
        ...baseError,
        message: "Google did not grant access. Try again or use an existing email account.",
      };
    case "Configuration":
      return {
        ...baseError,
        title: "Google sign-in is unavailable",
        message: "This server cannot use Google right now. Use an existing email account or try again later.",
      };
    default:
      return {
        ...baseError,
        message: "The sign-in service returned an unexpected response. Try again in a moment.",
      };
  }
}

function getCredentialsError(response: SignInResponse | undefined): AuthError | null {
  if (response?.error === "CredentialsSignin") {
    return {
      method: "credentials",
      title: "That sign-in did not work",
      message: "The email or password does not match an existing account. Check both fields and try again.",
    };
  }

  if (!response || response.status >= 500 || response.error === "Configuration") {
    return {
      method: "credentials",
      title: "Sign-in service is unavailable",
      message: "The server could not finish this request. Wait a moment, then try again.",
    };
  }

  if (response.error || !response.ok || !response.url) {
    return {
      method: "credentials",
      title: "We could not sign you in",
      message: "The sign-in service returned an unexpected response. Check your details and try again.",
    };
  }

  return null;
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

interface LoginFormProps {
  googleAvailable?: boolean;
}

export function LoginForm({ googleAvailable = false }: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailInputRef = React.useRef<HTMLInputElement>(null);
  const passwordInputRef = React.useRef<HTMLInputElement>(null);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loadingMethod, setLoadingMethod] = React.useState<AuthMethod | null>(null);
  const [error, setError] = React.useState<AuthError | null>(null);
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const isLoading = loadingMethod !== null;

  const focusPasswordForRetry = React.useCallback(() => {
    window.requestAnimationFrame(() => passwordInputRef.current?.focus());
  }, []);

  // Detect OAuth error from URL params (e.g., ?error=OAuthCallbackError)
  React.useEffect(() => {
    const urlError = searchParams.get("error");
    if (urlError) {
      setError(getOAuthError(urlError));
    }
  }, [searchParams]);

  async function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEmailError(null);
    setPasswordError(null);

    // Client-side email validation
    const result = emailSchema.safeParse(email);
    if (!result.success) {
      setEmailError(
        result.error.errors[0]?.message ?? "Please enter a valid email address",
      );
      emailInputRef.current?.focus();
      return;
    }

    setEmail(result.data);

    if (!password) {
      setPasswordError("Enter your password to continue.");
      passwordInputRef.current?.focus();
      return;
    }

    setLoadingMethod("credentials");

    try {
      const res = await signIn("credentials", {
        email: result.data,
        password,
        redirect: false,
      });

      const signInError = getCredentialsError(res);
      if (signInError) {
        setError(signInError);
        setPassword("");
        focusPasswordForRetry();
        return;
      }

      router.refresh();
    } catch {
      setError({
        method: "credentials",
        title: "We could not reach the sign-in service",
        message: "Check your connection or wait a moment, then try again. Your page is still here.",
      });
      setPassword("");
      focusPasswordForRetry();
    } finally {
      setLoadingMethod(null);
    }
  }

  function handleGoogleSignIn() {
    setError(null);
    setLoadingMethod("google");
    void signIn("google").catch(() => {
      setError({
        method: "google",
        title: "Google sign-in could not open",
        message: "Check your connection, then try again. You can also use an existing email account.",
      });
      setLoadingMethod(null);
    });
  }

  return (
    <div className="leather-background flex w-full flex-col items-center justify-center rounded-xl border border-white/10 p-5 shadow-2xl sm:p-6">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center">
          <h2 className="embossed-text text-2xl">Make this space yours</h2>
          <p className="mt-2 text-sm leading-5 text-[#dfd2bd]">
            Sign in when you would like personal notes, folders, autosave, and optional AI help.
          </p>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-[#8b7355]/35 bg-black/20 px-3 py-2.5 text-sm leading-5 text-[#dfd2bd]">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[#e7c88f]" aria-hidden="true" />
          <span>Saved notes stay available only inside your account.</span>
        </div>

        {error?.method === "google" && (
          <ActionErrorMessage title={error.title} message={error.message} />
        )}

        {googleAvailable && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="btn-skeuomorphic flex w-full items-center justify-center gap-2 disabled:opacity-50"
            >
              {loadingMethod === "google" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Taking you to Google...
                </>
              ) : (
                <>
                  <GoogleIcon />
                  Continue with Google
                </>
              )}
            </button>
            <AsyncStatusMessage
              active={loadingMethod === "google"}
              messages={GOOGLE_LOADING_MESSAGES}
            />
            <p className="text-center text-xs leading-5 text-[#cdbda5]">
              New here? Your account is created automatically.
            </p>
          </div>
        )}

        {googleAvailable && (
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className="font-serif text-xs text-[#c8b89a]">
              or use an existing password
            </span>
            <div className="h-px flex-1 bg-white/10" />
          </div>
        )}

        {!googleAvailable && (
          <p className="rounded-lg border border-[#8b7355]/25 bg-black/10 px-3 py-2 text-center text-xs leading-5 text-[#cdbda5]">
            Google sign-in is not available on this server right now. You can still sign in with an existing email account.
          </p>
        )}

        <form onSubmit={handleCredentialsSubmit} className="space-y-4" aria-busy={isLoading} noValidate>
          <div className="space-y-2">
            <label htmlFor="login-email" className="settings-label">
              Email
            </label>
            <input
              id="login-email"
              ref={emailInputRef}
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailError(null);
              }}
              maxLength={254}
              placeholder="you@example.com"
              disabled={isLoading}
              className="settings-input w-full"
              autoComplete="email"
              aria-invalid={Boolean(emailError)}
              aria-describedby={emailError ? "login-email-error" : undefined}
            />
            {emailError && (
              <p
                id="login-email-error"
                role="alert"
                className="text-sm leading-5 text-red-200"
              >
                {emailError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="login-password" className="settings-label">
              Password
            </label>
            <input
              id="login-password"
              ref={passwordInputRef}
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordError(null);
              }}
              maxLength={128}
              placeholder="••••••••"
              disabled={isLoading}
              className="settings-input w-full"
              autoComplete="current-password"
              aria-invalid={Boolean(passwordError)}
              aria-describedby={passwordError ? "login-password-error" : undefined}
            />
            {passwordError && (
              <p
                id="login-password-error"
                role="alert"
                className="text-sm leading-5 text-red-200"
              >
                {passwordError}
              </p>
            )}
          </div>

          {error?.method === "credentials" && (
            <ActionErrorMessage title={error.title} message={error.message} />
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="btn-skeuomorphic flex w-full items-center justify-center gap-2 disabled:opacity-50"
          >
            {loadingMethod === "credentials" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Signing in...
              </>
            ) : (
              "Sign in with email"
            )}
          </button>

          <AsyncStatusMessage
            active={loadingMethod === "credentials"}
            messages={CREDENTIALS_LOADING_MESSAGES}
          />
        </form>

        <p className="text-center text-xs leading-5 text-[#cdbda5]">
          Just exploring? The scratchpad works without an account. When a thought matters, sign in before leaving to keep it.
        </p>
      </div>
    </div>
  );
}
