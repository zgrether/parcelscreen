/**
 * Which of today's report sections each card panel carries (value-ranking.md §6.1): everything in the long report
 * moves into the panel of the row or gate it belongs to, unchanged, and nothing is deleted. A section can sit in
 * more than one panel (the driveway under both road gates; the terrain under Elevation and Room to build).
 */
import type { PanelKey } from "@/lib/report/cardPanels";
import { Climate } from "../blocks/Climate";
import { Privacy } from "../blocks/Privacy";
import { LongView } from "../blocks/LongView";
import { LongTrails } from "../blocks/LongTrails";
import { Internet } from "../blocks/Internet";
import { DarkSkies } from "../blocks/DarkSkies";
import { DecemberSun } from "../blocks/DecemberSun";
import { Driveway } from "../blocks/Driveway";
import { ExistingHouse } from "../blocks/ExistingHouse";
import { Floodplain } from "../blocks/Floodplain";
import { GettingThere } from "../blocks/GettingThere";
import { PublicLand } from "../blocks/PublicLand";
import { Soils } from "../blocks/Soils";
import { StillUnknown } from "../blocks/StillUnknown";
import { Terrain } from "../blocks/Terrain";
import { Climbing } from "../blocks/Climbing";
import { Paddling } from "../blocks/Paddling";
import { Verdict } from "../blocks/Verdict";
import { WhereToBuild } from "../blocks/WhereToBuild";
import { WhereToGarden } from "../blocks/WhereToGarden";
import { REPORT, type ReportSection } from "../report";

type Block = ReportSection["Block"];

const BLOCKS: Record<PanelKey, Block[]> = {
  // The verdict and its flags (§6.1: each flag in its own row's panel is a follow-up; the flags carry no source).
  verdict: [Verdict],
  floodplain: [Floodplain],
  access: [Driveway],
  easement: [Driveway],
  septic: [Soils],
  elevation: [Terrain],
  homesite: [WhereToBuild, ExistingHouse, DecemberSun],
  sky: [DarkSkies],
  room: [Terrain],
  driveway: [Driveway],
  trails: [PublicLand, GettingThere],
  town: [GettingThere],
  hospital: [GettingThere],
  garden: [WhereToGarden, Soils],
  climate: [Climate],
  privacy: [Privacy],
  longView: [LongView],
  airport: [GettingThere],
  longTrail: [LongTrails],
  internet: [Internet],
  paddling: [Paddling],
  climbing: [Climbing],
  // Step 10: the breakdown is the panels' own (CardPanel's CostBreakdown). Still unknown stays where it was.
  budget: [],
  cost: [StillUnknown],
};

/** A panel's report sections, with their headings, in the panel's order. */
export function panelSections(key: PanelKey): ReportSection[] {
  return BLOCKS[key].map((Block) => {
    const s = REPORT.find((x) => x.Block === Block);
    if (!s) throw new Error(`panel ${key}: a block that isn't in the report`);
    return s;
  });
}

export const PANEL_KEYS = Object.keys(BLOCKS) as PanelKey[];
