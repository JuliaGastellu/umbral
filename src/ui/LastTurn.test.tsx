// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DateEntry, LastTurn } from "./Editor";
import { demoScenario, type Scenario } from "../engine/scenario";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let latest: Scenario;
function Host({ init }: { init: Scenario }) {
  const [s, setS] = useState(init);
  latest = s;
  return <LastTurn s={s} set={(f) => setS((x) => f(x))} />;
}

describe("last canal turn entry", () => {
  let root: Root;
  let host: HTMLDivElement;
  afterEach(() => act(() => root.unmount()));
  const mount = async (s: Scenario) => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(<Host init={s} />));
  };
  const button = (name: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.startsWith(name))!;

  it('"I know it" asks for the date and does not invent one', async () => {
    await mount({ ...demoScenario(), water: { ...demoScenario().water, lastTurn: null } });
    await act(async () => button("I know it").click());
    expect(latest.water.lastTurn).toBeNull();
    const input = host.querySelector<HTMLInputElement>("#last-turn")!;
    expect(input.value).toBe("");
    expect(host.textContent).toMatch(/Until then the plan treats the last turn as unknown/);
  });

  it("an example date is used only when chosen explicitly, and is labelled", async () => {
    await mount({ ...demoScenario(), water: { ...demoScenario().water, lastTurn: null } });
    await act(async () => button("I know it").click());
    const ex = button("Use an example date");
    expect(ex.textContent).toMatch(/4 days before closure/);
    await act(async () => ex.click());
    expect(latest.water.lastTurn).toBe("2027-04-25");
  });

  it('"Don\'t know" clears a stated date', async () => {
    await mount(demoScenario());
    expect(latest.water.lastTurn).toBe("2027-04-25");
    await act(async () => button("Don't know").click());
    expect(latest.water.lastTurn).toBeNull();
  });

  it("an incomplete date keeps the last full date and is reported as incomplete", async () => {
    const reports: [string, boolean][] = [];
    let value = "2027-04-10";
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(<DateEntry id="d1" label="Field free" value={value} onChange={(v) => (value = v)} report={(id, bad) => reports.push([id, bad])} />));
    const input = host.querySelector<HTMLInputElement>("#d1")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => { setter.call(input, ""); input.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(value).toBe("2027-04-10");
    expect(reports.at(-1)).toEqual(["d1", true]);
    expect(host.textContent).toMatch(/Incomplete: the plan keeps 10 Apr 2027/);
  });
});
