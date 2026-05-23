import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";

/**
 * Integration tests for auth flows
 * Tests the integration between authentication, session management, and note CRUD operations.
 *
 * _Requirements: 1.1, 6.1, 5.2, 5.3_
 */

// Mock env module
vi.mock("~/env", () => ({
  env: {
    AUTH_GOOGLE_ID: "test-google-id",
    AUTH_GOOGLE_SECRET: "test-google-secret",
    AUTH_SECRET: "test-secret",
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    NODE_ENV: "test",
  },
}));

// Mock next-auth
vi.mock("~/server/auth", () => ({
  auth: vi.fn(),
}));

// Mock the db module
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
import { z } from "zod";

const createCaller = createCallerFactory(appRouter);

// Replicate the login schema from auth config
const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

// Low cost factor for fast test execution
const BCRYPT_COST = 4;

/**
 * Helper: Simulate the authorize function from auth config
 */
async function simulateAuthorize(
  email: string,
  password: string,
): Promise<{ id: string; name: string | null; email: string | null; image: string | null } | null> {
  const parsed = loginSchema.safeParse({ email, password });
  if (!parsed.success) return null;

  const user = await (db.user.findUnique as any)({
    where: { email: parsed.data.email },
  });

  if (!user?.password) return null;

  const isValid = await bcrypt.compare(parsed.data.password, user.password);
  if (!isValid) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
  };
}

/**
 * Helper: Create a caller with an authenticated session
 */
function createAuthenticatedCaller(userId: string, email = "user@example.com") {
  return createCaller({
    db: db as any,
    session: {
      user: { id: userId, name: "Test User", email, image: null },
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
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

describe("Integration: Full credentials login flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("authenticates with valid credentials and establishes a session that can access notes", async () => {
    const mockUserFindUnique = vi.mocked(db.user.findUnique);
    const mockNoteFindMany = vi.mocked(db.note.findMany);
    const mockNoteCreate = vi.mocked(db.note.create);

    const testPassword = "SecureP@ss123";
    const hashedPassword = await bcrypt.hash(testPassword, BCRYPT_COST);
    const testUser = {
      id: "user-integration-1",
      name: "Integration User",
      email: "integration@example.com",
      emailVerified: null,
      image: null,
      password: hashedPassword,
    };

    // Step 1: Simulate credentials login (authorize function)
    mockUserFindUnique.mockResolvedValueOnce(testUser as any);
    const authResult = await simulateAuthorize("integration@example.com", testPassword);

    // Verify authentication succeeded
    expect(authResult).not.toBeNull();
    expect(authResult!.id).toBe("user-integration-1");
    expect(authResult!.email).toBe("integration@example.com");

    // Step 2: Use the authenticated user's ID to create a tRPC caller with session
    const caller = createAuthenticatedCaller(authResult!.id, authResult!.email!);

    // Step 3: Verify the caller can list notes
    mockNoteFindMany.mockResolvedValueOnce([
      {
        id: "note-1",
        title: "My Note",
        content: "Hello world",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as any);

    const notes = await caller.notes.list();
    expect(notes).toHaveLength(1);
    expect(notes[0]!.title).toBe("My Note");

    // Verify the list query filtered by the authenticated user's ID
    expect(mockNoteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-integration-1" },
      }),
    );

    // Step 4: Verify the caller can create a note
    mockNoteCreate.mockResolvedValueOnce({
      id: "new-note-1",
      title: "New Note",
      content: "Created via integration test",
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: "user-integration-1",
    } as any);

    const newNote = await caller.notes.create({
      title: "New Note",
      content: "Created via integration test",
    });

    expect(newNote.userId).toBe("user-integration-1");
    expect(mockNoteCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-integration-1",
        }),
      }),
    );
  });

  it("rejects login with invalid credentials and denies access to protected procedures", async () => {
    const mockUserFindUnique = vi.mocked(db.user.findUnique);

    const testPassword = "CorrectPassword";
    const hashedPassword = await bcrypt.hash(testPassword, BCRYPT_COST);

    // Simulate user exists but wrong password provided
    mockUserFindUnique.mockResolvedValueOnce({
      id: "user-2",
      name: "User Two",
      email: "user2@example.com",
      emailVerified: null,
      image: null,
      password: hashedPassword,
    } as any);

    const authResult = await simulateAuthorize("user2@example.com", "WrongPassword");

    // Authentication should fail
    expect(authResult).toBeNull();

    // Without a valid session, protected procedures should reject
    const caller = createUnauthenticatedCaller();

    await expect(caller.notes.list()).rejects.toThrow(TRPCError);
    await expect(caller.notes.list()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects login with non-existent email", async () => {
    const mockUserFindUnique = vi.mocked(db.user.findUnique);

    mockUserFindUnique.mockResolvedValueOnce(null);

    const authResult = await simulateAuthorize("nonexistent@example.com", "AnyPassword");

    // Authentication should fail
    expect(authResult).toBeNull();
  });
});

