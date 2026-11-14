import { cropById, familyAlert } from "./catalog";
import { fmtDate, type ISODate } from "./dates";

/**
 * Plot context. These inputs never change the calendar arithmetic; they feed
 * only "Reported plot conditions" and "Next step". "Unknown" is a valid answer.
 */

export type Texture = "unknown" | "sand" | "loamy sand" | "sandy loam" | "loam" | "silt loam" | "clay loam" | "clay";

export type SalinityMethod = "irrigation water" | "saturated-paste ECe" | "EC1:5" | "other";

export type Salinity =
  | { kind: "unknown" }
  | { kind: "reported" } // observation without analysis
  | { kind: "measured"; value: number; unit: string; method: SalinityMethod; date: ISODate | null; depth: string };

export interface PastCrop {
  cropId: string | "other" | "unknown";
  label?: string;
  approxDate: string; // free text, e.g. "Mar 2025"
}

export interface PlotContext {
  texture: Texture;
  waterlogging: { kind: "unknown" } | { kind: "no" } | { kind: "yes"; sector: string; duration: string };
  salinity: Salinity;
  lastCrops: PastCrop[];
  healthProblemRecorded: "unknown" | "none" | string;
}

export const EMPTY_CONTEXT: PlotContext = {
  texture: "unknown",
  waterlogging: { kind: "unknown" },
  salinity: { kind: "unknown" },
  lastCrops: [],
  healthProblemRecorded: "unknown",
};

/** Salinity is shown exactly as entered: never converted between methods, never classified. */
export function salinityText(s: Salinity): string {
  switch (s.kind) {
    case "unknown":
      return "Salinity: unknown.";
    case "reported":
      return "Salinity: reported, not measured.";
    case "measured":
      return `Salinity: ${s.value} ${s.unit}, ${s.method}${s.date ? `, ${fmtDate(s.date, true)}` : ""}${s.depth ? `, ${s.depth}` : ""}. Shown as entered.`;
  }
}

export interface Condition {
  id: "waterlogging" | "salinity" | "texture" | "family" | "history";
  text: string;
  review: boolean; // opens a review of plot conditions
}

export function reportedConditions(ctx: PlotContext, previousId: string, nextId: string, isCover: boolean): Condition[] {
  const out: Condition[] = [];
  if (ctx.waterlogging.kind === "yes") {
    out.push({ id: "waterlogging", review: true, text: `Waterlogging reported${ctx.waterlogging.sector ? ` in ${ctx.waterlogging.sector}` : ""}${ctx.waterlogging.duration ? `, about ${ctx.waterlogging.duration}` : ""}.` });
  } else if (ctx.waterlogging.kind === "no") {
    out.push({ id: "waterlogging", review: false, text: "No waterlogging reported." });
  }
  if (ctx.salinity.kind !== "unknown") out.push({ id: "salinity", review: true, text: salinityText(ctx.salinity) });
  if (ctx.texture !== "unknown") out.push({ id: "texture", review: false, text: `Texture: ${ctx.texture} (reported).` });
  const fam = familyAlert(previousId, nextId);
  if (fam) out.push({ id: "family", review: true, text: isCover ? fam : `The next crop repeats ${cropById(previousId).family}.` });
  const hist = historyText(ctx.lastCrops);
  if (hist) out.push({ id: "history", review: false, text: hist });
  return out;
}

/** Descriptive count of families among recorded crops; no risk index. */
export function historyText(crops: PastCrop[]): string | null {
  const known = crops.filter((c) => c.cropId !== "unknown" && c.cropId !== "other");
  if (!known.length) return null;
  const counts = new Map<string, number>();
  for (const c of known) {
    const f = cropById(c.cropId).family;
    counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  const [fam, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (n < 2) return `${crops.length} recorded crop(s), no family repeated.`;
  return `${n} of the ${crops.length} recorded crops are ${fam}.`;
}
