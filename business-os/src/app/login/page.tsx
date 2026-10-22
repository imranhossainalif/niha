import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';
import { signIn } from '@/auth';
import { prisma } from '@/lib/prisma';
import { Brand } from '@/components/Brand';

export const dynamic = 'force-dynamic';

const safeNext = (n: unknown) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') ? n : '/');

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  if ((await prisma.user.count()) === 0) redirect('/setup');
  async function login(fd: FormData) {
    'use server';
    const next = safeNext(fd.get('next'));
    try {
      await signIn('credentials', { email: fd.get('email'), password: fd.get('password'), redirectTo: next });
    } catch (e) {
      if (e instanceof AuthError) redirect('/login?error=1&next=' + encodeURIComponent(next));
      throw e;
    }
  }
  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <form action={login} className="card grid gap-3">
        <div className="flex justify-center py-2"><Brand height={52} /></div>
        <h1 className="text-center text-lg font-semibold">Login</h1>
        {sp.error && <p className="text-sm text-red-600">Email ba password mileni.</p>}
        <input type="hidden" name="next" value={safeNext(sp.next)} />
        <label className="grid gap-1 text-sm">Email<input className="input" name="email" type="email" autoComplete="username" required /></label>
        <label className="grid gap-1 text-sm">Password<input className="input" name="password" type="password" autoComplete="current-password" required /></label>
        <button className="btn btn-primary justify-center" type="submit">Login</button>
      </form>
    </main>
  );
}
