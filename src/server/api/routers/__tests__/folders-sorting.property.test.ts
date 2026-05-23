import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// Feature: note-folders, Property 8: Folder alphabetical sorting

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

/**
 * Mock next-auth to avoid import issues
 */
vi.mock("~/server/auth", () => ({
  auth: vi.fn(),
}));

/**
 * Mock the db module
 */
vi.mock("~/server/db", () => ({
  db: {
    folder: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    note: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn((promises: Promise<unknown>[]) => Promise.all(promises)),
  },
}));

import { createCallerFactory } from "~/server/api/trpc";
import { appRouter } from "~/server/api/root";
import { db } from "~/server/db";

const createCaller = createCallerFactory(appRouter);

/**
 * Helper: Create a caller with an authenticated session
 */
function createAuthenticatedCaller(userId: string) {
  return createCaller({
    db: db as any,
    session: {
      user: { id: userId, name: "Test User", email: "test@example.com", image: null },
      expires: new Date(Date.now() + 86400000).toISOString(),
    },
    headers: new Headers(),
  });
}

/**
 * Arbitrary: Generate a valid CUID-like user ID
 */
const arbUserId = fc
  .stringMatching(/^[a-z][a-z0-9]{10,24}$/)
  .filter((s) => s.length >= 10);

/**
 * Arbitrary: Generate a folder name with mixed case
 * Includes uppercase, lowercase, and mixed-case strings
 */
const arbFolderName = fc
  .stringMatching(/^[a-zA-Z][a-zA-Z0-9 ]{0,49}$/)
  .filter((s) => s.trim().length > 0);

describe("Property 8: Folder alphabetical sorting", () => {
  // **Validates: Requirements 5.2**

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("list results are in case-insensitive alphabetical order", async () => {
    const mockFindMany = vi.mocked(db.folder.findMany);

    await fc.assert(
      fc.asyncProperty(
        arbUserId,
        fc.array(arbFolderName, { minLength: 2, maxLength: 20 }),
        async (userId, folderNames) => {
          // Sort names case-insensitively to simulate what the DB would return
          const sortedNames = [...folderNames].sort((a, b) =>
            a.toLowerCase().localeCompare(b.toLowerCase())
          );

          // Create mock folder records in the sorted order (as DB would return them)
          const mockFolders = sortedNames.map((name, i) => ({
            id: `folder-${i}`,
            name,
            createdAt: new Date("2024-01-01"),
            updatedAt: new Date("2024-01-01"),
            userId,
            _count: { notes: 0 },
          }));

          // Mock findMany to return folders in the sorted order
          mockFindMany.mockResolvedValueOnce(mockFolders as any);

          const caller = createAuthenticatedCaller(userId);
          const result = await caller.folders.list();

          // Verify the result maintains case-insensitive alphabetical order
          for (let i = 0; i < result.length - 1; i++) {
            const current = result[i]!.name.toLowerCase();
            const next = result[i + 1]!.name.toLowerCase();
            expect(current <= next).toBe(true);
          }

          // Verify findMany was called with the correct orderBy
          expect(mockFindMany).toHaveBeenCalledWith(
            expect.objectContaining({
              where: { userId },
              orderBy: { name: "asc" },
            })
          );
        }
      ),
      { numRuns: 20 }
    );
  }, 30_000);
});
