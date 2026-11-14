import { addDays } from "./dates";
import { evaluateStrategy, type CalendarInputs, type CalendarState, type StrategyInputs } from "./calendar";

/**
 * Sensitivity: which parameters change a strategy's calendar status, and at
 * which value. Each parameter is shifted one day (or one unit) at a time in
 * both directions within a declared range; the first value that changes the
 * state is reported. This is a direct scan over the engine, so it is exact
 * for the engine's own rules; tests compare it with analytic margins.
 */

export type ParamId = "release" | "sowing" | "nextCrop" | "preparation" | "termination" | "lastTurn" | "duration";

export interface Change {
  param: ParamId;
  label: string;
  delta: number; // signed shift (days)
  to: CalendarState;
  text: string;
}

const RANGE = 120;

type Apply = (c: CalendarInputs, s: StrategyInputs, d: number) => [CalendarInputs, StrategyInputs] | null;

const PARAMS: { id: ParamId; label: string; apply: Apply; unit: "date" | "days" }[] = [
  {
    id: "release", label: "Release", unit: "date",
    apply: (c, s, d) => {
      const release = addDays(c.release, d);
      // sowing keeps its delay after release
      const sowing = s.sowing ? addDays(s.sowing, d) : null;
      return [{ ...c, release }, { ...s, sowing }];
    },
  },
  { id: "sowing", label: "Cover sowing", unit: "date", apply: (c, s, d) => (s.sowing ? [c, { ...s, sowing: addDays(s.sowing, d) }] : null) },
  { id: "nextCrop", label: "Next-crop date", unit: "date", apply: (c, s, d) => [{ ...c, nextCrop: addDays(c.nextCrop, d) }, s] },
  { id: "preparation", label: "Preparation time", unit: "days", apply: (c, s, d) => (c.preparationDays + d < 0 ? null : [{ ...c, preparationDays: c.preparationDays + d }, s]) },
  { id: "termination", label: "Termination interval", unit: "days", apply: (c, s, d) => (s.sowing === null || s.terminationDays + d < 0 ? null : [c, { ...s, terminationDays: s.terminationDays + d }]) },
  {
    id: "lastTurn", label: "Last turn", unit: "date",
    apply: (c, s, d) => (c.water.lastTurn && s.sowing ? [{ ...c, water: { ...c.water, lastTurn: addDays(c.water.lastTurn, d) } }, s] : null),
  },
  {
    id: "duration", label: "Target cover duration", unit: "days",
    apply: (c, s, d) => (s.sowing === null || s.targetDurationDays === null || s.targetDurationDays + d < 0 ? null : [c, { ...s, targetDurationDays: s.targetDurationDays + d }]),
  },
];

function stateOf(c: CalendarInputs, s: StrategyInputs): CalendarState {
  return evaluateStrategy(c, s).state;
}

export function firstChange(c: CalendarInputs, s: StrategyInputs, param: ParamId, dir: 1 | -1, range = RANGE): { delta: number; to: CalendarState } | null {
  const p = PARAMS.find((x) => x.id === param)!;
  const base = stateOf(c, s);
  for (let k = 1; k <= range; k++) {
    const r = p.apply(c, s, dir * k);
    if (!r) return null;
    const st = stateOf(r[0], r[1]);
    if (st !== base) return { delta: dir * k, to: st };
  }
  return null;
}

const STATE_WORD: Record<CalendarState, string> = {
  fits: "fits",
  "needs-data": "needs data",
  "no-fit-even-with-data": "doesn't fit even with data",
  "no-fit": "doesn't fit",
  invalid: "becomes an invalid input",
};

export function sensitivity(c: CalendarInputs, s: StrategyInputs): Change[] {
  const out: Change[] = [];
  for (const p of PARAMS) {
    for (const dir of [1, -1] as const) {
      const ch = firstChange(c, s, p.id, dir);
      if (!ch || ch.to === "invalid") continue;
      const n = Math.abs(ch.delta);
      const what = p.unit === "date" ? `${p.label} ${n} d ${dir > 0 ? "later" : "earlier"}` : `${p.label} ${dir > 0 ? "+" : "−"}${n} d`;
      out.push({ param: p.id, label: p.label, delta: ch.delta, to: ch.to, text: `${what}: ${STATE_WORD[ch.to]}` });
    }
  }
  return out.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
}
