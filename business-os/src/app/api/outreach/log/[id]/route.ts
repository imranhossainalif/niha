import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';
import { loadSettings, needOutreach, undoActivity } from '@/lib/outreach/server';

/** Undo a logged action (a mis-click): deletes the row and rebuilds the prospect's counters. */
export const DELETE = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const p = await needPrincipal(req, 'write');
  needOutreach(p, true);
  return json({ prospect: await undoActivity(p, id, await loadSettings(p)) });
});
