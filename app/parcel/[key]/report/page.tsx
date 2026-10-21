import type { Metadata } from "next";
import { ReportClient } from "@/components/Report/ReportClient";

export const metadata: Metadata = { title: "Report card · Parcel Screen" };

/** The report card export (step 9): the parcel comes from the device's store, by the key in the path. */
export default function ReportRoute() {
  return <ReportClient />;
}
