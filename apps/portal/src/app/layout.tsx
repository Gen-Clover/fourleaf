import type { Metadata } from "next";
import { Chakra_Petch, Inter } from "next/font/google";
import { themeScript } from "@genclover/ui/theme-toggle";
import ResponsiveTables from "@/components/ResponsiveTables";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const chakra = Chakra_Petch({ variable: "--font-chakra", subsets: ["latin"], weight: ["500", "600", "700"], display: "swap" });

export const metadata: Metadata = {
  title: "Gen Clover Portal",
  description: "Gen Clover internal tools: finance, delivery, billing and more",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${inter.variable} ${chakra.variable} font-sans antialiased`}>
        {children}
        <ResponsiveTables />
      </body>
    </html>
  );
}
