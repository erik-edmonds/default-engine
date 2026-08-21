import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Poppins, Arima, Raleway, Nunito } from "next/font/google";
import "./globals.css";
import { Favicon } from "@/components/layout/Icon";
import { AppStateProvider } from "@/helpers/StateProvider";
import { Suspense } from "react";
import Loading from "@/app/loading";

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
  title: "Erik Edmonds | Data Scientist",
  description: SITE_DESCRIPTION,
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
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
};

export default function RootLayout({children,}: Readonly<{children: React.ReactNode;}>) {

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${poppins.variable} ${arima.variable} ${raleway.variable} ${nunito.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <AppStateProvider>
          <div className="absolute z-50 top-5 left-5">
            <Favicon/>
          </div>
          <Suspense fallback={<Loading/>}>
            {children}
          </Suspense>
          <Loading />
        </AppStateProvider>
      </body>
    </html>
  );
}
