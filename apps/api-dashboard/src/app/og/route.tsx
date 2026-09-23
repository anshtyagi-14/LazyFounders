import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';
import { BRAND, SITE_TAGLINE, SITE_URL, clamp } from '@/lib/seo';

/**
 * Social card generator: GET /og?title=...&kicker=...&meta=...
 *
 * Pages without their own artwork point Open Graph and Twitter at this route, so every
 * share still renders a branded 1200x630 card instead of a blank preview.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIZE = { width: 1200, height: 630 };
const HOST = SITE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const title = clamp(q.get('title') || `${BRAND} — ${SITE_TAGLINE}`, 120);
  const kicker = clamp(q.get('kicker') || 'Latest', 28).toUpperCase();
  const meta = clamp(q.get('meta') || HOST, 80);
  const long = title.length > 70;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#05070A',
          backgroundImage: 'radial-gradient(circle at 12% 0%, #0d9488 0%, rgba(5,7,10,0) 55%)',
          padding: '64px 72px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 14, height: 44, borderRadius: 999, backgroundColor: '#14b8a6' }} />
          <div style={{ fontSize: 40, fontWeight: 700, color: '#ffffff', letterSpacing: -1 }}>{BRAND}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
          <div
            style={{
              display: 'flex',
              alignSelf: 'flex-start',
              padding: '10px 22px',
              borderRadius: 999,
              border: '2px solid rgba(20,184,166,0.45)',
              backgroundColor: 'rgba(20,184,166,0.12)',
              color: '#5eead4',
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: 2,
            }}
          >
            {kicker}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: long ? 54 : 66,
              lineHeight: 1.12,
              fontWeight: 700,
              color: '#ffffff',
              letterSpacing: -1.5,
            }}
          >
            {title}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 24, color: '#94a3b8' }}>
          <div style={{ display: 'flex' }}>{meta}</div>
          <div style={{ display: 'flex', color: '#5eead4', fontWeight: 600 }}>{HOST}</div>
        </div>
      </div>
    ),
    {
      ...SIZE,
      headers: { 'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' },
    },
  );
}
