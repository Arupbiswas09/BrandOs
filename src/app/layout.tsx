import type { Metadata, Viewport } from "next";
import { Asap, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { OfflineBar, ServiceWorker } from "@/components/app/pwa";

const asap = Asap({ variable: "--font-asap", subsets: ["latin", "latin-ext"], style: ["normal", "italic"] });
const serif = Instrument_Serif({ variable: "--font-instrument", weight: "400", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "BrandOS", template: "%s · BrandOS" },
  description: "Every client, brand, offer and asset your agency works on, in one building.",
  applicationName: "BrandOS",
  appleWebApp: { capable: true, title: "BrandOS", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#F7F9F8",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${asap.variable} ${serif.variable} ${mono.variable}`}>
      <body>
        {children}
        <ServiceWorker />
        <OfflineBar />
      </body>
    </html>
  );
}
