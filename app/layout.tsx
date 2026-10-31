import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sales",
  description: "Clients and team, in one simple list.",
  robots: { index: false, follow: false },
  // The globe on a transparent background: dark lines on light tab bars, light lines on dark ones.
  icons: {
    icon: [
      { url: "/icon-light.png", type: "image/png", media: "(prefers-color-scheme: light)" },
      { url: "/icon-dark.png", type: "image/png", media: "(prefers-color-scheme: dark)" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
