import type { Metadata } from "next";
import { Fraunces, Plus_Jakarta_Sans, Fragment_Mono } from "next/font/google";
import "./globals.css";
import OrganicBg from "@/components/OrganicBg";
import AnnouncementBar from "@/components/AnnouncementBar";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

const fragmentMono = Fragment_Mono({
  variable: "--font-fragment",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://poolscan.app"),
  title: {
    default: "PoolScan — Rug radar & live scanner for pools.trade",
    template: "%s · PoolScan",
  },
  description:
    "See the bottom of every pool before you dive in. A calm, clear scanner and rug radar for every token launching on pools.trade — Uniswap's launchpad on Robinhood Chain.",
  keywords: [
    "pools.trade",
    "pools trade scanner",
    "Uniswap launchpad",
    "Robinhood Chain",
    "rug checker",
    "token safety",
    "memecoin scanner",
  ],
  openGraph: {
    title: "PoolScan — Rug radar & live scanner for pools.trade",
    description:
      "Sound the depth of every pools.trade token before you dive in. Live feed + safety score for Uniswap's launchpad on Robinhood Chain.",
    url: "https://poolscan.app",
    siteName: "PoolScan",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PoolScan — Rug radar for pools.trade",
    description:
      "A calm, clear scanner + rug radar for every token launching on pools.trade.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${jakarta.variable} ${fragmentMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <OrganicBg />
        <AnnouncementBar />
        <TopBar />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
