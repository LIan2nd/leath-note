import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// Feature: note-folders, Property 1: Folder creation invariants

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
      updateMany: vi.fn(),
    },
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
 * Arbitrary: Generate a valid folder name (1-50 chars, non-empty after trim)
 */
const arbFolderName = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0);

describe("Property 1: Folder creation invariants", () => {
  // **Validates: Requirements 1.1, 1.3, 1.4**

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("created folders have non-empty id, correct default name, name ≤ 50 chars, correct userId, and valid timestamps", async () => {
    const mockCount = vi.mocked(db.folder.count);
    const mockCreate = vi.mocked(db.folder.create);

    await fc.assert(
      fc.asyncProperty(arbUserId, async (userId) => {
        const now = new Date();
        const expectedFolder = {
          id: `folder-${userId.slice(0, 8)}`,
          name: "Untitled Folder",
          createdAt: now,
          updatedAt: now,
          userId,
          _count: { notes: 0 },
        };

        // User has fewer than 50 folders
        mockCount.mockResolvedValueOnce(0);
        mockCreate.mockResolvedValueOnce(expectedFolder as any);

        const caller = createAuthenticatedCaller(userId);
        const result = await caller.folders.create({});

        // Verify create was called with correct data
        expect(mockCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              name: "Untitled Folder",
              userId,
            }),
          }),
        );

        // Verify the returned folder has non-empty id
        expect(result.id).toBeTruthy();
        expect(result.id.length).toBeGreaterThan(0);

        // Verify correct default name
        expect(result.name).toBe("Untitled Folder");

        // Verify name length ≤ 50
        expect(result.name.length).toBeLessThanOrEqual(50);

        // Verify correct userId
        expect(result.userId).toBe(userId);

        // Verify valid timestamps
        expect(result.createdAt).toBeInstanceOf(Date);
        expect(result.updatedAt).toBeInstanceOf(Date);
      }),
      { numRuns: 20 },
    );
  }, 30_000);

  it("created folders with custom names have name ≤ 50 chars and correct userId", async () => {
    const mockCount = vi.mocked(db.folder.count);
    const mockCreate = vi.mocked(db.folder.create);

    await fc.assert(
      fc.asyncProperty(arbUserId, arbFolderName, async (userId, folderName) => {
        const now = new Date();
        const expectedFolder = {
          id: `folder-${userId.slice(0, 8)}`,
          name: folderName,
          createdAt: now,
          updatedAt: now,
          userId,
          _count: { notes: 0 },
        };

        mockCount.mockResolvedValueOnce(0);
        mockCreate.mockResolvedValueOnce(expectedFolder as any);

        const caller = createAuthenticatedCaller(userId);
        const result = await caller.folders.create({ name: folderName });

        // Verify create was called with the provided name
        expect(mockCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              name: folderName,
              userId,
            }),
          }),
        );

        // Verify name length ≤ 50
        expect(result.name.length).toBeLessThanOrEqual(50);

        // Verify correct userId
        expect(result.userId).toBe(userId);

        // Verify valid timestamps
        expect(result.createdAt).toBeInstanceOf(Date);
        expect(result.updatedAt).toBeInstanceOf(Date);
      }),
      { numRuns: 20 },
    );
  }, 30_000);

  it("duplicate names are allowed for the same user", async () => {
    const mockCount = vi.mocked(db.folder.count);
    const mockCreate = vi.mocked(db.folder.create);

    await fc.assert(
      fc.asyncProperty(arbUserId, arbFolderName, async (userId, folderName) => {
        const now = new Date();

        // First folder creation
        const folder1 = {
          id: `folder-1-${userId.slice(0, 5)}`,
          name: folderName,
          createdAt: now,
          updatedAt: now,
          userId,
          _count: { notes: 0 },
        };

        // Second folder creation with same name
        const folder2 = {
          id: `folder-2-${userId.slice(0, 5)}`,
          name: folderName,
          createdAt: now,
          updatedAt: now,
          userId,
          _count: { notes: 0 },
        };

        // First creation: user has 0 folders
        mockCount.mockResolvedValueOnce(0);
        mockCreate.mockResolvedValueOnce(folder1 as any);

        // Second creation: user has 1 folder
        mockCount.mockResolvedValueOnce(1);
        mockCreate.mockResolvedValueOnce(folder2 as any);

        const caller = createAuthenticatedCaller(userId);

        // Both creations should succeed
        const result1 = await caller.folders.create({ name: folderName });
        const result2 = await caller.folders.create({ name: folderName });

        // Both should have the same name
        expect(result1.name).toBe(folderName);
        expect(result2.name).toBe(folderName);

        // But distinct IDs
        expect(result1.id).not.toBe(result2.id);

        // Both belong to the same user
        expect(result1.userId).toBe(userId);
        expect(result2.userId).toBe(userId);
      }),
      { numRuns: 20 },
    );
  }, 30_000);
});
