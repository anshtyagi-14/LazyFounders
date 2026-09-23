import type { Metadata } from 'next';
import { privateMetadata } from '@/lib/seo';
import AdminShell from './shell';

// Internal console: kept out of every index, not just disallowed in robots.txt
// (a disallowed URL can still be indexed from an external link; noindex cannot).
export const metadata: Metadata = privateMetadata('Admin Console');

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
