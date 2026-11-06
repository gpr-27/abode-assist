import type { Metadata, Viewport } from "next";
import { Spectral, Hanken_Grotesk, Mukta, Hind_Vadodara } from "next/font/google";
import "./globals.css";

const serif = Spectral({ variable: "--font-serif", subsets: ["latin"], weight: ["300", "400", "500"], display: "swap" });
const body = Hanken_Grotesk({ variable: "--font-body", subsets: ["latin"], display: "swap" });
const deva = Mukta({ variable: "--font-deva", subsets: ["devanagari"], weight: ["400", "500", "600"], display: "swap", preload: false });
const guj = Hind_Vadodara({ variable: "--font-guj", subsets: ["gujarati"], weight: ["400", "500", "600"], display: "swap", preload: false });

export const metadata: Metadata = {
  title: { default: "Homes in Shela and Gota · Site visits", template: "%s · Abode Assist" },
  description: "Ask about 2 and 3 BHK homes in Shela and Gota, Ahmedabad, and book a site visit in a real open slot, any hour, in English, Hindi or Gujarati.",
};

export const viewport: Viewport = { themeColor: "#fbfbf9", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${serif.variable} ${body.variable} ${deva.variable} ${guj.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
