import 'server-only';
import { prisma } from './prisma';

/**
 * Site-wide switches editors flip from /admin/settings. Stored in site_settings;
 * a missing row (or an unreachable database) means the default.
 *
 * Read on the hot path of every page, so the value is cached in process for a
 * short while. Pages are ISR-cached anyway: changing a setting revalidates them.
 */

/**
 * story_images:
 * - covers:    our own cover cards (lib/covers). No publisher photos, logos or rights questions.
 * - publisher: the publisher's lead image, hotlinked with credit, as before the covers.
 */
export const STORY_IMAGE_MODES = ['covers', 'publisher'] as const;
export type StoryImageMode = (typeof STORY_IMAGE_MODES)[number];
export const DEFAULT_STORY_IMAGE_MODE: StoryImageMode = 'covers';

const KEY = 'story_images';
const TTL_MS = 30_000;
let cached: { mode: StoryImageMode; expires: number } | null = null;

export function isStoryImageMode(v: unknown): v is StoryImageMode {
  return typeof v === 'string' && (STORY_IMAGE_MODES as readonly string[]).includes(v);
}

/** Loads the setting (cached). Call before the synchronous mappers read currentStoryImageMode(). */
export async function loadStoryImageMode(): Promise<StoryImageMode> {
  if (cached && cached.expires > Date.now()) return cached.mode;
  // The image is built without a database; prerendered shells use the default.
  if (process.env.NEXT_PHASE === 'phase-production-build') return DEFAULT_STORY_IMAGE_MODE;
  let mode = DEFAULT_STORY_IMAGE_MODE;
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: KEY } });
    if (isStoryImageMode(row?.value)) mode = row.value;
  } catch {
    // Keep the default rather than failing the page.
  }
  cached = { mode, expires: Date.now() + TTL_MS };
  return mode;
}

/** The last loaded value, for synchronous mappers. Defaults until loadStoryImageMode() has run. */
export function currentStoryImageMode(): StoryImageMode {
  return cached?.mode ?? DEFAULT_STORY_IMAGE_MODE;
}

export async function setStoryImageMode(mode: StoryImageMode, editor: string): Promise<void> {
  await prisma.siteSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: mode, updatedBy: editor },
    update: { value: mode, updatedBy: editor },
  });
  cached = { mode, expires: Date.now() + TTL_MS };
}

export async function storyImageSetting(): Promise<{ mode: StoryImageMode; updatedBy: string | null; updatedAt: Date | null }> {
  const row = await prisma.siteSetting.findUnique({ where: { key: KEY } });
  return {
    mode: isStoryImageMode(row?.value) ? row.value : DEFAULT_STORY_IMAGE_MODE,
    updatedBy: row?.updatedBy ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}
