import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("~/env.js", () => ({
  env: {
    NODE_ENV: "test",
    OLLAMA_HOST: "http://localhost:11434",
    OLLAMA_MODEL: "llama3.2",
  },
}));
vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/db", () => ({
  db: { note: { findFirst: vi.fn() } },
}));
vi.mock("~/server/security/outbound-url", () => ({
  normalizeTrustedBaseUrl: vi.fn((url: string) => url),
  validateOutboundBaseUrl: vi.fn((url: string) => Promise.resolve(url)),
}));

import { POST } from "~/app/api/chat/route";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

const authMock = vi.mocked(auth as unknown as () => Promise<unknown>);

function chatRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("AI chat route authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("rejects requests without a concrete authenticated user", async () => {
    authMock.mockResolvedValueOnce(null);
    const response = await POST(chatRequest({ noteId: "note-1", userPrompt: "Summarize" }));

    expect(response.status).toBe(401);
    expect(db.note.findFirst).not.toHaveBeenCalled();
  });

  it("rejects a note outside the authenticated user's ownership", async () => {
    authMock.mockResolvedValueOnce({
      user: { id: "user-1", name: "Test", email: "test@example.com" },
      expires: new Date(Date.now() + 60_000).toISOString(),
    });
    vi.mocked(db.note.findFirst).mockResolvedValueOnce(null);

    const response = await POST(chatRequest({ noteId: "note-2", userPrompt: "Summarize" }));

    expect(response.status).toBe(404);
    expect(db.note.findFirst).toHaveBeenCalledWith({
      where: { id: "note-2", userId: "user-1" },
      select: { title: true, content: true },
    });
  });

  it("builds AI context from the owned database note, not client-supplied note text", async () => {
    authMock.mockResolvedValueOnce({
      user: { id: "user-1", name: "Test", email: "test@example.com" },
      expires: new Date(Date.now() + 60_000).toISOString(),
    });
    vi.mocked(db.note.findFirst).mockResolvedValueOnce({
      title: "Stored title",
      content: "Stored private content",
    } as never);
    const upstreamFetch = vi.fn().mockResolvedValue(
      new Response("data: [DONE]\n\n", {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );
    vi.stubGlobal("fetch", upstreamFetch);

    const response = await POST(
      chatRequest({
        noteId: "note-1",
        noteTitle: "Injected title",
        noteContent: "Injected content",
        userPrompt: "Summarize",
        providerId: "openai",
        apiKey: "test-key",
      }),
    );

    expect(response.status).toBe(200);
    const requestInit = upstreamFetch.mock.calls[0]?.[1] as RequestInit;
    const upstreamBody = JSON.parse(String(requestInit.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(upstreamBody.messages[0]?.content).toContain("Stored title");
    expect(upstreamBody.messages[0]?.content).toContain("Stored private content");
    expect(upstreamBody.messages[0]?.content).not.toContain("Injected content");
  });
});
