import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import { TRPCError } from "@trpc/server";

// Feature: note-folders, Property 6: Cross-owner move rejection

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
    note: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      updateMany: vi.fn(),
    },
    folder: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
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
 * Arbitrary: Generate a valid CUID-like ID for notes/folders
 */
const arbId = fc
  .stringMatching(/^[a-z][a-z0-9]{10,24}$/)
  .filter((s) => s.length >= 10);

describe("Property 6: Cross-owner move rejection", () => {
  // **Validates: Requirements 4.4, 6.3**

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("moving a note into another user's folder is rejected with FORBIDDEN and note stays in original location", async () => {
    const mockNoteFindFirst = vi.mocked(db.note.findFirst);
    const mockFolderFindFirst = vi.mocked(db.folder.findFirst);
    const mockNoteUpdate = vi.mocked(db.note.update);

    await fc.assert(
      fc.asyncProperty(
        arbUserId,
        arbUserId,
        arbId,
        arbId,
        arbId,
        async (userAId, userBId, noteId, originalFolderId, targetFolderId) => {
          // Ensure user A and user B are different
          fc.pre(userAId !== userBId);
          // Ensure the target folder is different from the original
          fc.pre(originalFolderId !== targetFolderId);

          // User A owns the note (currently in originalFolderId)
          mockNoteFindFirst.mockResolvedValueOnce({
            id: noteId,
            title: "Test Note",
            content: "Some content",
            createdAt: new Date(),
            updatedAt: new Date(),
            userId: userAId,
            folderId: originalFolderId,
          } as any);

          // Folder lookup returns null because the target folder is NOT owned by user A
          // (the procedure queries: { id: targetFolderId, userId: userAId })
          mockFolderFindFirst.mockResolvedValueOnce(null);

          const caller = createAuthenticatedCaller(userAId);

          // Attempt to move user A's note into user B's folder
          await expect(
            caller.notes.moveToFolder({ noteId, folderId: targetFolderId }),
          ).rejects.toMatchObject({
            code: "FORBIDDEN",
          });

          // Verify note.update was NOT called — note stays in original location
          expect(mockNoteUpdate).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 20 },
    );
  }, 30_000);
});
