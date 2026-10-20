import { z } from 'zod';
import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';
import { fetchReadable } from '@/lib/web/extract';

/** Fetch a page and return its readable text. Nothing is saved: the user reviews it and saves a KB entry. */
export const POST = handle(async (req: Request) => {
  await needPrincipal(req, 'write');
  const { url } = z.object({ url: z.string().min(4).max(2000) }).parse(await req.json());
  return json(await fetchReadable(url.includes('://') ? url : 'https://' + url));
});
