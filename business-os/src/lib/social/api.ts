// Shared bits for the /api/social routes.
import { z } from 'zod';
import { BIZ_IDS } from '../business';
import { canWriteDoc, type Principal } from '../access';

export function needBiz(p: Principal, business: string, write = false) {
  if (!BIZ_IDS.includes(business)) throw Object.assign(new Error('Unknown business'), { status: 404, code: 'not_found' });
  if (write && !canWriteDoc(p, 'social_posts', business)) throw Object.assign(new Error('Ei business e likhar permission nai'), { status: 403, code: 'permission_denied' });
}
export const who = (p: Principal) => (p.kind === 'user' ? p.email : 'system');

/** Body for creating/editing a post. */
export const PostBody = z.object({
  text: z.string().max(63000).default(''),
  media: z.array(z.object({ id: z.string(), url: z.string().url(), mime: z.string() })).max(10).default([]),
  link: z.string().url().optional().or(z.literal('')),
  labels: z.array(z.string().max(40)).max(10).default([]),
  content_type: z.string().max(40).optional(),
  targets: z.array(z.object({ account_id: z.string(), network: z.enum(['facebook', 'instagram', 'youtube', 'tiktok']), name: z.string().optional(), text: z.string().max(63000).optional() })).min(1, 'Kon page/account e jabe seta bachai korun'),
  scheduled_at: z.string().datetime().nullable().optional(),
  options: z.object({ yt_title: z.string().max(100).optional(), yt_privacy: z.enum(['public', 'unlisted', 'private']).optional(), yt_kids: z.boolean().optional(), tt_mode: z.enum(['direct', 'inbox']).optional(), tt_privacy: z.enum(['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY']).optional() }).default({}),
  action: z.enum(['draft', 'schedule', 'now']),
});
