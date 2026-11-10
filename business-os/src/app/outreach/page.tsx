import Link from 'next/link';
import { redirect } from 'next/navigation';
import { sessionPrincipal } from '@/lib/session';
import { canReadDoc } from '@/lib/access';
import { OUTREACH_BIZ } from '@/lib/outreach/core';
import { OutreachApp } from '@/components/outreach/OutreachApp';

export const dynamic = 'force-dynamic';

export default async function Outreach({ searchParams }: { searchParams: Promise<{ embed?: string }> }) {
  const embed = (await searchParams).embed === '1';
  const p = await sessionPrincipal();
  if (!p) redirect('/login?next=/outreach');
  if (!canReadDoc(p, 'outreach_prospects', OUTREACH_BIZ)) redirect('/');
  return (
    <main className={embed ? 'grid gap-3 p-0' : 'mx-auto grid max-w-7xl gap-3 p-4'} style={embed ? { background: 'transparent' } : undefined}>
      {!embed && <header className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-2xl font-semibold">Outreach</h1><nav className="flex gap-2"><a className="btn" href="/app#outreach">Dashboard</a><Link className="btn" href="/settings">Settings</Link></nav></header>}
      <OutreachApp embed={embed} />
    </main>
  );
}
