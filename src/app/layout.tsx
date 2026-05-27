import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin", "vietnamese"],
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
      <body className={cn(inter.variable, "font-sans antialiased selection:bg-primary/30 min-h-screen")}>
        <main className="container mx-auto px-4 pt-5 pb-20">
          {children}
        </main>
      </body>
    </html>
  );
}
