// Guards the deduped Antigravity OAuth client: same values across all sources,
// credentials via env (no hardcoded secrets — push secret-scanning blocks them).
import { describe, it, expect } from "vitest";

describe("antigravity oauth client (deduped)", () => {
  it("registry transport reuses the shared canonical credentials", async () => {
    const { ANTIGRAVITY_OAUTH_CLIENT } = await import("../../open-sse/providers/shared.js");
    const ag = (await import("../../open-sse/providers/registry/antigravity.js")).default;
    expect(ag.transport.clientId).toBe(ANTIGRAVITY_OAUTH_CLIENT.clientId);
    expect(ag.transport.clientSecret).toBe(ANTIGRAVITY_OAUTH_CLIENT.clientSecret);
  });

  it("google client shared by gemini + gemini-cli", async () => {
    const { GOOGLE_OAUTH_CLIENT } = await import("../../open-sse/providers/shared.js");
    const gemini = (await import("../../open-sse/providers/registry/gemini.js")).default;
    const gc = (await import("../../open-sse/providers/registry/gemini-cli.js")).default;
    expect(gemini.transport.clientId).toBe(GOOGLE_OAUTH_CLIENT.clientId);
    expect(gemini.transport.clientSecret).toBe(GOOGLE_OAUTH_CLIENT.clientSecret);
    expect(gc.transport.clientId).toBe(GOOGLE_OAUTH_CLIENT.clientId);
    expect(gc.transport.clientSecret).toBe(GOOGLE_OAUTH_CLIENT.clientSecret);
  });

  // Guard: oauth.js must spread shared clients + derive from registry (PROVIDER_OAUTH).
  it("src oauth.js imports shared client + keeps full shape", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "../../src/lib/oauth/constants/oauth.js"), "utf8");
    expect(src).toContain('import { ANTIGRAVITY_OAUTH_CLIENT, GOOGLE_OAUTH_CLIENT } from "open-sse/providers/shared.js"');
    expect(src).toContain("...ANTIGRAVITY_OAUTH_CLIENT");
    expect(src).toContain("...GOOGLE_OAUTH_CLIENT");
    // authorizeUrl now lives in registry; oauth.js derives via PROVIDER_OAUTH spread
    expect(src).toContain('PROVIDER_OAUTH["antigravity"]');
    expect(src).toContain('PROVIDER_OAUTH["gemini-cli"]');
    expect(src).not.toMatch(/clientSecret:\s*"/); // no hardcoded secret here — via shared env client
  });
});
