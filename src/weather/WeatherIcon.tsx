import type { Num } from "./model";
import { weatherWord } from "./model";

type Kind = "clear" | "mostly-clear" | "partly" | "overcast" | "fog" | "drizzle" | "rain" | "snow" | "storm" | "unknown";

function kindOf(code: Num): Kind {
  if (code === null) return "unknown";
  if (code === 0) return "clear";
  if (code === 1) return "mostly-clear";
  if (code === 2) return "partly";
  if (code === 3) return "overcast";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "unknown";
}

const SUN = "#f2a93b";
const CLOUD = "#c9d3dc";
const CLOUD_D = "#8c9aa8";
const RAIN = "#3f86c6";

function Sun({ x = 20, y = 20, r = 8 }: { x?: number; y?: number; r?: number }) {
  return (
    <g>
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <line key={a} x1={x + Math.cos((a * Math.PI) / 180) * (r + 3)} y1={y + Math.sin((a * Math.PI) / 180) * (r + 3)} x2={x + Math.cos((a * Math.PI) / 180) * (r + 7)} y2={y + Math.sin((a * Math.PI) / 180) * (r + 7)} stroke={SUN} strokeWidth={2.4} strokeLinecap="round" />
      ))}
      <circle cx={x} cy={y} r={r} fill={SUN} />
    </g>
  );
}

function Cloud({ dx = 0, dy = 0, fill = CLOUD }: { dx?: number; dy?: number; fill?: string }) {
  return <path transform={`translate(${dx} ${dy})`} d="M12 34 C6 34 4 28 8 25 C8 19 15 17 18 21 C20 15 30 15 31 22 C37 21 40 27 36 31 C35 33 33 34 31 34 Z" fill={fill} stroke="#6f7f8f" strokeWidth={1.2} />;
}

/** Weather symbol for a WMO code. The text label is always shown next to it or given as the accessible name. */
export function WeatherIcon({ code, size = 48, label = true }: { code: Num; size?: number; label?: boolean }) {
  const k = kindOf(code);
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role={label ? "img" : undefined} aria-label={label ? weatherWord(code) : undefined} aria-hidden={label ? undefined : true}>
      {k === "clear" && <Sun x={24} y={24} r={9} />}
      {k === "mostly-clear" && (<><Sun x={22} y={20} r={8} /><Cloud dx={10} dy={8} /></>)}
      {k === "partly" && (<><Sun x={17} y={16} r={7} /><Cloud dx={4} dy={4} /></>)}
      {k === "overcast" && (<><Cloud dx={-2} dy={-6} fill={CLOUD_D} /><Cloud dx={4} dy={2} /></>)}
      {k === "fog" && (<><Cloud dx={2} dy={-6} /> {[32, 37, 42].map((y) => <line key={y} x1={8} x2={40} y1={y} y2={y} stroke={CLOUD_D} strokeWidth={2.4} strokeLinecap="round" />)}</>)}
      {(k === "drizzle" || k === "rain") && (<><Cloud dx={2} dy={-6} />{(k === "rain" ? [14, 22, 30] : [17, 27]).map((x) => <line key={x} x1={x} y1={33} x2={x - 3} y2={42} stroke={RAIN} strokeWidth={2.4} strokeLinecap="round" />)}</>)}
      {k === "snow" && (<><Cloud dx={2} dy={-6} />{[15, 24, 33].map((x) => <text key={x} x={x} y={42} textAnchor="middle" fontSize={11} fill={RAIN}>*</text>)}</>)}
      {k === "storm" && (<><Cloud dx={2} dy={-6} fill={CLOUD_D} /><path d="M24 30 L19 39 L24 39 L21 46 L30 35 L25 35 L28 30 Z" fill={SUN} /></>)}
      {k === "unknown" && <text x={24} y={30} textAnchor="middle" fontSize={16} fill="#888">?</text>}
    </svg>
  );
}
