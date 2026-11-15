/**
 * Reference catalog. Every reference keeps its zone, year and source.
 * A reference date never becomes "the General Roca date": scenario dates are
 * set separately and labelled as assumptions.
 */

export type Provenance = "observed" | "calculated" | "assumed";

export interface Source {
  id: string;
  short: string;
  title: string; // original-language title kept
  url?: string;
  zone?: string;
  year?: string;
  status: string; // what was verified
}

export const SOURCES: Record<string, Source> = {
  POWER: {
    id: "POWER", short: "NASA POWER",
    title: "NASA Prediction Of Worldwide Energy Resources (POWER), daily point API v2.10.3, community AG (MERRA-2 / GEOS-IT)",
    url: "https://power.larc.nasa.gov/", status: "Downloaded and validated (see provenance.json).",
  },
  POWER_VAL: {
    id: "POWER_VAL", short: "POWER validation (E9)",
    title: "POWER meteorology sources and global validation against GSOD (daily Tmin: R² 0.87, RMSE 3.15 °C, MBE +0.32 °C)",
    url: "https://power.larc.nasa.gov/docs/methodology/data/sources_meteorology/", zone: "Global (2,599 stations)", year: "1981–2020",
    status: "Global validation. It does not validate threshold crossings in the Alto Valle.",
  },
  GSOD: {
    id: "GSOD", short: "NOAA GSOD 87715099999",
    title: "NOAA NCEI Global Surface Summary of the Day, station 87715099999 (Presidente Perón, Neuquén)",
    url: "https://www.ncei.noaa.gov/data/global-summary-of-the-day/", zone: "Neuquén airport, about 50 km west of General Roca",
    status: "Used for the regional check only.",
  },
  HLS: {
    id: "HLS", short: "HLS v2.0",
    title: "Harmonized Landsat and Sentinel-2 (HLS) v2.0: HLSL30, HLSS30 and vegetation indices HLSL30_VI, HLSS30_VI. NASA/USGS Landsat 8/9 and ESA Sentinel-2 (partner-agency data), distributed by NASA LP DAAC",
    url: "https://doi.org/10.5067/HLS/HLSL30_VI.002", status: "Collection IDs verified in CMR; Fmask bits read from file metadata.",
  },
  WORLDCOVER: {
    id: "WORLDCOVER", short: "ESA WorldCover 2021",
    title: "ESA WorldCover 10 m 2021 v200", url: "https://doi.org/10.5281/zenodo.7254221",
    status: "Used only to screen out parcels dominated by tree cover (likely orchards).",
  },
  CADASTRE: {
    id: "CADASTRE", short: "Provincial cadastral layer",
    title: "Gerencia de Catastro – Agencia de Recaudación Tributaria, Provincia de Río Negro. IDERN WFS layer geonode:PARCELARIO1",
    url: "https://idern.rionegro.gov.ar/geoserver/ows",
    status: "Public provincial service (no fees, no access constraints) with a 2019 provincial statement of free and open GIS use; not a formal open license. Only derived statistics and a generalized outline are published.",
  },
  E15: {
    id: "E15", short: "DPA 2024 closure (E15)",
    title: "Departamento Provincial de Aguas: Río Negro se prepara para la temporada de corte de riego",
    url: "https://dpa.rionegro.gov.ar/articulo/49125/rio-negro-se-prepara-para-la-temporada-de-corte-de-riego?n=MzU1",
    zone: "Alto Valle (Dique Ballester)", year: "2024",
    status: "First cut on 29 Apr in the 2024 season. A system closure, not the last turn of a given plot.",
  },
  E19: {
    id: "E19", short: "Mean last frost (E19)",
    title: "INTA Alto Valle: mean last frost on 6 Oct; frost period from the first half of April to the first half of October",
    zone: "Alto Valle", status: "Secondary summary (argentina.gob.ar item 398315); primary source not yet read. Context only, not a safety guarantee.",
  },
  E17: {
    id: "E17", short: "Vetch in almond orchard (E17)",
    title: "Domini et al., Evaluación del aporte de nitrógeno de Vicia villosa (INTA EEA Alto Valle / UNCo)",
    url: "https://repositorio.inta.gob.ar/handle/20.500.12123/24945", zone: "Cipolletti, Alto Valle (orchard)", year: "2024",
    status: "Vetch sown on 10 Apr 2024 in an almond orchard. Different system; context only.",
  },
  VANZOLINI: {
    id: "VANZOLINI", short: "Vanzolini 2011",
    title: "Vanzolini, J. I. (2011). La vicia villosa como cultivo de cobertura: efectos de corto plazo sobre el suelo y la productividad del maíz bajo riego en el valle bonaerense del Río Colorado. Tesis de Magíster, UNS; ensayos en EEA INTA Hilario Ascasubi",
    url: "https://repositorio.inta.gob.ar/handle/20.500.12123/6999", zone: "Hilario Ascasubi, Buenos Aires (irrigated)", year: "2011",
    status: "Abstract read 14 Nov 2026; full thesis not read.",
  },
  SUAREZ: {
    id: "SUAREZ", short: "Suarez et al. 2025",
    title: "Suarez, Dumon, González, Vega, Muzi, Gajardo (2025). Impacto de la consociación de la Vicia Sp. en el cultivo de avena para pastoreo. IX Jornada de Investigación y Extensión, CURZA-UNCo",
    url: "https://admin.curza.uncoma.edu.ar/publicaciones/wp-content/uploads/sites/19/2025/08/3-Suarez.pdf", zone: "EEA INTA Valle Inferior del Río Negro", year: "2025",
    status: "Abstract read 14 Nov 2026 (one page).",
  },
  AAPRESID: {
    id: "AAPRESID", short: "Aapresid VINPA 2025",
    title: "Aapresid (2025). ¿Maíces de 12 toneladas sin fertilizante? Chacra VINPA, valles irrigados norpatagónicos",
    url: "https://www.aapresid.org.ar/blog/maices-12-toneladas-fertilizante", zone: "North Patagonian irrigated valleys", year: "2025",
    status: "Institutional communication read 14 Nov 2026; protocol and data not obtained.",
  },
  PEPITA_INTA: {
    id: "PEPITA_INTA", short: "INTA Alto Valle 2025 (pome fruit)",
    title: "INTA (2025). Innovación en la formación y el manejo de plantaciones de manzanos y perales: hacia una fruticultura más eficiente y sostenible",
    url: "https://www.argentina.gob.ar/noticias/innovacion-en-la-formacion-y-el-manejo-de-plantaciones-de-manzanos-y-perales-hacia-una",
    zone: "INTA EEA Alto Valle (Río Negro and Neuquén)", year: "2025",
    status: "Read 15 Nov 2026: describes EEA Alto Valle as the heart of Argentine pome-fruit growing. Presence only.",
  },
  CAROZO_INTA: {
    id: "CAROZO_INTA", short: "INTA Alto Valle variety sheets (stone fruit)",
    title: "Calvo, P. C. et al. Fichas varietales de duraznos, nectarines y ciruelas (INTA EEA Alto Valle)",
    url: "https://repositorio.inta.gob.ar/xmlui/bitstream/handle/20.500.12123/15852/INTA_CRPatagoniaNorte_EEAAltoValle_Calvo_PC_Fichas_varietales_duraznos_nectarines_ciruelas.pdf?isAllowed=y&sequence=1",
    zone: "INTA EEA Alto Valle", status: "Cited in the 15 Nov research brief for peach, nectarine and plum; the PDF did not open on re-check (connection reset). Presence only.",
  },
  FRUTILLA_INTA: {
    id: "FRUTILLA_INTA", short: "INTA Patagonia strawberry guide",
    title: "Miserendino, E. Frutillas: implantación del cultivo en Patagonia (INTA EEA Alto Valle)",
    url: "https://repositorio.inta.gob.ar/bitstream/handle/20.500.12123/17772/INTA_CRPatagoniaNorte_EEAAltoValle_Miserendino_E_Frutillas_implantaci%C3%B3n_cultivo_Patagonia.pdf?isAllowed=y&sequence=1",
    zone: "Patagonia (INTA EEA Alto Valle)", status: "Cited in the 15 Nov research brief (a crop kept for about two years); the PDF did not open on re-check. Presence and bed management only.",
  },
  PECAN_INTA: {
    id: "PECAN_INTA", short: "INTA Valle Inferior 2026 (pecan)",
    title: "INTA (2026). Pecán: estudian la respuesta de las variedades para precisar la aptitud agroclimática",
    url: "https://www.argentina.gob.ar/noticias/pecan-estudian-la-respuesta-de-las-variedades-para-precisar-la-aptitud-agroclimatica",
    zone: "Valle Inferior de Río Negro (not Alto Valle)", year: "2026",
    status: "Read 15 Nov 2026: 18 varieties, about 11 years of data, phenology varies between regions and years. Not a validation for General Roca.",
  },
  SARE_PEA: {
    id: "SARE_PEA", short: "SARE field peas", title: "SARE, Managing Cover Crops Profitably: Field peas",
    url: "https://www.sare.org/publications/managing-cover-crops-profitably/legume-cover-crops/field-peas/", zone: "United States", status: "Read 15 Nov 2026.",
  },
  SARE_BRASSICA: {
    id: "SARE_BRASSICA", short: "SARE brassicas", title: "SARE, Managing Cover Crops Profitably: Brassicas and mustards (forage radish)",
    url: "https://www.sare.org/publications/managing-cover-crops-profitably/nonlegume-cover-crops/brassicas-and-mustards/", zone: "United States", status: "Read 15 Nov 2026.",
  },
  SARE_BUCKWHEAT: {
    id: "SARE_BUCKWHEAT", short: "SARE buckwheat", title: "SARE, Managing Cover Crops Profitably: Buckwheat",
    url: "https://www.sare.org/publications/managing-cover-crops-profitably/nonlegume-cover-crops/buckwheat/", zone: "United States", status: "Read 15 Nov 2026.",
  },
  SAREP_BELLBEAN: {
    id: "SAREP_BELLBEAN", short: "UC SAREP bell bean", title: "UC SAREP Cover Crop Database: Bell bean (Vicia faba, small-seeded)",
    url: "https://sarep.ucdavis.edu/covercrop/bellbean", zone: "California", status: "Page returned HTTP 403 on 15 Nov 2026; statements come from the research brief and need re-checking.",
  },
  SAREP_CLOVER: {
    id: "SAREP_CLOVER", short: "UC SAREP strawberry clover", title: "UC SAREP Cover Crop Database: Strawberry clover (Trifolium fragiferum)",
    url: "https://sarep.ucdavis.edu/covercrop/strawberryclover", zone: "California", status: "Page returned HTTP 403 on 15 Nov 2026; statements come from the research brief and need re-checking.",
  },
  NOALE: {
    id: "NOALE", short: "Noale 2015",
    title: "Noale (2015), Trabajo final, UNLP: ensayos de tomate para industria en Choele Choel",
    url: "https://lipa.agro.unlp.edu.ar/wp-content/uploads/sites/29/2020/03/Trabajo-Final-Noale.pdf",
    zone: "Choele Choel, Valle Medio", year: "2015",
    status: "Transplant in early October; table 7 lists sowing and incorporation of a winter green crop before tomato. Not a measurement of its benefit.",
  },
  INTA_PRESS: {
    id: "INTA_PRESS", short: "INTA garden calendar (press)",
    title: "Huerta de noviembre: qué verduras y hortalizas sembrar según el INTA (Diario Río Negro)",
    url: "https://www.rionegro.com.ar/estar-bien/huerta-de-noviembre-que-verduras-y-hortalizas-sembrar-segun-el-inta-4775247/",
    zone: "Río Negro (garden guide)", status: "Press summary of an INTA garden calendar.",
  },
  REINOSO: {
    id: "REINOSO", short: "Reinoso et al.",
    title: "Reinoso et al., potencial de rendimiento de maíz (INTA Valle Inferior, UNRN)",
    url: "https://rid.unrn.edu.ar/bitstream/20.500.12049/7522/1/Reinoso_potencial_maiz%20%281%29.pdf",
    zone: "Valle Inferior (simulation, 47 years)", status: "Optimal sowing 1 Oct to 15 Nov.",
  },
  SAGYP: {
    id: "SAGYP", short: "SAGyP 2023 onion",
    title: "SAGyP, Informe de producción de cebolla (enero 2023)",
    url: "https://www.argentina.gob.ar/sites/default/files/sagyp-informe-produccion-cebolla-enero-2023-2.pdf",
    zone: "Southern Buenos Aires (external zone)", year: "2023", status: "Early sowing March–May; the paragraph refers to southern Buenos Aires, not Río Negro.",
  },
  SARE_OATS: {
    id: "SARE_OATS", short: "SARE oats",
    title: "SARE, Managing Cover Crops Profitably: Oats", url: "https://www.sare.org/publications/managing-cover-crops-profitably/nonlegume-cover-crops/oats/",
    zone: "United States", status: "Wait about 3 weeks after termination before sensitive crops (US guidance).",
  },
  SARE_RYE: {
    id: "SARE_RYE", short: "SARE cereal rye",
    title: "SARE, Managing Cover Crops Profitably: Cereal Rye", url: "https://www.sare.org/publications/managing-cover-crops-profitably/nonlegume-cover-crops/cereal-rye/",
    zone: "United States", status: "Wait 3–4 weeks before small-seeded crops; transplants less affected (US guidance).",
  },
  SARE_VETCH: {
    id: "SARE_VETCH", short: "SARE hairy vetch (E5)",
    title: "SARE, Managing Cover Crops Profitably: Hairy Vetch", url: "https://www.sare.org/publications/managing-cover-crops-profitably/legume-cover-crops/hairy-vetch/",
    zone: "United States", status: "Sow 30–45 d before a hard frost (US guidance). No termination interval for vegetables is given.",
  },
  POWO: {
    id: "POWO", short: "POWO (Kew)",
    title: "Plants of the World Online, Royal Botanic Gardens, Kew (APG IV families)", url: "https://powo.science.kew.org/",
    status: "Family assignments for the crops in this catalog.",
  },
  SENASA_2026: {
    id: "SENASA_2026", short: "SENASA/INTA 2026",
    title: "Capacitaciones sobre protección vegetal y barrera zoofitosanitaria de Río Negro y Neuquén (argentina.gob.ar, 4 Sep 2026)",
    url: "https://www.argentina.gob.ar/noticias/capacitaciones-sobre-proteccion-vegetal-y-barrera-zoofitosanitaria-de-rio-negro-y-neuquen",
    zone: "Alto Valle", year: "2026",
    status: "Context: mentions reconversion in the Alto Valle and maize and alfalfa. Not a crop calendar.",
  },
  INTA_FD99: {
    id: "INTA_FD99", short: "INTA 2025, Alto Valle Este",
    title: "INTA, revista FD 99: caracterización (Alto Valle Este, 2025)",
    url: "https://www.argentina.gob.ar/sites/default/files/2025/12/inta_revista-fd_99_caracterizacion.pdf",
    zone: "Alto Valle Este (not all of General Roca)", year: "2025",
    status: "Context for the scope of annual crops; not read in full here. Not used for dates.",
  },
  INTA_8309: {
    id: "INTA_8309", short: "INTA repository 8309",
    title: "INTA EEA Alto Valle, repository item 20.500.12123/8309 (winter green crops)",
    url: "https://repositorio.inta.gob.ar/handle/20.500.12123/8309",
    zone: "Alto Valle", status: "Context: oats, rye and vetch as winter green crops in forage or orchard settings. Full PDF not read; not a validation of the scenario.",
  },
  INTA_14470: {
    id: "INTA_14470", short: "INTA repository 14470",
    title: "INTA EEA Alto Valle, repository item 20.500.12123/14470 (winter green crops)",
    url: "https://repositorio.inta.gob.ar/handle/20.500.12123/14470",
    zone: "Alto Valle", status: "Context only, as above. Full PDF not read.",
  },
  PAREDES: {
    id: "PAREDES", short: "Paredes 2019",
    title: "Paredes (2019), CIEA: horticultores de Campo Grande y Cipolletti",
    url: "https://www.ciea.com.ar/web/CIEA2019/doc/16-V/5_Paredes---Tamara-Paredes.docx", zone: "Campo Grande and Cipolletti", year: "2019",
    status: "No field operations May–August in the group described; tenure makes investment hard. Does not prove bare soil.",
  },
};

