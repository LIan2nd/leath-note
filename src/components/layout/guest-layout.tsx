import * as React from "react";
import { ArrowRight } from "lucide-react";

import { LoginForm } from "~/components/auth/login-form";
import { SmoothAnchorLink } from "~/components/ui/smooth-anchor-link";
import { env } from "~/env";
import { siteConfig } from "~/lib/site-config";
import { GuestNotepad } from "./guest-notepad";

export function GuestLayout() {
  return (
    <div className="wood-background min-h-screen">
      <main className="mx-auto min-h-screen w-full max-w-[1240px] px-3 py-4 sm:px-6 lg:px-8 lg:py-6">
        <header className="guest-intro mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:mb-5">
          <div className="flex items-center gap-3">
            <img
              src={siteConfig.iconPath}
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 shrink-0"
            />
            <div>
              <p className="font-serif text-xs font-semibold uppercase tracking-[0.18em] text-[#e7c88f]">
                Leath Notes
              </p>
              <h1 className="mt-0.5 font-serif text-lg font-semibold sm:text-xl">
                A calm online notepad for everyday thoughts.
              </h1>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
            <p className="max-w-sm text-sm leading-5 text-[#eadfcf]">
              The paper is ready. Start with one thought and organize it whenever you wish.
            </p>
            <SmoothAnchorLink
              href="#sign-in"
              className="inline-flex min-h-11 shrink-0 items-center rounded-md px-2 py-2 text-sm font-semibold text-[#f1d59f] transition-colors hover:text-white sm:hidden"
            >
              Open my notes
            </SmoothAnchorLink>
          </div>
        </header>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
          <div className="min-w-0">
            <GuestNotepad />
          </div>
          <aside
            id="sign-in"
            tabIndex={-1}
            aria-label="Account access"
            className="scroll-mt-4 lg:sticky lg:top-6"
          >
            <React.Suspense fallback={null}>
              <LoginForm
                googleAvailable={Boolean(
                  env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET,
                )}
              />
            </React.Suspense>
            <SmoothAnchorLink
              href="#about-leath-notes"
              className="mx-auto mt-3 flex min-h-11 w-fit items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-[#f1d59f] transition-colors hover:text-white"
            >
              See what Leath adds
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </SmoothAnchorLink>
          </aside>
        </div>

        <section
          aria-labelledby="about-leath-notes"
          className="guest-about mx-auto mt-8 max-w-5xl rounded-2xl px-5 py-5 sm:px-7 sm:py-6 lg:mt-10"
        >
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-8">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#e7c88f]">
                A simple notepad, with room to grow
              </p>
              <h2
                id="about-leath-notes"
                tabIndex={-1}
                className="mt-2 font-serif text-xl font-semibold text-[#f3eadb] sm:text-2xl"
              >
                Writing stays simple. The helpful tools wait until you need them.
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#dfd2c0] sm:text-base">
                Leath Notes is a free browser-based notepad with a warm, paper-first workspace. Sign in to organize personal notes in folders, rely on autosave, and use the optional AI writing assistant without letting those tools get between you and a blank page.
              </p>
            </div>
            <ul
              className="flex flex-wrap gap-2 text-xs text-[#eadfcf] sm:max-w-56 sm:justify-end"
              aria-label="Leath Notes features"
            >
              <li className="guest-feature rounded-full px-3 py-2">Folders</li>
              <li className="guest-feature rounded-full px-3 py-2">Autosave</li>
              <li className="guest-feature rounded-full px-3 py-2">Optional AI</li>
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
