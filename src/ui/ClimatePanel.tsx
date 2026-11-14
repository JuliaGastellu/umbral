import { diffDays, fmtDate, isValidISO, type ISODate } from "../engine/dates";
import { fmtT, type Condition, type ExposureSummary } from "../engine/climate";
import type { ClimateReading, ClimateSettings, StationSummary } from "../engine/exposure";
import type { PowerMeta } from "../data";

interface Props {
  reading: ClimateReading | null;
  cfg: ClimateSettings;
  setCfg: (c: ClimateSettings) => void;
  meta: PowerMeta | null;
  station: StationSummary | null;
  nextCrop: ISODate;
  openDrawer: (s: string) => void;
  loading: boolean;
  /** Same question for the plan date and the other date, on one scale. */
  compare?: { planDate: ISODate; altDate: ISODate; plan: ExposureSummary; alt: ExposureSummary } | null;
}

/** One-line caveat placed next to the count it qualifies. */
export function biasNote(st: StationSummary | null, t: number): string {
  const lag = st?.firstEventMedianLagDays[String(t)];
  if (!st || lag === null || lag === undefined) return "Not yet compared with a local weather station.";
  return `This regional record tends to place the first cold night later than the Neuquén airport station (about ${Math.round(lag)} days at ${fmtT(t)} °C), so read it as optimistic.`;
}

