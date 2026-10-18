import type { Metadata } from "next";
import { RubricClient } from "@/components/Rubric/RubricClient";

export const metadata: Metadata = { title: "What matters to you · Parcel Screen" };

export default function PrioritiesPage() {
  return <RubricClient />;
}
