import type { Metadata } from "next";
import { InterviewClient } from "@/components/Interview/InterviewClient";

export const metadata: Metadata = { title: "A few questions · Parcel Screen" };

export default function InterviewPage() {
  return <InterviewClient />;
}
