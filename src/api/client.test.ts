import { describe, expect, it } from "vitest";
import { withFallback } from "./client";
import { handle } from "../../worker/src/index";

const bundled = async () => ["bundled"];
const pick = (b: Record<string, unknown>) => (b.data as unknown[]).map(() => "api");

describe("frontend API fallback", () => {
  it("no API configured: bundled snapshot, labelled as such", async () => {
    const r = await withFallback("/api/sources", pick, bundled, { base: null });
    expect(r).toEqual({ data: ["bundled"], origin: "bundled snapshot", note: "Bundled snapshot (no API configured)" });
  });
  it("API reachable (the real Worker handler): data and provenance from the API", async () => {
    const fetcher = ((url: string) => handle(new Request(url))) as typeof fetch;
    const r = await withFallback("/api/sources", pick, bundled, { base: "https://api.example", fetcher });
    expect(r.origin).toBe("Umbral API");
    expect(r.note).toMatch(/processed snapshot/);
    expect(r.data.length).toBeGreaterThan(5);
  });
  it("API error, wrong schema or timeout: bundled snapshot, never labelled live", async () => {
    const err = (async () => new Response("{}", { status: 500 })) as typeof fetch;
    expect((await withFallback("/api/sources", pick, bundled, { base: "https://x", fetcher: err })).note).toMatch(/Bundled snapshot \(API not used: API answered 500\)/);
    const wrong = (async () => new Response(JSON.stringify({ schema: "other" }), { status: 200 })) as typeof fetch;
    expect((await withFallback("/api/sources", pick, bundled, { base: "https://x", fetcher: wrong })).origin).toBe("bundled snapshot");
    const hang = ((_u: string, init?: RequestInit) => new Promise((_, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted"))))) as typeof fetch;
    const t = await withFallback("/api/sources", pick, bundled, { base: "https://x", fetcher: hang, timeoutMs: 50 });
    expect(t.note).toMatch(/timeout/);
    expect(t.note).not.toMatch(/live/);
  });
});
