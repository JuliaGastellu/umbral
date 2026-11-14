import { useState, type ReactNode } from "react";
import { CROPS, STRATEGIES, SOURCES } from "../engine/catalog";
import { isValidISO, type ISODate } from "../engine/dates";
import type { PlotContext, SalinityMethod, Texture } from "../engine/context";
import type { Access, Priority, Scenario } from "../engine/scenario";
import { Info } from "./bits";
import type { ParcelStats } from "../data";

interface Props {
  s: Scenario;
  set: (f: (s: Scenario) => Scenario) => void;
  openDrawer: (section: string) => void;
  parcels: ParcelStats | null;
}

function DateField({ label, value, onChange, tag, hint, id, allowUnknown }: { label: ReactNode; value: ISODate | null; onChange: (v: ISODate | null) => void; tag?: ReactNode; hint?: ReactNode; id: string; allowUnknown?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value ?? "";
  return (
    <div className="field">
      <label htmlFor={id}>
        <span>{label}</span>
        {tag}
      </label>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          id={id}
          className="input"
          type="date"
          value={shown}
          disabled={allowUnknown && value === null && draft === null}
          onChange={(e) => {
            const v = e.target.value;
            if (isValidISO(v)) {
              setDraft(null);
              onChange(v);
            } else setDraft(v);
          }}
          onBlur={() => setDraft(null)}
        />
        {allowUnknown && (
          <button type="button" className="btn small" aria-pressed={value === null} onClick={() => onChange(value === null ? null : null)} style={{ display: value === null ? "none" : undefined }}>
            Unknown
          </button>
        )}
      </div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

function NumField({ id, label, value, onChange, min = 0, max = 365, unit = "d", tag, hint, nullable }: { id: string; label: ReactNode; value: number | null; onChange: (v: number | null) => void; min?: number; max?: number; unit?: string; tag?: ReactNode; hint?: ReactNode; nullable?: boolean }) {
  return (
    <div className="field">
      <label htmlFor={id}>
        <span>{label}</span>
        {tag}
      </label>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          id={id}
          className="input"
          type="number"
          min={min}
          max={max}
          value={value ?? ""}
          placeholder={nullable ? "not set" : undefined}
          onChange={(e) => {
            const t = e.target.value;
            if (t === "") return onChange(nullable ? null : min);
            const n = Math.round(Number(t));
            if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
          }}
          style={{ maxWidth: 110 }}
        />
        <span className="num" aria-hidden="true">{unit}</span>
        {nullable && value !== null && (
          <button type="button" className="btn small" onClick={() => onChange(null)}>
            Clear
          </button>
        )}
      </div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Rail({ s, set, openDrawer }: Props) {
  const w = s.whatIf;
  return (
    <div className="rail assumptions" aria-label="Assumptions">
      <div className="rail-body">
        <p className="rail-notice">Example values. Change them to match your field. Crops, dates and the last canal turn are set in steps 1 and 2 above.</p>
        <section className="group" aria-labelledby="g-crops">
          <h2 id="g-crops">Soil preparation</h2>
          <NumField id="prep" label="Days to prepare the soil before the next crop" value={s.preparationDays} onChange={(v) => set((x) => ({ ...x, preparationDays: v ?? 0 }))} max={90} hint="Ploughing and beds. Example value." />
        </section>

        <section className="group" aria-labelledby="g-water">
          <h2 id="g-water">Canal and who decides</h2>
          <div className="field">
            <span className="lbl" id="acc-l">Who controls the plot April–September?</span>
            <Seg<Access> label="Plot access" value={s.access} onChange={(v) => set((x) => ({ ...x, access: v }))} options={[{ v: "me", l: "Me" }, { v: "can-agree", l: "Can be agreed" }, { v: "someone-else", l: "Someone else" }]} />
          </div>
          <DateField
            id="closure"
            label="Canal closes on"
            value={s.water.closure}
            onChange={(v) => v && set((x) => ({ ...x, water: { ...x.water, closure: v } }))}
            tag={<span className="src-tag">Source: DPA 2024</span>}
            hint={<>The canal closed on 29 Apr in 2024 (DPA). Change it if you know this year's date. <Info label="canal closure" onClick={() => openDrawer("sources")} /></>}
          />
          {s.water.frequencyDays !== null && !s.water.lastTurn && (
            <div className="field">
              <span className="lbl">One known turn date (fixes the phase)</span>
              <Seg<"unknown" | "known">
                label="Reference turn known"
                value={s.water.referenceTurn ? "known" : "unknown"}
                onChange={(v) => set((x) => ({ ...x, water: { ...x.water, referenceTurn: v === "known" ? x.release : null } }))}
                options={[{ v: "unknown", l: "Don't know" }, { v: "known", l: "Known" }]}
              />
              {s.water.referenceTurn && <input aria-label="Reference turn date" className="input" type="date" value={s.water.referenceTurn} onChange={(e) => isValidISO(e.target.value) && set((x) => ({ ...x, water: { ...x.water, referenceTurn: e.target.value } }))} />}
            </div>
          )}
          <NumField id="minTurns" label="Turns the seed needs after sowing" value={s.water.minTurnsAfterSowing} max={10} unit="" onChange={(v) => set((x) => ({ ...x, water: { ...x.water, minTurnsAfterSowing: v ?? 0 } }))} hint="Example value. A count of turns, not of how much water." />
          <div className="field">
            <span className="lbl">Other water after the canal closes (well, pond)</span>
            <Seg<"yes" | "no" | "unknown"> label="Other water after closure" value={s.water.waterAfterClosure} onChange={(v) => set((x) => ({ ...x, water: { ...x.water, waterAfterClosure: v } }))} options={[{ v: "no", l: "No" }, { v: "unknown", l: "Don't know" }, { v: "yes", l: "Yes" }]} />
          </div>
        </section>

        <section className="group" aria-labelledby="g-cover">
          <h2 id="g-cover">Covers</h2>
          {(["B", "C"] as const).map((id) => {
            const def = STRATEGIES.find((d) => d.id === id)!;
            const c = s.covers[id];
            const v = def.variants.find((x) => x.id === c.variantId)!;
            return (
              <div key={id} style={{ borderTop: id === "C" ? "1px solid var(--border)" : undefined, marginTop: id === "C" ? 12 : 0, paddingTop: id === "C" ? 4 : 0 }}>
                <div className="field">
                  <label htmlFor={`var-${id}`}>{id}. {def.name}</label>
                  <select
                    id={`var-${id}`}
                    className="input"
                    value={c.variantId}
                    onChange={(e) => {
                      const nv = def.variants.find((x) => x.id === e.target.value)!;
                      set((x) => ({ ...x, covers: { ...x.covers, [id]: { ...x.covers[id], variantId: nv.id, terminationDays: nv.terminationDays } } }));
                    }}
                  >
                    {def.variants.map((x) => (
                      <option key={x.id} value={x.id}>{x.name} ({x.species})</option>
                    ))}
                  </select>
                </div>
                <DateField id={`sow-${id}`} label="Sowing" value={c.sowing} onChange={(d) => d && set((x) => ({ ...x, covers: { ...x.covers, [id]: { ...x.covers[id], sowing: d } } }))} />
                <NumField
                  id={`term-${id}`}
                  label="End it this many days before the soil is ready"
                  value={c.terminationDays}
                  max={90}
                  onChange={(n) => set((x) => ({ ...x, covers: { ...x.covers, [id]: { ...x.covers[id], terminationDays: n ?? 0 } } }))}
                  tag={v.terminationSourceId ? <span className="src-tag">Source: {SOURCES[v.terminationSourceId].short} (US)</span> : undefined}
                  hint={v.terminationSourceId ? "Based on US advice; no local value found." : "No source found; example value."}
                />
                <NumField id={`dur-${id}`} label="Days of cover you want (optional)" value={c.targetDurationDays} nullable max={300} onChange={(n) => set((x) => ({ ...x, covers: { ...x.covers, [id]: { ...x.covers[id], targetDurationDays: n } } }))} hint="Leave empty to see how many days are available." />
              </div>
            );
          })}
        </section>


        <section className="group" aria-labelledby="g-whatif">
          <h2 id="g-whatif">What if…</h2>
          <div className="whatif">
            <label htmlFor="wi-rel">Release later</label>
            <span className="num">{w.releaseDelay} d</span>
            <input id="wi-rel" type="range" min={0} max={45} value={w.releaseDelay} onChange={(e) => set((x) => ({ ...x, whatIf: { ...x.whatIf, releaseDelay: +e.target.value } }))} />
            <label htmlFor="wi-trac">Tractor later (sowing delayed)</label>
            <span className="num">{w.tractorDelay} d</span>
            <input id="wi-trac" type="range" min={0} max={30} value={w.tractorDelay} onChange={(e) => set((x) => ({ ...x, whatIf: { ...x.whatIf, tractorDelay: +e.target.value } }))} />
            <label htmlFor="wi-tr">Earlier transplant</label>
            <span className="num">{w.earlierTransplant} d</span>
            <input id="wi-tr" type="range" min={0} max={30} value={w.earlierTransplant} onChange={(e) => set((x) => ({ ...x, whatIf: { ...x.whatIf, earlierTransplant: +e.target.value } }))} />
          </div>
          <label className="chk">
            <input type="checkbox" checked={w.loseLastTurn} onChange={(e) => set((x) => ({ ...x, whatIf: { ...x.whatIf, loseLastTurn: e.target.checked } }))} />
            Lose the last turn
          </label>
          {(w.releaseDelay || w.tractorDelay || w.earlierTransplant || w.loseLastTurn) ? (
            <button type="button" className="btn small" style={{ marginTop: 8 }} onClick={() => set((x) => ({ ...x, whatIf: { releaseDelay: 0, tractorDelay: 0, loseLastTurn: false, earlierTransplant: 0 } }))}>
              Back to plan
            </button>
          ) : null}
        </section>

      </div>
    </div>
  );
}

function PlotContextGroup({ ctx, set, parcels }: { ctx: PlotContext; set: (f: (c: PlotContext) => PlotContext) => void; parcels: ParcelStats | null }) {
  const textures: Texture[] = ["unknown", "sand", "loamy sand", "sandy loam", "loam", "silt loam", "clay loam", "clay"];
  const sal = ctx.salinity;
  return (
    <div className="group plot-ctx">
      <h3 className="grp-h">Soil and plot history</h3>
      <p className="hint" style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>
        "Don't know" is a fine answer. These answers do not change the dates; they only shape the notes and next steps.
        {parcels && <> For reference, a typical plot around General Roca is about {Math.round(parcels.subrural.medianHa)} ha; most are between {Math.round(parcels.subrural.p25Ha)} and {Math.round(parcels.subrural.p75Ha)} ha (provincial land registry).</>}
      </p>
      <div className="field">
        <label htmlFor="tex">Texture</label>
        <select id="tex" className="input" value={ctx.texture} onChange={(e) => set((c) => ({ ...c, texture: e.target.value as Texture }))}>
          {textures.map((t) => (
            <option key={t} value={t}>{t === "unknown" ? "Unknown" : t}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <span className="lbl">Waterlogging reported</span>
        <Seg<"unknown" | "no" | "yes"> label="Waterlogging reported" value={ctx.waterlogging.kind} onChange={(v) => set((c) => ({ ...c, waterlogging: v === "yes" ? { kind: "yes", sector: "", duration: "" } : { kind: v } }))} options={[{ v: "unknown", l: "Unknown" }, { v: "no", l: "No" }, { v: "yes", l: "Yes" }]} />
        {ctx.waterlogging.kind === "yes" && (
          <div className="row2">
            <input aria-label="Sector" placeholder="Sector" className="input" value={ctx.waterlogging.sector} onChange={(e) => set((c) => ({ ...c, waterlogging: { ...(c.waterlogging as { kind: "yes"; sector: string; duration: string }), sector: e.target.value } }))} />
            <input aria-label="Approximate duration" placeholder="Duration" className="input" value={ctx.waterlogging.duration} onChange={(e) => set((c) => ({ ...c, waterlogging: { ...(c.waterlogging as { kind: "yes"; sector: string; duration: string }), duration: e.target.value } }))} />
          </div>
        )}
      </div>
      <div className="field">
        <span className="lbl">Salinity</span>
        <Seg<"unknown" | "reported" | "measured">
          label="Salinity"
          value={sal.kind}
          onChange={(v) => set((c) => ({ ...c, salinity: v === "measured" ? { kind: "measured", value: 0, unit: "dS/m", method: "saturated-paste ECe", date: null, depth: "" } : { kind: v } }))}
          options={[{ v: "unknown", l: "Unknown" }, { v: "reported", l: "Reported" }, { v: "measured", l: "Measured" }]}
        />
        {sal.kind === "measured" && (
          <>
            <div className="row2">
              <input aria-label="Value" className="input" type="number" step="0.1" value={sal.value} onChange={(e) => set((c) => ({ ...c, salinity: { ...sal, value: Number(e.target.value) } }))} />
              <input aria-label="Unit" className="input" value={sal.unit} onChange={(e) => set((c) => ({ ...c, salinity: { ...sal, unit: e.target.value } }))} />
            </div>
            <select aria-label="Method" className="input" value={sal.method} onChange={(e) => set((c) => ({ ...c, salinity: { ...sal, method: e.target.value as SalinityMethod } }))}>
              {(["irrigation water", "saturated-paste ECe", "EC1:5", "other"] as SalinityMethod[]).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <div className="row2">
              <input aria-label="Sample date" className="input" type="date" value={sal.date ?? ""} onChange={(e) => set((c) => ({ ...c, salinity: { ...sal, date: isValidISO(e.target.value) ? e.target.value : null } }))} />
              <input aria-label="Depth" placeholder="Depth, e.g. 0–30 cm" className="input" value={sal.depth} onChange={(e) => set((c) => ({ ...c, salinity: { ...sal, depth: e.target.value } }))} />
            </div>
            <div className="hint">Shown as entered. Never converted between methods, never classified.</div>
          </>
        )}
      </div>
      <div className="field">
        <span className="lbl">Last three crops</span>
        {[0, 1, 2].map((i) => {
          const pc = ctx.lastCrops[i];
          return (
            <div className="row2" key={i}>
              <select
                aria-label={`Crop ${i + 1}`}
                className="input"
                value={pc?.cropId ?? "unknown"}
                onChange={(e) =>
                  set((c) => {
                    const arr = [...c.lastCrops];
                    arr[i] = { cropId: e.target.value, approxDate: arr[i]?.approxDate ?? "" };
                    return { ...c, lastCrops: arr.filter(Boolean) };
                  })
                }
              >
                <option value="unknown">Don't remember</option>
                {CROPS.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
                <option value="other">Other</option>
              </select>
              <input
                aria-label={`Approximate date of crop ${i + 1}`}
                placeholder="e.g. Mar 2026"
                className="input"
                value={pc?.approxDate ?? ""}
                onChange={(e) =>
                  set((c) => {
                    const arr = [...c.lastCrops];
                    arr[i] = { cropId: arr[i]?.cropId ?? "unknown", approxDate: e.target.value };
                    return { ...c, lastCrops: arr };
                  })
                }
              />
            </div>
          );
        })}
      </div>
      <div className="field">
        <label htmlFor="health">Plant health problem in those seasons</label>
        <input id="health" className="input" placeholder="Unknown" value={ctx.healthProblemRecorded === "unknown" ? "" : ctx.healthProblemRecorded} onChange={(e) => set((c) => ({ ...c, healthProblemRecorded: e.target.value.trim() === "" ? "unknown" : e.target.value }))} />
      </div>
    </div>
  );
}

/** Step 2b: grower priority, soil and plot history. Visible and optional. */
export function FieldDetails({ s, set, parcels }: { s: Scenario; set: (f: (s: Scenario) => Scenario) => void; parcels: ParcelStats | null }) {
  return (
    <section className="card stage" aria-labelledby="st2b-h" id="about-field">
      <div className="stage-n" aria-hidden="true">2b</div>
      <div className="stage-b">
        <h2 id="st2b-h">About your field (optional)</h2>
        <p className="hint">Your priority changes how the result is explained. Soil and history answers add notes and next steps; they never change the dates.</p>
        <div className="field-details">
          <section className="group" aria-labelledby="g-prio">
          <h3 id="g-prio" className="grp-h">What matters most to you</h3>
          <Seg<Priority> label="Grower priority" value={s.priority} onChange={(v) => set((x) => ({ ...x, priority: v }))} options={[{ v: "keep-date", l: "Keep date" }, { v: "explore-cover", l: "Soil cover" }, { v: "avoid-operations", l: "Fewer operations" }]} />
          <p className="hint" style={{ marginTop: 6, fontSize: 13, color: "var(--muted)" }}>
            {s.priority === "keep-date" ? "Keep the next crop's date." : s.priority === "explore-cover" ? "Explore soil cover." : "Avoid extra field operations."} Orders each explanation; it does not score strategies.
          </p>
        </section>
          <PlotContextGroup ctx={s.context} set={(f) => set((x) => ({ ...x, context: f(x.context) }))} parcels={parcels} />
        </div>
      </div>
    </section>
  );
}
