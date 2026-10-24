// Makes an AI reply easy to read in Messenger: short paragraphs with a blank line between them, one list item per line,
// no markdown. The model is told to do this, and this guarantees it (a wall of text is hard to read on a phone).
const BULLET = /^\s*(?:[•\-–*]|[০-৯0-9]+[।.)])\s*/;

const BN_DIGIT = '০১২৩৪৫৬৭৮৯';
/** ৳280 / ৳1,200 -> ৳২৮০ / ৳১,২০০: prices always in Bangla digits (phone numbers and links are left alone). */
export const banglaPrices = (t: string) => t.replace(/৳\s?(\d[\d,]*(?:\.\d+)?)/g, (_, n: string) => '৳' + n.replace(/\d/g, (d) => BN_DIGIT[Number(d)]));

export function formatReply(input: string): string {
  let t = banglaPrices(String(input ?? '')).replace(/\r/g, '').replace(/\*\*|__|`/g, '').replace(/^#{1,6}\s*/gm, '').trim();
  if (!t) return '';
  let lines = t.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim());
  // one long block: split it into sentences, two per paragraph
  if (lines.filter(Boolean).length === 1 && lines[0].length > 120) {
    const sentences = lines[0].split(/(?<=[।?!])\s+/).filter(Boolean);
    if (sentences.length > 2) { lines = []; for (let i = 0; i < sentences.length; i += 2) lines.push(sentences.slice(i, i + 2).join(' '), ''); }
  }
  const out: string[] = [];
  const kind = (l: string) => (!l ? 'blank' : BULLET.test(l) ? 'item' : 'text');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]; const k = kind(l); const prev = out.length ? kind(out[out.length - 1]) : 'blank';
    // a blank line between a paragraph and a list, between a list and a paragraph, and between two paragraphs
    if (k !== 'blank' && prev !== 'blank' && !(k === 'item' && prev === 'item')) out.push('');
    if (k === 'blank' && prev === 'blank') continue;
    out.push(l);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export const FALLBACK_DEFAULT = 'আপু, একটু অপেক্ষা করুন 🙏\n\nআমাদের টিম মেম্বার খুব শীঘ্রই আপনার মেসেজের উত্তর দেবেন।';
