import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// Feature: note-folders, Property 4: Note-folder assignment persistence

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
 * Arbitrary: Generate a valid CUID-like ID
 */
const arbId = fc
  .stringMatching(/^[a-z][a-z0-9]{10,24}$/)
  .filter((s) => s.length >= 10);

/**
 * Arbitrary: Generate a valid folder ID distinct from a given ID
 */
const arbDistinctIds = fc
  .tuple(arbId, arbId, arbId)
  .filter(([a, b, c]) => a !== b && a !== c && b !== c);

describe("Property 4: Note-folder assignment persistence", () => {
  // **Validates: Requirements 4.1, 4.2, 4.6**

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("moving a note to a folder sets folderId correctly", async () => {
    const mockNoteFindFirst = vi.mocked(db.note.findFirst);
    const mockFolderFindFirst = vi.mocked(db.folder.findFirst);
    const mockNoteUpdate = vi.mocked(db.note.update);

    await fc.assert(
      fc.asyncProperty(arbDistinctIds, async ([userId, noteId, folderId]) => {
        const now = new Date();

        // Note currently at root (folderId = null), owned by user
        const existingNote = {
          id: noteId,
          title: "Test Note",
          content: "Some content",
          createdAt: now,
          updatedAt: now,
          userId,
          folderId: null,
        };

        // Target folder owned by the same user
        const targetFolder = {
          id: folderId,
          name: "Target Folder",
          createdAt: now,
          updatedAt: now,
          userId,
        };

        // Updated note with new folderId
        const updatedNote = {
          ...existingNote,
          folderId,
        };

        // Mock: note ownership check returns the note
        mockNoteFindFirst.mockResolvedValueOnce(existingNote as any);
        // Mock: folder ownership check returns the folder
        mockFolderFindFirst.mockResolvedValueOnce(targetFolder as any);
        // Mock: note update returns note with new folderId
        mockNoteUpdate.mockResolvedValueOnce(updatedNote as any);

        const caller = createAuthenticatedCaller(userId);
        const result = await caller.notes.moveToFolder({ noteId, folderId });

        // Verify note.update was called with the correct folderId
        expect(mockNoteUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: noteId },
            data: { folderId },
          }),
        );

        // Verify the returned note has the correct folderId
        expect(result.folderId).toBe(folderId);
      }),
      { numRuns: 20 },
    );
  }, 30_000);

  it("moving a note to root sets folderId = null", async () => {
    const mockNoteFindFirst = vi.mocked(db.note.findFirst);
    const mockNoteUpdate = vi.mocked(db.note.update);

    await fc.assert(
      fc.asyncProperty(
        arbId,
        arbId,
        arbId,
        async (userId, noteId, currentFolderId) => {
          fc.pre(userId !== noteId && userId !== currentFolderId && noteId !== currentFolderId);

          const now = new Date();

          // Note currently in a folder, owned by user
          const existingNote = {
            id: noteId,
            title: "Test Note",
            content: "Some content",
            createdAt: now,
            updatedAt: now,
            userId,
            folderId: currentFolderId,
          };

          // Updated note with folderId = null (moved to root)
          const updatedNote = {
            ...existingNote,
            folderId: null,
          };

          // Mock: note ownership check returns the note
          mockNoteFindFirst.mockResolvedValueOnce(existingNote as any);
          // Mock: note update returns note with folderId = null
          mockNoteUpdate.mockResolvedValueOnce(updatedNote as any);

          const caller = createAuthenticatedCaller(userId);
          const result = await caller.notes.moveToFolder({ noteId, folderId: null });

          // Verify note.update was called with folderId = null
          expect(mockNoteUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
              where: { id: noteId },
              data: { folderId: null },
            }),
          );

          // Verify the returned note has folderId = null
          expect(result.folderId).toBeNull();
        },
      ),
      { numRuns: 20 },
    );
  }, 30_000);
});
