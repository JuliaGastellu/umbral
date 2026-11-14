// Fails the build if the published output contains files or fields that must stay private:
// the raw cadastral layer, cadastral identifiers, local data-access configs or credentials.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = process.argv[2] ?? "dist";
const FORBIDDEN_NAMES = [/parcelario/i, /cluster_parcels/i, /candidates\.png/i, /(^|[\/])[._]netrc$/i, /\.dodsrc$/i, /\.env/i, /power_raw\.json$/i];
const FORBIDDEN_TEXT = [
  [/"(PAR_ID|CCA|OBJECTID|TPA|ARA|UND_ARA|SAG)"\s*:/, "cadastral identifier or attribute field"],
  [/innerGeometry/, "full-precision parcel geometry"],
  [/"properties"\s*:\s*\{\s*"/, "feature properties (map outlines must carry no attributes)"],
  [/GERENCIA DE CATASTRO/, "raw cadastral attribute value"],
  [/machine\s+urs\.earthdata\.nasa\.gov/i, "netrc credential entry"],
  [/Authorization:\s*Bearer\s+[A-Za-z0-9._-]{20,}/, "bearer token"],
  [/"access_token"\s*:/, "access token"],
];
const TEXT_EXT = new Set([".json", ".js", ".html", ".css", ".md", ".txt", ".csv", ".geojson", ".map"]);

const problems = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (FORBIDDEN_NAMES.some((r) => r.test(p))) problems.push(`${p}: forbidden file`);
    if (TEXT_EXT.has(extname(p).toLowerCase())) {
      const t = readFileSync(p, "utf8");
      for (const [r, what] of FORBIDDEN_TEXT) if (r.test(t)) problems.push(`${p}: ${what}`);
    }
  }
}
walk(ROOT);
if (problems.length) {
  console.error("Publish check failed:\n" + problems.join("\n"));
  process.exit(1);
}
console.log(`Publish check passed (${ROOT}).`);
