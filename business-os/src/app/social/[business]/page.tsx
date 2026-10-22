import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { sessionPrincipal } from '@/lib/session';
import { canReadDoc, isFull } from '@/lib/access';
import { BIZ_IDS, bizName } from '@/lib/business';
import { SocialApp } from '@/components/social/SocialApp';

export const dynamic = 'force-dynamic';

export default async function Social({ params, searchParams }: { params: Promise<{ business: string }>; searchParams: Promise<{ embed?: string }> }) {
  const { business } = await params;
  const embed = (await searchParams).embed === '1';
  const p = await sessionPrincipal();
  if (!p) redirect('/login?next=/social/' + business);
  if (!BIZ_IDS.includes(business)) notFound();
  if (!canReadDoc(p, 'social_posts', business)) redirect('/');
  return (
    <main className={embed ? 'grid gap-3 p-0' : 'mx-auto grid max-w-7xl gap-3 p-4'} style={embed ? { background: 'transparent' } : undefined}>
      {!embed && (
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">{bizName(business)} · Social Media</h1>
          <nav className="flex gap-2"><a className="btn" href={'/app#biz:' + business + '/social'}>Dashboard</a><Link className="btn" href="/settings">Settings</Link></nav>
        </header>
      )}
      <SocialApp business={business} canAdmin={isFull(p)} embed={embed} />
    </main>
  );
}
