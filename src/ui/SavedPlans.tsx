import { useEffect, useRef, useState } from "react";
import { fmtDate, isValidISO } from "../engine/dates";
import { fieldLabel, type SavedPlan, type Store } from "../engine/planStore";
import { candidateName, planYear, scenarioLabel, standing } from "../engine/planText";
import { CropIcon } from "./CropIcon";

interface Props {
  store: Store;
  currentId: string | null;
  storageOk: boolean;
  onSave: (name: string) => void;
  onOpen: (p: SavedPlan) => void;
  onDelete: (id: string) => void;
  onAddNote: (planId: string | null, date: string, text: string) => void;
  onDeleteNote: (planId: string | null, index: number) => void;
  suggestedName: string;
  /** A plan waiting to be opened while the plan on screen has unsaved changes. */
  pendingOpen?: SavedPlan | null;
  onResolveOpen?: (choice: "save" | "discard" | "cancel") => void;
  openError?: string | null;
  currentUnsaved?: boolean;
}

/** Ask before replacing unsaved work. Focus moves to the choice and returns to the plan's Open button on cancel. */
function OpenChoice({ plan, onResolve, error }: { plan: SavedPlan; onResolve: (c: "save" | "discard" | "cancel") => void; error: string | null }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), [plan.id]);
  const cancel = () => {
    onResolve("cancel");
    setTimeout(() => document.getElementById(`open-${plan.id}`)?.focus(), 0);
  };
  return (
    <div className="open-choice" role="alertdialog" aria-labelledby="oc-h" aria-describedby="oc-d" onKeyDown={(e) => { if (e.key === "Escape") cancel(); }}>
      <p id="oc-h"><strong>Open "{plan.name}"?</strong></p>
      <p id="oc-d">The plan on screen has unsaved changes. Opening another plan replaces it.</p>
      {error && <p className="banner warn" role="alert">{error}</p>}
      <div className="oc-actions">
        <button ref={first} type="button" className="btn primary" onClick={() => onResolve("save")}>Save a copy, then open</button>
        <button type="button" className="btn" onClick={() => onResolve("discard")}>Discard changes and open</button>
        <button type="button" className="btn" onClick={cancel}>Cancel</button>
      </div>
    </div>
  );
}

/**
 * Saved plans, kept only in this browser. Opening a plan restores its field,
 * dates, water, goal, climate settings and evidence choices. Notes belong to a
 * plan; they are records and never change the result.
 */
export function SavedPlans({ store, currentId, storageOk, onSave, onOpen, onDelete, onAddNote, onDeleteNote, suggestedName, pendingOpen = null, onResolveOpen, openError = null }: Props) {
  const [name, setName] = useState("");
  const [od, setOd] = useState("");
  const [ot, setOt] = useState("");
  const current = store.plans.find((p) => p.id === currentId) ?? null;
  const notes = current ? current.notes : store.unassignedNotes;
  return (
    <div className="saved-view">
      <section className="card" aria-labelledby="sv-h">
        <div className="card-h"><h2 id="sv-h">Saved plans</h2></div>
        <div className="card-b">
          {!storageOk && <p className="banner" role="status">This browser does not allow saving. Use Export to keep a copy.</p>}
          {(store.unreadable?.length ?? 0) > 0 && <p className="banner" role="status">{store.unreadable!.length} stored entr{store.unreadable!.length === 1 ? "y" : "ies"} could not be read; kept unchanged in this browser.</p>}
          <form className="row-form" onSubmit={(e) => { e.preventDefault(); onSave(name.trim() || suggestedName); setName(""); }}>
            <label className="sr-only" htmlFor="plan-name">Plan name</label>
            <input id="plan-name" className="input" placeholder={suggestedName} value={name} onChange={(e) => setName(e.target.value)} />
            <button type="submit" className="btn primary">Save as a new plan</button>
          </form>
          {store.plans.length === 0 ? <p className="note">No saved plans yet. Saving keeps the field, dates, water, goal and evidence choices together.</p> : (
            <ul className="saved-list">
              {store.plans.map((p) => (
                <li key={p.id} className={p.id === currentId ? "current" : ""}>
                  <span>
                    <strong>{p.name}</strong>{p.id === currentId && <span className="verdict fits">Open</span>}{p.inputState === "incomplete" && <span className="verdict needs-data">Saved with an incomplete date</span>}<br />
                    <small><CropIcon id={p.scenario.previousCropId} size={18} />{scenarioLabel(p.scenario)} · {planYear(p.scenario)} · option: {candidateName(p.activeCandidate) ?? "first suggested"} · evidence: {fieldLabel(p.field)} · {standing(p.scenario) ? `cover window from ${fmtDate(p.scenario.orchard.window[0], true)}` : `free ${fmtDate(p.scenario.release, true)}`} · saved {fmtDate(p.savedAt.slice(0, 10), true)} · {p.notes.length} note{p.notes.length === 1 ? "" : "s"}</small>
                  </span>
                  <button id={`open-${p.id}`} type="button" className="btn small" aria-label={`Open ${p.name}`} onClick={() => onOpen(p)}>Open</button>
                  <button type="button" className="btn small" aria-label={`Delete ${p.name}`} onClick={() => onDelete(p.id)}>Delete</button>
                  {pendingOpen?.id === p.id && onResolveOpen && <OpenChoice plan={p} onResolve={onResolveOpen} error={openError} />}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <section className="card" aria-labelledby="notes-h">
        <div className="card-h"><h2 id="notes-h">Field notes {current ? `for "${current.name}"` : "(not linked to a plan)"}</h2></div>
        <div className="card-b">
          {!current && <p className="hint">Open or save a plan to attach notes to it.</p>}
          <form className="row-form" onSubmit={(e) => { e.preventDefault(); if (!isValidISO(od) || !ot.trim()) return; onAddNote(current?.id ?? null, od, ot.trim()); setOt(""); }}>
            <label className="sr-only" htmlFor="obs-date">Date</label>
            <input id="obs-date" className="input date" type="date" value={od} onChange={(e) => setOd(e.target.value)} />
            <label className="sr-only" htmlFor="obs-text">What you saw or did</label>
            <input id="obs-text" className="input" placeholder="e.g. vetch sown; canal turn received" value={ot} onChange={(e) => setOt(e.target.value)} />
            <button type="submit" className="btn" disabled={!isValidISO(od) || !ot.trim()}>Add note</button>
          </form>
          {(!isValidISO(od) || !ot.trim()) && <p className="hint">A note needs a full date and some text.</p>}
          {notes.length === 0 ? <p className="note">No notes yet.</p> : (
            <ul className="saved-list">
              {notes.map((o, i) => (
                <li key={`${o.date}-${i}`}>
                  <span><strong>{fmtDate(o.date, true)}</strong> {o.text}</span>
                  <button type="button" className="btn small" aria-label={`Delete note of ${fmtDate(o.date, true)}`} onClick={() => onDeleteNote(current?.id ?? null, i)}>Delete</button>
                </li>
              ))}
            </ul>
          )}
          <p className="chart-foot">Saved only in this browser on this device. Export keeps the plan, suggestion, notes and sources in a file.</p>
        </div>
      </section>
    </div>
  );
}
