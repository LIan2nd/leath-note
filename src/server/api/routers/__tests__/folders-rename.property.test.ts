import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import { TRPCError } from "@trpc/server";

// Feature: note-folders, Property 2: Folder name trimming and whitespace rejection

/**
 * **Validates: Requirements 2.2, 2.3**
 *
 * Property 2: For any string with leading or trailing whitespace submitted as a
 * folder rename, the stored name SHALL equal the trimmed version. For any string
 * composed entirely of whitespace characters, the rename operation SHALL be
 * rejected and the folder name SHALL remain unchanged.
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

vi.mock("~/server/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("~/server/db", () => ({
  db: {
    folder: {
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    note: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn((promises: Promise<unknown>[]) => Promise.all(promises)),
  },
}));

import { createCallerFactory } from "~/server/api/trpc";
import { appRouter } from "~/server/api/root";
import { db } from "~/server/db";

const createCaller = createCallerFactory(appRouter);

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

const arbUserId = fc
  .stringMatching(/^[a-z][a-z0-9]{10,24}$/)
  .filter((s) => s.length >= 10);

const arbFolderId = fc
  .stringMatching(/^[a-z][a-z0-9]{10,24}$/)
  .filter((s) => s.length >= 10);

describe("Feature: note-folders, Property 2: Folder name trimming and whitespace rejection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("names with leading/trailing whitespace are stored trimmed", async () => {
    const mockFindFirst = vi.mocked(db.folder.findFirst);
    const mockUpdate = vi.mocked(db.folder.update);

    // Generate whitespace strings using array of whitespace chars joined together
    const arbWhitespace = fc
      .array(fc.constantFrom(" ", "\t"), { minLength: 1, maxLength: 5 })
      .map((arr) => arr.join(""));

    // Generate a non-empty core string that has non-whitespace content
    const arbCore = fc
      .string({ minLength: 1, maxLength: 40 })
      .filter((s) => s.trim().length > 0);

    await fc.assert(
      fc.asyncProperty(
        arbUserId,
        arbFolderId,
        arbWhitespace,
        arbCore,
        arbWhitespace,
        async (userId, folderId, leadingWs, core, trailingWs) => {
          const nameWithWhitespace = leadingWs + core + trailingWs;
          const expectedTrimmed = nameWithWhitespace.trim();

          // Precondition: trimmed name is non-empty and within max length
          fc.pre(expectedTrimmed.length > 0 && expectedTrimmed.length <= 50);

          // Mock: folder exists and is owned by user
          mockFindFirst.mockResolvedValueOnce({
            id: folderId,
            name: "Old Name",
            userId,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as any);

          // Mock: update returns folder with trimmed name
          mockUpdate.mockResolvedValueOnce({
            id: folderId,
            name: expectedTrimmed,
            userId,
            createdAt: new Date(),
            updatedAt: new Date(),
            _count: { notes: 0 },
          } as any);

          const caller = createAuthenticatedCaller(userId);
          const result = await caller.folders.rename({
            id: folderId,
            name: nameWithWhitespace,
          });

          // The stored name should be the trimmed version
          expect(result.name).toBe(expectedTrimmed);

          // Verify update was called with trimmed name
          expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
              data: { name: expectedTrimmed },
            }),
          );
        },
      ),
      { numRuns: 20 },
    );
  }, 30_000);

  it("all-whitespace names are rejected with BAD_REQUEST", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbUserId,
        arbFolderId,
        fc.array(fc.constantFrom(" ", "\t", "  ", "   "), { minLength: 1, maxLength: 10 })
          .map((arr) => arr.join("")),
        async (userId, folderId, whitespaceOnlyName) => {
          const caller = createAuthenticatedCaller(userId);

          await expect(
            caller.folders.rename({ id: folderId, name: whitespaceOnlyName }),
          ).rejects.toMatchObject({
            code: "BAD_REQUEST",
          });

          // Verify no update was performed
          expect(db.folder.update).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 20 },
    );
  }, 30_000);
});
