/**
 * Lightweight helpers for the Next.js dashboard
 * (import from "@lazyfounders/ingestion-core/editorial"). Nothing here touches the
 * database, the network or heavy parsing libraries.
 */
export { ARTICLE_STATUSES, assertTransition, canTransition, evaluatePublishGates } from './state-machine';
export type { ArticleStatus, GateResult, PublishGateInput } from './state-machine';
export { renderSources, slugify, versionContentHash } from './render';
export type { Citation, InternalLink } from './render';
export { cleanAuthor } from '../content/author';
export { scrubForeignContacts, findForeignEmails, stripAuthorBio, OWN_EMAIL_DOMAINS } from '../content/contacts';
export { STAGES, bullJobId, queueName } from '../jobs/stages';
export type { Stage } from '../jobs/stages';
