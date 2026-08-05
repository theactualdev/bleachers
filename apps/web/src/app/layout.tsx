import type { Metadata, Viewport } from 'next';
import { Inter, Barlow_Condensed } from 'next/font/google';
import './globals.css';
import { Providers } from '@/lib/providers';
import { Nav } from '@/components/nav';
import { ConnectivityBanner } from '@/components/connectivity-banner';

const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

// Athletic condensed face — carries the personality (scores, numerals, eyebrows).
const display = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

const DESCRIPTION = 'Record live grassroots sports statistics from your phone.';

/**
 * Icons and the social card are not declared here on purpose: `icon.png`,
 * `apple-icon.png`, `favicon.ico` and `opengraph-image.png` sit beside this file
 * and Next picks them up by convention, hashing the URLs for cache busting.
 * Declaring `icons` explicitly would override that.
 */
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  title: {
    default: 'Bleachers',
    // Sub-pages set only their own name; this keeps the brand in the tab title.
    template: '%s · Bleachers',
  },
  applicationName: 'Bleachers',
  description: DESCRIPTION,
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Bleachers' },
  openGraph: {
    type: 'website',
    siteName: 'Bleachers',
    title: 'Bleachers',
    description: DESCRIPTION,
    url: '/',
    locale: 'en_GB',
  },
  twitter: {
    // No twitter-image.png needed: Next points twitter:image at
    // opengraph-image.png on its own, so a second copy of the same 1200x630
    // card would just be dead weight in the repo.
    card: 'summary_large_image',
    title: 'Bleachers',
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: '#0c0a08',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="floodlight-amber"
      className={`dark ${sans.variable} ${display.variable}`}
    >
      <body className="min-h-dvh">
        {/* A single faint accent-tinted glow + grain for glass to catch. No blooms. */}
        <div className="app-backdrop" aria-hidden>
          <div className="app-noise" />
        </div>

        <Providers>
          <ConnectivityBanner />
          <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
            <main className="flex-1 pb-28">{children}</main>
            <Nav />
          </div>
        </Providers>
      </body>
    </html>
  );
}
