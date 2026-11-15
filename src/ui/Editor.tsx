import { useEffect, useState, type ReactNode } from "react";
import { CROPS, CROP_GROUPS, cropById, type ProductionSystem } from "../engine/catalog";
import { PLAN_YEARS, addDays, diffDays, fmtDate, isPlanDate, type ISODate } from "../engine/dates";
import { switchSystem, type Access, type Scenario } from "../engine/scenario";
import { goalLabel, type Goal } from "../engine/recommend";
import { isExampleDates } from "../engine/planText";
import type { ParcelStats } from "../data";
import { CropIcon } from "./CropIcon";
import { PlotContextGroup, Rail, Seg } from "./Rail";

type SetS = (f: (s: Scenario) => Scenario) => void;
export type Field = number | "cluster" | null;
export type ReportIncomplete = (id: string, incomplete: boolean) => void;

export const cropName = (id: string) => cropById(id).name.replace(" (processing)", "");
export const fieldName = (f: Field) => (f === null ? "No example chosen" : f === "cluster" ? "All four examples" : `Example P${f + 1}`);
const SYSTEM_LABEL: Record<ProductionSystem, string> = { annual: "Annual rotation", orchard: "Orchard", beds: "Beds (e.g. strawberry)" };

/**
 * Date entry that never silently refuses an edit: while the native input holds
 * an incomplete date, the plan keeps its last full date, says so here, and
 * reports it so the result can show it is the last valid calculation.
 */
export function DateEntry({ id, label, value, onChange, hint, optional, report }: { id: string; label: string; value: ISODate | null; onChange: (v: ISODate) => void; hint?: string; optional?: boolean; report?: ReportIncomplete }) {
  const [raw, setRaw] = useState<string>(value ?? "");
  useEffect(() => setRaw(value ?? ""), [value]);
  const incomplete = raw !== (value ?? "") && !isPlanDate(raw);
  useEffect(() => {
    report?.(id, incomplete);
    return () => report?.(id, false);
  }, [id, incomplete, report]);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input date" type="date" min={`${PLAN_YEARS[0]}-01-01`} max={`${PLAN_YEARS[1]}-12-31`} value={raw} aria-invalid={incomplete || (!optional && !value) ? true : undefined} aria-describedby={incomplete || hint ? `${id}-msg` : undefined}
        onChange={(e) => {
          setRaw(e.target.value);
          if (isPlanDate(e.target.value)) onChange(e.target.value);
        }}
      />
      {(incomplete || hint) && (
        <div id={`${id}-msg`} className={incomplete ? "hint warn" : "hint"} aria-live="polite">
          {incomplete ? `Incomplete: the plan keeps ${value ? fmtDate(value, true) : "no date"} until day, month and year are entered.` : hint}
        </div>
      )}
    </div>
  );
}

/** One compact control: grouped native select with a small icon; "Other crop…" keeps the typed name. */
function CropSelect({ id, label, value, onChange, systems }: { id: string; label: string; value: string; onChange: (id: string) => void; systems: ProductionSystem[] }) {
  const isOther = value.startsWith("other:");
  const [otherName, setOtherName] = useState(isOther ? value.slice(6) : "");
  const crop = cropById(value);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="crop-select">
        <CropIcon id={crop.id} size={22} />
        <select id={id} className="input" value={isOther ? "__other" : value} onChange={(e) => (e.target.value === "__other" ? onChange(`other:${otherName}`) : onChange(e.target.value))}>
          {CROP_GROUPS.map((g) => {
            const list = CROPS.filter((c) => c.group === g && systems.includes(c.system));
            return list.length ? <optgroup key={g} label={g}>{list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup> : null;
          })}
          <option value="__other">Other crop…</option>
        </select>
      </div>
      {isOther && (
        <input aria-label={`${label}: name of the other crop`} className="input" placeholder="Crop name" value={otherName} onChange={(e) => { setOtherName(e.target.value); onChange(`other:${e.target.value}`); }} />
      )}
      <div className="hint">{isOther ? "Not in the catalogue: relationships with covers stay unknown." : crop.presence}</div>
    </div>
  );
}

/**
 * Last useful canal turn. Choosing "I know it" opens an empty date: no date is
 * made up. Until a date is entered the plan treats the turn as unknown.
 */
