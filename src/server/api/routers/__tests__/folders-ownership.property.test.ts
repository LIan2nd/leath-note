import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import { TRPCError } from "@trpc/server";

// Feature: note-folders, Property 7: Ownership isolation

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
 * Helper: Create a caller with no session (unauthenticated)
 */
function createUnauthenticatedCaller() {
  return createCaller({
    db: db as any,
    session: null,
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
 * Arbitrary: Generate a valid folder name (1-50 chars, non-whitespace-only)
 */
const arbFolderName = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0);

describe("Property 7: Ownership isolation", () => {
  // **Validates: Requirements 6.2, 6.3, 6.4, 6.5**

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Unauthenticated requests are rejected", () => {
    it("list procedure throws UNAUTHORIZED without a session", async () => {
      await fc.assert(
        fc.asyncProperty(fc.constant(null), async () => {
          const caller = createUnauthenticatedCaller();

          await expect(caller.folders.list()).rejects.toMatchObject({
            code: "UNAUTHORIZED",
          });
        }),
        { numRuns: 20 },
      );
    }, 30_000);

    it("create procedure throws UNAUTHORIZED without a session", async () => {
      await fc.assert(
        fc.asyncProperty(arbFolderName, async (name) => {
          const caller = createUnauthenticatedCaller();

          await expect(
            caller.folders.create({ name }),
          ).rejects.toMatchObject({
            code: "UNAUTHORIZED",
          });

          // Verify no data modification occurred
          expect(db.folder.count).not.toHaveBeenCalled();
          expect(db.folder.create).not.toHaveBeenCalled();
        }),
        { numRuns: 20 },
      );
    }, 30_000);

    it("rename procedure throws UNAUTHORIZED without a session", async () => {
      await fc.assert(
        fc.asyncProperty(arbUserId, arbFolderName, async (folderId, name) => {
          const caller = createUnauthenticatedCaller();

          await expect(
            caller.folders.rename({ id: folderId, name }),
          ).rejects.toMatchObject({
            code: "UNAUTHORIZED",
          });

          // Verify no data modification occurred
          expect(db.folder.findFirst).not.toHaveBeenCalled();
          expect(db.folder.update).not.toHaveBeenCalled();
        }),
        { numRuns: 20 },
      );
    }, 30_000);

    it("delete procedure throws UNAUTHORIZED without a session", async () => {
      await fc.assert(
        fc.asyncProperty(arbUserId, async (folderId) => {
          const caller = createUnauthenticatedCaller();

          await expect(
            caller.folders.delete({ id: folderId }),
          ).rejects.toMatchObject({
            code: "UNAUTHORIZED",
          });

          // Verify no data modification occurred
          expect(db.folder.findFirst).not.toHaveBeenCalled();
          expect(db.folder.delete).not.toHaveBeenCalled();
        }),
        { numRuns: 20 },
      );
    }, 30_000);
  });

  describe("Listing returns only own folders", () => {
    it("list query calls findMany with the authenticated user's ID filter", async () => {
      const mockFindMany = vi.mocked(db.folder.findMany);

      await fc.assert(
        fc.asyncProperty(
          arbUserId,
          arbUserId,
          fc.array(arbFolderName, { minLength: 0, maxLength: 5 }),
          async (userAId, userBId, folderNames) => {
            fc.pre(userAId !== userBId);

            // Simulate DB returning only user A's folders
            const userAFolders = folderNames.map((name, i) => ({
              id: `folder-a-${i}`,
              name,
              createdAt: new Date(),
              updatedAt: new Date(),
              userId: userAId,
              _count: { notes: 0 },
            }));

            mockFindMany.mockResolvedValueOnce(userAFolders as any);

            const caller = createAuthenticatedCaller(userAId);
            const result = await caller.folders.list();

            // Verify findMany was called with the correct userId filter
            expect(mockFindMany).toHaveBeenCalledWith(
              expect.objectContaining({
                where: { userId: userAId },
              }),
            );

            // Verify all returned folders belong to user A
            for (const folder of result) {
              expect((folder as any).userId).toBe(userAId);
            }

            // Verify no folders from user B are returned
            for (const folder of result) {
              expect((folder as any).userId).not.toBe(userBId);
            }
          },
        ),
        { numRuns: 20 },
      );
    }, 30_000);
  });

  describe("Cross-user rename is rejected with FORBIDDEN", () => {
    it("rename throws FORBIDDEN when user A tries to rename user B's folder", async () => {
      const mockFindFirst = vi.mocked(db.folder.findFirst);
      const mockFindUnique = vi.mocked(db.folder.findUnique);
      const mockUpdate = vi.mocked(db.folder.update);

      await fc.assert(
        fc.asyncProperty(
          arbUserId,
          arbUserId,
          arbUserId,
          arbFolderName,
          async (userAId, userBId, folderId, newName) => {
            fc.pre(userAId !== userBId);

            // findFirst returns null (folder not owned by user A)
            mockFindFirst.mockResolvedValueOnce(null);
            // findUnique returns the folder (it exists, belongs to user B)
            mockFindUnique.mockResolvedValueOnce({
              id: folderId,
              name: "Original Name",
              createdAt: new Date(),
              updatedAt: new Date(),
              userId: userBId,
            } as any);

            const caller = createAuthenticatedCaller(userAId);

            await expect(
              caller.folders.rename({ id: folderId, name: newName }),
            ).rejects.toMatchObject({
              code: "FORBIDDEN",
            });

            // Verify the folder was NOT updated
            expect(mockUpdate).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 20 },
      );
    }, 30_000);
  });

  describe("Cross-user delete is rejected with FORBIDDEN", () => {
    it("delete throws FORBIDDEN when user A tries to delete user B's folder", async () => {
      const mockFindFirst = vi.mocked(db.folder.findFirst);
      const mockFindUnique = vi.mocked(db.folder.findUnique);
      const mockDelete = vi.mocked(db.folder.delete);
      const mockTransaction = vi.mocked(db.$transaction);

      await fc.assert(
        fc.asyncProperty(
          arbUserId,
          arbUserId,
          arbUserId,
          async (userAId, userBId, folderId) => {
            fc.pre(userAId !== userBId);

            // findFirst returns null (folder not owned by user A)
            mockFindFirst.mockResolvedValueOnce(null);
            // findUnique returns the folder (it exists, belongs to user B)
            mockFindUnique.mockResolvedValueOnce({
              id: folderId,
              name: "Some Folder",
              createdAt: new Date(),
              updatedAt: new Date(),
              userId: userBId,
            } as any);

            const caller = createAuthenticatedCaller(userAId);

            await expect(
              caller.folders.delete({ id: folderId }),
            ).rejects.toMatchObject({
              code: "FORBIDDEN",
            });

            // Verify the folder was NOT deleted
            expect(mockDelete).not.toHaveBeenCalled();
            expect(mockTransaction).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 20 },
      );
    }, 30_000);
  });
});
