import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import { TRPCError } from "@trpc/server";

// Feature: login-register, Property 5: Note data isolation — fetch returns only owned notes
// Feature: login-register, Property 6: Note creation assigns authenticated user's ID
// Feature: login-register, Property 7: Unauthenticated requests are rejected
// Feature: login-register, Property 8: Cross-user note operations are forbidden

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
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
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
 * Arbitrary: Generate a note object
 */
const arbNote = (userId: string) =>
  fc.record({
    id: arbUserId,
    title: fc.string({ minLength: 0, maxLength: 100 }),
    content: fc.string({ minLength: 0, maxLength: 500 }),
    createdAt: fc.date({ min: new Date("2020-01-01"), max: new Date("2030-01-01") }),
    updatedAt: fc.date({ min: new Date("2020-01-01"), max: new Date("2030-01-01") }),
    userId: fc.constant(userId),
  });

describe("Property 5: Note data isolation — fetch returns only owned notes", () => {
  // **Validates: Requirements 3.1, 5.2**

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("list query returns only notes belonging to the authenticated user, sorted by updatedAt desc", async () => {
    const mockFindMany = vi.mocked(db.note.findMany);

    await fc.assert(
      fc.asyncProperty(
        arbUserId,
        arbUserId,
        fc.array(fc.date({ min: new Date("2020-01-01"), max: new Date("2030-01-01") }), {
          minLength: 1,
          maxLength: 10,
        }),
        fc.array(fc.date({ min: new Date("2020-01-01"), max: new Date("2030-01-01") }), {
          minLength: 0,
          maxLength: 5,
        }),
        async (userAId, userBId, userADates, userBDates) => {
          fc.pre(userAId !== userBId);

          // Create notes for user A (sorted by updatedAt desc as the DB would return)
          // Note: the list procedure uses `select` which omits userId from the result
          const userANotes = userADates
            .map((date, i) => ({
              id: `note-a-${i}`,
              title: `Note A ${i}`,
              content: `Content A ${i}`,
              createdAt: date,
              updatedAt: date,
            }))
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

          // Mock findMany to simulate DB filtering: return only user A's notes
          // Cast needed because the procedure uses `select` which narrows the return type
          mockFindMany.mockResolvedValueOnce(userANotes as any);

          const caller = createAuthenticatedCaller(userAId);
          const result = await caller.notes.list();

          // Verify only user A's notes are returned
          expect(result).toHaveLength(userANotes.length);
          expect(result).toEqual(userANotes);

          // Verify findMany was called with the correct userId filter
          expect(mockFindMany).toHaveBeenCalledWith(
            expect.objectContaining({
              where: { userId: userAId },
              orderBy: { updatedAt: "desc" },
            }),
          );
        },
      ),
      { numRuns: 20 },
    );
  }, 30_000);
});

describe("Property 6: Note creation assigns authenticated user's ID", () => {
  // **Validates: Requirements 3.5, 5.3**

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("create mutation sets userId to the authenticated user's ID for any valid title and content", async () => {
    const mockCreate = vi.mocked(db.note.create);

    await fc.assert(
      fc.asyncProperty(
        arbUserId,
        fc.string({ minLength: 0, maxLength: 100 }),
        fc.string({ minLength: 0, maxLength: 500 }),
        async (userId, title, content) => {
          const expectedNote = {
            id: "new-note-id",
            title: title || "Untitled",
            content: content || "",
            createdAt: new Date(),
            updatedAt: new Date(),
            userId,
            folderId: null,
          };

          mockCreate.mockResolvedValueOnce(expectedNote);

          const caller = createAuthenticatedCaller(userId);
          const result = await caller.notes.create({
            title: title || undefined,
            content: content || undefined,
          });

          // Verify create was called with the authenticated user's ID
          expect(mockCreate).toHaveBeenCalledWith(
            expect.objectContaining({
              data: expect.objectContaining({
                userId,
              }),
            }),
          );

          // Verify the returned note has the correct userId
          expect(result.userId).toBe(userId);
        },
      ),
      { numRuns: 20 },
    );
  }, 30_000);
});

