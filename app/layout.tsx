import type { Metadata } from "next";
import { Arbutus_Slab, Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-poppins", display: "swap" });
const arbutus = Arbutus_Slab({ subsets: ["latin"], weight: "400", variable: "--font-arbutus", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Edura", template: "%s · Edura" },
  description: "Lightweight school & teacher management platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${poppins.variable} ${arbutus.variable}`}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
