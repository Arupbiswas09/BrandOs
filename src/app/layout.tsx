import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { connection } from "next/server";
import "./globals.css";
import { OfflineBar, ServiceWorker } from "@/components/app/pwa";

const inter = Inter({ variable: "--font-inter", subsets: ["latin", "latin-ext"], display: "swap" });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "BrandOS", template: "%s · BrandOS" },
  description: "Every client, brand, offer and asset your agency works on, in one place.",
  applicationName: "BrandOS",
  appleWebApp: { capable: true, title: "BrandOS", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Render every page per request, so each one carries the CSP nonce from src/proxy.ts.
  // (A page built ahead of time would have no nonce and its scripts would be blocked.)
  await connection();
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body>
        {children}
        <ServiceWorker />
        <OfflineBar />
      </body>
    </html>
  );
}
