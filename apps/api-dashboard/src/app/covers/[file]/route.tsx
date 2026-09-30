import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { getPublishedArticle, getSourceStory, movedArticleSlug, sanitizeHeadline } from '@/lib/articles';
import { COVER_HEIGHT, COVER_WIDTH, parseCoverFile, storySlug } from '@/lib/covers';
import { categoryForArticle, categoryForLabel, type CategorySlug } from '@/lib/topics';

// A story's cover changes only when its headline does; /api/revalidate refreshes edits.
export const revalidate = 86400;

type Props = { params: Promise<{ file: string }> };

/** Built on first request, like the story pages (no database at build time). */
export async function generateStaticParams() {
  return [];
}

/** Per-section accent on the brand's black and gold, so a grid of covers is not one flat block. */
const ACCENTS: Record<CategorySlug | 'news', string> = {
  funding: '#E3B341',
  ai: '#8FA8FF',
  policy: '#F29B8F',
  technology: '#5FD4C3',
  business: '#F5B26B',
  product: '#C79BF2',
  news: '#E3B341',
};
const GOLD = '#E3B341';

// public/ ships next to server.js in the standalone image, and the standalone server
// chdirs there, so process.cwd() finds it both locally and in production.
const asset = (p: string) => readFile(join(process.cwd(), 'public', p));
let assets: Promise<[Buffer, Buffer, Buffer, Buffer]> | null = null;
function loadAssets() {
  assets ??= Promise.all([
    asset('fonts/Archivo-ExtraBold.ttf'),
    asset('fonts/Newsreader-SemiBold.ttf'),
    asset('fonts/Outfit-SemiBold.ttf'),
    asset('logo-mark.png'),
  ]).catch((err) => {
    assets = null;
    throw err;
  });
  return assets;
}

/** Headline size by length, so short and long headlines both fill the card without overflowing. */
function headlineStyle(text: string): { fontSize: number; text: string } {
  const max = 150;
  const clipped = text.length > max ? `${text.slice(0, text.lastIndexOf(' ', max - 1) || max - 1)}…` : text;
  const n = clipped.length;
  const fontSize = n <= 50 ? 76 : n <= 80 ? 66 : n <= 110 ? 58 : 50;
  return { fontSize, text: clipped };
}

/** Stable 0..1 numbers from the slug, so each story's art differs but never changes. */
function seeded(slug: string): [number, number, number] {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) h = Math.imul(h ^ slug.charCodeAt(i), 16777619);
  const r = (shift: number) => ((h >>> shift) & 0xff) / 255;
  return [r(0), r(8), r(16)];
}

async function storyFor(slug: string, followMoves = true): Promise<{ headline: string; section: string; accent: string } | null> {
  const article = await getPublishedArticle(slug);
  if (article) {
    const c = categoryForArticle(article.category);
    return { headline: article.headline, section: c.label, accent: ACCENTS[c.slug] };
  }
  // Covers already shared under a story's old slug keep rendering.
  const moved = followMoves ? await movedArticleSlug(slug) : null;
  if (moved) return storyFor(moved, false);
  const result = await getSourceStory(slug);
  if (followMoves && (result?.kind === 'moved' || result?.kind === 'published')) {
    return storyFor(result.kind === 'moved' ? storySlug(result.path) : result.slug, false);
  }
  if (result?.kind !== 'story') return null;
  const c = (result.story.categories ?? []).map((raw) => categoryForLabel(raw)).find(Boolean);
  return { headline: result.story.headline, section: c?.label ?? 'News', accent: ACCENTS[c?.slug ?? 'news'] };
}

function Wordmark({ mark, size }: { mark: string; size: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={mark} width={size * 1.65} height={size * 1.65} alt="" style={{ borderRadius: size * 0.35, marginRight: size * 0.5 }} />
      <div style={{ display: 'flex', fontFamily: 'Archivo', fontSize: size, letterSpacing: 1 }}>
        <span>LAZY</span>
        <span style={{ color: GOLD }}>FOUNDER</span>
      </div>
    </div>
  );
}

