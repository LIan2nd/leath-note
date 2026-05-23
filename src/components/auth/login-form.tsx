"use client";

import * as React from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { z } from "zod";
import { Loader2 } from "lucide-react";

const emailSchema = z.string().email("Please enter a valid email address").max(254);

/** Map NextAuth error codes from URL params to user-friendly messages */
function getOAuthErrorMessage(errorCode: string | null): string | null {
  if (!errorCode) return null;
  switch (errorCode) {
    case "OAuthCallbackError":
    case "OAuthSignin":
    case "OAuthCreateAccount":
      return "Authentication failed. Please try again.";
    case "Callback":
      return "Authentication was cancelled.";
    case "AccessDenied":
      return "Access denied. You do not have permission to sign in.";
    case "Configuration":
      return "There is a problem with the server configuration.";
    default:
      return "Authentication failed. Please try again.";
  }
}

export function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Detect OAuth error from URL params (e.g., ?error=OAuthCallbackError)
  React.useEffect(() => {
    const urlError = searchParams.get("error");
    if (urlError) {
      setError(getOAuthErrorMessage(urlError));
    }
  }, [searchParams]);

  async function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Client-side email validation
    const result = emailSchema.safeParse(email);
    if (!result.success) {
      setError(result.error.errors[0]?.message ?? "Please enter a valid email address");
      return;
    }

    setIsLoading(true);

    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (res?.error) {
        setError("Invalid email or password");
        setPassword("");
      }
      // On success, session updates automatically via useSession() in parent
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setPassword("");
    } finally {
      setIsLoading(false);
    }
  }

  function handleGoogleSignIn() {
    setIsLoading(true);
    void signIn("google");
  }

  return (
    <div className="leather-background flex h-full w-full flex-col items-center justify-center rounded-lg p-6">
      <div className="w-full max-w-sm space-y-6">
        {/* Heading */}
        <h2 className="embossed-text text-center text-2xl">Sign In</h2>

        {/* Error message */}
        {error && (
          <div className="rounded border border-red-800/40 bg-red-900/20 px-3 py-2 text-center text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Credentials form */}
        <form onSubmit={handleCredentialsSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="login-email" className="settings-label">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={254}
              placeholder="you@example.com"
              disabled={isLoading}
              className="settings-input w-full"
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="login-password" className="settings-label">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={128}
              placeholder="••••••••"
              disabled={isLoading}
              className="settings-input w-full"
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn-skeuomorphic flex w-full items-center justify-center gap-2 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              "Login"
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-sm text-[#c8b89a] font-serif">or</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        {/* Google OAuth */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          className="btn-skeuomorphic flex w-full items-center justify-center gap-2 disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Redirecting...
            </>
          ) : (
            <>
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
              Sign in with Google
            </>
          )}
        </button>
      </div>
    </div>
  );
}
