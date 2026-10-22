import { saveKeysAction } from '@/app/settings/actions';
import type { configStatus } from '@/lib/config';

type Field = Awaited<ReturnType<typeof configStatus>>[number];

/** Key form for every integration (owner edits; admin sees which are set). */
export function IntegrationsForm({ integrations, isOwner, back, only }: { integrations: Field[]; isOwner: boolean; back: '/admin' | '/settings'; only?: string[] }) {
  const list = only ? integrations.filter((f) => only.includes(f.key)) : integrations;
  if (!isOwner) return <table className="t"><tbody>{list.map((f) => (<tr key={f.key}><td>{f.label}</td><td>{f.source ? '✓' : '— nai'}</td></tr>))}</tbody></table>;
  return (
    <form action={saveKeysAction} className="grid gap-4">
      <input type="hidden" name="back" value={back} />
      {[...new Set(list.map((f) => f.group))].map((g) => (
        <fieldset key={g} className="grid gap-2 sm:grid-cols-2">
          <legend className="mb-1 font-semibold">{g}</legend>
          {list.filter((f) => f.group === g).map((f) => (
            <label key={f.key} className="grid gap-1 text-sm">
              <span>{f.label} <span className="muted text-xs">{f.source === 'env' ? '· .env theke' : f.source === 'admin' ? '· saved ' + f.display : '· nai'}</span></span>
              {f.key === 'GOOGLE_SERVICE_ACCOUNT_JSON'
                ? <textarea className="input" name={f.key} rows={2} placeholder={f.source ? '(saved; notun dile bodlabe)' : f.help} disabled={f.source === 'env'} />
                : <input className="input" name={f.key} type={f.secret ? 'password' : 'text'} autoComplete="off" placeholder={f.source && f.secret ? '(saved; notun dile bodlabe)' : f.source ? String(f.display) : f.help} disabled={f.source === 'env'} />}
            </label>
          ))}
        </fieldset>
      ))}
      <div><button className="btn btn-primary" type="submit">Save</button></div>
    </form>
  );
}
