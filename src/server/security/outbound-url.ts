import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

interface OutboundUrlOptions {
  allowLoopback?: boolean;
  requireHttps?: boolean;
}

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);
const BLOCKED_HOSTNAME_SUFFIXES = [".localhost", ".local", ".internal"];

function isPrivateIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) {
    return true;
  }

  const [first, second] = octets as [number, number, number, number];
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function isPrivateIpAddress(address: string): boolean {
  if (isIP(address) === 4) return isPrivateIpv4(address);

  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) {
    return isPrivateIpv4(normalized.slice("::ffff:".length));
  }

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff")
  );
}

function normalizeBaseUrl(url: URL): string {
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

/**
 * Validate a client-controlled upstream URL before the server connects to it.
 * DNS is resolved up-front so hostnames pointing at private infrastructure are
 * rejected as well as literal private IP addresses.
 */
export async function validateOutboundBaseUrl(
  rawUrl: string,
  options: OutboundUrlOptions = {},
): Promise<string> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid provider URL");
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error("Provider URL must use HTTP or HTTPS");
  }
  if (options.requireHttps && url.protocol !== "https:") {
    throw new Error("Provider URL must use HTTPS");
  }
  if (url.username || url.password) {
    throw new Error("Provider URL must not contain credentials");
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const isLoopback = LOOPBACK_HOSTNAMES.has(hostname);
  if (isLoopback) {
    if (!options.allowLoopback) {
      throw new Error("Provider URL cannot target the local server");
    }
    return normalizeBaseUrl(url);
  }

  if (BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    throw new Error("Provider URL cannot target a private hostname");
  }

  if (isIP(hostname)) {
    if (isPrivateIpAddress(hostname)) {
      throw new Error("Provider URL cannot target a private network");
    }
    return normalizeBaseUrl(url);
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("Provider hostname could not be resolved");
  }

  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateIpAddress(address))) {
    throw new Error("Provider URL cannot target a private network");
  }

  return normalizeBaseUrl(url);
}

/** Validate syntax only for a URL explicitly trusted by the server operator. */
export function normalizeTrustedBaseUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Configured provider URL is invalid");
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error("Configured provider URL must use HTTP or HTTPS");
  }
  return normalizeBaseUrl(url);
}
