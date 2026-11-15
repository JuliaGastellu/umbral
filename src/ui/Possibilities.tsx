import { useState, type ReactNode } from "react";
import { SOURCES, cropById } from "../engine/catalog";
import { fmtDate } from "../engine/dates";
import { fmtT } from "../engine/climate";
import { CONFIDENCE_LABEL, EXPLORABLE, STATUS_LABEL, goalFitText, type Candidate, type Dimension, type Suggestion } from "../engine/recommend";
import type { Evaluation, Scenario } from "../engine/scenario";
import type { ExposureSummary } from "../engine/climate";
import { CropIcon } from "./CropIcon";
import { PlanCalendar } from "./PlanCalendar";
import { cropName } from "./Editor";
import { beforeSowing, standingPhrase, waterFact } from "../engine/planText";

const STATUS_CLASS: Record<string, string> = { suggested: "fits", provisional: "needs-data", experimental: "experimental", "partial-match": "baseline", "not-on-these-dates": "no-fit", "not-for-this-goal": "baseline", "not-for-this-system": "no-fit" };
const VIEWABLE: ReadonlySet<string> = EXPLORABLE;
const srcName = (id?: string | null) => (id && SOURCES[id] ? SOURCES[id].short : id ?? "—");
/** Evidence kinds keep their real strength: guidance is not a trial, and a research summary is not a reread source. */
export const PROV_CHIP: Record<string, [string, string]> = {
  "published guidance": ["Published guidance", "pub"],
  "regional study": ["Regional study", "pub"],
  "research brief": ["Research summary · original not rechecked", "brief"],
  "your input": ["Your input", "your-input"],
  "calculation from your dates": ["Your input", "your-input"],
  "reanalysis (NASA POWER)": ["NASA historical model", "nasa-model"],
  "app rule": ["Assumption", "assume"],
};

export interface Evidence {
  /** Matching-period HLS dates for the selected scope (clear of total). */
  hls: { clear: number; total: number; period: [string, string] } | null;
  /** EMIT acquisition dates with valid cluster values. */
  emitDates: string[];
}

interface Props {
  s: Scenario;
  ev: Evaluation;
  sug: Suggestion;
  active: Candidate | null;
  setActive: (id: string) => void;
  cold: { summary: ExposureSummary; start: string; t: number; d: number; lagDays: number | null } | null;
  evidence: Evidence;
  incomplete: boolean;
  scopeLabel: string;
  onExplore: (layer: "power" | "hls" | "emit") => void;
  compare: ReactNode;
  table: ReactNode;
}

