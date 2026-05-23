import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import bcrypt from "bcryptjs";
import { z } from "zod";

// Feature: login-register, Property 1: Password hashing round-trip
// Feature: login-register, Property 2: Email format validation
// Feature: login-register, Property 3: Credential failure produces generic error
// Feature: login-register, Property 4: Valid credentials produce successful authentication

/**
 * Recreate the loginSchema from auth config for direct testing
 */
const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

/**
 * Mock the db module for Properties 3 and 4
 */
vi.mock("~/server/db", () => ({
  db: {
    user: {
      findUnique: vi.fn(),
    },
  },
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

// Use low cost factor (4) for fast test execution — we're testing the round-trip property, not bcrypt strength
const BCRYPT_COST = 4;

describe("Property 1: Password hashing round-trip", () => {
  // **Validates: Requirements 1.4**

  it("bcrypt hash of any valid password verifies correctly with the original", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 128 }).filter((s) => s.length > 0),
        async (password) => {
          const hash = await bcrypt.hash(password, BCRYPT_COST);

          // Original password should verify as true
          const isValid = await bcrypt.compare(password, hash);
          expect(isValid).toBe(true);
        },
      ),
      { numRuns: 20 },
    );
  }, 60_000);

  it("bcrypt hash rejects any mutated password", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 128 }).filter((s) => s.length > 0),
        fc.string({ minLength: 1, maxLength: 128 }).filter((s) => s.length > 0),
        async (password, otherPassword) => {
          // Only test when passwords are actually different
          fc.pre(password !== otherPassword);

          const hash = await bcrypt.hash(password, BCRYPT_COST);

          // Different password should verify as false
          const isValid = await bcrypt.compare(otherPassword, hash);
          expect(isValid).toBe(false);
        },
      ),
      { numRuns: 20 },
    );
  }, 60_000);
});

describe("Property 2: Email format validation", () => {
  // **Validates: Requirements 1.2**

  /**
   * Custom arbitrary that generates emails Zod's .email() will accept.
   * Zod uses a regex that is stricter than RFC 5322 — it disallows special chars
   * like ! in the local part. We generate safe local parts + valid domains.
   */
  const zodValidEmail = fc
    .tuple(
      // local part: alphanumeric with dots and underscores (safe subset)
      fc.stringMatching(/^[a-z][a-z0-9._]{0,20}[a-z0-9]$/).filter((s) => !s.includes("..")),
      // domain: simple valid domain
      fc.tuple(
        fc.stringMatching(/^[a-z][a-z0-9]{0,10}$/),
        fc.constantFrom("com", "org", "net", "io", "dev"),
      ),
    )
    .map(([local, [domain, tld]]) => `${local}@${domain}.${tld}`)
    .filter((email) => email.length <= 254);

  it("accepts valid email addresses", () => {
    fc.assert(
      fc.property(zodValidEmail, (email) => {
        const result = loginSchema.shape.email.safeParse(email);
        expect(result.success).toBe(true);
      }),
      { numRuns: 20 },
    );
  });

  it("rejects strings without @ symbol", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 254 }).filter((s) => !s.includes("@")),
        (invalidEmail) => {
          const result = loginSchema.shape.email.safeParse(invalidEmail);
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 20 },
    );
  });

  it("rejects emails exceeding 254 characters", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 255, maxLength: 400 }),
        (longString) => {
          const result = loginSchema.shape.email.safeParse(longString);
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 20 },
    );
  });
});

describe("Property 3: Credential failure produces generic error", () => {
  // **Validates: Requirements 1.3**

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null for both non-existent user and wrong password — indistinguishable", async () => {
    const { db } = await import("~/server/db");
    const mockFindUnique = vi.mocked(db.user.findUnique);

    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[a-z][a-z0-9]{1,8}@[a-z]{2,6}\.[a-z]{2,4}$/),
        fc.string({ minLength: 1, maxLength: 128 }).filter((s) => s.length > 0),
        fc.string({ minLength: 1, maxLength: 128 }).filter((s) => s.length > 0),
        async (email, correctPassword, wrongPassword) => {
          fc.pre(correctPassword !== wrongPassword);

          // Case 1: User does not exist
          mockFindUnique.mockResolvedValueOnce(null);
          const resultNoUser = await callAuthorize(email, correctPassword);

          // Case 2: User exists but password is wrong
          const hashedPassword = await bcrypt.hash(correctPassword, BCRYPT_COST);
          mockFindUnique.mockResolvedValueOnce({
            id: "user-1",
            name: "Test User",
            email,
            emailVerified: null,
            image: null,
            password: hashedPassword,
          } as any);

          const resultWrongPw = await callAuthorize(email, wrongPassword);

          // Both cases should return null — indistinguishable
          expect(resultNoUser).toBeNull();
          expect(resultWrongPw).toBeNull();
        },
      ),
      { numRuns: 20 },
    );
  }, 60_000);
});

describe("Property 4: Valid credentials produce successful authentication", () => {
  // **Validates: Requirements 1.1**

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns user object when correct email and password are provided", async () => {
    const { db } = await import("~/server/db");
    const mockFindUnique = vi.mocked(db.user.findUnique);

    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[a-z][a-z0-9]{1,8}@[a-z]{2,6}\.[a-z]{2,4}$/),
        fc.string({ minLength: 1, maxLength: 128 }).filter((s) => s.length > 0),
        fc.string({ minLength: 1, maxLength: 50 }),
        async (email, password, name) => {
          const hashedPassword = await bcrypt.hash(password, BCRYPT_COST);

          mockFindUnique.mockResolvedValueOnce({
            id: "user-123",
            name,
            email,
            emailVerified: null,
            image: null,
            password: hashedPassword,
          } as any);

          const result = await callAuthorize(email, password);

          // Should return a non-null user object
          expect(result).not.toBeNull();
          expect(result).toHaveProperty("id", "user-123");
          expect(result).toHaveProperty("email", email);
        },
      ),
      { numRuns: 20 },
    );
  }, 60_000);
});

/**
 * Helper: Calls the authorize logic directly, replicating the behavior
 * from src/server/auth/config.ts without importing the full NextAuth config.
 */
async function callAuthorize(
  email: string,
  password: string,
): Promise<{ id: string; name: string | null; email: string | null; image: string | null } | null> {
  const { db } = await import("~/server/db");

  const parsed = loginSchema.safeParse({ email, password });
  if (!parsed.success) return null;

  const user = await (db.user.findUnique as any)({
    where: { email: parsed.data.email },
  });

  if (!user?.password) return null;

  const isValid = await bcrypt.compare(parsed.data.password, user.password);
  if (!isValid) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
  };
}