export type Family = string;

export type ProductionSystem = "annual" | "orchard" | "beds";
export type CropGroup = "Vegetables and field crops" | "Pome fruit" | "Stone fruit" | "Nuts" | "Small fruit" | "Citrus" | "Other";

export interface Crop {
  id: string;
  name: string;
  species: string;
  family: Family;
  /** Every botanical family involved (mixtures or crops of uncertain identity can have several or "unknown"). */
  families: Family[];
  group: CropGroup;
  /** How the crop occupies the field: annual rotation, permanent orchard, or beds that may be kept. */
  system: ProductionSystem;
  leaf?: "deciduous" | "evergreen";
  reference: string;
  harvest: string;
  planting: string;
  /** Evidence that the crop is grown in the region; presence is not a recommendation to plant it. */
  presence: string;
  sourceId: string | null;
}

const NOT_MODELLED = "Dates not modelled for this crop; enter your own management dates.";
const tree = (id: string, name: string, species: string, family: string, group: CropGroup, presence: string, sourceId: string | null, leaf: "deciduous" | "evergreen" = "deciduous"): Crop => ({
  id, name, species, family, families: [family], group, system: "orchard", leaf, reference: NOT_MODELLED, harvest: "The trees stay after harvest: there is no field-free date.", planting: NOT_MODELLED, presence, sourceId,
});

