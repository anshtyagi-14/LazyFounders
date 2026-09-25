import { permanentRedirect } from 'next/navigation';

// A bare redirect. Nothing to rebuild per request.

/**
 * /news is linked from the category navigation but has never had a page of its own.
 * The home page IS the news index, so send the (small) link equity there with a 308
 * rather than leaving a soft 404 in the crawl.
 */
export default function NewsIndex(): never {
  permanentRedirect('/');
}
