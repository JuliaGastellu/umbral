import { CROPS, cropById } from "../engine/catalog";
import { addDays, diffDays, fmtDate, isValidISO, parts, type ISODate } from "../engine/dates";
import type { Scenario } from "../engine/scenario";
import { CropIcon } from "./CropIcon";

interface Props {
  s: Scenario;
  set: (f: (s: Scenario) => Scenario) => void;
}

const cropName = (id: string) => cropById(id).name.replace(" (processing)", "");

function CropPicker({ label, value, onChange, idBase }: { label: string; value: string; onChange: (id: string) => void; idBase: string }) {
  return (
    <div className="field">
      <span className="lbl" id={`${idBase}-l`}>{label}</span>
      <div className="crop-picker" role="radiogroup" aria-labelledby={`${idBase}-l`}>
        {CROPS.map((c) => (
          <button key={c.id} type="button" role="radio" aria-checked={value === c.id} className="crop-btn" onClick={() => onChange(c.id)}>
            <CropIcon id={c.id} />
            <span>{cropName(c.id)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function DateInput({ id, label, value, onChange, hint }: { id: string; label: string; value: ISODate; onChange: (v: ISODate) => void; hint?: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input date" type="date" value={value} onChange={(e) => isValidISO(e.target.value) && onChange(e.target.value)} />
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function MyField({ s, set }: Props) {
  const yr = parts(s.release).y;
  const setRelease = (v: ISODate) =>
    set((x) => {
      const delta = (d: ISODate) => addDays(d, diffDays(x.release, v));
      return { ...x, release: v, covers: { B: { ...x.covers.B, sowing: delta(x.covers.B.sowing) }, C: { ...x.covers.C, sowing: delta(x.covers.C.sowing) } } };
    });
  const crop = cropById(s.previousCropId);
  return (
    <section className="card stage" aria-labelledby="st1-h" id="my-field">
      <div className="stage-n" aria-hidden="true">1</div>
      <div className="stage-b">
        <h2 id="st1-h">My field</h2>
        <CropPicker idBase="prev" label="Main crop harvested this season" value={s.previousCropId} onChange={(id) => set((x) => ({ ...x, previousCropId: id }))} />
        <p className="hint">Harvest: {crop.harvest}</p>
        <DateInput id="st-release" label="Date the field is free" value={s.release} onChange={setRelease} hint="After harvest, clean-up and tractor work. Use your own date or an example below." />
        <div className="presets" aria-label="Example dates">
          {([["15 Mar", "03-15"], ["25 Mar", "03-25"], ["10 Apr", "04-10"]] as const).map(([l, md]) => (
            <button key={md} type="button" className="btn small" aria-pressed={s.release === `${yr}-${md}`} onClick={() => setRelease(`${yr}-${md}`)}>{l}</button>
          ))}
        </div>
      </div>
    </section>
  );
}

export function MyNextSeason({ s, set }: Props) {
  const next = cropById(s.nextCropId);
  return (
    <section className="card stage" aria-labelledby="st2-h" id="my-next-season">
      <div className="stage-n" aria-hidden="true">2</div>
      <div className="stage-b">
        <h2 id="st2-h">My next season</h2>
        <CropPicker idBase="next" label="Next main crop" value={s.nextCropId} onChange={(id) => set((x) => ({ ...x, nextCropId: id }))} />
        <p className="hint">Planting: {next.planting}</p>
        <DateInput id="st-next" label={`Planting date for the ${cropName(s.nextCropId).toLowerCase()}`} value={s.nextCrop} onChange={(v) => set((x) => ({ ...x, nextCrop: v }))} hint={`The soil must be ready ${s.preparationDays} days before (change it under "Adjust assumptions").`} />
        <div className="field">
          <span className="lbl" id="st-last-l">Last useful canal turn</span>
          <div className="seg" role="radiogroup" aria-labelledby="st-last-l" style={{ maxWidth: 280 }}>
            <button type="button" role="radio" aria-checked={s.water.lastTurn !== null} onClick={() => set((x) => ({ ...x, water: { ...x.water, lastTurn: x.water.lastTurn ?? addDays(x.water.closure, -4) } }))}>I know it</button>
            <button type="button" role="radio" aria-checked={s.water.lastTurn === null} onClick={() => set((x) => ({ ...x, water: { ...x.water, lastTurn: null } }))}>Don't know</button>
          </div>
          {s.water.lastTurn ? (
            <input aria-label="Last useful canal turn" className="input date" type="date" value={s.water.lastTurn} onChange={(e) => isValidISO(e.target.value) && set((x) => ({ ...x, water: { ...x.water, lastTurn: e.target.value } }))} />
          ) : (
            <div className="hint">The canal closes on {fmtDate(s.water.closure)} at the latest (2024 date; change it under "Adjust assumptions").</div>
          )}
        </div>
        <div className="field">
          <label htmlFor="st-freq">Days between canal turns</label>
          <input id="st-freq" className="input" type="number" min={1} max={60} placeholder="don't know" value={s.water.frequencyDays ?? ""} onChange={(e) => set((x) => ({ ...x, water: { ...x.water, frequencyDays: e.target.value === "" ? null : Math.max(1, Math.min(60, Math.round(+e.target.value))) } }))} style={{ maxWidth: 140 }} />
        </div>
      </div>
    </section>
  );
}
