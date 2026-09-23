import { handle, requireEditor } from '@/lib/api';
import { jobCounts, listJobs } from '@/lib/editorial';

export const dynamic = 'force-dynamic';

/** GET /api/jobs?status=DEAD_LETTER&stage=article.scrape */
export async function GET(request: Request) {
  return handle(async () => {
    requireEditor(request);
    const q = new URL(request.url).searchParams;
    const [jobs, counts] = await Promise.all([listJobs(q.get('status') ?? 'DEAD_LETTER', q.get('stage') ?? undefined), jobCounts()]);
    return { jobs, counts };
  });
}
