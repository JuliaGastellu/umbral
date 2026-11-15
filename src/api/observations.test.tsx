// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { assetUrl, fromApi, fromBundled, useObservation, type ObsView } from "./observations";
import { handle } from "../../worker/src/index";
import type { HlsObservation } from "../data";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const hls = JSON.parse(readFileSync("public/data/hls_season.json", "utf8")) as { observations: HlsObservation[] };
const byDate = (d: string) => hls.observations.find((o) => o.date === d)!;
const ASSETS = "https://umbral-altovalle.vercel.app/";

describe("HLS observation client", () => {
  it("resolves chip paths against the asset base, never the API or another host", () => {
    expect(assetUrl("data/hls/s_2024-04-16_S30_rgb.png", ASSETS)).toBe("https://umbral-altovalle.vercel.app/data/hls/s_2024-04-16_S30_rgb.png");
    expect(assetUrl("/data/x.png", "https://host.example/app")).toBe("https://host.example/app/data/x.png");
    expect(assetUrl(null, ASSETS)).toBeNull();
  });

  it("bundled and API answers give the same values for the same scope and date", async () => {
    const o = byDate("2024-04-16");
    const local = fromBundled(o, 0, ASSETS);
    const body = JSON.parse(await (await handle(new Request("https://api.example/api/observations?scope=p1&product=hls&date=2024-04-16"))).text());
    const api = fromApi(body, "p1", "2024-04-16", ASSETS) as ObsView;
    expect(api.origin).toBe("Umbral API");
    expect({ ...api, origin: "x" }).toEqual({ ...local, origin: "x" });
    expect(api.ndviMedian).toBe(0.722);
  });

  it("rejects an answer for another scope or date, and reports no data without substituting", async () => {
    const body = JSON.parse(await (await handle(new Request("https://api.example/api/observations?scope=p1&product=hls&date=2024-04-16"))).text());
    expect(fromApi(body, "p2", "2024-04-16", ASSETS)).toBeNull();
    expect(fromApi(body, "p1", "2024-04-21", ASSETS)).toBeNull();
    expect(fromApi({ schema: "other", data: [] }, "p1", "2024-04-16", ASSETS)).toBeNull();
    const none = JSON.parse(await (await handle(new Request("https://api.example/api/observations?scope=p2&product=hls&date=2024-04-17"))).text());
    expect(fromApi(none, "p2", "2024-04-17", ASSETS)).toBe("no data");
  });

  describe("selection changes", () => {
    let root: Root;
    afterEach(() => act(() => root.unmount()));
    it("a late answer for an earlier selection never overwrites the newer one", async () => {
      const pending: Record<string, (r: Response) => void> = {};
      const fetcher = ((url: string) => new Promise<Response>((res) => { pending[new URL(url).searchParams.get("date")!] = res; })) as typeof fetch;
      let last: ObsView | null = null;
      function Probe({ sel }: { sel: HlsObservation }) {
        last = useObservation(sel, 0, fetcher, "https://api.example", ASSETS);
        return null;
      }
      const a = byDate("2024-04-16");
      const b = hls.observations.find((o) => o.date > "2024-05-01" && o.quality === "clear")!;
      root = createRoot(document.createElement("div"));
      await act(async () => root.render(<Probe sel={a} />));
      expect(last!.acquisitionDate).toBe(a.date); // bundled view at once
      await act(async () => root.render(<Probe sel={b} />));
      expect(last!.acquisitionDate).toBe(b.date);
      // The answer for A arrives after B was selected: ignored.
      const bodyA = await (await handle(new Request(`https://api.example/api/observations?scope=p1&product=hls&date=${a.date}`))).text();
      await act(async () => { pending[a.date](new Response(bodyA, { status: 200 })); await new Promise((r) => setTimeout(r, 0)); });
      expect(last!.acquisitionDate).toBe(b.date);
      const bodyB = await (await handle(new Request(`https://api.example/api/observations?scope=p1&product=hls&date=${b.date}`))).text();
      await act(async () => { pending[b.date](new Response(bodyB, { status: 200 })); await new Promise((r) => setTimeout(r, 0)); });
      expect(last!.acquisitionDate).toBe(b.date);
      expect(last!.origin).toBe("Umbral API");
    });
  });
});
