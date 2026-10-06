/**
 * "How to read this" (proto L289–337): plain-language notes on every section, the prototype's copy verbatim
 * (C4 already fixed: a compact site carries 15 pad-cost points). Each section's id is the anchor its "?"
 * link opens (the report headings' `help`). Pure: no hooks, so a page or a print could carry it too.
 */
export function HelpText() {
  return (
    <>
      <p className="tiny muted">
        Plain-language notes on every section. Nothing here replaces walking the land — it tells you whether
        the walk is worth the drive.
      </p>

      <h3 id="h-what">What the tool does</h3>
      <p>
        You give it a parcel boundary. It pulls public data — lidar elevation, NRCS soils, FEMA flood maps,
        protected-land boundaries, the Light Pollution Atlas, roads, hospitals and groceries — and answers one
        question: <b>is there a good place to live on this land, and where?</b> It is a desk screen. It kills
        parcels before you drive; it doesn&apos;t buy them.
      </p>

      <h3 id="h-verdict">Verdict</h3>
      <p>
        Three outcomes. <b>Walk away</b>: something unfixable (no sun in December, floodplain over most of it,
        nowhere to build). <b>Worth a drive, eyes open</b>: workable, with the specific things to check
        listed. <b>Nothing in the data kills it</b>: no flags — which is not the same as good; read the rest.
      </p>

      <h3 id="h-terrain">Terrain and suitability</h3>
      <p>
        Every cell of ground inside the boundary gets a <b>house suitability score</b>, 0–100, from three
        things multiplied together:
      </p>
      <ul className="plain">
        <li>
          <b>Slope</b> — the cost of a level pad. Under 6° is free; 10° is a bulldozer day; 14° is real
          cut-and-fill; 18° needs a retaining wall; over 22° scores zero.
        </li>
        <li>
          <b>Aspect</b> — which way the ground faces. South-southeast is best for winter sun and warmth;
          north-facing is not disqualified, it just scores lower. Nearly flat ground faces every way and gets
          full credit.
        </li>
        <li>
          <b>Frost position</b> — height above the lowest ground nearby. On still clear nights cold air drains
          downhill and pools in the low spots, which get fog and frost the slope above them doesn&apos;t. The
          score bottoms at 40 in the pocket and reaches 100 about 80 ft up — the &quot;thermal belt.&quot;
        </li>
      </ul>
      <p>
        A <b>house site</b> is a connected patch of at least 0.3 acres scoring 60+. A <b>shelf</b> is smaller
        or lower-scoring ground (45+, 0.1 ac) that&apos;s fine for a shop, barn or garage; a shelf of 0.15 ac
        or more is also ranked as a <b>compact site</b> — a house is possible there with a cut pad and
        retaining walls, and it carries 15 pad-cost points for that earthwork. If a house already stands on
        one, the earthwork is done. A <b>garden patch</b> uses its own score, weighted hard toward frost
        position, gentle slope, and a southern face, then adjusted by the soil under it. The overlay button on
        the map cycles between the house map, the garden map, and plain slope. Red is bad, green is good;
        solid dark green is a house site, blue is a shelf, teal is a garden.
      </p>
      <p>None of this is a veto. Bottomland soil is — see Soils.</p>

      <h3 id="h-sun">December sun</h3>
      <p>
        Computed at the <b>evaluation point</b> — the bulls-eye if you marked a house, otherwise site #1; tap
        any pin to move it. The app traces the skyline in every direction from that point and runs the
        sun&apos;s path across it for December 21, the shortest day. <b>Direct-sun hours</b> is how long the
        sun is actually above the ridges. The chart shows the skyline in grey with the sun&apos;s arc over it;
        the map fan shows a ray toward each ridge, red where it blocks the sun. Winter sun decides passive
        heating and solar production, and a ridge cannot be moved.
      </p>

      <h3 id="h-sky">Dark skies</h3>
      <p>
        <b>Mag/arcsec²</b> is sky brightness straight overhead from the Light Pollution Atlas: 22.0 is
        pristine, 21.5+ shows real Milky Way structure, under 20.5 is a smudge. The <b>Milky Way core</b>{" "}
        never rises above about 24° due south at this latitude, so a southern ridge higher than that hides it
        entirely; the clearance line tells you how much of it you get. The <b>brightest patch to the south</b>{" "}
        is a town that would put a glow exactly where the core sits.
      </p>

      <h3 id="h-house">The existing house</h3>
      <p>
        If you mark a house, it gets the same rubric as the open sites so the numbers are comparable, plus two
        checks only a known house can answer: whether it stands on bottomland by NRCS&apos;s reckoning, and
        whether it&apos;s inside a FEMA flood zone (flood insurance with a mortgage).
      </p>

      <h3 id="h-rank">Where to build</h3>
      <p>
        Each site gets two numbers. <b>Site quality</b> is the spot itself — December sun (40), aspect, frost
        position, slope and dark sky (15 each) — graded A–F; it can&apos;t be bought. <b>Build cost</b> is
        what it takes to use the spot — septic class, foundation rating, rock, pad cutting, driveway length
        and grade — shown as $ to $$$$. Overall (for ranking) is 70% quality and 30% cost. A great spot with a
        long driveway is an A site at $$$, not a D. The side-by-side table shows every factor for every
        candidate, including a marked house.
      </p>

      <h3 id="h-driveway">Driveway</h3>
      <p>
        The router finds entrance candidates where a public road touches the boundary, then searches the lidar
        grid for the cheapest path to the chosen site that never exceeds the grade limit — which is why it
        draws switchbacks on steep ground. It avoids wet soils and side-hill cuts, counts drainage crossings
        as culverts, and prices the result with the unit costs in Settings, shown as ±30%. Two routes: the
        shortest legal one and a gentler 8% one. Treat it as a quantity take-off to hand an excavator, not a
        bid.
      </p>
      <h3 id="h-soils">Soils</h3>
      <p>
        NRCS mapped the county into <b>map units</b> — the dashed colored outlines — each a mix of two or
        three named soils they expect if you dig. For each soil, two plain lines: <b>House &amp; septic</b>,
        from NRCS&apos;s own ratings for dwellings and drainfields; and <b>Garden &amp; animals</b>, from
        drainage and farmland class. &quot;Very limited&quot; for septic means an alternative system and a
        soil scientist before you offer. Soils marked <b>frequently flooded, poorly drained, or hydric</b> are
        bottomland, and the app refuses to put a house there regardless of what FEMA says — headwater creeks
        are mostly unmapped. Map-unit lines are drawn at county scale, so a boundary can be 100 ft off on the
        ground.
      </p>

      <h3 id="h-flood">Floodplain</h3>
      <p>
        FEMA&apos;s Special Flood Hazard Area on the parcel, in acres. Unmapped is not the same as safe; walk
        the drainages after rain.
      </p>

      <h3 id="h-public">Public land</h3>
      <p>
        From the USGS Protected Areas Database. <b>Adjoins</b> means your line touches theirs. Access
        &quot;open&quot; means you can walk it; &quot;restricted&quot; or &quot;closed&quot; is a buffer, not
        a backyard. Conservation easements on private land aren&apos;t in this layer and don&apos;t count —
        you can&apos;t walk on them either.
      </p>

      <h3 id="h-drives">Getting there</h3>
      <p>
        Drive times from OSRM&apos;s public router — fine for comparing parcels, not for catching flights.
        Hospitals, groceries and trailheads come from OpenStreetMap and undercount national-forest trailheads.
        The driveway line is straight-line rise over run from the nearest Census road to the site; a real
        driveway at 10% needs the length shown.
      </p>

      <h3 id="h-unknown">Still unknown</h3>
      <p>
        Things no dataset holds: legal access, deed restrictions, mineral rights, utility cost, well yields,
        zoning for an RV during the build, insurance. Every one of these has killed a deal. The checklist is
        there so you ask before you fall in love.
      </p>

      <h3 id="h-limits">What it gets wrong</h3>
      <p>
        Elevation is bare earth; trees add to every ridge (the canopy allowance in Settings is a guess). Soil
        lines are coarse. The frost rule is a proxy for basin shape. Suitability thresholds are judgment, and
        all of them are in Settings. When the map disagrees with what you saw in Google Earth, believe your
        eyes and check the DEM cell size first.
      </p>
    </>
  );
}
