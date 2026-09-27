import React from 'react';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { LEAD_STATUSES, inquiryLabel } from '@/lib/lead-options';
import { isLeadStatus } from '@/lib/leads';
import { LeadStatusSelect } from './LeadStatusSelect';

/** Enquiries from the public /contact form, newest first. */
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 100;
const IST: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false };

const BADGE: Record<string, string> = {
  new: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  contacted: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  closed: 'bg-slate-500/10 text-slate-500 dark:text-slate-400',
};

type Props = { searchParams: Promise<{ status?: string }> };

export default async function LeadsPage({ searchParams }: Props) {
  const requested = (await searchParams).status;
  const status = isLeadStatus(requested) ? requested : undefined;

  const [leads, counts] = await Promise.all([
    prisma.lead.findMany({ where: status ? { status } : {}, orderBy: { createdAt: 'desc' }, take: PAGE_SIZE }),
    prisma.lead.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const countOf = (s?: string) => (s ? counts.find((c) => c.status === s)?._count._all ?? 0 : counts.reduce((n, c) => n + c._count._all, 0));

  const tabs: { label: string; value?: string }[] = [{ label: 'All' }, ...LEAD_STATUSES.map((s) => ({ label: s, value: s }))];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Leads</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Enquiries from the <a href="/contact" target="_blank" rel="noreferrer" className="underline">contact form</a>. Reply by email, then move the lead along.
        </p>
      </div>

      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {tabs.map((t) => {
          const active = t.value === status;
          return (
            <Link
              key={t.label}
              href={t.value ? `/admin/leads?status=${t.value}` : '/admin/leads'}
              aria-current={active ? 'page' : undefined}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                active ? 'bg-teal-500/15 text-teal-700 dark:text-teal-400' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10'
              }`}
            >
              {t.label} ({countOf(t.value)})
            </Link>
          );
        })}
      </nav>

      {leads.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
          No leads {status ? `marked ${status}` : 'yet'}.
        </p>
      ) : (
        <ul className="space-y-3">
          {leads.map((l) => (
            <li key={l.id} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-[#0a0d14]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {l.name}
                    {l.company ? <span className="font-normal text-slate-500 dark:text-slate-400"> · {l.company}</span> : null}
                  </p>
                  <p className="mt-0.5 text-sm">
                    <a href={`mailto:${l.email}`} className="text-teal-700 hover:underline dark:text-teal-400">
                      {l.email}
                    </a>
                    {l.phone ? (
                      <>
                        {' · '}
                        <a href={`tel:${l.phone.replace(/[^+\d]/g, '')}`} className="text-slate-600 hover:underline dark:text-slate-300">
                          {l.phone}
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${BADGE[l.status] ?? BADGE.closed}`}>{l.status}</span>
                  <LeadStatusSelect id={l.id} status={l.status} />
                </div>
              </div>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{inquiryLabel(l.inquiryType)}</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700 dark:text-slate-300">{l.message}</p>
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-500">
                {l.createdAt.toLocaleString('en-IN', IST)} IST
                {l.referrer ? ` · via ${l.referrer}` : ''}
                {l.utmSource ? ` · utm ${[l.utmSource, l.utmMedium, l.utmCampaign].filter(Boolean).join(' / ')}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
      {leads.length === PAGE_SIZE ? <p className="text-xs text-slate-500">Showing the newest {PAGE_SIZE}.</p> : null}
    </div>
  );
}
