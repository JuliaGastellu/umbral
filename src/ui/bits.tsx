import type { ReactNode } from "react";
import type { Provenance } from "../engine/catalog";

export function Tag({ kind, title }: { kind: Provenance; title?: string }) {
  const word = kind === "observed" ? "Observed" : kind === "calculated" ? "Calculated" : "Assumed";
  return (
    <span className={`tag ${kind}`} title={title ?? word}>
      {word}
    </span>
  );
}

export function Info({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" className="info" onClick={onClick} aria-label={`About ${label}`}>
      i
    </button>
  );
}

export function Num({ children }: { children: ReactNode }) {
  return <span className="num">{children}</span>;
}

/** Wordmark: a threshold line crossing a furrow. */
export function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <path d="M2 15 Q11 7 20 15" fill="none" stroke="currentColor" strokeWidth="2" />
      <line x1="2" y1="11" x2="20" y2="11" stroke="oklch(66% 0.14 50)" strokeWidth="2" strokeDasharray="3 2" />
    </svg>
  );
}

export function days(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${n < 0 ? "−" : ""}${Math.abs(n)} d`;
}

/** SVG patterns for the three strategies (solid / hatched / dotted). */
export function StrategyPatterns() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <pattern id="pat-B" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="oklch(90% 0.06 130)" />
          <rect width="3" height="6" fill="oklch(60% 0.12 130)" />
        </pattern>
        <pattern id="pat-C" width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="oklch(92% 0.04 300)" />
          <circle cx="3" cy="3" r="1.6" fill="oklch(55% 0.13 300)" />
        </pattern>
        <pattern id="pat-term" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <rect width="4" height="4" fill="white" />
          <rect width="1" height="4" fill="oklch(78% 0.025 110)" />
        </pattern>
        <pattern id="pat-prep" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" fill="oklch(95% 0.02 50)" />
          <rect width="1.2" height="5" fill="oklch(66% 0.14 50 / 0.5)" />
        </pattern>
      </defs>
    </svg>
  );
}

export function Swatch({ id }: { id: "A" | "B" | "C" }) {
  const fill = id === "A" ? "var(--a)" : `url(#pat-${id})`;
  return (
    <svg className="swatch" width="28" height="14" aria-hidden="true">
      <rect x="0.5" y="0.5" width="27" height="13" rx="3" fill={fill} stroke={id === "A" ? "var(--a)" : id === "B" ? "var(--b)" : "var(--c)"} />
    </svg>
  );
}
