/**
 * A route's name as the report and the map show it (owner, #87 review): a route that leaves the parcel is never
 * called legal, or within the limit, without saying it needs an easement. Appended, nothing replaced (rule 7).
 */
export const NEEDS_EASEMENT = "needs an easement";

export function routeLabel(rt: { label: string; needsEasement: boolean }): string {
  return rt.needsEasement ? `${rt.label} — ${NEEDS_EASEMENT}` : rt.label;
}
