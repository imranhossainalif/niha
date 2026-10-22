'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { sessionPrincipal } from '@/lib/session';
import { CONFIG_FIELDS, saveConfig } from '@/lib/config';
import { checkAll } from '@/lib/health';

/** Save integration keys (owner only). Faka = keep, "-" = delete. Used by Admin and Settings. */
export async function saveKeysAction(fd: FormData) {
  const p = await sessionPrincipal();
  const back = String(fd.get('back') || '/admin') === '/settings' ? '/settings' : '/admin';
  if (!p || p.kind !== 'user' || p.role !== 'owner') redirect(back + '?msg=owner_only');
  const vals: Record<string, string> = {};
  for (const f of CONFIG_FIELDS) {
    const v = String(fd.get(f.key) ?? '').trim();
    if (v === '-') vals[f.key] = '';
    else if (v) vals[f.key] = f.key === 'GOOGLE_SERVICE_ACCOUNT_JSON' || !f.secret ? v : v.replace(/\s+/g, '');
  }
  await saveConfig(vals, p.email);
  if (back === '/settings') await checkAll().catch(() => null); // show the effect of a new key at once
  revalidatePath(back);
  redirect(back + '?msg=saved');
}

/** Run every connection check now (owner/admin). */
export async function recheckAction() {
  const p = await sessionPrincipal();
  if (!p || p.kind !== 'user' || p.role === 'staff') redirect('/');
  await checkAll();
  revalidatePath('/settings');
}
