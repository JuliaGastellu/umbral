// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useNotice, NOTICE_MS, linksToSaved } from "./notice";
import { ImageDateBar } from "./HlsPanel";
import { SavedPlans } from "./SavedPlans";
import { demoScenario } from "../engine/scenario";
import { DEFAULT_CLIMATE } from "../engine/exposure";
import type { SavedPlan, Store } from "../engine/planStore";
import type { HlsObservation } from "../data";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("F5: notifications follow the state they describe", () => {
  let api: ReturnType<typeof useNotice>;
  function Probe({ k }: { k: string }) {
    api = useNotice(k);
    return <p>{api.notice?.text ?? ""}</p>;
  }
  it("a notice issued with a state change is not erased by that same change; the next change clears it", async () => {
    await act(async () => root.render(<Probe k="a" />));
    // Issued in the same update as the change it describes (e.g. 'Opened plan', 'Plan moved').
    await act(async () => { api.notify("opened", "Opened B"); root.render(<Probe k="b" />); });
    expect(host.textContent).toBe("Opened B");
    await act(async () => root.render(<Probe k="b" />));
    expect(host.textContent).toBe("Opened B");
    await act(async () => root.render(<Probe k="c" />)); // a later edit
    expect(host.textContent).toBe("");
  });
  it("editing after a save removes the Saved notice; every notice expires", async () => {
    vi.useFakeTimers();
    await act(async () => root.render(<Probe k="a" />));
    await act(async () => api.notify("saved", "Saved \"Plan\""));
    expect(host.textContent).toMatch(/Saved/);
    await act(async () => { vi.advanceTimersByTime(NOTICE_MS - 100); });
    expect(host.textContent).toMatch(/Saved/);
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(host.textContent).toBe("");
    await act(async () => api.notify("saved", "Saved again"));
    await act(async () => root.render(<Probe k="edited" />));
    expect(host.textContent).toBe("");
  });
  it("only save and open notices link to the saved plans", () => {
    expect(linksToSaved("saved")).toBe(true);
    expect(linksToSaved("opened")).toBe(true);
    expect(linksToSaved("warning")).toBe(false);
    expect(linksToSaved("info")).toBe(false);
  });
});

describe("S11: the image-date control has unique ids in each view", () => {
  it("two mounted controls do not share ids, and each label points at its own select", async () => {
    const obs = [{ id: "o1", date: "2024-04-06", sensor: "S30", quality: "clear", parcels: [] }] as unknown as HlsObservation[];
    const bar = <ImageDateBar obs={obs} selected={obs[0]} onSelect={() => undefined} follow={false} setFollow={() => undefined} followInfo={null} window={["2027-04-10", "2027-10-01"]} />;
    await act(async () => root.render(<>{bar}{bar}</>));
    const ids = [...host.querySelectorAll("[id]")].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of host.querySelectorAll("label[for]")) expect(document.getElementById(l.getAttribute("for")!)?.tagName).toBe("SELECT");
    for (const g of host.querySelectorAll("[aria-labelledby]")) expect(document.getElementById(g.getAttribute("aria-labelledby")!)).not.toBeNull();
  });
});

describe("S5 / S6: opening a plan over unsaved work", () => {
  const plan = (id: string, name: string, extra: Partial<SavedPlan> = {}): SavedPlan => ({ version: 2, id, name, savedAt: "2026-11-15T10:00:00Z", scenario: { ...demoScenario(), previousCropId: "maize", nextCropId: "onion" }, field: 1, climate: DEFAULT_CLIMATE, evidence: { imageId: null, followPlan: false, historyPeriod: null }, activeCandidate: "oat", inputState: "complete", notes: [], ...extra });
  const store: Store = { plans: [plan("p1", "First"), plan("p2", "Second", { activeCandidate: null })], unassignedNotes: [] } as unknown as Store;
  const render = (props: Partial<Parameters<typeof SavedPlans>[0]>) =>
    act(async () => root.render(<SavedPlans store={store} currentId={null} storageOk suggestedName="x" onSave={() => undefined} onOpen={() => undefined} onDelete={() => undefined} onAddNote={() => undefined} onDeleteNote={() => undefined} {...props} />));

  it("the list shows the scenario, the selected option and the evidence", async () => {
    await render({});
    const t = host.textContent ?? "";
    expect(t).toMatch(/Maize → Onion · 2027 · option: Oat · evidence: Example P2/);
    expect(t).toMatch(/option: first suggested/);
  });
  it("asks before replacing unsaved work: save, discard or cancel; Cancel and Escape return focus to that plan's Open button", async () => {
    const onResolve = vi.fn();
    await render({ pendingOpen: store.plans[1], onResolveOpen: onResolve });
    const dlg = host.querySelector('[role="alertdialog"]')!;
    expect(dlg.textContent).toMatch(/Open "Second"\?/);
    expect(document.activeElement?.textContent).toBe("Save a copy, then open");
    const btn = (label: string) => [...dlg.querySelectorAll("button")].find((b) => b.textContent === label)!;
    await act(async () => btn("Save a copy, then open").click());
    await act(async () => btn("Discard changes and open").click());
    vi.useFakeTimers();
    await act(async () => { btn("Cancel").click(); vi.runAllTimers(); });
    expect(onResolve.mock.calls.map((c) => c[0])).toEqual(["save", "discard", "cancel"]);
    expect(document.activeElement?.id).toBe("open-p2");
    await act(async () => { dlg.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); vi.runAllTimers(); });
    expect(onResolve.mock.calls.at(-1)![0]).toBe("cancel");
  });
  it("a failed save shows the reason inside the choice and nothing is opened", async () => {
    await render({ pendingOpen: store.plans[1], onResolveOpen: () => undefined, openError: "Your current plan could not be saved in this browser, so nothing was opened." });
    expect(host.querySelector('[role="alertdialog"] [role="alert"]')?.textContent).toMatch(/nothing was opened/);
  });
});
