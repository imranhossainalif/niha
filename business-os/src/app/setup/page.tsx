import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { signIn } from '@/auth';
import { Brand } from '@/components/Brand';

export const dynamic = 'force-dynamic';

/** First run only: create the owner account. Disappears once any user exists. */
export default async function Setup({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  if ((await prisma.user.count()) > 0) redirect('/login');
  async function create(fd: FormData) {
    'use server';
    const email = String(fd.get('email') || '').trim().toLowerCase();
    const password = String(fd.get('password') || '');
    if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 10) redirect('/setup?error=1');
    const allowed = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    if (allowed && allowed !== email) redirect('/setup?error=2');
    await prisma.$transaction(async (tx) => {
      if ((await tx.user.count()) > 0) throw new Error('Owner already exists');
      await tx.user.create({ data: { email, passwordHash: await bcrypt.hash(password, 12), role: 'owner', name: String(fd.get('name') || '') || null } });
    });
    await signIn('credentials', { email, password, redirectTo: '/' });
  }
  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <form action={create} className="card grid gap-3">
        <div className="flex justify-center py-2"><Brand height={52} /></div>
        <h1 className="text-center text-lg font-semibold">Prothom setup</h1>
        <p className="muted text-sm">Owner account banan. {process.env.ADMIN_EMAIL ? 'Email hobe ' + process.env.ADMIN_EMAIL + '.' : ''}</p>
        {sp.error === '1' && <p className="text-sm text-red-600">Thik email ar kompokkhe 10 okkhorer password din.</p>}
        {sp.error === '2' && <p className="text-sm text-red-600">Ei email diye owner banano jabe na (ADMIN_EMAIL dekhun).</p>}
        <label className="grid gap-1 text-sm">Naam<input className="input" name="name" /></label>
        <label className="grid gap-1 text-sm">Email<input className="input" name="email" type="email" defaultValue={process.env.ADMIN_EMAIL || ''} required /></label>
        <label className="grid gap-1 text-sm">Password (10+)<input className="input" name="password" type="password" minLength={10} required /></label>
        <button className="btn btn-primary justify-center" type="submit">Owner banan</button>
      </form>
    </main>
  );
}
