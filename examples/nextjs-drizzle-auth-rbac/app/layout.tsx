import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Acme Dashboard',
  description: 'Internal admin dashboard for Acme — customers, orders, products & workflows',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full antialiased">{children}</body>
    </html>
  );
}
