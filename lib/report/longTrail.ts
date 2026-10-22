/**
 * Bike to a long trail's words (step 11, docs/plans/step-11-new-data.md §2.6): the card row's line and the report
 * section's. Pure; the card (card.ts longTrail) and the Long trails block read it.
 */
import { fmt } from "../format";
import { SCREEN_CONSTANTS } from "../screen/config";
import { LONG_TRAILS } from "../screen/data/longTrails";
import type { Heading } from "./parts";

export const longTrailHeading: Heading = { title: "Long trails", slug: "long-trails", help: "h-bike" };

/** Where the access points come from, for "How it's scored" and the report (plan §3; checked 2026-10-21). */
export const LONG_TRAIL_SOURCES =
  "Trail access points: Virginia DCR, vacreepertrail.org and OpenStreetMap contributors (checked Oct 21, 2026).";

/** The trails the screen looks for, for the section's note: "New River Trail (57 mi), Virginia Creeper Trail (34 mi), …". */
export const TRAILS_LISTED = LONG_TRAILS.map(
  (t) => `${t.name} (${fmt(t.miles, t.miles % 1 ? 1 : 0)} mi)`,
).join(", ");

/** What the section says about its reach. */
export const LONG_TRAIL_REACH = `The ${SCREEN_CONSTANTS.longTrail.points} nearest access points within ${fmt(SCREEN_CONSTANTS.longTrail.maxKm / 1.609344)} mi in a straight line are timed by road.`;
