import type { Metadata, Viewport } from "next";
import { Geist, Newsreader } from "next/font/google";
import { SkipLink } from "@/components/layout/SkipLink";
import "./globals.css";

const uiFont = Geist({
  variable: "--font-ui",
  subsets: ["latin"],
  display: "swap",
});

const editorialFont = Newsreader({
  variable: "--font-editorial",
  subsets: ["latin"],
  display: "swap",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: {
    default: "Bookie",
    template: "%s | Bookie",
  },
  description:
    "A rights-cleared digital library for programming and computer science, with a built-in reader.",
  openGraph: {
    siteName: "Bookie",
    type: "website",
    title: "Bookie",
    description:
      "A rights-cleared digital library for programming and computer science, with a built-in reader.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f2e8" },
    { media: "(prefers-color-scheme: dark)", color: "#161513" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${uiFont.variable} ${editorialFont.variable} antialiased`}
      >
        <SkipLink />
        {children}
      </body>
    </html>
  );
}