function Why({ c, cold, evidence, permanent, sug }: { c: Candidate; cold: Props["cold"]; evidence: Evidence; permanent: boolean; sug: Suggestion }) {
  const dim = (k: Dimension["key"]) => c.dimensions.find((d) => d.key === k)!;
  const chip = (d: Dimension) => {
    const [label, cls] = PROV_CHIP[d.provenance.kind] ?? ["Assumption", "assume"];
    return <span className={`pchip ${cls}`}>{label}</span>;
  };
  // The same review list as the one shown under the cards: this candidate's blocking checks plus the shared ones.
  const blocks = beforeSowing(c, sug).all;
  return (
    <details className="more why">
      <summary>Why this option?</summary>
      <ol className="why-rows">
        <li><span className="why-k">Service for the {permanent ? "standing crop" : "next crop"}</span>{chip(dim("benefit"))}<span className="why-v">{c.benefit} <em>({srcName(c.purpose.reasons[0]?.sourceId)}, {c.purpose.reasons[0]?.where ?? "—"})</em></span></li>
        <li><span className="why-k">Dates and water opportunities</span>{chip(dim("calendar"))}<span className="why-v">{dim("calendar").text}{!permanent ? `; ${c.calendar.turns} canal turn(s) after sowing` : ""}.</span></li>
        <li><span className="why-k">Cold exposure</span><span className="pchip nasa-model">NASA historical model</span><span className="why-v">{cold ? `General check (your threshold, ≤ ${fmtT(cold.t)} °C): ${cold.summary.met} of ${cold.summary.total} past years had ${cold.d}+ days before such a night from ${fmtDate(cold.start)}.` : "General check: not read for these dates."}{c.speciesClimate.text ? ` Species guidance reference: ${c.speciesClimate.text}` : ""} The two answer different questions, so their counts can differ.</span></li>
        <li><span className="why-k">Previously observed</span><span className="pchip nasa-obs">NASA observation</span><span className="why-v">{evidence.hls ? `HLS: ${evidence.hls.clear} clear of ${evidence.hls.total} dates in the matching 2024 period` : "HLS not loaded"}; EMIT: cluster fractions on {evidence.emitDates.length} date(s). Context for the place, not proof for this species.</span></li>
        <li><span className="why-k">Still to check</span><span className="pchip assume">Your input</span><div className="why-v">{blocks.length ? <ul className="why-list">{blocks.map((k) => <li key={`${k.kind}-${k.text}`}>{k.text}</li>)}</ul> : "Nothing blocking in your inputs; local results are not validated."}</div></li>
      </ol>
      <details className="more">
        <summary>All sources and the full reasoning</summary>
        <ul className="dims">{c.dimensions.map((d) => <li key={d.key}><strong>{d.label}:</strong> {d.text}<div className="prov-line">{d.provenance.kind} · {srcName(d.provenance.source)} · {d.provenance.scope}{d.provenance.dates ? ` · ${d.provenance.dates}` : ""}. Role: {d.provenance.role}{d.provenance.missing ? ` Missing: ${d.provenance.missing}` : ""}</div></li>)}</ul>
        {c.checks.length > 0 && <ul className="dims">{c.checks.map((k) => <li key={k.text}>{k.blocking ? "Before sowing: " : "Note: "}{k.text}</li>)}</ul>}
        {c.evidence.length > 0 && <ul className="dims">{c.evidence.map((e) => <li key={e.sourceId}><strong>{srcName(e.sourceId)}</strong>, {e.site}. {e.found} <em>Limits:</em> {e.limits}</li>)}</ul>}
        <p className="chart-foot">Evidence: {CONFIDENCE_LABEL[c.confidence]} · families {c.families.join(", ")} · {c.habit} · {c.termination.days ? `ended ${c.termination.days} days before the soil is ready (${c.termination.provenance})` : c.termination.source}.</p>
      </details>
    </details>
  );
}

function Card({ c, active, onSelect, cold, evidence, permanent, sug }: { c: Candidate; active: boolean; onSelect: () => void; cold: Props["cold"]; evidence: Evidence; permanent: boolean; sug: Suggestion }) {
  return (
    <article className={`pcard${active ? " sel" : ""}`} aria-labelledby={`pc-${c.id}`}>
      <div className="pcard-band"><CropIcon id={c.id} size={52} /><span className="pcard-tag">{active ? "Selected" : c.status === "experimental" ? "Experimental" : "Alternative"}</span></div>
      <div className="pcard-b">
        <h3 id={`pc-${c.id}`}>{c.name}</h3>
        <span className={`verdict ${STATUS_CLASS[c.status]}`}>{STATUS_LABEL[c.status]}</span>
        <p className="pcard-benefit">{c.benefit}</p>
        {goalFitText(c) && <p className="pcard-goal">{goalFitText(c)}</p>}
        <p className="pcard-trade">{c.tradeoff}</p>
        <p className="pcard-ev">{CONFIDENCE_LABEL[c.confidence]}</p>
        <button type="button" className={`btn small${active ? " primary" : ""}`} aria-pressed={active} onClick={onSelect}>{active ? "Selected" : "Select"}</button>
        <Why c={c} cold={cold} evidence={evidence} permanent={permanent} sug={sug} />
      </div>
    </article>
  );
}

