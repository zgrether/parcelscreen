/**
 * The report's sections in the prototype's order (proto L1453–1557): each block with its heading. The
 * explorer's panel wraps each in a collapsible Section; the Phase 1 parcel page will render the same list
 * with its own headings.
 */
import type { ReactNode } from "react";
import { buildHeading } from "@/lib/report/build";
import { drivewayHeading } from "@/lib/report/driveway";
import { gardenHeading } from "@/lib/report/garden";
import { houseHeading } from "@/lib/report/house";
import type { Heading } from "@/lib/report/parts";
import { skyHeading } from "@/lib/report/sky";
import { soilsHeading } from "@/lib/report/soils";
import { sunHeading } from "@/lib/report/sun";
import { floodHeading, gettingThereHeading, publicLandHeading } from "@/lib/report/surroundings";
import { terrainHeading } from "@/lib/report/terrain";
import { unknownHeading } from "@/lib/report/unknown";
import { verdictHeading } from "@/lib/report/verdict";
import type { PartialScreenResult } from "@/lib/screen/types";
import { DarkSkies } from "./blocks/DarkSkies";
import { DecemberSun } from "./blocks/DecemberSun";
import { Driveway } from "./blocks/Driveway";
import { ExistingHouse } from "./blocks/ExistingHouse";
import { Floodplain } from "./blocks/Floodplain";
import { GettingThere } from "./blocks/GettingThere";
import { PublicLand } from "./blocks/PublicLand";
import { Soils } from "./blocks/Soils";
import { StillUnknown } from "./blocks/StillUnknown";
import { Terrain } from "./blocks/Terrain";
import type { BlockProps, EvaluationPoint } from "./blocks/types";
import { Verdict } from "./blocks/Verdict";
import { WhereToBuild } from "./blocks/WhereToBuild";
import { WhereToGarden } from "./blocks/WhereToGarden";

export interface ReportSection {
  /** A plain function of its props (no hooks), so it can be called to see whether it renders anything. */
  Block(props: BlockProps): ReactNode;
  heading(result: PartialScreenResult, point: EvaluationPoint | null): Heading;
}

export const REPORT: readonly ReportSection[] = [
  { Block: Verdict, heading: () => verdictHeading },
  { Block: Terrain, heading: () => terrainHeading },
  { Block: DecemberSun, heading: (_, p) => sunHeading(p) },
  { Block: DarkSkies, heading: skyHeading },
  { Block: ExistingHouse, heading: () => houseHeading },
  { Block: WhereToBuild, heading: () => buildHeading },
  { Block: Driveway, heading: drivewayHeading },
  { Block: WhereToGarden, heading: () => gardenHeading },
  { Block: Soils, heading: () => soilsHeading },
  { Block: Floodplain, heading: () => floodHeading },
  { Block: PublicLand, heading: () => publicLandHeading },
  { Block: GettingThere, heading: () => gettingThereHeading },
  { Block: StillUnknown, heading: () => unknownHeading },
];

/** Which sections start open, by slug (proto OPEN_DEFAULT, L1194); the rest start closed. */
export const OPEN_DEFAULT: Readonly<Record<string, boolean>> = {
  verdict: true,
  terrain: true,
  "december-sun": true,
  "dark-skies": true,
  "where-to-build": true,
  "where-to-garden": true,
  "the-existing-house": true,
  driveway: true,
};
