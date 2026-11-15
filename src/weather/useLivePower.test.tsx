// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useLivePower, type LiveState } from "./useWeather";
import type { ISODate } from "../engine/dates";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A POWER-shaped answer: every requested day gets the same values. */
function powerAnswer(start: ISODate, end: ISODate, tmin: number) {
  const days: string[] = [];
  for (let d = new Date(`${start}T00:00:00Z`); d <= new Date(`${end}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10).replaceAll("-", ""));
  const col = (v: number) => Object.fromEntries(days.map((k) => [k, v]));
  return {
    geometry: { coordinates: [-67.58, -39.03, 300] },
    header: { fill_value: -999, api: { version: "test" } },
    parameters: { T2M: { units: "C" }, T2M_MIN: { units: "C" }, T2M_MAX: { units: "C" }, PRECTOTCORR: { units: "mm/day" } },
    properties: { parameter: { T2M: col(10), T2M_MIN: col(tmin), T2M_MAX: col(20), PRECTOTCORR: col(0) } },
  };
}

let seen: LiveState[] = [];
function Probe({ range }: { range: [ISODate, ISODate] | null }) {
  const s = useLivePower(range);
  seen.push(s);
  return null;
}

describe("useLivePower keeps each answer bound to its own dates", () => {
  let root: Root;
  let host: HTMLDivElement;
  const pending = new Map<string, (v: unknown) => void>();
  beforeEach(() => {
    vi.useFakeTimers();
    seen = [];
    localStorage.clear();
    host = document.createElement("div");
    root = createRoot(host);
    vi.stubGlobal("fetch", (url: string) => new Promise((resolve) => {
      const start = /start=(\d{8})/.exec(url)![1];
      pending.set(start, (body) => resolve({ ok: true, json: async () => body }));
    }));
  });
  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
    vi.useRealTimers();
    pending.clear();
  });

  it("a delayed answer for older dates never appears under the new dates", async () => {
    const A: [ISODate, ISODate] = ["2026-02-01", "2026-02-05"];
    const B: [ISODate, ISODate] = ["2026-03-01", "2026-03-05"];
    await act(async () => root.render(<Probe range={A} />));
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(pending.has("20260201")).toBe(true);
    // Period changes while A is still loading.
    await act(async () => root.render(<Probe range={B} />));
    const during = seen[seen.length - 1];
    expect(during.status).toBe("loading");
    expect(during.series).toBeNull();
    expect(during.range).toEqual(B);
    await act(async () => { vi.advanceTimersByTime(500); });
    // A answers late: ignored.
    await act(async () => { pending.get("20260201")!(powerAnswer(A[0], A[1], -5)); await Promise.resolve(); });
    const afterA = seen[seen.length - 1];
    expect(afterA.series).toBeNull();
    expect(afterA.range).toEqual(B);
    // B answers: shown, with its own dates.
    await act(async () => { pending.get("20260301")!(powerAnswer(B[0], B[1], 3)); await Promise.resolve(); await Promise.resolve(); });
    const final = seen[seen.length - 1];
    expect(final.status).toBe("ok");
    expect(final.range).toEqual(B);
    expect(final.series!.startDate).toBe("2026-03-01");
    expect(final.series!.tmin[0]).toBe(3);
    expect(final.validDays).toHaveLength(5);
    // At no render was a series shown for dates other than its own.
    for (const s of seen) if (s.series) expect(s.series.startDate).toBe(s.range![0]);
  });

  it("switching back to dates already answered shows them at once from the cache, never the other series", async () => {
    const A: [ISODate, ISODate] = ["2026-04-01", "2026-04-03"];
    const B: [ISODate, ISODate] = ["2026-05-01", "2026-05-03"];
    await act(async () => root.render(<Probe range={A} />));
    await act(async () => { vi.advanceTimersByTime(500); });
    await act(async () => { pending.get("20260401")!(powerAnswer(A[0], A[1], 1)); await Promise.resolve(); await Promise.resolve(); });
    expect(seen[seen.length - 1].status).toBe("ok");
    await act(async () => root.render(<Probe range={B} />));
    expect(seen[seen.length - 1].series).toBeNull();
    await act(async () => root.render(<Probe range={A} />));
    const back = seen[seen.length - 1];
    expect(back.status).toBe("ok");
    expect(back.series!.startDate).toBe("2026-04-01");
  });
});
