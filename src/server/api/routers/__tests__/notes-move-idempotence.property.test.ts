import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// Feature: note-folders, Property 5: Move idempotence

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

describe("Property 5: Move idempotence", () => {
  // **Validates: Requirements 4.5**

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("moving a note to the folder it already resides in is a no-op (note.update is NOT called)", async () => {
    const mockNoteFindFirst = vi.mocked(db.note.findFirst);
    const mockFolderFindFirst = vi.mocked(db.folder.findFirst);
    const mockUpdate = vi.mocked(db.note.update);

    await fc.assert(
      fc.asyncProperty(arbUserId, arbId, arbId, async (userId, noteId, folderId) => {
        const now = new Date();
        const existingNote = {
          id: noteId,
          title: "Test Note",
          content: "Some content",
          createdAt: now,
          updatedAt: now,
          userId,
          folderId, // Note is already in this folder
        };

        const existingFolder = {
          id: folderId,
          name: "Test Folder",
          createdAt: now,
          updatedAt: now,
          userId,
        };

        // Mock note.findFirst to return the note (ownership check passes)
        mockNoteFindFirst.mockResolvedValueOnce(existingNote as any);
        // Mock folder.findFirst to return the folder (folder ownership check passes)
        mockFolderFindFirst.mockResolvedValueOnce(existingFolder as any);

        const caller = createAuthenticatedCaller(userId);
        const result = await caller.notes.moveToFolder({
          noteId,
          folderId, // Same folder as current
        });

        // Verify note.update was NOT called (no-op)
        expect(mockUpdate).not.toHaveBeenCalled();

        // Verify the returned note is unchanged
        expect(result).toEqual(existingNote);
        expect(result.folderId).toBe(folderId);
        expect(result.id).toBe(noteId);
        expect(result.updatedAt).toEqual(now);
      }),
      { numRuns: 20 },
    );
  }, 30_000);

  it("moving a note already at root (folderId=null) to root is a no-op", async () => {
    const mockFindFirst = vi.mocked(db.note.findFirst);
    const mockUpdate = vi.mocked(db.note.update);

    await fc.assert(
      fc.asyncProperty(arbUserId, arbId, async (userId, noteId) => {
        const now = new Date();
        const existingNote = {
          id: noteId,
          title: "Root Note",
          content: "Content at root",
          createdAt: now,
          updatedAt: now,
          userId,
          folderId: null, // Note is at root level
        };

        // Mock findFirst to return the note (ownership check passes)
        mockFindFirst.mockResolvedValueOnce(existingNote as any);

        const caller = createAuthenticatedCaller(userId);
        const result = await caller.notes.moveToFolder({
          noteId,
          folderId: null, // Moving to root (same as current)
        });

        // Verify note.update was NOT called (no-op)
        expect(mockUpdate).not.toHaveBeenCalled();

        // Verify the returned note is unchanged
        expect(result).toEqual(existingNote);
        expect(result.folderId).toBeNull();
        expect(result.id).toBe(noteId);
        expect(result.updatedAt).toEqual(now);
      }),
      { numRuns: 20 },
    );
  }, 30_000);
});
