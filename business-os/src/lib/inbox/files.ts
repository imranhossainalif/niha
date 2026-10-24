// Files the team uploads for the inbox AI (price lists, product catalogues, policies): PDF, TXT, MD, CSV.
// A PDF is read by Claude (works for scans, tables and Bangla, which plain text extraction does not), the text is kept in
// `inbox_web` (kind "file") and found per question like website pages. The original is kept in MEDIA_DIR/kb (never served).
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import { db } from '../db';
import { prisma } from '../prisma';
import { anthropic, MODEL } from '../anthropic';
import { recordUsage } from '../aiUsage';
import { MEDIA_DIR } from '../social/media';
import { invalidateWebIndex } from './web';
import { BUSINESS } from './store';

const DIR = path.join(MEDIA_DIR, 'kb');
export const FILE_LIMIT = { pdf: 20 * 1024 * 1024, text: 2 * 1024 * 1024 };
export const MAX_TEXT = 400_000;
const kindOf = (name: string): 'pdf' | 'text' | null => (/\.pdf$/i.test(name) ? 'pdf' : /\.(txt|md|csv)$/i.test(name) ? 'text' : null);
export const fileDocId = (id: string) => 'file_' + id;

export type FileDoc = { business: string; kind: 'file'; title: string; url: string; site: 'file'; ext: 'pdf' | 'text'; size: number; status: 'processing' | 'ready' | 'error'; text: string; chars?: number; truncated?: boolean; error?: string; uploaded: string; by?: string };

/** Save the upload and a placeholder row; the job `inbox_file` does the reading. */
export async function saveUpload(file: File, by: string) {
  const ext = kindOf(file.name);
  if (!ext) throw Object.assign(new Error('Ei file chole na: PDF, TXT, MD ba CSV din (Excel hole "Save as CSV" ba PDF kore din)'), { status: 400, code: 'bad_request' });
  if (file.size > FILE_LIMIT[ext]) throw Object.assign(new Error(ext === 'pdf' ? 'PDF 20 MB er beshi — bhaag kore upload korun' : 'File 2 MB er beshi'), { status: 400, code: 'bad_request' });
  const id = randomBytes(8).toString('hex');
  await mkdir(DIR, { recursive: true });
  await writeFile(path.join(DIR, id + (ext === 'pdf' ? '.pdf' : '.txt')), Buffer.from(await file.arrayBuffer()));
  const doc: FileDoc = { business: BUSINESS, kind: 'file', title: file.name.slice(0, 160), url: 'file:' + file.name.slice(0, 160), site: 'file', ext, size: file.size, status: 'processing', text: '', uploaded: new Date().toISOString(), by };
  await db().collection('inbox_web').doc(fileDocId(id)).set(doc);
  const job = await prisma.job.create({ data: { kind: 'inbox_file', params: { id }, createdBy: by } });
  return { id, job: job.id };
}

const PDF_PROMPT = `Ei PDF ta Kids Care BD (homemade baby food, Bangladesh) er. Customer support AI ei lekha theke uttor dibe, tai puro lekha hubohu likhe dao.
- Shob product er naam, size/variation, dam, upadan, boyosh, banano niyom, offer, delivery, policy — jemon ache temon rakho. Kono kichu bad dibe na, shongkhep korbe na, nijer theke kichu jog korbe na.
- Table hole protita sari ekta line e: "Product | Variation/size | Dam | onnano tottho".
- Bangla lekha Bangla okkhore-i rakho; shongkha jemon ache temon.
- Pata alada korte "---" line dao. Chobi/logo er bornona dorkar nai; chobir bhitor lekha thakle likho.
- Kono ongsho porishkar na hole "(porishkar na)" likho.`;

async function pdfText(buf: Buffer, title: string): Promise<{ text: string; truncated: boolean }> {
  const client = await anthropic();
  const model = await MODEL();
  const stream = client.messages.stream({
    model, max_tokens: 32000,
    messages: [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') }, title }, { type: 'text', text: PDF_PROMPT }] }],
  } as Anthropic.MessageStreamParams);
  const msg = await stream.finalMessage();
  void recordUsage(String(msg.model), msg.usage).catch(() => {});
  const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('\n');
  return { text, truncated: msg.stop_reason === 'max_tokens' };
}

/** Job body: read one uploaded file into text. Safe to run again (the worker re-queues it after a restart). */
export async function processFile(id: string) {
  const ref = db().collection('inbox_web').doc(fileDocId(id));
  const cur = await ref.get();
  if (!cur) return { skipped: 'file nai' };
  const doc = cur.data as FileDoc;
  try {
    const buf = await readFile(path.join(DIR, id + (doc.ext === 'pdf' ? '.pdf' : '.txt')));
    const r = doc.ext === 'pdf' ? await pdfText(buf, doc.title) : { text: buf.toString('utf8').replace(/\r/g, ''), truncated: false };
    const text = r.text.trim();
    if (text.length < 20) throw new Error('File theke kono lekha pawa jayni');
    await ref.set({ ...doc, status: 'ready', text: text.slice(0, MAX_TEXT), chars: Math.min(text.length, MAX_TEXT), truncated: r.truncated || text.length > MAX_TEXT, error: undefined });
    invalidateWebIndex();
    return { id, chars: text.length, truncated: r.truncated };
  } catch (e) {
    await ref.set({ ...doc, status: 'error', error: String((e as Error).message || e).slice(0, 400) });
    throw e;
  }
}

export async function removeFile(id: string) {
  await db().collection('inbox_web').doc(fileDocId(id)).delete();
  for (const ext of ['.pdf', '.txt']) await rm(path.join(DIR, id + ext), { force: true });
  invalidateWebIndex();
}
export async function listFiles() {
  return (await db().collection('inbox_web').where('kind', '==', 'file').limit(500).get())
    .map((s) => { const d = s.data as FileDoc; return { id: s.id.replace(/^file_/, ''), title: d.title, ext: d.ext, size: d.size, status: d.status, chars: d.chars, truncated: d.truncated, error: d.error, uploaded: d.uploaded }; })
    .sort((a, b) => b.uploaded.localeCompare(a.uploaded));
}
