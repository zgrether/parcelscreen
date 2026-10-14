/** Where the app opens (owner, #128; docs/plans/parcel-workflow.md §5): the list when it has parcels, else the map. */
export const openingPage = (builtCount: number): "/library" | "/explore" =>
  builtCount > 0 ? "/library" : "/explore";
