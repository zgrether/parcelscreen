import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_STORE, type ParcelStore, type WorkingParcel } from "./parcelStore";

const stored = vi.hoisted(() => ({ parcels: null as unknown }));
vi.mock("./prefs", () => ({
  getPref: () => stored.parcels,
  setPref: (_key: string, v: unknown) => void (stored.parcels = v),
}));

const { addImportedParcels, currentParcels, registerLiveParcels } = await import("./liveParcels");

const parcel = (key: string) => ({ key }) as WorkingParcel;

describe("the parcels Your data reads and adds to (step 4b)", () => {
  beforeEach(() => {
    stored.parcels = null;
  });

  it("off the map: the stored parcels, or none; an import appends to them", () => {
    expect(currentParcels()).toEqual(EMPTY_STORE);
    addImportedParcels([parcel("a")]);
    addImportedParcels([]);
    addImportedParcels([parcel("b")]);
    expect((stored.parcels as ParcelStore).built.map((p) => p.key)).toEqual(["a", "b"]);
  });

  it("on the map: the explorer's parcels, and an import goes through it; after it unmounts, the stored ones", () => {
    const store: ParcelStore = { ...EMPTY_STORE, built: [parcel("live")] };
    const importParcels = vi.fn();
    const unregister = registerLiveParcels({ store: () => store, importParcels });
    expect(currentParcels()).toBe(store);
    addImportedParcels([parcel("x")]);
    expect(importParcels).toHaveBeenCalledWith([parcel("x")]);
    expect(stored.parcels).toBeNull();
    unregister();
    expect(currentParcels()).toEqual(EMPTY_STORE);
  });

  it("an older explorer's unregister doesn't remove a newer one", () => {
    const first = registerLiveParcels({ store: () => EMPTY_STORE, importParcels: vi.fn() });
    const newer: ParcelStore = { ...EMPTY_STORE, built: [parcel("n")] };
    const second = registerLiveParcels({ store: () => newer, importParcels: vi.fn() });
    first();
    expect(currentParcels()).toBe(newer);
    second();
  });
});
