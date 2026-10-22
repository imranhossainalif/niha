// Social media jobs: publish posts that are due (every minute), pull posts + metrics + followers from Facebook and
// Instagram (every 3 hours), and the AI plan (best time, format, content type, ideas, competitor notes; daily).
// Collections: social_accounts, social_posts, social_insights, social_daily, social_competitors, social_settings, social_ai.
import type Anthropic from '@anthropic-ai/sdk';
import { db, type Data } from '../db';
import { SYSTEM, type Principal } from '../access';
import { bdToday } from '../time';
import { analyze, type Insight } from '../social/analytics';
import { mediaFile } from '../social/media';
import { getAccess } from '../social/oauth';
import { channel, publishYouTube, youtubePosts, type YtOptions } from '../social/youtube';
import { profile, publishTikTok, tiktokPosts, type TtOptions } from '../social/tiktok';
import { facebookPosts, followers, igAudience, igCompetitor, instagramPosts, publishFacebook, publishInstagram, socialToken, type Fetch, type Network } from '../social/meta';
import { runAgent, type Tool } from '../ai/agent';
import { anthropic, MODEL } from '../anthropic';
import { recordUsage } from '../aiUsage';

export type Target = { account_id: string; network: Network; name?: string; text?: string; status?: 'pending' | 'published' | 'failed'; ext_post_id?: string; permalink?: string; error?: string; note?: string; at?: string };
export type PostOptions = { yt_title?: string; yt_privacy?: YtOptions['privacy']; yt_kids?: boolean; tt_mode?: TtOptions['mode']; tt_privacy?: TtOptions['privacy'] };
export type SocialPost = {
  business: string; status: 'draft' | 'scheduled' | 'publishing' | 'published' | 'partial' | 'failed';
  text: string; media: { id: string; url: string; mime: string }[]; link?: string; labels?: string[]; content_type?: string;
  targets: Target[]; scheduled_at?: string | null; published_at?: string; created_by?: string; error?: string; options?: PostOptions;
};
export type SocialAccount = { business: string; network: Network; ext_id: string; page_id: string; name: string; username?: string; picture?: string; followers?: number; active?: boolean; uploads?: string; error?: string };

const accounts = async (business?: string) =>
  (await db().collection('social_accounts').limit(200).get()).map((s) => ({ id: s.id, ...(s.data as SocialAccount) })).filter((a) => a.active !== false && (!business || a.business === business));

/** Publish one post to every target that isn't published yet. Safe to call again after a partial failure. */
export async function publishPost(id: string, p: Principal = SYSTEM, f?: Fetch) {
  const ref = db(p).collection('social_posts').doc(id);
  const snap = await ref.get();
  if (!snap) throw Object.assign(new Error('Post nai'), { status: 404, code: 'not_found' });
  const post = snap.data as SocialPost;
  if (post.status === 'publishing') throw Object.assign(new Error('Post ta ekhon publish hocche'), { status: 409, code: 'conflict' });
  // claim it (a second worker/click loses the version race)
  await ref.set({ ...post, status: 'publishing' }, { expectedVersion: snap.version });
  const all = await accounts(post.business);
  const user = all.some((a) => a.network === 'facebook' || a.network === 'instagram') && post.targets.some((t) => t.network === 'facebook' || t.network === 'instagram') ? await socialToken() : '';
  const accts = new Map(all.map((a) => [a.id, a]));
  const targets: Target[] = [];
  for (const t of post.targets) {
    if (t.status === 'published') { targets.push(t); continue; }
    const a = accts.get(t.account_id);
    try {
      if (!a) throw new Error('Account ta ar connect nai');
      const input = { text: t.text ?? post.text, media: post.media.map((m) => ({ url: m.url, mime: m.mime })), link: post.link };
      const r: { ext_post_id: string; permalink?: string; note?: string } = a.network === 'facebook' ? await publishFacebook(a.ext_id, input, user, f)
        : a.network === 'instagram' ? await publishInstagram(a.ext_id, a.page_id, input, user, f)
        : await publishVideo(a.network, a.id, post, input.text, f);
      targets.push({ ...t, status: 'published', ext_post_id: r.ext_post_id, permalink: r.permalink, note: r.note, error: undefined, at: new Date().toISOString() });
    } catch (e) {
      targets.push({ ...t, status: 'failed', error: String((e as Error).message || e).slice(0, 400), at: new Date().toISOString() });
    }
  }
  const okN = targets.filter((t) => t.status === 'published').length;
  const status: SocialPost['status'] = okN === targets.length ? 'published' : okN ? 'partial' : 'failed';
  const cur = (await ref.get())!;
  await ref.set({ ...(cur.data as SocialPost), targets, status, published_at: okN ? new Date().toISOString() : (cur.data as SocialPost).published_at, error: status === 'published' ? undefined : targets.filter((t) => t.error).map((t) => (t.name || t.network) + ': ' + t.error).join(' | ') } as unknown as Data);
  return { status, targets };
}

