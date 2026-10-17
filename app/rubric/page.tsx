import type { Metadata } from "next";
import { RubricClient } from "@/components/Rubric/RubricClient";

export const metadata: Metadata = { title: "My rubric · Parcel Screen" };

export default function RubricPage() {
  return <RubricClient />;
}
