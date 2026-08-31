import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("node:dns/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:dns/promises")>();
  const lookupMock = vi.fn();
  return {
    ...actual,
    lookup: lookupMock,
    default: { ...actual, lookup: lookupMock },
  };
});

import { lookup } from "node:dns/promises";
import { validateOutboundBaseUrl } from "~/server/security/outbound-url";

describe("validateOutboundBaseUrl", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows loopback only when explicitly requested", async () => {
    await expect(validateOutboundBaseUrl("http://localhost:11434")).rejects.toThrow(
      "local server",
    );
    await expect(
      validateOutboundBaseUrl("http://localhost:11434/", { allowLoopback: true }),
    ).resolves.toBe("http://localhost:11434");
  });

  it("rejects literal private network addresses", async () => {
    await expect(validateOutboundBaseUrl("https://10.0.0.5/v1")).rejects.toThrow(
      "private network",
    );
    await expect(validateOutboundBaseUrl("https://192.168.1.4/v1")).rejects.toThrow(
      "private network",
    );
  });

  it("rejects hostnames that resolve to private addresses", async () => {
    vi.mocked(lookup).mockResolvedValueOnce([
      { address: "169.254.169.254", family: 4 },
    ] as never);

    await expect(validateOutboundBaseUrl("https://provider.example/v1")).rejects.toThrow(
      "private network",
    );
  });

  it("normalizes a public HTTPS endpoint", async () => {
    vi.mocked(lookup).mockResolvedValueOnce([
      { address: "203.0.114.10", family: 4 },
    ] as never);

    await expect(
      validateOutboundBaseUrl("https://provider.example/v1/?token=ignored#fragment", {
        requireHttps: true,
      }),
    ).resolves.toBe("https://provider.example/v1");
  });
});