/** "Your possibilities": all evaluated candidates, three in view, one active candidate for everything below. */
export function Possibilities({ s, ev, sug, active, setActive, cold, evidence, incomplete, scopeLabel, onExplore, compare, table }: Props) {
  const permanent = sug.serviceTo.startsWith("the standing");
  const all = [...sug.main, ...sug.others, ...sug.experimental];
  const [inspect, setInspect] = useState<string | null>(null);
  const shown = [...(active ? [active] : []), ...sug.main.filter((c) => c.id !== active?.id)].slice(0, 3);
  const inspected = all.find((c) => c.id === inspect && !VIEWABLE.has(c.status));
  const [showCompare, setShowCompare] = useState(false);
  const conditional = sug.main.length > 0 && sug.main.every((c) => c.status !== "suggested");
  const review = beforeSowing(active, sug);
  const water = waterFact(s);
  const stays = standingPhrase(s);
  return (
    <section className="poss" aria-labelledby="poss-h" id="result">
      {incomplete && <p className="banner warn" role="status">A date is being edited: this is the last valid calculation, not yet your new plan.</p>}
      <div className="poss-head">
        <div>
          <p className="kicker">Your possibilities</p>
          <h2 id="poss-h">{permanent ? (s.system === "beds" ? "Make the space beside the beds count." : "Make the interrow count.") : "Make the in-between count."}</h2>
        </div>
        <span className={`status-chip${sug.main.length === 0 ? " warn" : conditional ? " cond" : ""}`}>{sug.main.length === 0 ? (active ? `No main option fits · exploring ${active.name.toLowerCase()}` : "No option fits these inputs") : conditional ? "Conditional · not a recommendation" : "Worth exploring · not a recommendation"}</span>
      </div>
      <p className="poss-sum" aria-live="polite"><strong>{sug.headline}.</strong>{sug.decidingFactor ? ` ${sug.decidingFactor}` : ""}</p>
      {sug.sharedChecks.map((k) => <p key={k.text} className="banner" role="status"><strong>First:</strong> {k.text}</p>)}
      <div className="field cat">
        <label htmlFor="cat">Service-crop catalogue · all {all.length} candidates</label>
        <select id="cat" className="input" value={active?.id ?? ""} onChange={(e) => { const c = all.find((x) => x.id === e.target.value); if (!c) return; if (VIEWABLE.has(c.status)) { setActive(c.id); setInspect(null); } else setInspect(c.id); }}>
          {!active && <option value="">No candidate selected</option>}
          {all.map((c) => <option key={c.id} value={c.id}>{c.name} · {STATUS_LABEL[c.status]}</option>)}
        </select>
        {inspected && <p className="hint warn" role="status">{inspected.name}: {STATUS_LABEL[inspected.status]}. {inspected.status === "not-for-this-system" ? "It does not fit this production system" : inspected.calendar.label}. Excluded by a date or system conflict, so it cannot be planned on these inputs.</p>}
      </div>
      <details className="more">
        <summary>Evaluation &amp; exclusions</summary>
        <ul className="excl">{all.map((c) => <li key={c.id}><CropIcon id={c.id} size={20} /><strong>{c.name}</strong> <span className={`verdict ${STATUS_CLASS[c.status]}`}>{STATUS_LABEL[c.status]}</span> <small>{!VIEWABLE.has(c.status) ? c.calendar.label : goalFitText(c) ?? c.tradeoff}</small></li>)}</ul>
      </details>

      {shown.length > 0 && <div className={`pcards n${shown.length}`}>{shown.map((c) => <Card key={c.id} c={c} active={active?.id === c.id} onSelect={() => setActive(c.id)} cold={cold} evidence={evidence} permanent={permanent} sug={sug} />)}</div>}
      <div className="sug-confirm" role="group" aria-labelledby="next-check-h">
        <p><strong id="next-check-h">{review.all.length ? "Next check" : "Next step"}:</strong> {review.next}</p>
        {review.also.length > 0 && (
          <>
            <p className="also-h"><strong>Also before sowing ({review.also.length}):</strong></p>
            <ul className="also-list">{review.also.map((k) => <li key={`${k.kind}-${k.text}`}>{k.text}</li>)}</ul>
          </>
        )}
      </div>

      <div className="pc-box">
        <div className="pc-box-h">
          <div><p className="kicker">One shared calendar</p><h3>{active ? `${active.name} · ${scopeLabel}` : scopeLabel}</h3></div>
          {!permanent && active && <button type="button" className="btn small" aria-expanded={showCompare} aria-controls="compare" onClick={() => setShowCompare(!showCompare)}>{showCompare ? "Close comparison" : "Compare a date"}</button>}
        </div>
        {permanent ? (
          <p>{stays.stays}: cover window {fmtDate(s.orchard.window[0], true)} to {fmtDate(s.orchard.window[1], true)}{active ? ` (${active.calendar.availableDays} days)` : ""}.{s.system === "beds" && s.beds.plants === "unknown" ? " Confirm whether the plants stay; if they are removed, the annual rotation applies." : ""} Flowering and other sensitive stages are not modelled.</p>
        ) : (
          <PlanCalendar s={s} ev={ev} cover={active ? { name: active.name, sowing: active.calendar.sowing, endBy: active.calendar.endBy } : null} />
        )}
        {showCompare && !permanent && <div id="compare">{compare}</div>}
      </div>

      <div className="two-facts">
        <div className="fact water">
          <p className="kicker">Water · {permanent ? "your input" : s.water.lastTurn ? "your input" : "unknown"}</p>
          {permanent ? (
            <p><strong>{water.headline}</strong> {water.detail}</p>
          ) : (
            <p><strong>{active ? `${active.calendar.turns} canal turn(s) after sowing` : "No cover to water"}.</strong> Last useful turn {s.water.lastTurn ? fmtDate(s.water.lastTurn, true) : "unknown"}; canal closes {fmtDate(s.water.closure, true)}. Turns are chances to water, not proof of enough water.</p>
          )}
        </div>
        <div className="fact nasa">
          <p className="kicker">NASA POWER · general cold check</p>
          {cold ? <p><strong>{cold.summary.met} of {cold.summary.total} years</strong> had {cold.d}+ days from {fmtDate(cold.start)} before a night at or below {fmtT(cold.t)} °C (your threshold).</p> : <p className="warn-text">Not read for these dates; candidates stay conditional.</p>}
          <p className="fact-note">{cold?.lagDays ? `Regional record: cold nights come about ${Math.round(cold.lagDays)} days later than at Neuquén airport, so it may understate cold.` : "Regional record; may understate cold."} A past frequency, not a forecast.</p>
          <button type="button" className="linkbtn" onClick={() => onExplore("power")}>Explore climate evidence</button>
        </div>
      </div>

      {active && (
        <details className="pc-box nchain-box">
          <summary><span className="kicker">{/fixes N/.test(active.nutrient) ? "Nitrogen service" : "Nutrient service"} · process, not a quantity</span> <strong>{/fixes N/.test(active.nutrient) ? "From living roots to possible availability" : active.nutrient}</strong></summary>
          {active.nChain ? (
            <ol className="nsteps">{active.nChain.map((n, i) => <li key={n.step}><CropIcon id={active.id} size={26} /><span><small>0{i + 1}</small><strong>{n.step}</strong><em>{n.status}</em></span></li>)}</ol>
          ) : <p>{active.name} {active.nutrient}.</p>}
          <p className="chart-foot">Quantities and timing are not modelled. Grasses capture existing nitrogen and their residue can hold it back for a while; legumes add nitrogen from the air. Satellite greenness and surface fractions do not measure available nitrogen or replace fertiliser.</p>
        </details>
      )}

      <details className="more">
        <summary>{permanent ? "Compare with current practice" : "Compare with current practice and the full option table"}</summary>
        <p><strong>Leave it as it is</strong> (baseline): {sug.baseline.text}</p>
        {permanent ? <p className="chart-foot">The annual option table (field-free dates, strategies A/B/C) does not apply while the {cropName(s.previousCropId).toLowerCase()} stays in place.</p> : table}
        <h3 className="sub-h">How this suggestion is made</h3>
        <p>{sug.why}</p>
        <ul>{sug.rules.map((r) => <li key={r}>{r}</li>)}</ul>
        <p className="chart-foot">Main crop: {cropById(s.previousCropId).name}{permanent ? "" : ` → ${cropById(s.nextCropId).name}`}.</p>
      </details>
    </section>
  );
}