export function ClimatePanel({ reading, cfg, setCfg, meta, station, nextCrop, openDrawer, loading, compare }: Props) {
  const r = reading && !reading.error ? reading : null;
  return (
    <section className="card" aria-labelledby="clim-h" id="cold">
      <div className="card-h">
        <h2 id="clim-h">In past years, how long until the first cold night?</h2>
      </div>
      <div className="card-b">
        {loading && <div className="skel" style={{ height: 120 }} aria-label="Loading weather records" />}
        {!loading && !reading && <p className="banner">The weather record did not load, so past cold nights cannot be counted. The rest of the page still works.</p>}
        {reading?.error && <p className="banner" role="alert">{reading.error}</p>}
        {r && (
          <>
            <p className="big-answer">
              In <strong>{r.summary.met} of {r.summary.total}</strong> years there were at least {r.d} days between {fmtDate(r.start)} and the first night at or below {fmtT(r.t)} °C.
            </p>
            <p className="caveat-line">{biasNote(station, r.t)}</p>
            <YearGroups r={r} />
            {compare && compare.planDate !== compare.altDate && <CompareBars c={compare} d={r.d} t={r.t} />}
            <p className="chart-foot">
              Each square is one year, {r.summary.firstYear}–{r.summary.lastYear}. Counted from {fmtDate(r.start)} until {fmtDate(r.end)}. Source: NASA POWER regional weather record.
            </p>
          </>
        )}
        <details className="more">
          <summary>Change the question</summary>
          <div className="controls-inline">
            <div className="field">
              <span className="lbl">Cold night: lowest temperature at or below</span>
              <div className="seg" role="radiogroup" aria-label="Cold-night temperature">
                {[0, -2, -4].map((t) => (
                  <button key={t} type="button" role="radio" aria-checked={cfg.t === t} onClick={() => setCfg({ ...cfg, t })}>
                    {fmtT(t)} °C
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label htmlFor="cl-d">Days wanted before it</label>
              <input id="cl-d" className="input" type="number" min={1} max={250} value={cfg.d} onChange={(e) => setCfg({ ...cfg, d: Math.max(1, Math.min(250, Math.round(+e.target.value || 1))) })} style={{ width: 96 }} />
            </div>
            <div className="field">
              <span className="lbl">Count from</span>
              <div className="seg" role="radiogroup" aria-label="Count from">
                {(["A", "B", "C"] as const).map((id) => (
                  <button key={id} type="button" role="radio" aria-checked={cfg.strategy === id} onClick={() => setCfg({ ...cfg, strategy: id })}>
                    {id === "A" ? "Plot free" : id === "B" ? "Grass sowing" : "Legume sowing"}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label htmlFor="cl-end">Look until</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <input id="cl-end" className="input" type="date" value={cfg.searchEnd ?? nextCrop} onChange={(e) => isValidISO(e.target.value) && setCfg({ ...cfg, searchEnd: e.target.value })} style={{ width: "auto" }} />
                {cfg.searchEnd && <button type="button" className="btn small" onClick={() => setCfg({ ...cfg, searchEnd: null })}>Next crop</button>}
              </div>
            </div>
          </div>
          <p className="chart-foot">The temperature is a weather mark, not the point where a plant dies. 30 days comes from US advice for hairy vetch (sow 30–45 days before a hard frost).</p>
        </details>
        {r && (
          <details className="more">
            <summary>See every year</summary>
            <YearRows r={r} />
          </details>
        )}
        <details className="more">
          <summary>How this was built</summary>
          <p className="chart-foot">
            NASA POWER daily minimum temperature (T2M_MIN), a regional reanalysis on a cell of about 55 km, {meta ? `${meta.start.slice(0, 4)}–${meta.end.slice(0, 4)}` : ""}. A year counts as "yes" if the first night at or below the threshold came on day {cfg.d} or later, or if {cfg.d} days passed with none; "no" if it came sooner; "can't tell" if fewer than {cfg.d} days were covered. {station ? `Compared with NOAA GSOD at Neuquén Aero, ${station.period}: POWER minima ${station.biasC > 0 ? "+" : ""}${station.biasC} °C on average; first cold night later by a median of ${station.firstEventMedianLagDays["0"]}, ${station.firstEventMedianLagDays["-2"]} and ${station.firstEventMedianLagDays["-4"]} days at 0, −2 and −4 °C. No correction applied.` : ""}{" "}
            <button type="button" className="linkbtn" onClick={() => openDrawer("power")}>Full method</button>
          </p>
        </details>
      </div>
    </section>
  );
}

const GROUP_TEXT = (g: Condition, d: number, t: number) =>
  g === "met" ? `${d} days or more before the first night at or below ${fmtT(t)} °C` : g === "not-met" ? `fewer than ${d} days` : "can't tell (not enough days in the record)";

function YearGroups({ r }: { r: ClimateReading }) {
  const groups: Condition[] = ["met", "not-met", "not-evaluable"];
  const count: Record<Condition, number> = { met: r.summary.met, "not-met": r.summary.notMet, "not-evaluable": r.summary.notEvaluable };
  const years: Record<Condition, number[]> = { met: [], "not-met": [], "not-evaluable": [] };
  r.rows.forEach((row, i) => years[r.conditions[i]].push(row.year));
  return (
    <div className="ygrid" role="img" aria-label={r.sentence}>
      {groups.filter((g) => count[g] > 0 || g !== "not-evaluable").map((g) => (
        <div key={g} className={`yrow c-${g}`}>
          <div className="yrow-count">{count[g]}</div>
          <div className="yrow-body">
            <div className="yrow-label">{GROUP_TEXT(g, r.d, r.t)}</div>
            <div className="yrow-cells" aria-hidden="true">
              {years[g].map((y) => <span key={y} className="ycell" title={String(y)} />)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CompareBars({ c, d, t }: { c: NonNullable<Props["compare"]>; d: number; t: number }) {
  const W = 420;
  const rows = [
    { label: `Plan: field free ${fmtDate(c.planDate)}`, s: c.plan },
    { label: `Other date: ${fmtDate(c.altDate)}`, s: c.alt },
  ];
  const total = Math.max(c.plan.total, c.alt.total, 1);
  const sx = (n: number) => (n / total) * W;
  return (
    <div className="cmp-bars">
      <h3 className="sub-q">Your plan and the other date, same question</h3>
      <div className="tbl-scroll">
        <svg width={W + 230} height={rows.length * 46 + 26} role="img" aria-label={rows.map((r) => `${r.label}: ${r.s.met} of ${r.s.total} years with ${d} or more days before the first night at or below ${fmtT(t)} °C, ${r.s.notMet} with fewer, ${r.s.notEvaluable} can't tell`).join(". ")}>
          {rows.map((r, i) => {
            const y = 8 + i * 46;
            return (
              <g key={r.label}>
                <text x={0} y={y + 14} className="ax strong">{r.label}</text>
                <rect x={0} y={y + 20} width={sx(r.s.met)} height={16} fill="oklch(55% 0.06 250)" />
                <rect x={sx(r.s.met)} y={y + 20} width={sx(r.s.notMet)} height={16} fill="url(#pat-term)" stroke="oklch(45% 0.06 250)" strokeWidth={0.6} />
                <rect x={sx(r.s.met + r.s.notMet)} y={y + 20} width={sx(r.s.notEvaluable)} height={16} fill="white" stroke="var(--border-strong)" strokeDasharray="3 2" />
                <text x={W + 10} y={y + 33} className="ax" fill="var(--text)">{r.s.met} yes · {r.s.notMet} no{r.s.notEvaluable ? ` · ${r.s.notEvaluable} can't tell` : ""}</text>
              </g>
            );
          })}
          <text x={0} y={rows.length * 46 + 22} className="ax">0</text>
          <text x={W} y={rows.length * 46 + 22} textAnchor="end" className="ax">{total} years</text>
        </svg>
      </div>
      <p className="chart-foot">Solid: {d} or more days before the first night at or below {fmtT(t)} °C. Striped: fewer. Dashed: can't tell.</p>
    </div>
  );
}

function YearRows({ r }: { r: ClimateReading }) {
  const span = Math.max(1, diffDays(r.start, r.end) + 1);
  const W = 240;
  const sx = (d: number) => (Math.min(d, span) / span) * W;
  return (
    <div className="yrows-wrap" tabIndex={0} role="region" aria-label="Every year, scrollable table">
      <table className="data yrows">
        <caption>
          First night at or below {fmtT(r.t)} °C after {fmtDate(r.start)}. Bar: days until that night. Dashed line: {r.d} days.
        </caption>
        <thead>
          <tr><th>Year</th><th>First cold night</th><th className="r">Days</th><th className="r">Lowest</th><th>{r.d} days or more?</th><th aria-hidden="true">Days until it</th></tr>
        </thead>
        <tbody>
          {r.rows.map((row, i) => {
            const c = r.conditions[i];
            const d = row.outcome === "event" ? row.days : row.outcome === "none" ? row.observedDays : row.cleanDays;
            return (
              <tr key={row.year}>
                <td className="num">{row.year}</td>
                <td className="num">{row.outcome === "event" ? fmtDate(row.date) : row.outcome === "none" ? `none by ${fmtDate(r.end)}` : "missing data"}</td>
                <td className="r num">{row.outcome === "event" ? row.days : row.outcome === "none" ? `> ${row.observedDays - 1}` : "—"}</td>
                <td className="r num">{row.outcome === "event" ? `${row.tmin} °C` : "—"}</td>
                <td>{c === "met" ? "yes" : c === "not-met" ? "no" : "can't tell"}</td>
                <td aria-hidden="true">
                  <svg width={W + 8} height={12}>
                    <rect x={0} y={3} width={Math.max(1, sx(d))} height={6} fill={c === "not-met" ? "url(#pat-term)" : "oklch(55% 0.06 250)"} stroke="oklch(45% 0.06 250)" strokeWidth={0.6} />
                    <line x1={sx(r.d)} x2={sx(r.d)} y1={0} y2={12} stroke="var(--text)" strokeDasharray="2 2" />
                  </svg>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
