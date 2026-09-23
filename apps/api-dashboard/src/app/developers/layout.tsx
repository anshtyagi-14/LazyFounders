import type { Metadata } from 'next';
import { privateMetadata } from '@/lib/seo';

export const metadata: Metadata = privateMetadata('Developer API');

export default function DevelopersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
