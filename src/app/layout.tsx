import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";

import { Providers } from "~/components/providers";

const APP_NAME = "Leath Notes";
const APP_DESCRIPTION =
  "A personal notepad with a skeuomorphic leather-bound design. Write, organize, and let AI assist your thoughts.";
const APP_URL = "https://leath-note.vercel.app";

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — Your Personal Notepad`,
    template: `%s | ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  authors: [{ name: "Alfian Nur Usyaid" }],
  keywords: [
    "notepad",
    "notes",
    "writing",
    "markdown",
    "skeuomorphic",
    "personal",
    "AI assistant",
  ],
  icons: {
    icon: "/leath-note-logo.png",
    shortcut: "/leath-note-logo.png",
    apple: "/leath-note-logo.png",
  },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: `${APP_NAME} — Your Personal Notepad`,
    description: APP_DESCRIPTION,
    url: APP_URL,
    images: [
      {
        url: "/leath-note-logo.png",
        width: 512,
        height: 512,
        alt: "Leath Notes Logo",
      },
    ],
    locale: "en_US",
  },
  twitter: {
    card: "summary",
    title: `${APP_NAME} — Your Personal Notepad`,
    description: APP_DESCRIPTION,
    images: ["/leath-note-logo.png"],
  },
  metadataBase: new URL(APP_URL),
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable}`}>
      <body className="overflow-x-hidden" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