describe("Property 7: Unauthenticated requests are rejected", () => {
  // **Validates: Requirements 5.4**

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("list procedure throws UNAUTHORIZED without a session", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        const caller = createUnauthenticatedCaller();

        await expect(caller.notes.list()).rejects.toThrow(TRPCError);
        await expect(caller.notes.list()).rejects.toMatchObject({
          code: "UNAUTHORIZED",
        });
      }),
      { numRuns: 20 },
    );
  }, 30_000);

  it("create procedure throws UNAUTHORIZED without a session", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 0, maxLength: 200 }),
        async (title, content) => {
          const caller = createUnauthenticatedCaller();

          await expect(
            caller.notes.create({ title, content }),
          ).rejects.toMatchObject({
            code: "UNAUTHORIZED",
          });

          // Verify no data modification occurred
          expect(db.note.create).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 20 },
    );
  }, 30_000);

  it("update procedure throws UNAUTHORIZED without a session", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbUserId,
        fc.string({ minLength: 1, maxLength: 50 }),
        async (noteId, title) => {
          const caller = createUnauthenticatedCaller();

          await expect(
            caller.notes.update({ id: noteId, title }),
          ).rejects.toMatchObject({
            code: "UNAUTHORIZED",
          });

          // Verify no data modification occurred
          expect(db.note.update).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 20 },
    );
  }, 30_000);

  it("delete procedure throws UNAUTHORIZED without a session", async () => {
    await fc.assert(
      fc.asyncProperty(arbUserId, async (noteId) => {
        const caller = createUnauthenticatedCaller();

        await expect(
          caller.notes.delete({ id: noteId }),
        ).rejects.toMatchObject({
          code: "UNAUTHORIZED",
        });

        // Verify no data modification occurred
        expect(db.note.delete).not.toHaveBeenCalled();
      }),
      { numRuns: 20 },
    );
  }, 30_000);
});

describe("Property 8: Cross-user note operations are forbidden", () => {
  // **Validates: Requirements 5.5**

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("update throws FORBIDDEN when user A tries to update user B's note", async () => {
    const mockFindFirst = vi.mocked(db.note.findFirst);
    const mockFindUnique = vi.mocked(db.note.findUnique);
    const mockUpdate = vi.mocked(db.note.update);

    await fc.assert(
      fc.asyncProperty(
        arbUserId,
        arbUserId,
        arbUserId,
        fc.string({ minLength: 1, maxLength: 50 }),
        async (userAId, userBId, noteId, newTitle) => {
          fc.pre(userAId !== userBId);

          // findFirst returns null (note not owned by user A)
          mockFindFirst.mockResolvedValueOnce(null);
          // findUnique returns the note (it exists, belongs to user B)
          mockFindUnique.mockResolvedValueOnce({
            id: noteId,
            title: "Original Title",
            content: "Original Content",
            createdAt: new Date(),
            updatedAt: new Date(),
            userId: userBId,
          } as any);

          const caller = createAuthenticatedCaller(userAId);

          await expect(
            caller.notes.update({ id: noteId, title: newTitle }),
          ).rejects.toMatchObject({
            code: "FORBIDDEN",
          });

          // Verify the note was NOT updated
          expect(mockUpdate).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 20 },
    );
  }, 30_000);

  it("delete throws FORBIDDEN when user A tries to delete user B's note", async () => {
    const mockFindFirst = vi.mocked(db.note.findFirst);
    const mockFindUnique = vi.mocked(db.note.findUnique);
    const mockDelete = vi.mocked(db.note.delete);

    await fc.assert(
      fc.asyncProperty(
        arbUserId,
        arbUserId,
        arbUserId,
        async (userAId, userBId, noteId) => {
          fc.pre(userAId !== userBId);

          // findFirst returns null (note not owned by user A)
          mockFindFirst.mockResolvedValueOnce(null);
          // findUnique returns the note (it exists, belongs to user B)
          mockFindUnique.mockResolvedValueOnce({
            id: noteId,
            title: "Some Title",
            content: "Some Content",
            createdAt: new Date(),
            updatedAt: new Date(),
            userId: userBId,
          } as any);

          const caller = createAuthenticatedCaller(userAId);

          await expect(
            caller.notes.delete({ id: noteId }),
          ).rejects.toMatchObject({
            code: "FORBIDDEN",
          });

          // Verify the note was NOT deleted
          expect(mockDelete).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 20 },
    );
  }, 30_000);
});
