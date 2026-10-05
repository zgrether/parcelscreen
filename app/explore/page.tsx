import { ExploreClient as ExploreShell } from "@/components/Explore/ExploreClient";

export default function ExplorePage() {
  return (
    <ExploreShell>
      <section className="border-rule border-b py-3.5">
        <h2 className="font-cond m-0 mb-2 text-[17px] leading-tight font-semibold">Find the parcel</h2>
        <p className="text-ink-2 my-1.5 text-[12.5px]">
          Pan the imagery to the spot you recognized in Google Earth, then tap the lot to load its recorded
          boundary. If parcel lines aren&apos;t available there, draw it.
        </p>
        <p className="text-ink-2 text-[12.5px] italic">
          Parcel lookup, drawing and splitting arrive in the next step.
        </p>
      </section>
    </ExploreShell>
  );
}
