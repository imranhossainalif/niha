import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';
import { publishPost } from '@/lib/jobs/social';

export const maxDuration = 300;

/** Publish now (also retries the targets that failed). */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const p = await needPrincipal(req, 'write');
  return json(await publishPost((await params).id, p));
});
