import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Suspense } from "react";
import AppLayoutShell from "@/components/AppLayoutShell";
import AppNav, { AppNavFallback } from "@/components/AppNav";
import PinkModeProvider from "@/components/PinkModeProvider";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "VAIVIA",
  description: "Plan trips, itineraries, ideas, and journeys in one place.",
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.className} vaivia-page-bg antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <PinkModeProvider />
          <AppLayoutShell
            nav={
              <Suspense fallback={<AppNavFallback />}>
                <AppNav />
              </Suspense>
            }
          >
            {children}
          </AppLayoutShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
