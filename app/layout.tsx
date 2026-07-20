import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Suspense } from "react";
import AppLayoutShell from "@/components/AppLayoutShell";
import AppNav, { AppNavFallback } from "@/components/AppNav";
import CountdownPreferenceProvider from "@/components/CountdownPreferenceProvider";
import PinkModeProvider from "@/components/PinkModeProvider";
import PwaInstallPrompt from "@/components/pwa/PwaInstallPrompt";
import ServiceWorkerRegistration from "@/components/pwa/ServiceWorkerRegistration";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "VAIVIA",
  description: "Plan trips, itineraries, trip ideas, and transport in one place.",
  applicationName: "VAIVIA",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "VAIVIA",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/vaivia-icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0c0115",
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
          <CountdownPreferenceProvider />
          <PinkModeProvider />
          <ServiceWorkerRegistration />
          <AppLayoutShell
            nav={
              <Suspense fallback={<AppNavFallback />}>
                <AppNav />
              </Suspense>
            }
          >
            {children}
          </AppLayoutShell>
          <PwaInstallPrompt />
        </ThemeProvider>
      </body>
    </html>
  );
}
