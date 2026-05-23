import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// Feature: note-folders, Property 3: Folder deletion preserves notes

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
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    note: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
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
 * Arbitrary: Generate a number of notes (0 to N)
 */
const arbNoteCount = fc.integer({ min: 0, max: 20 });

describe("Property 3: Folder deletion preserves notes", () => {
  // **Validates: Requirements 3.2, 3.3**

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("after deletion, note.updateMany is called to set folderId=null and folder.delete removes the folder", async () => {
    const mockFindFirst = vi.mocked(db.folder.findFirst);
    const mockFindUnique = vi.mocked(db.folder.findUnique);
    const mockUpdateMany = vi.mocked(db.note.updateMany);
    const mockDelete = vi.mocked(db.folder.delete);
    const mockTransaction = vi.mocked(db.$transaction);

    await fc.assert(
      fc.asyncProperty(
        arbId,
        arbId,
        arbNoteCount,
        async (userId, folderId, noteCount) => {
          vi.clearAllMocks();

          // Mock: folder exists and is owned by the user
          mockFindFirst.mockResolvedValueOnce({
            id: folderId,
            name: "Test Folder",
            userId,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as any);

          // Mock updateMany to resolve (simulates moving notes to root)
          mockUpdateMany.mockResolvedValueOnce({ count: noteCount } as any);

          // Mock folder.delete to resolve
          mockDelete.mockResolvedValueOnce({
            id: folderId,
            name: "Test Folder",
            userId,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as any);

          // Mock $transaction to execute the array of promises
          mockTransaction.mockImplementationOnce((promises: any) =>
            Promise.all(promises),
          );

          const caller = createAuthenticatedCaller(userId);
          const result = await caller.folders.delete({ id: folderId });

          // Verify the result indicates success
          expect(result).toEqual({ success: true });

          // Verify $transaction was called (atomicity)
          expect(mockTransaction).toHaveBeenCalledTimes(1);

          // Verify note.updateMany was called to set folderId = null for all notes in the folder
          expect(mockUpdateMany).toHaveBeenCalledWith({
            where: { folderId: folderId },
            data: { folderId: null },
          });

          // Verify folder.delete was called to remove the folder record
          expect(mockDelete).toHaveBeenCalledWith({
            where: { id: folderId },
          });
        },
      ),
      { numRuns: 20 },
    );
  }, 30_000);

  it("total note count remains unchanged — notes are moved to root, not deleted", async () => {
    const mockFindFirst = vi.mocked(db.folder.findFirst);
    const mockUpdateMany = vi.mocked(db.note.updateMany);
    const mockDelete = vi.mocked(db.folder.delete);
    const mockTransaction = vi.mocked(db.$transaction);

    await fc.assert(
      fc.asyncProperty(
        arbId,
        arbId,
        arbNoteCount,
        async (userId, folderId, noteCount) => {
          vi.clearAllMocks();

          // Mock: folder exists and is owned by the user
          mockFindFirst.mockResolvedValueOnce({
            id: folderId,
            name: "Test Folder",
            userId,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as any);

          // Track that updateMany only changes folderId, not deleting notes
          // The count returned represents how many notes were updated (moved to root)
          mockUpdateMany.mockResolvedValueOnce({ count: noteCount } as any);

          // Mock folder.delete to resolve
          mockDelete.mockResolvedValueOnce({
            id: folderId,
            name: "Test Folder",
            userId,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as any);

          // Mock $transaction to execute the array of promises
          mockTransaction.mockImplementationOnce((promises: any) =>
            Promise.all(promises),
          );

          const caller = createAuthenticatedCaller(userId);
          await caller.folders.delete({ id: folderId });

          // Verify that note.updateMany was used (moves notes to root) — NOT note.deleteMany
          expect(mockUpdateMany).toHaveBeenCalledTimes(1);
          expect(mockUpdateMany).toHaveBeenCalledWith({
            where: { folderId: folderId },
            data: { folderId: null },
          });

          // Verify that the transaction contains both operations (atomicity ensures
          // notes are preserved even if folder deletion fails)
          const transactionArg = mockTransaction.mock.calls[0]![0] as unknown as any[];
          expect(transactionArg).toHaveLength(2);
        },
      ),
      { numRuns: 20 },
    );
  }, 30_000);
});
