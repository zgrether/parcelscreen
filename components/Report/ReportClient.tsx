"use client";
// The report reads localStorage and IndexedDB on first render: load it in the browser only.
import dynamic from "next/dynamic";
import { REPORT_WORDS } from "@/lib/print/report";

const ReportPage = dynamic(() => import("./ReportPage").then((m) => m.ReportPage), {
  ssr: false,
  loading: () => <p className="rp-state muted">{REPORT_WORDS.loading}</p>,
});

export function ReportClient() {
  return <ReportPage />;
}
