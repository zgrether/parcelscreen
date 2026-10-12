import type { Metadata } from "next";
import { RulebookClient } from "@/components/Rulebook/RulebookClient";

export const metadata: Metadata = { title: "What the grade means · Parcel Screen" };

export default function RulebookPage() {
  return <RulebookClient />;
}
