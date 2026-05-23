import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// Feature: note-folders, Property 10: Note count accuracy

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
 * Arbitrary: Generate a non-negative note count
 */
const arbNoteCount = fc.nat({ max: 100 });

/**
 * Arbitrary: Generate a folder name
 */
const arbFolderName = fc
  .stringMatching(/^[a-zA-Z][a-zA-Z0-9 ]{0,49}$/)
  .filter((s) => s.trim().length > 0);

describe("Property 10: Note count accuracy", () => {
  // **Validates: Requirements 5.5**

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("displayed note count equals actual notes with matching folderId", async () => {
    const mockFindMany = vi.mocked(db.folder.findMany);

    await fc.assert(
      fc.asyncProperty(
        arbUserId,
        fc.array(
          fc.record({
            name: arbFolderName,
            noteCount: arbNoteCount,
          }),
          { minLength: 1, maxLength: 20 }
        ),
        async (userId, folderSpecs) => {
          // Create mock folder records with _count matching the generated note counts
          const mockFolders = folderSpecs.map((spec, i) => ({
            id: `folder-${i}`,
            name: spec.name,
            createdAt: new Date("2024-01-01"),
            updatedAt: new Date("2024-01-01"),
            userId,
            _count: { notes: spec.noteCount },
          }));

          // Sort alphabetically as the DB would return them
          mockFolders.sort((a, b) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase())
          );

          mockFindMany.mockResolvedValueOnce(mockFolders as any);

          const caller = createAuthenticatedCaller(userId);
          const result = await caller.folders.list();

          // Verify each folder's _count.notes matches what was provided from the DB
          expect(result.length).toBe(mockFolders.length);
          for (let i = 0; i < result.length; i++) {
            expect(result[i]!._count.notes).toBe(mockFolders[i]!._count.notes);
          }
        }
      ),
      { numRuns: 20 }
    );
  }, 30_000);

  it("note counts are consistent with actual notes per folder", async () => {
    const mockFindMany = vi.mocked(db.folder.findMany);

    await fc.assert(
      fc.asyncProperty(
        arbUserId,
        fc.array(arbFolderName, { minLength: 1, maxLength: 10 }),
        fc.array(
          fc.record({
            id: fc.stringMatching(/^note-[a-z0-9]{5,10}$/),
            folderIndex: fc.nat({ max: 9 }),
          }),
          { minLength: 0, maxLength: 50 }
        ),
        async (userId, folderNames, noteSpecs) => {
          // Create folders
          const folders = folderNames.map((name, i) => ({
            id: `folder-${i}`,
            name,
            createdAt: new Date("2024-01-01"),
            updatedAt: new Date("2024-01-01"),
            userId,
          }));

          // Assign notes to folders (only valid folder indices)
          const notesPerFolder = new Map<string, number>();
          for (const folder of folders) {
            notesPerFolder.set(folder.id, 0);
          }

          for (const noteSpec of noteSpecs) {
            const folderIdx = noteSpec.folderIndex % folders.length;
            const folderId = folders[folderIdx]!.id;
            notesPerFolder.set(folderId, (notesPerFolder.get(folderId) ?? 0) + 1);
          }

          // Create mock folders with accurate _count based on actual note assignments
          const mockFolders = folders.map((folder) => ({
            ...folder,
            _count: { notes: notesPerFolder.get(folder.id) ?? 0 },
          }));

          // Sort alphabetically as the DB would return them
          mockFolders.sort((a, b) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase())
          );

          mockFindMany.mockResolvedValueOnce(mockFolders as any);

          const caller = createAuthenticatedCaller(userId);
          const result = await caller.folders.list();

          // Verify each folder's count matches the actual number of notes assigned to it
          for (const folder of result) {
            const expectedCount = notesPerFolder.get(folder.id) ?? 0;
            expect(folder._count.notes).toBe(expectedCount);
          }
        }
      ),
      { numRuns: 20 }
    );
  }, 30_000);
});
