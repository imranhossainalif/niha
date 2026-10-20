// Server-side "website → knowledge": fetch a public page and pull out readable text for review.
import dns from 'node:dns/promises';
import net from 'node:net';

const MAX_BYTES = 3_000_000;

function privateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const x = ip.toLowerCase();
  if (x.startsWith('::ffff:')) return privateIp(x.slice(7));
  return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80');
}

/** Only public http(s) hosts: blocks the server being used to reach its own network. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw Object.assign(new Error('Link thik nai'), { status: 400, code: 'bad_request' }); }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) throw Object.assign(new Error('Shudhu http/https link'), { status: 400, code: 'bad_request' });
  const addrs = net.isIP(u.hostname) ? [{ address: u.hostname }] : await dns.lookup(u.hostname, { all: true }).catch(() => []);
  if (!addrs.length || addrs.some((a) => privateIp(a.address))) throw Object.assign(new Error('Ei link e jawa jabe na'), { status: 400, code: 'bad_request' });
  return u;
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', copy: '©', reg: '®', bull: '•' };
export const decodeEntities = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
  return ENT[e.toLowerCase()] ?? m;
});

/** Readable text from HTML: drops scripts/styles/nav/footer, keeps headings, paragraphs, list items and table cells as lines. */
export function htmlToText(html: string): { title: string; text: string } {
  const title = decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim());
  let h = html.replace(/<!--[\s\S]*?-->/g, ' ');
  h = h.replace(/<(script|style|noscript|svg|template|iframe|nav|footer|header|form)\b[\s\S]*?<\/\1>/gi, ' ');
  const main = h.match(/<(main|article)\b[\s\S]*?<\/\1>/i)?.[0];
  if (main && main.length > 500) h = main;
  h = h.replace(/<(br|hr)\b[^>]*>/gi, '\n').replace(/<\/(p|div|section|h[1-6]|li|tr|table|ul|ol|blockquote|pre)>/gi, '\n').replace(/<(td|th)\b[^>]*>/gi, ' | ').replace(/<li\b[^>]*>/gi, '\n- ');
  h = h.replace(/<[^>]+>/g, ' ');
  const lines = decodeEntities(h).split('\n').map((l) => l.replace(/[ \t ]+/g, ' ').trim()).filter((l) => l && l !== '|' && l !== '-');
  const dedup: string[] = [];
  for (const l of lines) if (dedup[dedup.length - 1] !== l) dedup.push(l);
  return { title, text: dedup.join('\n').slice(0, 20000) };
}

export async function fetchReadable(raw: string): Promise<{ url: string; title: string; text: string }> {
  let u = await assertPublicUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'BusinessOS/1.0 (+knowledge import)', accept: 'text/html,text/plain;q=0.9,*/*;q=0.1' } });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { u = await assertPublicUrl(new URL(r.headers.get('location')!, u).toString()); continue; }
    if (!r.ok) throw Object.assign(new Error('Page khola jayni (' + r.status + ')'), { status: 502, code: 'fetch_failed' });
    const type = r.headers.get('content-type') || '';
    if (!/text\/html|text\/plain|xhtml/.test(type)) throw Object.assign(new Error('Ei link e lekha nai (' + type.split(';')[0] + ')'), { status: 415, code: 'unsupported' });
    const buf = await r.arrayBuffer();
    const body = new TextDecoder().decode(buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf);
    const out = type.includes('text/plain') ? { title: u.hostname, text: body.slice(0, 20000) } : htmlToText(body);
    return { url: u.toString(), ...out };
  }
  throw Object.assign(new Error('Onek redirect'), { status: 502, code: 'fetch_failed' });
}
