import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pickleball Ranking",
  description: "Modern Pickleball App",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="dark">
      <body className={cn(geistSans.variable, geistMono.variable, "antialiased selection:bg-primary/30 min-h-screen")}>
        <main className="container mx-auto px-4 pt-5 pb-20">
          {children}
        </main>
      </body>
    </html>
  );
}
