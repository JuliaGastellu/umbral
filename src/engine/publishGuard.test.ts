import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The publication guard (scripts/check-publish.mjs) must keep the approved parcel derivatives
// and block credentials and the original parcel file, on Windows and POSIX paths alike.
function site(extra: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "umbral-guard-"));
  mkdirSync(join(dir, "data"));
  mkdirSync(join(dir, "assets"));
  copyFileSync("public/data/parcel_outlines.json", join(dir, "data/parcel_outlines.json"));
  copyFileSync("public/data/study_parcels.json", join(dir, "data/study_parcels.json"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>Umbral</title>");
  for (const [name, text] of Object.entries(extra)) writeFileSync(join(dir, name), text);
  return dir;
}
function guard(dir: string) {
  const r = spawnSync(process.execPath, ["scripts/check-publish.mjs", dir], { encoding: "utf8" });
  rmSync(dir, { recursive: true, force: true });
  return { ok: r.status === 0, out: `${r.stdout}${r.stderr}` };
}

describe("publication guard", () => {
  it("passes the approved derived parcel layers with their attribution", () => {
    expect(guard(site({})).ok).toBe(true);
  });
  it("blocks a .netrc file and its credential entry", () => {
    const r = guard(site({ ".netrc": "machine urs.earthdata.nasa.gov login FAKE password FAKE\n" }));
    expect(r.ok).toBe(false);
    expect(r.out).toMatch(/forbidden file/);
    expect(r.out).toMatch(/netrc credential entry/);
  });
  it("blocks bearer tokens, JSON web tokens and credential variables inside bundles", () => {
    const fakeJwt = ["eyJhbGciOiJIUzI1NiJ9", "eyJzdWIiOiJmYWtlLXRlc3QifQ", "ZmFrZS1zaWduYXR1cmUtdGVzdA"].join(".");
    const r = guard(site({ "assets/x.js": `const a = "Bearer ${fakeJwt}"; const b = "CLOUDFLARE_API_TOKEN=fake-value-for-test";` }));
    expect(r.ok).toBe(false);
    expect(r.out).toMatch(/bearer token/);
    expect(r.out).toMatch(/JSON web token/);
    expect(r.out).toMatch(/credential variable/);
  });
  it("blocks .env files and the original parcel layer with its attribute table", () => {
    const r = guard(site({ ".env.production": "X=1\n", "data_parcelario.geojson": '{"features":[{"properties":{"PAR_ID":"1"}}]}' }));
    expect(r.ok).toBe(false);
    expect(r.out.match(/forbidden file/g)?.length).toBe(2);
    expect(r.out).toMatch(/original parcel-layer attribute field/);
  });
});
