// Fails the build if the published output contains files that must stay out of it:
// local data-access configs or credentials, and the original provincial parcel file with its
// full attribute table (not redistributed while its redistribution terms are unconfirmed; see
// docs/DATA_SOURCES.md). Derived parcel layers with boundaries as served (parcel_outlines.json,
// study_parcels.json) are published on purpose. This checks documented rules only; it is not a
// general secret scanner.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, extname } from "node:path";

const ROOT = process.argv[2] ?? "dist";
// Matched against the file name only, so the rules hold with Windows and POSIX separators.
const FORBIDDEN_NAMES = [/parcelario/i, /cluster_parcels/i, /candidates\.png/i, /^[._]netrc$/i, /^\.dodsrc$/i, /^\.env/i, /power_raw\.json$/i, /\.provenance\.json$/i, /^\.dev\.vars/i];
const FORBIDDEN_TEXT = [
  // The original layer's attribute table (as served by the WFS) is not republished; derived files use objectid/type.
  [/"(PAR_ID|CCA|UND_ARA|SAG)"\s*:/, "original parcel-layer attribute field (the original file is not redistributed)"],
  [/machine\s+urs\.earthdata\.nasa\.gov/i, "netrc credential entry"],
  [/Bearer\s+[A-Za-z0-9._-]{20,}/, "bearer token"],
  [/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, "JSON web token"],
  [/"access_token"\s*:/, "access token"],
  [/(CLOUDFLARE_API_TOKEN|CF_API_TOKEN|EARTHDATA_TOKEN|EARTHDATA_PASSWORD)\s*[=:]\s*\S{8,}/, "credential variable"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
];
const TEXT_EXT = new Set([".json", ".js", ".html", ".css", ".md", ".txt", ".csv", ".geojson", ".map"]);

const problems = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (FORBIDDEN_NAMES.some((r) => r.test(basename(p)))) problems.push(`${p}: forbidden file`);
    // Text files, and files without an extension (such as .netrc), are scanned for credential patterns.
    if (TEXT_EXT.has(extname(p).toLowerCase()) || extname(p) === "" || basename(p).startsWith(".")) {
      const t = readFileSync(p, "utf8");
      for (const [r, what] of FORBIDDEN_TEXT) if (r.test(t)) problems.push(`${p}: ${what}`);
    }
  }
}
walk(ROOT);

// The derived parcel layers must keep their source attribution with them.
for (const name of ["data/parcel_outlines.json", "data/study_parcels.json"]) {
  let t;
  try { t = readFileSync(join(ROOT, name), "utf8"); } catch { continue; }
  if (!/Gerencia de Catastro/.test(t) || !/IDERN/.test(t)) problems.push(`${name}: missing source attribution`);
}
if (problems.length) {
  console.error("Publish check failed:\n" + problems.join("\n"));
  process.exit(1);
}
console.log(`Publish check passed (${ROOT}).`);
