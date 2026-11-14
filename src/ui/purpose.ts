/**
 * "What each cover is for": plain words, no numbers, each with its source.
 * Wording checked against the SARE "Managing Cover Crops Profitably" pages
 * on 14 Nov 2026 (US guidance, not local results):
 *  - cereal rye: "The hardiest of cereals"; "Inexpensive and easy to establish";
 *    "the best cool-season cereal cover for absorbing unused soil N";
 *    "immobilizes N as it decomposes"; "The N tie-up varies directly with the maturity".
 *  - oats: "Quick to germinate"; "take up excess N ... when planted early enough";
 *    "will winterkill in most of zone 7 or colder"; "Mix with: ... vetch".
 *  - hairy vetch: "heavy contributions of mineralized N (readily available to the
 *    following cash crop)"; "grows slowly in fall"; "Plant vetch 30 to 45 days
 *    before killing frost".
 */
export interface Purpose {
  text: string;
  source: string;
}

export const COVER_PURPOSE: Record<string, Purpose> = {
  A: { text: "No seed and no extra work; none of the effects below.", source: "" },
  rye: {
    text: "The hardiest of the cereals and easy to establish. It is good at taking up nitrogen left in the soil by the previous crop. As its residue breaks down it holds back nitrogen for a while, more so the older the rye is when ended.",
    source: "SARE, cereal rye (US guidance)",
  },
  oat: {
    text: "Quick to germinate and good at smothering weeds. It takes up leftover nitrogen when sown early enough. Hard winter cold can kill it.",
    source: "SARE, oats (US guidance)",
  },
  vetch: {
    text: "A legume: it takes nitrogen from the air and leaves part of it, readily available, for the next crop. It grows slowly in autumn, so it needs to be sown well before the cold: 30 to 45 days before a killing frost.",
    source: "SARE, hairy vetch (US guidance)",
  },
  "vetch-oat": {
    text: "Combines both: the oat germinates quickly and covers the ground; the vetch adds nitrogen for the next crop and needs an early sowing.",
    source: "SARE, oats and hairy vetch (US guidance)",
  },
};

export const LOCAL_VETCH_CONTEXT =
  "Local context: a hairy vetch trial in Cipolletti (Domini et al., INTA/UNCo, 2024) was measured in an almond orchard, not in vegetable plots; no figure is transferred.";