export const CROPS: Crop[] = [
  { id: "tomato", name: "Tomato (processing)", species: "Solanum lycopersicum", family: "Solanaceae", families: ["Solanaceae"], group: "Vegetables and field crops", system: "annual", reference: "Transplant in early October; harvest January–April. Choele Choel, Valle Medio (Noale 2015).", harvest: "Harvest January–April (processing tomato, Choele Choel, Valle Medio; Noale 2015).", planting: "Transplant in early October (processing tomato, Choele Choel, Valle Medio; Noale 2015).", presence: "Valle Medio source (Noale 2015).", sourceId: "NOALE" },
  { id: "squash", name: "Squash", species: "Cucurbita maxima", family: "Cucurbitaceae", families: ["Cucurbitaceae"], group: "Vegetables and field crops", system: "annual", reference: "Direct sowing October–November. Río Negro garden guide (INTA, press summary).", harvest: "Harvested before winter; no local harvest date found. Enter your own date.", planting: "Direct sowing October–November (Río Negro garden guide, INTA, press summary).", presence: "Río Negro garden guide (INTA press summary).", sourceId: "INTA_PRESS" },
  { id: "maize", name: "Maize", species: "Zea mays", family: "Poaceae", families: ["Poaceae"], group: "Vegetables and field crops", system: "annual", reference: "Optimal sowing 1 Oct to 15 Nov. Valle Inferior, simulation (Reinoso et al.).", harvest: "Harvested in autumn; no local date found. Grain, forage and sweet corn leave the field at different times: enter your own date.", planting: "Sowing 1 Oct to 15 Nov is best (Valle Inferior simulation; Reinoso et al.).", presence: "Valle Inferior simulation (Reinoso et al.).", sourceId: "REINOSO" },
  { id: "onion", name: "Onion", species: "Allium cepa", family: "Amaryllidaceae", families: ["Amaryllidaceae"], group: "Vegetables and field crops", system: "annual", reference: "Early sowing March–May. Southern Buenos Aires, external zone (SAGyP 2023).", harvest: "Early onion harvested mid-December to February (southern Buenos Aires, not Río Negro; SAGyP 2023).", planting: "Early onion sown March–May (southern Buenos Aires, not Río Negro; SAGyP 2023).", presence: "External zone source (SAGyP 2023).", sourceId: "SAGYP" },
  tree("apple", "Apple", "Malus domestica", "Rosaceae", "Pome fruit", "Grown in the Alto Valle (INTA EEA Alto Valle, 2025).", "PEPITA_INTA"),
  tree("pear", "Pear", "Pyrus communis", "Rosaceae", "Pome fruit", "Grown in the Alto Valle (INTA EEA Alto Valle, 2025).", "PEPITA_INTA"),
  tree("peach", "Peach", "Prunus persica", "Rosaceae", "Stone fruit", "INTA Alto Valle variety sheets (cited; PDF not re-opened).", "CAROZO_INTA"),
  tree("nectarine", "Nectarine", "Prunus persica var. nucipersica", "Rosaceae", "Stone fruit", "INTA Alto Valle variety sheets (cited; PDF not re-opened).", "CAROZO_INTA"),
  tree("plum", "Plum", "Prunus domestica / P. salicina", "Rosaceae", "Stone fruit", "INTA Alto Valle variety sheets (cited; PDF not re-opened).", "CAROZO_INTA"),
  tree("cherry", "Cherry", "Prunus avium", "Rosaceae", "Stone fruit", "Regional presence source not verified in this version.", null),
  tree("apricot", "Apricot", "Prunus armeniaca", "Rosaceae", "Stone fruit", "Regional presence source not verified in this version.", null),
  tree("almond", "Almond", "Prunus dulcis", "Rosaceae", "Nuts", "Almond orchard trial in Cipolletti (Domini et al., 2024).", "E17"),
  tree("pecan", "Pecan", "Carya illinoinensis", "Juglandaceae", "Nuts", "Variety study in the Valle Inferior, not the Alto Valle (INTA 2026).", "PECAN_INTA"),
  tree("walnut", "Walnut", "Juglans regia", "Juglandaceae", "Nuts", "Regional presence source not verified in this version. Not the same crop as pecan.", null),
  { id: "strawberry", name: "Strawberry", species: "Fragaria × ananassa", family: "Rosaceae", families: ["Rosaceae"], group: "Small fruit", system: "beds", reference: NOT_MODELLED, harvest: "Harvest does not end the crop: plants are often kept for a second season (INTA Patagonia guide, cited).", planting: NOT_MODELLED, presence: "INTA Patagonia strawberry guide (cited; PDF not re-opened).", sourceId: "FRUTILLA_INTA" },
  tree("orange", "Orange", "Citrus sinensis", "Rutaceae", "Citrus", "Requested; no Alto Valle source verified. Not assumed suitable in General Roca.", null, "evergreen"),
  tree("mandarin", "Mandarin", "Citrus reticulata", "Rutaceae", "Citrus", "Requested; no Alto Valle source verified. Not assumed suitable in General Roca.", null, "evergreen"),
  tree("lemon", "Lemon", "Citrus limon", "Rutaceae", "Citrus", "Requested; no Alto Valle source verified. Not assumed suitable in General Roca.", null, "evergreen"),
  tree("grapefruit", "Grapefruit", "Citrus × paradisi", "Rutaceae", "Citrus", "Requested; no Alto Valle source verified. Not assumed suitable in General Roca.", null, "evergreen"),
];

