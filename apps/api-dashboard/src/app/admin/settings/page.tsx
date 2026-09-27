import React from 'react';
import { storyImageSetting } from '@/lib/site-settings';
import { StoryImageToggle } from './StoryImageToggle';

/** Site-wide switches. Admin only (see proxy.ts). */
export const dynamic = 'force-dynamic';

const IST: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false };

export default async function SettingsPage() {
  const images = await storyImageSetting();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Site-wide switches. Changes apply to every page.</p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-[#0a0d14]">
        <h2 className="text-lg font-semibold">Story images</h2>
        <p className="mt-1 mb-5 text-sm text-slate-500 dark:text-slate-400">
          What illustrates stories on cards, article pages, social shares, the RSS feed and the image sitemap.
        </p>
        <StoryImageToggle mode={images.mode} />
        {images.updatedAt ? (
          <p className="mt-4 text-xs text-slate-500">
            Last changed by {images.updatedBy ?? 'unknown'} on {images.updatedAt.toLocaleString('en-IN', IST)} IST.
          </p>
        ) : null}
      </section>
    </div>
  );
}
