import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";
import { ProfileGate } from "@/components/Profile/ProfileGate";
import { AppFrame } from "@/components/Nav/AppFrame";
import { THEME_COLOR } from "./manifest";

const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-barlow" });
const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-barlow-condensed",
});

export const metadata: Metadata = {
  title: "Parcel Screen",
  description: "Kill parcels from your desk, before you drive.",
  applicationName: "Parcel Screen",
  // Installed on iOS (17c): full screen, the toolbar's ink behind the status bar.
  appleWebApp: { capable: true, title: "Parcel Screen", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: THEME_COLOR,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable}`}>
      <body>
        {/* The current profile boots before any page reads its parcels, settings or views (step 1, PR 4); the frame
            holds the places' bar and the map, kept mounted behind the other tabs (step 4b). */}
        <ProfileGate>
          <AppFrame>{children}</AppFrame>
        </ProfileGate>
      </body>
    </html>
  );
}