export const CROP_GROUPS: CropGroup[] = ["Vegetables and field crops", "Pome fruit", "Stone fruit", "Nuts", "Small fruit", "Citrus"];

/** "other:Name" keeps the person's crop name; relationships stay unknown. Never falls back to another crop. */
export function otherCrop(name: string): Crop {
  return { id: `other:${name}`, name: name || "Other crop", species: "not recorded", family: "unknown", families: ["unknown"], group: "Other", system: "annual", reference: NOT_MODELLED, harvest: NOT_MODELLED, planting: NOT_MODELLED, presence: "Entered by you; not evaluated.", sourceId: null };
}

export function cropById(id: string): Crop {
  if (id.startsWith("other:")) return otherCrop(id.slice(6));
  return CROPS.find((c) => c.id === id) ?? otherCrop(id);
}

/** Fixed descriptive text. It never estimates disease or claims the cover breaks a cycle. */
export function familyAlert(previousId: string, nextId: string): string | null {
  const p = cropById(previousId);
  const n = cropById(nextId);
  if (p.family === "unknown" || n.family === "unknown" || p.family !== n.family) return null;
  return `The next crop repeats ${p.family}. A cover adds a different species between both crops. To judge whether it helps with a plant health problem, it is necessary to know what problem occurred and whether the cover can also host it.`;
}

