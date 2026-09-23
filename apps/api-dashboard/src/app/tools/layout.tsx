import type { Metadata } from 'next';
import { privateMetadata } from '@/lib/seo';

export const metadata: Metadata = privateMetadata('Internal Tools');

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
