import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { site } from "@/config/site";
import "./globals.css";

const sans = Inter({ variable: "--font-sans-face", subsets: ["latin"], display: "swap" });
const display = Fraunces({ variable: "--font-display-face", subsets: ["latin"], display: "swap", axes: ["opsz"] });

export const metadata: Metadata = {
  title: { default: `${site.name} · 3D Shoe Showroom`, template: `%s · ${site.name}` },
  description: site.description,
  applicationName: site.name,
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#f6f4f0",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
