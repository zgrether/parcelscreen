import type { Metadata } from "next";
import { LibraryClient } from "@/components/Library/LibraryClient";

export const metadata: Metadata = { title: "Your list · Parcel Screen" };

export default function LibraryPage() {
  return <LibraryClient />;
}