export function LastTurn({ s, set, report }: { s: Scenario; set: SetS; report?: ReportIncomplete }) {
  const [pending, setPending] = useState(false);
  const known = s.water.lastTurn !== null;
  const example = addDays(s.water.closure, -4);
  return (
    <div className="field">
      <span className="lbl" id="lt-l">Last canal turn you will actually get</span>
      <div className="seg" role="radiogroup" aria-labelledby="lt-l">
        <button type="button" role="radio" aria-checked={known || pending} onClick={() => setPending(!known)}>I know it</button>
        <button type="button" role="radio" aria-checked={!known && !pending} onClick={() => { setPending(false); set((x) => ({ ...x, water: { ...x.water, lastTurn: null } })); }}>Don't know</button>
      </div>
      {(known || pending) && (
        <>
          <DateEntry id="last-turn" label="Date of the last useful turn" value={s.water.lastTurn} report={report} onChange={(v) => { setPending(false); set((x) => ({ ...x, water: { ...x.water, lastTurn: v } })); }} hint="Ask your irrigation consortium." />
          {!known && (
            <p className="hint warn" role="status">
              Enter the date. Until then the plan treats the last turn as unknown.{" "}
              <button type="button" className="linkbtn" onClick={() => { setPending(false); set((x) => ({ ...x, water: { ...x.water, lastTurn: example } })); }}>Use an example date ({fmtDate(example, true)}, 4 days before closure)</button>
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** A collapsible editor group whose summary line shows the current values. */
function Group({ id, title, summary, children, open = true }: { id: string; title: string; summary: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="ed-group" open={open}>
      <summary aria-describedby={`${id}-sum`}>
        <h2 id={id}>{title}</h2>
        <span id={`${id}-sum`} className="ed-sum">{summary}</span>
      </summary>
      <div className="ed-body">{children}</div>
    </details>
  );
}

interface Props {
  s: Scenario;
  set: SetS;
  parcels: ParcelStats | null;
  report: ReportIncomplete;
  /** Compact current result, kept in view while editing. */
  summary?: ReactNode;
}

const GOALS: Goal[] = ["next-crop-n", "soil-cover", "weeds", "productive-use", "not-sure"];

/** The plan editor: field, system and crops, goal, dates and water; details on demand. */
const permanentSys = (s: Scenario) => s.system === "orchard" || (s.system === "beds" && s.beds.plants !== "removed");

export function Editor({ s, set, parcels, report, summary }: Props) {
  const example = isExampleDates(s);
  const exampleCue = example ? <p className="example-cue">Starts with example dates — replace them with yours.</p> : null;
  const setRelease = (v: ISODate) =>
    set((x) => {
      const delta = (d: ISODate) => addDays(d, diffDays(x.release, v));
      return { ...x, release: v, covers: { B: { ...x.covers.B, sowing: delta(x.covers.B.sowing) }, C: { ...x.covers.C, sowing: delta(x.covers.C.sowing) } } };
    });
  const permanent = s.system === "orchard" || (s.system === "beds" && s.beds.plants !== "removed");
  // Switching system and back restores the crop chosen there; never picks the next crop itself as the crop just harvested.
  const setSystem = (sys: ProductionSystem) =>
    set((x) =>
      switchSystem(
        x,
        sys,
        (sy, avoid) => (CROPS.find((c) => c.system === sy && c.id !== avoid) ?? CROPS.find((c) => c.system === sy)!).id,
        (id, sy) => cropById(id).system === sy || (sy === "annual" && id.startsWith("other:")),
      ),
    );
  const o = s.orchard;
  const setO = (p: Partial<Scenario["orchard"]>) => set((x) => ({ ...x, orchard: { ...x.orchard, ...p } }));
  const b = s.beds;
  const setB = (p: Partial<Scenario["beds"]>) => set((x) => ({ ...x, beds: { ...x.beds, ...p } }));
  const cropSummary = s.system === "annual" ? `${cropName(s.previousCropId)} → ${cropName(s.nextCropId)}` : s.system === "orchard" ? `${cropName(s.previousCropId)} orchard, ${o.area === "interrow" ? "interrow" : "tree row"}` : `${cropName(s.previousCropId)} beds, plants ${b.plants === "removed" ? "removed" : b.plants === "retained" ? "kept" : "unknown"}`;
  return (
    <div className="editor card" id="edit" role="group" aria-labelledby="ed-title">
      <div className="ed-title"><h2 id="ed-title"><span className="ed-n">02</span> Management conditions</h2></div>
      {summary}
      <Group id="ed-sys" title="System and crops" summary={`${SYSTEM_LABEL[s.system]} · ${cropSummary}`}>
        <div className="field">
          <label htmlFor="ed-system">Production system</label>
          <select id="ed-system" className="input" value={s.system} onChange={(e) => setSystem(e.target.value as ProductionSystem)}>
            <option value="annual">Annual rotation</option>
            <option value="orchard">Permanent orchard</option>
            <option value="beds">Beds / camellones</option>
          </select>
        </div>
        {s.system === "annual" && (
          <div className="pair">
            <CropSelect id="ed-prev" label="Crop just harvested" value={s.previousCropId} onChange={(id) => set((x) => ({ ...x, previousCropId: id }))} systems={["annual", "beds"]} />
            <CropSelect id="ed-next" label="Next main crop" value={s.nextCropId} onChange={(id) => set((x) => ({ ...x, nextCropId: id }))} systems={["annual", "beds"]} />
          </div>
        )}
        {s.system === "orchard" && (
          <>
            <CropSelect id="ed-orch" label="Orchard crop (stays in place)" value={s.previousCropId} onChange={(id) => set((x) => ({ ...x, previousCropId: id }))} systems={["orchard"]} />
            <div className="pair">
              <div className="field"><span className="lbl">Where the cover would grow</span><Seg<"interrow" | "tree-row"> label="Cover area" value={o.area} onChange={(v) => setO({ area: v })} options={[{ v: "interrow", l: "Interrow" }, { v: "tree-row", l: "Tree row" }]} /></div>
              <div className="field"><span className="lbl">Tree age</span><Seg<"young" | "established" | "unknown"> label="Tree age" value={o.age} onChange={(v) => setO({ age: v })} options={[{ v: "young", l: "Young" }, { v: "established", l: "Established" }, { v: "unknown", l: "Not sure" }]} /></div>
            </div>
            <div className="field"><span className="lbl">Does irrigation water reach that area?</span><Seg<"yes" | "no" | "unknown"> label="Water reaches the cover area" value={o.waterReach} onChange={(v) => setO({ waterReach: v })} options={[{ v: "yes", l: "Yes" }, { v: "no", l: "No" }, { v: "unknown", l: "Don't know" }]} /><div className="hint">Drip on the tree row usually does not water the interrow.</div></div>
            <div className="pair">
              <div className="field"><label htmlFor="ed-irr">Irrigation</label><select id="ed-irr" className="input" value={o.irrigation} onChange={(e) => setO({ irrigation: e.target.value as typeof o.irrigation })}><option value="unknown">Not stated</option><option value="drip-row">Drip on the tree row</option><option value="furrow">Furrow / flood</option><option value="sprinkler">Sprinkler</option></select></div>
              <div className="field"><span className="lbl">Regular mowing</span><Seg<"yes" | "no" | "unknown"> label="Mowing" value={o.mowing} onChange={(v) => setO({ mowing: v })} options={[{ v: "yes", l: "Yes" }, { v: "no", l: "No" }, { v: "unknown", l: "Not sure" }]} /></div>
            </div>
            {exampleCue}
            <div className="pair">
              <DateEntry id="ed-w0" label="Cover from (sowing)" value={o.window[0]} report={report} onChange={(v) => setO({ window: [v, o.window[1]] })} />
              <DateEntry id="ed-w1" label="Mown or ended by" value={o.window[1]} report={report} onChange={(v) => setO({ window: [o.window[0], v] })} />
            </div>
            <p className="hint">The trees stay after harvest: there is no field-free date. Flowering and other sensitive stages are not modelled; enter a window that avoids them.</p>
          </>
        )}
        {s.system === "beds" && (
          <>
            <CropSelect id="ed-bed" label="Crop in the beds" value={s.previousCropId} onChange={(id) => set((x) => ({ ...x, previousCropId: id }))} systems={["beds", "annual"]} />
            <div className="field"><span className="lbl">After harvest, the plants are</span><Seg<"removed" | "retained" | "unknown"> label="Plants after harvest" value={b.plants} onChange={(v) => setB({ plants: v })} options={[{ v: "removed", l: "Removed" }, { v: "retained", l: "Kept" }, { v: "unknown", l: "Don't know" }]} /><div className="hint">Harvest alone does not free the beds.</div></div>
            {b.plants !== "removed" && (
              <>
                <div className="field"><span className="lbl">Free area for a cover while plants are kept</span><Seg<"paths" | "none" | "unknown"> label="Free area" value={b.area} onChange={(v) => setB({ area: v })} options={[{ v: "paths", l: "Paths" }, { v: "none", l: "None" }, { v: "unknown", l: "Not sure" }]} /></div>
                <div className="pair">
                  <div className="field"><label htmlFor="ed-mulch">Mulch on the beds</label><select id="ed-mulch" className="input" value={b.mulch} onChange={(e) => setB({ mulch: e.target.value as typeof b.mulch })}><option value="unknown">Not stated</option><option value="plastic">Plastic</option><option value="organic">Organic</option><option value="none">None</option></select></div>
                  <div className="field"><span className="lbl">Drip on the beds</span><Seg<"yes" | "no" | "unknown"> label="Drip" value={b.drip} onChange={(v) => setB({ drip: v })} options={[{ v: "yes", l: "Yes" }, { v: "no", l: "No" }, { v: "unknown", l: "Not sure" }]} /></div>
                </div>
                {exampleCue}
                <div className="pair">
                  <DateEntry id="ed-bw0" label="Cover from" value={o.window[0]} report={report} onChange={(v) => setO({ window: [v, o.window[1]] })} />
                  <DateEntry id="ed-bw1" label="Mown or ended by" value={o.window[1]} report={report} onChange={(v) => setO({ window: [o.window[0], v] })} />
                </div>
              </>
            )}
            {b.plants === "removed" && <CropSelect id="ed-next2" label="Next main crop" value={s.nextCropId} onChange={(id) => set((x) => ({ ...x, nextCropId: id }))} systems={["annual", "beds"]} />}
          </>
        )}
      </Group>

      <Group id="ed-goal" title="Service goal" summary={`${goalLabel(s.goal, permanentSys(s))} · ${s.access === "me" ? "you decide" : s.access === "can-agree" ? "to be agreed" : "someone else decides"}`}>
        <div className="field">
          <label htmlFor="ed-goal-sel">Main service goal</label>
          <select id="ed-goal-sel" className="input" value={s.goal} onChange={(e) => set((x) => ({ ...x, goal: e.target.value as Goal }))}>
            {GOALS.map((g) => <option key={g} value={g}>{goalLabel(g, permanentSys(s))}</option>)}
          </select>
        </div>
        <div className="field">
          <span className="lbl">Who decides about the plot?</span>
          <Seg<Access> label="Plot access" value={s.access} onChange={(v) => set((x) => ({ ...x, access: v }))} options={[{ v: "me", l: "Me" }, { v: "can-agree", l: "Can be agreed" }, { v: "someone-else", l: "Someone else" }]} />
        </div>
      </Group>

      {!permanent && (
        <Group id="ed-dates" title="Dates and canal water" summary={`${example ? "Example dates · " : ""}Free ${fmtDate(s.release)} · next crop ${fmtDate(s.nextCrop)} · last turn ${s.water.lastTurn ? fmtDate(s.water.lastTurn) : "unknown"}`}>
          {exampleCue}
          <div className="pair">
            <DateEntry id="ed-release" label="Field free" value={s.release} onChange={setRelease} report={report} />
            <DateEntry id="ed-next-d" label={`${cropName(s.nextCropId)} planting`} value={s.nextCrop} onChange={(v) => set((x) => ({ ...x, nextCrop: v }))} report={report} />
          </div>
          <LastTurn s={s} set={set} report={report} />
          <div className="pair">
            <div className="field">
              <label htmlFor="ed-freq">Days between turns</label>
              <input id="ed-freq" className="input" type="number" inputMode="numeric" min={1} max={60} placeholder="don't know" value={s.water.frequencyDays ?? ""} onChange={(e) => set((x) => ({ ...x, water: { ...x.water, frequencyDays: e.target.value === "" ? null : Math.max(1, Math.min(60, Math.round(+e.target.value))) } }))} />
            </div>
            <DateEntry id="ed-closure" label="Canal closes" value={s.water.closure} onChange={(v) => set((x) => ({ ...x, water: { ...x.water, closure: v } }))} report={report} hint="29 Apr in 2024 (DPA)." />
          </div>
          <div className="field">
            <span className="lbl">Other water after closure</span>
            <Seg<"yes" | "no" | "unknown"> label="Other water after closure" value={s.water.waterAfterClosure} onChange={(v) => set((x) => ({ ...x, water: { ...x.water, waterAfterClosure: v } }))} options={[{ v: "no", l: "No" }, { v: "unknown", l: "Don't know" }, { v: "yes", l: "Yes" }]} />
          </div>
        </Group>
      )}

      <details className="ed-more">
        <summary>Soil and plot history (optional)</summary>
        <p className="hint">Unknown is a valid answer. Reported waterlogging or salinity asks for a review first; it never changes the dates.</p>
        <PlotContextGroup ctx={s.context} set={(f) => set((x) => ({ ...x, context: f(x.context) }))} parcels={parcels} />
      </details>
      {!permanent && (
        <details className="ed-more">
          <summary>Advanced: preparation, cover sowing and ending, turn details, what-if</summary>
          <Rail s={s} set={set} openDrawer={() => undefined} parcels={parcels} />
        </details>
      )}
    </div>
  );
}
