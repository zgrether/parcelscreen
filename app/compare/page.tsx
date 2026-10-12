import type { Metadata } from "next";
import { CompareClient } from "@/components/Compare/CompareClient";

export const metadata: Metadata = { title: "Compare · Parcel Screen" };

export default function ComparePage() {
  return <CompareClient />;
}
