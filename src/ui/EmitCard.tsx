import { fmtDate } from "../engine/dates";
import type { EmitFrcov } from "../data";

/**
 * "What was on the ground on this date?" from EMIT Fractional Cover, only for
 * scenes the probe actually read with valid pixels. Real acquisition dates;
 * never moved to the 2024 season or the plan year. Cluster scope only.
 */
export function EmitCard({ emit, onSources }: { emit: EmitFrcov | null; onSources?: () => void }) {
  const ok = emit?.scenes.filter((s) => s.status === "values" && s.median) ?? [];
  if (!emit || !ok.length) return null;
  const pct = (v: number) => `${Math.round(v * 100)} %`;
  return (
    <details className="card evidence">
      <summary>What was on the ground on a few dates (NASA EMIT: January, February and November 2024, September 2026)</summary>
      <div className="evidence-b">
        <p className="hint">Share of each 60 m pixel covered by green plants, dry plant material (dry plants, litter and other non-green material, not only crop residue) and bare soil, for the four examples together. Real acquisition dates only: EMIT has no scene over the area between March and October 2024, so none is shown for the winter gap.</p>
        <div className="tbl-scroll" tabIndex={0}>
          <table className="data">
            <caption className="tbl-cap">Median share of the valid pixels on each real acquisition date. "Median per-pixel unc." is the median of the uncertainties EMIT publishes per pixel, not the uncertainty or a confidence interval of the cluster value.</caption>
            <thead><tr><th>Date</th><th className="r">Green plants</th><th className="r">Dry plant material</th><th className="r">Bare soil</th><th className="r">Valid pixels</th></tr></thead>
            <tbody>
              {ok.map((s) => (
                <tr key={s.scene}>
                  <td className="num">{fmtDate(s.acquired, true)}</td>
                  <td className="r num">{pct(s.median!.PV)} <small>(median per-pixel unc. {pct(s.medianUncertainty!.PV)})</small></td>
                  <td className="r num">{pct(s.median!.NPV)} <small>(median per-pixel unc. {pct(s.medianUncertainty!.NPV)})</small></td>
                  <td className="r num">{pct(s.median!.BARE)} <small>(median per-pixel unc. {pct(s.medianUncertainty!.BARE)})</small></td>
                  <td className="r num">{s.validPixels} of {s.pixelsInside}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="chart-foot">Median of each share over the valid pixels (product quality code QC 0), taken separately, so the three need not add to 100 %. The per-pixel uncertainty is the product's own; no uncertainty of the cluster value is computed here. {emit.limits} Source: {emit.product}, retrieved {emit.retrieved.slice(0, 10)}. Not soil nitrogen and not winter 2024 cover.{onSources && <> <button type="button" className="linkbtn" onClick={onSources}>Source status</button></>}</p>
      </div>
    </details>
  );
}