/** YouTube / TikTok take one video file from our media store. */
async function publishVideo(net: Network, accountId: string, post: SocialPost, text: string, f?: Fetch) {
  const vids = post.media.filter((m) => m.mime.startsWith('video/'));
  if (vids.length !== 1 || post.media.length !== 1) throw new Error((net === 'youtube' ? 'YouTube' : 'TikTok') + ' e ekta video lagbe (chobi na)');
  const file = await mediaFile(vids[0].id);
  if (!file) throw new Error('Video file ta server e pawa jacche na — abar upload korun');
  const token = await getAccess(net as 'youtube' | 'tiktok', accountId, f);
  const o = post.options ?? {};
  return net === 'youtube'
    ? publishYouTube(file, text, { title: o.yt_title, privacy: o.yt_privacy, kids: o.yt_kids }, token, f)
    : publishTikTok(file, text, { mode: o.tt_mode, privacy: o.tt_privacy }, token, f);
}

/** Worker, every minute: publish scheduled posts whose time has come. */
export async function publishDue(f?: Fetch) {
  const now = new Date().toISOString();
  const due = (await db().collection('social_posts').where('status', '==', 'scheduled').limit(500).get())
    .filter((s) => (s.data as SocialPost).scheduled_at && (s.data as SocialPost).scheduled_at! <= now);
  const out: { id: string; status: string }[] = [];
  for (const s of due) {
    try { out.push({ id: s.id, status: (await publishPost(s.id, SYSTEM, f)).status }); } catch (e) { out.push({ id: s.id, status: 'error: ' + (e as Error).message }); }
  }
  return { due: due.length, results: out };
}

/** Pull posts (last `days`), metrics, followers, IG audience and competitors for every connected account. */
export async function socialSync(opts: { days?: number; f?: Fetch } = {}) {
  const list = await accounts();
  if (!list.length) return { skipped: 'kono social account connect kora nai' };
  const user = list.some((a) => a.network === 'facebook' || a.network === 'instagram') ? await socialToken() : '';
  const since = new Date(Date.now() - (opts.days ?? 90) * 864e5).toISOString();
  const ins = db().collection('social_insights');
  const today = bdToday();
  const res: Record<string, unknown> = {};
  for (const a of list) {
    try {
      let posts, n: number | null;
      if (a.network === 'youtube' || a.network === 'tiktok') {
        const token = await getAccess(a.network, a.id, opts.f);
        if (a.network === 'youtube') { const c = await channel(token, opts.f); n = c.followers; posts = c.uploads ? await youtubePosts(a.ext_id, c.uploads, since, token, opts.f) : []; }
        else { n = (await profile(token, opts.f)).followers; posts = await tiktokPosts(a.ext_id, since, token, opts.f); }
      } else {
        posts = a.network === 'facebook' ? await facebookPosts(a.ext_id, since, user, opts.f) : await instagramPosts(a.ext_id, a.page_id, since, user, opts.f);
        n = await followers(a.network, a.ext_id, a.page_id, user, opts.f);
      }
      for (const p of posts) {
        const ref = ins.doc(p.network + '_' + p.ext_id);
        const cur = (await ref.get())?.data ?? {};
        await ref.set({ ...cur, ...p, business: a.business, account_doc: a.id, synced: new Date().toISOString() });
      }
      if (n != null) {
        await db().collection('social_daily').doc(a.id + '_' + today).set({ business: a.business, account_doc: a.id, network: a.network, date: today, followers: n });
        await db().collection('social_accounts').doc(a.id).update({ followers: n });
      }
      if (a.network === 'instagram') await db().collection('social_audience').doc(a.id).set({ business: a.business, account_doc: a.id, ...(await igAudience(a.ext_id, a.page_id, user, opts.f)), asof: new Date().toISOString() });
      if (a.error) await db().collection('social_accounts').doc(a.id).update({ error: '' });
      res[a.id] = { posts: posts.length, followers: n };
    } catch (e) {
      res[a.id] = { error: (e as Error).message };
      await db().collection('social_accounts').doc(a.id).update({ error: String((e as Error).message).slice(0, 300) }).catch(() => null);
    }
  }
  // competitors' public Instagram posts (Business Discovery), per business
  const sets = await db().collection('social_settings').limit(50).get();
  for (const s of sets) {
    const st = s.data as { business?: string; ig_competitors?: string[] };
    const biz = st.business || s.id;
    const ig = (await accounts(biz)).find((x) => x.network === 'instagram');
    for (const u of (st.ig_competitors ?? []).slice(0, 20)) {
      if (!ig) { res['competitor ' + u] = { error: 'Instagram account connect kora nai' }; continue; }
      try {
        const c = await igCompetitor(ig.ext_id, ig.page_id, u, user, opts.f);
        await db().collection('social_competitors').doc(biz + '_' + c.username).set({ business: biz, ...c, asof: new Date().toISOString() });
        res['competitor ' + u] = { posts: c.posts.length };
      } catch (e) { res['competitor ' + u] = { error: (e as Error).message }; }
    }
  }
  return res;
}


