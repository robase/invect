import localFont from 'next/font/local';
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { ReactNode } from 'react';
import './global.css';

const geistSans = localFont({
  src: '../../pkg/frontend/src/assets/fonts/geist-latin-wght-normal.woff2',
  variable: '--font-geist-sans',
  display: 'swap',
  weight: '100 900',
});

const iosevkaMono = localFont({
  src: [
    {
      path: '../../pkg/frontend/src/assets/fonts/iosevka-latin-400-normal.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../pkg/frontend/src/assets/fonts/iosevka-latin-500-normal.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../../pkg/frontend/src/assets/fonts/iosevka-latin-600-normal.woff2',
      weight: '600',
      style: 'normal',
    },
    {
      path: '../../pkg/frontend/src/assets/fonts/iosevka-latin-700-normal.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-iosevka',
  display: 'swap',
});

export const metadata = {
  title: {
    template: '%s — Invect',
    default: 'Invect Docs',
  },
  description:
    'Documentation for Invect — drop-in workflow orchestration for any Node.js app.',
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${iosevkaMono.variable} dark`}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col">
        <RootProvider
          theme={{
            defaultTheme: 'dark',
            enableSystem: false,
          }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
