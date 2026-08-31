import "~/styles/globals.css";

import { type Metadata } from "next";
import { Courier_Prime } from "next/font/google";

import { Providers } from "~/components/providers";
import { PWARegistration } from "~/components/pwa-registration";
import { env } from "~/env";
import { siteConfig } from "~/lib/site-config";
import { auth } from "~/server/auth";

export const metadata: Metadata = {
  title: {
    default: siteConfig.title,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  authors: [
    { name: siteConfig.creator.name, url: siteConfig.creator.url },
  ],
  creator: `${siteConfig.creator.name} (${siteConfig.creator.alternateName})`,
  publisher: siteConfig.creator.name,
  category: "productivity",
  alternates: {
    canonical: "/",
  },
  manifest: "/manifest.json",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google:
      env.GOOGLE_SITE_VERIFICATION ?? siteConfig.googleSiteVerification,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: siteConfig.name,
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: siteConfig.pwaIconPath,
  },
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    title: siteConfig.title,
    description: siteConfig.description,
    url: siteConfig.url,
    images: [
      {
        url: siteConfig.logoPath,
        width: 1024,
        height: 1024,
        alt: "Leath Notes Logo",
      },
    ],
    locale: siteConfig.locale,
  },
  twitter: {
    card: "summary",
    title: siteConfig.title,
    description: siteConfig.description,
    images: [siteConfig.logoPath],
  },
  metadataBase: new URL(siteConfig.url),
};

const courierPrime = Courier_Prime({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-courier-prime",
  display: "swap",
  preload: false,
});

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  return (
    <html lang={siteConfig.language} className={courierPrime.variable}>
      <body className="overflow-x-hidden" suppressHydrationWarning>
        <Providers session={session}>
          <PWARegistration />
          {children}
        </Providers>
      </body>
    </html>
  );
}
