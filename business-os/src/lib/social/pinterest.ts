// Pinterest API v5: account profile, boards, image pins (create + read back with analytics).
// Pinterest facts this follows: an access token lasts 30 days and the refresh token a year (refresh is
// handled in oauth.ts); publishing needs the pins:write scope, and until the app gets Standard access
// (Pinterest's review) it stays in Trial — pins then go to a private sandbox board only. Video pins
// need a separate async media upload, so this phase is image pins only.
import type { Media, PostStat, PublishInput, PublishResult } from './meta';

const API = 'https://api.pinterest.com/v5';
type F = typeof fetch;

async function pin(path: string, token: string, opts: { method?: 'GET' | 'POST'; body?: unknown; f?: F } = {}) {
  const r = await (opts.f ?? fetch)(API + path, { method: opts.method ?? 'GET', headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: opts.body === undefined ? undefined : JSON.stringify(opts.body), signal: AbortSignal.timeout(60000) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Pinterest: ' + (j.message || j.error || r.status));
  return j;
}

export type PinBoard = { id: string; name: string };

/** The connected account: Pinterest has no numeric user id in v5 — the username is the identity. */
export async function pinProfile(token: string, f?: F) {
  const j = await pin('/user_account', token, { f });
  if (!j.username) throw new Error('Pinterest account pawa jayni');
  return { id: String(j.username) as string, name: String(j.about || j.username) as string, username: String(j.username) as string, picture: (j.profile_image as string | undefined) || undefined, followers: Number(j.follower_count) || 0 };
}

/** All boards of the account (follows the bookmark cursor). */
export async function pinBoards(token: string, f?: F, cap = 250): Promise<PinBoard[]> {
  const out: PinBoard[] = [];
  let bookmark = '';
  do {
    const j = await pin('/boards?page_size=100' + (bookmark ? '&bookmark=' + encodeURIComponent(bookmark) : ''), token, { f });
    for (const b of j.items ?? []) out.push({ id: String(b.id), name: String(b.name || '') });
    bookmark = out.length < cap ? String(j.bookmark || '') : '';
  } while (bookmark);
  return out.slice(0, cap);
}

export type PinOptions = { board_id?: string };
/**
 * Create one image pin. Title: first line of the text (max 100); description: the whole text (max 800).
 * Board: the given board, else the account's saved board, else its first board.
 */
export async function publishPinterest(account: { board_id?: string; boards?: PinBoard[] }, input: PublishInput, o: PinOptions, token: string, f?: F): Promise<PublishResult & { note?: string }> {
  const img = (input.media as Media[]).find((m) => m.mime.startsWith('image/'));
  if (!img) throw new Error('Pinterest e chobi lagbe (video pin ekhono supported na)');
  const board_id = o.board_id || account.board_id || account.boards?.[0]?.id || (await pinBoards(token, f))[0]?.id;
  if (!board_id) throw new Error('Pinterest e kono board nai — age Pinterest app e ekta board banan');
  const text = (input.text || '').trim();
  const j = await pin('/pins', token, { method: 'POST', f, body: {
    board_id,
    title: (text.split('\n').find((l) => l.trim()) || 'Pin').trim().slice(0, 100),
    description: text.slice(0, 800),
    ...(input.link ? { link: input.link } : {}),
    media_source: { source_type: 'image_url', url: img.url },
  } });
  if (!j.id) throw new Error('Pinterest pin toiri hoyni');
  return { ext_post_id: String(j.id), permalink: 'https://www.pinterest.com/pin/' + j.id + '/' };
}

/** The account's pins (newest first, across its boards) with analytics where Pinterest gives them. */
export async function pinterestPosts(accountId: string, boards: PinBoard[], sinceIso: string, token: string, f?: F, cap = 100): Promise<PostStat[]> {
  const out: PostStat[] = [];
  for (const b of boards) {
    let bookmark = '';
    do {
      const j = await pin('/boards/' + b.id + '/pins?page_size=100' + (bookmark ? '&bookmark=' + encodeURIComponent(bookmark) : ''), token, { f });
      for (const p of j.items ?? []) {
        const created = String(p.created_at || '');
        if (created && created < sinceIso) continue;
        out.push({ network: 'pinterest', account_id: accountId, ext_id: String(p.id), created, text: String(p.title ? p.title + '\n' : '') + String(p.description || ''), permalink: 'https://www.pinterest.com/pin/' + p.id + '/',
          thumb: p.media?.images?.['400x300']?.url || p.media?.images?.['150x150']?.url, format: 'photo', metrics: { reactions: 0, comments: 0, shares: 0 } });
      }
      bookmark = out.length < cap ? String(j.bookmark || '') : '';
    } while (bookmark);
    if (out.length >= cap) break;
  }
  // analytics per pin (impressions / saves / clicks); Trial access may refuse — then the zeros stay
  for (let i = 0; i < out.length; i += 10) {
    await Promise.all(out.slice(i, i + 10).map(async (p) => {
      try {
        const j = await pin('/pins/' + p.ext_id + '/analytics?start_date=' + new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10) + '&end_date=' + new Date().toISOString().slice(0, 10) + '&metric_types=IMPRESSION,SAVE,PIN_CLICK', token, { f });
        const s = j.all?.summary ?? {};
        p.metrics = { views: Number(s.impressions) || 0, reach: Number(s.impressions) || 0, saves: Number(s.saves) || 0, clicks: Number(s.pin_clicks) || 0, reactions: 0, comments: 0, shares: 0 };
      } catch { /* no analytics for this pin */ }
    }));
  }
  return out.slice(0, cap);
}
