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
import { getAppUrl } from "@/lib/appUrl";
import "./globals.css";

const appUrl = getAppUrl();

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: "VAIVIA",
  description: "Plan trips, itineraries, trip ideas, and transport in one place.",
  applicationName: "VAIVIA",
  manifest: "/manifest.webmanifest",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "VAIVIA",
    title: "VAIVIA",
    description: "Plan trips, itineraries, trip ideas, and transport in one place.",
    images: ["/opengraph-image.png"],
  },
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
      {
        url: "/favicon-16.png?v=asset8",
        sizes: "16x16",
        type: "image/png",
      },
      {
        url: "/favicon-32.png?v=asset8",
        sizes: "32x32",
        type: "image/png",
      },
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
