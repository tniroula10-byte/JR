import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'John Rambo',
  description: 'John Rambo',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'John Rambo'
  },
  other: {
    'darkreader-lock': 'true',
    'color-scheme': 'dark'
  }
};

export const viewport: Viewport = {
  themeColor: '#030604',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <meta name="darkreader-lock" />
        <meta name="color-scheme" content="dark" />
      </head>
      <body
        suppressHydrationWarning
        className="min-h-screen bg-midnight-950 text-slate-50 antialiased selection:bg-violet-600 selection:text-white"
      >
        {children}
      </body>
    </html>
  );
}
