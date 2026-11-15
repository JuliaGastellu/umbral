// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { validShapes } from "../data";
import { SectionBoundary } from "./ErrorBoundary";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.restoreAllMocks());

// Regression for the blank page of 15 Nov 2026: a browser kept the previous release's
// study_parcels.json ({label, rings}, no geometry) and the map crashed the whole app.
describe("stale or unexpected data never blanks the page", () => {
  it("the parcel file of the previous release is rejected; the current one is accepted", () => {
    const previous = { note: "approximate", source: "IDERN", parcels: [{ label: "P1", rings: [[[-67.6, -39.06]]] }] };
    expect(validShapes(previous)).toBe(false);
    expect(validShapes(JSON.parse(readFileSync("public/data/study_parcels.json", "utf8")))).toBe(true);
    expect(validShapes(null)).toBe(false);
  });

  it("a failing section shows a message and the rest of the page stays", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    function Broken(): JSX.Element {
      throw new TypeError("Cannot use 'in' operator to search for '_leaflet_id' in undefined");
    }
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<main><SectionBoundary name="map and NASA layers"><Broken /></SectionBoundary><p>Rest of the plan</p></main>));
    expect(host.textContent).toMatch(/The map and NASA layers could not be shown/);
    expect(host.textContent).toMatch(/Rest of the plan/);
    act(() => root.unmount());
  });

  it("data requests carry a content version, so a new release does not reuse an old cached file", () => {
    const src = readFileSync("src/data.ts", "utf8");
    expect(src).toMatch(/fetch\(`\$\{path\}\?v=\$\{DATA_VERSION\}`/);
    const v = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(v.headers[0].headers[0].value).toMatch(/max-age=0, must-revalidate/);
  });
});
