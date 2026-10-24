/** Build's yes / maybe / no (step 14 §3.1, §11): the card's answers restated, on Mud Creek's sites and soils. */
import { describe, expect, it } from "vitest";
import { expectedOf } from "@/test/support/expected";
import { gateOf, point, synthetic } from "@/test/support/uses";
import type { Row } from "../report/card";
import type { PartialScreenResult } from "../screen/types";
import { build } from "./build";

const MUD = expectedOf("grayson-mud-creek-6273", "run");
/** Every soil rated as given, nothing shallow and no flooding: conventional or modified. */
const soils = (septic: string): PartialScreenResult => ({
  ...MUD,
  soils: MUD.soils!.map((s) => ({ ...s, septic, wtdepannmin: null, brockdepmin: null, flodfreqdcd: "None" })),
});
const PASS = [
  gateOf("floodplain", "pass", "No FEMA flood zone on the parcel"),
  gateOf("access", "pass", "Frontage on Mud Creek Ln"),
  gateOf("easement", "pass", "The driveway stays on the parcel"),
  gateOf("septic", "pass", "Some soil on the parcel rates better than very limited for a septic field"),
];
const withGate = (i: number, status: "warn" | "fail" | "unknown", reason: string) =>
  PASS.map((g, j) => (j === i ? gateOf(g.key, status, reason) : g));
const room = (checkFirst: string): Row => ({
  key: "room",
  label: "Room to build",
  grade: "F",
  detail: "",
  checkFirst,
});

describe("Build", () => {
  const site1 = MUD.sites![0]!;
  const rows: [string, Parameters<typeof synthetic>, string, string][] = [
    [
      "the gates pass, the site fits, conventional septic: yes, restated plainly",
      [soils("Somewhat limited"), { gates: PASS }],
      "yes",
      "A 1.3 ac site at 3,543 ft, conventional septic likely",
    ],
    [
      "a septic permit with its class near the site: yes, the permit said",
      [
        soils("Very limited"),
        { gates: PASS },
        { marks: [{ ...point("septic", site1.ll), septicClass: "conventional" }] },
      ],
      "yes",
      "A 1.3 ac site at 3,543 ft, a septic permit is on file",
    ],
    [
      "the site's soil wants a modified system: maybe",
      [soils("Very limited"), { gates: PASS }],
      "maybe",
      "Septic at site #1 likely needs a modified system",
    ],
    [
      "a gate warns: maybe, the card's reason",
      [
        soils("Not limited"),
        { gates: withGate(2, "warn", "The driveway needs an easement across neighbouring land") },
      ],
      "maybe",
      "The driveway needs an easement across neighbouring land",
    ],
    [
      "a gate couldn't be checked: maybe, the card's reason",
      [soils("Not limited"), { gates: withGate(0, "unknown", "The FEMA flood map didn't load") }],
      "maybe",
      "The FEMA flood map didn't load",
    ],
    [
      "the build doesn't fit: maybe, the card's check first",
      [soils("Not limited"), { gates: PASS, rows: [room("your build doesn't fit on any homesite")] }],
      "maybe",
      "Your build doesn't fit on any homesite",
    ],
    [
      "a gate fails: no, the card's reason",
      [soils("Not limited"), { gates: withGate(0, "fail", "The build site is in a FEMA flood zone") }],
      "no",
      "The build site is in a FEMA flood zone",
    ],
    ["no site: no", [{ ...MUD, sites: [] }, { gates: PASS }], "no", "No build site found"],
    [
      "the homesites weren't ranked: maybe, said",
      [{ ...MUD, sites: undefined }, { gates: PASS }],
      "maybe",
      "The homesite ranking didn't load",
    ],
  ];
  it.each(rows)("%s", (_, args, answer, reason) => {
    expect(build(synthetic(...args))).toMatchObject({ answer, reason });
  });

  it("lists the site, each gate's reason and the septic class", () => {
    const a = build(synthetic(soils("Not limited"), { gates: PASS }));
    expect(a.decides.map((f) => f.label)).toEqual([
      "Build site",
      "floodplain",
      "access",
      "easement",
      "septic",
      "Septic class at the site",
    ]);
    expect(a.decides[0]!.value).toBe("site #1, 1.3 ac, 3,543 ft");
  });
});
