import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/db", () => ({
  db: {
    note: { create: vi.fn() },
    folder: { findFirst: vi.fn() },
  },
}));

import { createCallerFactory } from "~/server/api/trpc";
import { appRouter } from "~/server/api/root";
import { db } from "~/server/db";

const createCaller = createCallerFactory(appRouter);

function authenticatedCaller(userId: string) {
  return createCaller({
    db: db as never,
    session: {
      user: { id: userId, name: "Test", email: "test@example.com", image: null },
      expires: new Date(Date.now() + 60_000).toISOString(),
    },
    headers: new Headers(),
  });
}

describe("note creation folder ownership", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a folder that is not owned by the current user", async () => {
    vi.mocked(db.folder.findFirst).mockResolvedValueOnce(null);
    const caller = authenticatedCaller("user-1");

    await expect(
      caller.notes.create({ title: "Private", content: "", folderId: "folder-2" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(db.folder.findFirst).toHaveBeenCalledWith({
      where: { id: "folder-2", userId: "user-1" },
      select: { id: true },
    });
    expect(db.note.create).not.toHaveBeenCalled();
  });

  it("creates the note after verifying an owned folder", async () => {
    vi.mocked(db.folder.findFirst).mockResolvedValueOnce({ id: "folder-1" } as never);
    vi.mocked(db.note.create).mockResolvedValueOnce({ id: "note-1" } as never);
    const caller = authenticatedCaller("user-1");

    await caller.notes.create({ title: "Private", content: "Body", folderId: "folder-1" });

    expect(db.note.create).toHaveBeenCalledWith({
      data: {
        title: "Private",
        content: "Body",
        userId: "user-1",
        folderId: "folder-1",
      },
    });
  });
});
