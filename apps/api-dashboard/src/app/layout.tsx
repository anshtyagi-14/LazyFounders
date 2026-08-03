import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';
import Link from 'next/link';
import { Footer } from '../components/Footer';

const outfit = Outfit({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Blogy SEO Toolkit',
  description: 'The complete Blogy SEO toolkit API dashboard',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="stylesheet" href="/css/news-tailwind.css" />
      </head>
      <body className={`${outfit.className} min-h-screen flex flex-col`}>
        <main className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
