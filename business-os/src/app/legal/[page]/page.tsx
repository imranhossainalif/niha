import { notFound } from 'next/navigation';

// Public Terms / Privacy pages (TikTok and Google ask for them when an app is registered).
const PAGES: Record<string, { title: string; body: string[] }> = {
  privacy: { title: 'Privacy Policy — Kids Care BD Business OS', body: [
    'Business OS is the internal tool Kids Care BD uses to manage its own social media accounts (Facebook, Instagram, YouTube, TikTok).',
    'When an account owner connects an account, we store the access token encrypted on our own server, and use it only to publish posts the team writes, and to read the account\'s own post statistics (views, likes, comments, shares, followers).',
    'We do not sell, share or use this data for advertising, and we do not collect data about other users. Statistics are kept only as totals per post.',
    'Disconnecting an account in Business OS deletes its token. To ask for deletion of any stored data, message the Kids Care BD Facebook page.',
  ] },
  terms: { title: 'Terms of Service — Kids Care BD Business OS', body: [
    'Business OS is a private tool for the Kids Care BD team. Only invited team members can sign in.',
    'Content is published only to accounts that their owner connected, and only when a team member schedules or publishes it.',
    'Use follows each platform\'s own terms (Meta, Google/YouTube, TikTok). Access can be removed at any time by disconnecting the account here or in the platform\'s settings.',
  ] },
};

export default async function Legal({ params }: { params: Promise<{ page: string }> }) {
  const p = PAGES[(await params).page];
  if (!p) notFound();
  return (
    <main className="mx-auto grid max-w-2xl gap-4 p-6">
      <h1 className="text-2xl font-semibold">{p.title}</h1>
      {p.body.map((t, i) => <p key={i}>{t}</p>)}
      <p className="muted text-sm">Last updated: October 2026</p>
    </main>
  );
}
