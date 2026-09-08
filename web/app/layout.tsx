import type { Metadata, Viewport } from "next";
import { Inter_Tight, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter-tight",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://validator.unwraplabs.com"),
  title: "Unwrap Labs — Starknet validator",
  description:
    "Native Starknet staking with a top-3 Bitcoin validator. Rewards claimed automatically each week and sent to your address, by a contract that cannot touch your principal.",
  openGraph: {
    title: "Unwrap Labs — Starknet validator",
    description:
      "Native Starknet staking with a top-3 Bitcoin validator. Automated reward claiming, with no owner and no upgrade path.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0A",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${interTight.variable} ${jetbrainsMono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
