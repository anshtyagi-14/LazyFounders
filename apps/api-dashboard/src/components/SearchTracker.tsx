'use client';

import { useEffect } from 'react';
import { track } from '@/lib/analytics';

/** GA4 `search` for every results view, plus `search_no_results` when nothing matched. */
export function SearchTracker({ query, resultCount }: { query: string; resultCount: number }) {
  useEffect(() => {
    if (!query) return;
    const params = { search_term: query.slice(0, 100), result_count: resultCount };
    track('search', params);
    if (resultCount === 0) track('search_no_results', params);
  }, [query, resultCount]);
  return null;
}
