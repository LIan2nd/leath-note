import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// Feature: note-folders, Property 11: Note deletion does not cascade to folder

/**
 * **Validates: Requirements 7.2**
 *
 * WHEN a note is deleted, THE Folder_System SHALL remove the note-folder
 * association for that note without deleting or modifying the folder that contained it.
 */

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
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
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
 * Arbitrary: Generate a valid CUID-like ID
 */
const arbId = fc
  .stringMatching(/^[a-z][a-z0-9]{10,24}$/)
  .filter((s) => s.length >= 10);

/**
 * Arbitrary: Generate a folder name
 */
const arbFolderName = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);

describe("Property 11: Note deletion does not cascade to folder", () => {
  // **Validates: Requirements 7.2**

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deleting a note in a folder leaves the folder intact — folder.delete and folder.update are never called", async () => {
    const mockNoteFindFirst = vi.mocked(db.note.findFirst);
    const mockNoteDelete = vi.mocked(db.note.delete);
    const mockFolderDelete = vi.mocked(db.folder.delete);
    const mockFolderUpdate = vi.mocked(db.folder.update);

    await fc.assert(
      fc.asyncProperty(
        arbId,
        arbId,
        arbId,
        arbFolderName,
        async (userId, noteId, folderId, folderName) => {
          vi.clearAllMocks();

          // The note exists and belongs to the user, with a folderId set
          const noteRecord = {
            id: noteId,
            title: "Test Note",
            content: "Some content",
            createdAt: new Date(),
            updatedAt: new Date(),
            userId,
            folderId,
          };

          // Mock note.findFirst to return the note (ownership check passes)
          mockNoteFindFirst.mockResolvedValueOnce(noteRecord as any);

          // Mock note.delete to return the deleted note
          mockNoteDelete.mockResolvedValueOnce(noteRecord as any);

          const caller = createAuthenticatedCaller(userId);
          const result = await caller.notes.delete({ id: noteId });

          // The note was deleted successfully
          expect(result).toEqual(noteRecord);

          // The delete procedure should have called note.delete
          expect(mockNoteDelete).toHaveBeenCalledWith(
            expect.objectContaining({
              where: { id: noteId },
            }),
          );

          // CRITICAL: folder.delete was NOT called — the folder remains intact
          expect(mockFolderDelete).not.toHaveBeenCalled();

          // CRITICAL: folder.update was NOT called — the folder is not modified
          expect(mockFolderUpdate).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 20 },
    );
  }, 30_000);
});
