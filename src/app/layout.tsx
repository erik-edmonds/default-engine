import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Poppins, Arima, Raleway, Nunito } from "next/font/google";
import "./globals.css";
import { Favicon } from "@/components/layout/Icon";
import { AppStateProvider } from "@/helpers/StateProvider";
import { Suspense } from "react";

const nunito = Nunito({
  subsets: ['latin'],
  display: 'swap', 
  variable: '--font-nunito',
}); 
const arima = Arima({
  subsets: ['latin'],
  weight: ['300', '400', '700'], 
  variable: '--font-arima',
});

const raleway = Raleway({
  subsets: ['latin'],
  weight: ['300', '400', '700'], 
  variable: '--font-raleway',
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The homepage's name/title card (page.tsx) -- a heavy geometric sans,
// matching the reference site's hero text look.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["700", "800"],
});

const SITE_DESCRIPTION =
  "Erik Edmonds — data scientist, digital nomad, and Pokémon trainer at heart. An interactive 3D portfolio.";

export const metadata: Metadata = {
  // Without this, the relative OG/Twitter image URLs below resolve against
  // whatever host served the page -- the per-deployment vercel.app domain
  // rather than the canonical one -- so shared links cited a URL that changes
  // on every deploy. VERCEL_PROJECT_PRODUCTION_URL is the stable production
  // host; the localhost fallback keeps dev builds warning-free.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "http://localhost:3000"),
  ),
  title: "Erik Edmonds | Data Scientist",
  description: SITE_DESCRIPTION,
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    // Declared explicitly rather than left to the app-dir file convention:
    // once `icons` is set here, Next stops auto-detecting apple-icon.* and the
    // tag simply never renders. Without it iOS falls back to a screenshot or
    // to /favicon.ico -- which is how a stale mark ends up on a home screen.
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    title: "Erik Edmonds | Data Scientist",
    description: SITE_DESCRIPTION,
    images: [{ url: "/images/logo.png" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Erik Edmonds | Data Scientist",
    description: SITE_DESCRIPTION,
    images: ["/images/logo.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Matches the scene's clear colour, so mobile browser chrome blends into the
  // loading screen instead of framing it in white.
  themeColor: "#0a0a0a",
  // Lets the scene paint into the notch and the home-indicator strip, and is
  // the prerequisite for env(safe-area-inset-*) being anything but 0px --
  // without it the insets the chrome now offsets itself by are all zero and
  // the padding silently does nothing.
  viewportFit: "cover",
};

export default function RootLayout({children,}: Readonly<{children: React.ReactNode;}>) {

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${poppins.variable} ${arima.variable} ${raleway.variable} ${nunito.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <AppStateProvider>
          {/* fixed, not absolute: this sits outside page.tsx's wrapper and has
              no positioned ancestor, so on a scrollable document it would be
              the one piece of chrome that slid away with the scroll. Offsets
              fold in the safe-area insets, which resolve to 0px on hardware
              without a notch. */}
          <div
            className="fixed z-50"
            style={{
              top: "calc(1.25rem + var(--safe-top))",
              left: "calc(1.25rem + var(--safe-left))",
            }}
          >
            <Favicon/>
          </div>
          {/* fallback={null}, deliberately. The loading UI for this app is
              LoadingScreen, mounted by page.tsx *inside* the tree -- it owns
              the progress readout and the Enter button, so it has to be the
              only thing on screen while assets load. An overlay mounted out
              here instead sits outside page.tsx's fixed wrapper, which
              establishes its own stacking context, so it paints over
              LoadingScreen no matter what z-index LoadingScreen carries.
              That is exactly how the retired app/loading.tsx used to take
              over mid-load: particles, then a plain fill. */}
          <Suspense fallback={null}>
            {children}
          </Suspense>
        </AppStateProvider>
      </body>
    </html>
  );
}
