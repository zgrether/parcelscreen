/**
 * Which parcels the rubric editor's preview can grade (step 3, docs/plans/step-3-rubric-editor.md §4): the open parcel
 * when it has a current screen, then every other saved parcel with one (the most recently changed first), then the
 * sample, Mud Creek's result (lib/rubric/sample, loaded only when it's chosen). The first is the default.
 */
import type { WorkingParcel } from "./parcelStore";
import { parcelName } from "./historyRows";
import type { KeptScreen } from "./useKeptScreens";

export const SAMPLE_KEY = "sample";
export const SAMPLE_NAME = "Sample: Mud Creek, Grayson Co., VA";

export interface PreviewOption {
  key: string;
  name: string;
}

export function previewOptions(
  built: readonly WorkingParcel[],
  screens: ReadonlyMap<string, KeptScreen | undefined>,
  openKey: string | null | undefined,
): PreviewOption[] {
  const screened = built.filter((b) => b.key && screens.get(b.key)?.state === "ok");
  const open = screened.find((b) => b.key === openKey);
  const rest = screened.filter((b) => b !== open).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return [...(open ? [open] : []), ...rest]
    .map((b) => ({ key: b.key!, name: parcelName(b).name }))
    .concat({ key: SAMPLE_KEY, name: SAMPLE_NAME });
}