export interface CoverVariant {
  id: string;
  name: string;
  species: string;
  family: Family;
  /** Annual covers end within the season; perennial ones do not end by themselves. */
  habit?: "annual" | "perennial";
  /** Researched as a candidate; no local experience found. */
  experimental?: boolean;
  terminationDays: number;
  terminationSource: string; // shown as "scenario assumption, from US guidance for ..."
  terminationSourceId: string | null;
}

export interface StrategyDef {
  id: "A" | "B" | "C";
  name: string;
  short: string;
  pattern: "solid" | "hatched" | "dotted";
  variants: CoverVariant[];
  operations: string[];
}

export const STRATEGIES: StrategyDef[] = [
  {
    id: "A", name: "Current practice", short: "Residue, bare soil or volunteer vegetation", pattern: "solid", variants: [], operations: [],
  },
  {
    id: "B", name: "Grass cover", short: "Rye, or oat as a variant", pattern: "hatched",
    variants: [
      { id: "rye", name: "Cereal rye", species: "Secale cereale", family: "Poaceae", terminationDays: 28, terminationSource: "Scenario assumption, from US guidance for small-seeded vegetable crops after rye (3–4 weeks)", terminationSourceId: "SARE_RYE" },
      { id: "oat", name: "Oat", species: "Avena sativa", family: "Poaceae", terminationDays: 21, terminationSource: "Scenario assumption, from US guidance before sensitive crops after oats (about 3 weeks)", terminationSourceId: "SARE_OATS" },
      { id: "radish", name: "Forage radish", species: "Raphanus sativus", family: "Brassicaceae", habit: "annual", experimental: true, terminationDays: 21, terminationSource: "Assumption without a source for this species", terminationSourceId: null },
      { id: "buckwheat", name: "Buckwheat", species: "Fagopyrum esculentum", family: "Polygonaceae", habit: "annual", experimental: true, terminationDays: 21, terminationSource: "Assumption without a source for this species", terminationSourceId: null },
    ],
    operations: ["sowing", "termination"],
  },
  {
    id: "C", name: "Legume cover", short: "Hairy vetch, or vetch with oat", pattern: "dotted",
    variants: [
      { id: "vetch", name: "Hairy vetch", species: "Vicia villosa", family: "Fabaceae", terminationDays: 21, terminationSource: "Scenario assumption without a source: no termination interval for vegetables found", terminationSourceId: null },
      { id: "pea", name: "Winter field pea", species: "Pisum sativum", family: "Fabaceae", habit: "annual", experimental: true, terminationDays: 21, terminationSource: "Assumption without a source for this species", terminationSourceId: null },
      { id: "faba", name: "Small-seeded faba bean", species: "Vicia faba", family: "Fabaceae", habit: "annual", experimental: true, terminationDays: 21, terminationSource: "Assumption without a source for this species", terminationSourceId: null },
      { id: "clover", name: "Strawberry clover", species: "Trifolium fragiferum", family: "Fabaceae", habit: "perennial", experimental: true, terminationDays: 21, terminationSource: "Perennial: does not end by itself; assumption without a source", terminationSourceId: null },
      { id: "vetch-oat", name: "Hairy vetch + oat", species: "Vicia villosa + Avena sativa", family: "Fabaceae", terminationDays: 21, terminationSource: "Scenario assumption, from US guidance for oats (about 3 weeks); no source for the mixture", terminationSourceId: "SARE_OATS" },
    ],
    operations: ["sowing", "termination"],
  },
];
