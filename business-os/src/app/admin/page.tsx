import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { sessionPrincipal } from '@/lib/session';
import { createApiKey } from '@/lib/apikeys';
import { BIZ, BIZ_IDS } from '@/lib/business';
import { getConfig, saveConfig } from '@/lib/inbox/store';
import { configStatus, saveConfig as saveIntegrations, CONFIG_FIELDS } from '@/lib/config';
import type { Role } from '@/lib/access';

export const dynamic = 'force-dynamic';

async function requireAdmin(ownerOnly = false) {
  const p = await sessionPrincipal();
  if (!p || p.kind !== 'user') redirect('/login?next=/admin');
  if (ownerOnly ? p.role !== 'owner' : p.role === 'staff') redirect('/');
  return p;
}

export default async function Admin({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const me = await requireAdmin();
  const sp = await searchParams;
  // a just-created key is passed in a 60-second cookie (never in the URL, so it can't end up in logs)
  const newKeyShown = me.role === 'owner' ? (await cookies()).get('bos_newkey')?.value : undefined;
  const [users, keys, jobs, inbox] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: 'asc' } }),
    me.role === 'owner' ? prisma.apiKey.findMany({ where: { revokedAt: null }, include: { user: true }, orderBy: { createdAt: 'desc' } }) : Promise.resolve([]),
    prisma.job.findMany({ orderBy: { createdAt: 'desc' }, take: 15 }),
    getConfig(),
  ]);
  const integrations = await configStatus();

  async function saveUser(fd: FormData) {
    'use server';
    const p = await requireAdmin();
    const email = String(fd.get('email') || '').trim().toLowerCase();
    const role = String(fd.get('role') || 'staff') as Role;
    const password = String(fd.get('password') || '');
    const businesses = BIZ_IDS.filter((b) => fd.get('biz_' + b));
    if (!/^\S+@\S+\.\S+$/.test(email) || !['owner', 'admin', 'staff'].includes(role)) redirect('/admin?msg=bad');
    if (role !== 'staff' && p.role !== 'owner') redirect('/admin?msg=owner_only');
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing && existing.role !== 'staff' && p.role !== 'owner') redirect('/admin?msg=owner_only');
    if (existing?.role === 'owner' && role !== 'owner' && (await prisma.user.count({ where: { role: 'owner', active: true } })) <= 1) redirect('/admin?msg=last_owner');
    if (!existing && password.length < 10) redirect('/admin?msg=pw');
    const data = { role, businesses, ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}) };
    if (existing) await prisma.user.update({ where: { email }, data: { ...data, active: fd.get('active') !== 'off' } });
    else await prisma.user.create({ data: { email, passwordHash: data.passwordHash!, role, businesses, name: String(fd.get('name') || '') || null } });
    revalidatePath('/admin');
    redirect('/admin?msg=saved');
  }

  async function newKey(fd: FormData) {
    'use server';
    const p = await requireAdmin(true);
    const scopes = (fd.get('write') ? ['read', 'write'] : ['read']) as ('read' | 'write')[];
    const { key } = await createApiKey(p.kind === 'user' ? p.userId : '', String(fd.get('name') || 'key').slice(0, 60), scopes);
    (await cookies()).set('bos_newkey', key, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/admin', maxAge: 60 });
    redirect('/admin');
  }

  async function revokeKey(fd: FormData) {
    'use server';
    await requireAdmin(true);
    await prisma.apiKey.update({ where: { id: String(fd.get('id')) }, data: { revokedAt: new Date() } });
    revalidatePath('/admin');
  }

  async function saveKeys(fd: FormData) {
    'use server';
    const p = await requireAdmin(true);
    const vals: Record<string, string> = {};
    for (const f of CONFIG_FIELDS) {
      const v = String(fd.get(f.key) ?? '').trim();
      if (v === '-') vals[f.key] = '';
      else if (v) vals[f.key] = f.key === 'GOOGLE_SERVICE_ACCOUNT_JSON' || !f.secret ? v : v.replace(/\s+/g, '');
    }
    await saveIntegrations(vals, p.kind === 'user' ? p.email : 'admin');
    revalidatePath('/admin');
    redirect('/admin?msg=saved');
  }

  async function toggleAi() {
    'use server';
    await requireAdmin();
    const cfg = await getConfig();
    await saveConfig({ ai_on: !cfg.ai_on });
    revalidatePath('/admin');
  }

  async function queueJob(fd: FormData) {
    'use server';
    const p = await requireAdmin();
    const kind = String(fd.get('kind'));
    if (!['nuport_sync', 'sheets_sync', 'inbox_import', 'backup'].includes(kind)) redirect('/admin?msg=bad');
    await prisma.job.create({ data: { kind, params: kind === 'inbox_import' ? { days: 30 } : {}, createdBy: p.kind === 'user' ? p.email : 'admin' } });
    revalidatePath('/admin');
  }

  const MSG: Record<string, string> = { saved: 'Save hoyeche.', bad: 'Thik moto din.', owner_only: 'Shudhu owner admin/owner banate pare.', pw: 'Notun user er password 10+ okkhor.', last_owner: 'Shesh owner er role bodlano jabe na.' };

  return (
    <main className="mx-auto grid max-w-5xl gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <nav className="flex gap-2"><Link className="btn" href="/">Home</Link><a className="btn" href="/app">Dashboard</a></nav>
      </header>
      {sp.msg && <p className="card text-sm">{MSG[sp.msg] ?? sp.msg}</p>}
      {newKeyShown && (
        <div className="card grid gap-1 text-sm">
          <b>Notun API key — ekhoni copy korun, ar dekhano hobe na:</b>
          <code className="break-all">{newKeyShown}</code>
          <span className="muted">Use: <code>Authorization: Bearer &lt;key&gt;</code> · spec: <a className="link" href="/api/v1/openapi.json">/api/v1/openapi.json</a></span>
        </div>
      )}

      <section className="card grid gap-3">
        <h2 className="font-semibold">Users</h2>
        <div className="overflow-x-auto">
          <table className="t">
            <thead><tr><th>Email</th><th>Role</th><th>Business</th><th>Active</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}><td>{u.email}</td><td>{u.role}</td><td>{u.role === 'staff' ? u.businesses.join(', ') || '—' : 'shob'}</td><td>{u.active ? 'ha' : 'na'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action={saveUser} className="grid gap-2 sm:grid-cols-2">
          <input className="input" name="email" type="email" placeholder="email (notun ba ager)" required />
          <input className="input" name="password" type="password" placeholder="password (notun hole 10+; faka = bodlabe na)" />
          <input className="input" name="name" placeholder="naam (notun user)" />
          <select className="input" name="role" defaultValue="staff">
            <option value="staff">staff — shudhu nijer business</option>
            <option value="admin">admin — shob</option>
            <option value="owner">owner — shob + API key</option>
          </select>
          <fieldset className="flex flex-wrap gap-3 text-sm sm:col-span-2">
            <legend className="muted text-xs">Staff kon business dekhbe</legend>
            {BIZ.map((b) => (<label key={b.id} className="flex items-center gap-1"><input type="checkbox" name={'biz_' + b.id} />{b.name}</label>))}
          </fieldset>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" value="off" /> Bondho kore din (deactivate)</label>
          <div><button className="btn btn-primary" type="submit">Save user</button></div>
        </form>
      </section>

      <section className="card grid gap-2">
        <h2 className="font-semibold">InboxPilot</h2>
        <form action={toggleAi} className="flex flex-wrap items-center gap-3 text-sm">
          <span>AI auto-reply: <b>{inbox.ai_on ? 'ON' : 'OFF'}</b></span>
          <button className="btn" type="submit">{inbox.ai_on ? 'Bondho korun' : 'Chalu korun'}</button>
          <span className="muted">Webhook URL: <code>{(process.env.PUBLIC_URL || '') + '/api/meta/webhook'}</code></span>
        </form>
      </section>

      <section className="card grid gap-3">
        <h2 className="font-semibold">Integrations</h2>
        <p className="muted text-sm">Key ekhane save korle server e encrypted thake, 30 second er moddhe chalu hoy, restart lage na. Faka rakhle ager value thake; muchte chaile <code>-</code> likhun. Server .env e thaka value shob shomoy agradhikar pay.</p>
        {me.role === 'owner' ? (
          <form action={saveKeys} className="grid gap-4">
            {[...new Set(integrations.map((f) => f.group))].map((g) => (
              <fieldset key={g} className="grid gap-2 sm:grid-cols-2">
                <legend className="mb-1 font-semibold">{g}</legend>
                {integrations.filter((f) => f.group === g).map((f) => (
                  <label key={f.key} className="grid gap-1 text-sm">
                    <span>{f.label} <span className="muted text-xs">{f.source === 'env' ? '· .env theke' : f.source === 'admin' ? '· saved ' + f.display : '· nai'}</span></span>
                    {f.key === 'GOOGLE_SERVICE_ACCOUNT_JSON'
                      ? <textarea className="input" name={f.key} rows={2} placeholder={f.source ? '(saved; notun dile bodlabe)' : f.help} disabled={f.source === 'env'} />
                      : <input className="input" name={f.key} type={f.secret ? 'password' : 'text'} autoComplete="off" placeholder={f.source && f.secret ? '(saved; notun dile bodlabe)' : f.source ? String(f.display) : f.help} disabled={f.source === 'env'} />}
                  </label>
                ))}
              </fieldset>
            ))}
            <div><button className="btn btn-primary" type="submit">Save integrations</button></div>
          </form>
        ) : (
          <table className="t"><tbody>{integrations.map((f) => (<tr key={f.key}><td>{f.label}</td><td>{f.source ? '✓' : '— nai'}</td></tr>))}</tbody></table>
        )}
      </section>

      <section className="card grid gap-2">
        <h2 className="font-semibold">Background jobs</h2>
        <form action={queueJob} className="flex flex-wrap gap-2">
          {[['nuport_sync', 'Nuport sync ekhon'], ['sheets_sync', 'Sheets sync ekhon'], ['inbox_import', 'Messenger import (30 din)'], ['backup', 'Backup ekhon']].map(([k, l]) => (
            <button key={k} className="btn" name="kind" value={k} type="submit">{l}</button>
          ))}
        </form>
        <table className="t">
          <thead><tr><th>Kaj</th><th>Status</th><th>Kobe</th><th>Result</th></tr></thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id}><td>{j.kind}</td><td>{j.status}</td><td>{j.createdAt.toISOString().slice(0, 16).replace('T', ' ')}</td><td className="text-xs">{j.error ?? (j.result ? JSON.stringify(j.result).slice(0, 160) : '')}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      {me.role === 'owner' && (
        <section className="card grid gap-2">
          <h2 className="font-semibold">API keys (Claude / automation)</h2>
          <p className="muted text-sm">Key oi owner er hoye kaj kore. Read = shudhu dekha, write = likha o.</p>
          <table className="t">
            <thead><tr><th>Naam</th><th>Prefix</th><th>Scope</th><th>Shesh use</th><th /></tr></thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td>{k.name}</td><td><code>{k.prefix}…</code></td><td>{k.scopes.join(', ')}</td><td>{k.lastUsedAt?.toISOString().slice(0, 16).replace('T', ' ') ?? '—'}</td>
                  <td><form action={revokeKey}><input type="hidden" name="id" value={k.id} /><button className="btn" type="submit">Revoke</button></form></td>
                </tr>
              ))}
            </tbody>
          </table>
          <form action={newKey} className="flex flex-wrap items-center gap-2">
            <input className="input max-w-xs" name="name" placeholder="key er naam (jemon: weekly growth task)" required />
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="write" /> write</label>
            <button className="btn btn-primary" type="submit">Notun key</button>
          </form>
        </section>
      )}
    </main>
  );
}
