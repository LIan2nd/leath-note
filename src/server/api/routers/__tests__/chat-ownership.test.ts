import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/db", () => ({
  db: {
    note: { findFirst: vi.fn() },
    chatMessage: {
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { createCallerFactory } from "~/server/api/trpc";
import { appRouter } from "~/server/api/root";
import { db } from "~/server/db";

const createCaller = createCallerFactory(appRouter);

function callerFor(userId: string | null) {
  return createCaller({
    db: db as never,
    session: userId
      ? {
          user: { id: userId, name: "Test", email: "test@example.com", image: null },
          expires: new Date(Date.now() + 60_000).toISOString(),
        }
      : null,
    headers: new Headers(),
  });
}

describe("chat ownership boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unauthenticated chat access", async () => {
    const caller = callerFor(null);

    await expect(caller.chat.getByNoteId({ noteId: "note-1" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(
      caller.chat.addMessage({ noteId: "note-1", role: "user", content: "hello" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.chat.clearByNoteId({ noteId: "note-1" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("scopes reads and clears through the owning note", async () => {
    vi.mocked(db.chatMessage.findMany).mockResolvedValueOnce([]);
    vi.mocked(db.chatMessage.deleteMany).mockResolvedValueOnce({ count: 0 });
    const caller = callerFor("user-1");

    await caller.chat.getByNoteId({ noteId: "note-1" });
    await caller.chat.clearByNoteId({ noteId: "note-1" });

    const ownershipFilter = {
      noteId: "note-1",
      note: { userId: "user-1" },
    };
    expect(db.chatMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: ownershipFilter }),
    );
    expect(db.chatMessage.deleteMany).toHaveBeenCalledWith({ where: ownershipFilter });
  });

  it("does not add a message to another user's note", async () => {
    vi.mocked(db.note.findFirst).mockResolvedValueOnce(null);
    const caller = callerFor("user-1");

    await expect(
      caller.chat.addMessage({ noteId: "note-2", role: "user", content: "private" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(db.note.findFirst).toHaveBeenCalledWith({
      where: { id: "note-2", userId: "user-1" },
      select: { id: true },
    });
    expect(db.chatMessage.create).not.toHaveBeenCalled();
  });
});
