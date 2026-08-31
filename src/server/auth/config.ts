import { PrismaAdapter } from "@auth/prisma-adapter";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { db } from "~/server/db";
import { env } from "~/env";

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
});

// Used when an email is unknown so invalid-email and invalid-password attempts
// both perform one bcrypt comparison and have similar response timing.
const DUMMY_PASSWORD_HASH =
  "$2b$12$TIP0yw2ksMOJa90ZCVyTPe4BlrjQrIJqQbfWurdMpRvV/pyjCeKPe";

const providers: NextAuthConfig["providers"] = [
  CredentialsProvider({
    name: "credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const parsed = loginSchema.safeParse(credentials);
      if (!parsed.success) return null;

      const { email, password } = parsed.data;
      const user = await db.user.findUnique({ where: { email } });
      const isValid = await bcrypt.compare(
        password,
        user?.password ?? DUMMY_PASSWORD_HASH,
      );
      if (!user?.password || !isValid) return null;

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
      };
    },
  }),
];

if (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
      // Google verifies account email addresses, so an existing credentials
      // account can safely gain Google as an additional sign-in method.
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authConfig = {
  providers,
  adapter: PrismaAdapter(db),
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.sub) {
        // "Better" Method: Selalu verifikasi user ke DB untuk mencegah stale session (ID hantu)
        // Ini juga berfungsi untuk menyinkronkan data profil terbaru dari DB ke Session.
        const user = await db.user.findUnique({
          where: { id: token.sub },
          select: { id: true, name: true, email: true, image: true },
        });

        if (user) {
          session.user.id = user.id;
          session.user.name = user.name ?? undefined;
          session.user.email = user.email ?? "";
          session.user.image = user.image ?? undefined;
        } else {
          // Keep the response fail-closed if a JWT outlives its database user.
          // The client treats a session without a user as unauthenticated and
          // protectedProcedure also rejects it.
          return { ...session, user: undefined } as unknown as typeof session;
        }
      }
      return session;
    },
  },
  pages: {
    // Redirect OAuth errors back to the home page where the inline login form lives.
    // NextAuth will append ?error=<ErrorCode> so the LoginForm can display the message.
    signIn: "/",
    error: "/",
  },
} satisfies NextAuthConfig;
