import { TerminalError } from '../errors';

export const ARTICLE_STATUSES = ['GENERATED', 'VALIDATED', 'DRAFT', 'NEEDS_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED', 'ARCHIVED'] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

/**
 * Allowed article transitions:
 *   GENERATED -> VALIDATED -> DRAFT -> APPROVED -> PUBLISHED
 * with NEEDS_REVIEW / REJECTED / ARCHIVED side states. A published article that gets a
 * new version goes back to DRAFT/NEEDS_REVIEW for that version while the published
 * version stays live (Article.publishedVersionId is untouched until the next publish).
 */
const TRANSITIONS: Record<ArticleStatus, ArticleStatus[]> = {
  GENERATED: ['VALIDATED', 'NEEDS_REVIEW', 'REJECTED'],
  VALIDATED: ['DRAFT', 'NEEDS_REVIEW'],
  DRAFT: ['APPROVED', 'NEEDS_REVIEW', 'REJECTED', 'GENERATED', 'ARCHIVED'],
  NEEDS_REVIEW: ['DRAFT', 'APPROVED', 'REJECTED', 'GENERATED', 'ARCHIVED'],
  APPROVED: ['PUBLISHED', 'DRAFT', 'NEEDS_REVIEW', 'REJECTED'],
  PUBLISHED: ['GENERATED', 'DRAFT', 'NEEDS_REVIEW', 'ARCHIVED', 'PUBLISHED'],
  REJECTED: ['DRAFT', 'ARCHIVED', 'GENERATED'],
  ARCHIVED: ['DRAFT'],
};

export function canTransition(from: ArticleStatus, to: ArticleStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: string, to: ArticleStatus): void {
  if (!canTransition(from as ArticleStatus, to)) {
    throw new TerminalError(`Illegal article transition ${from} -> ${to}`, 'illegal_transition', { from, to });
  }
}

export interface PublishGateInput {
  status: string;
  mode: 'manual' | 'auto';
  autoPublishEnabled: boolean;
  source: { trustStatus: string; publishingMode: 'MANUAL' | 'AUTO'; minConfidence: number; paywall?: string };
  validation: {
    schemaValid: boolean;
    dedupDecision: string;
    confidence: number;
    translationRequired: boolean;
    translationValid: boolean;
    safetyPassed: boolean;
    errors: number;
  };
  citations: number;
  seo: { seoTitle?: string | null; metaDescription?: string | null; slug?: string | null };
}

export interface GateResult {
  allowed: boolean;
  reasons: string[];
}

/**
 * Hard publishing gates. Attribution and SEO are required for every publication,
 * manual or automatic. Auto-publish additionally requires every quality gate and an
 * explicit opt-in both globally (AUTO_PUBLISH_ENABLED) and per source.
 */
export function evaluatePublishGates(i: PublishGateInput): GateResult {
  const reasons: string[] = [];
  if (i.citations < 1) reasons.push('missing_source_attribution');
  if (!i.seo.seoTitle || !i.seo.metaDescription || !i.seo.slug) reasons.push('missing_seo_fields');
  if (i.source.trustStatus !== 'APPROVED') reasons.push('source_not_approved');

  if (i.mode === 'manual') {
    if (i.status !== 'APPROVED' && i.status !== 'PUBLISHED') reasons.push(`not_approved (status=${i.status})`);
    return { allowed: reasons.length === 0, reasons };
  }

  if (!i.autoPublishEnabled) reasons.push('auto_publish_disabled');
  if (i.source.publishingMode !== 'AUTO') reasons.push('source_policy_manual');
  if (i.source.paywall === 'hard') reasons.push('hard_paywall_source');
  if (!['DRAFT', 'APPROVED'].includes(i.status)) reasons.push(`status_not_publishable (status=${i.status})`);
  if (!i.validation.schemaValid) reasons.push('schema_invalid');
  if (!['UNIQUE', 'SAME_STORY'].includes(i.validation.dedupDecision)) reasons.push(`dedup_${i.validation.dedupDecision.toLowerCase()}`);
  if (i.validation.confidence < i.source.minConfidence) reasons.push('confidence_below_threshold');
  if (i.validation.translationRequired && !i.validation.translationValid) reasons.push('translation_not_validated');
  if (!i.validation.safetyPassed) reasons.push('safety_failed');
  if (i.validation.errors > 0) reasons.push('validation_errors');
  return { allowed: reasons.length === 0, reasons };
}