describe("Integration: Session persistence across page reload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("caller with valid (non-expired) session can access protected procedures", async () => {
    const mockNoteFindMany = vi.mocked(db.note.findMany);

    // Simulate a session that is still valid (expires in the future)
    const caller = createCaller({
      db: db as any,
      session: {
        user: { id: "persistent-user", name: "Persistent", email: "p@test.com", image: null },
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
      },
      headers: new Headers(),
    });

    mockNoteFindMany.mockResolvedValueOnce([]);

    const notes = await caller.notes.list();
    expect(notes).toEqual([]);

    // Verify the query used the correct user ID from the persisted session
    expect(mockNoteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "persistent-user" },
      }),
    );
  });

  it("caller with null session (expired/cleared) is rejected from protected procedures", async () => {
    // Simulate an expired or cleared session — session is null
    const caller = createUnauthenticatedCaller();

    await expect(caller.notes.list()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });

    await expect(caller.notes.create({ title: "Test" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });

    await expect(caller.notes.update({ id: "note-1", title: "Updated" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });

    await expect(caller.notes.delete({ id: "note-1" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("session with valid user ID allows full CRUD operations", async () => {
    const mockNoteFindMany = vi.mocked(db.note.findMany);
    const mockNoteCreate = vi.mocked(db.note.create);
    const mockNoteFindFirst = vi.mocked(db.note.findFirst);
    const mockNoteUpdate = vi.mocked(db.note.update);
    const mockNoteDelete = vi.mocked(db.note.delete);

    const userId = "session-user-123";
    const caller = createAuthenticatedCaller(userId);

    // List
    mockNoteFindMany.mockResolvedValueOnce([]);
    const listResult = await caller.notes.list();
    expect(listResult).toEqual([]);

    // Create
    const createdNote = {
      id: "note-session-1",
      title: "Session Note",
      content: "Content",
      createdAt: new Date(),
      updatedAt: new Date(),
      userId,
    };
    mockNoteCreate.mockResolvedValueOnce(createdNote as any);
    const createResult = await caller.notes.create({ title: "Session Note", content: "Content" });
    expect(createResult.userId).toBe(userId);

    // Update (own note)
    mockNoteFindFirst.mockResolvedValueOnce(createdNote as any);
    mockNoteUpdate.mockResolvedValueOnce({ ...createdNote, title: "Updated Title" } as any);
    const updateResult = await caller.notes.update({ id: "note-session-1", title: "Updated Title" });
    expect(updateResult.title).toBe("Updated Title");

    // Delete (own note)
    mockNoteFindFirst.mockResolvedValueOnce(createdNote as any);
    mockNoteDelete.mockResolvedValueOnce(createdNote as any);
    const deleteResult = await caller.notes.delete({ id: "note-session-1" });
    expect(deleteResult.id).toBe("note-session-1");
  });
});

describe("Integration: Note CRUD operations with ownership enforcement", () => {
  const userAId = "user-a-owner";
  const userBId = "user-b-intruder";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("user A creates a note and userId is correctly assigned", async () => {
    const mockNoteCreate = vi.mocked(db.note.create);

    const callerA = createAuthenticatedCaller(userAId);

    const noteData = {
      id: "note-owned-by-a",
      title: "User A's Note",
      content: "Private content",
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: userAId,
    };
    mockNoteCreate.mockResolvedValueOnce(noteData as any);

    const result = await callerA.notes.create({ title: "User A's Note", content: "Private content" });

    expect(result.userId).toBe(userAId);
    expect(mockNoteCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "User A's Note",
          content: "Private content",
          userId: userAId,
        }),
      }),
    );
  });

  it("user A lists notes and only sees their own notes", async () => {
    const mockNoteFindMany = vi.mocked(db.note.findMany);

    const callerA = createAuthenticatedCaller(userAId);

    const userANotes = [
      { id: "note-a-1", title: "Note 1", content: "Content 1", createdAt: new Date(), updatedAt: new Date() },
      { id: "note-a-2", title: "Note 2", content: "Content 2", createdAt: new Date(), updatedAt: new Date() },
    ];
    mockNoteFindMany.mockResolvedValueOnce(userANotes as any);

    const result = await callerA.notes.list();

    expect(result).toHaveLength(2);
    expect(mockNoteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: userAId },
        orderBy: { updatedAt: "desc" },
      }),
    );
  });

  it("user B cannot update user A's note — returns FORBIDDEN", async () => {
    const mockNoteFindFirst = vi.mocked(db.note.findFirst);
    const mockNoteFindUnique = vi.mocked(db.note.findUnique);
    const mockNoteUpdate = vi.mocked(db.note.update);

    const callerB = createAuthenticatedCaller(userBId);

    // findFirst returns null (note not owned by user B)
    mockNoteFindFirst.mockResolvedValueOnce(null);
    // findUnique returns the note (it exists, belongs to user A)
    mockNoteFindUnique.mockResolvedValueOnce({
      id: "note-owned-by-a",
      title: "User A's Note",
      content: "Private content",
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: userAId,
    } as any);

    await expect(
      callerB.notes.update({ id: "note-owned-by-a", title: "Hacked Title" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You do not have permission to update this note",
    });

    // Verify the note was NOT modified
    expect(mockNoteUpdate).not.toHaveBeenCalled();
  });

  it("user B cannot delete user A's note — returns FORBIDDEN", async () => {
    const mockNoteFindFirst = vi.mocked(db.note.findFirst);
    const mockNoteFindUnique = vi.mocked(db.note.findUnique);
    const mockNoteDelete = vi.mocked(db.note.delete);

    const callerB = createAuthenticatedCaller(userBId);

    // findFirst returns null (note not owned by user B)
    mockNoteFindFirst.mockResolvedValueOnce(null);
    // findUnique returns the note (it exists, belongs to user A)
    mockNoteFindUnique.mockResolvedValueOnce({
      id: "note-owned-by-a",
      title: "User A's Note",
      content: "Private content",
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: userAId,
    } as any);

    await expect(
      callerB.notes.delete({ id: "note-owned-by-a" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You do not have permission to delete this note",
    });

    // Verify the note was NOT deleted
    expect(mockNoteDelete).not.toHaveBeenCalled();
  });

  it("user A can update their own note successfully", async () => {
    const mockNoteFindFirst = vi.mocked(db.note.findFirst);
    const mockNoteUpdate = vi.mocked(db.note.update);

    const callerA = createAuthenticatedCaller(userAId);

    const existingNote = {
      id: "note-owned-by-a",
      title: "Original Title",
      content: "Original Content",
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: userAId,
    };

    // findFirst returns the note (owned by user A)
    mockNoteFindFirst.mockResolvedValueOnce(existingNote as any);
    mockNoteUpdate.mockResolvedValueOnce({
      ...existingNote,
      title: "Updated Title",
      updatedAt: new Date(),
    } as any);

    const result = await callerA.notes.update({ id: "note-owned-by-a", title: "Updated Title" });

    expect(result.title).toBe("Updated Title");
    expect(mockNoteUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "note-owned-by-a" },
        data: { title: "Updated Title" },
      }),
    );
  });

  it("user A can delete their own note successfully", async () => {
    const mockNoteFindFirst = vi.mocked(db.note.findFirst);
    const mockNoteDelete = vi.mocked(db.note.delete);

    const callerA = createAuthenticatedCaller(userAId);

    const existingNote = {
      id: "note-owned-by-a",
      title: "To Delete",
      content: "Will be deleted",
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: userAId,
    };

    // findFirst returns the note (owned by user A)
    mockNoteFindFirst.mockResolvedValueOnce(existingNote as any);
    mockNoteDelete.mockResolvedValueOnce(existingNote as any);

    const result = await callerA.notes.delete({ id: "note-owned-by-a" });

    expect(result.id).toBe("note-owned-by-a");
    expect(mockNoteDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "note-owned-by-a" },
      }),
    );
  });

  it("complete ownership flow: create → list → cross-user reject → owner update → owner delete", async () => {
    const mockNoteCreate = vi.mocked(db.note.create);
    const mockNoteFindMany = vi.mocked(db.note.findMany);
    const mockNoteFindFirst = vi.mocked(db.note.findFirst);
    const mockNoteFindUnique = vi.mocked(db.note.findUnique);
    const mockNoteUpdate = vi.mocked(db.note.update);
    const mockNoteDelete = vi.mocked(db.note.delete);

    const callerA = createAuthenticatedCaller(userAId);
    const callerB = createAuthenticatedCaller(userBId);

    // Step 1: User A creates a note
    const createdNote = {
      id: "flow-note-1",
      title: "Flow Note",
      content: "Testing full flow",
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: userAId,
    };
    mockNoteCreate.mockResolvedValueOnce(createdNote as any);
    const note = await callerA.notes.create({ title: "Flow Note", content: "Testing full flow" });
    expect(note.userId).toBe(userAId);

    // Step 2: User A lists notes — sees their note
    mockNoteFindMany.mockResolvedValueOnce([
      { id: "flow-note-1", title: "Flow Note", content: "Testing full flow", createdAt: new Date(), updatedAt: new Date() },
    ] as any);
    const userANotes = await callerA.notes.list();
    expect(userANotes).toHaveLength(1);

    // Step 3: User B tries to update user A's note — FORBIDDEN
    mockNoteFindFirst.mockResolvedValueOnce(null);
    mockNoteFindUnique.mockResolvedValueOnce(createdNote as any);
    await expect(
      callerB.notes.update({ id: "flow-note-1", title: "Hacked" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockNoteUpdate).not.toHaveBeenCalled();

    // Step 4: User B tries to delete user A's note — FORBIDDEN
    mockNoteFindFirst.mockResolvedValueOnce(null);
    mockNoteFindUnique.mockResolvedValueOnce(createdNote as any);
    await expect(
      callerB.notes.delete({ id: "flow-note-1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockNoteDelete).not.toHaveBeenCalled();

    // Step 5: User A updates their own note — success
    mockNoteFindFirst.mockResolvedValueOnce(createdNote as any);
    mockNoteUpdate.mockResolvedValueOnce({ ...createdNote, title: "Updated by Owner" } as any);
    const updated = await callerA.notes.update({ id: "flow-note-1", title: "Updated by Owner" });
    expect(updated.title).toBe("Updated by Owner");

    // Step 6: User A deletes their own note — success
    mockNoteFindFirst.mockResolvedValueOnce({ ...createdNote, title: "Updated by Owner" } as any);
    mockNoteDelete.mockResolvedValueOnce({ ...createdNote, title: "Updated by Owner" } as any);
    const deleted = await callerA.notes.delete({ id: "flow-note-1" });
    expect(deleted.id).toBe("flow-note-1");
  });
});