export const CONTENT_TYPES = ['product', 'offer', 'recipe_tips', 'education', 'testimonial', 'behind_scenes', 'festival', 'question_engagement', 'baby_moment', 'announcement', 'other'] as const;

/** Tag posts that have no content type yet (cheap model, captions only). */
async function tagContentTypes(business: string) {
  const rows = (await db().collection('social_insights').where('business', '==', business).limit(2000).get()).filter((s) => !(s.data as Insight).content_type && (s.data as Insight).text);
  for (let i = 0; i < rows.length; i += 40) {
    const chunk = rows.slice(i, i + 40);
    const client = await anthropic(); const model = await MODEL();
    const res = await client.messages.create({
      model, max_tokens: 4000,
      system: 'Classify social media posts of Kids Care BD (homemade baby food, Bangladesh) by content type. Use only: ' + CONTENT_TYPES.join(', ') + '.',
      messages: [{ role: 'user', content: chunk.map((s, k) => k + ': ' + String((s.data as Insight).text).slice(0, 300).replace(/\s+/g, ' ')).join('\n') }],
      output_config: { format: { type: 'json_schema', schema: { type: 'object', additionalProperties: false, required: ['tags'], properties: { tags: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['i', 'type'], properties: { i: { type: 'integer' }, type: { type: 'string', enum: [...CONTENT_TYPES] } } } } } } } },
    } as unknown as Anthropic.MessageCreateParamsNonStreaming);
    void recordUsage(String(res.model), res.usage).catch(() => {});
    const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
    let tags: { i: number; type: string }[] = [];
    try { tags = JSON.parse(text).tags ?? []; } catch { /* skip chunk */ }
    for (const t of tags) { const s = chunk[t.i]; if (s) await db().collection('social_insights').doc(s.id).update({ content_type: t.type }); }
  }
  return rows.length;
}

