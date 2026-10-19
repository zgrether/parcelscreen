import type { Metadata } from "next";
import { HelpClient } from "@/components/Help/HelpClient";

export const metadata: Metadata = { title: "Help · Parcel Screen" };

export default function HelpRoute() {
  return <HelpClient />;
}