/** The gold LAZYFOUNDER pill that marks a share card as ours. */
function Badge({ mark }: { mark: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', backgroundColor: GOLD, color: '#0B0B0E', padding: '10px 26px 10px 12px', borderRadius: 999 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={mark} width={44} height={44} alt="" style={{ borderRadius: 12, marginRight: 14 }} />
      <div style={{ display: 'flex', fontFamily: 'Archivo', fontSize: 28, letterSpacing: 3 }}>LAZYFOUNDER</div>
    </div>
  );
}

/**
 * With the headline: what social networks and search engines show for the story.
 * Everything is centred: WhatsApp and other chat apps crop small previews to the
 * middle square (x 285-915), and the badge and headline have to survive that.
 */
function SocialCard({ story, mark, slug }: { story: { headline: string; section: string; accent: string }; mark: string; slug: string }) {
  const { fontSize, text } = headlineStyle(sanitizeHeadline(story.headline));
  const [x] = seeded(slug);
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '52px 72px 48px',
        backgroundColor: '#0B0B0E',
        backgroundImage: `radial-gradient(circle at ${35 + x * 30}% 0%, ${story.accent}40 0%, rgba(11,11,14,0) 60%)`,
        color: '#FFFFFF',
      }}
    >
      <Badge mark={mark} />
      <div style={{ display: 'flex', fontFamily: 'Newsreader', fontSize, lineHeight: 1.12, letterSpacing: -0.5, maxWidth: 1040, textAlign: 'center', justifyContent: 'center' }}>{text}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', borderTop: '2px solid rgba(255,255,255,0.12)', paddingTop: 24 }}>
        <div style={{ display: 'flex', fontFamily: 'Archivo', fontSize: 22, letterSpacing: 4, color: story.accent, textTransform: 'uppercase' }}>{story.section}</div>
        <div style={{ display: 'flex', width: 8, height: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.35)', margin: '0 18px' }} />
        <div style={{ display: 'flex', fontFamily: 'Outfit', fontSize: 24, color: 'rgba(255,255,255,0.7)' }}>lazyfounder.in</div>
      </div>
    </div>
  );
}

/**
 * No headline: on-site cards and heroes print the headline themselves, and crop the
 * image to their own shape, so everything that matters sits in the middle.
 */
function ArtCard({ story, mark, slug }: { story: { section: string; accent: string }; mark: string; slug: string }) {
  const [x, y, z] = seeded(slug);
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0B0B0E',
        backgroundImage: [
          `radial-gradient(circle at ${10 + x * 35}% ${15 + y * 70}%, ${story.accent}55 0%, rgba(11,11,14,0) 45%)`,
          `radial-gradient(circle at ${60 + z * 35}% ${80 - y * 60}%, ${GOLD}30 0%, rgba(11,11,14,0) 40%)`,
        ].join(', '),
        color: '#FFFFFF',
      }}
    >
      {/* Sized to fit the centre 630x630 square, which is all a square thumbnail crop keeps. */}
      <div
        style={{
          display: 'flex',
          fontFamily: 'Archivo',
          fontSize: Math.min(132, Math.floor(540 / (story.section.length * 0.8))),
          letterSpacing: 6,
          color: story.accent,
          textTransform: 'uppercase',
          opacity: 0.9,
        }}
      >
        {story.section}
      </div>
      <div style={{ display: 'flex', width: 120, height: 6, backgroundColor: GOLD, margin: '28px 0 36px' }} />
      <Wordmark mark={mark} size={30} />
    </div>
  );
}

export async function GET(_req: Request, { params }: Props) {
  const req = parseCoverFile((await params).file);
  if (!req) return new Response('Not found', { status: 404 });
  const story = await storyFor(req.slug);
  if (!story) return new Response('Not found', { status: 404 });

  const [archivo, newsreader, outfit, markPng] = await loadAssets();
  const mark = `data:image/png;base64,${markPng.toString('base64')}`;

  return new ImageResponse(
    req.variant === 'art' ? <ArtCard story={story} mark={mark} slug={req.slug} /> : <SocialCard story={story} mark={mark} slug={req.slug} />,
    {
      width: COVER_WIDTH,
      height: COVER_HEIGHT,
      fonts: [
        { name: 'Archivo', data: archivo, weight: 800, style: 'normal' },
        { name: 'Newsreader', data: newsreader, weight: 600, style: 'normal' },
        { name: 'Outfit', data: outfit, weight: 600, style: 'normal' },
      ],
      headers: { 'cache-control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800' },
    },
  );
}