/** Daily AI plan: what works (FACT from our numbers), competitors, web research → ideas and best times (social_ai/<business>). */
export async function socialIdeas(business = 'kidscare') {
  const tagged = await tagContentTypes(business).catch(() => 0);
  const rows = (await db().collection('social_insights').where('business', '==', business).limit(3000).get()).map((s) => s.data as Insight);
  const A = analyze(rows);
  const comps = (await db().collection('social_competitors').where('business', '==', business).limit(50).get()).map((s) => s.data as any);
  const st = ((await db().collection('social_settings').doc(business).get())?.data ?? {}) as { fb_competitors?: string[]; groups?: string[]; notes?: string };
  const today = bdToday();
  const brief = {
    our_numbers: { posts: A.totals.posts, by_hour_bd: A.byHour.map((x) => [x.key, x.posts, Math.round(x.avg_eng)]), by_weekday: A.byWeekday.map((x) => [x.key, x.posts, Math.round(x.avg_eng)]),
      by_format: A.byFormat.map((x) => [x.key, x.posts, Math.round(x.avg_eng), x.rate && Math.round(x.rate * 10) / 10]), by_type: A.byType.map((x) => [x.key, x.posts, Math.round(x.avg_eng)]),
      top: A.top.slice(0, 8).map((p) => ({ net: p.network, when: p.created, format: p.format, type: p.content_type, eng: p.eng, reach: p.metrics.reach, text: String(p.text || '').slice(0, 160) })),
      weak: A.weak.map((p) => ({ net: p.network, format: p.format, type: p.content_type, eng: p.eng, text: String(p.text || '').slice(0, 120) })) },
    instagram_competitors: comps.map((c) => ({ username: c.username, followers: c.followers, posts: (c.posts ?? []).slice(0, 12).map((p: any) => ({ when: p.created, format: p.format, likes: p.likes, comments: p.comments, text: String(p.text || '').slice(0, 140) })) })),
    facebook_competitors: st.fb_competitors ?? [], groups_we_know: st.groups ?? [], owner_notes: st.notes ?? '',
  };
  let saved = false;
  const save: Tool = {
    def: {
      name: 'save_social_plan',
      description: 'Save the social media plan shown in Kids Care → Social Media → Suggestions.',
      input_schema: { type: 'object', required: ['summary', 'best_times', 'ideas'], properties: {
        summary: { type: 'string', description: '3-6 bullets in Banglish, each starting FACT: or HYPOTHESIS:' },
        best_times: { type: 'array', items: { type: 'object', required: ['day', 'time', 'why'], properties: { network: { type: 'string' }, day: { type: 'string' }, time: { type: 'string', description: 'BD time, e.g. 20:00-22:00' }, why: { type: 'string' }, label: { type: 'string', enum: ['FACT', 'HYPOTHESIS'] } } } },
        formats: { type: 'array', items: { type: 'object', required: ['format', 'verdict'], properties: { format: { type: 'string' }, verdict: { type: 'string', enum: ['beshi koro', 'chalao', 'kom koro', 'test koro'] }, why: { type: 'string' }, label: { type: 'string', enum: ['FACT', 'HYPOTHESIS'] } } } },
        content_mix: { type: 'array', items: { type: 'object', required: ['type', 'share'], properties: { type: { type: 'string' }, share: { type: 'string', description: 'e.g. 30%' }, why: { type: 'string' } } } },
        ideas: { type: 'array', items: { type: 'object', required: ['title', 'format', 'caption'], properties: { title: { type: 'string' }, format: { type: 'string' }, network: { type: 'string' }, when: { type: 'string', description: 'suggested day + BD time' }, hook: { type: 'string' }, caption: { type: 'string', description: 'ready caption, Bangla/Banglish, no health claims' }, hashtags: { type: 'string' }, why: { type: 'string' }, label: { type: 'string', enum: ['FACT', 'HYPOTHESIS'] } } } },
        competitors: { type: 'array', items: { type: 'object', required: ['name', 'note'], properties: { name: { type: 'string' }, note: { type: 'string' }, link: { type: 'string' } } } },
        groups: { type: 'array', items: { type: 'object', required: ['name', 'why'], properties: { name: { type: 'string' }, link: { type: 'string' }, why: { type: 'string' }, how: { type: 'string', description: 'what to post there (manual: Meta does not allow posting to groups by API)' } } } },
        avoid: { type: 'array', items: { type: 'string' } },
      } },
    },
    run: async (inp) => {
      await db().collection('social_ai').doc(business).set({ business, date: today, created_at: new Date().toISOString(), posts_analyzed: A.totals.posts, tagged, ...inp });
      saved = true;
      return { saved: business };
    },
  };
  await runAgent({
    complex: true,
    system: 'You are the social media strategist for Kids Care BD (homemade baby food, Bangladesh; Facebook + Instagram). Write in Banglish.\n'
      + 'Rules: mark every point FACT (from the numbers given or a source you saw, with link) or HYPOTHESIS. Never invent numbers. Baby food: never health, cure, immunity or weight-gain claims; never invent prices or offers; no lottery/draw offers (needs Ministry of Commerce permission). '
      + 'Times are Bangladesh time. If our post count is small (<20), say the numbers are early and lean on research, labelled HYPOTHESIS. Meta does not allow posting to Facebook groups by API: groups are manual suggestions.',
    messages: [{ role: 'user', content: 'Today ' + today + '. Data (JSON):\n' + JSON.stringify(brief).slice(0, 60000)
      + '\n\nUse web search to look at what Bangladeshi baby food / mom & baby Facebook pages and groups (including the competitors listed) post now and what gets engagement, plus upcoming BD dates/festivals in the next 3 weeks. '
      + 'Then call save_social_plan once with: best posting times, format verdicts, content mix, 8-12 ready post ideas with captions, competitor notes, 5-10 relevant Facebook groups/pages to share in (manual), and what to avoid.' }],
    tools: [save],
    serverTools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 12 } as unknown as Anthropic.ToolUnion],
  });
  if (!saved) throw new Error('The model did not save a plan');
  return { business, posts: A.totals.posts, tagged };
}
